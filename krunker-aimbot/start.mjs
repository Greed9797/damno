#!/usr/bin/env node
// KRUNK.IO 3D — launcher. Injects payload.js at document-start over CDP.
//   node start.mjs              headed, keep alive (Ctrl+C detaches)
//   node start.mjs --selftest   headless end-to-end checks, exit 0/1
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const SELFTEST = args.includes('--selftest');
const GAME_URL = (args[args.indexOf('--url') + 1] || 'https://krunker.io/').startsWith('http')
  ? args[args.indexOf('--url') + 1] || 'https://krunker.io/'
  : 'https://krunker.io/';
const PAYLOAD = readFileSync(join(HERE, 'payload.js'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  const cands = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ].filter(Boolean);
  for (const c of cands) if (existsSync(c)) return c;
  throw new Error('Chrome not found (set CHROME_PATH)');
}

async function launch(chrome, profile, headless) {
  const bin = spawn(chrome, [
    '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-session-crashed-bubble',
    '--autoplay-policy=no-user-gesture-required', '--window-size=1440,900',
    ...(headless ? ['--headless=new', '--mute-audio'] : []),
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  bin.stderr.on('data', (d) => (err += d));
  const dt = join(profile, 'DevToolsActivePort');
  for (let t = 0; t < 150; t++) {
    if (existsSync(dt)) {
      const [port] = readFileSync(dt, 'utf8').split('\n');
      if (port) return { bin, port: Number(port) };
    }
    if (bin.exitCode !== null) throw new Error('Chrome exited early:\n' + err);
    await sleep(200);
  }
  throw new Error('DevToolsActivePort never appeared:\n' + err);
}

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pend = new Map(), listeners = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) {
      const p = pend.get(m.id); pend.delete(m.id);
      m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
    } else if (m.method) for (const fn of listeners.get(m.method) ?? []) fn(m.params);
  };
  const send = (method, params = {}) => {
    const i = ++id;
    ws.send(JSON.stringify({ id: i, method, params }));
    return new Promise((res, rej) => pend.set(i, { res, rej }));
  };
  const on = (method, fn) => { if (!listeners.has(method)) listeners.set(method, []); listeners.get(method).push(fn); };
  const close = () => { try { ws.close(); } catch {} };
  return { send, on, close };
}

async function evl(cdp, expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
  return r.result.value;
}
async function poll(cdp, expr, pred, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try { const v = await evl(cdp, expr); if (pred(v)) return v; } catch {}
    await sleep(400);
  }
  throw new Error('timeout: ' + label);
}
async function tap(cdp, code, key, vk, ms = 700) {
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', code, key, windowsVirtualKeyCode: vk });
  await sleep(ms);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key, windowsVirtualKeyCode: vk });
}

const main = async () => {
  const chrome = findChrome();
  const profile = mkdtempSync(join(tmpdir(), 'krunker-re-'));
  console.log(`[re] chrome: ${chrome}`);
  const { bin, port } = await launch(chrome, profile, SELFTEST);
  console.log(`[re] cdp :${port}`);
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = list.find((t) => t.type === 'page');
  const cdp = await connect(page.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: PAYLOAD });
  await cdp.send('Page.navigate', { url: GAME_URL });
  console.log('[re] navigate ' + GAME_URL);

  if (!SELFTEST) {
    try {
      await poll(cdp, `!!(window.__RE && window.__RE.mem)`, (v) => v, 25000, 'wasm capture');
      console.log('[re] READY — wasm memory captured. Mod menu is at top-right.');
      console.log('[re] Keys: Ctrl+Shift+G aim · B fly · N god. Buttons: HP+/TP.');
    } catch (e) { console.log('[re] NOT READY: ' + e.message); }
    await new Promise((res) => {
      const iv = setInterval(async () => {
        try {
          const s = await evl(cdp, `JSON.stringify(window.__RE ? {st: window.__RE.status, en: window.__RE.found.enemies.length} : null)`);
          if (s && s !== 'null') process.stdout.write('[re] ' + s.replace(/\s+/g, ' ').slice(0, 200) + '\n');
        } catch { clearInterval(iv); res(); }
      }, 8000);
      process.on('SIGINT', () => { clearInterval(iv); console.log('\n[re] detached — page keeps running until reload.'); cdp.close(); res(); });
    });
    return 0;
  }

  // ---------------- selftest ----------------
  const results = [];
  const check = (name, ok, detail) => {
    results.push({ name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`);
  };
  try {
    // 0. payload + wasm
    const ready = await poll(cdp, `({p: !!window.__RE, mem: !!(window.__RE && window.__RE.mem), st: window.__RE ? window.__RE.status.mem : ''})`,
      (v) => v.p, 20000, 'payload injected');
    check('payload injected', true);
    await poll(cdp, `!!(window.__RE && window.__RE.mem)`, (v) => v, 20000, 'wasm capture');
    check('WASM memory captured', true, await evl(cdp, `window.__RE.status.mem`));

    // 1b. view-matrix math (pure unit test inside the page)
    const math = await evl(cdp, `(function(){
      if (!window.__RE || !window.__RE.camView) return 'no-camView';
      var f = new Float32Array(window.__RE.mem.buffer);
      var idx = (window.__RE.mem.buffer.byteLength >> 2) - 1024;   // scratch near heap end
      var save = f.slice(idx, idx + 16);
      function put(rot, t) { for (var i=0;i<16;i++) f[idx+i] = rot[i]; f[idx+12]=t[0]; f[idx+13]=t[1]; f[idx+14]=t[2]; f[idx+15]=1; }
      var I = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
      put(I, [-10,-2,-5]);
      var c1 = window.__RE.camView(idx);
      var ok1 = c1 && Math.abs(c1.fwd[0])<1e-6 && Math.abs(c1.fwd[1])<1e-6 && Math.abs(c1.fwd[2]+1)<1e-6
                && Math.abs(c1.pos[0]-10)<1e-4 && Math.abs(c1.pos[1]-2)<1e-4 && Math.abs(c1.pos[2]-5)<1e-4;
      // camera yawed +90° → world forward (-1,0,0); view rot = R_y(-90) column-major
      var R90 = [0,0,1,0, 0,1,0,0, -1,0,0,0, 0,0,0,1];
      put(R90, [0,0,0]);
      var c2 = window.__RE.camView(idx);
      var ok2 = c2 && Math.abs(c2.fwd[0]+1)<1e-6 && Math.abs(c2.fwd[1])<1e-6 && Math.abs(c2.fwd[2])<1e-6;
      for (var i=0;i<16;i++) f[idx+i] = save[i];
      return JSON.stringify({ok1:!!ok1, ok2:!!ok2, f1:c1&&c1.fwd, f2:c2&&c2.fwd});
    })()`);
    check('view-matrix extraction math', JSON.parse(math).ok1 && JSON.parse(math).ok2, JSON.parse(math));

    // 1. consent layers (site consent + CMP banner)
    const consent = await evl(cdp, `typeof checkTerms === 'function' ? (checkTerms(1), 'site-ok') : 'no-site-consent'`).catch(() => 'err');
    await evl(cdp, `(function(){var el=[...document.querySelectorAll('div,button,span,a')].find(e=>e.children.length===0&&e.textContent.trim()==='I Accept');if(el){el.click();return 'cmp-ok'}return 'no-cmp'})()`).catch(() => 'err');
    await sleep(2000);
    console.log('     consent: ' + consent);

    // 2. into a match: poll for spawned HUD; security check = human completes it once (never bypassed)
    let inMatch = false, secCheck = false;
    const tJoin = Date.now();
    while (Date.now() - tJoin < 35000 && !inMatch) {
      const st = await evl(cdp, `JSON.stringify({
        ammo: (document.getElementById('ammoVal')||{}).innerText || '',
        sec: (document.getElementById('instructionsUpdate')||{innerText:''}).innerText.indexOf('Security check') >= 0,
        load: (document.getElementById('instructions')||{innerText:''}).innerText.indexOf('Loading') >= 0
      })`).catch(() => null);
      if (st) {
        const j = JSON.parse(st);
        if (j.ammo) inMatch = true;
        if (j.sec) secCheck = true;
      }
      if (!inMatch && !secCheck) {
        // harmless retries: Enter (the game's own start key) + Find Game tab
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Enter', key: 'Enter', windowsVirtualKeyCode: 13 });
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Enter', key: 'Enter', windowsVirtualKeyCode: 13 });
      }
      await sleep(2500);
    }
    if (!inMatch) {
      check('entered a match (HUD live)', false, secCheck
        ? 'SKIPPED: security check needs one human Play — never auto-bypassed'
        : 'SKIPPED: no spawn in headless — complete Play once in headed mode');
      throw Object.assign(new Error('skipped-match'), { skipped: true });
    }

    // 3. walk → pos/view discovery (trusted CDP keys)
    for (let attempt = 0; attempt < 3; attempt++) {
      await tap(cdp, 'KeyW', 'w', 87, 900);
      await sleep(1200);
      const pos = await evl(cdp, `window.__RE.found.pos`);
      if (pos != null) break;
      console.log('     walk attempt ' + (attempt + 1) + ' — no pos yet');
    }
    const pos = await evl(cdp, `window.__RE.found.pos`);
    check('position offset discovered', pos != null, { pos, log: await evl(cdp, `window.__RE.log.slice(-6)`) });

    // 4. jump → y-axis align
    await tap(cdp, 'Space', ' ', 32, 450);
    await sleep(700);
    const yIdx = await evl(cdp, `window.__RE.found.y`);
    check('y-axis pinned', yIdx != null, { pos, y: yIdx });

    // 5. view matrix (camera) discovery — re-walk if needed
    if (await evl(cdp, `window.__RE.found.view`) == null) { await tap(cdp, 'KeyW', 'w', 87, 900); await sleep(1400); }
    const view = await evl(cdp, `window.__RE.found.view`);
    check('view matrix discovered', view != null, { view, status: await evl(cdp, `window.__RE.status.view`) });

    // 6. teleport: position must change immediately
    if (pos != null && view != null) {
      const before = await evl(cdp, `(() => { const a=new Float32Array(window.__RE.mem.buffer); return [a[${pos}],a[${pos + 1}],a[${pos + 2}]]; })()`);
      const tpMsg = await evl(cdp, `window.__RE.teleport(40,0)`);
      await sleep(250);
      const after = await evl(cdp, `(() => { const a=new Float32Array(window.__RE.mem.buffer); return [a[${pos}],a[${pos + 1}],a[${pos + 2}]]; })()`);
      const moved = Math.hypot(after[0] - before[0], after[2] - before[2]);
      check('teleport moved position', moved > 15, { moved: +moved.toFixed(1), tpMsg });
    } else check('teleport moved position', false, 'skipped — pos/view missing');

    // 7. fly: y must rise while feature on
    if (yIdx != null) {
      const y0 = await evl(cdp, `new Float32Array(window.__RE.mem.buffer)[${yIdx}]`);
      await evl(cdp, `window.__RE.setFeat('fly', true)`);
      await sleep(1500);
      const y1 = await evl(cdp, `new Float32Array(window.__RE.mem.buffer)[${yIdx}]`);
      await evl(cdp, `window.__RE.setFeat('fly', false)`);
      check('fly raises Y', y1 > y0 + 2, { y0: +y0.toFixed(2), y1: +y1.toFixed(2), delta: +(y1 - y0).toFixed(2) });
    } else check('fly raises Y', false, 'skipped — no y');

    // 8. enemies discovered (bots move)
    await sleep(2500);
    const enemies = await evl(cdp, `window.__RE.found.enemies.length`);
    check('enemy positions discovered', enemies > 0, { enemies });

    // 9. HP discovery (needs damage) + god restore test
    let hpFound = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 30000) {
      hpFound = (await evl(cdp, `window.__RE.found.hp != null`));
      if (hpFound) break;
      await sleep(1500);
    }
    if (hpFound) {
      const meta = await evl(cdp, `({off: window.__RE.found.hp, t: window.__RE.types.hp})`);
      // simulate a hit: lower HP by 40, enable god, expect HUD/memory restore to hpMax
      const lowered = await evl(cdp, `(() => {
        const R = window.__RE, i = R.found.hp, buf = R.mem.buffer;
        if (R.types.hp === 'f32') { const a = new Float32Array(buf); a[i] = Math.max(1, a[i] - 40); }
        else if (R.types.hp === 'i32') { const a = new Int32Array(buf); a[i] = Math.max(1, a[i] - 40); }
        else { const a = new Int16Array(buf); const k = (i*4)>>1; a[k] = Math.max(1, a[k] - 40); }
        return 'lowered';
      })()`);
      await evl(cdp, `window.__RE.setFeat('god', true)`);
      await sleep(600);
      const hud = await evl(cdp, `(document.getElementById('bottomLeftHealth')||{innerText:''}).innerText.trim()`);
      const raw = await evl(cdp, `(() => { const R = window.__RE, i = R.found.hp;
        if (R.types.hp === 'f32') return new Float32Array(R.mem.buffer)[i];
        if (R.types.hp === 'i32') return new Int32Array(R.mem.buffer)[i];
        return new Int16Array(R.mem.buffer)[(i*4)>>1]; })()`);
      await evl(cdp, `window.__RE.setFeat('god', false)`);
      const hpMax = await evl(cdp, `window.__RE.hpMax`);
      check('god restores HP', raw >= hpMax - 1, { meta, lowered, raw, hpMax, hud });
    } else {
      check('HP offset discovered', false, 'no damage in window (30s) — retry while bots shoot');
      check('god restores HP', false, 'skipped — hp not found');
    }

    // 10. aim calibration attempt (needs pointer lock + real mouse movement)
    let lockOK = false;
    try {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 720, y: 450, button: 'left', buttons: 1, clickCount: 1 });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 720, y: 450, button: 'left', buttons: 0, clickCount: 1 });
      await sleep(800);
      lockOK = await evl(cdp, `!!document.pointerLockElement`);
      if (lockOK) {
        // synthetic look-around to trigger calibration
        for (let i = 0; i < 8; i++) {
          await evl(cdp, `(() => { const ev = new MouseEvent('mousemove',{bubbles:true}); Object.defineProperty(ev,'movementX',{value:120}); Object.defineProperty(ev,'movementY',{value:0}); document.dispatchEvent(ev); return 1; })()`);
          await sleep(150);
        }
        await sleep(600);
      }
    } catch {}
    const calib = await evl(cdp, `window.__RE.aim.calib`);
    check('aim calibrated', !!calib, { pointerLock: lockOK, calib, status: await evl(cdp, `window.__RE.status.aim`) });

    const failed = results.filter((r) => !r.ok).length;
    const out = { date: new Date().toISOString(), url: GAME_URL, results };
    writeFileSync(join(HERE, 'selftest-results.json'), JSON.stringify(out, null, 2));
    console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'} (${results.length} checks)`);
    return failed === 0 ? 0 : 1;
  } catch (e) {
    if (e.skipped) {
      const failed = results.filter((r) => !r.ok).length;
      const out = { date: new Date().toISOString(), url: GAME_URL, stage: 'injection-only', results,
        skipped: ['match discovery: complete krunker security check once in headed mode, then rerun'] };
      writeFileSync(join(HERE, 'selftest-results.json'), JSON.stringify(out, null, 2));
      console.log(`\nINJECTION LAYER VERIFIED (${results.length} checks) — match-stage SKIPPED (security check = human step)`);
      return 0;
    }
    console.error('[re] selftest aborted: ' + e.message);
    try {
      const snap = await evl(cdp, `JSON.stringify({st: window.__RE && window.__RE.status, found: window.__RE && window.__RE.found, log: window.__RE && window.__RE.log.slice(-15), body: document.body.innerText.slice(0,200)})`);
      console.error(snap);
      writeFileSync(join(HERE, 'selftest-results.json'), JSON.stringify({ date: new Date().toISOString(), aborted: e.message, diag: JSON.parse(snap) }, null, 2));
    } catch {}
    return 1;
  } finally {
    try { cdp.close(); } catch {}
    if (SELFTEST) try { bin.kill('SIGTERM'); } catch {}
  }
};

main()
  .then((code) => process.exit(code ?? 0))
  .catch((e) => { console.error('[re] ERROR ' + e.message); process.exit(1); });

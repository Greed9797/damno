#!/usr/bin/env node
// Aimbot launcher for KRUNK.IO 3D — patches the served game bundle via CDP
// Fetch interception, injects payload.js before page scripts, keeps a status
// channel open. Zero npm dependencies (Node 22+: built-in WebSocket + fetch).
//
//   node start.mjs              play (opens Chrome with the aimbot active)
//   node start.mjs --selftest   headless end-to-end verification, exit 0/1
//   node start.mjs --url <u>    different game URL
//
// Keys in game: G toggles aim, H toggles auto-fire.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const SELFTEST = args.includes('--selftest');
const urlIdx = args.indexOf('--url');
const GAME_URL =
  (urlIdx !== -1 && args[urlIdx + 1]) ||
  'https://krunker-clone-creator.ai.studio/' + (SELFTEST ? '?autostart=1' : '');

const PAYLOAD = readFileSync(join(HERE, 'payload.js'), 'utf8');
const ANCHOR = 'window.addEventListener(`mousemove`';
const EXPOSURE =
  'window.__RE_GAME__={get F(){return F},get Ae(){return Ae},get p(){return p},' +
  'get We(){return We},get ce(){return ce},get ae(){return ae},get le(){return le},' +
  'get N(){return N},get ie(){return ie},get s(){return s},get i(){return i},get l(){return l}};';

function patchBundle(src) {
  if (src.includes('__RE_GAME__')) return { body: src, patched: 'already' };
  if (!src.includes(ANCHOR)) return { body: src, patched: 'anchor-missing' };
  return { body: src.replace(ANCHOR, EXPOSURE + ANCHOR), patched: 'injected' };
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error('Chrome not found. Set CHROME_PATH to the Chrome executable.');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launchChrome(chrome, profile, headless) {
  const bin = spawn(
    chrome,
    [
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-session-crashed-bubble',
      '--autoplay-policy=no-user-gesture-required',
      '--window-size=1440,900',
      ...(headless ? ['--headless=new', '--mute-audio'] : []),
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  let chromeErr = '';
  bin.stderr.on('data', (d) => (chromeErr += d));
  // Chrome writes the chosen port + browser ws path into the profile.
  const devtoolsFile = join(profile, 'DevToolsActivePort');
  for (let t = 0; t < 150; t++) {
    if (existsSync(devtoolsFile)) {
      const txt = readFileSync(devtoolsFile, 'utf8').split('\n');
      if (txt[0] && txt[1]) return { bin, port: Number(txt[0]), browserPath: txt[1].trim() };
    }
    if (bin.exitCode !== null) throw new Error('Chrome exited early:\n' + chromeErr);
    await sleep(200);
  }
  throw new Error('DevToolsActivePort never appeared.\n' + chromeErr);
}

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  let id = 0;
  const pending = new Map();
  const listeners = new Map(); // method -> [fn]
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    } else if (m.method) {
      for (const fn of listeners.get(m.method) ?? []) fn(m.params);
    }
  };
  const send = (method, params = {}) => {
    const mid = ++id;
    ws.send(JSON.stringify({ id: mid, method, params }));
    return new Promise((res, rej) => pending.set(mid, { res, rej }));
  };
  const on = (method, fn) => {
    if (!listeners.has(method)) listeners.set(method, []);
    listeners.get(method).push(fn);
  };
  const close = () => {
    try { ws.close(); } catch {}
  };
  return { send, on, close };
}

async function evaluate(cdp, expression) {
  const r = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: false,
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'evaluate failed');
  return r.result.value;
}

async function poll(cdp, expression, pred, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const v = await evaluate(cdp, expression);
      if (pred(v)) return v;
    } catch {}
    await sleep(300);
  }
  throw new Error(`timeout waiting for: ${label}`);
}

async function main() {
  const chrome = findChrome();
  const profile = mkdtempSync(join(tmpdir(), 'krunker-aimbot-'));
  console.log(`[aimbot] chrome: ${chrome}`);
  const { bin, port } = await launchChrome(chrome, profile, SELFTEST);
  console.log(`[aimbot] cdp port ${port}, profile ${profile}`);

  // Pick the page target (about:blank).
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('no page target');
  const cdp = await connect(page.webSocketDebuggerUrl);

  let patchState = 'none';
  const results = [];

  cdp.on('Fetch.requestPaused', async (params) => {
    try {
      if (!params.responseStatusCode) {
        await cdp.send('Fetch.continueRequest', { requestId: params.requestId });
        return;
      }
      const wantPatch = params.request.url.includes('index-') && params.request.url.endsWith('.js');
      if (!wantPatch) {
        await cdp.send('Fetch.continueResponse', { requestId: params.requestId });
        return;
      }
      const rb = await cdp.send('Fetch.getResponseBody', { requestId: params.requestId });
      const text = rb.base64Encoded
        ? Buffer.from(rb.body, 'base64').toString('utf8')
        : rb.body;
      const { body, patched } = patchBundle(text);
      patchState = patched;
      const headers = (params.responseHeaders ?? [])
        .filter((h) => !/^(content-encoding|content-length|content-md5|etag)$/i.test(h.name))
        .map((h) => ({ name: h.name, value: h.value }));
      await cdp.send('Fetch.fulfillRequest', {
        requestId: params.requestId,
        responseCode: params.responseStatusCode,
        responseHeaders: headers,
        body: Buffer.from(body, 'utf8').toString('base64'),
      });
      console.log(`[aimbot] bundle ${patched} (${body.length} bytes)`);
    } catch (e) {
      console.log(`[aimbot] patch error: ${e.message}`);
      try { await cdp.send('Fetch.continueResponse', { requestId: params.requestId }); } catch {}
    }
  });

  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: PAYLOAD });
  await cdp.send('Fetch.enable', {
    patterns: [{ urlPattern: '*index-*.js*', requestStage: 'Response' }],
  });
  await cdp.send('Page.navigate', { url: GAME_URL });
  console.log(`[aimbot] navigating to ${GAME_URL}`);

  if (!SELFTEST) {
    // Wait until the hook is live so the user gets a clear go/no-go.
    try {
      await poll(
        cdp,
        `({hook: !!window.__RE_GAME__, phase: document.body.dataset.state, frames: window.__RE_BOT_STATE__ ? window.__RE_BOT_STATE__.frames : -1})`,
        (v) => v.hook && v.frames > 5,
        20000,
        'hook + payload live',
      );
      console.log('[aimbot] READY — aimbot active. G = aim on/off, H = auto-fire on/off.');
      console.log('[aimbot] Closing this terminal keeps the page working until reload.');
    } catch (e) {
      console.log(`[aimbot] NOT READY: ${e.message} (patch=${patchState})`);
    }
    // Stay alive while the game tab is open; detach cleanly on Ctrl+C.
    await new Promise((res) => {
      const iv = setInterval(async () => {
        try {
          await cdp.send('Runtime.evaluate', { expression: '1', returnByValue: true });
        } catch {
          clearInterval(iv);
          res();
        }
      }, 2000);
      process.on('SIGINT', () => {
        clearInterval(iv);
        console.log('\n[aimbot] detached — page keeps running until reload.');
        cdp.close();
        res();
      });
    });
    return 0;
  }

  // ---------------- selftest ----------------
  const check = (name, ok, detail) => {
    results.push({ name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`);
  };

  try {
    const ready = await poll(
      cdp,
      `({hook: !!window.__RE_GAME__, phase: document.body.dataset.state,
         frames: window.__RE_BOT_STATE__ ? window.__RE_BOT_STATE__.frames : -1,
         err: window.__RE_BOT_ERR__ || null,
         yaw: (()=>{try{return typeof window.__RE_GAME__.F.yaw}catch(e){return 'ERR '+e.message}})(),
         bots: (()=>{try{return window.__RE_GAME__.Ae.length}catch(e){return -1}})(),
         cam: (()=>{try{return !!window.__RE_GAME__.p.matrixWorld}catch(e){return false}})()})`,
      (v) => v.hook && v.phase === 'playing' && v.frames > 5,
      25000,
      'hook live in playing phase',
    );
    check('bundle patched + hook exposed', ready.hook, { patch: patchState });
    check('phase playing via autostart', ready.phase === 'playing', ready.phase);
    check('F.yaw reachable', ready.yaw === 'number', ready.yaw);
    check('bots spawned', ready.bots > 0, { bots: ready.bots });
    check('camera matrix reachable', ready.cam === true);
    check('payload frames ticking', ready.frames > 5, { frames: ready.frames });
    check('payload error channel clean', ready.err === null, ready.err);

    const f0 = ready.frames;
    await sleep(500);
    const f1 = await evaluate(cdp, 'window.__RE_BOT_STATE__.frames');
    check('frames advance over time', f1 > f0, { f0, f1 });

    const ammo0 = await evaluate(
      cdp,
      '(() => { try { const g = window.__RE_GAME__; return g.ie[g.N]; } catch (e) { return null; } })()',
    );
    check('ammo readable before aim', typeof ammo0 === 'number', ammo0);

    // Aim at nearest bot head using the documented yaw/pitch convention.
    const aimed = await evaluate(
      cdp,
      `(() => {
        const g = window.__RE_GAME__;
        const m = g.p.matrixWorld.elements;
        const ex = m[12], ey = m[13], ez = m[14];
        let best = null, bd = 1e9;
        for (const a of g.Ae) {
          if (!(a.hp > 0) || a.respawnTimer > 0 || !a.rig || !a.rig.root) continue;
          if (a.rig.root.visible === false) continue;
          let h = null;
          const stack = [a.rig.root];
          while (stack.length) {
            const o = stack.pop();
            if (o.userData && o.userData.isHead) { h = o; break; }
            if (o.children) for (const c of o.children) stack.push(c);
          }
          const hm = h && h.matrixWorld ? h.matrixWorld.elements : null;
          const hx = hm ? hm[12] : a.rig.root.position.x;
          const hy = hm ? hm[13] : a.rig.root.position.y + 1.4;
          const hz = hm ? hm[14] : a.rig.root.position.z;
          const d = Math.hypot(hx - ex, hy - ey, hz - ez);
          if (d < bd) { bd = d; best = { hx, hy, hz, d }; }
        }
        if (!best) return { ok: false };
        const dx = best.hx - ex, dy = best.hy - ey, dz = best.hz - ez;
        g.F.yaw = Math.atan2(-dx, -dz);
        g.F.pitch = Math.asin(Math.max(-1, Math.min(1, dy / Math.hypot(dx, dy, dz))));
        return { ok: true, dist: best.d };
      })()`,
    );
    check('aim set toward nearest bot', aimed.ok === true, aimed);

    const t0 = Date.now();
    let target = null;
    while (Date.now() - t0 < 4000) {
      target = await evaluate(cdp, 'window.__RE_BOT_STATE__.target');
      if (target && target.err <= 45) break;
      await sleep(250);
    }
    check('payload acquires target', !!target && target.err <= 45, target);

    await sleep(1500);
    const after = await evaluate(
      cdp,
      `({ammo: (()=>{try{return window.__RE_GAME__.ie[window.__RE_GAME__.N]}catch(e){return null}})(),
         reloading: (()=>{try{return window.__RE_GAME__.ae}catch(e){return null}})(),
         err: window.__RE_BOT_ERR__ || null,
         target: window.__RE_BOT_STATE__.target})`,
    );
    const ammoSpent =
      typeof after.ammo === 'number' && typeof ammo0 === 'number'
        ? after.ammo < ammo0 || after.reloading === true
        : false;
    check('auto-fire spent ammo', ammoSpent, { ammo0, after });
    check('payload error channel still clean', after.err === null, after.err);

    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'} (${results.length} checks) patch=${patchState}`);
    writeFileSync(
      join(HERE, 'selftest-results.json'),
      JSON.stringify({ date: new Date().toISOString(), url: GAME_URL, patchState, results }, null, 2),
    );
    return failed === 0 ? 0 : 1;
  } finally {
    try { cdp.close(); } catch {}
    try { bin.kill('SIGTERM'); } catch {}
  }
}

main()
  .then((code) => process.exit(code ?? 0))
  .catch((e) => {
    console.error('[aimbot] ERROR ' + e.message);
    process.exit(1);
  });

#!/usr/bin/env node
// Live verification: headed Chrome, payload injected, waits for a human Play
// (or auto-start if the menu cooperates), then exercises every match-stage
// discovery + feature check. Run while you play: node verify.mjs
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAYLOAD = readFileSync(join(HERE, 'payload.js'), 'utf8');
const HEADLESS = process.argv.includes('--headless');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  for (const c of [process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)) if (existsSync(c)) return c;
  throw new Error('Chrome not found');
}
async function pickFreePort() {
  // --remote-debugging-port=0 (ephemeral) silently breaks krunker's menu boot — isolated by
  // ablate6: same connect/warm logic, only the port mechanism swapped, cards stayed 0.
  // grab a real free port explicitly and pass that concrete number instead.
  const net = await import('node:net');
  return await new Promise((res, rej) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const p = srv.address().port;
      srv.close(() => res(p));
    });
    srv.on('error', rej);
  });
}
async function launch(chrome, profile) {
  const port = await pickFreePort();
  const bin = spawn(chrome, [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--window-size=1440,900',
    ...(HEADLESS ? ['--headless=new', '--mute-audio'] : []),
    'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  // wait until the endpoint actually answers, not just until the port file appears
  for (let t = 0; t < 150; t++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/json/version`); if (r.ok) return { bin, port }; } catch {}
    if (bin.exitCode !== null) throw new Error('chrome exited');
    await sleep(200);
  }
  throw new Error('devtools endpoint never became ready');
}
async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pend = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
    if (m.method === 'Runtime.exceptionThrown') console.log('  [page-exc] ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '').slice(0,200));
    if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) console.log('  [page-' + m.params.type + '] ' + m.params.args.map(a => a.value || a.description || '').join(' ').slice(0,200));
  };
  const send = (method, params = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params })); return new Promise((res, rej) => pend.set(i, { res, rej })); };
  const close = () => { try { ws.close(); } catch {} };
  return { send, close };
}
async function evl(cdp, expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
  return r.result.value;
}
async function tap(cdp, code, key, vk, ms = 700) {
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', code, key, windowsVirtualKeyCode: vk });
  await sleep(ms);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key, windowsVirtualKeyCode: vk });
}

let __bin = null;
process.on('exit', () => { try { if (__bin) __bin.kill('SIGKILL'); } catch {} });
const main = async () => {
  const chrome = findChrome();
  const profile = mkdtempSync(join(tmpdir(), 'krunker-live-'));
  const { bin, port } = await launch(chrome, profile);
  __bin = bin;
  console.log(`[live] chrome up :${port} — a window is open on your screen.`);
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = list.find((t) => t.type === 'page');
  const cdp = await connect(page.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: PAYLOAD });
  await cdp.send('Page.navigate', { url: 'https://krunker.io/' });
  console.log('[live] payload injected; warming menu…');
  const results = [];
  const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`); };

  // mirror playonly.mjs exactly: fixed 9s sleep FIRST (no evaluate during that window),
  // then consent, then fixed 30s warm — ?play= only gets honoured when this total timing
  // is hit (a mid-load evaluate loop before the sleep shifted it and broke the transition).
  await sleep(9000);

  // confirm WASM captured (payload runs at document-start, so this is instant by now)
  let mem = false;
  for (let t = 0; t < 20; t++) { if (await evl(cdp, `!!(window.__RE&&window.__RE.mem)`).catch(()=>false)) { mem = true; break; } await sleep(400); }
  check('WASM memory captured', mem, mem ? await evl(cdp, `window.__RE.status.mem`) : 'not captured after 8s');

  const consent = async () => {
    await evl(cdp, `typeof checkTerms==='function' && checkTerms(1)`).catch(()=>{});
    await evl(cdp, `(function(){var el=[...document.querySelectorAll('div,button,span,a')].find(e=>e.children.length===0&&e.textContent.trim()==='I Accept');if(el)el.click();return 'cmp'})()`).catch(()=>{});
  };
  await consent();
  for (let i = 0; i < 6; i++) {
    await sleep(5000);
    const cards = await evl(cdp, `document.querySelectorAll('.popRailCard').length`).catch(()=>0);
    console.log('     warm+' + ((i+1)*5) + 's cards=' + cards);
  }

  console.log('[live] joining via ?play=Burg (fresh profile => FTUE bot match, no real players)…');
  await cdp.send('Page.navigate', { url: 'https://krunker.io/?play=Burg' });
  let inMatch = false, secSeen = 0;
  const t0 = Date.now();
  let lastLog = 0;
  while (Date.now() - t0 < 360000) {
    const st = await evl(cdp, `JSON.stringify({
      url: location.search,
      ammo: (document.getElementById('ammoVal')||{}).innerText || '',
      instr: ((document.getElementById('instructionsUpdate')||{}).innerText||'').slice(0,90),
      load: (document.getElementById('loadingMapText')||{}).innerText || ''
    })`).catch(()=>null);
    if (st) {
      const j = JSON.parse(st);
      if (j.ammo) { inMatch = true; break; }
      if (j.instr.indexOf('Security check') >= 0) secSeen++;
      else secSeen = 0;
      if (secSeen >= 3) { check('entered a match (HUD live)', false, 'SKIPPED: security check — human step, never bypassed'); throw Object.assign(new Error('skipped'), { skipped: true }); }
      if (Date.now() - lastLog > 12000) { lastLog = Date.now(); console.log('     …' + Math.round((Date.now()-t0)/1000) + 's url=' + j.url + ' load=' + JSON.stringify(j.load) + ' instr=' + JSON.stringify(j.instr)); }
    }
    await sleep(2500);
  }
  check('entered a match (HUD live)', inMatch, inMatch ? await evl(cdp, `(document.getElementById('ammoVal').innerText||'').trim()`) : 'timed out after 360s on ?play=Burg');
  if (!inMatch) throw new Error('no match');

  // --- discovery via trusted keys (click canvas first: some builds gate input on lock) ---
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 720, y: 450, button: 'left', buttons: 1, clickCount: 1 }).catch(()=>{});
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 720, y: 450, button: 'left', buttons: 0, clickCount: 1 }).catch(()=>{});
  await sleep(600);
  console.log('     lock after click: ' + await evl(cdp, `!!document.pointerLockElement`).catch(()=>false));
  console.log('     focus/visibility: ' + await evl(cdp, `JSON.stringify({focus:document.hasFocus(), vis:document.visibilityState})`).catch(()=>'ERR'));
  // is the game loop ticking at all? (memory must change with no input, if logic is running)
  const idle = await evl(cdp, `window.__RE.dbgIdle(1200)`).catch((e)=>({err:String(e)}));
  console.log('     idle memory drift over1.2s: ' + JSON.stringify(idle));
  for (let a = 0; a < 4 && (await evl(cdp, `window.__RE.found.pos`)) == null; a++) {
    await tap(cdp, 'KeyW', 'w', 87, 900); await sleep(1400);
    const lg = await evl(cdp, `JSON.stringify({pos:window.__RE.found.pos, st:window.__RE.status.pos, log:window.__RE.log.slice(-4)})`).catch(()=>'{}');
    console.log('     walk#' + (a+1) + ' ' + lg);
  }
  const pos = await evl(cdp, `window.__RE.found.pos`);
  check('position offset discovered', pos != null, { pos, log: await evl(cdp, `window.__RE.log.slice(-5)`) });

  await tap(cdp, 'Space', ' ', 32, 450); await sleep(800);
  const yIdx = await evl(cdp, `window.__RE.found.y`);
  check('y-axis pinned', yIdx != null, { pos, y: yIdx });

  if (await evl(cdp, `window.__RE.found.view`) == null) { await tap(cdp, 'KeyW', 'w', 87, 900); await sleep(1400); }
  check('view matrix discovered', (await evl(cdp, `window.__RE.found.view`)) != null, await evl(cdp, `window.__RE.status.view`));

  if (pos != null) {
    const b4 = await evl(cdp, `(()=>{const a=new Float32Array(window.__RE.mem.buffer);return [a[${pos}],a[${pos+1}],a[${pos+2}]]})()`);
    await evl(cdp, `window.__RE.teleport(40,0)`); await sleep(250);
    const af = await evl(cdp, `(()=>{const a=new Float32Array(window.__RE.mem.buffer);return [a[${pos}],a[${pos+1}],a[${pos+2}]]})()`);
    check('teleport moved position', Math.hypot(af[0]-b4[0], af[2]-b4[2]) > 15, { moved: +Math.hypot(af[0]-b4[0], af[2]-b4[2]).toFixed(1) });
  } else check('teleport moved position', false, 'skipped — no pos');

  if (yIdx != null) {
    const y0 = await evl(cdp, `new Float32Array(window.__RE.mem.buffer)[${yIdx}]`);
    await evl(cdp, `window.__RE.setFeat('fly', true)`); await sleep(1500);
    const y1 = await evl(cdp, `new Float32Array(window.__RE.mem.buffer)[${yIdx}]`);
    await evl(cdp, `window.__RE.setFeat('fly', false)`);
    check('fly raises Y', y1 > y0 + 2, { y0: +y0.toFixed(2), y1: +y1.toFixed(2) });
  } else check('fly raises Y', false, 'skipped — no y');

  await sleep(2500);
  check('enemy positions discovered', (await evl(cdp, `window.__RE.found.enemies.length`)) > 0, await evl(cdp, `window.__RE.found.enemies.length`));

  // HP: wait for real damage (stand still up to 45s)
  let hpFound = false; const th = Date.now();
  while (Date.now() - th < 45000) { if (await evl(cdp, `window.__RE.found.hp!=null`)) { hpFound = true; break; } await sleep(1500); }
  check('HP offset discovered', hpFound, hpFound ? await evl(cdp, `({off:window.__RE.found.hp,t:window.__RE.types.hp})`) : 'no damage within 45s — stand idle in a bot match and rerun');
  if (hpFound) {
    await evl(cdp, `(()=>{const R=window.__RE,i=R.found.hp,b=R.mem.buffer;
      if(R.types.hp==='f32'){const a=new Float32Array(b);a[i]=Math.max(1,a[i]-40)}
      else if(R.types.hp==='i32'){const a=new Int32Array(b);a[i]=Math.max(1,a[i]-40)}
      else{const a=new Int16Array(b);const k=(i*4)>>1;a[k]=Math.max(1,a[k]-40)} return 'low'})()`);
    await evl(cdp, `window.__RE.setFeat('god', true)`); await sleep(600);
    const raw = await evl(cdp, `(()=>{const R=window.__RE,i=R.found.hp;
      if(R.types.hp==='f32')return new Float32Array(R.mem.buffer)[i];
      if(R.types.hp==='i32')return new Int32Array(R.mem.buffer)[i];
      return new Int16Array(R.mem.buffer)[(i*4)>>1]})()`);
    await evl(cdp, `window.__RE.setFeat('god', false)`);
    const hpMax = await evl(cdp, `window.__RE.hpMax`);
    check('god restores HP', raw >= hpMax - 1, { raw, hpMax });
  } else check('god restores HP', false, 'skipped — hp not found');

  // aim: pointer lock (click game area) + mouse sweep → calibration
  try {
    for (let i = 0; i < 3; i++) {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 720, y: 450, button: 'left', buttons: 1, clickCount: 1 });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 720, y: 450, button: 'left', buttons: 0, clickCount: 1 });
      await sleep(500);
      if (await evl(cdp, `!!document.pointerLockElement`).catch(()=>false)) break;
    }
    console.log('     pointerLock=' + await evl(cdp, `!!document.pointerLockElement`).catch(()=>false));
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 720, y: 450, button: 'left', buttons: 1, clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 720, y: 450, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(800);
    for (let i = 0; i < 10; i++) {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 720 + (i%2?250:-250), y: 450 + (i%3?100:-60) });
      await sleep(180);
    }
    await sleep(800);
  } catch {}
  const calib = await evl(cdp, `JSON.stringify(window.__RE.aim.calib)`).catch(()=>'null');
  check('aim calibrated from real mouse', calib !== 'null' && calib !== 'null', { calib, lock: await evl(cdp, `!!document.pointerLockElement`), status: await evl(cdp, `window.__RE.status.aim`) });

  const failed = results.filter((r) => !r.ok).length;
  writeFileSync(join(HERE, 'live-verify.json'), JSON.stringify({ date: new Date().toISOString(), results }, null, 2));
  console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'} (${results.length} checks) — wrote live-verify.json`);
  cdp.close();
  try { bin.kill('SIGTERM'); } catch {}
  return failed === 0 ? 0 : 1;
};
main().then((c) => process.exit(c ?? 0)).catch((e) => {
  if (e && e.skipped) { console.log('[live] SKIPPED (human step required) — exit 0'); process.exit(0); }
  console.error('[live] ERROR ' + e.message); process.exit(1);
});

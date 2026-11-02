// KRUNK.IO 3D — mod menu + aimbot payload (injected at document-start via CDP).
// REA finding: the game core is WASM (pkg/loader-*.wasm) — player/view state
// lives in linear memory (export `T`, ~18 MB), not in JS closures. Strategy:
// capture the instance, discover offsets by snapshot-diff around real inputs,
// prove every write with persistence or HUD read-back before trusting it.
(() => {
  if (window.__RE) return;
  const R = (window.__RE = {
    mem: null, err: null,
    found: { pos: null, y: null, view: null, hp: null, ammo: null, enemies: [] },
    feat: { aim: false, fly: false, god: false },
    status: { mem: 'waiting', match: 'waiting', pos: 'waiting', view: 'waiting', hp: 'waiting', aim: 'no mouse yet' },
    aim: { err: null, target: null, calib: null },
    hpMax: 100, types: {}, log: [],
  });
  const say = (m) => { R.log.push(m); if (R.log.length > 150) R.log.shift(); };

  // ---------- WASM capture (game core exports its memory as `T`) ----------
  const grab = (res) => {
    try {
      const exp = res && res.instance && res.instance.exports;
      const mem = exp && (exp.T || exp.memory);
      if (mem && mem.buffer && mem.buffer.byteLength > 4e6 && Object.keys(exp).length <= 40) {
        R.mem = mem;
        R.status.mem = 'ok ' + (mem.buffer.byteLength >> 20) + 'MB wasm';
        say('wasm captured: ' + Object.keys(exp).join(','));
      }
    } catch (e) { R.err = String(e); }
    return res;
  };
  const oi = WebAssembly.instantiate;
  WebAssembly.instantiate = function () { const r = oi.apply(this, arguments); return r && r.then ? r.then(grab) : grab(r); };
  if (WebAssembly.instantiateStreaming) {
    const ois = WebAssembly.instantiateStreaming;
    WebAssembly.instantiateStreaming = function () { return ois.apply(this, arguments).then(grab); };
  }

  // ---------- memory helpers ----------
  const f32 = () => (R.mem ? new Float32Array(R.mem.buffer) : null);
  const i32v = () => new Int32Array(R.mem.buffer);
  const i16v = () => new Int16Array(R.mem.buffer);
  let lastSnap = null, prevSnap = null;
  const snap = () => { if (!R.mem) return null; prevSnap = lastSnap; lastSnap = f32().slice(); return lastSnap; };
  const changed = (a, b) => {
    if (!a || !b || a.length !== b.length) return [];
    const out = [];
    for (let i = 0; i < a.length; i++) {
      const x = a[i], y = b[i];
      if (x === y || !Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (Math.abs(x - y) > 1e-6) out.push(i);
    }
    return out;
  };
  const readF = (i) => f32()[i];
  const worldish = (arr, i) =>
    i >= 0 && i + 2 < arr.length && [arr[i], arr[i + 1], arr[i + 2]].every(Number.isFinite) &&
    [arr[i], arr[i + 1], arr[i + 2]].every((x) => Math.abs(x) < 50000) &&
    [arr[i], arr[i + 1], arr[i + 2]].some((x) => Math.abs(x) > 0.01);

  // write-verify: write ALL three floats, confirm they stay near the written
  // values (source state) rather than snapping back (derived state), then restore.
  const writeVerify = async (i, delta = 60, ms = 260) => {
    if (!R.mem || !worldish(f32(), i)) return false;
    const a = f32();
    const orig = [a[i], a[i + 1], a[i + 2]];
    a[i] = orig[0] + delta; a[i + 1] = orig[1] + delta; a[i + 2] = orig[2] + delta;
    await new Promise((r) => setTimeout(r, ms));
    const now = [readF(i), readF(i + 1), readF(i + 2)];
    const drift = now.map((v, k) => Math.abs(v - (orig[k] + delta))).reduce((s, x) => s + x, 0);
    const back = now.map((v, k) => Math.abs(v - orig[k])).reduce((s, x) => s + x, 0);
    const kept = drift < back;
    const b = f32();
    b[i] = orig[0]; b[i + 1] = orig[1]; b[i + 2] = orig[2];
    await new Promise((r) => setTimeout(r, 100));
    return kept;
  };

  // ---------- HUD oracle ----------
  const hudInt = (id) => { const el = document.getElementById(id); const m = el && (el.innerText || '').match(/-?\d+/); return m ? Number(m[0]) : null; };
  const inMatch = () => {
    const am = document.getElementById('ammoVal');
    return !!(am && (am.innerText || '').trim());
  };

  // ---------- walk discovery (W key) ----------
  let walkA = null, walkB = null, walkC = null, walking = false, lastWalkEnd = 0;
  R.onKey = (type, code) => {
    if (code === 'KeyW') {
      if (type === 'keydown' && !walking) { walking = true; walkA = snap(); }
      if (type === 'keyup' && walking) {
        walking = false; lastWalkEnd = Date.now();
        walkB = snap();
        setTimeout(() => { walkC = snap(); analyzeWalk(); }, 450);
      }
    } else if (code === 'Space') {
      if (type === 'keydown') R._jumpA = snap();
      if (type === 'keyup') { R._jumpB = snap(); setTimeout(analyzeJump, 250); }
    }
  };
  async function analyzeWalk() {
    if (!R.mem) { R.status.pos = 'no wasm memory'; return; }
    if (!inMatch()) { say('walk ignored — not in a match'); return; }
    if (!walkA || !walkB || !walkC) return;
    const dAB = changed(walkA, walkB);
    const dBC = changed(walkB, walkC);
    if (!dAB.length) { say('walk diff empty'); return; }
    const setAB = new Set(dAB), bcSet = new Set(dBC);
    say('walk diff ' + dAB.length + ' chg');

    // runs of changed floats (1..40) — translation-only matrix moves are runs of 1
    const seen = new Set(), runs = [];
    for (const i of dAB) {
      if (seen.has(i)) continue;
      let n = 1; while (setAB.has(i + n)) n++;
      for (let k = 0; k < n; k++) seen.add(i + k);
      if (n <= 40) runs.push([i, n]);
    }
    // position candidates: triplet starting at (j-2..j), stable after release
    const cands = [], seenC = new Set();
    for (const j of dAB) {
      if (bcSet.has(j)) continue;
      for (const st of [j - 2, j - 1, j]) {
        if (st < 0 || seenC.has(st)) continue;
        if (worldish(walkC, st)) { seenC.add(st); cands.push(st); }
      }
    }
    say('runs ' + runs.length + ', pos cands ' + cands.length);

    // mutual consistency: a real view matrix maps to a camera position that sits
    // 0.15..4 units ABOVE a real player position with near-zero horizontal offset
    const basesOf = (st, n) => {
      const b = new Set();
      for (let o = 0; o <= 16; o++) { b.add(st - o); b.add(st + n - 1 - o); }
      b.add(Math.floor(st / 16) * 16);
      b.add(Math.floor((st + n - 1) / 16) * 16);
      return [...b].filter((x) => x >= 0);
    };
    let view = null, pos = null;
    for (const [st, n] of runs) {
      if (view) break;
      for (const b of basesOf(st, n)) {
        const cam = camFromView(b);
        if (!cam) continue;
        const fl = Math.hypot(cam.fwd[0], cam.fwd[1], cam.fwd[2]);
        const tmag = Math.hypot(cam.pos[0], cam.pos[1], cam.pos[2]);
        if (Math.abs(fl - 1) > 0.02 || !Number.isFinite(tmag) || tmag > 1e5) continue;
        for (const c of cands) {
          const a = walkC;
          const hdist = Math.hypot(a[c] - cam.pos[0], a[c + 2] - cam.pos[2]);
          const dy = cam.pos[1] - a[c + 1];
          if (hdist < 3 && dy > 0.15 && dy < 4) { view = b; pos = c; break; }
        }
        if (view) break;
      }
    }
    if (view != null && pos != null) {
      if (await writeVerify(pos)) {
        R.found.view = view; R.found.pos = pos;
        R.status.view = 'ok @' + view; R.status.pos = 'ok @' + pos;
        say('pair found: pos @' + pos + ' view @' + view);
        alignY(); return;
      }
      say('pair writeVerify failed, falling back');
      view = null; pos = null;
    }

    // fallback: pin position by persistence alone
    for (const c of cands.slice(0, 12)) {
      if (await writeVerify(c)) { R.found.pos = c; R.status.pos = 'ok @' + c; say('pos(fb) @' + c); break; }
    }
    if (R.found.pos == null) { R.status.pos = 'no stable triplet — walk again'; return; }
    findView(dAB);
    alignY();
  }

  // pin y-axis with a jump diff (flat-ground walking doesn't move y)
  function analyzeJump() {
    if (R.found.pos == null || !R._jumpA || !R._jumpB) return;
    if (!inMatch()) return;
    const d = changed(R._jumpA, R._jumpB);
    if (!d.length) return;
    const pos = R.found.pos;
    const inTriplet = d.filter((i) => i >= pos && i <= pos + 2);
    if (inTriplet.length && inTriplet[0] !== pos + 1 && worldish(lastSnap, inTriplet[0] - 1)) {
      R.found.pos = inTriplet[0] - 1;
      R.status.pos += ' y-realign';
      say('y realigned');
    }
    R.found.y = R.found.pos + 1;
    say('jump diff ' + d.length);
  }
  function alignY() { if (R.found.y == null && R.found.pos != null) R.found.y = R.found.pos + 1; }

  function findView(dAB) {
    const set = new Set(dAB), seen = new Set(), runs = [];
    for (const i of dAB) {
      if (seen.has(i)) continue;
      let n = 1; while (set.has(i + n)) n++;
      for (let k = 0; k < n; k++) seen.add(i + k);
      if (n >= 3 && n <= 40) runs.push([i, n]);
    }
    if (!runs.length) { R.status.view = 'walk again for view matrix'; return; }
    const a = f32();
    const px = a[R.found.pos], py = a[R.found.pos + 1], pz = a[R.found.pos + 2];
    for (const [st, n] of runs) {
      const bases = new Set();
      for (let o = 0; o <= 16; o++) { bases.add(st - o); }
      bases.add(Math.floor(st / 16) * 16);
      bases.add(Math.floor((st + n - 1) / 16) * 16);
      for (const b of bases) {
        if (b < 0) continue;
        const cam = camFromView(b);
        if (!cam) continue;
        const fl = Math.hypot(cam.fwd[0], cam.fwd[1], cam.fwd[2]);
        const dp = Math.hypot(cam.pos[0] - px, cam.pos[1] - py, cam.pos[2] - pz);
        if (Math.abs(fl - 1) < 0.03 && dp < 45) {
          R.found.view = b; R.status.view = 'ok @' + b;
          say('view @' + b + ' camdist ' + dp.toFixed(1));
          return;
        }
      }
    }
    R.status.view = 'not validated — walk again';
  }

  // view matrix math (column-major): fwd = -(e2,e6,e10); pos = -R·t with R[r][c]=e[r*4+c]
  function camFromView(b) {
    if (!R.mem) return null;
    const v = f32();
    if (b < 0 || b + 16 > v.length) return null;
    const e = v.subarray(b, b + 16);
    if (![...e].every(Number.isFinite)) return null;
    const fwd = [-e[2], -e[6], -e[10]];
    const t = [e[12], e[13], e[14]];
    const pos = [0, 0, 0];
    for (let r = 0; r < 3; r++) {
      let s = 0;
      for (let c = 0; c < 3; c++) s += e[r * 4 + c] * t[c];
      pos[r] = -s;
    }
    return { fwd, pos, e };
  }
  R.camView = camFromView;          // exposed for selftest
  // debug: does memory change at all over ms with NO input? (game loop ticking?)
  R.dbgIdle = async (ms = 1000) => {
    if (!R.mem) return { err: 'no mem' };
    const a = f32().slice();
    await new Promise((r) => setTimeout(r, ms));
    const b = f32().slice();
    const d = changed(a, b);
    return { len: a.length, changed: d.length, sample: d.slice(0, 8) };
  };
  const norm = (v) => { const n = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };

  // ---------- HP / ammo via HUD text-change oracle ----------
  let hudPrev = { hp: null, am: null };
  let rollPrev = null, rollCur = null;
  // rolling snapshot pair, refreshed every 300ms — HUD and enemy diffs both read it
  setInterval(() => { if (!R.mem) return; rollPrev = rollCur; rollCur = f32().slice(); }, 300);
  setInterval(async () => {
    if (!R.mem) return;
    const hp = hudInt('bottomLeftHealth'), am = hudInt('ammoVal');
    if (hp == null && am == null) return;
    if (inMatch()) R.status.match = 'in match';
    if (!rollCur) { hudPrev = { hp, am }; return; }
    const verify = async (oldV, newV, key, hudId) => {
      if (oldV == null || newV == null || oldV === newV || R.found[key] != null) return;
      const idx = changed(rollPrev, rollCur);
      const buf = R.mem.buffer;
      for (const i of idx) {
        const byte = i * 4;
        const fArr = new Float32Array(buf), i32 = new Int32Array(buf), i16 = new Int16Array(buf);
        const kind = Math.abs(fArr[i] - newV) < 1e-4 ? 'f32' : i32[i] === newV ? 'i32' : (i16[byte >> 1] === newV || i16[(byte >> 1) + 1] === newV) ? 'i16' : null;
        if (!kind) continue;
        const orig = { f: fArr[i], i32: i32[i], i16a: i16[byte >> 1], i16b: i16[(byte >> 1) + 1] };
        const probe = newV + 7;
        if (kind === 'f32') fArr[i] = probe;
        else if (kind === 'i32') i32[i] = probe;
        else { i16[byte >> 1] = probe; }
        await new Promise((r) => setTimeout(r, 220));
        const seen = hudInt(hudId);
        if (seen === probe) {
          R.found[key] = i; R.types[key] = kind;
          R.status[key] = 'ok @' + i + ' ' + kind;
          say(key + ' @' + i + ' (' + kind + ')');
        }
        // restore
        const f2 = new Float32Array(buf), i2 = new Int32Array(buf), s2 = new Int16Array(buf);
        if (kind === 'f32') f2[i] = orig.f;
        else if (kind === 'i32') i2[i] = orig.i32;
        else { s2[byte >> 1] = orig.i16a; s2[(byte >> 1) + 1] = orig.i16b; }
        await new Promise((r) => setTimeout(r, 80));
        if (R.found[key] != null) break;
      }
    };
    if (hudPrev.hp != null && hp !== hudPrev.hp) await verify(hudPrev.hp, hp, 'hp', 'bottomLeftHealth');
    if (hudPrev.am != null && am !== hudPrev.am) await verify(hudPrev.am, am, 'ammo', 'ammoVal');
    hudPrev = { hp, am };
  }, 300);

  // ---------- enemies: rolling diff while idle ----------
  setInterval(() => {
    if (!R.mem || walking || Date.now() - lastWalkEnd < 900 || !inMatch()) return;
    if (!rollPrev || !rollCur) return;
    const idx = changed(rollPrev, rollCur);
    if (!idx.length) return;
    const set = new Set(idx), seen = new Set(), out = [];
    for (const i of idx) {
      if (seen.has(i)) continue;
      let n = 1; while (set.has(i + n)) n++;
      for (let k = 0; k < n; k++) seen.add(i + k);
      if (n === 3 && worldish(rollCur, i)) out.push({ i, x: rollCur[i], y: rollCur[i + 1], z: rollCur[i + 2], t: Date.now() });
    }
    if (out.length) R.found.enemies = out.filter((e) => Date.now() - e.t < 5000).slice(0, 24);
  }, 400);

  // ---------- features ----------
  let rafOn = false, lastShot = 0, aimStreak = 0, aimLastErr = null, aimFlips = 0;
  const tick = () => {
    if (!rafOn) return;
    requestAnimationFrame(tick);
    if (!R.mem) return;
    const yIdx = R.found.y != null ? R.found.y : (R.found.pos != null ? R.found.pos + 1 : null);
    if (R.feat.fly && yIdx != null) { const a = f32(); a[yIdx] += 0.35; }
    if (R.feat.god && R.found.hp != null) {
      const i = R.found.hp, kind = R.types.hp, want = R.hpMax;
      if (kind === 'f32') { const v = f32(); if (v[i] < want) v[i] = want; }
      else if (kind === 'i32') { const v = i32v(); if (v[i] < want) v[i] = want; }
      else if (kind === 'i16') { const v = i16v(); const k = (i * 4) >> 1; if (v[k] < want) v[k] = want; }
    }
    if (R.feat.aim && R.aim.calib && R.found.view != null && R.found.enemies.length) {
      const cam = camFromView(R.found.view);
      if (!cam) return;
      let best = null, bestErr = (45 * Math.PI) / 180;
      for (const en of R.found.enemies) {
        const d = [en.x - cam.pos[0], en.y + 1.2 - cam.pos[1], en.z - cam.pos[2]];
        const dist = Math.hypot(d[0], d[1], d[2]);
        if (dist < 1 || dist > 150) continue;
        const nd = norm(d);
        const dot = Math.max(-1, Math.min(1, nd[0] * cam.fwd[0] + nd[1] * cam.fwd[1] + nd[2] * cam.fwd[2]));
        const err = Math.acos(dot);
        if (err < bestErr) { bestErr = err; best = { d: nd, err, dist }; }
      }
      if (!best) { R.aim.target = null; return; }
      R.aim.target = { err: +((best.err * 180) / Math.PI).toFixed(1), dist: +best.dist.toFixed(0) };
      const f = cam.fwd, d = best.d;
      const right = norm([f[2], 0, -f[0]]);                       // f × up, horizontal
      const yawErr = Math.atan2(-(d[0] * right[0] + d[1] * right[1] + d[2] * right[2]), d[0] * f[0] + d[1] * f[1] + d[2] * f[2]);
      const pitchErr = Math.asin(Math.max(-1, Math.min(1, d[1])));
      if (Math.abs(yawErr) + Math.abs(pitchErr) > 0.003) {
        const dx = Math.max(-140, Math.min(140, -yawErr * R.aim.calib.x * 350));
        const dy = Math.max(-140, Math.min(140, pitchErr * R.aim.calib.y * 350));
        const ev = new MouseEvent('mousemove', { bubbles: true });
        Object.defineProperty(ev, 'movementX', { value: dx });
        Object.defineProperty(ev, 'movementY', { value: dy });
        (document.pointerLockElement || document.body).dispatchEvent(ev);
      }
      R.aim.err = +(best.err * 180) / Math.PI;
      // convergence watchdog: if error grows steadily after activation, signs are wrong — flip once
      if (aimLastErr != null && best.err > aimLastErr + 1e-5) aimStreak++; else aimStreak = Math.max(0, aimStreak - 1);
      aimLastErr = best.err;
      if (aimStreak > 45 && aimFlips < 2 && R.aim.calib) {
        R.aim.calib.x *= -1; R.aim.calib.y *= -1; aimFlips++; aimStreak = 0;
        R.status.aim = 'auto-corrected #' + aimFlips; say('aim signs flipped');
      }
      if (best.err < 0.025 && Date.now() - lastShot > 150) {
        lastShot = Date.now();
        const c = document.pointerLockElement || document.getElementById('game-overlay') || document.body;
        c.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
        c.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
      }
    }
  };
  R.setFeat = (k, v) => {
    R.feat[k] = !!v;
    if (k === 'god' && v) { const h = hudInt('bottomLeftHealth'); if (h != null) R.hpMax = Math.max(R.hpMax, h); }
    if (!rafOn) { rafOn = true; requestAnimationFrame(tick); }
    say('feat ' + k + '=' + R.feat[k]);
    upd();
    return R.feat[k];
  };
  R.teleport = (dist = 40, up = 0) => {
    if (R.found.pos == null || R.found.view == null) return 'pos/view not found yet';
    const cam = camFromView(R.found.view);
    if (!cam) return 'no camera';
    const h = norm([cam.fwd[0], 0, cam.fwd[2]]);
    const a = f32(), i = R.found.pos;
    const before = [a[i], a[i + 1], a[i + 2]];
    a[i] += h[0] * dist; a[i + 1] += up; a[i + 2] += h[2] * dist;
    return 'tp ' + dist + ' → ' + [a[i], a[i + 1], a[i + 2]].map((v) => v.toFixed(0)).join(',') + ' (was ' + before.map((v) => v.toFixed(0)).join(',') + ')';
  };
  // learn aim direction mapping from a real mouse move
  R.onMouse = (mx, my) => {
    if (!R.mem || R.found.view == null || R.aim.calib || Math.abs(mx) + Math.abs(my) < 60) return;
    const b = camFromView(R.found.view); if (!b) return;
    const bx = b.fwd[0], by = b.fwd[1];
    setTimeout(() => {
      const a2 = camFromView(R.found.view); if (!a2) return;
      const dx = a2.fwd[0] - bx, dy = a2.fwd[1] - by;
      if (Math.abs(dx) + Math.abs(dy) < 0.015) return;
      R.aim.calib = {
        x: (Math.sign(mx) * Math.sign(-dx)) || 1,   // yaw: mx>0 should turn view right (fwd.x sign depends handedness)
        y: (Math.sign(my) * Math.sign(dy)) || 1,
      };
      R.status.aim = 'calibrated ✓';
      say('aim calib ' + JSON.stringify(R.aim.calib));
      upd();
    }, 150);
  };

  // ---------- input ----------
  addEventListener('keydown', (e) => { R.onKey('keydown', e.code); if (e.ctrlKey && e.shiftKey) hotkey(e); }, true);
  addEventListener('keyup', (e) => R.onKey('keyup', e.code), true);
  addEventListener('mousemove', (e) => R.onMouse(e.movementX || 0, e.movementY || 0), true);
  function hotkey(e) {
    const map = { KeyG: 'aim', KeyB: 'fly', KeyN: 'god' };
    const f = map[e.code];
    if (!f) return;
    say('hotkey fired code=' + e.code + ' trusted=' + e.isTrusted + ' stack=' + ((e.stack||'')+'').slice(0,140));
    e.preventDefault(); e.stopPropagation();
    R.setFeat(f, !R.feat[f]);
  }

  // ---------- menu ----------
  const mk = () => {
    if (document.getElementById('re-modmenu')) return;
    if (!document.body) { setTimeout(mk, 400); return; }
    const st = document.createElement('style');
    st.textContent = `#re-modmenu{position:fixed;top:64px;right:12px;z-index:2147483000;width:246px;background:rgba(12,14,18,.94);
      border:2px solid #2b3245;box-shadow:0 4px 0 #080a0f;color:#cbd5e1;font:700 11px/1.55 'Chakra Petch',system-ui,sans-serif;padding:8px 10px}
      #re-modmenu .t{color:#f59e0b;font-size:13px;display:flex;justify-content:space-between}
      #re-modmenu .rb{background:#1e293b;border:1px solid #2b3245;color:#e2e8f0;padding:4px 7px;cursor:pointer;font:700 10px/1 inherit}
      #re-modmenu .rb:hover{background:#334155}#re-modmenu .rb.on{background:#f59e0b;color:#0f172a;border-color:#f59e0b}
      #re-modmenu .ok{color:#4ade80}#re-modmenu .no{color:#475569}#re-modmenu .st{color:#64748b;font-size:9px;margin-top:5px;min-height:12px}`;
    document.head.appendChild(st);
    const m = document.createElement('div');
    m.id = 're-modmenu';
    m.innerHTML = `<div class="t"><span>RE MOD MENU</span><span style="color:#64748b;font-size:9px">krunker</span></div>
      <div id="re-rows"></div>
      <div style="margin-top:7px;display:flex;gap:4px;flex-wrap:wrap">
        <button class="rb" data-f="aim">AIM</button><button class="rb" data-f="fly">FLY</button>
        <button class="rb" data-f="god">GOD</button><button class="rb" data-f="hp">HP+50</button>
        <button class="rb" data-f="tp">TP FWD</button><button class="rb" data-f="up">TP UP</button></div>
      <div class="st" id="re-st">Ctrl+Shift: G aim · B fly · N god</div>`;
    document.body.appendChild(m);
    m.querySelectorAll('.rb').forEach((b) => b.addEventListener('click', () => act(b.dataset.f)));
    upd();
  };
  function act(f) {
    if (f === 'hp') {
      if (R.found.hp == null) return flash('HP offset not found — take damage once');
      R.hpMax += 50; R.setFeat('god', true); flash('HP set to ' + R.hpMax);
    } else if (f === 'tp') flash(R.teleport(40, 0));
    else if (f === 'up') flash(R.teleport(0, 30));
    else R.setFeat(f, !R.feat[f]);
    upd();
  }
  let flashT = null;
  function flash(m) { const el = document.getElementById('re-st'); if (!el) return; el.textContent = m; clearTimeout(flashT); flashT = setTimeout(() => upd(), 3000); }
  function upd() {
    const rows = document.getElementById('re-rows');
    if (!rows) return;
    const f = R.found, s = R.status;
    const d = (ok) => (ok ? '<span class="ok">●</span>' : '<span class="no">○</span>');
    rows.innerHTML =
      `<div>${s.mem}</div><div>${s.match}</div>` +
      `<div>pos ${d(f.pos != null)} ${s.pos}${f.pos != null && f.y !== f.pos + 1 ? ' (y realigned)' : ''}</div>` +
      `<div>view ${d(f.view != null)} ${s.view}</div>` +
      `<div>hp ${d(f.hp != null)} ${s.hp}</div>` +
      `<div>enemies <b style="color:#e2e8f0">${f.enemies.length}</b></div>` +
      `<div>aim ${d(!!R.aim.calib)} ${s.aim}${R.aim.target ? ' · ' + R.aim.target.dist + 'm ' + R.aim.target.err + '°' : ''}</div>` +
      `<div>feats <b style="color:#f59e0b">${Object.entries(R.feat).filter(([, v]) => v).map(([k]) => k.toUpperCase()).join(' ') || '—'}</b></div>`;
    setTimeout(upd, 800);
  }
  mk();
  setInterval(() => { if (inMatch()) R.status.match = 'in match'; }, 1000);
  say('payload ready');
})();

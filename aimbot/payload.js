// Aimbot payload — injected into the game page before its scripts run.
// Waits for window.__RE_GAME__ (exposed by the bundle patch in start.mjs),
// then aims the camera at the nearest bot head inside a cone and auto-fires.
(() => {
  if (window.__RE_BOT__) return;
  window.__RE_BOT__ = 1;
  const S = (window.__RE_BOT_STATE__ = {
    frames: 0, target: null, aimOn: true, fireOn: true,
  });
  window.__RE_BOT_ERR__ = null;

  const CONE = (40 * Math.PI) / 180;   // acquisition cone
  const SMOOTH = 0.45;                 // per-frame lerp toward target
  const MAX_DIST = 180;
  const FIRE_ERR = (2.5 * Math.PI) / 180; // post-aim error allowed to fire
  const HEAD_FALLBACK_Y = 1.5;

  // --- status HUD ---
  const hud = document.createElement('div');
  hud.style.cssText =
    'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:2147483647;' +
    'font:700 12px/1.4 ui-monospace,Menlo,monospace;color:#fbbf24;background:rgba(15,18,25,.94);' +
    'border:2px solid #2b3245;padding:4px 10px;pointer-events:none;letter-spacing:.5px';
  hud.textContent = 'AIMBOT [G] ON · FIRE [H] ON';
  let hudMounted = false;
  const mountHud = () => {
    if (hudMounted || !document.body) return;
    document.body.appendChild(hud);
    hudMounted = true;
  };

  addEventListener('keydown', (e) => {
    if (e.code === 'KeyG') { S.aimOn = !S.aimOn; }
    else if (e.code === 'KeyH') { S.fireOn = !S.fireOn; }
    else return;
    hud.textContent =
      `AIMBOT [G] ${S.aimOn ? 'ON' : 'OFF'} · FIRE [H] ${S.fireOn ? 'ON' : 'OFF'}` +
      (S.target ? ` · ${S.target.name} ${S.target.dist}m` : '');
  });

  // --- helpers ---
  const findHead = (o) => {
    if (o.userData && o.userData.isHead) return o;
    const ch = o.children;
    for (let i = 0; i < ch.length; i++) {
      const r = findHead(ch[i]);
      if (r) return r;
    }
    return null;
  };
  const wrapPi = (a) => {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
  };

  function step() {
    S.frames++;
    mountHud();
    const g = window.__RE_GAME__;
    if (!g) { S.target = null; return; }
    if (!document.body || document.body.dataset.state !== 'playing') { S.target = null; return; }
    let le = 0;
    try { le = g.le || 0; } catch (e) { /* respawn getter unavailable */ }
    if (le > 0) { S.target = null; return; }

    let F, p, Ae;
    try { F = g.F; p = g.p; Ae = g.Ae; } catch (e) { window.__RE_BOT_ERR__ = String(e); return; }
    if (!F || !p || !p.matrixWorld || !Ae || !Ae.length) { S.target = null; return; }

    const m = p.matrixWorld.elements;
    const ex = m[12], ey = m[13], ez = m[14];
    const cp = Math.cos(F.pitch);
    const fx = -Math.sin(F.yaw) * cp, fy = Math.sin(F.pitch), fz = -Math.cos(F.yaw) * cp;

    let best = null, bestErr = Infinity, bx = 0, by = 0, bz = 0, bd = 0;
    for (let i = 0; i < Ae.length; i++) {
      const a = Ae[i];
      if (!a || !(a.hp > 0) || a.respawnTimer > 0) continue;
      const root = a.rig && a.rig.root;
      if (!root || root.visible === false) continue;
      if (a.__botHead === undefined) {
        try { a.__botHead = findHead(root); } catch (e) { a.__botHead = null; }
      }
      let hx, hy, hz;
      const h = a.__botHead;
      if (h && h.matrixWorld) {
        const hm = h.matrixWorld.elements;
        hx = hm[12]; hy = hm[13]; hz = hm[14];
      } else {
        hx = root.position.x; hy = root.position.y + HEAD_FALLBACK_Y; hz = root.position.z;
      }
      const dx = hx - ex, dy = hy - ey, dz = hz - ez;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < 0.5 || d > MAX_DIST) continue;
      const dot = (dx * fx + dy * fy + dz * fz) / d;
      const ang = Math.acos(Math.max(-1, Math.min(1, dot)));
      if (ang > CONE || ang >= bestErr) continue;
      bestErr = ang; best = a; bx = dx; by = dy; bz = dz; bd = d;
    }
    if (!best) {
      S.target = null;
      if (hudMounted && hud.textContent.indexOf('AIMBOT') === 0) {
        hud.textContent = `AIMBOT [G] ${S.aimOn ? 'ON' : 'OFF'} · FIRE [H] ${S.fireOn ? 'ON' : 'OFF'}`;
      }
      return;
    }

    const dPitch = Math.asin(Math.max(-1, Math.min(1, by / bd)));
    const dYaw = Math.atan2(-bx, -bz);
    if (S.aimOn) {
      F.yaw += wrapPi(dYaw - F.yaw) * SMOOTH;
      F.pitch = Math.max(-Math.PI / 2.08, Math.min(Math.PI / 2.08, F.pitch + (dPitch - F.pitch) * SMOOTH));
    }

    const cp2 = Math.cos(F.pitch);
    const fx2 = -Math.sin(F.yaw) * cp2, fy2 = Math.sin(F.pitch), fz2 = -Math.cos(F.yaw) * cp2;
    const dot2 = (bx * fx2 + by * fy2 + bz * fz2) / bd;
    const err2 = Math.acos(Math.max(-1, Math.min(1, dot2)));
    S.target = {
      name: best.name || best.id || 'bot',
      err: +((err2 * 180) / Math.PI).toFixed(1),
      dist: +bd.toFixed(0),
    };
    if (hudMounted) {
      hud.textContent =
        `AIMBOT [G] ${S.aimOn ? 'ON' : 'OFF'} · FIRE [H] ${S.fireOn ? 'ON' : 'OFF'}` +
        ` · ${S.target.name} ${S.target.dist}m ${S.target.err}°`;
    }

    if (S.aimOn && S.fireOn && err2 < FIRE_ERR) {
      try {
        const ce = g.ce, ae = g.ae, le2 = g.le, We = g.We;
        if (ce <= 0 && !ae && !(le2 > 0) && typeof We === 'function') We();
      } catch (e) { /* fire getters unavailable */ }
    }
  }

  const tick = () => {
    try { step(); } catch (e) { window.__RE_BOT_ERR__ = String((e && e.stack) || e); }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();

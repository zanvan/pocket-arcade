import { COLS, ROWH, LOSE_ROW, levelSpec, generate, cellPos, cells, colorsOn, place, dropRow, isCleared, reachedDanger, aimDir, trajectory, scoreFor } from '../logic/bubbles.js';
import { rng, randInt } from '../logic/rng.js';
import { t, addHebrew } from '../core/i18n.js';
import he from '../i18n/he/bubbles.js';
import { el, surface, loop, rrect, shade, ease, fmt, Floaters, levelBar, ICONS } from '../core/ui.js';

addHebrew(he);

// Each color also has its own symbol, so the game can be played without telling colors apart.
const COLORS = ['#ff4d4d', '#4a7dff', '#ffe14a', '#3ed36b', '#b565ff', '#ff9f1a', '#2ee0e0'];
const SYMBOLS = ['triangle', 'ring', 'cross', 'square', 'star', 'diamond', 'plus'];
const LINE_SYMBOLS = new Set(['ring', 'cross', 'plus']);

const SX = COLS / 2;                         // shooter position, in bubble units
const SY = LOSE_ROW * ROWH + 2;
const NEXT = { x: 1.3, y: SY - 0.15 };       // the waiting bubble; tap it to swap
const LINE_Y = (LOSE_ROW - 1) * ROWH + 1;    // bottom of the last legal row: only losing bubbles cross it
const TOTAL_H = SY + 0.9;
const SPEED = 26;                            // bubbles per second

function drawSymbol(g, kind, cx, cy, u) {
  g.save();
  g.translate(cx, cy);
  g.lineJoin = g.lineCap = 'round';
  g.beginPath();
  if (kind === 'ring') g.arc(0, 0, u * 0.8, 0, Math.PI * 2);
  else if (kind === 'triangle') { g.moveTo(0, -u); g.lineTo(u * 0.95, u * 0.7); g.lineTo(-u * 0.95, u * 0.7); g.closePath(); }
  else if (kind === 'square') g.rect(-u * 0.75, -u * 0.75, u * 1.5, u * 1.5);
  else if (kind === 'diamond') { g.moveTo(0, -u * 1.15); g.lineTo(u * 0.8, 0); g.lineTo(0, u * 1.15); g.lineTo(-u * 0.8, 0); g.closePath(); }
  else if (kind === 'cross') { g.moveTo(-u * 0.75, -u * 0.75); g.lineTo(u * 0.75, u * 0.75); g.moveTo(u * 0.75, -u * 0.75); g.lineTo(-u * 0.75, u * 0.75); }
  else if (kind === 'plus') { g.moveTo(-u * 0.9, 0); g.lineTo(u * 0.9, 0); g.moveTo(0, -u * 0.9); g.lineTo(0, u * 0.9); }
  else {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? u * 0.45 : u * 1.1;
      g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
  }
  if (LINE_SYMBOLS.has(kind)) {
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = u * 0.7; g.stroke();
    g.strokeStyle = '#ffffff'; g.lineWidth = u * 0.38; g.stroke();
  } else {
    g.fillStyle = '#ffffff'; g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = u * 0.22; g.stroke();
  }
  g.restore();
}

export default {
  id: 'bubbles',
  get title() { return t('Bubble Shooter'); },
  icon: `<svg viewBox="0 0 64 64"><rect x="6" y="6" width="52" height="52" rx="14" fill="#232a44"/>
    <g stroke="rgba(0,0,0,.25)" stroke-width="1.5"><circle cx="19" cy="19" r="7.5" fill="#ff4d4d"/><circle cx="34" cy="19" r="7.5" fill="#ff4d4d"/><circle cx="49" cy="19" r="7.5" fill="#4a7dff"/>
    <circle cx="26.5" cy="31.5" r="7.5" fill="#3ed36b"/><circle cx="41.5" cy="31.5" r="7.5" fill="#ffe14a"/><circle cx="32" cy="49" r="7" fill="#b565ff"/></g>
    <circle cx="17" cy="16.5" r="2.2" fill="#fff" opacity=".5"/><circle cx="24.5" cy="29" r="2.2" fill="#fff" opacity=".5"/></svg>`,
  info: (store) => t('Level {n}', { n: store.get('bubbles.level', 1) }),
  get help() {
    return t(`<ul><li><b>Drag</b> to aim, then let go to shoot. Tap the small bubble to swap.</li>
    <li>Match <b>3 or more</b> of one color to pop them. Bubbles left hanging fall.</li>
    <li>Every miss counts down <b>Drop in</b>. At zero the ceiling drops one row.</li>
    <li>Clear the board to win. Keep the bubbles above the red line.</li></ul>`);
  },

  mount(root, app) {
    let level = app.store.get('bubbles.level', 1);
    let maxLevel = Math.max(level, app.store.get('bubbles.max', 1));
    let grid, spec, rand, cur, next;
    let missesLeft, drops, score, best, state;   // state: 'play' | 'won' | 'lost'
    let shot = null;       // { color, path, cell, len, s }
    let aim = null;        // { id, dir, tr }
    let pops = [], falls = [];
    let dropK = 0;         // 1 -> 0 while the new row slides in
    let epoch = 0;         // changes with every new level, so a late modal can tell it is stale
    let paused = false;
    let destroyed = false;
    const floaters = new Floaters();

    const bar = levelBar(root, {
      onPrev: () => { if (level > 1) loadLevel(level - 1); },
      onNext: () => { if (level < maxLevel) loadLevel(level + 1); },
    });
    const hud = el('div', 'hud');
    hud.innerHTML = `<div class="chip"><span class="k">${t('Score')}</span><span class="v" data-s>0</span></div>
      <div class="chip"><span class="k">${t('Best')}</span><span class="v" data-b>0</span></div>
      <div class="chip"><span class="k">${t('Drop in')}</span><span class="v" data-d>0</span></div>`;
    const stage = el('div', 'stage');
    root.append(hud, stage);
    const hudS = hud.querySelector('[data-s]');
    const hudB = hud.querySelector('[data-b]');
    const hudD = hud.querySelector('[data-d]');
    app.action(ICONS.restart, t('Restart level'), () => loadLevel(level));

    let L = {};
    let sprites = new Map();
    const s = surface(stage, () => { layout(); draw(); });

    function layout() {
      const d = Math.floor(Math.max(10, Math.min((s.w - 8) / COLS, (s.h - 22) / TOTAL_H)));
      L = { d, ox: Math.round((s.w - d * COLS) / 2), oy: Math.round(Math.max(12, (s.h - d * TOTAL_H) / 2)) };
      sprites = new Map();
    }

    // ---------- state ----------
    function pick() {
      const cs = colorsOn(grid);
      return cs[randInt(rand, cs.length)];
    }

    // The shooter only offers colors that are still on the board.
    function refreshShooter() {
      const cs = colorsOn(grid);
      if (!cs.length) return;
      if (!cs.includes(cur)) cur = pick();
      if (!cs.includes(next)) next = pick();
    }

    // best score per level, one map: { "3": 420, ... }
    function bestMap() {
      const m = app.store.get('bubbles.best', {});
      return m && typeof m === 'object' ? m : {};
    }

    function loadLevel(n) {
      level = n;
      maxLevel = Math.max(maxLevel, level);
      app.store.set('bubbles.level', level);
      app.store.set('bubbles.max', maxLevel);
      epoch++;
      grid = generate(level);
      spec = levelSpec(level);
      rand = rng(level * 40503 + 11);
      cur = pick();
      next = pick();
      missesLeft = spec.k;
      drops = 0;
      score = 0;
      best = bestMap()[level] || 0;
      state = 'play';
      shot = null; aim = null; pops = []; falls = []; dropK = 0;
      floaters.items = [];
      bar.set(level, maxLevel);
      updateHud();
      layout();
      draw();
    }

    function updateHud() {
      hudS.textContent = fmt(score);
      hudB.textContent = fmt(Math.max(best, score));
      hudD.textContent = missesLeft;
      hudD.style.color = missesLeft === 1 ? '#ff9f40' : '';
    }

    // ---------- shooting ----------
    function fire(dir) {
      const tr = trajectory(grid, SX, SY, dir.dx, dir.dy);
      if (!tr.cell) return;
      let len = 0;
      for (let i = 1; i < tr.path.length; i++) len += Math.hypot(tr.path[i].x - tr.path[i - 1].x, tr.path[i].y - tr.path[i - 1].y);
      shot = { color: cur, path: tr.path, cell: tr.cell, len, s: 0 };
      cur = next;
      next = pick();
      app.sfx('rotate');
      app.haptic(8);
      ticker.kick();
    }

    function shotPos() {
      let left = shot.s;
      const p = shot.path;
      for (let i = 1; i < p.length; i++) {
        const seg = Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
        if (left <= seg && seg > 0) {
          const k = left / seg;
          return { x: p[i - 1].x + (p[i].x - p[i - 1].x) * k, y: p[i - 1].y + (p[i].y - p[i - 1].y) * k };
        }
        left -= seg;
      }
      return p[p.length - 1];
    }

    function land() {
      const { r, c } = shot.cell;
      const color = shot.color;
      shot = null;
      const res = place(grid, r, c, color);
      if (res.popped.length) {
        const gained = scoreFor(res.popped.length, res.fell.length);
        score += gained;
        const at = cellPos(grid, r, c);
        res.popped.forEach((b) => {
          const p = cellPos(grid, b.r, b.c);
          pops.push({ x: p.x, y: p.y, color: b.color, t: 0, delay: Math.min(0.12, (Math.abs(p.x - at.x) + Math.abs(p.y - at.y)) * 0.03) });
        });
        res.fell.forEach((b) => {
          const p = cellPos(grid, b.r, b.c);
          falls.push({ x: p.x, y: p.y, vx: (Math.random() - 0.5) * 3, vy: -2 - Math.random() * 3, color: b.color });
        });
        const popPts = scoreFor(res.popped.length, 0);
        floaters.add('+' + popPts, L.ox + at.x * L.d, L.oy + at.y * L.d, '#ffd23f', Math.round(L.d * 0.62));
        if (res.fell.length) {
          const fy = res.fell.reduce((a, b) => a + cellPos(grid, b.r, b.c).y, 0) / res.fell.length;
          floaters.add('+' + (gained - popPts), s.w / 2, L.oy + fy * L.d, '#4cd9a0', Math.round(L.d * 0.72));
        }
        app.sfx(res.popped.length + res.fell.length >= 6 ? 'big' : 'clear');
        app.haptic(res.fell.length ? 35 : 20);
      } else {
        app.sfx('place');
        app.haptic(8);
        if (--missesLeft <= 0) {
          dropRow(grid, level, ++drops);
          missesLeft = spec.k;
          dropK = 1;
          app.sfx('drop');
          app.haptic(30);
        }
      }
      if (score > best) { best = score; app.store.set('bubbles.best', { ...bestMap(), [level]: best }); }
      refreshShooter();
      updateHud();
      if (isCleared(grid)) finish(true);
      else if (reachedDanger(grid)) finish(false);
      else if (aim) aimAt(aim.p);   // the finger is still down: show the guide on the new board
    }

    function finish(won) {
      state = won ? 'won' : 'lost';
      aim = null;
      if (won) {
        maxLevel = Math.max(maxLevel, level + 1);
        app.store.set('bubbles.max', maxLevel);
        bar.set(level, maxLevel);
      }
      app.sfx(won ? 'win' : 'lose');
      app.haptic(won ? 40 : 60);
      const mine = epoch;
      setTimeout(async () => {
        if (destroyed || mine !== epoch) return;
        const summary = `<div class="big">${fmt(score)}</div><p style="text-align:center">${t('Best {n}', { n: fmt(best) })}</p>`;
        if (won) {
          const v = await app.modal({
            title: t('Level {n} done!', { n: level }),
            html: summary,
            buttons: [{ label: t('Replay'), value: 'replay' }, { label: t('Next level'), value: 'next', primary: true }],
            dismissable: false,
          });
          if (destroyed || mine !== epoch) return;
          loadLevel(v === 'replay' ? level : level + 1);
        } else {
          await app.modal({
            title: t('Game over'),
            html: `<p style="text-align:center">${t('The bubbles crossed the red line.')}</p>${summary}`,
            buttons: [{ label: t('Try again'), value: 'again', primary: true }],
            dismissable: false,
          });
          if (destroyed || mine !== epoch) return;
          loadLevel(level);
        }
      }, 800);
    }

    function swap() {
      [cur, next] = [next, cur];
      app.sfx('select');
      app.haptic(6);
      draw();
    }

    // ---------- input ----------
    const unit = (e) => {
      const p = s.point(e);
      return { x: (p.x - L.ox) / L.d, y: (p.y - L.oy) / L.d };
    };

    function aimAt(p) {
      aim.p = p;   // kept so the guide can be redrawn when a landing changes the board
      if (p.y < SY - 0.8) {
        const dir = aimDir(SX, SY, p.x, p.y);
        aim.dir = dir;
        aim.tr = trajectory(grid, SX, SY, dir.dx, dir.dy, { maxBounces: 1 });
      } else {
        aim.dir = null;   // a finger at or below the shooter cancels the shot
        aim.tr = null;
      }
      draw();
    }

    s.canvas.addEventListener('pointerdown', (e) => {
      if (state !== 'play' || paused || !L.d) return;
      const p = unit(e);
      // a second finger (never primary) leaves the first finger's aim alone
      if (aim && e.pointerId !== aim.id && !e.isPrimary) return;
      if (Math.hypot(p.x - NEXT.x, p.y - NEXT.y) < 0.65) { swap(); return; }
      try { s.canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      // a new press replaces an aim whose pointerup never came; aiming may start while a shot flies
      aim = { id: e.pointerId, dir: null, tr: null, p: null };
      aimAt(p);
    });
    s.canvas.addEventListener('pointermove', (e) => {
      if (!aim || e.pointerId !== aim.id) return;
      aimAt(unit(e));
    });
    s.canvas.addEventListener('pointerup', (e) => {
      if (!aim || e.pointerId !== aim.id) return;
      const dir = aim.dir;
      aim = null;
      if (dir && state === 'play' && !shot && !paused) fire(dir);
      else draw();
    });
    const dropAim = (e) => {
      if (!aim || e.pointerId !== aim.id) return;
      aim = null;
      draw();
    };
    s.canvas.addEventListener('pointercancel', dropAim);
    s.canvas.addEventListener('lostpointercapture', dropAim);

    // ---------- drawing ----------
    function sprite(color) {
      const d = L.d;
      let c = sprites.get(color);
      if (c) return c;
      const px = Math.max(1, Math.round(d * s.dpr));
      c = document.createElement('canvas');
      c.width = c.height = px;
      const g = c.getContext('2d');
      g.scale(s.dpr, s.dpr);
      const base = COLORS[color - 1];
      const R = d / 2 - 0.6;
      const grad = g.createRadialGradient(d * 0.38, d * 0.32, d * 0.04, d / 2, d / 2, R);
      grad.addColorStop(0, shade(base, 0.5));
      grad.addColorStop(0.45, base);
      grad.addColorStop(1, shade(base, -0.28));
      g.beginPath();
      g.arc(d / 2, d / 2, R, 0, Math.PI * 2);
      g.fillStyle = grad;
      g.fill();
      g.strokeStyle = shade(base, -0.45);
      g.lineWidth = 1.2;
      g.stroke();
      g.beginPath();
      g.ellipse(d * 0.34, d * 0.26, d * 0.13, d * 0.08, -0.6, 0, Math.PI * 2);
      g.fillStyle = 'rgba(255,255,255,0.4)';
      g.fill();
      drawSymbol(g, SYMBOLS[color - 1], d / 2, d * 0.54, d * 0.17);
      sprites.set(color, c);
      return c;
    }

    // x, y in bubble units; scale and alpha for popping, falling and the waiting bubble
    function bubble(color, x, y, scale = 1, alpha = 1) {
      const { ctx } = s;
      const size = L.d * scale;
      if (alpha !== 1) ctx.globalAlpha = alpha;
      ctx.drawImage(sprite(color), L.ox + x * L.d - size / 2, L.oy + y * L.d - size / 2, size, size);
      if (alpha !== 1) ctx.globalAlpha = 1;
    }

    function guideDots(path, step) {
      const out = [];
      let want = 0.9;
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1], b = path[i];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        let at = want;
        for (; at <= len; at += step) out.push({ x: a.x + ((b.x - a.x) * at) / len, y: a.y + ((b.y - a.y) * at) / len });
        want = at - len;
      }
      return out;
    }

    function draw() {
      const { ctx } = s;
      s.begin();
      if (!L.d) return;
      const { d, ox, oy } = L;
      const X = (x) => ox + x * d, Y = (y) => oy + y * d;

      // play field, ceiling and the danger line
      rrect(ctx, ox - 4, oy - 10, COLS * d + 8, TOTAL_H * d + 14, 14);
      ctx.fillStyle = '#0c0e15';
      ctx.fill();
      ctx.strokeStyle = '#2b3150';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#2b3150';
      rrect(ctx, ox - 4, oy - 10, COLS * d + 8, 10, 5);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,93,108,0.6)';
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 6]);
      ctx.beginPath();
      ctx.moveTo(ox, Y(LINE_Y));
      ctx.lineTo(ox + COLS * d, Y(LINE_Y));
      ctx.stroke();
      ctx.setLineDash([]);

      // the grid, clipped so a new row slides out from under the ceiling
      ctx.save();
      ctx.beginPath();
      ctx.rect(ox, oy, COLS * d, TOTAL_H * d);
      ctx.clip();
      const slide = -ROWH * ease.out(dropK);
      for (const b of cells(grid)) {
        const p = cellPos(grid, b.r, b.c);
        bubble(b.color, p.x, p.y + slide);
      }
      for (const f of pops) {
        const k = f.t - f.delay;
        if (k < 0) { bubble(f.color, f.x, f.y + slide); continue; }
        const q = Math.min(1, k / 0.22);
        bubble(f.color, f.x, f.y + slide, 1 + 0.4 * q, 1 - q);
      }
      for (const f of falls) bubble(f.color, f.x, f.y, 1, 1);
      ctx.restore();

      // aim guide: dots along the path (one bounce) and a ghost where the bubble would settle
      if (aim && aim.dir && aim.tr) {
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        for (const p of guideDots(aim.tr.path, 0.48)) {
          ctx.beginPath();
          ctx.arc(X(p.x), Y(p.y), Math.max(1.5, d * 0.055), 0, Math.PI * 2);
          ctx.fill();
        }
        if (aim.tr.cell) {
          const g = cellPos(grid, aim.tr.cell.r, aim.tr.cell.c);
          bubble(cur, g.x, g.y, 1, 0.3);
        }
      }

      // shooter: barrel, base, loaded bubble
      const dir = aim && aim.dir ? aim.dir : { dx: 0, dy: -1 };
      ctx.save();
      ctx.translate(X(SX), Y(SY));
      ctx.rotate(Math.atan2(dir.dx, -dir.dy));
      rrect(ctx, -d * 0.2, -d * 1.1, d * 0.4, d * 0.9, d * 0.12);
      ctx.fillStyle = '#3a4268';
      ctx.fill();
      ctx.restore();
      ctx.beginPath();
      ctx.arc(X(SX), Y(SY), d * 0.62, 0, Math.PI * 2);
      ctx.fillStyle = '#171b2a';
      ctx.fill();
      ctx.strokeStyle = '#3a4268';
      ctx.lineWidth = 2;
      ctx.stroke();
      if (cur) bubble(cur, SX, SY);

      // the waiting bubble, with a swap sign
      ctx.beginPath();
      ctx.arc(X(NEXT.x), Y(NEXT.y), d * 0.5, 0, Math.PI * 2);
      ctx.strokeStyle = '#3a4268';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      if (next) bubble(next, NEXT.x, NEXT.y, 0.78);
      swapSign(ctx, X(NEXT.x), Y(NEXT.y + 0.78), d * 0.2);

      // misses left before the ceiling drops
      for (let i = 0; i < spec.k; i++) {
        ctx.beginPath();
        ctx.arc(X(COLS - 0.9 - (spec.k - 1 - i) * 0.42), Y(SY), d * 0.12, 0, Math.PI * 2);
        ctx.fillStyle = i < missesLeft ? (missesLeft === 1 ? '#ff9f40' : '#8b93b0') : '#2b3150';
        ctx.fill();
      }

      // the flying bubble
      if (shot) {
        const p = shotPos();
        bubble(shot.color, p.x, p.y);
      }
      floaters.draw(ctx);
    }

    function swapSign(ctx, x, y, u) {
      ctx.strokeStyle = '#8b93b0';
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x - u, y - u * 0.4); ctx.lineTo(x + u, y - u * 0.4);
      ctx.moveTo(x + u * 0.5, y - u * 0.9); ctx.lineTo(x + u, y - u * 0.4); ctx.lineTo(x + u * 0.5, y + u * 0.1);
      ctx.moveTo(x + u, y + u * 0.4); ctx.lineTo(x - u, y + u * 0.4);
      ctx.moveTo(x - u * 0.5, y - u * 0.1); ctx.lineTo(x - u, y + u * 0.4); ctx.lineTo(x - u * 0.5, y + u * 0.9);
      ctx.stroke();
    }

    // ---------- animation ----------
    const ticker = loop((dt) => {
      if (destroyed || paused) return false;
      let busy = false;
      if (shot) {
        shot.s += SPEED * dt;
        if (shot.s >= shot.len) land();
        busy = true;
      }
      for (const f of pops) f.t += dt;
      pops = pops.filter((f) => f.t - f.delay < 0.22);
      for (const f of falls) { f.vy += 48 * dt; f.x += f.vx * dt; f.y += f.vy * dt; }
      falls = falls.filter((f) => f.y < TOTAL_H + 1);
      if (dropK > 0) dropK = Math.max(0, dropK - dt * 4);
      const text = floaters.update(dt);
      draw();
      return busy || pops.length > 0 || falls.length > 0 || dropK > 0 || text;
    });

    loadLevel(level);

    return {
      // Only the help dialog (hard) blocks play; a hidden tab just drops the aim.
      pause(hard) { aim = null; if (hard) paused = true; draw(); },
      resume() { paused = false; ticker.kick(); },
      destroy() {
        destroyed = true;
        ticker.stop();
        s.destroy();
      },
    };
  },
};

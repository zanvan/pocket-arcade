import { Tetris, PIECES, W, H, HIDDEN, CLEAR_TIME } from '../logic/tetris.js';
import { t, addHebrew } from '../core/i18n.js';
import he from '../i18n/he/tetris.js';
import { el, surface, loop, drawBlock, rrect, fmt, ICONS, Floaters } from '../core/ui.js';

addHebrew(he);

const COLORS = { I: '#3cc7f5', O: '#ffd23f', T: '#b36cf7', S: '#4cd964', Z: '#ff5a5f', J: '#4a7dff', L: '#ff9f40' };
const DAS = 0.16;   // delay before a held button repeats
const ARR = 0.045;  // repeat interval

export default {
  id: 'blocks',
  get title() { return t('Falling Blocks'); },
  icon: `<svg viewBox="0 0 64 64"><rect x="6" y="6" width="52" height="52" rx="14" fill="#232a44"/>
    <g stroke="rgba(0,0,0,.25)" stroke-width="1.5"><rect x="14" y="34" width="9" height="9" rx="2" fill="#4a7dff"/><rect x="14" y="43" width="9" height="9" rx="2" fill="#4a7dff"/><rect x="23" y="43" width="9" height="9" rx="2" fill="#4a7dff"/><rect x="32" y="43" width="9" height="9" rx="2" fill="#ff9f40"/><rect x="41" y="43" width="9" height="9" rx="2" fill="#ff9f40"/><rect x="41" y="34" width="9" height="9" rx="2" fill="#ff9f40"/><rect x="27" y="12" width="9" height="9" rx="2" fill="#b36cf7"/><rect x="18" y="21" width="9" height="9" rx="2" fill="#b36cf7"/><rect x="27" y="21" width="9" height="9" rx="2" fill="#b36cf7"/><rect x="36" y="21" width="9" height="9" rx="2" fill="#b36cf7"/></g></svg>`,
  info: (store) => { const b = store.get('blocks.best', 0); return b ? t('Best {n}', { n: fmt(b) }) : t('Classic falling blocks'); },
  get help() {
    return t(`<ul>
    <li><b>Drag</b> left or right on the board to move.</li>
    <li><b>Tap</b> the board to rotate.</li>
    <li><b>Drag down</b> to drop faster, <b>flick down</b> to drop at once.</li>
    <li><b>Flick up</b> or tap the HOLD box to keep a piece for later.</li>
    <li>The buttons below do the same things.</li></ul>`);
  },

  mount(root, app) {
    const game = new Tetris();
    let best = app.store.get('blocks.best', 0);
    let paused = false;
    let pauseClose = null;
    let softHeld = false;
    let destroyed = false;
    const floaters = new Floaters();
    let shakeT = 0;

    const hud = el('div', 'hud');
    hud.innerHTML = `<div class="chip wide"><span class="k">${t('Score')}</span><span class="v" data-s>0</span></div>
      <div class="chip"><span class="k">${t('Level')}</span><span class="v" data-l>1</span></div>
      <div class="chip"><span class="k">${t('Lines')}</span><span class="v" data-n>0</span></div>`;
    const stage = el('div', 'stage');
    const pad = el('div', 'padbar');
    root.append(hud, stage, pad);
    const hudS = hud.querySelector('[data-s]');
    const hudL = hud.querySelector('[data-l]');
    const hudN = hud.querySelector('[data-n]');

    let L = {};
    const s = surface(stage, () => { layout(); draw(); });

    function layout() {
      const cell = Math.max(8, Math.floor(Math.min((s.h - 8) / 20, (s.w - 16) / 14.1)));
      const boardW = cell * 10;
      const gap = Math.round(cell * 0.35);
      const sideW = Math.round(cell * 3.6);
      const bx = Math.round((s.w - (boardW + gap + sideW)) / 2);
      const by = Math.round((s.h - cell * 20) / 2);
      const sx = bx + boardW + gap;
      L = { cell, bx, by, sx, sideW, hold: { x: sx, y: by + cell * 0.9, w: sideW, h: cell * 2.6 } };
    }

    // ---------- drawing ----------
    function drawMini(type, x, y, w, h, mini, alpha = 1) {
      const cells = PIECES[type].states[0];
      const xs = cells.map((c) => c[0]);
      const ys = cells.map((c) => c[1]);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      const pw = (maxX - minX + 1) * mini;
      const ph = (maxY - minY + 1) * mini;
      const ox = x + (w - pw) / 2 - minX * mini;
      const oy = y + (h - ph) / 2 - minY * mini;
      for (const [cx, cy] of cells) drawBlock(s.ctx, COLORS[type], ox + cx * mini, oy + cy * mini, mini, s.dpr, alpha);
    }

    function draw() {
      const { ctx } = s;
      s.begin();
      if (!L.cell) return;
      const { cell, bx, by, sx, sideW } = L;
      let ox = 0;
      if (shakeT > 0) ox = Math.sin(shakeT * 60) * shakeT * 10;
      ctx.save();
      ctx.translate(ox, 0);

      // board
      rrect(ctx, bx - 4, by - 4, cell * 10 + 8, cell * 20 + 8, 10);
      ctx.fillStyle = '#0c0e15';
      ctx.fill();
      ctx.strokeStyle = '#2b3150';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.045)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 1; x < W; x++) { ctx.moveTo(bx + x * cell + 0.5, by); ctx.lineTo(bx + x * cell + 0.5, by + cell * 20); }
      for (let y = 1; y < 20; y++) { ctx.moveTo(bx, by + y * cell + 0.5); ctx.lineTo(bx + cell * 10, by + y * cell + 0.5); }
      ctx.stroke();

      ctx.save();
      ctx.beginPath();
      ctx.rect(bx, by, cell * 10, cell * 20);
      ctx.clip();

      const clearing = game.clearing ? new Set(game.clearing.rows) : null;
      const k = game.clearing ? Math.max(0, game.clearing.t / CLEAR_TIME) : 1;
      for (let y = HIDDEN; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const type = game.board[y][x];
          if (!type) continue;
          const px = bx + x * cell;
          const py = by + (y - HIDDEN) * cell;
          if (clearing && clearing.has(y)) {
            const sz = cell * k;
            drawBlock(ctx, COLORS[type], px + (cell - sz) / 2, py + (cell - sz) / 2, Math.max(1, sz), s.dpr);
          } else {
            drawBlock(ctx, COLORS[type], px, py, cell, s.dpr);
          }
        }
      }
      if (clearing) {
        ctx.fillStyle = `rgba(255,255,255,${0.75 * k})`;
        for (const y of clearing) ctx.fillRect(bx, by + (y - HIDDEN) * cell, cell * 10, cell);
      }

      if (!game.over && !game.clearing) {
        // ghost
        const gy = game.ghostY();
        const color = COLORS[game.cur.type];
        if (gy !== game.cur.y) {
          ctx.strokeStyle = color;
          ctx.globalAlpha = 0.55;
          ctx.lineWidth = 2;
          for (const [x, y] of game.cells({ ...game.cur, y: gy })) {
            if (y < HIDDEN) continue;
            rrect(ctx, bx + x * cell + 2, by + (y - HIDDEN) * cell + 2, cell - 4, cell - 4, cell * 0.16);
            ctx.stroke();
          }
          ctx.globalAlpha = 0.12;
          ctx.fillStyle = color;
          for (const [x, y] of game.cells({ ...game.cur, y: gy })) {
            if (y < HIDDEN) continue;
            ctx.fillRect(bx + x * cell + 2, by + (y - HIDDEN) * cell + 2, cell - 4, cell - 4);
          }
          ctx.globalAlpha = 1;
        }
        // lock-delay fade hint
        const lockFade = game.grounded() ? 1 - Math.min(1, game.lockTimer / 0.5) * 0.35 : 1;
        for (const [x, y] of game.cells()) {
          if (y < HIDDEN) continue;
          drawBlock(ctx, color, bx + x * cell, by + (y - HIDDEN) * cell, cell, s.dpr, lockFade);
        }
      }
      ctx.restore();

      // side panel
      ctx.fillStyle = '#9ba2b9';
      ctx.font = `700 ${Math.max(10, Math.round(cell * 0.5))}px system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(t('HOLD'), sx + 2, by + cell * 0.4);
      const hb = L.hold;
      rrect(ctx, hb.x, hb.y, hb.w, hb.h, 10);
      ctx.fillStyle = '#1b1f2d';
      ctx.fill();
      ctx.strokeStyle = '#2b3150';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      if (game.hold) drawMini(game.hold, hb.x, hb.y, hb.w, hb.h, cell * 0.62, game.canHold ? 1 : 0.35);

      const ny = by + cell * 4.3;
      ctx.fillStyle = '#9ba2b9';
      ctx.fillText(t('NEXT'), sx + 2, ny);
      const boxH = cell * 2.3;
      rrect(ctx, sx, ny + cell * 0.5, sideW, boxH * 3 + cell * 0.4, 10);
      ctx.fillStyle = '#1b1f2d';
      ctx.fill();
      ctx.strokeStyle = '#2b3150';
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        drawMini(game.queue[i], sx, ny + cell * 0.7 + i * boxH, sideW, boxH, cell * (i === 0 ? 0.62 : 0.5));
      }

      floaters.draw(ctx);
      ctx.restore();

      if (paused && !game.over) {
        ctx.fillStyle = 'rgba(10,12,18,0.6)';
        ctx.fillRect(bx, by, cell * 10, cell * 20);
      }
    }

    function updateHud() {
      hudS.textContent = fmt(game.score);
      hudL.textContent = game.level;
      hudN.textContent = game.lines;
    }

    // ---------- events from the rules ----------
    function handleEvents() {
      for (const e of game.events) {
        if (e === 'lock') { app.sfx('place'); }
        else if (e.startsWith('clear')) {
          const n = +e.slice(5);
          app.sfx(n >= 4 ? 'big' : 'clear');
          app.haptic(n >= 4 ? 40 : 18);
          const label = ['', t('Single'), t('Double'), t('Triple'), t('TETRIS!')][n];
          floaters.add(label, L.bx + L.cell * 5, L.by + (game.clearing.rows[0] - HIDDEN) * L.cell, n >= 4 ? '#ffd23f' : '#fff', Math.round(L.cell * (n >= 4 ? 1.1 : 0.85)));
          if (n >= 4) shakeT = 0.25;
        } else if (e === 'level') { app.sfx('done'); app.toast(t('Level {n}', { n: game.level })); }
        else if (e === 'hold') { app.sfx('select'); }
        else if (e === 'over') { gameOver(); }
      }
      game.events.length = 0;
    }

    async function gameOver() {
      app.sfx('lose');
      app.haptic(60);
      const isBest = game.score > best;
      if (isBest) { best = game.score; app.store.set('blocks.best', best); }
      draw();
      await new Promise((r) => setTimeout(r, 450));
      if (destroyed) return;
      const stats = game.lines === 1
        ? t('Level {level} · 1 line · Best {best}', { level: game.level, best: fmt(best) })
        : t('Level {level} · {lines} lines · Best {best}', { level: game.level, lines: game.lines, best: fmt(best) });
      const v = await app.modal({
        title: isBest && game.score > 0 ? t('New best!') : t('Game over'),
        html: `<div class="big">${fmt(game.score)}</div><p style="text-align:center">${stats}</p>`,
        buttons: [{ label: t('Play again'), value: 'again', primary: true }],
        dismissable: false,
      });
      if (destroyed) return;
      if (v === 'again') restart();
    }

    function restart() {
      game.reset();
      paused = false;
      floaters.items = [];
      updateHud();
      ticker.kick();
    }

    // ---------- main loop ----------
    const ticker = loop((dt) => {
      if (destroyed) return false;
      if (shakeT > 0) shakeT = Math.max(0, shakeT - dt);
      if (!paused && !game.over) {
        tickRepeat(dt);
        game.update(dt, softHeld);
        handleEvents();
      }
      floaters.update(dt);
      updateHud();
      draw();
      return !paused && !game.over || floaters.items.length > 0 || shakeT > 0;
    });

    // ---------- buttons with auto-repeat ----------
    const repeat = { action: null, t: 0, started: false };
    function tickRepeat(dt) {
      if (!repeat.action) return;
      repeat.t += dt;
      if (!repeat.started) {
        if (repeat.t >= DAS) { repeat.started = true; repeat.t = 0; repeat.action(); }
      } else {
        while (repeat.t >= ARR) { repeat.t -= ARR; repeat.action(); }
      }
    }

    function doMove(dx) { if (game.move(dx)) app.sfx('move'); }
    function doRotate(dir) { if (game.rotate(dir)) { app.sfx('rotate'); app.haptic(6); } }
    function doHard() { if (!game.active()) return; game.hardDrop(); app.sfx('drop'); app.haptic(15); handleEvents(); }
    function doHold() { if (game.holdPiece()) handleEvents(); }

    function padButton(icon, label, { press, repeatable = false, hold = false }) {
      const b = el('button', 'padbtn', icon);
      b.setAttribute('aria-label', label);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (paused || game.over) return;
        try { b.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        b.classList.add('held');
        if (hold) softHeld = true;
        press?.();
        if (repeatable) { repeat.action = press; repeat.t = 0; repeat.started = false; }
      });
      const up = () => {
        b.classList.remove('held');
        if (hold) softHeld = false;
        if (repeatable && repeat.action === press) repeat.action = null;
      };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('lostpointercapture', up);
      return b;
    }
    // The pad's left/right buttons must not flip when the page is right-to-left.
    pad.style.direction = 'ltr';
    const left = el('div', 'grp');
    const right = el('div', 'grp');
    left.append(
      padButton(ICONS.left, t('Move left'), { press: () => doMove(-1), repeatable: true }),
      padButton(ICONS.down, t('Soft drop'), { hold: true }),
      padButton(ICONS.right, t('Move right'), { press: () => doMove(1), repeatable: true }),
    );
    right.append(
      padButton(ICONS.rotCCW, t('Rotate left'), { press: () => doRotate(-1) }),
      padButton(ICONS.rotCW, t('Rotate right'), { press: () => doRotate(1) }),
      padButton(ICONS.drop, t('Hard drop'), { press: doHard }),
    );
    pad.append(left, right);

    // ---------- touch gestures on the board ----------
    let g = null;
    s.canvas.addEventListener('pointerdown', (e) => {
      if (paused || game.over || g) return;
      const p = s.point(e);
      const hb = L.hold;
      if (p.x >= hb.x && p.x <= hb.x + hb.w && p.y >= hb.y && p.y <= hb.y + hb.h) { doHold(); return; }
      try { s.canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      g = { id: e.pointerId, x0: p.x, y0: p.y, ax: p.x, ay: p.y, t0: performance.now(), moved: false, dropped: 0, lastY: p.y, lastT: performance.now(), vy: 0 };
    });
    s.canvas.addEventListener('pointermove', (e) => {
      if (!g || e.pointerId !== g.id) return;
      const p = s.point(e);
      const step = L.cell * 0.9;
      const now = performance.now();
      const dtm = Math.max(1, now - g.lastT);
      g.vy = 0.6 * g.vy + 0.4 * ((p.y - g.lastY) / dtm);
      g.lastY = p.y;
      g.lastT = now;
      if (Math.abs(p.x - g.x0) > 8 || Math.abs(p.y - g.y0) > 8) g.moved = true;
      if (g.dropped === 0) {
        while (p.x - g.ax > step) { g.ax += step; doMove(1); }
        while (g.ax - p.x > step) { g.ax -= step; doMove(-1); }
      } else {
        g.ax = p.x;
      }
      // dragging down mostly vertically: soft drop one row per cell
      if (Math.abs(p.y - g.y0) > Math.abs(p.x - g.x0) * 1.2) {
        while (p.y - g.ay > L.cell) { g.ay += L.cell; if (game.softDrop()) g.dropped++; }
      } else {
        g.ay = Math.max(g.ay, p.y); // sideways drift never turns into a drop
      }
    });
    const endGesture = (e) => {
      if (!g || e.pointerId !== g.id) return;
      const p = s.point(e);
      const dt = performance.now() - g.t0;
      const dx = p.x - g.x0;
      const dy = p.y - g.y0;
      if (!g.moved && dt < 300) doRotate(1);
      else if (dy > L.cell * 2 && g.vy > 0.9 && Math.abs(dy) > Math.abs(dx) * 1.5) doHard();
      else if (dy < -L.cell * 2 && Math.abs(dy) > Math.abs(dx) * 1.5 && dt < 400) doHold();
      g = null;
    };
    s.canvas.addEventListener('pointerup', endGesture);
    s.canvas.addEventListener('pointercancel', (e) => { if (g && e.pointerId === g.id) g = null; });

    // ---------- keyboard (handy on a laptop) ----------
    function onKey(e) {
      if (paused || game.over) return;
      const k = e.key;
      if (k === 'ArrowLeft') doMove(-1);
      else if (k === 'ArrowRight') doMove(1);
      else if (k === 'ArrowDown') game.softDrop();
      else if (k === 'ArrowUp' || k === 'x' || k === 'X') doRotate(1);
      else if (k === 'z' || k === 'Z') doRotate(-1);
      else if (k === ' ') doHard();
      else if (k === 'c' || k === 'C' || k === 'Shift') doHold();
      else if (k === 'p' || k === 'Escape') pause();
      else return;
      e.preventDefault();
    }
    window.addEventListener('keydown', onKey);

    // ---------- pause ----------
    async function pause(quiet = false) {
      if (paused || game.over || destroyed) return;
      paused = true;
      softHeld = false;
      repeat.action = null;
      draw();
      if (quiet) return;
      const v = await app.modal({
        title: t('Paused'),
        html: `<p style="text-align:center">${t('Score <b>{score}</b> · Best <b>{best}</b>', { score: fmt(game.score), best: fmt(best) })}</p>`,
        buttons: [{ label: t('Restart'), value: 'restart' }, { label: t('Resume'), value: 'resume', primary: true }],
        onOpen: (_b, close) => { pauseClose = close; },
      });
      pauseClose = null;
      if (destroyed) return;
      if (v === 'restart') restart();
      else resume();
    }
    function resume() {
      if (destroyed) return;
      pauseClose?.('resume');
      if (!paused) return;
      paused = false;
      ticker.kick();
    }

    app.action(ICONS.pause, t('Pause'), () => pause());

    updateHud();
    ticker.kick();

    return {
      pause,
      resume,
      destroy() {
        destroyed = true;
        ticker.stop();
        s.destroy();
        window.removeEventListener('keydown', onKey);
        if (game.score > best) app.store.set('blocks.best', game.score);
      },
    };
  },
};

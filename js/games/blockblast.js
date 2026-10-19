import { N, SHAPES, emptyBoard, canPlace, fitsAnywhere, linesAfter, place, isEmpty, scoreFor, dealPieces } from '../logic/blockblast.js';
import { t, addHebrew } from '../core/i18n.js';
import he from '../i18n/he/blockblast.js';
import { el, surface, loop, drawBlock, rrect, fmt, ease, lerp, Floaters, ICONS } from '../core/ui.js';

addHebrew(he);

const TRAY_SCALE = 0.52;

export default {
  id: 'blast',
  get title() { return t('Block Blast'); },
  icon: `<svg viewBox="0 0 64 64"><rect x="6" y="6" width="52" height="52" rx="14" fill="#232a44"/>
    <g stroke="rgba(0,0,0,.25)" stroke-width="1.5"><rect x="12" y="12" width="10" height="10" rx="2" fill="#ffd23f"/><rect x="22" y="12" width="10" height="10" rx="2" fill="#ffd23f"/><rect x="12" y="22" width="10" height="10" rx="2" fill="#ffd23f"/><rect x="22" y="22" width="10" height="10" rx="2" fill="#ffd23f"/>
    <rect x="12" y="42" width="10" height="10" rx="2" fill="#3cc7f5"/><rect x="22" y="42" width="10" height="10" rx="2" fill="#3cc7f5"/><rect x="32" y="42" width="10" height="10" rx="2" fill="#3cc7f5"/><rect x="42" y="42" width="10" height="10" rx="2" fill="#3cc7f5"/>
    <rect x="42" y="22" width="10" height="10" rx="2" fill="#ff5a5f"/><rect x="42" y="32" width="10" height="10" rx="2" fill="#ff5a5f"/><rect x="32" y="32" width="10" height="10" rx="2" fill="#ff5a5f"/></g></svg>`,
  info: (store) => { const b = store.get('blast.best', 0); return b ? t('Best {n}', { n: fmt(b) }) : t('Fill rows and columns'); },
  get help() {
    return t(`<ul><li><b>Drag</b> a piece onto the board.</li>
    <li>Fill a whole <b>row or column</b> to clear it.</li>
    <li>Clear several at once, or keep clearing move after move, for <b>combo</b> points.</li>
    <li>The game ends when none of your pieces fit.</li></ul>`);
  },

  mount(root, app) {
    let best = app.store.get('blast.best', 0);
    let board, tray, score, combo, sinceClear, over;
    let destroyed = false;
    const floaters = new Floaters();
    let drag = null;      // { i, x, y, t, back?: {...} }
    let pops = [];        // placed cells popping in
    let bursts = [];      // cleared cells fading out
    let overT = 0;

    const hud = el('div', 'hud');
    hud.innerHTML = `<div class="chip wide"><span class="k">${t('Score')}</span><span class="v" data-s>0</span></div>
      <div class="chip wide"><span class="k">${t('Best')}</span><span class="v" data-b>0</span></div>`;
    const stage = el('div', 'stage');
    root.append(hud, stage);
    const hudS = hud.querySelector('[data-s]');
    const hudB = hud.querySelector('[data-b]');

    let L = {};
    const s = surface(stage, () => { layout(); draw(); });

    function layout() {
      const cell = Math.floor(Math.max(10, Math.min((s.w - 24) / N, (s.h - 16) / (N + 0.8 + 3.4))));
      const trayH = cell * 3.4;
      const total = cell * N + cell * 0.8 + trayH;
      const bx = Math.round((s.w - cell * N) / 2);
      const by = Math.round(Math.max(6, (s.h - total) / 2));
      const ty = by + cell * N + cell * 0.8;
      L = { cell, bx, by, ty, trayH };
    }

    function trayCenter(i) {
      return { x: (s.w / 3) * (i + 0.5), y: L.ty + L.trayH / 2 };
    }

    // ---------- state ----------
    function newGame() {
      board = emptyBoard();
      tray = dealPieces(board);
      score = 0; combo = 0; sinceClear = 0; over = false; overT = 0;
      pops = []; bursts = []; floaters.items = [];
      save();
    }

    function save() {
      if (over) { app.store.del('blast.save'); return; }
      app.store.set('blast.save', {
        board, score, combo, sinceClear,
        tray: tray.map((p) => (p ? { id: p.shape.id, color: p.color } : null)),
      });
    }

    function restore() {
      const sv = app.store.get('blast.save', null);
      if (!sv || !Array.isArray(sv.board) || sv.board.length !== N) return false;
      board = sv.board;
      tray = sv.tray.map((p) => (p && SHAPES[p.id] ? { shape: SHAPES[p.id], color: p.color } : null));
      score = sv.score || 0; combo = sv.combo || 0; sinceClear = sv.sinceClear || 0;
      over = false; overT = 0;
      return true;
    }

    // ---------- drawing ----------
    function pieceSize(shape, cell) { return { w: shape.w * cell, h: shape.h * cell }; }

    // Where the dragged piece's top-left is, given the finger position.
    function dragTopLeft(d) {
      const p = tray[d.i];
      const { w, h } = pieceSize(p.shape, L.cell);
      const lift = L.cell * 1.4 + Math.min(L.cell * 0.6, s.h * 0.02);
      return { x: d.x - w / 2, y: d.y - h - lift };
    }

    function snap(d) {
      const p = tray[d.i];
      const tl = dragTopLeft(d);
      const col = Math.round((tl.x - L.bx) / L.cell);
      const row = Math.round((tl.y - L.by) / L.cell);
      if (canPlace(board, p.shape, row, col)) return { row, col };
      return null;
    }

    function draw() {
      const { ctx } = s;
      s.begin();
      if (!L.cell) return;
      const { cell, bx, by } = L;

      rrect(ctx, bx - 6, by - 6, cell * N + 12, cell * N + 12, 14);
      ctx.fillStyle = '#0c0e15';
      ctx.fill();
      ctx.strokeStyle = '#2b3150';
      ctx.lineWidth = 2;
      ctx.stroke();
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          rrect(ctx, bx + c * cell + 2, by + r * cell + 2, cell - 4, cell - 4, cell * 0.16);
          ctx.fillStyle = '#181c29';
          ctx.fill();
        }
      }

      // preview of where the dragged piece lands, and the lines it would clear
      let ghost = null, preview = null;
      if (drag && !drag.back && tray[drag.i]) {
        ghost = snap(drag);
        if (ghost) preview = linesAfter(board, tray[drag.i].shape, ghost.row, ghost.col);
      }
      const willClear = new Set();
      if (preview) {
        for (const r of preview.rows) for (let c = 0; c < N; c++) willClear.add(r * N + c);
        for (const c of preview.cols) for (let r = 0; r < N; r++) willClear.add(r * N + c);
      }
      const dragColor = drag && tray[drag.i] ? tray[drag.i].color : null;

      const now = performance.now();
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          let color = board[r][c];
          if (!color) continue;
          if (willClear.has(r * N + c)) color = dragColor;
          let size = cell, x = bx + c * cell, y = by + r * cell;
          const pop = pops.find((p) => p.r === r && p.c === c);
          if (pop) {
            const k = 1 + 0.18 * Math.sin(Math.min(1, pop.t / 0.18) * Math.PI);
            size = cell * k;
            x -= (size - cell) / 2;
            y -= (size - cell) / 2;
          }
          drawBlock(ctx, over ? '#5a6078' : color, x, y, size, s.dpr);
        }
      }
      if (ghost) {
        const p = tray[drag.i];
        for (const [x, y] of p.shape.cells) {
          drawBlock(ctx, p.color, bx + (ghost.col + x) * cell, by + (ghost.row + y) * cell, cell, s.dpr, 0.38);
        }
        // the dragged piece's own cells in the clearing lines glow too
        if (willClear.size) {
          ctx.globalAlpha = 0.18 + 0.1 * Math.sin(now / 90);
          ctx.fillStyle = '#ffffff';
          for (const k of willClear) {
            const r = Math.floor(k / N), c = k % N;
            rrect(ctx, bx + c * cell + 2, by + r * cell + 2, cell - 4, cell - 4, cell * 0.16);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
      }
      for (const b of bursts) {
        const k = Math.max(0, Math.min(1, (b.t - b.delay) / 0.35));
        if (k >= 1) continue;
        const size = cell * (1 - ease.out(k) * 0.9);
        drawBlock(ctx, b.color, bx + b.c * cell + (cell - size) / 2, by + b.r * cell + (cell - size) / 2, size, s.dpr, 1 - k * 0.6);
      }

      // tray
      for (let i = 0; i < 3; i++) {
        const p = tray[i];
        if (!p || (drag && drag.i === i)) continue;
        const { x, y } = trayCenter(i);
        const mini = cell * TRAY_SCALE;
        const { w, h } = pieceSize(p.shape, mini);
        const fits = fitsAnywhere(board, p.shape);
        for (const [cx, cy] of p.shape.cells) {
          drawBlock(ctx, fits ? p.color : '#4a5068', x - w / 2 + cx * mini, y - h / 2 + cy * mini, mini, s.dpr, fits ? 1 : 0.6);
        }
      }
      // dragged piece (or one flying back to the tray)
      if (drag && tray[drag.i]) {
        const p = tray[drag.i];
        let size, tlx, tly;
        if (drag.back) {
          const k = ease.out(Math.min(1, drag.back.t / 0.16));
          const c = trayCenter(drag.i);
          size = lerp(cell, cell * TRAY_SCALE, k);
          const { w, h } = pieceSize(p.shape, size);
          tlx = lerp(drag.back.x, c.x - (p.shape.w * cell * TRAY_SCALE) / 2, k);
          tly = lerp(drag.back.y, c.y - (p.shape.h * cell * TRAY_SCALE) / 2, k);
          void w; void h;
        } else {
          const k = ease.out(Math.min(1, drag.t / 0.1));
          size = lerp(cell * TRAY_SCALE, cell, k);
          const tl = dragTopLeft(drag);
          const scaleFix = (cell - size) / 2;
          tlx = tl.x + scaleFix * p.shape.w;
          tly = tl.y + scaleFix * p.shape.h;
        }
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = 14;
        for (const [cx, cy] of p.shape.cells) drawBlock(ctx, p.color, tlx + cx * size, tly + cy * size, size, s.dpr);
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
      }
      floaters.draw(ctx);
    }

    function updateHud() {
      hudS.textContent = fmt(score);
      hudB.textContent = fmt(Math.max(best, score));
    }

    // ---------- animation ----------
    const ticker = loop((dt) => {
      if (destroyed) return false;
      let busy = false;
      if (drag) {
        drag.t += dt;
        busy = true;
        if (drag.back) {
          drag.back.t += dt;
          if (drag.back.t >= 0.16) drag = null;
        }
      }
      for (const p of pops) p.t += dt;
      pops = pops.filter((p) => p.t < 0.18);
      for (const b of bursts) b.t += dt;
      bursts = bursts.filter((b) => b.t - b.delay < 0.35);
      if (over) overT += dt;
      busy = busy || pops.length > 0 || bursts.length > 0 || floaters.update(dt);
      draw();
      return busy;
    });

    // ---------- input ----------
    s.canvas.addEventListener('pointerdown', (e) => {
      if (over || drag) return;
      const p = s.point(e);
      if (p.y < L.ty - L.cell * 0.4) return;
      const i = Math.max(0, Math.min(2, Math.floor(p.x / (s.w / 3))));
      if (!tray[i]) return;
      try { s.canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      drag = { i, x: p.x, y: p.y, t: 0, id: e.pointerId };
      app.sfx('select');
      app.haptic(6);
      ticker.kick();
    });
    s.canvas.addEventListener('pointermove', (e) => {
      if (!drag || drag.back || e.pointerId !== drag.id) return;
      const p = s.point(e);
      drag.x = p.x;
      drag.y = p.y;
      ticker.kick();
    });
    const release = (e) => {
      if (!drag || drag.back || e.pointerId !== drag.id) return;
      const target = snap(drag);
      if (target) drop(target);
      else {
        const tl = dragTopLeft(drag);
        drag.back = { t: 0, x: tl.x, y: tl.y };
      }
      ticker.kick();
    };
    s.canvas.addEventListener('pointerup', release);
    s.canvas.addEventListener('pointercancel', release);

    function drop({ row, col }) {
      const piece = tray[drag.i];
      tray[drag.i] = null;
      drag = null;
      const res = place(board, piece.shape, row, col, piece.color);
      for (const [x, y] of piece.shape.cells) pops.push({ r: row + y, c: col + x, t: 0 });
      if (res.lines) {
        combo++;
        sinceClear = 0;
      } else if (++sinceClear >= 3) {
        combo = 0;
      }
      const gained = scoreFor(piece.shape.cells.length, res.lines, combo);
      score += gained;
      if (res.lines) {
        // remove pops for cells that just cleared
        const gone = new Set(res.cleared.map((c) => c.r * N + c.c));
        pops = pops.filter((p) => !gone.has(p.r * N + p.c));
        const cr = (row + piece.shape.h / 2) * L.cell + L.by;
        const cc = (col + piece.shape.w / 2) * L.cell + L.bx;
        res.cleared.forEach((c) => bursts.push({ ...c, t: 0, delay: (Math.abs(c.r - row) + Math.abs(c.c - col)) * 0.018 }));
        floaters.add('+' + gained, cc, cr, '#ffd23f', Math.round(L.cell * 0.7));
        if (combo >= 2) floaters.add(t('Combo x{n}', { n: combo }), s.w / 2, L.by + L.cell * 1.2, '#ff9f40', Math.round(L.cell * 0.8));
        if (res.lines >= 2) app.sfx('big'); else app.sfx('clear');
        app.haptic(res.lines >= 2 ? 35 : 20);
        if (isEmpty(board)) {
          score += 300;
          floaters.add(t('Board clear! +{n}', { n: 300 }), s.w / 2, L.by + L.cell * 4, '#4cd964', Math.round(L.cell * 0.75));
        }
      } else {
        app.sfx('place');
        app.haptic(8);
      }
      if (tray.every((p) => !p)) tray = dealPieces(board);
      if (!tray.some((p) => p && fitsAnywhere(board, p.shape))) {
        over = true;
        endGame();
      }
      if (score > best) { best = score; app.store.set('blast.best', best); }
      save();
      updateHud();
      ticker.kick();
    }

    async function endGame() {
      save();
      floaters.add(t('No space left'), s.w / 2, L.by + L.cell * 4, '#ff5d6c', Math.round(L.cell * 0.8));
      app.sfx('lose');
      app.haptic(60);
      await new Promise((r) => setTimeout(r, 1100));
      if (destroyed) return;
      const isBest = score >= best && score > 0;
      const v = await app.modal({
        title: isBest ? t('New best!') : t('Game over'),
        html: `<div class="big">${fmt(score)}</div><p style="text-align:center">${t('Best {n}', { n: fmt(best) })}</p>`,
        buttons: [{ label: t('Play again'), value: 'again', primary: true }],
        dismissable: false,
      });
      if (destroyed) return;
      if (v === 'again') { newGame(); updateHud(); draw(); }
    }

    app.action(ICONS.restart, t('New game'), async () => {
      if (over) { newGame(); updateHud(); draw(); return; }
      const v = await app.modal({
        title: t('New game?'), html: `<p style="text-align:center">${t('Your current board will be lost.')}</p>`,
        buttons: [{ label: t('Cancel'), value: false }, { label: t('New game'), value: true, primary: true }],
      });
      if (v && !destroyed) { newGame(); updateHud(); draw(); }
    });

    if (!restore()) newGame();
    else if (!tray.some((p) => p && fitsAnywhere(board, p.shape))) newGame();
    updateHud();
    draw();

    return {
      destroy() {
        destroyed = true;
        ticker.stop();
        s.destroy();
      },
    };
  },
};

import { generate, isSolved } from '../logic/flow.js';
import { t, addHebrew } from '../core/i18n.js';
import he from '../i18n/he/flow.js';
import { el, surface, loop, rrect, levelBar, ICONS } from '../core/ui.js';

addHebrew(he);

const COLORS = ['#ff3b3b', '#2f6bff', '#1fbf4a', '#ffe02e', '#ff8c1a', '#2ee6e6', '#ff3fd2', '#b0623a', '#9b59ff', '#f2f2f2', '#9aa1ad', '#b4ff3c'];
const eq = (a, b) => a[0] === b[0] && a[1] === b[1];

export default {
  id: 'dots',
  get title() { return t('Connect Dots'); },
  icon: `<svg viewBox="0 0 64 64"><rect x="6" y="6" width="52" height="52" rx="14" fill="#232a44"/>
    <path d="M17 17v15h15" fill="none" stroke="#ff3b3b" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="17" cy="17" r="5.5" fill="#ff3b3b"/><circle cx="32" cy="32" r="5.5" fill="#ff3b3b"/>
    <path d="M32 17h15v30H17" fill="none" stroke="#2f6bff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="32" cy="17" r="5.5" fill="#2f6bff"/><circle cx="17" cy="47" r="5.5" fill="#2f6bff"/></svg>`,
  info: (store) => t('Level {n}', { n: store.get('dots.level', 1) }),
  get help() {
    return t(`<ul><li><b>Drag</b> from a dot to the other dot of the same color.</li>
    <li>Pipes can't cross. Drawing over another pipe cuts it.</li>
    <li>Connect every pair <b>and fill every square</b> to win.</li></ul>`);
  },

  mount(root, app) {
    let level = app.store.get('dots.level', 1);
    let maxLevel = Math.max(level, app.store.get('dots.max', 1));
    let puzzle, paths, drag, won, dotIndex;
    let destroyed = false;
    let winT = 0;

    const bar = levelBar(root, {
      onPrev: () => { if (level > 1) loadLevel(level - 1); },
      onNext: () => { if (level < maxLevel) loadLevel(level + 1); },
    });
    const stage = el('div', 'stage');
    root.append(stage);
    app.action(ICONS.hint, t('Hint'), hint);
    app.action(ICONS.restart, t('Clear board'), () => { paths = puzzle.dots.map(() => []); drag = null; won = false; draw(); });

    let L = {};
    const s = surface(stage, () => { layout(); draw(); });

    function layout() {
      if (!puzzle) return;
      const n = puzzle.size;
      const cell = Math.floor(Math.min((s.w - 20) / n, (s.h - 50) / n));
      L = { n, cell, ox: Math.round((s.w - cell * n) / 2), oy: Math.round(Math.max(6, (s.h - 30 - cell * n) / 2)) };
    }

    function loadLevel(n) {
      level = n;
      maxLevel = Math.max(maxLevel, level);
      app.store.set('dots.level', level);
      app.store.set('dots.max', maxLevel);
      puzzle = generate(level);
      paths = puzzle.dots.map(() => []);
      dotIndex = new Map();
      puzzle.dots.forEach(([a, b], c) => { dotIndex.set(a[1] * puzzle.size + a[0], c); dotIndex.set(b[1] * puzzle.size + b[0], c); });
      drag = null;
      won = false;
      bar.set(level, maxLevel);
      layout();
      draw();
    }

    const dotAt = (cell) => (cell ? dotIndex.get(cell[1] * puzzle.size + cell[0]) ?? -1 : -1);

    function complete(c, path) {
      if (path.length < 2) return false;
      const [a, b] = puzzle.dots[c];
      const f = path[0], l = path[path.length - 1];
      return (eq(f, a) && eq(l, b)) || (eq(f, b) && eq(l, a));
    }

    // Other pipes lose everything from the first square the active pipe now covers.
    function cut(path, covered) {
      const i = path.findIndex((p) => covered.has(p[1] * puzzle.size + p[0]));
      return i < 0 ? path : path.slice(0, i);
    }

    function currentPaths() {
      if (!drag) return paths;
      const covered = new Set(drag.path.map((p) => p[1] * puzzle.size + p[0]));
      return drag.base.map((p, c) => (c === drag.c ? drag.path : cut(p, covered)));
    }

    function cellAt(p) {
      const x = Math.floor((p.x - L.ox) / L.cell);
      const y = Math.floor((p.y - L.oy) / L.cell);
      if (x < 0 || y < 0 || x >= L.n || y >= L.n) return null;
      return [x, y];
    }

    // ---------- input ----------
    s.canvas.addEventListener('pointerdown', (e) => {
      if (won || drag) return;
      const cell = cellAt(s.point(e));
      if (!cell) return;
      const d = dotAt(cell);
      let c = -1, start;
      if (d >= 0) { c = d; start = [cell]; }
      else {
        c = paths.findIndex((p) => p.some((q) => eq(q, cell)));
        if (c < 0) return;
        const i = paths[c].findIndex((q) => eq(q, cell));
        start = paths[c].slice(0, i + 1);
      }
      try { s.canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      drag = { c, path: start, base: paths.map((p, k) => (k === c ? [] : p)), id: e.pointerId, pos: s.point(e), wasComplete: complete(c, paths[c]) };
      app.sfx('select');
      draw();
    });

    s.canvas.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const p = s.point(e);
      drag.pos = p;
      const target = cellAt(p);
      if (target) {
        let guard = 0;
        while (!eq(drag.path[drag.path.length - 1], target) && guard++ < 40) {
          const h = drag.path[drag.path.length - 1];
          const dx = target[0] - h[0], dy = target[1] - h[1];
          const horiz = [h[0] + Math.sign(dx), h[1]];
          const vert = [h[0], h[1] + Math.sign(dy)];
          // fast diagonal swipes skip squares: try the longer axis first, then the other
          const steps = Math.abs(dx) >= Math.abs(dy) ? [horiz, vert] : [vert, horiz];
          if (!steps.some((st) => !eq(st, h) && extend(st))) break;
        }
      }
      draw();
    });

    function extend(next) {
      const path = drag.path;
      const i = path.findIndex((q) => eq(q, next));
      if (i >= 0) { path.length = i + 1; return true; }
      if (complete(drag.c, path)) return false;
      const d = dotAt(next);
      if (d >= 0 && d !== drag.c) return false;
      if (d === drag.c && eq(next, path[0])) return false;
      path.push(next);
      if (complete(drag.c, path)) { app.sfx('pop'); app.haptic(15); }
      else app.sfx('move');
      return true;
    }

    const release = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      paths = currentPaths().map((p) => p.slice());
      if (paths[drag.c].length < 2) paths[drag.c] = [];
      drag = null;
      checkWin();
      draw();
    };
    s.canvas.addEventListener('pointerup', release);
    s.canvas.addEventListener('pointercancel', release);

    function checkWin() {
      if (isSolved(puzzle.size, puzzle.dots, paths)) {
        won = true;
        winT = 0;
        app.sfx('win');
        app.haptic(40);
        maxLevel = Math.max(maxLevel, level + 1);
        app.store.set('dots.max', maxLevel);
        ticker.kick();
        setTimeout(async () => {
          if (destroyed || !won) return;
          const v = await app.modal({
            title: t('Level {n} done!', { n: level }),
            html: `<p style="text-align:center">${t('Every dot connected, every square filled.')}</p>`,
            buttons: [{ label: t('Replay'), value: 'replay' }, { label: t('Next level'), value: 'next', primary: true }],
            dismissable: false,
          });
          if (destroyed) return;
          loadLevel(v === 'replay' ? level : level + 1);
        }, 700);
      } else if (puzzle.dots.every((_, c) => complete(c, paths[c]))) {
        app.toast(t('All connected — now fill every square'));
      }
    }

    function hint() {
      if (won) return;
      const c = puzzle.dots.findIndex((_, k) => {
        const sol = puzzle.solution[k];
        const p = paths[k];
        return !(p.length === sol.length && complete(k, p) && p.every((q) => sol.some((r) => eq(q, r))));
      });
      if (c < 0) return;
      const sol = puzzle.solution[c];
      const covered = new Set(sol.map((p) => p[1] * puzzle.size + p[0]));
      paths = paths.map((p, k) => (k === c ? sol.map((q) => q.slice()) : cut(p, covered)));
      app.sfx('select');
      checkWin();
      draw();
    }

    // ---------- drawing ----------
    function center(cell) { return [L.ox + (cell[0] + 0.5) * L.cell, L.oy + (cell[1] + 0.5) * L.cell]; }

    function draw() {
      const { ctx } = s;
      s.begin();
      if (!L.cell) return;
      const { n, cell, ox, oy } = L;
      rrect(ctx, ox - 4, oy - 4, cell * n + 8, cell * n + 8, 12);
      ctx.fillStyle = '#0c0e15';
      ctx.fill();

      const shown = currentPaths();
      // tinted squares under each pipe
      shown.forEach((p, c) => {
        ctx.fillStyle = COLORS[c] + '30';
        for (const q of p) ctx.fillRect(ox + q[0] * cell, oy + q[1] * cell, cell, cell);
      });

      ctx.strokeStyle = '#2b3150';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        ctx.moveTo(ox + i * cell + 0.5, oy); ctx.lineTo(ox + i * cell + 0.5, oy + n * cell);
        ctx.moveTo(ox, oy + i * cell + 0.5); ctx.lineTo(ox + n * cell, oy + i * cell + 0.5);
      }
      ctx.stroke();

      // pipes
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      shown.forEach((p, c) => {
        if (p.length < 2) return;
        ctx.strokeStyle = COLORS[c];
        ctx.lineWidth = cell * 0.34;
        ctx.beginPath();
        p.forEach((q, i) => { const [x, y] = center(q); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
        ctx.stroke();
      });

      // dots
      puzzle.dots.forEach(([a, b], c) => {
        const done = complete(c, shown[c]);
        for (const d of [a, b]) {
          const [x, y] = center(d);
          if (done) {
            ctx.fillStyle = COLORS[c] + '55';
            ctx.beginPath(); ctx.arc(x, y, cell * 0.46, 0, Math.PI * 2); ctx.fill();
          }
          ctx.fillStyle = COLORS[c];
          ctx.beginPath(); ctx.arc(x, y, cell * 0.34, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          ctx.beginPath(); ctx.arc(x - cell * 0.1, y - cell * 0.1, cell * 0.1, 0, Math.PI * 2); ctx.fill();
        }
      });

      // finger marker
      if (drag) {
        ctx.fillStyle = COLORS[drag.c] + '40';
        ctx.beginPath(); ctx.arc(drag.pos.x, drag.pos.y, cell * 0.8, 0, Math.PI * 2); ctx.fill();
      }

      // progress line
      const joined = puzzle.dots.filter((_, c) => complete(c, shown[c])).length;
      const filled = new Set();
      shown.forEach((p) => p.forEach((q) => filled.add(q[1] * n + q[0])));
      puzzle.dots.forEach(([a, b]) => { filled.add(a[1] * n + a[0]); filled.add(b[1] * n + b[0]); });
      ctx.fillStyle = won ? '#3ecf8e' : '#9ba2b9';
      ctx.font = '600 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const status = won ? t('Solved!') : t('Pairs {a}/{b}   ·   Filled {p}%', { a: joined, b: puzzle.dots.length, p: Math.round((filled.size / (n * n)) * 100) });
      ctx.fillText(status, s.w / 2, oy + cell * n + 24);

      if (won && winT < 1) {
        ctx.globalAlpha = 0.35 * (1 - winT);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(ox, oy, cell * n, cell * n);
        ctx.globalAlpha = 1;
      }
    }

    const ticker = loop((dt) => {
      if (destroyed) return false;
      winT += dt * 2;
      draw();
      return won && winT < 1;
    });

    loadLevel(level);

    return {
      destroy() {
        destroyed = true;
        ticker.stop();
        s.destroy();
      },
    };
  },
};

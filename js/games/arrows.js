import { generate, lane, firstBlock } from '../logic/arrows.js';
import { DIRS } from '../logic/rng.js';
import { t, addHebrew } from '../core/i18n.js';
import he from '../i18n/he/arrows.js';
import { el, surface, loop, rrect, levelBar, ICONS } from '../core/ui.js';

addHebrew(he);

const PALETTE = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7', '#748ffc', '#b197fc', '#f783ac', '#e8ecf5'];
const HEARTS = 3;

export default {
  id: 'arrows',
  get title() { return t('Arrows'); },
  icon: `<svg viewBox="0 0 64 64"><rect x="6" y="6" width="52" height="52" rx="14" fill="#232a44"/>
    <g fill="none" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 46V30h14" stroke="#4dabf7"/><path d="M27 25l5 5-5 5" stroke="#4dabf7"/>
    <path d="M42 48V20" stroke="#ffa94d"/><path d="M37 25l5-5 5 5" stroke="#ffa94d"/><path d="M18 18h10" stroke="#69db7c"/><path d="M23 13l5 5-5 5" stroke="#69db7c"/></g></svg>`,
  info: (store) => t('Level {n}', { n: store.get('arrows.level', 1) }),
  get help() {
    return t(`<ul><li><b>Tap</b> an arrow to send it flying the way it points.</li>
    <li>If another arrow is in its way, it bumps back and you <b>lose a heart</b>.</li>
    <li>Clear every arrow to win. You have 3 hearts per level.</li></ul>`);
  },

  mount(root, app) {
    let level = app.store.get('arrows.level', 1);
    let maxLevel = Math.max(level, app.store.get('arrows.max', 1));
    let puzzle, alive, hearts, anims, flashes, hintId, hintT, finished;
    let destroyed = false;

    const bar = levelBar(root, {
      onPrev: () => { if (level > 1) loadLevel(level - 1); },
      onNext: () => { if (level < maxLevel) loadLevel(level + 1); },
    });
    const heartsEl = el('div', 'hearts');
    bar.bar.append(heartsEl);
    const stage = el('div', 'stage');
    root.append(stage);
    app.action(ICONS.hint, t('Hint'), hint);
    app.action(ICONS.restart, t('Restart level'), () => loadLevel(level));

    let L = {};
    const s = surface(stage, () => { layout(); draw(); });

    function layout() {
      if (!puzzle) return;
      const cell = Math.floor(Math.min((s.w - 20) / puzzle.w, (s.h - 20) / puzzle.h));
      L = { cell, ox: Math.round((s.w - cell * puzzle.w) / 2), oy: Math.round((s.h - cell * puzzle.h) / 2) };
    }

    function renderHearts() {
      heartsEl.innerHTML = Array.from({ length: HEARTS }, (_, i) => (i < hearts ? ICONS.heart : ICONS.heartOff)).join('');
    }

    function loadLevel(n) {
      level = n;
      maxLevel = Math.max(maxLevel, level);
      app.store.set('arrows.level', level);
      app.store.set('arrows.max', maxLevel);
      puzzle = generate(level);
      alive = new Set(puzzle.arrows.map((a) => a.id));
      hearts = HEARTS;
      anims = [];
      flashes = [];
      hintId = -1;
      finished = false;
      bar.set(level, maxLevel);
      renderHearts();
      layout();
      ticker.kick();
    }

    // Path the arrow follows: its body, then its exit lane, then a little past the edge.
    function travelPath(a) {
      const head = a.cells[a.cells.length - 1];
      const ln = lane(puzzle.w, puzzle.h, head, a.dir);
      const [dx, dy] = DIRS[a.dir];
      const pts = [...a.cells, ...ln];
      const last = pts[pts.length - 1];
      for (let i = 1; i <= a.cells.length + 1; i++) pts.push([last[0] + dx * i, last[1] + dy * i]);
      return { pts, laneLen: ln.length };
    }

    function occupantAt(x, y) {
      for (const a of puzzle.arrows) {
        if (!alive.has(a.id)) continue;
        if (a.cells.some((c) => c[0] === x && c[1] === y)) return a;
      }
      return null;
    }

    s.canvas.addEventListener('pointerdown', (e) => {
      if (finished) return;
      const p = s.point(e);
      const x = Math.floor((p.x - L.ox) / L.cell);
      const y = Math.floor((p.y - L.oy) / L.cell);
      const a = occupantAt(x, y);
      if (!a || anims.some((m) => m.a.id === a.id)) return;
      hintId = -1;
      const block = firstBlock(puzzle.w, puzzle.h, puzzle.arrows, alive, a);
      const { pts, laneLen } = travelPath(a);
      if (!block) {
        alive.delete(a.id);
        anims.push({ kind: 'exit', a, pts, laneLen, s: 0, v: 9 });
        app.sfx('pop');
        app.haptic(8);
        if (!alive.size) finished = true;
      } else {
        anims.push({ kind: 'bump', a, pts, s: 0, max: block.index + 0.32, back: false });
        flashes.push({ id: block.by, t: 0 }, { id: a.id, t: 0 });
        hearts--;
        renderHearts();
        app.sfx('bump');
        app.haptic(45);
        if (hearts <= 0) finished = true;
      }
      ticker.kick();
    });

    function hint() {
      if (finished) return;
      const a = puzzle.arrows.find((b) => alive.has(b.id) && !firstBlock(puzzle.w, puzzle.h, puzzle.arrows, alive, b)
        && !anims.some((m) => m.a.id === b.id));
      if (!a) return;
      hintId = a.id;
      hintT = 0;
      app.sfx('select');
      ticker.kick();
    }

    async function endLevel(win) {
      if (destroyed) return;
      if (win) {
        app.sfx('win');
        maxLevel = Math.max(maxLevel, level + 1);
        app.store.set('arrows.max', maxLevel);
        const summary = hearts === HEARTS ? t('Perfect — no hearts lost.')
          : hearts === 1 ? t('With 1 heart left.') : t('With {n} hearts left.', { n: hearts });
        const v = await app.modal({
          title: t('Level {n} cleared!', { n: level }),
          html: `<p style="text-align:center">${summary}</p>`,
          buttons: [{ label: t('Replay'), value: 'replay' }, { label: t('Next level'), value: 'next', primary: true }],
          dismissable: false,
        });
        if (!destroyed) loadLevel(v === 'next' ? level + 1 : level);
      } else {
        app.sfx('lose');
        await app.modal({
          title: t('Out of hearts'),
          html: `<p style="text-align:center">${t('Look for arrows with a clear path to the edge first.')}</p>`,
          buttons: [{ label: t('Try again'), value: true, primary: true }],
          dismissable: false,
        });
        if (!destroyed) loadLevel(level);
      }
    }

    // ---------- drawing ----------
    function toPx([x, y]) { return [L.ox + (x + 0.5) * L.cell, L.oy + (y + 0.5) * L.cell]; }

    function pointAt(pts, t) {
      const i = Math.max(0, Math.min(pts.length - 2, Math.floor(t)));
      const f = t - i;
      const a = pts[i], b = pts[i + 1];
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    }

    // Draws the stretch of the path from t0 to t1 with an arrowhead at t1.
    function drawArrow(ctx, pts, t0, t1, color, { alpha = 1, glow = 0 } = {}) {
      const { cell } = L;
      const line = [toPx(pointAt(pts, t0))];
      for (let i = Math.floor(t0) + 1; i < t1; i++) line.push(toPx(pts[i]));
      const end = toPx(pointAt(pts, t1));
      line.push(end);
      const k = Math.min(pts.length - 2, Math.max(0, Math.ceil(t1) - 1));
      const dx = pts[k + 1][0] - pts[k][0], dy = pts[k + 1][1] - pts[k][1];
      ctx.globalAlpha = alpha;
      if (glow) { ctx.shadowColor = color; ctx.shadowBlur = glow; }
      ctx.strokeStyle = color;
      ctx.lineWidth = cell * 0.17;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      line.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      // stop the shaft short of the tip so the head stays sharp
      ctx.stroke();
      const hl = cell * 0.36, hw = cell * 0.27;
      const tipX = end[0] + dx * cell * 0.22, tipY = end[1] + dy * cell * 0.22;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX - dx * hl - dy * hw, tipY - dy * hl + dx * hw);
      ctx.lineTo(tipX - dx * hl + dy * hw, tipY - dy * hl - dx * hw);
      ctx.closePath();
      ctx.fill();
      // tail cap
      const [tx, ty] = line[0];
      ctx.beginPath();
      ctx.arc(tx, ty, cell * 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    function draw() {
      const { ctx } = s;
      s.begin();
      if (!L.cell || !puzzle) return;
      const { cell, ox, oy } = L;
      rrect(ctx, ox - 6, oy - 6, cell * puzzle.w + 12, cell * puzzle.h + 12, 14);
      ctx.fillStyle = '#0c0e15';
      ctx.fill();
      ctx.fillStyle = '#262b3d';
      for (let y = 0; y < puzzle.h; y++) {
        for (let x = 0; x < puzzle.w; x++) {
          ctx.beginPath();
          ctx.arc(ox + (x + 0.5) * cell, oy + (y + 0.5) * cell, Math.max(1.5, cell * 0.05), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      const animating = new Set(anims.map((m) => m.a.id));
      for (const a of puzzle.arrows) {
        if (!alive.has(a.id) || animating.has(a.id)) continue;
        const fl = flashes.find((f) => f.id === a.id);
        let color = PALETTE[a.id % PALETTE.length];
        if (fl && Math.floor(fl.t * 10) % 2 === 0) color = '#ff3b3b';
        const glow = a.id === hintId ? 10 + 8 * Math.sin(hintT * 8) : 0;
        drawArrow(ctx, a.cells, 0, a.cells.length - 1, color, { glow });
      }
      for (const m of anims) {
        const n = m.a.cells.length - 1;
        let color = PALETTE[m.a.id % PALETTE.length];
        let alpha = 1;
        if (m.kind === 'exit') alpha = Math.max(0, 1 - Math.max(0, m.s - m.laneLen) / (n + 1));
        else if (flashes.some((f) => f.id === m.a.id)) color = '#ff3b3b';
        drawArrow(ctx, m.pts, m.s, m.s + n, color, { alpha });
      }
    }

    const ticker = loop((dt) => {
      if (destroyed) return false;
      for (const m of anims) {
        if (m.kind === 'exit') {
          m.v += dt * 40;
          m.s += m.v * dt;
          m.done = m.s >= m.laneLen + m.a.cells.length;
        } else if (!m.back) {
          m.s = Math.min(m.max, m.s + dt * 14);
          if (m.s >= m.max) m.back = true;
        } else {
          m.s = Math.max(0, m.s - dt * 9);
          m.done = m.s <= 0;
        }
      }
      anims = anims.filter((m) => !m.done);
      for (const f of flashes) f.t += dt;
      flashes = flashes.filter((f) => f.t < 0.6);
      if (hintId >= 0) { hintT += dt; if (hintT > 2.5) hintId = -1; }
      draw();
      const busy = anims.length > 0 || flashes.length > 0 || hintId >= 0;
      if (!busy && finished && !endLevel.started) {
        endLevel.started = true;
        endLevel(alive.size === 0).finally(() => { endLevel.started = false; });
      }
      return busy;
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

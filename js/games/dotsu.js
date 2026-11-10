import { generate, Game, dotCount, cloneBoard, applyMove } from '../logic/dotsu.js';
import { t, addHebrew } from '../core/i18n.js';
import he from '../i18n/he/dotsu.js';
import { el, surface, loop, rrect, ease, lerp, Floaters, levelBar, ICONS } from '../core/ui.js';

addHebrew(he);

// Flat, calm colors. Each color also has its own shape inside, so the game never depends on hue alone.
const COLORS = ['#e8603c', '#56b4e9', '#f2d43d', '#2fb380', '#cc79a7', '#8f7cf0'];
const INK = 'rgba(16,20,32,0.78)';
const TAU = Math.PI * 2;
const SLIDE = 0.12;   // seconds for a dropped dot to settle
const WAVE = 0.16;    // seconds between one step of a chain and the next
const POP = 0.3;      // seconds a dot takes to pop

// The color's shape, drawn in the middle of the dot: star, diamond, triangle, square, cross, ring.
function symbol(ctx, n, x, y, u) {
  ctx.beginPath();
  if (n === 0) {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, rad = i % 2 ? u * 0.5 : u * 1.15;
      ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
  } else if (n === 1) {
    ctx.moveTo(x, y - u * 1.1); ctx.lineTo(x + u * 0.9, y); ctx.lineTo(x, y + u * 1.1); ctx.lineTo(x - u * 0.9, y);
  } else if (n === 2) {
    ctx.moveTo(x, y - u * 1.05); ctx.lineTo(x + u * 1.05, y + u * 0.8); ctx.lineTo(x - u * 1.05, y + u * 0.8);
  } else if (n === 3) {
    ctx.rect(x - u * 0.85, y - u * 0.85, u * 1.7, u * 1.7);
  } else if (n === 4) {
    ctx.moveTo(x - u, y); ctx.lineTo(x + u, y); ctx.moveTo(x, y - u); ctx.lineTo(x, y + u);
  } else {
    ctx.arc(x, y, u * 0.9, 0, TAU);
  }
  ctx.closePath();
  if (n >= 4) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(2, u * 0.5);
    ctx.lineCap = 'round';
    ctx.stroke();
  } else {
    ctx.fillStyle = INK;
    ctx.fill();
  }
}

function tri(ctx, x, y, a, size) {
  ctx.beginPath();
  ctx.moveTo(x + Math.cos(a) * size, y + Math.sin(a) * size);
  ctx.lineTo(x + Math.cos(a + 2.5) * size, y + Math.sin(a + 2.5) * size);
  ctx.lineTo(x + Math.cos(a - 2.5) * size, y + Math.sin(a - 2.5) * size);
  ctx.closePath();
  ctx.fill();
}

// Marks that say what a special dot does. Liner: arrows along its line. Pulser: double ring.
// Blaster: spokes all around. Shuriken: points on the four corners.
function marker(ctx, kind, x, y, r) {
  if (kind === 'H' || kind === 'V') {
    ctx.fillStyle = INK;
    const turn = kind === 'V' ? Math.PI / 2 : 0;
    for (let i = 0; i < 2; i++) {
      const a = turn + i * Math.PI;
      tri(ctx, x + Math.cos(a) * r * 0.72, y + Math.sin(a) * r * 0.72, a, r * 0.3);
    }
    return;
  }
  ctx.strokeStyle = ctx.fillStyle = '#ffffff';
  ctx.lineCap = 'round';
  if (kind === 'P') {
    ctx.lineWidth = Math.max(1.5, r * 0.1);
    for (const k of [1.1, 1.26]) { ctx.beginPath(); ctx.arc(x, y, r * k, 0, TAU); ctx.stroke(); }
  } else if (kind === 'B') {
    ctx.lineWidth = Math.max(2, r * 0.12);
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * TAU) / 8;
      ctx.moveTo(x + Math.cos(a) * r * 1.08, y + Math.sin(a) * r * 1.08);
      ctx.lineTo(x + Math.cos(a) * r * 1.26, y + Math.sin(a) * r * 1.26);
    }
    ctx.stroke();
  } else if (kind === 'S') {
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      tri(ctx, x + Math.cos(a) * r * 1.06, y + Math.sin(a) * r * 1.06, a, r * 0.36);
    }
  }
}

function drawDot(ctx, x, y, r, d, scale = 1, alpha = 1) {
  r *= scale;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = COLORS[d.c];
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  symbol(ctx, d.c, x, y, r * 0.4);
  marker(ctx, d.k, x, y, r);
  ctx.globalAlpha = 1;
}

export default {
  id: 'dotsu',
  get title() { return t('Dotsu'); },
  icon: `<svg viewBox="0 0 64 64"><rect x="6" y="6" width="52" height="52" rx="14" fill="#232a44"/>
    <circle cx="19" cy="22" r="6.5" fill="#e8603c"/><circle cx="32" cy="22" r="6.5" fill="#e8603c"/><circle cx="45" cy="22" r="6.5" fill="#e8603c"/>
    <circle cx="32" cy="22" r="10" fill="none" stroke="#fff" stroke-width="1.8" opacity=".85"/>
    <circle cx="19" cy="42" r="6.5" fill="#56b4e9"/><circle cx="32" cy="42" r="6.5" fill="none" stroke="#6b7394" stroke-width="2" stroke-dasharray="3 3"/><circle cx="45" cy="42" r="6.5" fill="#f2d43d"/></svg>`,
  info: (store) => t('Level {n}', { n: store.get('dotsu.level', 1) }),
  get help() {
    return t(`<ul><li><b>Drag</b> any dot to any empty spot. Nothing falls.</li>
    <li>Three or more dots of one color in a <b>row or column</b> pop.</li>
    <li>Clear <b>every dot</b> before your moves run out.</li>
    <li>Special dots clear more when they pop: a <b>Liner</b> (arrows) its row or column, a <b>Pulser</b> (double ring) the 3×3 around it, a <b>Blaster</b> (spokes) every dot of its color, a <b>Shuriken</b> (corner points) both diagonals.</li></ul>`);
  },

  mount(root, app) {
    let level = app.store.get('dotsu.level', 1);
    let maxLevel = Math.max(level, app.store.get('dotsu.max', 1));
    let puzzle, game;
    let destroyed = false;
    let ended = false;        // won or lost: the board is locked until a modal answer
    let drag = null;          // { from, id, sx, sy, pos, moved, preview? }
    let selected = -1;        // a tapped dot waiting for a tapped empty cell
    let hint = null;          // { from, to, t }
    let slides = [];          // dots settling into a cell: { i, x0, y0, t }
    let bursts = [];          // popped dots: { x, y, c, k, t, delay }
    let fxs = [];             // special effects: { k, x, y, c, t, delay, targets }
    const floaters = new Floaters();

    const bar = levelBar(root, {
      onPrev: () => { if (level > 1) loadLevel(level - 1); },
      onNext: () => { if (level < maxLevel) loadLevel(level + 1); },
    });
    const hud = el('div', 'hud');
    hud.innerHTML = `<div class="chip wide"><span class="k">${t('Moves')}</span><span class="v" data-m>0</span></div>
      <div class="chip wide"><span class="k">${t('Dots')}</span><span class="v" data-d>0</span></div>`;
    const stage = el('div', 'stage');
    root.append(hud, stage);
    const hudM = hud.querySelector('[data-m]');
    const hudD = hud.querySelector('[data-d]');
    app.action(ICONS.undo, t('Undo'), undo);
    app.action(ICONS.hint, t('Hint'), showHint);
    app.action(ICONS.restart, t('Restart level'), () => { if (!ended) restart(); });

    let L = {};
    const s = surface(stage, () => { drag = null; layout(); draw(); }); // a drag cannot survive a new layout

    function layout() {
      if (!puzzle) return;
      const { w, h } = game.board;
      const cell = Math.floor(Math.max(10, Math.min((s.w - 24) / w, (s.h - 24) / h)));
      L = { cell, ox: Math.round((s.w - cell * w) / 2), oy: Math.round((s.h - cell * h) / 2) };
    }

    const cx = (i) => L.ox + ((i % game.board.w) + 0.5) * L.cell;
    const cy = (i) => L.oy + (Math.floor(i / game.board.w) + 0.5) * L.cell;

    function cellAt(p) {
      const { w, h } = game.board;
      const x = Math.floor((p.x - L.ox) / L.cell);
      const y = Math.floor((p.y - L.oy) / L.cell);
      return x < 0 || y < 0 || x >= w || y >= h ? -1 : y * w + x;
    }

    // ---------- levels ----------
    function loadLevel(n) {
      level = n;
      maxLevel = Math.max(maxLevel, level);
      app.store.set('dotsu.level', level);
      app.store.set('dotsu.max', maxLevel);
      puzzle = generate(level);
      game = new Game(puzzle);
      bar.set(level, maxLevel);
      reset();
      layout();
      draw();
    }

    // Clears everything that belongs to the previous position.
    function reset() {
      ended = false;
      drag = null; selected = -1; hint = null;
      slides = []; bursts = []; fxs = [];
      floaters.items = [];
      updateHud();
    }

    function restart() {
      game.restart();
      reset();
      app.sfx('select');
      draw();
    }

    function undo() {
      if (ended || !game.undo()) { app.sfx('bump'); return; }
      reset();
      app.sfx('move');
      draw();
    }

    function updateHud() {
      hudM.textContent = game.left;
      hudM.style.color = game.left === 0 && !game.won ? '#ff5d6c' : '';
      hudD.textContent = dotCount(game.board);
    }

    // ---------- moves ----------
    function snapBack(d) {
      slides.push({ i: d.from, x0: d.pos.x, y0: d.pos.y, t: 0 });
      ticker.kick();
    }

    function tryMove(from, to, start) {
      hint = null;
      selected = -1;
      const wasDead = game.dead;
      const res = game.play(from, to);
      if (!res) return false;
      slides.push({ i: to, x0: start.x, y0: start.y, t: 0 });
      let deepest = 0;
      for (const d of res.cleared) {
        const delay = SLIDE + d.depth * WAVE;
        deepest = Math.max(deepest, d.depth);
        bursts.push({ x: d.x, y: d.y, c: d.c, k: d.k, t: 0, delay });
        if (d.k) {
          fxs.push({ k: d.k, x: d.x, y: d.y, c: d.c, t: 0, delay, targets: d.k === 'B' ? res.cleared.filter((e) => e.c === d.c && (e.x !== d.x || e.y !== d.y)) : [] });
        }
      }
      if (res.cleared.length) {
        const mx = res.cleared.reduce((a, d) => a + d.x, 0) / res.cleared.length;
        const my = res.cleared.reduce((a, d) => a + d.y, 0) / res.cleared.length;
        const px = L.ox + (mx + 0.5) * L.cell, py = L.oy + (my + 0.5) * L.cell;
        floaters.add('+' + res.cleared.length, px, py, '#ffd23f', Math.round(L.cell * 0.55));
        if (deepest >= 1) floaters.add(t('Chain ×{n}', { n: deepest + 1 }), s.w / 2, L.oy + L.cell * 0.5, '#ff9f40', Math.round(L.cell * 0.5));
        app.sfx(deepest >= 1 || res.cleared.length >= 6 ? 'big' : 'clear');
        app.haptic(deepest >= 1 ? 35 : 20);
      } else {
        app.sfx('place');
        app.haptic(8);
      }
      updateHud();
      if (game.won || game.lost) finish(SLIDE + deepest * WAVE + POP + 0.25);
      else if (game.dead && !wasDead) app.toast(t("This board can't be cleared now — undo a move"), 2600);
      ticker.kick();
      return true;
    }

    // Waits for the pop to play out, then shows the result.
    function finish(seconds) {
      ended = true;
      const won = game.won;
      if (won) {
        maxLevel = Math.max(maxLevel, level + 1);
        app.store.set('dotsu.max', maxLevel);
        bar.set(level, maxLevel);
      }
      setTimeout(async () => {
        if (destroyed || !ended) return;
        if (won) {
          app.sfx('win');
          app.haptic(40);
          const v = await app.modal({
            title: t('Level {n} done!', { n: level }),
            html: `<p style="text-align:center">${t('Every dot cleared.')}</p>`,
            buttons: [{ label: t('Replay'), value: 'replay' }, { label: t('Next level'), value: 'next', primary: true }],
            dismissable: false,
          });
          if (destroyed) return;
          loadLevel(v === 'replay' ? level : level + 1);
        } else {
          app.sfx('lose');
          app.haptic(60);
          const v = await app.modal({
            title: t('Out of moves'),
            html: `<p style="text-align:center">${t('Dots are still on the board.')}</p>`,
            buttons: [{ label: t('Undo'), value: 'undo' }, { label: t('Try again'), value: 'again', primary: true }],
            dismissable: false,
          });
          if (destroyed) return;
          if (v === 'undo') { game.undo(); reset(); draw(); } else restart();
        }
      }, seconds * 1000);
    }

    function showHint() {
      if (ended) return;
      const m = game.hint();
      if (!m) {
        const back = game.backOnTrack();
        if (game.dead && back <= 1) app.toast(t("This board can't be cleared now — undo a move"), 2600);
        else if (back === 1) app.toast(t('Undo the last move to get back on track'), 2600);
        else if (back > 1) app.toast(t('Undo {n} moves to get back on track', { n: back }), 2600);
        else app.toast(t('No hint from here — undo a move or restart'));
        return;
      }
      hint = { from: m.from, to: m.to, t: 0 };
      selected = -1;
      app.sfx('select');
      ticker.kick();
    }

    // ---------- input ----------
    s.canvas.addEventListener('pointerdown', (e) => {
      if (ended || drag) return;
      const p = s.point(e);
      const i = cellAt(p);
      hint = null;
      // let the last move's animation finish at once, so nothing is grabbed mid-slide or mid-pop
      slides = []; bursts = []; fxs = [];
      if (i < 0) { selected = -1; draw(); return; }
      if (!game.board.g[i]) {
        // a tap on an empty cell finishes a tap-then-tap move
        if (selected >= 0) tryMove(selected, i, { x: cx(selected), y: cy(selected) });
        else draw();
        return;
      }
      try { s.canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      drag = { from: i, id: e.pointerId, sx: p.x, sy: p.y, pos: { x: cx(i), y: cy(i) }, moved: false, target: -1 };
      app.sfx('tap');
      ticker.kick();
    });

    s.canvas.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const p = s.point(e);
      const dist = Math.hypot(p.x - drag.sx, p.y - drag.sy);
      if (!drag.moved && dist > L.cell * 0.2) { drag.moved = true; selected = -1; }
      if (drag.moved) {
        // the dot rides a little above the finger so the finger does not hide the target
        const lift = L.cell * 0.75 * Math.min(1, dist / (L.cell * 0.8));
        drag.pos = { x: cx(drag.from) + p.x - drag.sx, y: cy(drag.from) + p.y - drag.sy - lift };
        const target = cellAt(drag.pos);
        const ok = target >= 0 && !game.board.g[target];
        if (target !== drag.target) {
          drag.target = target;
          drag.preview = null;
          if (ok) {
            const b = cloneBoard(game.board);
            drag.preview = applyMove(b, drag.from, target);
          }
        }
      }
      ticker.kick();
    });

    const release = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      if (!d.moved) {
        // a tap: pick the dot up, or put it down again
        selected = selected === d.from || e.type !== 'pointerup' ? -1 : d.from;
        if (selected >= 0) app.sfx('select');
        ticker.kick();
        return;
      }
      const target = cellAt(d.pos);
      if (e.type !== 'pointerup' || target < 0 || game.board.g[target] || !tryMove(d.from, target, d.pos)) {
        if (target >= 0 && target !== d.from && game.board.g[target]) app.sfx('bump');
        snapBack(d);
      }
      ticker.kick();
    };
    s.canvas.addEventListener('pointerup', release);
    s.canvas.addEventListener('pointercancel', release);
    s.canvas.addEventListener('lostpointercapture', release); // a drag the browser took away must not stay stuck

    // ---------- drawing ----------
    function slideAt(i) {
      const a = slides.find((q) => q.i === i);
      if (!a) return null;
      const k = ease.out(Math.min(1, a.t / SLIDE));
      return { x: lerp(a.x0, cx(i), k), y: lerp(a.y0, cy(i), k) };
    }

    function draw() {
      const { ctx } = s;
      s.begin();
      if (!L.cell || !game) return;
      const { cell, ox, oy } = L;
      const { w, h, g } = game.board;
      const r = cell * 0.36;
      const now = performance.now();
      const dragging = drag && drag.moved;

      rrect(ctx, ox - 6, oy - 6, cell * w + 12, cell * h + 12, 14);
      ctx.fillStyle = '#0c0e15';
      ctx.fill();
      for (let i = 0; i < w * h; i++) {
        rrect(ctx, ox + (i % w) * cell + 2, oy + Math.floor(i / w) * cell + 2, cell - 4, cell - 4, cell * 0.2);
        ctx.fillStyle = '#151926';
        ctx.fill();
        // while a dot is held, every empty cell shows it can take it
        if (dragging && !g[i]) {
          ctx.fillStyle = 'rgba(255,255,255,0.14)';
          ctx.beginPath(); ctx.arc(cx(i), cy(i), cell * 0.09, 0, TAU); ctx.fill();
        }
      }

      // the cell under the held dot, and the lines it would pop
      if (dragging && drag.target >= 0 && !g[drag.target]) {
        const t0 = drag.target;
        rrect(ctx, ox + (t0 % w) * cell + 2, oy + Math.floor(t0 / w) * cell + 2, cell - 4, cell - 4, cell * 0.2);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 2;
        for (const d of drag.preview || []) {
          ctx.beginPath(); ctx.arc(L.ox + (d.x + 0.5) * cell, L.oy + (d.y + 0.5) * cell, r * 1.18, 0, TAU); ctx.stroke();
        }
      }

      // hint: pulse the dot and the cell it should go to
      if (hint) {
        const pulse = 0.5 + 0.5 * Math.sin(now / 160);
        ctx.strokeStyle = `rgba(255,255,255,${0.45 + 0.5 * pulse})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx(hint.from), cy(hint.from), r * (1.2 + 0.1 * pulse), 0, TAU); ctx.stroke();
        rrect(ctx, ox + (hint.to % w) * cell + 3, oy + Math.floor(hint.to / w) * cell + 3, cell - 6, cell - 6, cell * 0.2);
        ctx.stroke();
      }

      for (let i = 0; i < w * h; i++) {
        const d = g[i];
        if (!d) continue;
        if (dragging && drag.from === i) { drawDot(ctx, cx(i), cy(i), r, d, 1, 0.22); continue; }
        const sl = slideAt(i);
        drawDot(ctx, sl ? sl.x : cx(i), sl ? sl.y : cy(i), r, d);
        if (i === selected) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(cx(i), cy(i), r * 1.22, 0, TAU); ctx.stroke();
        }
      }

      // special effects, kept inside the board
      ctx.save();
      rrect(ctx, ox - 6, oy - 6, cell * w + 12, cell * h + 12, 14);
      ctx.clip();
      for (const f of fxs) {
        const k = (f.t - f.delay) / 0.4;
        if (k < 0 || k >= 1) continue;
        drawFx(ctx, f, k);
      }
      ctx.restore();

      // popping dots (still whole until their turn comes)
      for (const b of bursts) {
        const k = Math.max(0, Math.min(1, (b.t - b.delay) / POP));
        const i = b.y * w + b.x;
        const sl = slideAt(i);
        const x = sl ? sl.x : cx(i), y = sl ? sl.y : cy(i);
        const scale = k < 0.3 ? 1 + (k / 0.3) * 0.25 : 1.25 * (1 - (k - 0.3) / 0.7);
        const alpha = k < 0.3 ? 1 : 1 - (k - 0.3) / 0.7;
        drawDot(ctx, x, y, r, b, scale, alpha);
        if (k > 0 && k < 1) {
          ctx.strokeStyle = COLORS[b.c];
          ctx.globalAlpha = (1 - k) * 0.6;
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(x, y, r * (1 + k * 1.1), 0, TAU); ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }

      // the held dot, or one flying back
      if (dragging) {
        ctx.shadowColor = 'rgba(0,0,0,0.45)';
        ctx.shadowBlur = 14;
        drawDot(ctx, drag.pos.x, drag.pos.y, r, g[drag.from], 1.12);
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
      }
      floaters.draw(ctx);
    }

    // One flash for a special that pops: a sweep along its line, a growing square, lines to
    // its color, or two diagonals.
    function drawFx(ctx, f, k) {
      const { cell, ox, oy } = L;
      const { w, h } = game.board;
      const x = L.ox + (f.x + 0.5) * cell, y = L.oy + (f.y + 0.5) * cell;
      const reveal = ease.out(Math.min(1, k * 2.2));
      const span = Math.max(w, h) * cell * 1.5 * reveal;
      ctx.globalAlpha = 0.6 * (1 - k);
      ctx.fillStyle = ctx.strokeStyle = '#ffffff';
      if (f.k === 'H') ctx.fillRect(x - span, y - cell * 0.3, span * 2, cell * 0.6);
      else if (f.k === 'V') ctx.fillRect(x - cell * 0.3, y - span, cell * 0.6, span * 2);
      else if (f.k === 'P') {
        const q = cell * 3 * ease.out(Math.min(1, k * 1.6));
        rrect(ctx, x - q / 2, y - q / 2, q, q, cell * 0.4);
        ctx.fill();
      } else if (f.k === 'B') {
        ctx.lineWidth = 3;
        ctx.strokeStyle = COLORS[f.c];
        for (const d of f.targets) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(lerp(x, ox + (d.x + 0.5) * cell, reveal), lerp(y, oy + (d.y + 0.5) * cell, reveal));
          ctx.stroke();
        }
      } else if (f.k === 'S') {
        ctx.lineWidth = cell * 0.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x - span, y - span); ctx.lineTo(x + span, y + span);
        ctx.moveTo(x + span, y - span); ctx.lineTo(x - span, y + span);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // ---------- animation ----------
    const ticker = loop((dt) => {
      if (destroyed) return false;
      let busy = floaters.update(dt);
      for (const a of slides) a.t += dt;
      slides = slides.filter((a) => a.t < SLIDE);
      for (const b of bursts) b.t += dt;
      bursts = bursts.filter((b) => b.t - b.delay < POP);
      for (const f of fxs) f.t += dt;
      fxs = fxs.filter((f) => f.t - f.delay < 0.4);
      if (hint) { hint.t += dt; if (hint.t > 4) hint = null; }
      draw();
      busy = busy || slides.length > 0 || bursts.length > 0 || fxs.length > 0 || !!hint || !!drag;
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

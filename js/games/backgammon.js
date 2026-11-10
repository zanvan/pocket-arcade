// Backgammon (שש-בש): you against the computer, drawn on one canvas turned to portrait.
// Right column holds points 1..12 (1 at the bottom), left column 13..24 (24 at the bottom),
// so your home (1..6) is bottom right. The bar is a strip across the middle.
import { t, addHebrew } from '../core/i18n.js';
import he from '../i18n/he/backgammon.js';
import { el, surface, loop, rrect, ease, clamp, ICONS } from '../core/ui.js';
import * as bg from '../logic/backgammon.js';

addHebrew(he);

const { P, C, BAR, OFF } = bg;
const SAVE = 'backgammon.save';
const T_PLAYER = 0.2;     // seconds a checker takes to fly, your moves
const T_COMPUTER = 0.35;  // and the computer's, slower so you can follow

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const game = {
  id: 'backgammon',
  get title() { return t('Backgammon'); },
  icon: `<svg viewBox="0 0 64 64"><rect x="6" y="6" width="52" height="52" rx="14" fill="#232a44"/>
    <path d="M12 12h10l-5 17zM32 12h10l-5 17z" fill="#8a5a3a"/><path d="M22 12h10l-5 17zM42 12h10l-5 17z" fill="#4a7488"/>
    <path d="M12 52h10l-5-17zM32 52h10l-5-17z" fill="#4a7488"/><path d="M22 52h10l-5-17zM42 52h10l-5-17z" fill="#8a5a3a"/>
    <circle cx="17" cy="47.5" r="4.4" fill="#f6f1e3" stroke="#8a7f62" stroke-width="1.2"/><circle cx="17" cy="39" r="4.4" fill="#f6f1e3" stroke="#8a7f62" stroke-width="1.2"/>
    <circle cx="47" cy="16.5" r="4.4" fill="#c42a3c" stroke="#5a0a14" stroke-width="1.2"/><circle cx="47" cy="25" r="4.4" fill="#c42a3c" stroke="#5a0a14" stroke-width="1.2"/></svg>`,
  info: (store) => t('Won {w} · Lost {l}', { w: store.get('backgammon.wins', 0), l: store.get('backgammon.losses', 0) }),
  get help() {
    return t(`<ul><li>Your checkers are white. Move them to your home, bottom right: up the left side, then down the right. The red checkers go the other way.</li><li>Tap <b>Roll dice</b>, tap a checker, then tap a lit spot to move it. Tap the checker again to cancel. <b>Undo</b> takes back a move.</li><li>Use every die you can. Doubles give four moves.</li><li>You cannot land on a point with two or more red checkers. A single red checker is <b>hit</b>: it goes to the bar and starts again.</li><li>If your checker is hit, bring it back in first.</li><li>With all 15 checkers home, tap the tray at the bottom to bear them off. First to bear off all 15 wins. If the loser has none off, it is a <b>gammon</b>.</li><li>The number under each name is how far that side still has to go. Lower is better.</li></ul>`);
  },

  mount(root, app) {
    let g = loadSave();           // the whole game, saved after every action
    let L = null;                 // layout
    let steps = [];               // single steps you may take right now
    let selected = null;          // BAR, a point number, or null
    let busy = false;             // an animation or the computer is running
    let anim = null;              // checker in flight
    let rollFx = null;            // dice tumbling
    let destroyed = false;
    let blocked = false;          // help dialog open: hold the computer back
    let waiters = [];
    let gen = 0;                  // counts games; a wait that started in an older game must stop
    let openingNote = '';         // who won the opening roll, shown as the status line until you act
    const stale = (k) => destroyed || k !== gen;

    // ---------- page ----------
    const hud = el('div', 'hud');
    const chipC = makeChip(t('Computer'), '#c42a3c');
    const chipP = makeChip(t('You'), '#f6f1e3');
    hud.append(chipC.box, chipP.box);
    const stage = el('div', 'stage');
    const ctl = el('div');
    ctl.style.cssText = 'flex:none;padding:6px 14px 12px;display:flex;flex-direction:column;gap:8px;align-items:stretch';
    const status = el('div');
    status.style.cssText = 'text-align:center;font-size:15px;font-weight:600;min-height:22px;line-height:22px';
    const mainBtn = el('button', 'pill primary');
    mainBtn.style.cssText = 'justify-content:center;font-size:20px;font-weight:700;min-height:56px;border-radius:16px;width:100%';
    ctl.append(status, mainBtn);
    root.append(hud, stage, ctl);

    const undoBtn = app.action(ICONS.undo, t('Undo'), undo);
    app.action(ICONS.help, t('How to play'), () => app.modal({ title: t('Backgammon'), html: game.help }));
    app.action(ICONS.restart, t('New game'), askNewGame);
    mainBtn.addEventListener('click', onMain);

    function makeChip(label, dot) {
      const box = el('div', 'chip');
      const k = el('div', 'k');
      const sw = el('span');
      sw.style.cssText = `display:inline-block;width:10px;height:10px;border-radius:50%;background:${dot};margin-inline-end:6px;vertical-align:-1px`;
      k.append(sw, document.createTextNode(label));
      const v = el('div', 'v');
      box.append(k, v);
      return { box, v };
    }

    const s = surface(stage, () => { layout(); draw(); });

    // ---------- saving ----------
    function loadSave() {
      const v = app.store.get(SAVE, null);
      try {
        if (v && v.board && v.board.pts.length === 25 && bg.checkerTotal(v.board, P) === 15 && bg.checkerTotal(v.board, C) === 15 && v.phase !== 'over') return v;
      } catch { /* damaged save: start fresh */ }
      return null;
    }
    function save() { app.store.set(SAVE, g); }

    // ---------- helpers on the game ----------
    function remaining() {
      const rem = g.dice ? bg.diceMoves(g.dice) : [];
      for (const m of g.played) {
        const k = rem.indexOf(m.die);
        if (k >= 0) rem.splice(k, 1);
      }
      return rem;
    }
    const leftToPlay = () => (g.dice ? g.need - g.played.length : 0);

    function gate() {
      return blocked ? new Promise((r) => waiters.push(r)) : Promise.resolve();
    }

    // ---------- layout ----------
    function layout() {
      const w = s.w, h = s.h;
      const mx = Math.max(2, Math.round(w * 0.015));
      const trayH = clamp(Math.round(h * 0.06), 24, 42);
      const gap = 4;
      const by0 = trayH + gap;
      const by1 = Math.max(by0 + 60, h - trayH - gap);
      const barH = clamp(Math.round((by1 - by0) * 0.11), 36, 80);
      const half = Math.max(6, (by1 - by0 - barH) / 2);
      const ph = half / 6;
      const midGap = Math.max(4, Math.round(w * 0.02));
      const colW = Math.max(8, (w - 2 * mx - midGap) / 2);
      const d = Math.max(6, Math.min(ph * 0.92, colW / 3.2));
      const ds = clamp(barH * 0.66, 18, 40);
      L = { w, h, mx, trayH, gap, by0, by1, barH, half, ph, midGap, colW, d, ds, barY: by0 + half, leftX: mx, rightX: mx + colW + midGap, pr: [] };
      for (let p = 1; p <= 24; p++) {
        let top, row;
        if (p >= 19) { top = false; row = p - 19; }
        else if (p >= 13) { top = true; row = p - 13; }
        else if (p >= 7) { top = true; row = 12 - p; }
        else { top = false; row = 6 - p; }
        const y = by0 + (top ? 0 : half + barH) + row * ph;
        const isLeft = p >= 13;
        L.pr[p] = { x: isLeft ? L.leftX : L.rightX, y, w: colW, h: ph, left: isLeft, cy: y + ph / 2 };
      }
    }

    function slotXY(p, i, n) {
      const r = L.pr[p];
      const len = r.w - 6;
      const step = n > 1 ? Math.min(L.d, (len - L.d) / (n - 1)) : 0;
      const dist = 3 + L.d / 2 + i * step;
      return { x: r.left ? r.x + dist : r.x + r.w - dist, y: r.cy };
    }

    function barSlot(side, i, n) {
      const x0 = L.mx, x1 = L.w - L.mx;
      const zone = Math.max(L.d, (x1 - x0 - L.ds * 4.6) / 2);
      const step = n > 1 ? Math.min(L.d, Math.max(4, (zone - L.d - 6) / (n - 1))) : 0;
      const dist = 4 + L.d / 2 + i * step;
      return { x: side === C ? x0 + dist : x1 - dist, y: L.barY + L.barH / 2 };
    }

    function trayRect(side) {
      return { x: L.mx, y: side === P ? L.h - L.trayH : 0, w: L.w - 2 * L.mx, h: L.trayH };
    }
    function trayChip(side, i) {
      const r = trayRect(side);
      const cw = clamp((r.w - 16) / 16 - 3, 3, 18);
      return { x: r.x + 8 + cw / 2 + i * (cw + 3), y: r.y + r.h / 2, cw };
    }

    // Where a single checker of `side` sits at `from` (its top one) or lands at `to`.
    function sourceXY(board, side, from) {
      if (from === BAR) { const n = board.bar[side]; return barSlot(side, n - 1, n); }
      const n = Math.abs(board.pts[from]);
      return slotXY(from, n - 1, n);
    }
    function targetXY(board, side, to) {
      if (to === OFF) { const c = trayChip(side, board.off[side]); return { x: c.x, y: c.y }; }
      const sgn = side === P ? 1 : -1;
      const n = board.pts[to] * sgn > 0 ? Math.abs(board.pts[to]) : 0;
      return slotXY(to, n, n + 1);
    }

    // ---------- input ----------
    function regionAt(x, y) {
      if (!L) return null;
      if (y >= L.by1) return OFF;
      if (y >= L.barY - 2 && y <= L.barY + L.barH + 2) return x > L.w / 2 ? BAR : null;
      if (y < L.by0 || y > L.by1) return null;
      const left = x < L.mx + L.colW + L.midGap / 2;
      const top = y < L.barY;
      const row = clamp(Math.floor(((top ? y - L.by0 : y - L.barY - L.barH)) / L.ph), 0, 5);
      if (left) return top ? 13 + row : 19 + row;
      return top ? 12 - row : 6 - row;
    }

    s.canvas.addEventListener('pointerdown', (e) => {
      if (busy || destroyed || !g || g.phase !== 'move') return;
      const p = s.point(e);
      tap(regionAt(p.x, p.y));
    });

    function tap(r) {
      if (r === null) { deselect(); return; }
      const isSource = steps.some((st) => st.from === r);
      if (selected !== null) {
        if (r === selected) { deselect(); app.sfx('tap'); return; }
        const cands = steps.filter((st) => st.from === selected && st.to === r).sort((a, b) => a.die - b.die);
        if (cands.length) { play(cands[0]); return; }
        if (isSource) { select(r); return; }
        app.sfx('bump');
        app.haptic(15);
        deselect();
        return;
      }
      if (isSource) { select(r); return; }
      app.sfx('bump');
      if (g.board.bar.p > 0 && r !== BAR) app.toast(t('Bring your checker in from the bar'));
    }

    function select(r) {
      selected = r;
      openingNote = '';
      app.sfx('select');
      app.haptic(6);
      updateStatus();
      ticker.kick();
    }
    function deselect() {
      if (selected === null) return;
      selected = null;
      updateStatus();
      ticker.kick();
    }

    // ---------- moves ----------
    function animateMove(side, move, dur) {
      return new Promise((resolve) => {
        anim = { side, move, k: 0, dur, resolve };
        ticker.kick();
      });
    }

    function finishAnim() {
      const a = anim;
      anim = null;
      bg.applyMove(g.board, a.side, a.move); // also records a.move.hit
      g.played.push(a.move);
      app.sfx(a.move.hit ? 'bump' : a.move.to === OFF ? 'place' : 'move');
      if (a.move.hit) app.haptic(25);
      a.resolve();
    }

    async function play(step) {
      busy = true;
      selected = null;
      openingNote = '';
      const my = gen;
      const move = { ...step };
      await animateMove(P, move, T_PLAYER);
      if (stale(my)) return;
      if (bg.winner(g.board)) { busy = false; finishGame(); return; }
      save();
      busy = false;
      refresh();
    }

    function undo() {
      if (busy || destroyed || !g || g.phase !== 'move' || !g.played.length) return;
      const m = g.played.pop();
      bg.undoMove(g.board, P, m);
      selected = null;
      app.sfx('tap');
      save();
      refresh();
    }

    function rollFxStart(dur = 0.5) {
      return new Promise((resolve) => {
        rollFx = { k: 0, dur, resolve, idx: -1, faces: [1, 1] };
        app.sfx('select');
        ticker.kick();
      });
    }

    async function onRoll() {
      const my = gen;
      busy = true;
      refresh();
      g.dice = bg.rollDice();
      g.played = [];
      g.need = 0;
      save();
      await rollFxStart();
      if (stale(my)) return;
      g.need = bg.maxDiceUsable(g.board, P, g.dice);
      if (g.need === 0) {
        g.phase = 'pass';
        save();
        app.toast(t('No legal moves'));
        busy = false;
        refresh();
        await sleep(1500);
        if (stale(my)) return;   // a new game may have started during the pause
        endPlayerTurn();
        return;
      }
      g.phase = 'move';
      save();
      busy = false;
      refresh();
    }

    function endPlayerTurn() {
      g.turn = C;
      g.phase = 'cturn';
      g.dice = null;
      g.played = [];
      g.plan = null;
      g.need = 0;
      selected = null;
      save();
      refresh();
      computerTurn();
    }

    async function computerTurn() {
      if (busy) return;
      const my = gen;
      busy = true;
      refresh();
      await gate();
      await sleep(g.dice ? 250 : 500);
      if (stale(my)) return;
      await gate();
      if (!g.dice) {
        g.dice = bg.rollDice();
        g.played = [];
        g.plan = null;
        save();
        await rollFxStart();
        if (stale(my)) return;
      }
      if (!g.plan) {
        g.plan = bg.chooseMove(g.board, C, g.dice);
        g.need = g.plan.length;
        save();
      }
      if (!g.plan.length) {
        app.toast(t('Computer has no legal moves'));
        await sleep(1500);
        if (stale(my)) return;
      } else {
        await sleep(450);
        while (g.played.length < g.plan.length) {
          if (stale(my)) return;
          await gate();
          if (stale(my)) return;
          const mv = g.plan[g.played.length];
          await animateMove(C, mv, T_COMPUTER);
          if (stale(my)) return;
          if (bg.winner(g.board)) { busy = false; finishGame(); return; }
          save();
          refresh();
        }
        await sleep(450);
        if (stale(my)) return;
      }
      openingNote = '';
      g.turn = P;
      g.phase = 'roll';
      g.dice = null;
      g.played = [];
      g.plan = null;
      g.need = 0;
      save();
      busy = false;
      refresh();
    }

    // ---------- start, end ----------
    function newGame() {
      gen++;   // anything still waiting from the old game stops
      const waitingAnim = anim, waitingRoll = rollFx;
      anim = null;
      rollFx = null;
      waitingAnim?.resolve();
      waitingRoll?.resolve();
      const o = bg.openingRoll();
      g = { board: bg.newState(), turn: o.starter, phase: 'move', dice: o.dice, played: [], need: 0, plan: null, recorded: false, winner: null };
      selected = null;
      busy = false;
      // The result goes on the status line (see updateStatus), where it hides neither the help
      // dialog nor the pip counts.
      if (o.starter === P) {
        g.need = bg.maxDiceUsable(g.board, P, o.dice);
        openingNote = t('Opening roll: you {a}, computer {b}. You start.', { a: o.p, b: o.c });
      } else {
        g.phase = 'cturn';
        g.plan = bg.chooseMove(g.board, C, o.dice);
        g.need = g.plan.length;
        openingNote = t('Opening roll: you {a}, computer {b}. Computer starts.', { a: o.p, b: o.c });
      }
      save();
      refresh();
      if (o.starter === C) computerTurn();
    }

    async function askNewGame() {
      if (busy && g.phase !== 'over') return;
      if (g.phase !== 'over') {
        const v = await app.modal({
          title: t('New game?'),
          html: `<p style="text-align:center">${t('The current game will be lost.')}</p>`,
          buttons: [{ label: t('Cancel'), value: false }, { label: t('New game'), value: true, primary: true }],
        });
        if (!v || destroyed) return;
      }
      newGame();
    }

    function finishGame() {
      g.phase = 'over';
      g.winner = bg.winner(g.board);
      const won = g.winner === P;
      if (!g.recorded) {
        g.recorded = true;
        const key = won ? 'backgammon.wins' : 'backgammon.losses';
        app.store.set(key, app.store.get(key, 0) + 1);
      }
      app.store.del(SAVE);   // a finished game is not resumed
      refresh();
      const my = gen;
      setTimeout(() => showResult(my), 500);
    }

    async function showResult(my) {
      if (stale(my)) return;
      const won = g.winner === P;
      app.sfx(won ? 'win' : 'lose');
      const gammon = bg.isGammon(g.board);
      const w = app.store.get('backgammon.wins', 0);
      const l = app.store.get('backgammon.losses', 0);
      const v = await app.modal({
        title: won ? t('You win!') : t('Computer wins'),
        html: `${gammon ? `<p style="text-align:center;font-size:24px;font-weight:800;color:#ffd23f;margin:4px 0">${t('Gammon!')}</p>` : ''}<p style="text-align:center">${t('Won {w} · Lost {l}', { w, l })}</p>`,
        buttons: [{ label: t('New game'), value: true, primary: true }],
      });
      if (v && !stale(my)) newGame();
    }

    // ---------- buttons and text ----------
    function onMain() {
      if (busy || destroyed) return;
      app.sfx('tap');
      if (g.phase === 'roll') onRoll();
      else if (g.phase === 'move') endPlayerTurn();
      else if (g.phase === 'over') newGame();
    }

    function refresh() {
      steps = [];
      if (g.phase === 'move' && !busy) steps = bg.singleStepTargets(g.board, P, remaining(), leftToPlay());
      if (selected !== null && !steps.some((st) => st.from === selected)) selected = null;
      chipP.v.textContent = String(bg.pipCount(g.board, P));
      chipC.v.textContent = String(bg.pipCount(g.board, C));
      const finished = g.phase === 'move' && !busy && steps.length === 0;
      const label = g.phase === 'roll' ? t('Roll dice') : g.phase === 'over' ? t('New game') : t('Done');
      mainBtn.textContent = label;
      const show = !busy && (g.phase === 'roll' || g.phase === 'over' || finished);
      mainBtn.style.visibility = show ? 'visible' : 'hidden';
      undoBtn.disabled = busy || g.phase !== 'move' || !g.played.length;
      updateStatus();
      ticker.kick();
    }

    function updateStatus() {
      let text = '';
      if (openingNote && !blocked && (g.phase === 'move' || g.phase === 'cturn')) text = openingNote;
      else if (g.phase === 'roll') text = t('Your turn: tap Roll dice');
      else if (g.phase === 'move') {
        if (busy) text = '';
        else if (!steps.length) text = remaining().length ? t('No more moves. Tap Done.') : t('All dice used. Tap Done.');
        else if (selected !== null) text = t('Tap a lit spot to move there');
        else text = g.board.bar.p > 0 ? t('Bring your checker in from the bar') : t('Your move: tap a checker');
      } else if (g.phase === 'pass') text = t('No legal moves');
      else if (g.phase === 'cturn') text = t('Computer is playing…');
      else if (g.phase === 'over') text = g.winner === P ? t('You win!') : t('Computer wins');
      status.textContent = text;
    }

    // ---------- drawing ----------
    const COLORS = {
      felt: '#1b2c33', frame: '#0c1519', triA: '#8a5a3a', triB: '#4a7488', strip: '#0f1a1e',
      gold: '#ffd23f', hit: '#ff5d6c',
    };

    function triPath(ctx, r) {
      const inset = 1.5;
      ctx.beginPath();
      if (r.left) {
        ctx.moveTo(r.x, r.y + inset);
        ctx.lineTo(r.x + r.w - 3, r.y + r.h / 2);
        ctx.lineTo(r.x, r.y + r.h - inset);
      } else {
        ctx.moveTo(r.x + r.w, r.y + inset);
        ctx.lineTo(r.x + 3, r.y + r.h / 2);
        ctx.lineTo(r.x + r.w, r.y + r.h - inset);
      }
      ctx.closePath();
    }

    function drawChecker(ctx, x, y, d, side, alpha = 1) {
      const r = Math.max(2, d / 2);
      const ivory = side === P;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(x, y + 1.5, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fill();
      const gr = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
      gr.addColorStop(0, ivory ? '#fffdf5' : '#e8505f');
      gr.addColorStop(1, ivory ? '#d6cdb0' : '#8c1222');
      ctx.beginPath();
      ctx.arc(x, y, r - 0.5, 0, Math.PI * 2);
      ctx.fillStyle = gr;
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = ivory ? '#7c7156' : '#3a0710';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, r * 0.62, 0, Math.PI * 2);
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = ivory ? 'rgba(120,105,70,0.5)' : 'rgba(255,255,255,0.32)';
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    function drawRing(ctx, x, y, d, color, width = 3) {
      ctx.beginPath();
      ctx.arc(x, y, d / 2 + 2, 0, Math.PI * 2);
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      ctx.stroke();
    }

    function countLabel(ctx, x, y, d, n, side) {
      ctx.font = `800 ${Math.round(d * 0.5)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = side === P ? '#2b2416' : '#ffffff';
      ctx.fillText(String(n), x, y + 0.5);
    }

    function drawStack(ctx, p, n, side) {
      for (let i = 0; i < n; i++) {
        const q = slotXY(p, i, n);
        drawChecker(ctx, q.x, q.y, L.d, side);
        if (i === n - 1 && n > 5) countLabel(ctx, q.x, q.y, L.d, n, side);
      }
    }

    function drawBarStack(ctx, side, n) {
      for (let i = 0; i < n; i++) {
        const q = barSlot(side, i, n);
        drawChecker(ctx, q.x, q.y, L.d, side);
        if (i === n - 1 && n > 3) countLabel(ctx, q.x, q.y, L.d, n, side);
      }
    }

    function drawTray(ctx, side, n, glow) {
      const r = trayRect(side);
      rrect(ctx, r.x, r.y + 2, r.w, r.h - 4, 8);
      ctx.fillStyle = COLORS.strip;
      ctx.fill();
      if (glow) {
        ctx.fillStyle = 'rgba(255,210,63,0.28)';
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = COLORS.gold;
        ctx.stroke();
      }
      for (let i = 0; i < n; i++) {
        const c = trayChip(side, i);
        const h = r.h - 12;
        rrect(ctx, c.x - c.cw / 2, c.y - h / 2, c.cw, h, Math.min(3, c.cw / 2));
        ctx.fillStyle = side === P ? '#f2ecd8' : '#b3202f';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = side === P ? '#7c7156' : '#3a0710';
        ctx.stroke();
      }
    }

    const PIPS = {
      1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]],
      4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
      6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
    };
    function drawDie(ctx, cx, cy, size, value, side, alpha, dy = 0) {
      ctx.globalAlpha = alpha;
      const x = cx - size / 2, y = cy - size / 2 + dy;
      rrect(ctx, x + 1, y + 2, size, size, size * 0.2);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fill();
      rrect(ctx, x, y, size, size, size * 0.2);
      ctx.fillStyle = side === P ? '#f6f1e3' : '#c42a3c';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = side === P ? '#7c7156' : '#3a0710';
      ctx.stroke();
      ctx.fillStyle = side === P ? '#2b2416' : '#fff6f0';
      for (const [px, py] of PIPS[value] || []) {
        ctx.beginPath();
        ctx.arc(cx + px * size * 0.25, cy + dy + py * size * 0.25, size * 0.075 + 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function drawDice(ctx) {
      const cy = L.barY + L.barH / 2;
      let list, side, spentAll = false;
      if (rollFx) {
        list = rollFx.faces.slice();
        side = g.turn;
      } else if (g.dice && g.phase !== 'roll') {
        list = bg.diceMoves(g.dice);
        side = g.turn;
        spentAll = leftToPlay() <= 0 && !anim;
      } else return;
      const rem = rollFx ? list.slice() : remaining();
      const gapD = L.ds * 1.2;
      const x0 = L.w / 2 - (gapD * (list.length - 1)) / 2;
      list.forEach((v, i) => {
        let live = false;
        const k = rem.indexOf(v);
        if (k >= 0) { rem.splice(k, 1); live = true; }
        const dim = rollFx ? false : !live || spentAll;
        const jitter = rollFx ? Math.sin(rollFx.k * 40 + i * 2) * 2.5 : 0;
        drawDie(ctx, x0 + i * gapD + jitter * 0.3, cy, L.ds, v, side, dim ? 0.3 : 1, jitter);
      });
    }

    function draw() {
      const ctx = s.ctx;
      s.begin();
      if (!L || !g || s.w < 40 || s.h < 80) return;

      // board
      rrect(ctx, L.mx - 1, L.by0 - 2, L.w - 2 * L.mx + 2, L.by1 - L.by0 + 4, 10);
      ctx.fillStyle = COLORS.felt;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = COLORS.frame;
      ctx.stroke();
      for (let p = 1; p <= 24; p++) {
        triPath(ctx, L.pr[p]);
        ctx.fillStyle = p % 2 ? COLORS.triA : COLORS.triB;
        ctx.fill();
      }
      // the bar strip
      rrect(ctx, L.mx, L.barY, L.w - 2 * L.mx, L.barH, 8);
      ctx.fillStyle = COLORS.strip;
      ctx.fill();

      // What to show: during a flight, the moving checker is lifted off its stack.
      let board = g.board;
      if (anim) {
        board = bg.cloneState(g.board);
        const sgn = anim.side === P ? 1 : -1;
        if (anim.move.from === BAR) board.bar[anim.side]--; else board.pts[anim.move.from] -= sgn;
      }

      // highlights under the checkers
      const targets = selected !== null && !busy ? steps.filter((st) => st.from === selected) : [];
      if (selected !== null && selected !== BAR && !busy) {
        triPath(ctx, L.pr[selected]);
        ctx.fillStyle = 'rgba(255,210,63,0.2)';
        ctx.fill();
      }
      for (const st of targets) {
        if (st.to === OFF) continue;
        triPath(ctx, L.pr[st.to]);
        ctx.fillStyle = 'rgba(255,210,63,0.42)';
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = COLORS.gold;
        ctx.stroke();
      }

      // checkers
      for (let p = 1; p <= 24; p++) {
        const c = board.pts[p];
        if (c) drawStack(ctx, p, Math.abs(c), c > 0 ? P : C);
      }
      drawBarStack(ctx, C, board.bar.c);
      drawBarStack(ctx, P, board.bar.p);
      drawTray(ctx, C, board.off.c, false);
      drawTray(ctx, P, board.off.p, targets.some((st) => st.to === OFF));

      // markers on top of the checkers
      if (!busy && g.phase === 'move') {
        if (selected === null) {
          for (const from of new Set(steps.map((st) => st.from))) {
            const q = sourceXY(board, P, from);
            drawRing(ctx, q.x, q.y, L.d, 'rgba(255,210,63,0.85)', 2.5);
          }
        } else {
          const q = sourceXY(board, P, selected);
          drawRing(ctx, q.x, q.y, L.d, COLORS.gold, 4);
          for (const st of targets) {
            if (st.to === OFF) continue;
            const n = Math.abs(board.pts[st.to]);
            if (st.hit) {
              const hq = slotXY(st.to, 0, n);
              drawRing(ctx, hq.x, hq.y, L.d, COLORS.hit, 3.5);
            } else {
              const gq = targetXY(board, P, st.to);
              ctx.beginPath();
              ctx.arc(gq.x, gq.y, L.d / 2 - 2, 0, Math.PI * 2);
              ctx.fillStyle = 'rgba(255,210,63,0.5)';
              ctx.fill();
            }
          }
        }
      }

      drawDice(ctx);

      // the flying checker
      if (anim) {
        const a = anim;
        const from = sourceXY(g.board, a.side, a.move.from);
        const to = targetXY(g.board, a.side, a.move.to);
        const u = ease.inOut(clamp(a.k / a.dur, 0, 1));
        const x = from.x + (to.x - from.x) * u;
        const y = from.y + (to.y - from.y) * u - Math.sin(Math.PI * u) * L.d * 0.5;
        drawChecker(ctx, x, y, L.d * (1 + 0.12 * Math.sin(Math.PI * u)), a.side);
      }
    }

    // ---------- animation loop ----------
    const ticker = loop((dt) => {
      if (destroyed) return false;
      let more = false;
      if (anim) {
        anim.k += dt;
        more = true;
        if (anim.k >= anim.dur) finishAnim();
      }
      if (rollFx) {
        rollFx.k += dt;
        more = true;
        const idx = Math.floor(rollFx.k / 0.07);
        if (idx !== rollFx.idx) {
          rollFx.idx = idx;
          rollFx.faces = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
        }
        if (rollFx.k >= rollFx.dur) { const r = rollFx; rollFx = null; r.resolve(); }
      }
      draw();
      return more;
    });

    // ---------- start ----------
    if (!g) newGame();
    else {
      refresh();
      if (g.phase === 'cturn') computerTurn();
      else if (g.phase === 'pass') { const my = gen; busy = true; sleep(900).then(() => { if (!stale(my)) { busy = false; endPlayerTurn(); } }); }
    }

    return {
      destroy() {
        destroyed = true;
        ticker.stop();
        s.destroy();
        for (const f of waiters.splice(0)) f();
        anim?.resolve();
        rollFx?.resolve();
      },
      pause(hard) { if (hard) { blocked = true; updateStatus(); } },
      resume() { blocked = false; updateStatus(); for (const f of waiters.splice(0)) f(); },
    };
  },
};

export default game;

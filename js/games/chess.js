import { t, addHebrew } from '../core/i18n.js';
import he from '../i18n/he/chess.js';
import {
  Position, chooseMove, START_FEN, WHITE, BLACK, PAWN, KNIGHT, BISHOP, ROOK, QUEEN,
  moveFrom, moveTo, movePromo, isCapture,
} from '../logic/chess.js';
import { el, surface, loop, ease, lerp, ICONS } from '../core/ui.js';

addHebrew(he);

// ---------- Piece pictures ----------
// Drawn from paths in a 100 x 100 box, so every phone shows the same shapes (no font glyphs).
// Each piece is a few overlapping parts: all parts are outlined first, then filled, which
// gives one clean outline around the whole figure.
const circ = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
const BASE = 'M23 90H77V81Q77 77 73 77H27Q23 77 23 81Z';
const ART = {
  [PAWN]: {
    parts: [circ(50, 27, 11), 'M40 38H60Q59 49 64 57Q70 66 73 77H27Q30 66 36 57Q41 49 40 38Z', 'M33 44H67V52H33Z', BASE],
    lines: [], dots: [],
  },
  [ROOK]: {
    parts: ['M26 20H38V29H44V20H56V29H62V20H74V42L67 48L69 69L75 77H25L31 69L33 48L26 42Z', BASE],
    lines: ['M33 48H67'], dots: [],
  },
  [BISHOP]: {
    parts: [circ(50, 13, 5.5), 'M50 18C64 28 69 41 62 50H38C31 41 36 28 50 18Z', 'M41 49H59L63 66Q67 72 73 77H27Q33 72 37 66Z', 'M34 49H66V56H34Z', BASE],
    lines: ['M51 28L58 38'], dots: [],
  },
  [KNIGHT]: {
    parts: ['M27 77C27 64 31 55 40 47C34 48 30 52 25 53L19 47C19 40 27 31 35 26L36 14L45 21C48 19.5 51 19 54 19C69 21 80 38 78 58C77 66 76 72 74 77Z', BASE],
    lines: ['M52 30C60 33 66 42 66 52'], dots: [[41, 33, 3]],
  },
  [QUEEN]: {
    parts: ['M26 77L16 36L34 55L36 27L46 52L50 20L54 52L64 27L66 55L84 36L74 77Z', circ(16, 31, 5.5), circ(36, 22, 5.5), circ(50, 15, 5.5), circ(64, 22, 5.5), circ(84, 31, 5.5), BASE],
    lines: ['M29 66H71'], dots: [],
  },
  6: {
    parts: ['M46 5H54V12H61V20H54V28H46V20H39V12H46Z', 'M50 30C32 28 17 40 23 56C25 62 33 65 34 70L27 77H73L66 70C67 65 75 62 77 56C83 40 68 28 50 30Z', BASE],
    lines: ['M31 66H69'], dots: [],
  },
};
const INK = {
  [WHITE]: { fill: '#fbf5e2', line: '#2a2018' },
  [BLACK]: { fill: '#24242c', line: '#ddd5bf' },
};

let path2d = null;   // Path2D objects, made on first use
function paths(type) {
  if (!path2d) {
    path2d = {};
    for (const [k, a] of Object.entries(ART)) {
      path2d[k] = { parts: a.parts.map((d) => new Path2D(d)), lines: a.lines.map((d) => new Path2D(d)) };
    }
  }
  return path2d[type];
}

// One piece centred on (cx, cy) inside a square of `size` pixels.
function drawPiece(ctx, pc, cx, cy, size) {
  const type = pc & 7;
  const ink = INK[pc >> 3];
  const p = paths(type);
  const k = (size * 0.92) / 100;
  ctx.save();
  ctx.translate(cx - 50 * k, cy - 50 * k + size * 0.02);
  ctx.scale(k, k);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(6, 2.2 / k);
  ctx.strokeStyle = ink.line;
  ctx.fillStyle = ink.line;
  for (const part of p.parts) { ctx.stroke(part); ctx.fill(part); }
  ctx.fillStyle = ink.fill;
  for (const part of p.parts) ctx.fill(part);
  ctx.lineWidth = Math.max(2.4, 1 / k);
  for (const ln of p.lines) ctx.stroke(ln);
  ctx.fillStyle = ink.line;
  for (const [x, y, r] of ART[type].dots) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

// The same picture as inline SVG, for the promotion dialog and the menu icon.
function pieceSvg(pc, extra = '') {
  const a = ART[pc & 7];
  const ink = INK[pc >> 3];
  const ps = a.parts.map((d) => `<path d="${d}"/>`).join('');
  const ls = a.lines.map((d) => `<path d="${d}"/>`).join('');
  const ds = a.dots.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('');
  return `<g ${extra}><g fill="${ink.line}" stroke="${ink.line}" stroke-width="6" stroke-linejoin="round">${ps}</g>`
    + `<g fill="${ink.fill}">${ps}</g>`
    + `<g fill="none" stroke="${ink.line}" stroke-width="2.4" stroke-linecap="round">${ls}</g>`
    + `<g fill="${ink.line}">${ds}</g></g>`;
}

function icon() {
  let squares = '';
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    squares += `<rect x="${6 + c * 13}" y="${6 + r * 13}" width="13" height="13" fill="${(r + c) % 2 ? '#3a4060' : '#2d3350'}"/>`;
  }
  return `<svg viewBox="0 0 64 64"><rect x="6" y="6" width="52" height="52" rx="14" fill="#232a44"/>
    <clipPath id="chessclip"><rect x="6" y="6" width="52" height="52" rx="14"/></clipPath><g clip-path="url(#chessclip)">${squares}</g>
    ${pieceSvg(WHITE << 3 | KNIGHT, 'transform="translate(11 8) scale(.42)"')}</svg>`;
}

// ---------- Texts that depend on the language ----------
function levelName(level) {
  return level === 'easy' ? t('Easy') : level === 'hard' ? t('Hard') : t('Medium');
}

function recordText(store, level) {
  const r = (store.get('chess.rec', {}) || {})[level] || {};
  const w = r.w || 0, d = r.d || 0, l = r.l || 0;
  if (!w && !d && !l) return t('{level} · no games yet', { level: levelName(level) });
  return t('{level} · Wins {w} · Draws {d} · Losses {l}', { level: levelName(level), w, d, l });
}

function reasonText(over) {
  switch (over.reason) {
    case 'checkmate': return over.winner === WHITE ? t('Checkmate! Well played.') : t('Checkmate. The computer won this time.');
    case 'stalemate': return t('Stalemate: the player to move has no legal move, and is not in check.');
    case 'insufficient': return t('Not enough pieces left to give checkmate.');
    case 'fifty': return t('Fifty moves in a row without a capture or a pawn move.');
    default: return t('The same position came up three times.');
  }
}

const LEVELS = ['easy', 'medium', 'hard'];
const VALUE = { 1: 1, 2: 3, 3: 3, 4: 5, 5: 9, 6: 0 };

export default {
  id: 'chess',
  get title() { return t('Chess'); },
  icon: icon(),
  info: (store) => recordText(store, store.get('chess.level', 'medium')),
  get help() {
    return t(`<ul><li>You play <b>White</b> and move first. Tap a piece, then tap a dot to move it.</li><li>A dot is a free square. A ring is a piece you can capture.</li><li><b>Undo</b> takes back your move and the computer's reply. <b>Hint</b> suggests a move.</li><li><b>New game</b> lets you choose Easy, Medium or Hard.</li><li>Your game is saved, so you can come back to it later.</li></ul>`);
  },

  mount(root, app) {
    let pos, moves, level, over, selected, targets, hint, anim;
    let thinking = '';         // text shown while the computer works, '' when idle
    let destroyed = false;
    let timer = 0;
    let L = {};
    let recorded = false;      // the result of this game is already in the record

    const stage = el('div', 'stage');
    root.append(stage);
    const undoBtn = app.action(ICONS.undo, t('Undo'), undo);
    const hintBtn = app.action(ICONS.hint, t('Hint'), showHint);
    app.action(ICONS.restart, t('New game'), () => newGameDialog());

    const s = surface(stage, () => { layout(); draw(); });

    // Runs fn once the browser has painted the current frame. A timer backs this up, because
    // a page in the background does not paint at all.
    function afterPaint(fn) {
      let done = false;
      const go = () => { if (!done) { done = true; fn(); } };
      requestAnimationFrame(() => setTimeout(go, 20));
      setTimeout(go, 250);
    }

    // ---------- game state ----------
    function save() {
      app.store.set('chess.save', { v: 1, start: START_FEN, moves, level, over: recorded ? { reason: over?.reason, winner: over?.winner } : null });
    }

    function resetGame(lv) {
      level = lv;
      pos = Position.start();
      moves = [];
      over = null;
      recorded = false;
      selected = -1;
      targets = [];
      hint = null;
      anim = null;
      thinking = '';
      clearTimeout(timer);
      app.store.set('chess.level', level);
      save();
      refresh();
    }

    // Rebuilds the game from the saved move list. Returns false when the save is unusable.
    function restore() {
      const sv = app.store.get('chess.save', null);
      if (!sv || sv.v !== 1 || !Array.isArray(sv.moves) || !LEVELS.includes(sv.level)) return false;
      try {
        const p = Position.fromFen(sv.start || START_FEN);
        for (const m of sv.moves) {
          if (!p.legalMoves().includes(m)) return false;
          p.makeMove(m);
        }
        pos = p;
        moves = sv.moves.slice();
        level = sv.level;
        selected = -1; targets = []; hint = null; anim = null; thinking = '';
        const st = pos.status();
        over = st.over ? st : null;
        recorded = !!(sv.over && st.over);
        return true;
      } catch {
        return false;
      }
    }

    function refresh() {
      const myTurn = !over && !thinking && pos.side === WHITE;
      undoBtn.disabled = !!thinking || moves.length < 1;
      hintBtn.disabled = !myTurn;
      layout();
      s.canvas.style.cursor = '';
      ticker.kick();
    }

    // ---------- moves ----------
    function selectSquare(sq) {
      selected = sq;
      targets = sq >= 0 ? pos.legalMoves().filter((m) => moveFrom(m) === sq) : [];
    }

    function applyMove(m, byComputer) {
      const from = moveFrom(m), to = moveTo(m);
      const piece = pos.board[from];
      anim = { piece, from, to, t: 0 };
      pos.makeMove(m);
      moves.push(m);
      selectSquare(-1);
      hint = null;
      app.sfx(isCapture(m) ? 'place' : 'move');
      if (!byComputer) app.haptic(8);
      const st = pos.status();
      if (st.over) {
        over = st;
        finish();
      } else {
        if (pos.inCheck()) { app.sfx('select'); app.haptic(20); }
        if (pos.side === BLACK) startThinking(260);
      }
      save();
      refresh();
    }

    function startThinking(delay = 0) {
      thinking = t('Computer is thinking…');
      clearTimeout(timer);
      // Let the "thinking" text reach the screen first, then do the search.
      timer = setTimeout(() => {
        draw();
        afterPaint(computerMove);
      }, delay);
    }

    function computerMove() {
      if (destroyed || over || pos.side !== BLACK) return;
      let m = 0;
      try { m = chooseMove(pos, level); } catch (err) { console.error(err); }
      if (!m) m = pos.legalMoves()[0];
      thinking = '';
      if (m) applyMove(m, true);
      else refresh();
    }

    async function chooseTarget(cands) {
      if (cands.length === 1) return cands[0];
      const type = await promotionDialog();
      return cands.find((m) => movePromo(m) === type) || 0;
    }

    function promotionDialog() {
      const types = [QUEEN, ROOK, BISHOP, KNIGHT];
      const names = { [QUEEN]: t('Queen'), [ROOK]: t('Rook'), [BISHOP]: t('Bishop'), [KNIGHT]: t('Knight') };
      const btn = 'display:flex;flex-direction:column;align-items:center;gap:4px;width:74px;padding:8px 4px 6px;border-radius:14px;'
        + 'background:var(--panel2);color:var(--text);font-size:14px;font-weight:600;border:2px solid var(--line)';
      const html = `<div style="display:flex;gap:6px;justify-content:center;direction:ltr">${types.map((ty) => `<button data-p="${ty}" style="${btn}${ty === QUEEN ? ';border-color:var(--accent)' : ''}">`
        + `<svg viewBox="0 0 100 100" width="56" height="56">${pieceSvg(ty)}</svg><span>${names[ty]}</span></button>`).join('')}</div>`;
      return app.modal({
        title: t('Promote your pawn'),
        html,
        buttons: [{ label: t('Cancel'), value: 0 }],
        onOpen(body, close) {
          body.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => { app.sfx('select'); close(+b.dataset.p); }));
          body.querySelector('[data-p="5"]')?.focus();
        },
      }).then((v) => v || 0);
    }

    // ---------- input ----------
    let busy = false;      // a promotion dialog is open
    s.canvas.addEventListener('pointerdown', async (e) => {
      if (busy || over || thinking || destroyed || pos.side !== WHITE || !L.sq) return;
      const p = s.point(e);
      const f = Math.floor((p.x - L.x0) / L.sq);
      const r = 7 - Math.floor((p.y - L.by) / L.sq);
      if (f < 0 || f > 7 || r < 0 || r > 7) { selectSquare(-1); ticker.kick(); return; }
      const sq = r * 16 + f;
      hint = null;
      const cands = selected >= 0 ? targets.filter((m) => moveTo(m) === sq) : [];
      if (cands.length) {
        busy = true;
        draw();
        const m = await chooseTarget(cands);
        busy = false;
        if (destroyed) return;
        if (m) applyMove(m, false);
        else ticker.kick();
        return;
      }
      const pc = pos.board[sq];
      if (pc && (pc >> 3) === WHITE && sq !== selected) {
        selectSquare(sq);
        app.sfx('tap');
      } else {
        selectSquare(-1);
      }
      ticker.kick();
    });

    function undo() {
      if (thinking || busy || moves.length < 1) return;
      // Also works after the game ended: the game is open again and can end again later.
      // The result already in the record is taken out, so the next ending counts once.
      if (over) unrecord();
      clearTimeout(timer);   // the result dialog may still be waiting to open
      over = null;
      // Take back to the player's own turn: the computer's reply and the move before it.
      const n = pos.side === BLACK ? 1 : Math.min(2, moves.length);
      for (let i = 0; i < n; i++) { pos.unmakeMove(); moves.pop(); }
      anim = null;
      selectSquare(-1);
      hint = null;
      save();
      refresh();
    }

    function showHint() {
      if (over || thinking || busy || pos.side !== WHITE) return;
      thinking = t('Looking for a good move…');
      selectSquare(-1);
      hint = null;
      refresh();
      draw();
      afterPaint(() => {
        if (destroyed) return;
        let m = 0;
        try { m = chooseMove(pos, 'medium', { timeMs: 900 }); } catch (err) { console.error(err); }
        thinking = '';
        if (m) {
          hint = { from: moveFrom(m), to: moveTo(m) };
          app.toast(t('Hint: follow the arrow'), 2600);
          app.sfx('select');
        }
        refresh();
      });
    }

    // ---------- end of game ----------
    // Takes this game's result out of the record again (used when the player undoes the ending).
    function unrecord() {
      if (!recorded) return;
      recorded = false;
      const rec = app.store.get('chess.rec', {}) || {};
      const r = rec[level];
      if (!r) return;
      const key = over.winner === WHITE ? 'w' : over.winner === BLACK ? 'l' : 'd';
      r[key] = Math.max(0, (r[key] || 0) - 1);
      app.store.set('chess.rec', rec);
    }

    function finish() {
      const win = over.winner === WHITE;
      const lose = over.winner === BLACK;
      if (!recorded) {
        recorded = true;
        const rec = app.store.get('chess.rec', {}) || {};
        const r = rec[level] || { w: 0, d: 0, l: 0 };
        if (win) r.w++; else if (lose) r.l++; else r.d++;
        rec[level] = r;
        app.store.set('chess.rec', rec);
      }
      app.sfx(win ? 'win' : lose ? 'lose' : 'done');
      timer = setTimeout(async () => {
        if (destroyed) return;
        const title = win ? t('You win!') : lose ? t('Computer wins') : t('Draw');
        const v = await app.modal({
          title,
          html: `<p style="text-align:center">${reasonText(over)}</p><p style="text-align:center;font-size:13px">${recordText(app.store, level)}</p>`,
          buttons: [{ label: t('Close'), value: false }, { label: t('New game'), value: true, primary: true }],
        });
        if (v && !destroyed) newGameDialog();
      }, 700);
    }

    async function newGameDialog() {
      if (busy || thinking) return;
      let pick = level && LEVELS.includes(level) ? level : app.store.get('chess.level', 'medium');
      const segStyle = 'padding:12px 16px;font-size:16px';
      const html = `<p style="text-align:center">${t('Computer level')}</p>
        <div style="display:flex;justify-content:center"><div class="seg">${LEVELS.map((lv) => `<button data-l="${lv}" style="${segStyle}" class="${lv === pick ? 'on' : ''}">${levelName(lv)}</button>`).join('')}</div></div>`;
      const v = await app.modal({
        title: t('New game'),
        html,
        buttons: [{ label: t('Cancel'), value: false }, { label: t('Play'), value: true, primary: true }],
        onOpen(body) {
          body.querySelectorAll('[data-l]').forEach((b) => b.addEventListener('click', () => {
            pick = b.dataset.l;
            body.querySelectorAll('[data-l]').forEach((x) => x.classList.toggle('on', x === b));
          }));
        },
      });
      if (v && !destroyed) resetGame(pick);
    }

    // ---------- drawing ----------
    function layout() {
      const w = s.w, h = s.h;
      const gut = Math.max(14, Math.min(22, Math.round(w * 0.05)));
      const rowH = 28, statusH = 34, labelH = gut;
      let bs = Math.min(w - gut - 6, h - statusH - rowH * 2 - labelH - 6);
      bs = Math.max(8, Math.floor(bs / 8) * 8);
      const sq = bs / 8;
      const totalH = statusH + rowH + bs + labelH + rowH;
      const y0 = Math.max(0, Math.floor((h - totalH) / 2));
      L = { gut, rowH, statusH, labelH, bs, sq, y0, x0: Math.floor((w - gut - bs) / 2) + gut, by: y0 + statusH + rowH };
    }

    const cx = (f) => L.x0 + (f + 0.5) * L.sq;
    const cy = (r) => L.by + (7 - r + 0.5) * L.sq;

    function capturedRow(ctx, y, label, pieces, lead) {
      ctx.font = '600 13px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#9ba2b9';
      const x = L.x0;
      ctx.fillText(label, x, y);
      let px = x + ctx.measureText(label).width + 12;
      const size = 22;
      pieces.sort((a, b) => VALUE[b & 7] - VALUE[a & 7]);
      const step = Math.min(size * 0.7, Math.max(8, (L.x0 + L.bs - px - 40) / Math.max(1, pieces.length)));
      for (const pc of pieces) {
        drawPiece(ctx, pc, px + size / 2, y, size);
        px += step;
      }
      if (lead > 0) {
        ctx.fillStyle = '#eef0f7';
        ctx.font = '700 13px system-ui, sans-serif';
        // The page is right-to-left in Hebrew; keep the sign in front of the number.
        const dir = ctx.direction;
        ctx.direction = 'ltr';
        ctx.fillText('+' + lead, px + size / 2 + 4, y);
        ctx.direction = dir;
      }
    }

    function draw() {
      const { ctx } = s;
      s.begin();
      if (!pos || !L.sq || L.bs < 16) return;
      const { sq, x0, by } = L;

      // status line
      let status, color = '#eef0f7';
      if (over) {
        status = over.winner === WHITE ? t('You win!') : over.winner === BLACK ? t('Computer wins') : t('Draw');
        color = over.winner === WHITE ? '#3ecf8e' : over.winner === BLACK ? '#ff5d6c' : '#ffc857';
      } else if (thinking) {
        status = thinking;
        color = '#9bb0ff';
      } else if (pos.inCheck()) {
        status = t('Check! Your move');
        color = '#ff8a95';
      } else {
        status = t('Your move');
      }
      ctx.font = '700 19px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color;
      ctx.fillText(status, L.x0 + L.bs / 2, L.y0 + L.statusH / 2);

      // captured pieces: the row above the board is the computer's catch, below is yours
      const taken = pos.capturedList();
      const byYou = taken.filter((pc) => pc >> 3 === BLACK);
      const byComputer = taken.filter((pc) => pc >> 3 === WHITE);
      const sum = (a) => a.reduce((n, pc) => n + VALUE[pc & 7], 0);
      const diff = sum(byYou) - sum(byComputer);
      capturedRow(ctx, L.y0 + L.statusH + L.rowH / 2, t('Computer'), byComputer, diff < 0 ? -diff : 0);
      capturedRow(ctx, by + L.bs + L.labelH + L.rowH / 2, t('You'), byYou, diff > 0 ? diff : 0);

      // squares
      for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
          ctx.fillStyle = (r + f) % 2 ? '#ecd9b0' : '#b0825a';
          ctx.fillRect(x0 + f * sq, by + (7 - r) * sq, sq + 0.5, sq + 0.5);
        }
      }
      const tint = (square, col) => {
        ctx.fillStyle = col;
        ctx.fillRect(x0 + (square & 7) * sq, by + (7 - (square >> 4)) * sq, sq + 0.5, sq + 0.5);
      };
      if (moves.length) {
        const lm = moves[moves.length - 1];
        tint(moveFrom(lm), 'rgba(255,214,60,0.5)');
        tint(moveTo(lm), 'rgba(255,214,60,0.5)');
      }
      if (hint) { tint(hint.from, 'rgba(60,200,120,0.6)'); tint(hint.to, 'rgba(60,200,120,0.6)'); }
      if (selected >= 0) tint(selected, 'rgba(70,150,255,0.6)');
      if (!over || over.reason === 'checkmate') {
        if (pos.inCheck()) {
          const k = pos.kings[pos.side];
          const g = ctx.createRadialGradient(cx(k & 7), cy(k >> 4), sq * 0.1, cx(k & 7), cy(k >> 4), sq * 0.62);
          g.addColorStop(0, 'rgba(255,40,50,0.95)');
          g.addColorStop(1, 'rgba(255,40,50,0)');
          ctx.fillStyle = g;
          ctx.fillRect(x0 + (k & 7) * sq, by + (7 - (k >> 4)) * sq, sq, sq);
        }
      }

      // edge labels: ranks on the left, files below
      ctx.font = `600 ${Math.max(10, Math.min(14, Math.round(sq * 0.3)))}px system-ui, sans-serif`;
      ctx.fillStyle = '#9ba2b9';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      for (let i = 0; i < 8; i++) {
        ctx.fillText(String(i + 1), x0 - L.gut / 2 - 1, cy(i));
        ctx.fillText('abcdefgh'[i], cx(i), by + L.bs + L.labelH / 2);
      }

      // pieces (the sliding one is drawn last, on top)
      for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
          const sqr = r * 16 + f;
          const pc = pos.board[sqr];
          if (!pc || (anim && anim.to === sqr)) continue;
          drawPiece(ctx, pc, cx(f), cy(r), sq);
        }
      }
      if (anim) {
        const k = ease.out(Math.min(1, anim.t / 0.18));
        const x = lerp(cx(anim.from & 7), cx(anim.to & 7), k);
        const y = lerp(cy(anim.from >> 4), cy(anim.to >> 4), k);
        drawPiece(ctx, pos.board[anim.to], x, y, sq);
      }

      // dots for free squares, rings for captures
      if (selected >= 0 && !anim) {
        for (const m of targets) {
          const to = moveTo(m);
          const x = cx(to & 7), y = cy(to >> 4);
          ctx.beginPath();
          if (isCapture(m)) {
            ctx.arc(x, y, sq * 0.44, 0, Math.PI * 2);
            ctx.lineWidth = Math.max(3, sq * 0.09);
            ctx.strokeStyle = 'rgba(20,20,30,0.5)';
            ctx.stroke();
          } else {
            ctx.arc(x, y, sq * 0.2, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(20,20,30,0.42)';
            ctx.fill();
          }
        }
      }
      if (hint) {
        const x1 = cx(hint.from & 7), y1 = cy(hint.from >> 4), x2 = cx(hint.to & 7), y2 = cy(hint.to >> 4);
        const a = Math.atan2(y2 - y1, x2 - x1);
        const head = sq * 0.3;
        const ex = x2 - Math.cos(a) * head * 0.6, ey = y2 - Math.sin(a) * head * 0.6;
        ctx.strokeStyle = 'rgba(30,170,100,0.85)';
        ctx.fillStyle = 'rgba(30,170,100,0.85)';
        ctx.lineWidth = sq * 0.14;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - Math.cos(a - 0.5) * head, y2 - Math.sin(a - 0.5) * head);
        ctx.lineTo(x2 - Math.cos(a + 0.5) * head, y2 - Math.sin(a + 0.5) * head);
        ctx.closePath();
        ctx.fill();
      }
    }

    const ticker = loop((dt) => {
      if (destroyed) return false;
      if (anim) {
        anim.t += dt;
        if (anim.t >= 0.18) anim = null;
      }
      draw();
      return !!anim;
    });

    if (!restore()) resetGame(app.store.get('chess.level', 'medium'));
    refresh();
    // A game closed while the computer was thinking carries on with its move.
    if (!over && pos.side === BLACK) startThinking(400);

    return {
      destroy() {
        destroyed = true;
        clearTimeout(timer);
        ticker.stop();
        s.destroy();
      },
    };
  },
};

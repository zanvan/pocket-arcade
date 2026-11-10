import { t, addHebrew } from '../core/i18n.js';
import he from '../i18n/he/checkers.js';
import { Game, chooseMove, YOU, CPU, RULES, countPieces, moveTo } from '../logic/checkers.js';
import { el, surface, loop, ease, lerp, ICONS } from '../core/ui.js';

addHebrew(he);

const LEVELS = ['easy', 'medium', 'hard'];
const STEP = 0.16;           // seconds the piece takes per square of its path

const COLORS = {
  [YOU]: { top: '#f0625a', bottom: '#a8241f', rim: '#5e1210', mark: '#ffd9a0' },
  [CPU]: { top: '#4a4a56', bottom: '#1c1c22', rim: '#0b0b0e', mark: '#e9d9a8' },
};

function levelName(level) {
  return level === 'easy' ? t('Easy') : level === 'hard' ? t('Hard') : t('Medium');
}
function rulesName(rules) {
  return rules === 'flying' ? t('Flying kings') : t('Classic');
}

function recordText(store, level) {
  const r = (store.get('checkers.rec', {}) || {})[level] || {};
  const w = r.w || 0, d = r.d || 0, l = r.l || 0;
  if (!w && !d && !l) return t('{level} · no games yet', { level: levelName(level) });
  return t('{level} · Wins {w} · Draws {d} · Losses {l}', { level: levelName(level), w, d, l });
}

function icon() {
  let sq = '';
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    sq += `<rect x="${6 + c * 13}" y="${6 + r * 13}" width="13" height="13" fill="${(r + c) % 2 ? '#6b4a32' : '#d9b98c'}"/>`;
  }
  const disc = (x, y, a, b) => `<circle cx="${x}" cy="${y}" r="9.5" fill="${b}"/><circle cx="${x}" cy="${y - 1.6}" r="8.6" fill="${a}"/><circle cx="${x}" cy="${y - 1.6}" r="5" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="1.4"/>`;
  return `<svg viewBox="0 0 64 64"><clipPath id="ckclip"><rect x="6" y="6" width="52" height="52" rx="14"/></clipPath>
    <g clip-path="url(#ckclip)">${sq}</g>${disc(25, 26, '#4a4a56', '#141418')}${disc(39, 42, '#f0625a', '#8a1d19')}</svg>`;
}

// One piece: a disc with a raised edge; a king also carries a crown.
function drawPiece(ctx, p, x, y, size, alpha = 1) {
  const c = COLORS[Math.sign(p)];
  const r = size * 0.4;
  const lift = size * 0.05;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(x, y + lift, r, 0, Math.PI * 2);
  ctx.fillStyle = c.rim;
  ctx.fill();
  const g = ctx.createLinearGradient(x, y - r, x, y + r);
  g.addColorStop(0, c.top);
  g.addColorStop(1, c.bottom);
  ctx.beginPath();
  ctx.arc(x, y - lift, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y - lift, r * 0.66, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = Math.max(1, size * 0.035);
  ctx.stroke();
  if (Math.abs(p) === 2) {
    const w = r * 1.05, h = r * 0.62, cy = y - lift + h * 0.1;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, cy + h / 2);
    ctx.lineTo(x - w / 2, cy - h / 2);
    ctx.lineTo(x - w / 4, cy);
    ctx.lineTo(x, cy - h / 2 - h * 0.15);
    ctx.lineTo(x + w / 4, cy);
    ctx.lineTo(x + w / 2, cy - h / 2);
    ctx.lineTo(x + w / 2, cy + h / 2);
    ctx.closePath();
    ctx.fillStyle = c.mark;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export default {
  id: 'checkers',
  added: '2026-11-10',   // the menu marks it New for a few weeks, until it is opened
  get title() { return t('Checkers'); },
  icon: icon(),
  info: (store) => recordText(store, store.get('checkers.level', 'medium')),
  get help() {
    return t('<ul><li>You play <b>red</b> and move first. Pieces move diagonally forward, on the dark squares.</li><li>Jump over a piece to capture it. Capturing is compulsory, and a jump continues while it can.</li><li>A piece that reaches the far side becomes a <b>king</b> and can move backward too.</li><li><b>Flying kings</b> rules: kings move any distance, and all pieces capture backward too.</li><li>You win when the computer has no move left. <b>Undo</b>, <b>Hint</b> and <b>New game</b> are at the top.</li></ul>');
  },

  mount(root, app) {
    let game, level, over, recorded, anim, hint;
    let sel = null;          // { from, steps: [] } while you are choosing a move
    let thinking = '';
    let destroyed = false;
    let timer = 0;
    let L = {};

    const stage = el('div', 'stage');
    root.append(stage);
    const undoBtn = app.action(ICONS.undo, t('Undo'), undo);
    const hintBtn = app.action(ICONS.hint, t('Hint'), showHint);
    app.action(ICONS.restart, t('New game'), () => newGameDialog());
    const s = surface(stage, () => { layout(); draw(); });

    function afterPaint(fn) {
      let done = false;
      const go = () => { if (!done) { done = true; fn(); } };
      requestAnimationFrame(() => setTimeout(go, 20));
      setTimeout(go, 250);
    }

    // ---------- state ----------
    function save() {
      app.store.set('checkers.save', { game: game.toJSON(), level, recorded });
    }

    function resetGame(lv, rules) {
      level = lv;
      game = new Game(rules);
      over = null; recorded = false; anim = null; hint = null; sel = null; thinking = '';
      clearTimeout(timer);
      app.store.set('checkers.level', level);
      app.store.set('checkers.rules', game.rules);
      save();
      refresh();
    }

    function restore() {
      const sv = app.store.get('checkers.save', null);
      if (!sv || !LEVELS.includes(sv.level)) return false;
      const g = Game.fromJSON(sv.game);
      if (!g) return false;
      game = g; level = sv.level;
      const st = game.status();
      over = st.over ? st : null;
      recorded = !!(sv.recorded && over);
      anim = null; hint = null; sel = null; thinking = '';
      return true;
    }

    function refresh() {
      const myTurn = !over && !thinking && game.side === YOU;
      undoBtn.disabled = !!thinking || !game.history.length;
      hintBtn.disabled = !myTurn;
      ticker.kick();
    }

    // ---------- choosing a move ----------
    function candidates() {
      if (!sel) return [];
      return game.moves().filter((m) => m.from === sel.from && sel.steps.every((s2, i) => m.path[i] === s2));
    }
    function nextSquares() {
      const n = sel ? sel.steps.length : 0;
      return [...new Set(candidates().map((m) => m.path[n]).filter((x) => x != null))];
    }
    function movable() {
      return [...new Set(game.moves().map((m) => m.from))];
    }

    function play(m, byComputer) {
      const before = game.board;
      game.play(m);
      anim = { piece: before[m.from], squares: [m.from, ...m.path], caps: m.caps.map((c) => ({ sq: c, p: before[c] })), t: 0 };
      sel = null; hint = null;
      app.sfx(m.caps.length ? 'place' : 'move');
      if (!byComputer) app.haptic(8);
      if (m.caps.length > 1) setTimeout(() => !destroyed && app.sfx('clear'), STEP * 1000 * m.path.length);
      const st = game.status();
      if (st.over) { over = st; finish(); }
      else if (game.side === CPU) startThinking(STEP * 1000 * m.path.length + 200);
      save();
      refresh();
    }

    function startThinking(delay) {
      thinking = t('Computer is thinking…');
      clearTimeout(timer);
      timer = setTimeout(() => { draw(); afterPaint(computerMove); }, delay);
    }

    function computerMove() {
      if (destroyed || over || game.side !== CPU) return;
      let m = null;
      try { m = chooseMove(game, level); } catch (err) { console.error(err); }
      if (!m) m = game.moves()[0];
      thinking = '';
      if (m) play(m, true); else refresh();
    }

    s.canvas.addEventListener('pointerdown', (e) => {
      if (over || thinking || destroyed || game.side !== YOU || !L.sq) return;
      const p = s.point(e);
      const c = Math.floor((p.x - L.x0) / L.sq);
      const r = Math.floor((p.y - L.by) / L.sq);
      if (c < 0 || c > 7 || r < 0 || r > 7) { sel = null; ticker.kick(); return; }
      const sq = r * 8 + c;
      hint = null;
      if (sel && nextSquares().includes(sq)) {
        sel.steps.push(sq);
        const cands = candidates();
        const done = cands.find((m) => m.path.length === sel.steps.length);
        if (done || cands.length === 1) play(done || cands[0], false);
        else { app.sfx('move'); app.haptic(6); ticker.kick(); }
        return;
      }
      if (game.board[sq] * YOU > 0) {
        if (movable().includes(sq)) {
          sel = { from: sq, steps: [] };
          app.sfx('tap');
        } else {
          sel = null;
          const forced = game.moves()[0]?.caps.length > 0;
          app.toast(forced ? t('You must capture') : t('That piece cannot move'), 1500);
          app.sfx('bump');
        }
      } else {
        sel = null;
      }
      ticker.kick();
    });

    function undo() {
      if (thinking || !game.history.length) return;
      if (over) unrecord();
      clearTimeout(timer);
      over = null;
      const n = game.side === CPU ? 1 : Math.min(2, game.history.length);
      for (let i = 0; i < n; i++) game.undo();
      // The computer may have made the very first move of a restored game: undo leaves it to you.
      if (game.side === CPU) startThinking(300);
      anim = null; sel = null; hint = null;
      save();
      refresh();
    }

    function showHint() {
      if (over || thinking || game.side !== YOU) return;
      thinking = t('Looking for a good move…');
      sel = null; hint = null;
      refresh();
      draw();
      afterPaint(() => {
        if (destroyed) return;
        let m = null;
        try { m = chooseMove(game, 'hard', { timeMs: 700 }); } catch (err) { console.error(err); }
        thinking = '';
        if (m) {
          hint = m;
          app.toast(t('Hint: follow the arrow'), 2600);
          app.sfx('select');
        }
        refresh();
      });
    }

    // ---------- end of game ----------
    function unrecord() {
      if (!recorded) return;
      recorded = false;
      const rec = app.store.get('checkers.rec', {}) || {};
      const r = rec[level];
      if (!r) return;
      const key = over.winner === YOU ? 'w' : over.winner === CPU ? 'l' : 'd';
      r[key] = Math.max(0, (r[key] || 0) - 1);
      app.store.set('checkers.rec', rec);
    }

    function finish() {
      const win = over.winner === YOU, lose = over.winner === CPU;
      if (!recorded) {
        recorded = true;
        const rec = app.store.get('checkers.rec', {}) || {};
        const r = rec[level] || { w: 0, d: 0, l: 0 };
        if (win) r.w++; else if (lose) r.l++; else r.d++;
        rec[level] = r;
        app.store.set('checkers.rec', rec);
      }
      app.sfx(win ? 'win' : lose ? 'lose' : 'done');
      timer = setTimeout(async () => {
        if (destroyed) return;
        const reason = over.reason === 'quiet'
          ? t('Forty moves each without a capture or a man moving.')
          : win ? t('The computer has no move left. Well played!') : t('You have no move left.');
        const v = await app.modal({
          title: win ? t('You win!') : lose ? t('Computer wins') : t('Draw'),
          html: `<p style="text-align:center">${reason}</p><p style="text-align:center;font-size:13px">${recordText(app.store, level)} · ${rulesName(game.rules)}</p>`,
          buttons: [{ label: t('Close'), value: false }, { label: t('New game'), value: true, primary: true }],
        });
        if (v && !destroyed) newGameDialog();
      }, STEP * 1000 * 3 + 500);
    }

    async function newGameDialog() {
      if (thinking) return;
      let pick = level || app.store.get('checkers.level', 'medium');
      let rules = game?.rules || app.store.get('checkers.rules', 'classic');
      const seg = 'padding:11px 14px;font-size:15.5px';
      const html = `<p style="text-align:center">${t('Computer level')}</p>
        <div style="display:flex;justify-content:center;margin-bottom:14px"><div class="seg">${LEVELS.map((lv) => `<button data-l="${lv}" style="${seg}" class="${lv === pick ? 'on' : ''}">${levelName(lv)}</button>`).join('')}</div></div>
        <p style="text-align:center">${t('Rules')}</p>
        <div style="display:flex;justify-content:center"><div class="seg">${RULES.map((ru) => `<button data-r="${ru}" style="${seg}" class="${ru === rules ? 'on' : ''}">${rulesName(ru)}</button>`).join('')}</div></div>
        <p style="font-size:13px;margin-top:12px;text-align:center">${t('Flying kings: kings move any distance and every piece may capture backward.')}</p>`;
      const v = await app.modal({
        title: t('New game'),
        html,
        buttons: [{ label: t('Cancel'), value: false }, { label: t('Play'), value: true, primary: true }],
        onOpen(body) {
          body.querySelectorAll('[data-l]').forEach((b) => b.addEventListener('click', () => {
            pick = b.dataset.l;
            body.querySelectorAll('[data-l]').forEach((x) => x.classList.toggle('on', x === b));
          }));
          body.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', () => {
            rules = b.dataset.r;
            body.querySelectorAll('[data-r]').forEach((x) => x.classList.toggle('on', x === b));
          }));
        },
      });
      if (v && !destroyed) resetGame(pick, rules);
    }

    // ---------- drawing ----------
    function layout() {
      const w = s.w, h = s.h;
      const statusH = 36, footH = 34;
      let bs = Math.min(w - 16, h - statusH - footH - 8);
      bs = Math.max(8, Math.floor(bs / 8) * 8);
      const totalH = statusH + bs + footH;
      const y0 = Math.max(0, Math.floor((h - totalH) / 2));
      L = { statusH, footH, bs, sq: bs / 8, y0, x0: Math.floor((w - bs) / 2), by: y0 + statusH };
    }
    const cx = (sq) => L.x0 + ((sq & 7) + 0.5) * L.sq;
    const cy = (sq) => L.by + ((sq >> 3) + 0.5) * L.sq;

    function arrow(ctx, pts, color) {
      ctx.strokeStyle = color; ctx.fillStyle = color;
      ctx.lineWidth = L.sq * 0.13; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(cx(pts[0]), cy(pts[0]));
      for (let i = 1; i < pts.length; i++) ctx.lineTo(cx(pts[i]), cy(pts[i]));
      ctx.stroke();
      const a = pts[pts.length - 2], b = pts[pts.length - 1];
      const ang = Math.atan2(cy(b) - cy(a), cx(b) - cx(a));
      const hd = L.sq * 0.32;
      ctx.beginPath();
      ctx.moveTo(cx(b), cy(b));
      ctx.lineTo(cx(b) - Math.cos(ang - 0.5) * hd, cy(b) - Math.sin(ang - 0.5) * hd);
      ctx.lineTo(cx(b) - Math.cos(ang + 0.5) * hd, cy(b) - Math.sin(ang + 0.5) * hd);
      ctx.closePath();
      ctx.fill();
    }

    function draw() {
      const { ctx } = s;
      s.begin();
      if (!game || !L.sq || L.bs < 16) return;
      const { sq, x0, by, bs } = L;

      // status line
      let status, color = '#eef0f7';
      if (over) {
        status = over.winner === YOU ? t('You win!') : over.winner === CPU ? t('Computer wins') : t('Draw');
        color = over.winner === YOU ? '#3ecf8e' : over.winner === CPU ? '#ff5d6c' : '#ffc857';
      } else if (thinking) {
        status = thinking; color = '#9bb0ff';
      } else if (game.moves()[0]?.caps.length) {
        status = t('Your move — you must capture'); color = '#ffc857';
      } else {
        status = t('Your move');
      }
      ctx.font = '700 18px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color;
      ctx.fillText(status, x0 + bs / 2, L.y0 + L.statusH / 2);

      // board
      ctx.fillStyle = '#3b2617';
      ctx.fillRect(x0 - 4, by - 4, bs + 8, bs + 8);
      for (let i = 0; i < 64; i++) {
        ctx.fillStyle = ((i >> 3) + (i & 7)) % 2 ? '#7a5537' : '#e3c79b';
        ctx.fillRect(x0 + (i & 7) * sq, by + (i >> 3) * sq, sq + 0.5, sq + 0.5);
      }
      const tint = (i, col) => { ctx.fillStyle = col; ctx.fillRect(x0 + (i & 7) * sq, by + (i >> 3) * sq, sq + 0.5, sq + 0.5); };
      const last = game.lastMove();
      if (last && !anim) { tint(last.from, 'rgba(255,214,60,0.35)'); tint(moveTo(last), 'rgba(255,214,60,0.45)'); }

      // pieces that must or can move (when a capture is forced), and your selection
      const myTurn = !over && !thinking && game.side === YOU && !anim;
      if (myTurn && !sel && game.moves()[0]?.caps.length) {
        for (const f of movable()) tint(f, 'rgba(255,200,60,0.45)');
      }
      if (sel) tint(sel.from, 'rgba(70,150,255,0.55)');
      if (hint) { tint(hint.from, 'rgba(60,200,120,0.5)'); tint(moveTo(hint), 'rgba(60,200,120,0.5)'); }

      // pieces
      const selAt = sel && sel.steps.length ? sel.steps[sel.steps.length - 1] : -1;
      const capturedSoFar = sel ? candidates()[0]?.caps.slice(0, sel.steps.length) || [] : [];
      const moving = anim ? anim.squares[anim.squares.length - 1] : -1;
      for (let i = 0; i < 64; i++) {
        const p = game.board[i];
        if (!p || i === moving || (selAt >= 0 && i === sel.from)) continue;
        drawPiece(ctx, p, cx(i), cy(i), sq, capturedSoFar.includes(i) ? 0.35 : 1);
      }
      if (selAt >= 0) {
        // Mid-jump: the piece waits on the square it has reached.
        drawPiece(ctx, game.board[sel.from], cx(selAt), cy(selAt), sq);
      }
      if (anim) {
        const total = STEP * (anim.squares.length - 1);
        const k = Math.min(1, anim.t / total) * (anim.squares.length - 1);
        const seg = Math.min(anim.squares.length - 2, Math.floor(k));
        const f = ease.inOut(k - seg);
        const a = anim.squares[seg], b = anim.squares[seg + 1];
        for (let j = 0; j < anim.caps.length; j++) {
          const gone = j < seg || (j === seg && f > 0.5);
          if (!gone) drawPiece(ctx, anim.caps[j].p, cx(anim.caps[j].sq), cy(anim.caps[j].sq), sq);
        }
        const kinged = Math.abs(game.board[moving]) === 2 && Math.abs(anim.piece) === 1 && k >= anim.squares.length - 1;
        drawPiece(ctx, kinged ? anim.piece * 2 : anim.piece, lerp(cx(a), cx(b), f), lerp(cy(a), cy(b), f) - Math.sin(f * Math.PI) * sq * (anim.caps.length ? 0.25 : 0.08), sq * 1.04);
      }

      // where the selected piece can go next
      if (sel && !anim) {
        for (const n of nextSquares()) {
          ctx.beginPath();
          ctx.arc(cx(n), cy(n), sq * 0.18, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.fill();
        }
      }
      if (hint && !anim) arrow(ctx, [hint.from, ...hint.path], 'rgba(30,170,100,0.85)');

      // piece counts
      const n = countPieces(game.board);
      ctx.font = '600 14px system-ui, sans-serif';
      ctx.fillStyle = '#9ba2b9';
      ctx.textAlign = 'center';
      const fy = by + bs + L.footH / 2 + 2;
      ctx.fillText(t('You {n} · Computer {m} · {rules}', { n: n[YOU], m: n[CPU], rules: rulesName(game.rules) }), x0 + bs / 2, fy);
    }

    const ticker = loop((dt) => {
      if (destroyed) return false;
      if (anim) {
        anim.t += dt;
        if (anim.t >= STEP * (anim.squares.length - 1) + 0.02) anim = null;
      }
      draw();
      return !!anim;
    });

    if (!restore()) resetGame(app.store.get('checkers.level', 'medium'), app.store.get('checkers.rules', 'classic'));
    refresh();
    if (!over && game.side === CPU) startThinking(400);

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


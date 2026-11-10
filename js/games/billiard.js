import { t, addHebrew } from '../core/i18n.js';
import he from '../i18n/he/billiard.js';
import { Pool, planShot, aimLine, groupOf, W, H, R, POCKETS, HEAD_X } from '../logic/billiard.js';
import { el, surface, loop, clamp, ICONS } from '../core/ui.js';

addHebrew(he);

const LEVELS = ['easy', 'medium', 'hard'];
const F = 9;                       // table frame (wood and pockets) around the cloth, in table units
const COLORS = ['#f4f1e6', '#f2c21b', '#1f5fd6', '#d63a2f', '#6a2c91', '#f07c12', '#1b8a3a', '#82231f', '#16161a'];
const colorOf = (id) => COLORS[id > 8 ? id - 8 : id];

function levelName(level) {
  return level === 'easy' ? t('Easy') : level === 'hard' ? t('Hard') : t('Medium');
}

function recordText(store, mode, level) {
  if (mode === 'two') return t('Two players on one phone');
  const r = (store.get('billiard.rec', {}) || {})[level] || {};
  if (!r.w && !r.l) return t('{level} · no games yet', { level: levelName(level) });
  return t('{level} · Won {w} · Lost {l}', { level: levelName(level), w: r.w || 0, l: r.l || 0 });
}

function icon() {
  const ball = (x, y, c, stripe) => stripe
    ? `<circle cx="${x}" cy="${y}" r="7" fill="#f4f1e6"/><path d="M${x - 7} ${y - 3}h14v6h-14z" fill="${c}" clip-path="circle(7px at ${x}px ${y}px)"/><circle cx="${x}" cy="${y}" r="7" fill="none" stroke="rgba(0,0,0,.25)"/>`
    : `<circle cx="${x}" cy="${y}" r="7" fill="${c}"/>`;
  return `<svg viewBox="0 0 64 64"><rect x="6" y="6" width="52" height="52" rx="14" fill="#5a3a22"/><rect x="11" y="11" width="42" height="42" rx="8" fill="#17794a"/>
    <circle cx="14" cy="14" r="4" fill="#0b0b0e"/><circle cx="50" cy="50" r="4" fill="#0b0b0e"/>
    ${ball(36, 26, '#d63a2f')}${ball(44, 34, '#16161a')}${ball(30, 37, '#1f5fd6', true)}
    <circle cx="20" cy="45" r="6.5" fill="#f4f1e6"/><path d="M8 58L18 47" stroke="#d9b27a" stroke-width="3" stroke-linecap="round"/></svg>`;
}

export default {
  id: 'billiard',
  added: '2026-11-10',   // the menu marks it New for a few weeks, until it is opened
  get title() { return t('Billiard'); },
  icon: icon(),
  info: (store) => recordText(store, store.get('billiard.mode', 'cpu'), store.get('billiard.level', 'medium')),
  get help() {
    return t('<ul><li>8-ball. Pot all your balls (solids or stripes), then the black <b>8</b>.</li><li><b>Drag on the table</b> to aim. The thin line shows where the balls will go.</li><li><b>Slide the power bar</b> to set the strength, then let go to shoot. The arrows turn the aim a tiny bit.</li><li>The first ball you pot after the break decides your group. You keep your turn while you pot your own balls.</li><li>A foul (the white ball goes in, or you hit no ball or the wrong ball first) gives the other player the white ball in hand: drag it anywhere.</li><li>The 8 too early loses the game.</li></ul>');
  },

  mount(root, app) {
    let pool, mode, level, aim, state, cpuTimer = 0;
    let destroyed = false;
    let power = 0;            // 0..1 while the power bar is held
    let cpuAnim = null;       // { from, to, t, plan } while the computer lines up its shot
    let dragging = null;      // 'aim' | 'cue'
    let lastSound = 0;
    let prevEv = null;
    let V = {};               // view: scale, offset, orientation

    const stage = el('div', 'stage');
    const bar = el('div', 'pool-bar');
    const left = el('button', 'padbtn', ICONS.rotCCW);
    const right = el('button', 'padbtn', ICONS.rotCW);
    left.setAttribute('aria-label', t('Turn the aim left'));
    right.setAttribute('aria-label', t('Turn the aim right'));
    const pw = el('div', 'power', `<div class="fill"></div><div class="lbl"></div>`);
    const fill = pw.querySelector('.fill');
    const lbl = pw.querySelector('.lbl');
    bar.append(left, pw, right);
    root.append(stage, bar);
    app.action(ICONS.restart, t('New game'), () => newGameDialog());

    const s = surface(stage, () => { layout(); draw(); });

    // ---------- names and turns ----------
    const names = () => (mode === 'two' ? [t('Player 1'), t('Player 2')] : [t('You'), t('Computer')]);
    const humanTurn = () => state === 'aim' && (mode === 'two' || pool.turn === 0);
    const groupName = (g) => (g === 'solid' ? t('solids') : t('stripes'));

    function save() {
      if (!pool) return;
      app.store.set('billiard.save', { pool: pool.toJSON(), mode, level, aim });
    }

    function newGame(m, lv) {
      mode = m; level = lv;
      pool = new Pool();
      aim = 0;
      state = pool.winner != null ? 'over' : 'aim';
      app.store.set('billiard.mode', mode);
      app.store.set('billiard.level', level);
      save();
      startTurn(true);
    }

    function restore() {
      const sv = app.store.get('billiard.save', null);
      if (!sv || !LEVELS.includes(sv.level) || !['cpu', 'two'].includes(sv.mode)) return false;
      const p = Pool.fromJSON(sv.pool);
      if (!p) return false;
      pool = p; mode = sv.mode; level = sv.level; aim = Number.isFinite(sv.aim) ? sv.aim : 0;
      state = pool.winner != null ? 'over' : 'aim';
      return true;
    }

    // Points the cue at the nearest ball the player may hit, so a new turn starts sensibly.
    function aimAtNearest() {
      const c = pool.balls[0];
      let best = null, bd = Infinity;
      for (const id of pool.targets()) {
        const b = pool.balls[id];
        const d = Math.hypot(b.x - c.x, b.y - c.y);
        if (d < bd) { bd = d; best = b; }
      }
      if (best) aim = Math.atan2(best.y - c.y, best.x - c.x);
    }

    function startTurn(fresh) {
      if (pool.winner != null) { state = 'over'; refresh(); return; }
      state = 'aim';
      if (!fresh || pool.isBreak) aimAtNearest();
      if (pool.isBreak) aim = 0;
      refresh();
      if (mode === 'cpu' && pool.turn === 1) cpuTurn();
    }

    function refresh() {
      const can = humanTurn();
      left.disabled = right.disabled = !can;
      pw.classList.toggle('off', !can);
      fill.style.width = (power * 100).toFixed(1) + '%';
      lbl.textContent = power > 0 ? Math.round(power * 100) + '%' : can ? t('Slide to set power, let go to shoot') : '';
      ticker.kick();
    }

    // ---------- shooting ----------
    function shoot(angle, p) {
      pool.shoot(angle, p);
      state = 'roll';
      prevEv = { contacts: 0, rails: 0, pots: 0 };
      app.sfx(p > 0.6 ? 'drop' : 'place');
      app.haptic(p > 0.6 ? 20 : 10);
      power = 0;
      refresh();
    }

    function shotDone() {
      const shooter = pool.turn;
      const res = pool.endShot();
      const nm = names();
      const msg = [];
      if (res.foul === 'scratch') msg.push(t('Foul: the white ball went in'));
      else if (res.foul === 'nohit') msg.push(t('Foul: no ball was hit'));
      else if (res.foul === 'wrong') msg.push(t('Foul: the wrong ball was hit first'));
      if (res.respotted8) msg.push(t('The 8 goes back on the table'));
      if (res.assigned) msg.push(t('{name}: {group}', { name: nm[shooter], group: groupName(res.assigned) }));
      save();
      if (res.winner != null) { finish(); return; }
      if (res.foul) msg.push(t('{name} has the white ball in hand', { name: nm[pool.turn] }));
      else if (pool.turn !== shooter) msg.push(t('{name} to play', { name: nm[pool.turn] }));
      else if (res.potted.length) app.sfx('clear');
      if (msg.length) app.toast(msg.join(' · '), 2400);
      startTurn(false);
    }

    function cpuTurn() {
      state = 'cpu';
      refresh();
      clearTimeout(cpuTimer);
      cpuTimer = setTimeout(() => {
        if (destroyed || state !== 'cpu') return;
        let plan;
        try { plan = planShot(pool, level); } catch (err) { console.error(err); plan = { cue: null, angle: aim, power: 0.4 }; }
        if (plan.cue && pool.inHand) pool.placeCue(plan.cue.x, plan.cue.y);
        // Turn the cue the short way round, then pull back and shoot.
        let to = plan.angle;
        while (to - aim > Math.PI) to -= Math.PI * 2;
        while (to - aim < -Math.PI) to += Math.PI * 2;
        cpuAnim = { from: aim, to, t: 0, plan };
        ticker.kick();
      }, 650);
    }

    function finish() {
      state = 'over';
      const nm = names();
      const w = pool.winner;
      if (mode === 'cpu') {
        const rec = app.store.get('billiard.rec', {}) || {};
        const r = rec[level] || { w: 0, l: 0 };
        if (w === 0) r.w++; else r.l++;
        rec[level] = r;
        app.store.set('billiard.rec', rec);
      }
      save();
      refresh();
      const lose = mode === 'cpu' && w === 1;
      app.sfx(lose ? 'lose' : 'win');
      const title = mode === 'cpu' ? (w === 0 ? t('You win!') : t('Computer wins')) : t('{name} wins!', { name: nm[w] });
      const why = pool.reason === 'won8' ? t('The 8 went in after the whole group.')
        : pool.reason === 'foul8' ? t('The 8 went in on a foul.') : t('The 8 went in too early.');
      cpuTimer = setTimeout(async () => {
        if (destroyed) return;
        const v = await app.modal({
          title,
          html: `<p style="text-align:center">${why}</p><p style="text-align:center;font-size:13px">${recordText(app.store, mode, level)}</p>`,
          buttons: [{ label: t('Close'), value: false }, { label: t('New game'), value: true, primary: true }],
        });
        if (v && !destroyed) newGameDialog();
      }, 700);
    }

    async function newGameDialog() {
      let m = mode || app.store.get('billiard.mode', 'cpu');
      let lv = level || app.store.get('billiard.level', 'medium');
      const seg = 'padding:11px 14px;font-size:15.5px';
      const html = `<p style="text-align:center">${t('Opponent')}</p>
        <div style="display:flex;justify-content:center;margin-bottom:14px"><div class="seg">
          <button data-m="cpu" style="${seg}" class="${m === 'cpu' ? 'on' : ''}">${t('Computer')}</button>
          <button data-m="two" style="${seg}" class="${m === 'two' ? 'on' : ''}">${t('2 players')}</button></div></div>
        <div class="lvrow" style="${m === 'two' ? 'display:none' : ''}"><p style="text-align:center">${t('Computer level')}</p>
        <div style="display:flex;justify-content:center"><div class="seg">${LEVELS.map((x) => `<button data-l="${x}" style="${seg}" class="${x === lv ? 'on' : ''}">${levelName(x)}</button>`).join('')}</div></div></div>`;
      const v = await app.modal({
        title: t('New game'),
        html,
        buttons: [{ label: t('Cancel'), value: false }, { label: t('Play'), value: true, primary: true }],
        onOpen(body) {
          body.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => {
            m = b.dataset.m;
            body.querySelectorAll('[data-m]').forEach((x) => x.classList.toggle('on', x === b));
            body.querySelector('.lvrow').style.display = m === 'two' ? 'none' : '';
          }));
          body.querySelectorAll('[data-l]').forEach((b) => b.addEventListener('click', () => {
            lv = b.dataset.l;
            body.querySelectorAll('[data-l]').forEach((x) => x.classList.toggle('on', x === b));
          }));
        },
      });
      if (v && !destroyed) {
        clearTimeout(cpuTimer);
        cpuAnim = null;
        newGame(m, lv);
      }
    }

    // ---------- view: the table lies lengthwise on a tall screen ----------
    function layout() {
      const hudH = 50, footH = 26;
      const portrait = s.h > s.w * 1.05;
      const lw = W + 2 * F, lh = H + 2 * F;
      const aw = s.w - 12, ah = s.h - hudH - footH;
      const k = portrait ? Math.min(aw / lh, ah / lw) : Math.min(aw / lw, ah / lh);
      const tw = (portrait ? lh : lw) * k, th = (portrait ? lw : lh) * k;
      V = { portrait, k, hudH, footH, ox: (s.w - tw) / 2, oy: hudH + Math.max(0, (ah - th) / 2), tw, th };
    }
    const sx = (x, y) => (V.portrait ? V.ox + (F + y) * V.k : V.ox + (F + x) * V.k);
    const sy = (x, y) => (V.portrait ? V.oy + (W + F - x) * V.k : V.oy + (F + y) * V.k);
    function toTable(px, py) {
      return V.portrait
        ? { x: W + F - (py - V.oy) / V.k, y: (px - V.ox) / V.k - F }
        : { x: (px - V.ox) / V.k - F, y: (py - V.oy) / V.k - F };
    }

    // ---------- input ----------
    s.canvas.addEventListener('pointerdown', (e) => {
      if (!humanTurn() || !V.k) return;
      const p = s.point(e);
      const c = pool.balls[0];
      const near = Math.hypot(p.x - sx(c.x, c.y), p.y - sy(c.x, c.y)) < Math.max(26, R * V.k * 3);
      dragging = pool.inHand && near ? 'cue' : 'aim';
      s.canvas.setPointerCapture?.(e.pointerId);
      move(p);
    });
    s.canvas.addEventListener('pointermove', (e) => { if (dragging) move(s.point(e)); });
    const up = () => {
      if (dragging === 'cue') save();
      dragging = null;
    };
    s.canvas.addEventListener('pointerup', up);
    s.canvas.addEventListener('pointercancel', up);

    function move(p) {
      const q = toTable(p.x, p.y);
      const c = pool.balls[0];
      if (dragging === 'cue') {
        const x = clamp(q.x, R, pool.inHand === 'kitchen' ? HEAD_X : W - R), y = clamp(q.y, R, H - R);
        if (pool.placeCue(x, y)) ticker.kick();
        return;
      }
      if (Math.hypot(q.x - c.x, q.y - c.y) > R * 0.8) {
        aim = Math.atan2(q.y - c.y, q.x - c.x);
        ticker.kick();
      }
    }

    for (const [b, d] of [[left, 1], [right, -1]]) {
      b.addEventListener('click', () => {
        if (!humanTurn()) return;
        // "Left" turns the cue anticlockwise on screen. The portrait view is a pure rotation,
        // so a larger angle is clockwise on screen in both views.
        aim -= d * 0.0035;
        app.sfx('key');
        ticker.kick();
      });
    }

    let pwStart = 0, pwHeld = false;
    pw.addEventListener('pointerdown', (e) => {
      if (!humanTurn()) return;
      pwHeld = true;
      pwStart = e.clientX;
      pw.setPointerCapture?.(e.pointerId);
      power = 0;
      refresh();
    });
    pw.addEventListener('pointermove', (e) => {
      if (!pwHeld) return;
      power = clamp((e.clientX - pwStart) / (pw.getBoundingClientRect().width * 0.85), 0, 1);
      refresh();
    });
    const release = (fire) => {
      if (!pwHeld) return;
      pwHeld = false;
      if (fire && power > 0.02 && humanTurn()) shoot(aim, power);
      else { power = 0; refresh(); }
    };
    pw.addEventListener('pointerup', () => release(true));
    pw.addEventListener('pointercancel', () => release(false));

    // ---------- drawing ----------
    function ballAt(ctx, id, x, y, r) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = id > 8 ? COLORS[0] : colorOf(id);
      ctx.fill();
      if (id > 8) {
        ctx.save();
        ctx.clip();
        ctx.fillStyle = colorOf(id);
        ctx.fillRect(x - r, y - r * 0.52, r * 2, r * 1.04);
        ctx.restore();
      }
      if (id > 0 && r >= 5) {
        ctx.beginPath();
        ctx.arc(x, y, r * 0.48, 0, Math.PI * 2);
        ctx.fillStyle = '#f7f5ee';
        ctx.fill();
        if (r >= 7) {
          ctx.fillStyle = '#16161a';
          ctx.font = `700 ${Math.round(r * 0.62)}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const dir = ctx.direction;
          ctx.direction = 'ltr';
          ctx.fillText(String(id), x, y + r * 0.04);
          ctx.direction = dir;
        }
      }
      const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.1, x, y, r * 1.05);
      g.addColorStop(0, 'rgba(255,255,255,0.55)');
      g.addColorStop(0.35, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.35)');
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();
    }

    function drawTable(ctx) {
      const k = V.k;
      // frame, cloth and the cushion line, in screen space via sx/sy
      const rect = (x1, y1, x2, y2) => {
        const ax = sx(x1, y1), ay = sy(x1, y1), bx = sx(x2, y2), by = sy(x2, y2);
        return [Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay)];
      };
      ctx.fillStyle = '#5a3a22';
      const fr = rect(-F, -F, W + F, H + F);
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(...fr, 3 * k) : ctx.rect(...fr);
      ctx.fill();
      ctx.fillStyle = '#0f5d38';
      ctx.fillRect(...rect(-3.4, -3.4, W + 3.4, H + 3.4));
      ctx.fillStyle = '#17794a';
      ctx.fillRect(...rect(0, 0, W, H));
      // head line and foot spot
      ctx.strokeStyle = 'rgba(255,255,255,0.13)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx(HEAD_X, 0), sy(HEAD_X, 0));
      ctx.lineTo(sx(HEAD_X, H), sy(HEAD_X, H));
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.beginPath();
      ctx.arc(sx(W * 0.75, H / 2), sy(W * 0.75, H / 2), Math.max(1.5, 0.5 * k), 0, Math.PI * 2);
      ctx.fill();
      // diamonds on the frame
      ctx.fillStyle = '#e7d3a6';
      for (let i = 1; i < 8; i++) {
        if (i === 4) continue;
        for (const y of [-F / 2 - 1, H + F / 2 + 1]) { ctx.beginPath(); ctx.arc(sx((W / 8) * i, y), sy((W / 8) * i, y), Math.max(1.2, 0.6 * k), 0, Math.PI * 2); ctx.fill(); }
      }
      for (let i = 1; i < 4; i++) {
        for (const x of [-F / 2 - 1, W + F / 2 + 1]) { ctx.beginPath(); ctx.arc(sx(x, (H / 4) * i), sy(x, (H / 4) * i), Math.max(1.2, 0.6 * k), 0, Math.PI * 2); ctx.fill(); }
      }
      for (const P of POCKETS) {
        ctx.beginPath();
        ctx.arc(sx(P.x, P.y), sy(P.x, P.y), (P.r + 0.6) * k, 0, Math.PI * 2);
        ctx.fillStyle = '#08080a';
        ctx.fill();
      }
    }

    function drawHud(ctx) {
      const nm = names();
      const w = s.w;
      for (let p = 0; p < 2; p++) {
        const active = pool.turn === p && pool.winner == null;
        const x = p === 0 ? 12 : w - 12;
        ctx.textAlign = p === 0 ? 'left' : 'right';
        ctx.textBaseline = 'middle';
        ctx.font = `${active ? 800 : 600} 15px system-ui, sans-serif`;
        ctx.fillStyle = active ? '#eef0f7' : '#9ba2b9';
        ctx.fillText(p === 0 ? (active ? '● ' : '') + nm[p] : nm[p] + (active ? ' ●' : ''), x, 14);
        const g = pool.groups[p];
        const ids = g ? pool.balls.filter((b) => b.on && groupOf(b.id) === g).map((b) => b.id) : [];
        const showEight = g && !ids.length;
        const list = showEight ? [8] : ids;
        const r = 6.5;
        for (let i = 0; i < list.length; i++) {
          const bx = p === 0 ? x + r + i * (r * 2 + 3) : x - r - i * (r * 2 + 3);
          ballAt(ctx, list[i], bx, 36, r);
        }
        if (!g) {
          ctx.font = '500 12px system-ui, sans-serif';
          ctx.fillStyle = '#9ba2b9';
          ctx.fillText(t('Open table'), x, 36);
        }
      }
    }

    function drawGuide(ctx) {
      const c = pool.balls[0];
      const a = aimLine(pool.balls, c.x, c.y, aim);
      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sx(c.x, c.y), sy(c.x, c.y));
      ctx.lineTo(sx(a.gx, a.gy), sy(a.gx, a.gy));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(sx(a.gx, a.gy), sy(a.gx, a.gy), R * V.k, 0, Math.PI * 2);
      ctx.stroke();
      if (a.hit >= 0) {
        const b = pool.balls[a.hit];
        const legal = pool.targets().includes(a.hit);
        ctx.strokeStyle = legal ? 'rgba(255,255,255,0.75)' : 'rgba(255,93,108,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx(b.x, b.y), sy(b.x, b.y));
        ctx.lineTo(sx(b.x + a.ox * 22, b.y + a.oy * 22), sy(b.x + a.ox * 22, b.y + a.oy * 22));
        ctx.stroke();
        // where the white ball glances off to
        const dx = Math.cos(aim), dy = Math.sin(aim);
        const dot = dx * a.ox + dy * a.oy;
        const tx = dx - a.ox * dot, ty = dy - a.oy * dot, tl = Math.hypot(tx, ty);
        if (tl > 0.05) {
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.beginPath();
          ctx.moveTo(sx(a.gx, a.gy), sy(a.gx, a.gy));
          const e = 12 * tl;
          ctx.lineTo(sx(a.gx + (tx / tl) * e, a.gy + (ty / tl) * e), sy(a.gx + (tx / tl) * e, a.gy + (ty / tl) * e));
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    function drawCue(ctx, angle, pull) {
      const c = pool.balls[0];
      const bx = sx(c.x, c.y), by = sy(c.x, c.y);
      const ux = sx(c.x + Math.cos(angle), c.y + Math.sin(angle)) - bx;
      const uy = sy(c.x + Math.cos(angle), c.y + Math.sin(angle)) - by;
      const ul = Math.hypot(ux, uy) || 1;
      const dx = ux / ul, dy = uy / ul;
      const gap = (R + 1.2 + pull * 16) * V.k;
      const len = 95 * V.k;
      const x1 = bx - dx * gap, y1 = by - dy * gap, x2 = bx - dx * (gap + len), y2 = by - dy * (gap + len);
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = Math.max(3, 1.3 * V.k);
      ctx.beginPath(); ctx.moveTo(x1 + 2, y1 + 3); ctx.lineTo(x2 + 2, y2 + 3); ctx.stroke();
      const g = ctx.createLinearGradient(x1, y1, x2, y2);
      g.addColorStop(0, '#f3efe4'); g.addColorStop(0.03, '#f3efe4'); g.addColorStop(0.035, '#3a7bd5');
      g.addColorStop(0.06, '#e8c992'); g.addColorStop(0.7, '#c28a4c'); g.addColorStop(0.72, '#1d1d22'); g.addColorStop(1, '#3a2416');
      ctx.strokeStyle = g;
      ctx.lineWidth = Math.max(3, 1.15 * V.k);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.restore();
    }

    function draw() {
      const { ctx } = s;
      s.begin();
      if (!pool || !V.k) return;
      drawHud(ctx);
      drawTable(ctx);
      const r = R * V.k;
      for (const b of pool.balls) {
        if (!b.on) continue;
        ctx.beginPath();
        ctx.arc(sx(b.x, b.y) + r * 0.18, sy(b.x, b.y) + r * 0.25, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fill();
      }
      const showAim = state === 'aim' || state === 'cpu';
      if (showAim && humanTurn()) drawGuide(ctx);
      if (pool.inHand && state === 'aim' && humanTurn()) {
        const c = pool.balls[0];
        ctx.beginPath();
        ctx.arc(sx(c.x, c.y), sy(c.x, c.y), r * 2.1, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.fill();
        if (pool.inHand === 'kitchen') {
          ctx.fillStyle = 'rgba(255,255,255,0.05)';
          const x1 = sx(0, 0), y1 = sy(0, 0), x2 = sx(HEAD_X, H), y2 = sy(HEAD_X, H);
          ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
        }
      }
      for (const b of pool.balls) if (b.on) ballAt(ctx, b.id, sx(b.x, b.y), sy(b.x, b.y), r);
      if (showAim && pool.winner == null) {
        const pull = cpuAnim && cpuAnim.t > 0.55 ? Math.min(1, (cpuAnim.t - 0.55) / 0.35) * cpuAnim.plan.power : power;
        drawCue(ctx, aim, pull);
      }

      // the line under the table
      let tip = '';
      if (state === 'over') tip = '';
      else if (state === 'cpu') tip = t('Computer is playing…');
      else if (state === 'roll') tip = '';
      else if (pool.inHand) tip = pool.inHand === 'kitchen' ? t('Break: drag the white ball behind the line, then shoot') : t('Ball in hand: drag the white ball anywhere');
      else tip = t('Drag on the table to aim');
      if (tip) {
        ctx.font = '600 13px system-ui, sans-serif';
        ctx.fillStyle = '#9ba2b9';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(tip, s.w / 2, s.h - V.footH / 2);
      }
    }

    // ---------- the loop ----------
    let acc = 0;
    const ticker = loop((dt) => {
      if (destroyed) return false;
      if (state === 'roll') {
        acc += dt;
        let movingNow = true;
        // Fixed 1/60 s physics frames, so play matches the computer's simulation.
        while (acc >= 1 / 60 && movingNow) {
          acc -= 1 / 60;
          movingNow = pool.step();
          sounds();
        }
        if (!movingNow) {
          acc = 0;
          shotDone();
          // ticker.kick() does nothing while this frame runs, so draw the new turn here.
          draw();
          return state === 'roll' || !!cpuAnim;
        }
        draw();
        return true;
      }
      if (cpuAnim) {
        cpuAnim.t += dt;
        const k = Math.min(1, cpuAnim.t / 0.5);
        aim = cpuAnim.from + (cpuAnim.to - cpuAnim.from) * (1 - (1 - k) * (1 - k));
        if (cpuAnim.t >= 0.95) {
          const plan = cpuAnim.plan;
          cpuAnim = null;
          aim = plan.angle;
          shoot(plan.angle, plan.power);
        }
        draw();
        return true;
      }
      draw();
      return false;
    });

    function sounds() {
      const ev = pool.ev;
      if (!ev || !prevEv) return;
      const now = performance.now();
      if (ev.pots.length > prevEv.pots) { app.sfx('pop'); app.haptic(15); lastSound = now; }
      else if (ev.contacts > prevEv.contacts && now - lastSound > 60) { app.sfx('key'); lastSound = now; }
      else if (ev.rails > prevEv.rails && now - lastSound > 90) { app.sfx('move'); lastSound = now; }
      prevEv = { contacts: ev.contacts, rails: ev.rails, pots: ev.pots.length };
    }

    if (!restore()) newGame(app.store.get('billiard.mode', 'cpu'), app.store.get('billiard.level', 'medium'));
    else startTurn(true);

    return {
      destroy() {
        destroyed = true;
        clearTimeout(cpuTimer);
        // A shot still rolling is played out at once, so the saved table is where it would stop.
        if (state === 'roll') {
          for (let f = 0; f < 60 * 25 && pool.step(); f++) { /* finish */ }
          pool.endShot();
          save();
        }
        ticker.stop();
        s.destroy();
      },
    };
  },
};

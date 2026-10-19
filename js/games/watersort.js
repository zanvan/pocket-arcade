import { CAP, canPour, pourAmount, pour, isComplete, isSolved, solve, generate, topRun } from '../logic/watersort.js';
import { t, addHebrew } from '../core/i18n.js';
import he from '../i18n/he/watersort.js';
import { el, surface, loop, rrect, ease, lerp, levelBar, ICONS } from '../core/ui.js';

const COLORS = ['#e8414b', '#ff9a1f', '#ffe14a', '#8bd34a', '#1f8f4e', '#33d1e6', '#2f63e0', '#9147d8', '#ff7ec4', '#9a5a2c', '#9aa1ad', '#f4f4f6'];
addHebrew(he);

const T_MOVE = 0.2, T_POUR = 0.32, T_BACK = 0.2;

export default {
  id: 'water',
  get title() { return t('Water Sort'); },
  icon: `<svg viewBox="0 0 64 64"><rect x="6" y="6" width="52" height="52" rx="14" fill="#232a44"/>
    <g><path d="M14 14h10v30a5 5 0 0 1-10 0z" fill="#3a4060"/><path d="M15 34h8v10a4 4 0 0 1-8 0z" fill="#e8414b"/><rect x="15" y="26" width="8" height="8" fill="#33d1e6"/><rect x="15" y="20" width="8" height="6" fill="#ffe14a"/>
    <path d="M27 14h10v30a5 5 0 0 1-10 0z" fill="#3a4060"/><path d="M28 34h8v10a4 4 0 0 1-8 0z" fill="#33d1e6"/><rect x="28" y="26" width="8" height="8" fill="#e8414b"/>
    <path d="M40 14h10v30a5 5 0 0 1-10 0z" fill="#3a4060"/><path d="M41 34h8v10a4 4 0 0 1-8 0z" fill="#ffe14a"/><rect x="41" y="26" width="8" height="8" fill="#ffe14a"/></g></svg>`,
  info: (store) => t('Level {n}', { n: store.get('water.level', 1) }),
  get help() {
    return t(`<ul><li>Tap a tube, then tap another to <b>pour</b>.</li>
    <li>You can pour onto the <b>same color</b> or into an <b>empty</b> tube, if there is room.</li>
    <li>Sort every color into its own tube to win.</li>
    <li>Stuck? Use <b>Undo</b>, <b>Hint</b> or the <b>+ tube</b>.</li></ul>`);
  },

  mount(root, app) {
    let level = app.store.get('water.level', 1);
    let maxLevel = Math.max(level, app.store.get('water.max', 1));
    let tubes, history, extraUsed, selected, anim, hint, won;
    let lifts = [];          // per-tube lift amount, eased
    let doneFlash = [];      // per-tube sparkle timer
    let destroyed = false;

    const bar = levelBar(root, {
      onPrev: () => { if (level > 1 && !anim) loadLevel(level - 1); },
      onNext: () => { if (level < maxLevel && !anim) loadLevel(level + 1); },
    });
    const stage = el('div', 'stage');
    root.append(stage);

    const undoBtn = app.action(ICONS.undo, t('Undo'), undo);
    const addBtn = app.action(ICONS.plus, t('Add an empty tube'), addTube);
    app.action(ICONS.hint, t('Hint'), showHint);
    app.action(ICONS.restart, t('Restart level'), () => { if (!anim) loadLevel(level); });

    let L = {};
    const s = surface(stage, () => { layout(); draw(); });

    function layout() {
      if (!tubes) return;
      const n = tubes.length;
      const perRow = n <= 6 ? n : Math.ceil(n / 2);
      const rows = n <= 6 ? 1 : 2;
      let tw = Math.min(60, (s.w - 16) / (perRow * 1.5));
      tw = Math.min(tw, (s.h - 40) / (rows * 3.6 + (rows - 1) * 1.1 + 0.9));
      tw = Math.max(18, Math.floor(tw));
      const th = Math.round(tw * 3.6);
      const gapY = tw * 1.1;
      const totalH = rows * th + (rows - 1) * gapY;
      const top0 = (s.h - totalH) / 2 + tw * 0.35;
      const pos = [];
      for (let i = 0; i < n; i++) {
        const r = rows === 1 ? 0 : (i < perRow ? 0 : 1);
        const inRow = r === 0 ? Math.min(n, perRow) : n - perRow;
        const idx = r === 0 ? i : i - perRow;
        const spacing = Math.min(tw * 1.6, (s.w - 8) / inRow);
        const x0 = s.w / 2 - (spacing * (inRow - 1)) / 2;
        pos.push({ x: x0 + idx * spacing, top: top0 + r * (th + gapY) });
      }
      L = { tw, th, pos, unitH: (th - tw * 0.32 - 4) / CAP };
    }

    // ---------- level state ----------
    function loadLevel(n) {
      level = n;
      maxLevel = Math.max(maxLevel, level);
      app.store.set('water.level', level);
      app.store.set('water.max', maxLevel);
      tubes = generate(level);
      history = [];
      extraUsed = false;
      selected = -1;
      anim = null;
      hint = null;
      won = false;
      lifts = tubes.map(() => 0);
      doneFlash = tubes.map(() => 0);
      bar.set(level, maxLevel);
      refreshButtons();
      layout();
      ticker.kick();
    }

    function refreshButtons() {
      undoBtn.disabled = !history.length || won;
      addBtn.disabled = extraUsed || won;
    }

    function undo() {
      if (anim || !history.length || won) return;
      tubes = history.pop();
      if (tubes.length < lifts.length) { extraUsed = false; }
      lifts.length = tubes.length;
      doneFlash.length = tubes.length;
      selected = -1;
      hint = null;
      refreshButtons();
      layout();
      ticker.kick();
    }

    function addTube() {
      if (anim || extraUsed || won) return;
      history.push(tubes.map((t) => t.slice()));
      tubes = [...tubes.map((t) => t.slice()), []];
      lifts.push(0);
      doneFlash.push(0);
      extraUsed = true;
      selected = -1;
      app.sfx('pop');
      refreshButtons();
      layout();
      ticker.kick();
    }

    function showHint() {
      if (anim || won) return;
      const sol = solve(tubes, 120000);
      if (!sol) { app.toast(t('No way out from here — try Undo')); app.sfx('bump'); return; }
      if (!sol.length) return;
      const [from, to] = sol[0];
      selected = from;
      hint = { to, t: 0 };
      app.sfx('select');
      ticker.kick();
    }

    // ---------- input ----------
    function tubeAt(p) {
      const { tw, th, pos } = L;
      for (let i = 0; i < pos.length; i++) {
        const q = pos[i];
        if (Math.abs(p.x - q.x) <= Math.max(tw * 0.8, 22) && p.y >= q.top - tw * 0.9 && p.y <= q.top + th + tw * 0.4) return i;
      }
      return -1;
    }

    s.canvas.addEventListener('pointerdown', (e) => {
      if (anim || won) return;
      const i = tubeAt(s.point(e));
      hint = null;
      if (i < 0) { selected = -1; ticker.kick(); return; }
      if (selected < 0) {
        if (!tubes[i].length || isComplete(tubes[i])) { app.sfx('bump'); return; }
        selected = i;
        app.sfx('select');
        app.haptic(6);
      } else if (selected === i) {
        selected = -1;
        app.sfx('tap');
      } else if (canPour(tubes, selected, i)) {
        startPour(selected, i);
      } else if (tubes[i].length && !isComplete(tubes[i])) {
        selected = i;
        app.sfx('select');
      } else {
        app.sfx('bump');
        app.haptic(20);
        selected = -1;
      }
      ticker.kick();
    });

    function startPour(from, to) {
      const n = pourAmount(tubes, from, to);
      const color = tubes[from][tubes[from].length - 1];
      anim = { from, to, n, color, t: 0, before: tubes.map((t) => t.slice()), startLift: lifts[from] };
      history.push(tubes.map((t) => t.slice()));
      tubes = pour(tubes, from, to);
      selected = -1;
      app.sfx('pour');
      app.haptic(10);
      refreshButtons();
    }

    function finishPour() {
      const { to } = anim;
      anim = null;
      if (isComplete(tubes[to])) {
        doneFlash[to] = 1;
        app.sfx('done');
        app.haptic(25);
      }
      if (isSolved(tubes)) {
        won = true;
        refreshButtons();
        setTimeout(celebrate, 450);
      }
    }

    async function celebrate() {
      if (destroyed) return;
      app.sfx('win');
      maxLevel = Math.max(maxLevel, level + 1);
      app.store.set('water.max', maxLevel);
      const v = await app.modal({
        title: t('Level {n} done!', { n: level }),
        html: `<p style="text-align:center">${history.length === 1 ? t('Solved in <b>1</b> pour.') : t('Solved in <b>{n}</b> pours.', { n: history.length })}</p>`,
        buttons: [{ label: t('Replay'), value: 'replay' }, { label: t('Next level'), value: 'next', primary: true }],
        dismissable: false,
      });
      if (destroyed) return;
      loadLevel(v === 'replay' ? level : level + 1);
    }

    // ---------- drawing ----------
    function tubePath(ctx, x, top, tw, th) {
      const r = tw / 2;
      ctx.beginPath();
      ctx.moveTo(x - r, top);
      ctx.lineTo(x - r, top + th - r);
      ctx.arc(x, top + th - r, r, Math.PI, 0, true);
      ctx.lineTo(x + r, top);
      ctx.closePath();
    }

    // layers: [[colorId, units], ...] bottom first, units may be fractional
    function drawTube(ctx, x, top, layers, { angle = 0, pivotX = x, pivotY = top + L.th / 2, complete = false, glow = 0, highlight = false } = {}) {
      const { tw, th, unitH } = L;
      ctx.save();
      if (angle) {
        ctx.translate(pivotX, pivotY);
        ctx.rotate(angle);
        ctx.translate(-pivotX, -pivotY);
      }
      // glass back
      tubePath(ctx, x, top, tw, th);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fill();
      // liquid
      ctx.save();
      tubePath(ctx, x, top + 2, tw - 6, th - 4);
      ctx.clip();
      let y = top + th - 2;
      for (const [c, units] of layers) {
        if (units <= 0) continue;
        const h = units * unitH;
        ctx.fillStyle = COLORS[c];
        ctx.fillRect(x - tw / 2, y - h - 0.6, tw, h + 0.6);
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(x + tw * 0.18, y - h, tw * 0.3, h);
        y -= h;
      }
      // surface shine
      if (layers.some(([, u]) => u > 0)) {
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.fillRect(x - tw / 2, y - 1, tw, 2.5);
      }
      ctx.restore();
      // glass outline + reflection
      tubePath(ctx, x, top, tw, th);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = highlight ? '#ffd23f' : complete ? '#3ecf8e' : 'rgba(210,220,255,0.55)';
      if (highlight) { ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = 12; }
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.13)';
      ctx.fillRect(x - tw / 2 + tw * 0.14, top + tw * 0.3, tw * 0.12, th - tw * 0.9);
      // lip
      rrect(ctx, x - tw / 2 - 3, top - 4, tw + 6, 7, 3.5);
      ctx.fillStyle = complete ? '#3ecf8e' : 'rgba(210,220,255,0.6)';
      ctx.fill();
      if (glow > 0) {
        ctx.globalAlpha = glow;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        tubePath(ctx, x, top, tw, th);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }

    function layersOf(tube) {
      const out = [];
      for (const c of tube) {
        if (out.length && out[out.length - 1][0] === c) out[out.length - 1][1]++;
        else out.push([c, 1]);
      }
      return out;
    }

    function draw() {
      const { ctx } = s;
      s.begin();
      if (!L.pos) return;
      const { tw, th, pos } = L;
      // draw the pouring tube last so it sits on top
      const order = tubes.map((_, i) => i);
      if (anim) order.push(order.splice(anim.from, 1)[0]);
      for (const i of order) {
        const p = pos[i];
        if (!p) continue;
        const lift = lifts[i] * tw * 0.5;
        if (anim && (i === anim.from || i === anim.to)) {
          drawAnimTube(ctx, i);
          continue;
        }
        drawTube(ctx, p.x, p.top - lift, layersOf(tubes[i]), {
          complete: isComplete(tubes[i]),
          glow: doneFlash[i] * 0.8,
          highlight: hint && hint.to === i && Math.floor(hint.t * 4) % 2 === 0,
        });
      }
      if (won) {
        ctx.fillStyle = '#3ecf8e';
        ctx.font = `800 ${Math.round(tw * 0.55)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(t('Sorted!'), s.w / 2, Math.max(24, pos[0].top - tw * 0.9));
      }
      void th;
    }

    function drawAnimTube(ctx, i) {
      const { tw, th, pos, unitH } = L;
      const a = anim;
      const t = a.t;
      const before = layersOf(a.before[i]);
      const src = i === a.from;
      // fraction of the pour that has happened
      const pf = Math.max(0, Math.min(1, (t - T_MOVE) / T_POUR));
      const moved = a.n * ease.inOut(pf);
      const layers = before.map((l) => l.slice());
      if (src) {
        let left = moved;
        for (let k = layers.length - 1; k >= 0 && left > 0; k--) {
          const take = Math.min(layers[k][1], left);
          layers[k][1] -= take;
          left -= take;
        }
      } else {
        layers.push([a.color, moved]);
      }
      const p = pos[i];
      if (!src) {
        drawTube(ctx, p.x, p.top, layers, {});
        return;
      }
      // source tube: fly over the target, tilt, pour, return
      const q = pos[a.to];
      const sign = q.x >= p.x ? 1 : -1;
      const fullAngle = sign * (1.15 + 0.08 * (a.before[i].length - topRun(a.before[i]) > 1 ? 1 : 0));
      const mouthX = q.x - sign * tw * 0.15;
      const mouthY = q.top - tw * 0.55;
      const h2 = th / 2;
      const pivX = mouthX - h2 * Math.sin(fullAngle);
      const pivY = mouthY + h2 * Math.cos(fullAngle);
      const restX = p.x, restY = p.top + h2 - a.startLift * tw * 0.5;
      let k, cx, cy, ang;
      if (t < T_MOVE) {
        k = ease.inOut(t / T_MOVE);
        cx = lerp(restX, pivX, k); cy = lerp(restY, pivY, k); ang = lerp(0, fullAngle, k);
      } else if (t < T_MOVE + T_POUR) {
        cx = pivX; cy = pivY; ang = fullAngle;
      } else {
        k = ease.inOut(Math.min(1, (t - T_MOVE - T_POUR) / T_BACK));
        cx = lerp(pivX, p.x, k); cy = lerp(pivY, p.top + h2, k); ang = lerp(fullAngle, 0, k);
      }
      // stream
      if (t >= T_MOVE && t < T_MOVE + T_POUR) {
        const level = a.before[a.to].length + moved;
        const surfaceY = q.top + th - 2 - level * unitH;
        const w = tw * 0.16 * (pf < 0.85 ? 1 : (1 - pf) / 0.15);
        ctx.fillStyle = COLORS[a.color];
        rrect(ctx, mouthX - w / 2, mouthY, w, Math.max(0, surfaceY - mouthY), w / 2);
        ctx.fill();
      }
      drawTube(ctx, cx, cy - h2, layers, { angle: ang, pivotX: cx, pivotY: cy });
    }

    // ---------- animation ----------
    const ticker = loop((dt) => {
      if (destroyed) return false;
      let busy = false;
      for (let i = 0; i < tubes.length; i++) {
        const target = i === selected ? 1 : 0;
        const l = lifts[i] || 0;
        const nl = l + (target - l) * Math.min(1, dt * 18);
        lifts[i] = Math.abs(nl - target) < 0.01 ? target : nl;
        if (lifts[i] !== target) busy = true;
        if (doneFlash[i] > 0) { doneFlash[i] = Math.max(0, doneFlash[i] - dt * 1.6); busy = true; }
      }
      if (anim) {
        anim.t += dt;
        busy = true;
        if (anim.t >= T_MOVE + T_POUR + T_BACK) { lifts[anim.from] = 0; finishPour(); }
      }
      if (hint) {
        hint.t += dt;
        busy = true;
        if (hint.t > 2.5) hint = null;
      }
      draw();
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

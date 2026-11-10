import * as mj from '../logic/mahjong.js';
import { t, addHebrew, lang } from '../core/i18n.js';
import he from '../i18n/he/mahjong.js';
import { el, surface, loop, rrect, ease, clamp, lerp, levelBar, ICONS } from '../core/ui.js';

addHebrew(he);

const ASPECT = 1.3;       // tile height / tile width
const T_FX = 0.38;        // a matched pair floats away
const T_SHUFFLE = 0.8;    // tiles flip over in a wave
const T_HINT = 2.8;
const T_SHAKE = 0.3;

const INK = '#23252b', RED = '#c62d2d', GREEN = '#17803d', BLUE = '#1f5fb0';
const CJK = '"Noto Serif CJK SC","Source Han Serif SC","Songti SC","STSong","PingFang SC","Microsoft YaHei","Noto Sans CJK SC",serif';

const SHUFFLE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h4v4"/><path d="M4 20L20 4"/><path d="M20 16v4h-4"/><path d="M14 14l6 6"/><path d="M4 4l5 5"/></svg>';

export default {
  id: 'mahjong',
  get title() { return t('Mahjong'); },
  icon: `<svg viewBox="0 0 64 64"><rect x="6" y="6" width="52" height="52" rx="14" fill="#232a44"/>
    <rect x="13" y="19" width="24" height="31" rx="5" fill="#2f8a63"/><rect x="13" y="19" width="21" height="28" rx="4.5" fill="#f6efd8"/>
    <g fill="#c62d2d"><circle cx="20" cy="27" r="3"/><circle cx="27" cy="27" r="3"/><circle cx="20" cy="38" r="3"/><circle cx="27" cy="38" r="3"/></g>
    <rect x="27" y="13" width="24" height="31" rx="5" fill="#2f8a63"/><rect x="27" y="13" width="21" height="28" rx="4.5" fill="#fffaf0" stroke="#d8cfae" stroke-width="1"/>
    <g fill="#17803d"><rect x="32" y="18" width="4" height="9" rx="2"/><rect x="39" y="18" width="4" height="9" rx="2"/><rect x="35.5" y="28" width="4" height="9" rx="2" fill="#c62d2d"/></g></svg>`,
  info: (store) => t('Level {n}', { n: store.get('mj.level', 1) }),
  get help() {
    return t(`<ul><li>Tap two <b>free</b> tiles with the same picture to remove them.</li><li>A tile is free when nothing lies on top of it and its left or right side is open.</li><li>Every flower matches any other flower, and every season matches any other season.</li><li>Clear the whole board to win. There is no timer, so take your time.</li><li>Stuck? Use <b>Hint</b>, <b>Undo</b> or <b>Shuffle</b>.</li></ul>`);
  },

  mount(root, app) {
    let level = app.store.get('mj.level', 1);
    let maxLevel = Math.max(level, app.store.get('mj.max', 1));
    let board = [];              // every tile of the level: { id, x, y, z, face, alive }
    let history = [];            // [idA, idB, faceA, faceB] for a pair, [-1, faces] for a shuffle
    let remaining = [];          // alive tiles
    let freeIds = new Set();
    let selected = -1;
    let hint = null;             // { a, b, t }
    let fx = [];                 // pairs on their way out
    let shuf = null;             // { t, old } while the tiles flip
    let shake = new Map();       // blocked tile id -> seconds since tapped
    let won = false;
    let stuckOpen = false;
    let destroyed = false;
    let timers = [];

    const bar = levelBar(root, {
      onPrev: () => { if (level > 1) loadLevel(level - 1); },
      onNext: () => { if (level < maxLevel) loadLevel(level + 1); },
    });
    const hud = el('div', 'hud');
    hud.innerHTML = `<div class="chip wide"><span class="k">${t('Tiles left')}</span><span class="v" data-left>0</span></div>`;
    const leftEl = hud.querySelector('[data-left]');
    const stage = el('div', 'stage');
    root.append(hud, stage);

    app.action(ICONS.hint, t('Hint'), showHint);
    const shuffleBtn = app.action(SHUFFLE_ICON, t('Shuffle'), () => doShuffle());
    const undoBtn = app.action(ICONS.undo, t('Undo'), undo);
    app.action(ICONS.restart, t('Restart level'), () => loadLevel(level));

    let L = { cw: 0 };
    let sprites = new Map();
    const s = surface(stage, () => { layout(); draw(); });

    function later(fn, ms) {
      const id = setTimeout(() => { timers = timers.filter((x) => x !== id); if (!destroyed) fn(); }, ms);
      timers.push(id);
    }

    // ---------- geometry ----------
    // A tile covers 2x2 half cells. Each layer is drawn a little up and to the left, so
    // a tile's right and bottom edge show as its thickness.
    function layout() {
      if (!board.length) return;
      let W = 2, H = 2, Z = 0;
      for (const b of board) { W = Math.max(W, b.x + 2); H = Math.max(H, b.y + 2); Z = Math.max(Z, b.z); }
      const lift = 0.26;
      const fit = Math.min((s.w - 12) / (W + lift * Z), (s.h - 12) / (H * ASPECT + lift * Z));
      const cw = clamp(fit, 4, 64);
      const th = cw * lift;
      const ch = cw * ASPECT;
      const boardW = W * cw + Z * th, boardH = H * ch + Z * th;
      L = {
        cw, ch, th, W, H, Z,
        fw: cw * 2, fh: ch * 2,                       // a tile's whole footprint
        ox: (s.w - boardW) / 2 + Z * th,
        oy: (s.h - boardH) / 2 + Z * th,
        r: cw * 0.42,
        pad: Math.ceil(th * 2),
      };
      sprites = new Map();
    }

    function at(b) {
      return { x: L.ox + b.x * L.cw - b.z * L.th, y: L.oy + b.y * L.ch - b.z * L.th };
    }

    // ---------- level state ----------
    function snapshot() {
      return board.map((b) => (b.alive ? b.face : -1));
    }

    function save() {
      app.store.set('mj.state', { level, f: snapshot(), h: history });
    }

    function loadLevel(n, resume = false) {
      // Drop waits from the old board (a win dialog, a stuck check) so they cannot hit the new one.
      timers.forEach(clearTimeout);
      timers = [];
      level = Math.max(1, n);
      maxLevel = Math.max(maxLevel, level);
      app.store.set('mj.level', level);
      app.store.set('mj.max', maxLevel);
      board = mj.generate(level).tiles.map((b) => ({ ...b, alive: true }));
      history = [];
      if (resume) restore();
      selected = -1;
      hint = null;
      fx = [];
      shuf = null;
      shake = new Map();
      won = false;
      stuckOpen = false;
      bar.set(level, maxLevel);
      layout();
      refresh();
      save();
      if (remaining.length) later(checkStuck, 300);
    }

    // Puts a saved game back, if it still fits this level's board.
    function restore() {
      const saved = app.store.get('mj.state', null);
      if (!saved || saved.level !== level || !Array.isArray(saved.f) || saved.f.length !== board.length) return;
      if (!saved.f.some((v) => v >= 0)) return;
      const ok = (v) => Number.isInteger(v) && v >= -1 && v < mj.FACE_COUNT;
      if (!saved.f.every(ok)) return;
      saved.f.forEach((v, i) => { board[i].alive = v >= 0; if (v >= 0) board[i].face = v; });
      const valid = (e) => Array.isArray(e) && (e[0] === -1 ? Array.isArray(e[1]) && e[1].length === board.length : e.length === 4 && board[e[0]] && board[e[1]]);
      history = Array.isArray(saved.h) ? saved.h.filter(valid) : [];
    }

    function refresh() {
      remaining = board.filter((b) => b.alive);
      freeIds = new Set(mj.freeTiles(remaining).map((b) => b.id));
      leftEl.textContent = String(remaining.length);
      undoBtn.disabled = !history.length || won;
      shuffleBtn.disabled = won || remaining.length < 2;
      ticker.kick();
    }

    // ---------- moves ----------
    function removePair(a, b) {
      history.push([a.id, b.id, a.face, b.face]);
      a.alive = b.alive = false;
      fx.push({ a: { ...at(a), face: a.face }, b: { ...at(b), face: b.face }, t: 0 });
      selected = -1;
      hint = null;
      app.sfx('pop');
      app.haptic(10);
      refresh();
      save();
      if (!remaining.length) {
        won = true;
        refresh();
        app.store.del('mj.state');
        later(celebrate, 650);
      } else {
        later(checkStuck, 450);
      }
    }

    function undo() {
      if (!history.length || won || shuf) return;
      const e = history.pop();
      fx = [];
      if (e[0] === -1) {
        for (const b of board) if (b.alive) b.face = e[1][b.id];
      } else {
        const [ia, ib, fa, fb] = e;
        board[ia].alive = board[ib].alive = true;
        board[ia].face = fa;
        board[ib].face = fb;
      }
      selected = -1;
      hint = null;
      app.sfx('move');
      refresh();
      save();
    }

    function showHint() {
      if (won || shuf) return;
      const pair = mj.findPair(remaining);
      if (!pair) { checkStuck(); return; }
      selected = -1;
      hint = { a: pair[0].id, b: pair[1].id, t: 0 };
      app.sfx('select');
      ticker.kick();
    }

    function doShuffle() {
      if (won || shuf || remaining.length < 2) return;
      const next = mj.shuffle(remaining, Math.random);
      if (!next) { app.toast(t('This position cannot be shuffled. Try Undo.'), 2400); app.sfx('bump'); return; }
      const old = snapshot();
      history.push([-1, old]);
      for (const n of next) board[n.id].face = n.face;
      shuf = { t: 0, old };
      selected = -1;
      hint = null;
      fx = [];
      app.sfx('rotate');
      refresh();
      save();
    }

    async function checkStuck() {
      if (destroyed || won || shuf || stuckOpen || !remaining.length) return;
      if (mj.anyMoves(remaining)) return;
      stuckOpen = true;
      app.sfx('bump');
      const canShuffle = mj.shuffle(remaining, Math.random) !== null;
      const v = await app.modal({
        title: t('No more moves'),
        html: `<p style="text-align:center">${canShuffle ? t('No two free tiles match any more. Shuffle the tiles that are left?') : t('Shuffling will not help here. Undo a few moves or start the level again.')}</p>`,
        buttons: canShuffle
          ? [{ label: t('Undo'), value: 'undo' }, { label: t('Shuffle'), value: 'shuffle', primary: true }]
          : [{ label: t('Restart level'), value: 'restart' }, { label: t('Undo'), value: 'undo', primary: true }],
      });
      stuckOpen = false;
      if (destroyed) return;
      if (v === 'shuffle') doShuffle();
      else if (v === 'undo') undo();
      else if (v === 'restart') loadLevel(level);
    }

    async function celebrate() {
      if (destroyed) return;
      app.sfx('win');
      maxLevel = Math.max(maxLevel, level + 1);
      app.store.set('mj.max', maxLevel);
      const v = await app.modal({
        title: t('Level {n} done!', { n: level }),
        html: `<p style="text-align:center">${t('Well done! All {n} tiles are cleared.', { n: board.length })}</p>`,
        buttons: [{ label: t('Replay'), value: 'replay' }, { label: t('Next level'), value: 'next', primary: true }],
        dismissable: false,
      });
      if (destroyed) return;
      loadLevel(v === 'replay' ? level : level + 1);
    }

    // ---------- input ----------
    function tileAt(p) {
      for (let i = board.length - 1; i >= 0; i--) {
        const b = board[i];
        if (!b.alive) continue;
        const q = at(b);
        if (p.x >= q.x && p.x <= q.x + L.fw && p.y >= q.y && p.y <= q.y + L.fh) return b;
      }
      return null;
    }

    s.canvas.addEventListener('pointerdown', (e) => {
      if (won || shuf || !L.cw) return;
      const b = tileAt(s.point(e));
      hint = null;
      if (!b) { selected = -1; ticker.kick(); return; }
      if (!freeIds.has(b.id)) {
        shake.set(b.id, 0);
        app.sfx('bump');
        app.haptic(15);
        app.toast(t('This tile is blocked'), 1100);
      } else if (selected < 0) {
        selected = b.id;
        app.sfx('select');
        app.haptic(6);
      } else if (selected === b.id) {
        selected = -1;
        app.sfx('tap');
      } else if (mj.matchable(board[selected], b)) {
        removePair(board[selected], b);
      } else {
        selected = -1;
        app.sfx('bump');
        app.haptic(20);
      }
      ticker.kick();
    });

    // ---------- tile pictures ----------
    function sprite(face) {
      let c = sprites.get(face);
      if (c) return c;
      const { fw, fh, th, pad, r } = L;
      const dpr = s.dpr;
      c = document.createElement('canvas');
      c.width = Math.max(1, Math.round((fw + pad * 2) * dpr));
      c.height = Math.max(1, Math.round((fh + pad * 2) * dpr));
      const g = c.getContext('2d');
      g.scale(dpr, dpr);
      g.translate(pad, pad);
      // body (the tile's thickness) with a soft shadow on whatever lies below
      g.save();
      g.shadowColor = 'rgba(0,0,0,0.4)';
      g.shadowBlur = th * 1.6 * dpr;
      g.shadowOffsetX = th * 0.6 * dpr;
      g.shadowOffsetY = th * 0.9 * dpr;
      rrect(g, 0, 0, fw, fh, r);
      g.fillStyle = '#2f8a63';
      g.fill();
      g.restore();
      const body = g.createLinearGradient(0, 0, fw, fh);
      body.addColorStop(0, '#59bb8e');
      body.addColorStop(1, '#236b4c');
      rrect(g, 0, 0, fw, fh, r);
      g.fillStyle = body;
      g.fill();
      g.lineWidth = 1;
      g.strokeStyle = '#17482f';
      g.stroke();
      // ivory face
      const fW = fw - th, fH = fh - th;
      const grad = g.createLinearGradient(0, 0, 0, fH);
      grad.addColorStop(0, '#fffef6');
      grad.addColorStop(1, '#f0e8cd');
      rrect(g, 0, 0, fW, fH, r);
      g.fillStyle = grad;
      g.fill();
      g.strokeStyle = '#c4b88e';
      g.stroke();
      if (face >= 0) drawFace(g, face, fW, fH);
      sprites.set(face, c);
      return c;
    }

    // ---------- drawing ----------
    function drawTile(ctx, b, x, y, face) {
      const { fw, fh, th, pad, r } = L;
      ctx.drawImage(sprite(face), x - pad, y - pad, fw + pad * 2, fh + pad * 2);
      if (shuf) return;
      if (!freeIds.has(b.id)) {
        rrect(ctx, x, y, fw, fh, r);
        ctx.fillStyle = 'rgba(20,28,42,0.3)';
        ctx.fill();
      }
      const ring = (color, fill, alpha = 1) => {
        ctx.save();
        ctx.globalAlpha = alpha;
        rrect(ctx, x, y, fw - th, fh - th, r);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.lineWidth = Math.max(3, L.cw * 0.16);
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 12 * s.dpr;
        ctx.stroke();
        ctx.restore();
      };
      if (b.id === selected) ring('#ffb300', 'rgba(255,200,40,0.4)');
      if (hint && (b.id === hint.a || b.id === hint.b)) {
        ring('#2fd18b', 'rgba(47,209,139,0.38)', 0.55 + 0.45 * Math.sin(hint.t * 9));
      }
    }

    function draw() {
      s.begin();
      if (!board.length || !L.cw) return;
      const { ctx } = s;
      for (const b of board) {
        if (!b.alive) continue;
        const p = at(b);
        let x = p.x, face = b.face, sx = 1;
        const sh = shake.get(b.id);
        if (sh !== undefined) x += Math.sin(sh * 55) * L.cw * 0.14 * (1 - sh / T_SHAKE);
        if (shuf) {
          const k = clamp((shuf.t / T_SHUFFLE - (b.x / L.W) * 0.3) / 0.7, 0, 1);
          sx = Math.max(0.03, Math.abs(Math.cos(Math.PI * k)));
          if (k < 0.5) face = shuf.old[b.id];
        }
        if (sx === 1) {
          drawTile(ctx, b, x, p.y, face);
        } else {
          const mid = x + L.fw / 2;
          ctx.save();
          ctx.translate(mid, 0);
          ctx.scale(sx, 1);
          ctx.translate(-mid, 0);
          drawTile(ctx, b, x, p.y, face);
          ctx.restore();
        }
      }
      for (const f of fx) drawFx(ctx, f);
    }

    // The two matched tiles drift together, grow, fade and throw a few sparks.
    function drawFx(ctx, f) {
      const k = clamp(f.t / T_FX, 0, 1);
      const mx = (f.a.x + f.b.x) / 2, my = (f.a.y + f.b.y) / 2;
      const m = ease.out(k) * 0.55;
      for (const e of [f.a, f.b]) {
        const x = lerp(e.x, mx, m), y = lerp(e.y, my, m);
        const sc = 1 + 0.35 * k;
        const cx = x + L.fw / 2, cy = y + L.fh / 2;
        ctx.save();
        ctx.globalAlpha = 1 - k * k;
        ctx.translate(cx, cy);
        ctx.scale(sc, sc);
        ctx.translate(-cx, -cy);
        ctx.drawImage(sprite(e.face), x - L.pad, y - L.pad, L.fw + L.pad * 2, L.fh + L.pad * 2);
        ctx.restore();
        ctx.save();
        ctx.fillStyle = '#ffd54a';
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * Math.PI * 2 + 0.4;
          const d = ease.out(k) * L.cw * 2.2;
          ctx.globalAlpha = (1 - k) * 0.9;
          ctx.beginPath();
          ctx.arc(cx + Math.cos(ang) * d, cy + Math.sin(ang) * d, Math.max(0.5, (1 - k) * L.cw * 0.28), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    // ---------- animation ----------
    const ticker = loop((dt) => {
      if (destroyed) return false;
      let busy = false;
      if (fx.length) {
        for (const f of fx) f.t += dt;
        fx = fx.filter((f) => f.t < T_FX);
        busy = fx.length > 0;
      }
      if (hint) {
        hint.t += dt;
        busy = true;
        if (hint.t > T_HINT) hint = null;
      }
      if (shuf) {
        shuf.t += dt;
        busy = true;
        if (shuf.t >= T_SHUFFLE) { shuf = null; later(checkStuck, 100); }
      }
      for (const [id, v] of shake) {
        if (v + dt >= T_SHAKE) shake.delete(id);
        else { shake.set(id, v + dt); busy = true; }
      }
      draw();
      return busy;
    });

    loadLevel(level, true);

    return {
      destroy() {
        destroyed = true;
        timers.forEach(clearTimeout);
        ticker.stop();
        s.destroy();
      },
    };
  },
};

// ---------- tile faces (drawn with the origin at the face's top-left corner) ----------
function drawFace(g, face, w, h) {
  const d = mj.describe(face);
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const box = { x: w * 0.14, y: h * 0.17, w: w * 0.72, h: h * 0.76 };
  if (d.suit === 'dot') { pips(g, d.n, box); corner(g, String(d.n), w, h, BLUE); }
  else if (d.suit === 'bamboo') { bamboo(g, d.n, box); corner(g, String(d.n), w, h, GREEN); }
  else if (d.suit === 'char') {
    g.fillStyle = INK;
    g.font = `800 ${h * 0.34}px ${CJK}`;
    g.fillText('一二三四五六七八九'[d.n - 1], w / 2, h * 0.4);
    g.fillStyle = RED;
    g.font = `800 ${h * 0.31}px ${CJK}`;
    g.fillText('萬', w / 2, h * 0.75);
    corner(g, String(d.n), w, h, INK);
  } else if (d.suit === 'wind') {
    g.fillStyle = INK;
    g.font = `800 ${h * 0.6}px ${CJK}`;
    g.fillText('東南西北'[d.n - 1], w / 2, h * 0.54);
    if (lang === 'en') corner(g, 'ESWN'[d.n - 1], w, h, '#5b6070');   // English letters only make sense in English
  } else if (d.suit === 'dragon') {
    if (d.n === 3) {
      g.strokeStyle = BLUE;
      g.lineWidth = Math.max(2, w * 0.07);
      rrect(g, w * 0.2, h * 0.2, w * 0.6, h * 0.6, w * 0.06);
      g.stroke();
      g.lineWidth = Math.max(1, w * 0.025);
      rrect(g, w * 0.3, h * 0.3, w * 0.4, h * 0.4, w * 0.03);
      g.stroke();
    } else {
      g.fillStyle = d.n === 1 ? RED : GREEN;
      g.font = `800 ${h * 0.62}px ${CJK}`;
      g.fillText(d.n === 1 ? '中' : '發', w / 2, h * 0.54);
    }
  } else if (d.suit === 'flower') {
    frame(g, w, h, RED);
    flower(g, d.n, w, h);
  } else {
    frame(g, w, h, BLUE);
    season(g, d.n, w, h);
  }
  g.restore();
}

function corner(g, text, w, h, color) {
  g.save();
  g.textAlign = 'left';
  g.textBaseline = 'top';
  g.fillStyle = color;
  g.font = `800 ${h * 0.19}px system-ui, sans-serif`;
  g.fillText(text, w * 0.08, h * 0.04);
  g.restore();
}

function frame(g, w, h, color) {
  g.strokeStyle = color;
  g.lineWidth = Math.max(1.5, w * 0.045);
  rrect(g, w * 0.1, h * 0.08, w * 0.8, h * 0.84, w * 0.08);
  g.stroke();
}

const DOT_SPOTS = {
  1: [[0.5, 0.5]],
  2: [[0.5, 0.24], [0.5, 0.76]],
  3: [[0.2, 0.16], [0.5, 0.5], [0.8, 0.84]],
  4: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]],
  5: [[0.25, 0.2], [0.75, 0.2], [0.5, 0.5], [0.25, 0.8], [0.75, 0.8]],
  6: [[0.25, 0.17], [0.75, 0.17], [0.25, 0.5], [0.75, 0.5], [0.25, 0.83], [0.75, 0.83]],
  7: [[0.2, 0.1], [0.5, 0.22], [0.8, 0.34], [0.25, 0.66], [0.75, 0.66], [0.25, 0.9], [0.75, 0.9]],
  8: [[0.25, 0.1], [0.75, 0.1], [0.25, 0.37], [0.75, 0.37], [0.25, 0.63], [0.75, 0.63], [0.25, 0.9], [0.75, 0.9]],
  9: [[0.2, 0.17], [0.5, 0.17], [0.8, 0.17], [0.2, 0.5], [0.5, 0.5], [0.8, 0.5], [0.2, 0.83], [0.5, 0.83], [0.8, 0.83]],
};
const DOT_R = [0, 0.3, 0.17, 0.16, 0.16, 0.16, 0.15, 0.14, 0.13, 0.13];

function pips(g, n, box) {
  const r = box.w * DOT_R[n];
  const colors = [GREEN, RED, BLUE];
  DOT_SPOTS[n].forEach(([u, v], i) => {
    const c = n === 1 ? RED : colors[i % 3];
    const x = box.x + u * box.w, y = box.y + v * box.h;
    g.fillStyle = c;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fffdf4';
    g.beginPath(); g.arc(x, y, r * 0.58, 0, Math.PI * 2); g.fill();
    g.fillStyle = n === 1 ? GREEN : c;
    g.beginPath(); g.arc(x, y, r * 0.3, 0, Math.PI * 2); g.fill();
  });
}

// [u, v, color] per stick, and the stick size as a share of the box.
const STICKS = {
  2: { s: [[0.5, 0.26], [0.5, 0.74]], w: 0.2, h: 0.42 },
  3: { s: [[0.5, 0.26], [0.28, 0.74], [0.72, 0.74]], w: 0.2, h: 0.42 },
  4: { s: [[0.28, 0.26], [0.72, 0.26], [0.28, 0.74], [0.72, 0.74]], w: 0.2, h: 0.42 },
  5: { s: [[0.2, 0.26], [0.8, 0.26], [0.5, 0.5, RED], [0.2, 0.74], [0.8, 0.74]], w: 0.2, h: 0.4 },
  6: { s: [[0.16, 0.26], [0.5, 0.26], [0.84, 0.26], [0.16, 0.74], [0.5, 0.74], [0.84, 0.74]], w: 0.19, h: 0.42 },
  7: { s: [[0.5, 0.15, RED], [0.16, 0.5], [0.5, 0.5], [0.84, 0.5], [0.16, 0.85], [0.5, 0.85], [0.84, 0.85]], w: 0.19, h: 0.28 },
  8: { s: [[0.12, 0.26], [0.37, 0.26], [0.63, 0.26], [0.88, 0.26], [0.12, 0.74], [0.37, 0.74], [0.63, 0.74], [0.88, 0.74]], w: 0.16, h: 0.42 },
  9: { s: [[0.16, 0.17], [0.5, 0.17, RED], [0.84, 0.17], [0.16, 0.5], [0.5, 0.5, RED], [0.84, 0.5], [0.16, 0.83], [0.5, 0.83, RED], [0.84, 0.83]], w: 0.19, h: 0.28 },
};

function bamboo(g, n, box) {
  if (n === 1) { bird(g, box.x + box.w / 2, box.y + box.h / 2, box.w); return; }
  const spec = STICKS[n];
  const sw = box.w * spec.w, sh = box.h * spec.h;
  for (const [u, v, color = GREEN] of spec.s) stick(g, box.x + u * box.w, box.y + v * box.h, sw, sh, color);
}

function stick(g, cx, cy, sw, sh, color) {
  rrect(g, cx - sw / 2, cy - sh / 2, sw, sh, sw / 2);
  g.fillStyle = color;
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(cx - sw * 0.28, cy - sh / 2 + sw * 0.4, sw * 0.18, sh - sw * 0.8);
  g.fillStyle = '#fffdf4';
  g.fillRect(cx - sw / 2, cy - sh * 0.04, sw, Math.max(1, sh * 0.08));
  g.fillRect(cx - sw / 2, cy - sh * 0.3, sw, Math.max(1, sh * 0.05));
  g.fillRect(cx - sw / 2, cy + sh * 0.22, sw, Math.max(1, sh * 0.05));
}

function bird(g, cx, cy, s) {
  g.fillStyle = BLUE;                                   // tail
  g.beginPath(); g.moveTo(cx - s * 0.2, cy + s * 0.05); g.lineTo(cx - s * 0.5, cy + s * 0.48); g.lineTo(cx - s * 0.02, cy + s * 0.3); g.closePath(); g.fill();
  g.fillStyle = GREEN;                                  // body
  g.beginPath(); g.ellipse(cx - s * 0.02, cy + s * 0.05, s * 0.3, s * 0.42, 0.15, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(cx + s * 0.1, cy - s * 0.4, s * 0.17, 0, Math.PI * 2); g.fill();   // head
  g.fillStyle = RED;                                    // beak and wing
  g.beginPath(); g.moveTo(cx + s * 0.24, cy - s * 0.46); g.lineTo(cx + s * 0.44, cy - s * 0.38); g.lineTo(cx + s * 0.24, cy - s * 0.32); g.closePath(); g.fill();
  g.beginPath(); g.ellipse(cx - s * 0.04, cy + s * 0.08, s * 0.14, s * 0.26, 0.15, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fffdf4';
  g.beginPath(); g.arc(cx + s * 0.13, cy - s * 0.43, s * 0.045, 0, Math.PI * 2); g.fill();
}

const PETALS = ['#e4549b', '#f39a1e', '#8e55d6', '#d93a3a'];

function flower(g, n, w, h) {
  const cx = w / 2, cy = h * 0.4, pr = w * 0.15;
  g.strokeStyle = GREEN;
  g.lineWidth = Math.max(1.5, w * 0.05);
  g.beginPath(); g.moveTo(cx, cy + pr); g.lineTo(cx, h * 0.84); g.stroke();
  g.fillStyle = GREEN;
  for (const sgn of [-1, 1]) {
    g.beginPath(); g.ellipse(cx + sgn * w * 0.14, h * 0.7, w * 0.13, w * 0.06, sgn * -0.5, 0, Math.PI * 2); g.fill();
  }
  const count = 4 + (n % 2) + 1;
  g.fillStyle = PETALS[n - 1];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 - Math.PI / 2;
    g.beginPath(); g.arc(cx + Math.cos(a) * pr, cy + Math.sin(a) * pr, pr * 0.78, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#ffd23f';
  g.beginPath(); g.arc(cx, cy, pr * 0.55, 0, Math.PI * 2); g.fill();
}

function season(g, n, w, h) {
  const cx = w / 2, cy = h / 2;
  if (n === 1) {                                         // spring: a sprout
    g.strokeStyle = GREEN;
    g.lineWidth = Math.max(1.5, w * 0.06);
    g.beginPath(); g.moveTo(cx, h * 0.8); g.lineTo(cx, h * 0.4); g.stroke();
    g.fillStyle = '#3aa655';
    for (const sgn of [-1, 1]) {
      g.beginPath(); g.ellipse(cx + sgn * w * 0.16, h * 0.4, w * 0.18, w * 0.09, sgn * -0.6, 0, Math.PI * 2); g.fill();
    }
  } else if (n === 2) {                                  // summer: the sun
    g.strokeStyle = '#f39a1e';
    g.lineWidth = Math.max(1.5, w * 0.05);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * w * 0.24, cy + Math.sin(a) * w * 0.24);
      g.lineTo(cx + Math.cos(a) * w * 0.34, cy + Math.sin(a) * w * 0.34);
      g.stroke();
    }
    g.fillStyle = '#f7b500';
    g.beginPath(); g.arc(cx, cy, w * 0.19, 0, Math.PI * 2); g.fill();
  } else if (n === 3) {                                  // autumn: a leaf
    g.save();
    g.translate(cx, cy);
    g.rotate(-0.6);
    g.fillStyle = '#d9631a';
    g.beginPath(); g.ellipse(0, 0, w * 0.14, w * 0.3, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#fff3d6';
    g.lineWidth = Math.max(1, w * 0.03);
    g.beginPath(); g.moveTo(0, -w * 0.26); g.lineTo(0, w * 0.34); g.stroke();
    g.restore();
  } else {                                               // winter: a snowflake
    g.strokeStyle = BLUE;
    g.lineWidth = Math.max(1.5, w * 0.045);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI;
      const dx = Math.cos(a) * w * 0.3, dy = Math.sin(a) * w * 0.3;
      g.beginPath(); g.moveTo(cx - dx, cy - dy); g.lineTo(cx + dx, cy + dy); g.stroke();
    }
    g.fillStyle = BLUE;
    g.beginPath(); g.arc(cx, cy, w * 0.05, 0, Math.PI * 2); g.fill();
  }
}

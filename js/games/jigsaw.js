import * as jg from '../logic/jigsaw.js';
import { rng } from '../logic/rng.js';
import { t, addHebrew } from '../core/i18n.js';
import he from '../i18n/he/jigsaw.js';
import { el, surface, loop, rrect, ease, clamp, ICONS } from '../core/ui.js';
import { PICTURES, paintPicture } from './jigsaw-pictures.js';

addHebrew(he);

const SAVE = 'jigsaw.save';
const PHOTO = 'jigsaw.photo';
const LAST = 'jigsaw.last';
const GHOST = 'jigsaw.ghost';
const NOMINAL = 4 / 3;        // shape the built-in pictures are painted in
const PICTURE_PX = 1200;      // long side of a painted picture
const PHOTO_PX = 1600;        // long side of a photo
const PHOTO_CHARS = 600000;   // a saved photo must stay under this many characters
const BIG_FILE = 2500000;     // bytes; bigger photos are shrunk while they are decoded
const SPREAD = 1.25;          // pieces apart (in piece sizes) when they are scattered
const T_SNAP = 0.14;          // seconds a piece takes to glide into place

const EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EDGES = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><rect x="9" y="9" width="6" height="6" rx="1" stroke-dasharray="2 2.2" opacity=".6"/></svg>';
const SPREAD_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="6.5" height="6.5" rx="1.3"/><rect x="14.5" y="4" width="6.5" height="6.5" rx="1.3"/><rect x="4" y="14.5" width="6.5" height="6.5" rx="1.3"/><rect x="14" y="14" width="6.5" height="6.5" rx="1.3"/></svg>';

const fmtTime = (sec) => {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};

// The id a best time is filed under: one per picture and piece count.
const bestKey = (picId, n) => `jigsaw.best.${picId}.${n}`;

// ---------- the player's own photo ----------
async function decode(file) {
  if (window.createImageBitmap) {
    // a phone photo can be 12 megapixels: let the browser shrink it while decoding
    if (file.size > BIG_FILE) {
      try { return await createImageBitmap(file, { resizeWidth: 2400, resizeQuality: 'medium' }); } catch { /* not supported */ }
    }
    try { return await createImageBitmap(file); } catch { /* fall back to an image element */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasOf(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

// The biggest centered crop of `src` with the given shape, drawn into a new canvas of at most `long` pixels.
function cropTo(src, aspect, long) {
  const w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
  const r = jg.coverRect(w, h, aspect);
  const k = Math.min(1, long / Math.max(r.sw, r.sh));
  const c = canvasOf(r.sw * k, r.sh * k);
  c.getContext('2d').drawImage(src, r.sx, r.sy, r.sw, r.sh, 0, 0, c.width, c.height);
  return c;
}

// A JPEG data URL small enough to keep in localStorage, or null.
function encodePhoto(canvas) {
  let c = canvas, q = 0.8;
  for (let pass = 0; pass < 6; pass++) {
    let url = '';
    try { url = c.toDataURL('image/jpeg', q); } catch { return null; }
    if (url.length <= PHOTO_CHARS) return url;
    if (pass === 5) break;
    const n = canvasOf(c.width * 0.8, c.height * 0.8);
    n.getContext('2d').drawImage(c, 0, 0, n.width, n.height);
    c = n;
    q = 0.7;
  }
  return null;
}

async function loadDataUrl(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = canvasOf(img.naturalWidth, img.naturalHeight);
  c.getContext('2d').drawImage(img, 0, 0);
  return c;
}

export default {
  id: 'jigsaw',
  get title() { return t('Jigsaw'); },
  icon: `<svg viewBox="0 0 64 64"><rect x="6" y="6" width="52" height="52" rx="14" fill="#232a44"/>
    <path d="M26 14H36a5 5 0 1 1 10 0H56V24a5 5 0 1 1 0 10V44H46a5 5 0 1 0-10 0H26V34a5 5 0 1 0 0-10z" fill="#4cc9f0" transform="translate(-9 -2) scale(.9)"/>
    <path d="M14 20h10a5 5 0 1 1 10 0H44V30a5 5 0 1 1 0 10V50H34a5 5 0 1 0-10 0H14V40a5 5 0 1 0 0-10z" fill="#ffb703" transform="translate(3 -1)"/>
    <circle cx="32" cy="28" r="2.2" fill="#fff" opacity=".5"/></svg>`,
  info: (store) => {
    const sv = store.get(SAVE, null);
    if (sv && sv.s && typeof sv.s.d === 'string') return t('{a}/{b} pieces', { a: (sv.s.d.match(/1/g) || []).length, b: sv.cols * sv.rows });
    return t('{n} pictures', { n: PICTURES.length });
  },
  get help() {
    return t(`<ul><li><b>Drag</b> a piece with one finger and drop it where it belongs.</li><li>A piece <b>snaps</b> into place when it is close to its spot, and then it is locked.</li><li>Pieces that fit each other also snap together, and then move as one group.</li><li>The <b>eye</b> button shows a faint picture on the board. The <b>edges</b> button brings the border pieces to the front, and <b>spread</b> scatters the single loose pieces again.</li><li>Your puzzle is saved as you go. Use <b>New game</b> to pick another picture, or your own photo.</li></ul>`);
  },

  mount(root, app) {
    let cfg = null;            // { pic, count, pid }, pid is the photo's id when pic is 'photo'
    let grid = null;           // { cols, rows }
    let seed = 0;
    let shape = null;          // the edges of every piece
    let st = null;             // the play state, see logic/jigsaw.js
    let pic = null;            // the picture as a canvas
    let photo = null;          // the photo in use: { canvas, aspect, id }
    let won = false;
    let winT = 0;
    let ghost = !!app.store.get(GHOST, false);
    let edgesMode = false;
    let drag = null;           // { g, id, last }
    let anim = new Map();      // piece id -> { dx, dy, t } while it glides to its spot
    let destroyed = false;
    let hiddenNow = document.hidden;
    let helpHold = false;      // the first-time help is open
    let modalOpen = false;
    let token = 0;             // a newer startGame() makes older ones stop
    let saveTimer = 0;
    let ticks = 0;
    const clk = jg.newClock(performance.now());

    // ---------- screen ----------
    const hud = el('div', 'hud');
    hud.innerHTML = `<div class="chip"><span class="k">${t('Time')}</span><span class="v" data-time style="direction:ltr">0:00</span></div>
      <div class="chip"><span class="k">${t('Pieces')}</span><span class="v" data-count style="direction:ltr">0/0</span></div>`;
    const timeEl = hud.querySelector('[data-time]');
    const countEl = hud.querySelector('[data-count]');
    const stage = el('div', 'stage');
    root.append(hud, stage);

    const ghostBtn = app.action(EYE, t('Show picture'), () => {
      ghost = !ghost;
      app.store.set(GHOST, ghost);
      mark(ghostBtn, ghost);
      draw();
    });
    const edgesBtn = app.action(EDGES, t('Edge pieces'), toggleEdges);
    app.action(SPREAD_ICON, t('Spread out'), spreadOut);
    app.action(ICONS.restart, t('New game'), () => openPicker());
    mark(ghostBtn, ghost);

    function mark(btn, on) {
      btn.style.color = on ? 'var(--accent)' : '';
      btn.style.borderColor = on ? 'var(--accent)' : '';
    }

    let L = null;
    let sprites = new Map();
    let paths = new Map();
    let spriteKey = '';
    const hit = canvasOf(1, 1).getContext('2d');
    const s = surface(stage, () => {
      const old = L;
      layout();
      if (old && st) remapTray(old);
      fitToView();
      draw();
    });

    // ---------- clock ----------
    const clockOn = () => !!st && !won && !destroyed && !hiddenNow && !helpHold && !modalOpen;

    function tick() {
      jg.clockAdvance(clk, performance.now());
      timeEl.textContent = fmtTime(clk.elapsed);
    }

    // Changes what stops the clock. The time so far is counted under the old state first.
    function clock(change) {
      jg.clockAdvance(clk, performance.now());
      change();
      clk.running = clockOn();
    }

    const timer = setInterval(() => {
      tick();
      if (++ticks % 20 === 0) save();
    }, 500);

    // ---------- saving ----------
    function save() {
      if (!st || won || !cfg) return;
      app.store.set(SAVE, { pic: cfg.pic, pid: cfg.pid || '', count: cfg.count, cols: grid.cols, rows: grid.rows, seed, t: Math.floor(clk.elapsed), s: jg.exportState(st) });
    }

    function saveSoon() {
      if (!saveTimer) saveTimer = setTimeout(() => { saveTimer = 0; save(); }, 500);
    }

    // ---------- pictures ----------
    // The photo kept from an earlier visit.
    async function getPhoto() {
      if (photo) return photo;
      const sv = app.store.get(PHOTO, null);
      if (!sv || typeof sv.url !== 'string') return null;
      try {
        photo = { canvas: await loadDataUrl(sv.url), aspect: sv.aspect || 1, id: sv.id || 'photo' };
      } catch { photo = null; }
      return photo;
    }

    // Reads a chosen file. Nothing is kept until the player starts a puzzle with it.
    async function readPhoto(file) {
      const src = await decode(file);
      const w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
      const ar = w / h;
      const aspect = ar > 1.15 ? 4 / 3 : ar < 0.87 ? 3 / 4 : 1;
      const canvas = cropTo(src, aspect, PHOTO_PX);
      src.close?.();
      return { canvas, aspect, id: 'photo' + jg.hashString(`${file.name}|${file.size}|${file.lastModified}`) };
    }

    // Makes a photo the one in use, and keeps it for the next visit if it fits.
    // A photo that does not fit never deletes the one already kept.
    function usePhoto(p) {
      photo = p;
      const url = encodePhoto(p.canvas);
      if (url) app.store.set(PHOTO, { url, aspect: p.aspect, id: p.id });
      if (!url || app.store.get(PHOTO, null)?.id !== p.id) app.toast(t('Photo could not be saved. It stays only for this session.'), 3200);
    }

    const aspectOf = (picId, p) => (picId === 'photo' && p ? p.aspect : NOMINAL);

    function makePicture(picId, g) {
      const aspect = g.cols / g.rows;
      let src, long = PICTURE_PX;
      if (picId === 'photo' && photo) {
        src = photo.canvas;
        long = PHOTO_PX;
      } else {
        // painted in 4:3 like the thumbnails, then cut to the grid's shape
        src = paintPicture(PICTURES.find((p) => p.id === picId) || PICTURES[0], canvasOf(PICTURE_PX, PICTURE_PX / NOMINAL));
        if (Math.abs(aspect - NOMINAL) < 1e-3) return src;
      }
      return cropTo(src, aspect, long);
    }

    // ---------- starting a puzzle ----------
    // Returns false when a saved game could not be resumed, and null when a newer start took over.
    async function startGame(next, saved = null) {
      const my = ++token;
      let picId = next.pic;
      if (picId === 'photo' && !photo) await getPhoto();
      if (my !== token || destroyed) return null;
      if (picId === 'photo') {
        if (saved && (!photo || saved.pid !== photo.id)) return false;   // that save was made with a photo we no longer have
        if (!photo) picId = PICTURES[0].id;
      }
      cfg = { pic: picId, count: next.count, pid: picId === 'photo' ? photo.id : '' };
      grid = saved ? { cols: saved.cols, rows: saved.rows } : jg.chooseGrid(cfg.count, aspectOf(picId, photo));
      seed = saved ? saved.seed : Math.floor(Math.random() * 2147483647);
      shape = jg.makeEdges(grid.cols, grid.rows, seed);
      pic = makePicture(picId, grid);
      sprites = new Map();
      paths = new Map();
      spriteKey = '';
      layout();
      st = saved ? jg.importState(grid.cols, grid.rows, saved.s) : null;
      if (!st) {
        st = jg.newState(grid.cols, grid.rows, jg.scatterAcross(grid.cols * grid.rows, scatterAreas(), SPREAD, rng(seed ^ 0x9e3779b9)));
        saved = null;
      }
      clock(() => {
        clk.elapsed = saved ? saved.t : 0;
        won = false;
        winT = 0;
        edgesMode = false;
        drag = null;
        anim = new Map();
      });
      mark(edgesBtn, false);
      app.store.set(LAST, cfg);
      fitToView();
      refresh();
      save();
      draw();
      return true;
    }

    // ---------- geometry ----------
    function layout() {
      if (!grid) return;
      const { cols, rows } = grid;
      const m = 8;
      let size, ox, oy, tray;
      if (s.w < s.h * 1.15) {                       // portrait: board on top, tray below
        size = Math.min((s.w - 2 * m) / cols, ((s.h - 2 * m) * 0.5) / rows, 120);
        ox = (s.w - size * cols) / 2;
        oy = m + 4;
        const top = oy + size * rows + 16;
        tray = { x: m, y: top, w: s.w - 2 * m, h: s.h - top - m };
      } else {                                      // landscape: board on the left, tray on the right
        size = Math.min((s.h - 2 * m) / rows, ((s.w - 2 * m) * 0.55) / cols, 120);
        ox = m + 4;
        oy = (s.h - size * rows) / 2;
        const left = ox + size * cols + 16;
        tray = { x: left, y: m, w: s.w - left - m, h: s.h - 2 * m };
      }
      size = Math.max(8, size);
      L = { size, ox, oy, bw: size * cols, bh: size * rows, tray };
      const key = size.toFixed(2) + '|' + s.dpr;
      if (key !== spriteKey) { sprites = new Map(); paths = new Map(); spriteKey = key; }
    }

    // Where loose pieces may be put, best place first, as the area for a piece's top-left corner
    // in units from the board's corner: the tray, then the board's own (still empty) area.
    function scatterAreas() {
      const { size, ox, oy, tray } = L;
      return [
        { x: (tray.x - ox) / size, y: (tray.y - oy) / size, w: Math.max(0, tray.w / size - 1), h: Math.max(0, tray.h / size - 1) },
        { x: 0, y: 0, w: grid.cols - 1, h: grid.rows - 1 },
      ];
    }

    // The screen changed shape (the phone was turned): pieces that lay in the old tray move to
    // the same relative place in the new one. Pieces over the board stay over the board.
    function remapTray(old) {
      if (old.size === L.size && old.ox === L.ox && old.oy === L.oy && old.tray.x === L.tray.x && old.tray.y === L.tray.y) return;
      const k = L.size / old.size;
      for (const g of new Set(st.group)) {
        if (g === jg.BOARD) continue;
        const mem = jg.members(st, g);
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (const i of mem) { x0 = Math.min(x0, st.x[i]); x1 = Math.max(x1, st.x[i] + 1); y0 = Math.min(y0, st.y[i]); y1 = Math.max(y1, st.y[i] + 1); }
        const box = { x: old.ox + x0 * old.size, y: old.oy + y0 * old.size, w: (x1 - x0) * old.size, h: (y1 - y0) * old.size };
        const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
        if (cx >= old.ox && cx <= old.ox + old.bw && cy >= old.oy && cy <= old.oy + old.bh) continue;
        const p = jg.remapBox(box, old.tray, L.tray, k);
        jg.moveGroup(st, g, (p.x - (L.ox + x0 * L.size)) / L.size, (p.y - (L.oy + y0 * L.size)) / L.size);
      }
    }

    // How far a group may still move, so that all its pieces stay on screen.
    function clampDelta(g, dx, dy) {
      const mem = jg.members(st, g);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const i of mem) { x0 = Math.min(x0, st.x[i]); x1 = Math.max(x1, st.x[i] + 1); y0 = Math.min(y0, st.y[i]); y1 = Math.max(y1, st.y[i] + 1); }
      const lo = -L.ox / L.size, hi = (s.w - L.ox) / L.size;
      const top = -L.oy / L.size, bot = (s.h - L.oy) / L.size;
      if (x1 - x0 <= hi - lo) dx = clamp(dx, lo - x0, hi - x1);
      if (y1 - y0 <= bot - top) dy = clamp(dy, top - y0, bot - y1);
      return [dx, dy];
    }

    // Pulls strays back onto the screen.
    function fitToView() {
      if (!st || !L) return;
      for (const g of new Set(st.group)) {
        if (g === jg.BOARD) continue;
        const [dx, dy] = clampDelta(g, 0, 0);
        if (dx || dy) jg.moveGroup(st, g, dx, dy);
      }
    }

    // ---------- pieces as images ----------
    function pathOf(i) {
      let p = paths.get(i);
      if (p) return p;
      p = new Path2D();
      for (const [op, ...n] of jg.pieceOutline(shape, i % grid.cols, Math.floor(i / grid.cols))) {
        const v = n.map((k) => k * L.size);
        if (op === 'M') p.moveTo(v[0], v[1]);
        else if (op === 'L') p.lineTo(v[0], v[1]);
        else if (op === 'C') p.bezierCurveTo(...v);
        else p.closePath();
      }
      paths.set(i, p);
      return p;
    }

    // Each piece is drawn once into its own canvas: the picture cut to its shape, with a bevel.
    function sprite(i) {
      let sp = sprites.get(i);
      if (sp) return sp;
      const { size } = L, dpr = s.dpr;
      const c = i % grid.cols, r = Math.floor(i / grid.cols);
      const pad = Math.ceil(jg.PAD * size) + 2;
      const dim = size + pad * 2;
      const cv = canvasOf(dim * dpr, dim * dpr);
      const g = cv.getContext('2d');
      g.scale(dpr, dpr);
      g.translate(pad, pad);
      const path = pathOf(i);
      g.save();
      g.clip(path);
      const per = pic.width / grid.cols, pu = pad / size;
      g.drawImage(pic, (c - pu) * per, (r - pu) * per, (1 + 2 * pu) * per, (1 + 2 * pu) * per, -pad, -pad, dim, dim);
      const lw = Math.max(1, size * 0.045), d = lw * 0.7;
      g.lineJoin = 'round';
      g.lineWidth = lw;
      g.translate(d, d);
      g.strokeStyle = 'rgba(255,255,255,0.38)';
      g.stroke(path);
      g.translate(-2 * d, -2 * d);
      g.strokeStyle = 'rgba(0,0,0,0.32)';
      g.stroke(path);
      g.restore();
      g.lineWidth = Math.max(0.8, size * 0.014);
      g.strokeStyle = 'rgba(0,0,0,0.5)';
      g.stroke(path);
      sp = { cv, pad, dim };
      sprites.set(i, sp);
      return sp;
    }

    // Where a piece's cell is on screen (gliding pieces are a little behind their real spot).
    function at(i) {
      const a = anim.get(i);
      const k = a ? 1 - ease.out(Math.min(1, a.t / T_SNAP)) : 0;
      return {
        x: L.ox + (st.x[i] + (a ? a.dx * k : 0)) * L.size,
        y: L.oy + (st.y[i] + (a ? a.dy * k : 0)) * L.size,
      };
    }

    function glide(id, dx, dy) {
      const a = anim.get(id) || { dx: 0, dy: 0, t: 0 };
      // the glide starts from where the piece was drawn
      const k = 1 - ease.out(Math.min(1, a.t / T_SNAP));
      anim.set(id, { dx: a.dx * k - dx, dy: a.dy * k - dy, t: 0 });
    }

    function pieceAt(p) {
      const inside = (i, slack) => {
        const q = at(i);
        const lx = p.x - q.x, ly = p.y - q.y;
        if (slack) return lx >= -slack && ly >= -slack && lx <= L.size + slack && ly <= L.size + slack;
        return hit.isPointInPath(pathOf(i), lx, ly);
      };
      for (const slack of [0, L.size * 0.1]) {
        for (let k = st.order.length - 1; k >= 0; k--) {
          const i = st.order[k];
          if (!st.placed[i] && inside(i, slack)) return i;
        }
      }
      return -1;
    }

    // ---------- input ----------
    s.canvas.addEventListener('pointerdown', (e) => {
      if (!st || won || drag || modalOpen) return;     // a second finger is ignored
      const i = pieceAt(s.point(e));
      if (i < 0) return;
      const g = st.group[i];
      jg.raise(st, g);
      drag = { g, id: e.pointerId, last: s.point(e) };
      try { s.canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      app.sfx('select');
      draw();
    });

    s.canvas.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const p = s.point(e);
      const [dx, dy] = clampDelta(drag.g, (p.x - drag.last.x) / L.size, (p.y - drag.last.y) / L.size);
      drag.last = p;
      jg.moveGroup(st, drag.g, dx, dy);
      draw();
    });

    const release = (e) => {
      if (destroyed || !drag || e.pointerId !== drag.id) return;
      const g = drag.g;
      drag = null;
      const res = jg.snapGroup(st, g);
      for (const sh of res.shifts) glide(sh.id, sh.dx, sh.dy);
      if (res.placed) { app.sfx('place'); app.haptic(22); }
      else if (res.joined) { app.sfx('pop'); app.haptic(12); }
      else app.sfx('move');
      refresh();
      saveSoon();
      if (jg.isComplete(st)) finish();
      ticker.kick();
      draw();
    };
    s.canvas.addEventListener('pointerup', release);
    s.canvas.addEventListener('pointercancel', release);
    s.canvas.addEventListener('lostpointercapture', release);   // never leave a drag stuck

    // Brings the border pieces to the front and dims the rest, or puts everything back.
    function toggleEdges() {
      if (!st || won) return;
      edgesMode = !edgesMode;
      mark(edgesBtn, edgesMode);
      if (edgesMode) {
        for (const g of new Set(st.group)) {
          if (g !== jg.BOARD && jg.members(st, g).some((i) => jg.isEdgePiece(grid.cols, grid.rows, i))) jg.raise(st, g);
        }
        app.toast(t('Edge pieces'), 900);
      }
      saveSoon();
      draw();
    }

    // Scatters the loose single pieces again, with room between them. Groups stay where they are.
    function spreadOut() {
      if (!st || won || drag) return;
      const ids = [];
      for (let i = 0; i < st.n; i++) if (!st.placed[i] && jg.members(st, st.group[i]).length === 1) ids.push(i);
      if (!ids.length) return;
      const pos = jg.scatterAcross(ids.length, scatterAreas(), SPREAD, rng((Date.now() ^ seed) >>> 0));
      ids.forEach((i, k) => {
        glide(i, pos[k].x - st.x[i], pos[k].y - st.y[i]);
        st.x[i] = pos[k].x;
        st.y[i] = pos[k].y;
      });
      app.sfx('move');
      fitToView();
      saveSoon();
      ticker.kick();
      draw();
    }

    function refresh() {
      countEl.textContent = `${jg.placedCount(st)}/${st.n}`;
      timeEl.textContent = fmtTime(clk.elapsed);
    }

    // ---------- finishing ----------
    function finish() {
      clock(() => { won = true; });
      winT = 0;
      app.store.del(SAVE);
      app.sfx('win');
      app.haptic(40);
      const secs = Math.floor(clk.elapsed);
      const key = bestKey(cfg.pic === 'photo' ? cfg.pid : cfg.pic, st.n);
      const prev = app.store.get(key, 0);
      const isBest = !prev || secs < prev;
      if (isBest) app.store.set(key, secs);
      const my = token;
      setTimeout(async () => {
        if (destroyed || my !== token) return;
        clock(() => { modalOpen = true; });
        const v = await app.modal({
          title: t('Puzzle complete!'),
          html: `<div class="big" style="direction:ltr">${fmtTime(secs)}</div><p style="text-align:center">${isBest ? t('New best!') : t('Best time {time}', { time: `<b style="direction:ltr;unicode-bidi:isolate">${fmtTime(prev)}</b>` })}</p>`,
          buttons: [{ label: t('New game'), value: 'new' }, { label: t('Play again'), value: 'again', primary: true }],
          dismissable: false,
        });
        clock(() => { modalOpen = false; });
        if (destroyed || my !== token) return;
        if (v === 'new') openPicker();
        else startGame({ pic: cfg.pic, count: cfg.count });
      }, 1100);
    }

    // ---------- picking a picture ----------
    async function openPicker() {
      if (destroyed || modalOpen) return;
      clock(() => { modalOpen = true; });
      const last = cfg || app.store.get(LAST, null) || { pic: PICTURES[0].id, count: 24 };
      await getPhoto();
      if (destroyed) return;
      let candidate = null;      // a photo chosen just now; it is kept only if the player taps Start
      const shown = () => candidate || photo;
      const sel = { pic: last.pic === 'photo' && !photo ? PICTURES[0].id : last.pic, count: last.count };
      const thumbs = new Map();
      const thumb = (id, source) => {
        let c = thumbs.get(id);
        if (!c) {
          c = canvasOf(180, 135);
          if (source) {
            const r = jg.coverRect(source.width, source.height, NOMINAL);
            c.getContext('2d').drawImage(source, r.sx, r.sy, r.sw, r.sh, 0, 0, c.width, c.height);
          } else paintPicture(PICTURES.find((p) => p.id === id), c);
          thumbs.set(id, c);
        }
        const out = canvasOf(c.width, c.height);
        out.getContext('2d').drawImage(c, 0, 0);
        out.style.cssText = 'width:100%;display:block;border-radius:8px';
        return out;
      };

      const v = await app.modal({
        title: t('New game'),
        html: '<div data-picker></div>',
        buttons: [{ label: t('Cancel'), value: null }, { label: t('Start'), value: 'start', primary: true }],
        onOpen(body) {
          const wrap = body.querySelector('[data-picker]');
          let busy = false;

          const render = () => {
            wrap.replaceChildren();
            if (st && !won && jg.placedCount(st) > 0) {
              const note = el('p');
              note.textContent = t('Your current puzzle will be replaced.');
              wrap.append(note);
            }
            const head = el('div');
            head.style.cssText = 'font-weight:700;color:var(--text);margin:4px 0 8px';
            head.textContent = t('Choose a picture');
            const gal = el('div');
            gal.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:8px';
            const tile = (id, label, canvas, extra) => {
              const cell = el('div');
              cell.style.position = 'relative';
              const b = el('button');
              b.type = 'button';
              const on = sel.pic === id;
              b.style.cssText = `display:block;width:100%;padding:3px;border-radius:11px;border:2px solid ${on ? 'var(--accent)' : 'transparent'};background:${on ? 'var(--panel2)' : 'none'};text-align:center`;
              const cap = el('div');
              cap.style.cssText = 'font-size:11px;margin-top:3px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
              cap.textContent = label;
              b.append(canvas, cap);
              b.addEventListener('click', () => { sel.pic = id; app.sfx('tap'); render(); });
              cell.append(b);
              if (extra) cell.append(extra);
              gal.append(cell);
            };
            for (const p of PICTURES) tile(p.id, p.name, thumb(p.id));
            // the photo of the puzzle in progress can't be removed until another puzzle starts
            const inUse = !candidate && photo && cfg?.pid === photo.id;
            if (shown() && !inUse) {
              const x = el('button', '', '&times;');
              x.type = 'button';
              x.setAttribute('aria-label', t('Remove photo'));
              x.style.cssText = 'position:absolute;top:6px;inset-inline-end:6px;width:24px;height:24px;border-radius:12px;background:rgba(10,12,20,0.78);color:#fff;font-size:17px;line-height:22px;padding:0';
              x.addEventListener('click', () => {
                app.sfx('tap');
                if (candidate) candidate = null;
                else { app.store.del(PHOTO); photo = null; }
                if (!shown() && sel.pic === 'photo') sel.pic = PICTURES[0].id;
                render();
              });
              tile('photo', t('My photo'), thumb(shown().id, shown().canvas), x);
            } else if (shown()) tile('photo', t('My photo'), thumb(shown().id, shown().canvas));
            // choose a file: a label around a file input works on every phone
            const add = el('label');
            add.style.cssText = 'position:relative;display:flex;align-items:center;justify-content:center;text-align:center;border:2px dashed var(--line);border-radius:11px;padding:6px;font-size:12px;color:var(--text);min-height:70px;cursor:pointer';
            add.textContent = busy ? t('Loading…') : t('Use my photo');
            const input = el('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer';
            input.addEventListener('change', async () => {
              const file = input.files && input.files[0];
              if (!file) return;
              busy = true;
              render();
              try {
                candidate = await readPhoto(file);
                sel.pic = 'photo';
              } catch {
                app.toast(t('Could not open that photo.'));
              }
              busy = false;
              render();
            });
            add.append(input);
            gal.append(add);

            const sizeHead = el('div');
            sizeHead.style.cssText = 'font-weight:700;color:var(--text);margin:14px 0 8px';
            sizeHead.textContent = t('Pieces');
            const row = el('div', 'seg');
            row.style.cssText = 'display:flex;width:100%';
            const pid = sel.pic === 'photo' ? shown()?.id : sel.pic;
            for (const count of jg.PIECE_COUNTS) {
              const g = jg.chooseGrid(count, aspectOf(sel.pic, shown()));
              const n = g.cols * g.rows;
              const best = app.store.get(bestKey(pid, n), 0);
              const b = el('button', sel.count === count ? 'on' : '');
              b.type = 'button';
              b.style.cssText = 'flex:1;padding:7px 2px;direction:ltr';
              b.innerHTML = `<div>${n}</div><div style="font-size:10px;font-weight:500;opacity:.8">${best ? fmtTime(best) : '&nbsp;'}</div>`;
              b.addEventListener('click', () => { sel.count = count; app.sfx('tap'); render(); });
              row.append(b);
            }
            wrap.append(head, gal, sizeHead, row);
          };
          render();
        },
      });
      clock(() => { modalOpen = false; });
      if (destroyed) return;
      if (v === 'start') {
        if (sel.pic === 'photo' && candidate) usePhoto(candidate);
        await startGame(sel);
      } else if (!st) await startGame(last);
    }

    // ---------- drawing ----------
    function drawPiece(i, alpha = 1) {
      const sp = sprite(i);
      const q = at(i);
      if (alpha !== 1) s.ctx.globalAlpha = alpha;
      s.ctx.drawImage(sp.cv, q.x - sp.pad, q.y - sp.pad, sp.dim, sp.dim);
      if (alpha !== 1) s.ctx.globalAlpha = 1;
    }

    function draw() {
      const { ctx } = s;
      s.begin();
      if (!L || !st) return;
      ctx.direction = 'ltr';     // the page may be right-to-left, the picture is not
      const { size, ox, oy, bw, bh, tray } = L;
      rrect(ctx, tray.x, tray.y, tray.w, tray.h, 14);
      ctx.fillStyle = 'rgba(255,255,255,0.035)';
      ctx.fill();
      rrect(ctx, ox - 5, oy - 5, bw + 10, bh + 10, 10);
      ctx.fillStyle = '#0c0e15';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let c = 1; c < grid.cols; c++) { ctx.moveTo(ox + c * size, oy); ctx.lineTo(ox + c * size, oy + bh); }
      for (let r = 1; r < grid.rows; r++) { ctx.moveTo(ox, oy + r * size); ctx.lineTo(ox + bw, oy + r * size); }
      ctx.stroke();
      if (ghost && !won) {
        ctx.globalAlpha = 0.3;
        ctx.drawImage(pic, ox, oy, bw, bh);
        ctx.globalAlpha = 1;
      }

      for (const i of st.order) if (st.placed[i]) drawPiece(i);

      // pieces that only group with non-border pieces are dimmed while "edges" is on
      let bright = null;
      if (edgesMode) {
        bright = new Set();
        for (let i = 0; i < st.n; i++) if (jg.isEdgePiece(grid.cols, grid.rows, i)) bright.add(st.group[i]);
      }
      const held = drag ? new Set(jg.members(st, drag.g)) : null;
      for (const i of st.order) {
        if (st.placed[i] || (held && held.has(i))) continue;
        drawPiece(i, bright && !bright.has(st.group[i]) ? 0.35 : 1);
      }
      if (held) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        for (const i of held) {
          const q = at(i);
          ctx.save();
          ctx.translate(q.x + size * 0.05, q.y + size * 0.08);
          ctx.fill(pathOf(i));
          ctx.restore();
        }
        for (const i of st.order) if (held.has(i)) drawPiece(i);
      }

      if (won) {
        ctx.globalAlpha = ease.out(Math.min(1, winT));
        ctx.drawImage(pic, ox, oy, bw, bh);
        ctx.globalAlpha = 1;
      }
    }

    const ticker = loop((dt) => {
      if (destroyed) return false;
      let more = false;
      for (const [id, a] of anim) {
        a.t += dt;
        if (a.t >= T_SNAP) anim.delete(id);
        else more = true;
      }
      if (won && winT < 1) { winT += dt * 1.4; more = true; }
      draw();
      return more;
    });

    // ---------- coming back and leaving ----------
    // The clock learns about hiding and showing only here, so each stretch of time is
    // judged by the state it was spent in (a phone freezes timers while hidden).
    const onVisible = () => {
      clock(() => { hiddenNow = document.hidden; });
      if (document.hidden) save();
    };
    document.addEventListener('visibilitychange', onVisible);

    // Open the saved game, or let the player choose. The very first visit just starts one.
    const saved = app.store.get(SAVE, null);
    if (saved && saved.s && Number.isInteger(saved.cols) && Number.isInteger(saved.rows)) {
      startGame({ pic: saved.pic, count: saved.count }, saved).then((ok) => {
        if (ok === null || destroyed) return;
        if (ok && st) return;
        app.store.del(SAVE);
        if (!ok) app.toast(t('That puzzle used a photo that is no longer saved, so it could not be resumed.'), 3600);
        openPicker();
      });
    } else if (!app.store.get('seen:jigsaw', false)) {
      startGame(app.store.get(LAST, null) || { pic: PICTURES[0].id, count: 24 });
    } else {
      openPicker();
    }

    return {
      pause(hard) { clock(() => { if (hard) helpHold = true; }); save(); },
      resume() { clock(() => { helpHold = false; }); },
      destroy() {
        tick();
        destroyed = true;
        clearInterval(timer);
        clearTimeout(saveTimer);
        document.removeEventListener('visibilitychange', onVisible);
        save();
        ticker.stop();
        s.destroy();
      },
    };
  },
};

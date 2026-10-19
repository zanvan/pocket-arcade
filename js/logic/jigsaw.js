// Jigsaw rules, with no drawing. The piece shapes come from a seed, so a puzzle looks the
// same on every phone. All lengths are in "units": one unit is the side of one piece's cell,
// and the board's top-left corner is (0, 0). Piece id = row * cols + col.
import { rng } from './rng.js';

export const PIECE_COUNTS = [12, 24, 48, 70, 96];
export const SNAP = 0.35;   // how close (in pieces) a drop must be to snap
export const PAD = 0.4;     // tabs reach at most this far outside the cell
export const BOARD = -1;    // group id of every piece that is locked in place

// ---------- grid and picture ----------

// cols x rows whose count is near `count` and whose shape is near `aspect` (width / height).
export function chooseGrid(count, aspect) {
  let best = null;
  for (let rows = 2; rows <= 20; rows++) {
    const base = Math.floor(count / rows);
    for (const cols of [base, base + 1]) {
      if (cols < 2) continue;
      const score = Math.abs(Math.log(cols / rows / aspect)) + 1.5 * Math.abs(Math.log((cols * rows) / count));
      if (!best || score < best.score - 1e-9) best = { cols, rows, score };
    }
  }
  return { cols: best.cols, rows: best.rows };
}

// The largest centered area of a picture with the given aspect.
export function coverRect(srcW, srcH, aspect) {
  let sw = srcW, sh = srcW / aspect;
  if (sh > srcH) { sh = srcH; sw = srcH * aspect; }
  return { sx: (srcW - sw) / 2, sy: (srcH - sh) / 2, sw, sh };
}

export function hashString(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (Math.imul(h, 33) + str.charCodeAt(i)) >>> 0;
  return h;
}

export const isEdgePiece = (cols, rows, id) => {
  const c = id % cols, r = Math.floor(id / cols);
  return c === 0 || r === 0 || c === cols - 1 || r === rows - 1;
};

// Neighbors of a piece: its id and its offset in cells.
export function neighbors(cols, rows, id) {
  const c = id % cols, r = Math.floor(id / cols);
  const out = [];
  if (r > 0) out.push({ id: id - cols, dc: 0, dr: -1 });
  if (c < cols - 1) out.push({ id: id + 1, dc: 1, dr: 0 });
  if (r < rows - 1) out.push({ id: id + cols, dc: 0, dr: 1 });
  if (c > 0) out.push({ id: id - 1, dc: -1, dr: 0 });
  return out;
}

// ---------- piece shapes ----------

// One entry per inner edge, null on the border. h[r][c] is the edge above piece (c, r),
// v[r][c] is the edge left of it. sign +1 means the knob points down (or right), so the
// piece above (or left) has the tab and the piece below (or right) has the blank.
export function makeEdges(cols, rows, seed) {
  const rand = rng(seed);
  const jit = (k) => (rand() - 0.5) * k;
  const edge = () => ({ sign: rand() < 0.5 ? -1 : 1, a: jit(0.08), b: jit(0.08), c: jit(0.08), d: jit(0.08), e: jit(0.08), t: 0.09 + rand() * 0.03 });
  const h = [], v = [];
  for (let r = 0; r <= rows; r++) h.push(Array.from({ length: cols }, () => (r === 0 || r === rows ? null : edge())));
  for (let r = 0; r < rows; r++) v.push(Array.from({ length: cols + 1 }, (_, c) => (c === 0 || c === cols ? null : edge())));
  return { cols, rows, h, v };
}

// The 10 control points of an edge in its fixed direction (left to right, or top to bottom),
// starting at (x0, y0) and one unit long. Both neighbors read the same points, so they fit.
export function edgePoints(e, x0, y0, vertical) {
  const { a, b, c, d, t } = e;
  const along = [0, 0.2, 0.5 + b + d, 0.5 - t + b, 0.5 - 2 * t + b - d, 0.5 + 2 * t + b - d, 0.5 + t + b, 0.5 + b + d, 0.8, 1];
  const off = [0, a, -t + c, t + c, 3 * t + c, 3 * t + c, t + c, -t + c, e.e, 0];
  return along.map((u, i) => (vertical ? [x0 + e.sign * off[i], y0 + u] : [x0 + u, y0 + e.sign * off[i]]));
}

// Bezier pieces [x1, y1, x2, y2, x, y] of one side. (x0, y0) is the edge's start in its
// fixed direction; `reverse` walks it the other way, ending at (x0, y0).
function side(e, x0, y0, vertical, reverse) {
  if (!e) {
    const end = reverse ? [x0, y0] : [vertical ? x0 : x0 + 1, vertical ? y0 + 1 : y0];
    return [['L', end[0], end[1]]];
  }
  let p = edgePoints(e, x0, y0, vertical);
  if (reverse) p = p.slice().reverse();
  return [['C', ...p[1], ...p[2], ...p[3]], ['C', ...p[4], ...p[5], ...p[6]], ['C', ...p[7], ...p[8], ...p[9]]];
}

// Outline commands of piece (c, r), relative to its own cell: ['M', x, y], ['L', x, y],
// ['C', x1, y1, x2, y2, x, y] and ['Z']. Clockwise: top, right, bottom, left.
export function pieceOutline(shape, c, r) {
  return [
    ['M', 0, 0],
    ...side(shape.h[r][c], 0, 0, false, false),
    ...side(shape.v[r][c + 1], 1, 0, true, false),
    ...side(shape.h[r + 1][c], 0, 1, false, true),
    ...side(shape.v[r][c], 0, 0, true, true),
    ['Z'],
  ];
}

// Flattens an outline into points (for hit tests and tests). `steps` points per curve.
export function outlinePoints(cmds, steps = 12) {
  const pts = [];
  let cur = [0, 0];
  for (const [op, ...n] of cmds) {
    if (op === 'M' || op === 'L') { cur = [n[0], n[1]]; pts.push(cur); }
    else if (op === 'C') {
      const [x1, y1, x2, y2, x, y] = n;
      for (let i = 1; i <= steps; i++) {
        const u = i / steps, w = 1 - u;
        pts.push([
          w * w * w * cur[0] + 3 * w * w * u * x1 + 3 * w * u * u * x2 + u * u * u * x,
          w * w * w * cur[1] + 3 * w * w * u * y1 + 3 * w * u * u * y2 + u * u * u * y,
        ]);
      }
      cur = [x, y];
    }
  }
  return pts;
}

// ---------- play state ----------

// Spread n loose pieces over a rectangle of top-left positions. Returns n {x, y} in random order.
export function scatterPositions(n, rect, rand) {
  const aw = Math.max(rect.w, 0), ah = Math.max(rect.h, 0);
  let ky = Math.max(1, Math.round(Math.sqrt((n * Math.max(ah, 0.01)) / Math.max(aw, 0.01))));
  let kx = Math.ceil(n / ky);
  while (kx * ky < n) kx++;
  const slots = [];
  for (let j = 0; j < ky; j++) for (let i = 0; i < kx; i++) slots.push([i, j]);
  for (let i = slots.length - 1; i > 0; i--) {
    const k = Math.floor(rand() * (i + 1));
    [slots[i], slots[k]] = [slots[k], slots[i]];
  }
  const cw = aw / kx, ch = ah / ky;
  return slots.slice(0, n).map(([i, j]) => ({
    x: rect.x + Math.min(aw, Math.max(0, (i + 0.5 + (rand() - 0.5) * 0.45) * cw)),
    y: rect.y + Math.min(ah, Math.max(0, (j + 0.5 + (rand() - 0.5) * 0.45) * ch)),
  }));
}

// Spread n pieces over several areas, in order of preference, on a lattice whose points are at
// least `step` units apart. An area that cannot hold the rest is filled completely, and the
// last area takes what is left, as densely as it must. Returns n {x, y} in random order.
export function scatterAcross(n, rects, step, rand) {
  const out = [];
  const lattice = (rect, kx, ky) => {
    const j = step * 0.08, slots = [];
    for (let r = 0; r < ky; r++) {
      for (let c = 0; c < kx; c++) {
        const x = (kx > 1 ? (c * rect.w) / (kx - 1) : rect.w / 2) + (rand() - 0.5) * j;
        const y = (ky > 1 ? (r * rect.h) / (ky - 1) : rect.h / 2) + (rand() - 0.5) * j;
        slots.push({ x: rect.x + Math.min(rect.w, Math.max(0, x)), y: rect.y + Math.min(rect.h, Math.max(0, y)) });
      }
    }
    return slots;
  };
  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const k = Math.floor(rand() * (i + 1));
      [a[i], a[k]] = [a[k], a[i]];
    }
    return a;
  };
  for (let k = 0; k < rects.length && out.length < n; k++) {
    const rect = { ...rects[k], w: Math.max(rects[k].w, 0), h: Math.max(rects[k].h, 0) };
    const left = n - out.length;
    const KX = Math.floor(rect.w / step) + 1, KY = Math.floor(rect.h / step) + 1;
    if (KX * KY >= left) {
      // the fewest columns and rows that hold the rest, in the area's own shape, so they spread out evenly
      let kx = Math.min(KX, Math.max(1, Math.ceil(Math.sqrt((left * Math.max(rect.w, 0.01)) / Math.max(rect.h, 0.01)))));
      let ky = Math.ceil(left / kx);
      while (ky > KY && kx < KX) { kx++; ky = Math.ceil(left / kx); }
      out.push(...shuffle(lattice(rect, kx, ky)).slice(0, left));
    } else if (k === rects.length - 1) out.push(...scatterPositions(left, rect, rand));
    else out.push(...lattice(rect, KX, KY));
  }
  return shuffle(out);
}

// Moves a box (x, y, w, h) that sits in area `from` to the same relative place in area `to`.
// `k` is how much bigger the box is on the new screen.
export function remapBox(box, from, to, k = 1) {
  const nw = box.w * k, nh = box.h * k;
  const fx = from.w > box.w ? Math.min(1, Math.max(0, (box.x - from.x) / (from.w - box.w))) : 0.5;
  const fy = from.h > box.h ? Math.min(1, Math.max(0, (box.y - from.y) / (from.h - box.h))) : 0.5;
  return {
    x: to.w > nw ? to.x + fx * (to.w - nw) : to.x,
    y: to.h > nh ? to.y + fy * (to.h - nh) : to.y,
  };
}

// ---------- clock ----------
// A play clock that only counts time it was running. Each stretch of time is judged by the
// state it was in, not the state now: a phone that freezes timers in the background and
// wakes up ten minutes later must not add those ten minutes.
export const newClock = (now, elapsed = 0) => ({ elapsed, last: now, running: false });

export function clockAdvance(c, now) {
  if (c.running && now > c.last) c.elapsed += (now - c.last) / 1000;
  c.last = now;
}

// Counts the time so far with the old state, then switches.
export function clockSet(c, now, running) {
  clockAdvance(c, now);
  c.running = running;
}

// positions: n {x, y} in unit coordinates.
export function newState(cols, rows, positions) {
  const n = cols * rows;
  return {
    cols, rows, n,
    x: positions.map((p) => p.x),
    y: positions.map((p) => p.y),
    group: Array.from({ length: n }, (_, i) => i),
    placed: Array(n).fill(false),
    order: Array.from({ length: n }, (_, i) => i),   // drawing order, last is on top
  };
}

export const members = (st, g) => {
  const out = [];
  for (let i = 0; i < st.n; i++) if (st.group[i] === g) out.push(i);
  return out;
};

export function raise(st, g) {
  const set = new Set(members(st, g));
  st.order = [...st.order.filter((i) => !set.has(i)), ...st.order.filter((i) => set.has(i))];
}

export function moveGroup(st, g, dx, dy) {
  if (g === BOARD) return;
  for (const i of members(st, g)) { st.x[i] += dx; st.y[i] += dy; }
}

const homeX = (st, i) => i % st.cols;
const homeY = (st, i) => Math.floor(i / st.cols);

// Called when a dragged group is dropped. Locks it to the board if a piece is near its home,
// otherwise joins it to any neighbor group that lines up. Returns what happened and how far
// each piece moved, so the screen can animate the jump.
export function snapGroup(st, g, tol = SNAP) {
  const res = { placed: false, joined: 0, shifts: [] };
  if (g === BOARD) return res;
  let cur = g;
  const shift = (mem, dx, dy) => {
    for (const i of mem) { st.x[i] += dx; st.y[i] += dy; res.shifts.push({ id: i, dx, dy }); }
  };
  for (let guard = 0; guard < st.n + 2; guard++) {
    const mem = members(st, cur);
    const hit = mem.find((i) => Math.abs(st.x[i] - homeX(st, i)) <= tol && Math.abs(st.y[i] - homeY(st, i)) <= tol);
    if (hit !== undefined) {
      // every member goes to its exact home, so rounding drift cannot build up
      for (const i of mem) {
        const dx = homeX(st, i) - st.x[i], dy = homeY(st, i) - st.y[i];
        if (dx || dy) { st.x[i] += dx; st.y[i] += dy; res.shifts.push({ id: i, dx, dy }); }
        st.placed[i] = true;
        st.group[i] = BOARD;
      }
      res.placed = true;
      break;
    }
    let joined = false;
    for (const i of mem) {
      for (const nb of neighbors(st.cols, st.rows, i)) {
        const gj = st.group[nb.id];
        if (gj === cur || gj === BOARD) continue;
        // where piece i belongs if it is to sit right beside piece nb.id
        const ex = st.x[nb.id] - nb.dc, ey = st.y[nb.id] - nb.dr;
        if (Math.abs(st.x[i] - ex) > tol || Math.abs(st.y[i] - ey) > tol) continue;
        shift(mem, ex - st.x[i], ey - st.y[i]);
        const other = members(st, gj);
        const keep = other.length >= mem.length ? gj : cur;
        for (const k of [...mem, ...other]) st.group[k] = keep;
        cur = keep;
        res.joined++;
        joined = true;
        break;
      }
      if (joined) break;
    }
    if (!joined) break;
  }
  return res;
}

export const placedCount = (st) => st.placed.filter(Boolean).length;
export const isComplete = (st) => st.placed.every(Boolean);

// ---------- saving ----------

const r3 = (v) => Math.round(v * 1000) / 1000;

export function exportState(st) {
  return {
    p: st.x.flatMap((x, i) => [r3(x), r3(st.y[i])]),
    g: st.group.slice(),
    o: st.order.slice(),
    d: st.placed.map((v) => (v ? 1 : 0)).join(''),
  };
}

// Rebuilds a saved state, or returns null if it does not fit this grid.
export function importState(cols, rows, saved) {
  const n = cols * rows;
  if (!saved || !Array.isArray(saved.p) || saved.p.length !== n * 2 || !Array.isArray(saved.g) || saved.g.length !== n) return null;
  if (!Array.isArray(saved.o) || saved.o.length !== n || typeof saved.d !== 'string' || saved.d.length !== n) return null;
  if (!saved.p.every(Number.isFinite) || !saved.g.every((v) => Number.isInteger(v) && v >= -1 && v < n)) return null;
  if (new Set(saved.o).size !== n || !saved.o.every((v) => Number.isInteger(v) && v >= 0 && v < n)) return null;
  if (!saved.d.includes('0')) return null;   // a finished puzzle is not a game to resume
  const st = newState(cols, rows, Array.from({ length: n }, (_, i) => ({ x: saved.p[i * 2], y: saved.p[i * 2 + 1] })));
  st.order = saved.o.slice();
  for (let i = 0; i < n; i++) {
    if (saved.d[i] === '1') {
      // a locked piece must sit exactly at home
      if (Math.abs(st.x[i] - homeX(st, i)) > 0.01 || Math.abs(st.y[i] - homeY(st, i)) > 0.01) return null;
      st.x[i] = homeX(st, i); st.y[i] = homeY(st, i);
      st.placed[i] = true; st.group[i] = BOARD;
    }
  }
  // loose groups: keep a group only if its pieces still sit as one block, else split it
  const by = new Map();
  for (let i = 0; i < n; i++) {
    if (st.placed[i]) continue;
    if (!by.has(saved.g[i])) by.set(saved.g[i], []);
    by.get(saved.g[i]).push(i);
  }
  for (const mem of by.values()) {
    const f = mem[0];
    const ok = mem.every((i) => Math.abs(st.x[i] - st.x[f] - (homeX(st, i) - homeX(st, f))) < 0.02
      && Math.abs(st.y[i] - st.y[f] - (homeY(st, i) - homeY(st, f))) < 0.02);
    for (const i of mem) st.group[i] = ok ? f : i;
  }
  return st;
}

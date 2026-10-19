// Bubble Shooter rules. Pure functions, no DOM.
//
// The board is a hex-packed grid. Positions are in "bubble units": one bubble is 1 wide,
// so a row is COLS wide and rows sit ROWH apart. Even rows hold COLS bubbles, odd rows are
// shifted right by half a bubble and hold COLS - 1. When the ceiling drops, a new row is
// added on top and `par` flips, so a row keeps its shape as it moves down.
//
// A cell holds 0 (empty) or a color number 1..MAX_COLORS.
import { rng, randInt } from './rng.js';

export const COLS = 9;
export const ROWH = Math.sqrt(3) / 2;
export const LOSE_ROW = 11;            // a bubble resting in this row or lower ends the game
export const ROWS = LOSE_ROW + 3;      // spare rows below the line, so a late bubble can still land
export const MAX_COLORS = 7;
const HIT = 0.9;                       // shots stop this close (in bubbles) to another bubble
const STEP = 0.05;                     // shot trajectory resolution, in bubbles
export const MIN_ANGLE = (12 * Math.PI) / 180; // aim can't get flatter than this

export function levelSpec(level) {
  return {
    colors: Math.min(MAX_COLORS - 1, 3 + Math.floor((level - 1) / 5)),   // the 7th symbol is spare
    rows: Math.min(8, 4 + Math.floor((level - 1) / 3)),
    k: Math.max(4, 7 - Math.floor((level - 1) / 6)),   // misses before the ceiling drops
  };
}

// ---------- grid ----------
export const isShifted = (grid, r) => (r + grid.par) % 2 === 1;
export const rowLen = (grid, r) => (isShifted(grid, r) ? COLS - 1 : COLS);

function blankRow(grid, r) {
  return Array(rowLen(grid, r)).fill(0);
}

export function emptyGrid() {
  const grid = { par: 0, rows: [] };
  for (let r = 0; r < ROWS; r++) grid.rows.push(blankRow(grid, r));
  return grid;
}

export const inGrid = (grid, r, c) => r >= 0 && r < ROWS && c >= 0 && c < rowLen(grid, r);

export function cellPos(grid, r, c) {
  return { x: c + 0.5 + (isShifted(grid, r) ? 0.5 : 0), y: r * ROWH + 0.5 };
}

export function neighbors(grid, r, c) {
  const sh = isShifted(grid, r);
  const out = [[r, c - 1], [r, c + 1]];
  for (const rr of [r - 1, r + 1]) out.push([rr, sh ? c : c - 1], [rr, sh ? c + 1 : c]);
  return out.filter(([rr, cc]) => inGrid(grid, rr, cc));
}

export function cells(grid) {
  const out = [];
  grid.rows.forEach((row, r) => row.forEach((color, c) => { if (color) out.push({ r, c, color }); }));
  return out;
}

export const isCleared = (grid) => grid.rows.every((row) => row.every((v) => !v));

// Colors still on the board, ascending. The shooter only offers these.
export function colorsOn(grid) {
  return [...new Set(cells(grid).map((b) => b.color))].sort((a, b) => a - b);
}

export const reachedDanger = (grid) => grid.rows.some((row, r) => r >= LOSE_ROW && row.some((v) => v));

// ---------- snapping ----------
// The free cell nearest to a point, preferring cells that touch the ceiling or another bubble.
export function snap(grid, x, y) {
  const mid = Math.floor((y - 0.5) / ROWH);
  let best = null, bestD = Infinity;
  for (const attached of [true, false]) {
    for (let r = Math.max(0, mid - 1); r <= Math.min(ROWS - 1, mid + 2); r++) {
      for (let c = 0; c < rowLen(grid, r); c++) {
        if (grid.rows[r][c]) continue;
        if (attached && r > 0 && !neighbors(grid, r, c).some(([rr, cc]) => grid.rows[rr][cc])) continue;
        const p = cellPos(grid, r, c);
        const d = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (d < bestD) { bestD = d; best = { r, c }; }
      }
    }
    if (best) return best;
  }
  return null;
}

// ---------- matches ----------
// Every bubble joined to (r, c) through same-colored neighbors, including (r, c).
export function findMatch(grid, r, c) {
  const color = grid.rows[r][c];
  if (!color) return [];
  const seen = new Set([r * COLS + c]);
  const out = [[r, c]];
  for (let i = 0; i < out.length; i++) {
    for (const [rr, cc] of neighbors(grid, out[i][0], out[i][1])) {
      const k = rr * COLS + cc;
      if (seen.has(k) || grid.rows[rr][cc] !== color) continue;
      seen.add(k);
      out.push([rr, cc]);
    }
  }
  return out;
}

// Bubbles with no path of bubbles up to the ceiling row.
export function floating(grid) {
  const seen = new Set();
  const queue = [];
  grid.rows[0].forEach((v, c) => { if (v) { seen.add(c); queue.push([0, c]); } });
  for (let i = 0; i < queue.length; i++) {
    for (const [rr, cc] of neighbors(grid, queue[i][0], queue[i][1])) {
      const k = rr * COLS + cc;
      if (seen.has(k) || !grid.rows[rr][cc]) continue;
      seen.add(k);
      queue.push([rr, cc]);
    }
  }
  return cells(grid).filter((b) => !seen.has(b.r * COLS + b.c));
}

// Puts a bubble down. A group of 3 or more pops, then whatever lost its hold falls.
// Returns the bubbles removed: { popped, fell }, each a list of { r, c, color }.
export function place(grid, r, c, color) {
  grid.rows[r][c] = color;
  const group = findMatch(grid, r, c);
  const res = { popped: [], fell: [] };
  if (group.length < 3) return res;
  res.popped = group.map(([rr, cc]) => ({ r: rr, c: cc, color }));
  for (const b of res.popped) grid.rows[b.r][b.c] = 0;
  res.fell = floating(grid);
  for (const b of res.fell) grid.rows[b.r][b.c] = 0;
  return res;
}

export const POP_POINTS = 10;
export const FALL_POINTS = 20;
export const scoreFor = (popped, fell) => popped * POP_POINTS + fell * FALL_POINTS;

// ---------- levels ----------
export function generate(level) {
  const { colors, rows } = levelSpec(level);
  const rand = rng(level * 7919 + 13);
  const grid = emptyGrid();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < rowLen(grid, r); c++) {
      // half the time copy a neighbor already placed, so the board forms clumps
      const near = neighbors(grid, r, c).filter(([rr, cc]) => grid.rows[rr][cc]).map(([rr, cc]) => grid.rows[rr][cc]);
      grid.rows[r][c] = near.length && rand() < 0.5 ? near[randInt(rand, near.length)] : 1 + randInt(rand, colors);
    }
  }
  // later levels get holes; any bubbles they cut off from the ceiling are removed
  if (level >= 4) {
    const gap = Math.min(0.1, 0.03 + level * 0.005);
    for (let r = 2; r < rows; r++) {
      for (let c = 0; c < rowLen(grid, r); c++) if (rand() < gap) grid.rows[r][c] = 0;
    }
    for (const b of floating(grid)) grid.rows[b.r][b.c] = 0;
  }
  // every color of the level shows up at least once
  const all = cells(grid);
  for (let color = 1; color <= colors; color++) {
    if (all.some((b) => b.color === color)) continue;
    const pick = all.filter((b) => all.filter((o) => o.color === b.color).length > 1);
    const b = pick[randInt(rand, pick.length)];
    b.color = color;
    grid.rows[b.r][b.c] = color;
  }
  return grid;
}

// The ceiling comes down one row: a new row of the colors still in play goes on top.
// `n` counts the drops so far in this level, so the rows are the same on every phone.
export function dropRow(grid, level, n) {
  const palette = colorsOn(grid).length ? colorsOn(grid) : [1];
  const rand = rng(level * 104729 + n * 31 + 5);
  grid.rows.pop();
  grid.par = 1 - grid.par;
  grid.rows.unshift(blankRow(grid, 0).map(() => palette[randInt(rand, palette.length)]));
}

// ---------- shooting ----------
// Unit direction from the shooter towards a touch point, never flatter than MIN_ANGLE.
export function aimDir(fromX, fromY, toX, toY) {
  let a = Math.atan2(fromY - toY, toX - fromX);   // 0 = right, PI/2 = straight up
  if (toY >= fromY) a = toX >= fromX ? MIN_ANGLE : Math.PI - MIN_ANGLE;
  a = Math.max(MIN_ANGLE, Math.min(Math.PI - MIN_ANGLE, a));
  return { dx: Math.cos(a), dy: -Math.sin(a) };
}

// Follows a shot from (x, y) until it touches the ceiling or a bubble, bouncing off the side
// walls. Returns { path, cell }: the corner points of its route (start, each bounce, end) and
// the cell it will settle in. With a bounce limit, a shot that bounces too often gives cell null.
export function trajectory(grid, x, y, dx, dy, { maxBounces = Infinity } = {}) {
  const lo = 0.5, hi = COLS - 0.5;
  const path = [{ x, y }];
  const near = cells(grid).map((b) => cellPos(grid, b.r, b.c));
  let bounces = 0;
  for (let i = 0; i < 6000; i++) {
    const nx = x + dx * STEP, ny = y + dy * STEP;
    if (nx < lo || nx > hi) {
      const wall = nx < lo ? lo : hi;
      y += dy * STEP * ((wall - x) / (nx - x));
      x = wall;
      path.push({ x, y });
      dx = -dx;
      if (++bounces > maxBounces) return { path, cell: null };
      // the step that reached the wall may already touch a bubble beside it
      if (near.some((p) => (p.x - x) ** 2 + (p.y - y) ** 2 < HIT * HIT)) break;
      continue;
    }
    x = nx; y = ny;
    if (y <= lo) y = lo;
    if (y <= lo || near.some((p) => Math.abs(p.y - y) < HIT && (p.x - x) ** 2 + (p.y - y) ** 2 < HIT * HIT)) break;
  }
  path.push({ x, y });
  return { path, cell: snap(grid, x, y) };
}

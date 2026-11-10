// Block Blast rules: 8x8 board, place three pieces, full rows and columns clear.
export const N = 8;

const DEFS = [
  // [rows, weight]
  [['#'], 3],
  [['##'], 5], [['#', '#'], 5],
  [['###'], 5], [['#', '#', '#'], 5],
  [['####'], 4], [['#', '#', '#', '#'], 4],
  [['#####'], 2], [['#', '#', '#', '#', '#'], 2],
  [['##', '##'], 6],
  [['###', '###', '###'], 2],
  [['##', '##', '##'], 2], [['###', '###'], 2],
  [['#.', '##'], 3], [['.#', '##'], 3], [['##', '#.'], 3], [['##', '.#'], 3],
  [['#..', '#..', '###'], 1.5], [['..#', '..#', '###'], 1.5], [['###', '#..', '#..'], 1.5], [['###', '..#', '..#'], 1.5],
  [['###', '.#.'], 2], [['.#.', '###'], 2], [['#.', '##', '#.'], 2], [['.#', '##', '.#'], 2],
  [['##.', '.##'], 2], [['.##', '##.'], 2], [['#.', '##', '.#'], 2], [['.#', '##', '#.'], 2],
  [['#.', '#.', '##'], 2], [['.#', '.#', '##'], 2], [['##', '#.', '#.'], 2], [['##', '.#', '.#'], 2],
  [['###', '#..'], 2], [['###', '..#'], 2], [['#..', '###'], 2], [['..#', '###'], 2],
];

export const SHAPES = DEFS.map(([rows, weight], id) => {
  const cells = [];
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '#') cells.push([x, y]); }));
  return { id, cells, w: rows[0].length, h: rows.length, weight };
});

export const COLORS = ['#ff5a5f', '#ff9f40', '#ffd23f', '#4cd964', '#3cc7f5', '#4a7dff', '#b36cf7', '#ff6fb5'];

export function emptyBoard() {
  return Array.from({ length: N }, () => Array(N).fill(null));
}

export function canPlace(board, shape, row, col) {
  for (const [x, y] of shape.cells) {
    const r = row + y, c = col + x;
    if (r < 0 || r >= N || c < 0 || c >= N || board[r][c]) return false;
  }
  return true;
}

export function fitsAnywhere(board, shape) {
  for (let r = 0; r <= N - shape.h; r++) {
    for (let c = 0; c <= N - shape.w; c++) if (canPlace(board, shape, r, c)) return true;
  }
  return false;
}

// Rows and columns that would be full after placing the shape (without changing the board).
export function linesAfter(board, shape, row, col) {
  const filled = (r, c) => !!board[r][c] || shape.cells.some(([x, y]) => row + y === r && col + x === c);
  const rows = [], cols = [];
  for (let r = 0; r < N; r++) {
    let full = true;
    for (let c = 0; c < N && full; c++) full = filled(r, c);
    if (full) rows.push(r);
  }
  for (let c = 0; c < N; c++) {
    let full = true;
    for (let r = 0; r < N && full; r++) full = filled(r, c);
    if (full) cols.push(c);
  }
  return { rows, cols };
}

// Places the shape and clears lines. Returns what happened, for scoring and animation.
export function place(board, shape, row, col, color) {
  for (const [x, y] of shape.cells) board[row + y][col + x] = color;
  const { rows, cols } = linesAfter(board, { cells: [] }, 0, 0);
  const cleared = [];
  const seen = new Set();
  for (const r of rows) for (let c = 0; c < N; c++) seen.add(r * N + c);
  for (const c of cols) for (let r = 0; r < N; r++) seen.add(r * N + c);
  for (const k of seen) {
    const r = Math.floor(k / N), c = k % N;
    cleared.push({ r, c, color: board[r][c] });
    board[r][c] = null;
  }
  return { lines: rows.length + cols.length, rows, cols, cleared };
}

export function isEmpty(board) {
  return board.every((row) => row.every((v) => !v));
}

// Points for a placement: one per cell, plus a growing bonus for lines, times the combo.
export function scoreFor(cellsPlaced, lines, combo) {
  if (!lines) return cellsPlaced;
  const base = 10 * (lines * (lines + 1)) / 2;
  return cellsPlaced + base * Math.max(1, combo);
}

function pickShape(rand) {
  const total = SHAPES.reduce((s, x) => s + x.weight, 0);
  let t = rand() * total;
  for (const s of SHAPES) { t -= s.weight; if (t <= 0) return s; }
  return SHAPES[SHAPES.length - 1];
}

// Three new pieces. Prefers sets where every piece fits somewhere, so the game
// feels fair; falls back to "at least one fits", then to anything.
export function dealPieces(board, rand = Math.random) {
  const make = () => [0, 1, 2].map(() => ({ shape: pickShape(rand), color: COLORS[Math.floor(rand() * COLORS.length)] }));
  for (let i = 0; i < 40; i++) {
    const set = make();
    if (set.every((p) => fitsAnywhere(board, p.shape))) return set;
  }
  for (let i = 0; i < 40; i++) {
    const set = make();
    if (set.some((p) => fitsAnywhere(board, p.shape))) return set;
  }
  return make();
}

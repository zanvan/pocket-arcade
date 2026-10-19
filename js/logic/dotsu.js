// Dotsu rules. Dots never fall and nothing is added: the player drags a dot onto any empty
// cell, then every row or column run of 3 or more dots of one color pops. Special dots also
// clear more cells when they pop, and those can chain. Clear the board in the move limit.
// Levels are built backwards from an empty board, so each one has a recorded solution that is
// checked by playing it forward before the level is accepted.
import { rng, randInt, shuffle } from './rng.js';

// Special kinds: H and V are Liners (row / column), P Pulser, B Blaster, S Shuriken.
export const SPECIALS = ['H', 'V', 'P', 'B', 'S'];

// ---------- board ----------
// A board is { w, h, g } with g a flat list (index = y * w + x) of null or a dot { c, k }.
// c is the color number, k is '' for a plain dot or one special kind. Dots are never changed
// after they are made, so copying the list is enough to copy a board.
export const emptyBoard = (w, h) => ({ w, h, g: new Array(w * h).fill(null) });
export const cloneBoard = (b) => ({ w: b.w, h: b.h, g: b.g.slice() });
export const dot = (c, k = '') => ({ c, k });
export const dotCount = (b) => b.g.reduce((n, d) => n + (d ? 1 : 0), 0);
export const signature = (b) => b.g.map((d) => (d ? `${d.c}${d.k || '-'}` : '..')).join('');

// Builds a board from rows of space-separated cells: '.' empty, '2' a plain dot of color 2,
// '1H' a color 1 Liner. Used by the tests.
export function boardFromText(rows) {
  const cells = rows.map((r) => r.trim().split(/\s+/));
  const b = emptyBoard(cells[0].length, cells.length);
  cells.forEach((row, y) => row.forEach((s, x) => {
    if (s !== '.') b.g[y * b.w + x] = dot(Number(s[0]), s.slice(1));
  }));
  return b;
}

// ---------- lines ----------
// Every cell that sits in a run of 3 or more same-color dots, across or down.
export function lineCells(b) {
  const out = new Set();
  const { w, h, g } = b;
  const scan = (len, across, at) => {
    for (let a = 0; a < across; a++) {
      let s = 0;
      while (s < len) {
        const d = g[at(a, s)];
        if (!d) { s++; continue; }
        let e = s + 1;
        while (e < len && g[at(a, e)] && g[at(a, e)].c === d.c) e++;
        if (e - s >= 3) for (let i = s; i < e; i++) out.add(at(a, i));
        s = e;
      }
    }
  };
  scan(w, h, (y, x) => y * w + x);
  scan(h, w, (x, y) => y * w + x);
  return out;
}

// How many dots the dot at i would pop through its own row and column (0 when it makes no
// run of 3). Quicker than lineCells for one cell.
function runGain(b, i) {
  const { w, h, g } = b;
  const c = g[i].c, x0 = i % w, y0 = (i / w) | 0;
  let gain = 0, both = 0;
  for (const [dx, dy] of [[1, 0], [0, 1]]) {
    let n = 1;
    for (const s of [1, -1]) {
      for (let x = x0 + dx * s, y = y0 + dy * s; x >= 0 && y >= 0 && x < w && y < h && g[y * w + x] && g[y * w + x].c === c; x += dx * s, y += dy * s) n++;
    }
    if (n >= 3) { gain += n; both++; }
  }
  return both === 2 ? gain - 1 : gain;
}

// ---------- specials ----------
// Cells a special at i reaches, whether or not a dot is there.
export function reach(b, i) {
  const { w, h, g } = b;
  const x0 = i % w, y0 = (i / w) | 0;
  const k = g[i].k;
  const out = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = Math.abs(x - x0), dy = Math.abs(y - y0);
      const hit = k === 'H' ? y === y0 : k === 'V' ? x === x0 : k === 'P' ? dx <= 1 && dy <= 1 : k === 'S' ? dx === dy : k === 'B';
      if (hit) out.push(y * w + x);
    }
  }
  return out;
}

// Cells holding a dot that the special at i clears. A Blaster only takes its own color.
export function effectCells(b, i) {
  const d = b.g[i];
  return reach(b, i).filter((j) => b.g[j] && (d.k !== 'B' || b.g[j].c === d.c));
}

// ---------- moves ----------
export function canMove(b, from, to) {
  const n = b.w * b.h;
  return from !== to && from >= 0 && to >= 0 && from < n && to < n && !!b.g[from] && !b.g[to];
}

// Pops every line, then everything the popped specials reach, and so on. Removes those dots
// and returns them in the order they pop: { x, y, c, k, depth } with depth 0 for the lines
// themselves and one more for each step of a chain.
export function resolve(b) {
  const depth = new Map();
  const queue = [];
  for (const i of lineCells(b)) { depth.set(i, 0); queue.push(i); }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    if (!b.g[i].k) continue;
    for (const j of effectCells(b, i)) {
      if (!depth.has(j)) { depth.set(j, depth.get(i) + 1); queue.push(j); }
    }
  }
  const cleared = queue.map((i) => ({ x: i % b.w, y: (i / b.w) | 0, c: b.g[i].c, k: b.g[i].k, depth: depth.get(i) }));
  cleared.sort((a, c) => a.depth - c.depth);
  for (const i of queue) b.g[i] = null;
  return cleared;
}

// Moves a dot onto an empty cell and pops what forms. Returns null (board untouched) when the
// move is not allowed, else the list of popped dots, which is empty when nothing formed.
export function applyMove(b, from, to) {
  if (!canMove(b, from, to)) return null;
  b.g[to] = b.g[from];
  b.g[from] = null;
  return resolve(b);
}

const PROBES = Array.from({ length: 10 }, (_, c) => dot(c));

// Every move that pops something, longest line first: { from, to, n }. It is only a rough
// order (n counts the line dots, not what specials add), but it costs no board copies.
export function clearingMoves(b) {
  const out = [];
  const colors = new Set();
  b.g.forEach((d) => { if (d) colors.add(d.c); });
  b.g.forEach((e, to) => {
    if (e) return;
    // which colors would make a run here, were a dot of that color put down (cheap test first)
    const fits = [];
    for (const c of colors) {
      b.g[to] = PROBES[c];
      if (runGain(b, to)) fits.push(c);
      b.g[to] = null;
    }
    if (!fits.length) return;
    b.g.forEach((d, from) => {
      if (!d || !fits.includes(d.c)) return;
      // the real test: the dot's own cell is empty once it has left
      b.g[to] = d; b.g[from] = null;
      const n = runGain(b, to);
      b.g[to] = null; b.g[from] = d;
      if (n) out.push({ from, to, n });
    });
  });
  return out.sort((a, c) => c.n - a.n);
}

// A board that can no longer be cleared, seen without searching. Without specials, a move only
// ever pops dots of one color, so a color left with 1 or 2 dots can never go, and there must be
// a move left for each color still on the board. Boards with specials are never called dead.
export function isDead(b, left = Infinity) {
  const counts = new Array(10).fill(0);
  for (const d of b.g) {
    if (!d) continue;
    if (d.k) return false;
    counts[d.c]++;
  }
  let colors = 0;
  for (const n of counts) {
    if (!n) continue;
    if (n < 3) return true;
    colors++;
  }
  return colors > left;
}

// Looks for a winning run of moves that pops something every time. It stops after `budget`
// positions or `ms` milliseconds, whichever comes first, so it is quick but not complete.
// Returns { plan, nodes, timedOut }, with plan the moves or null.
export function search(board, left, { budget = 20000, ms = 40 } = {}) {
  const seen = new Set();
  const deadline = performance.now() + ms;
  const out = { plan: null, nodes: 0, timedOut: false };
  function dfs(b, moves) {
    if (dotCount(b) === 0) return [];
    if (moves <= 0 || out.timedOut || isDead(b, moves)) return null;
    if (out.nodes >= budget || ((out.nodes & 63) === 0 && performance.now() > deadline)) { out.timedOut = true; return null; }
    out.nodes++;
    const key = signature(b) + moves;
    if (seen.has(key)) return null;
    seen.add(key);
    for (const m of clearingMoves(b)) {
      const t = cloneBoard(b);
      applyMove(t, m.from, m.to);
      const rest = dfs(t, moves - 1);
      if (rest) return [{ from: m.from, to: m.to }, ...rest];
    }
    return null;
  }
  out.plan = dfs(board, left);
  return out;
}

export const solve = (board, left, opts) => search(board, left, opts).plan;

// ---------- one play of a level ----------
export class Game {
  constructor(puzzle) {
    this.puzzle = puzzle;
    this.restart();
  }

  restart() {
    this.board = cloneBoard(this.puzzle.board);
    this.left = this.puzzle.moves;
    this.history = [];
  }

  get won() { return dotCount(this.board) === 0; }
  get lost() { return !this.won && this.left <= 0; }

  // Returns null when the move is not allowed (no move is used), else { from, to, cleared }.
  play(from, to) {
    if (this.won || this.left <= 0 || !canMove(this.board, from, to)) return null;
    this.history.push({ board: cloneBoard(this.board), left: this.left });
    const cleared = applyMove(this.board, from, to);
    this.left--;
    return { from, to, cleared };
  }

  undo() {
    const h = this.history.pop();
    if (!h) return false;
    this.board = h.board;
    this.left = h.left;
    return true;
  }

  // True when the board can be seen to be unwinnable from here (see isDead).
  get dead() { return !this.won && isDead(this.board, this.left); }

  // The next move: from the recorded solution while the board is still on it, else from a
  // quick search. Returns { from, to } or null.
  hint() {
    if (this.won || this.left <= 0) return null;
    const { path, solution } = this.puzzle;
    const i = path.indexOf(signature(this.board));
    if (i >= 0 && i < solution.length && solution.length - i <= this.left) return solution[i];
    return search(this.board, this.left).plan?.[0] || null;
  }

  // How many undos lead back to a board that is on the recorded solution with enough moves
  // left to finish it. 0 when no earlier board in this play qualifies.
  backOnTrack() {
    const { path, solution } = this.puzzle;
    for (let j = this.history.length - 1; j >= 0; j--) {
      const h = this.history[j];
      const i = path.indexOf(signature(h.board));
      if (i >= 0 && i < solution.length && solution.length - i <= h.left) return this.history.length - j;
    }
    return 0;
  }
}

// ---------- levels ----------
export function levelSpec(level) {
  const size = level <= 4 ? 5 : level <= 12 ? 6 : level <= 24 ? 7 : 8;
  const colors = level <= 3 ? 3 : level <= 9 ? 4 : level <= 20 ? 5 : 6;
  const cap = { 5: 4, 6: 5, 7: 7, 8: 9 }[size];
  // the biggest boards keep growing slowly, one more triple every 15 levels, up to 12
  const steps = Math.min(12, Math.min(cap, 2 + Math.floor((level - 1) / 2)) + (level > 25 ? Math.floor((level - 25) / 15) : 0));
  // New special kinds arrive one at a time; the level that adds one is built around it.
  const kinds = [];
  if (level >= 6) kinds.push('H', 'V');
  if (level >= 10) kinds.push('P');
  if (level >= 15) kinds.push('B');
  if (level >= 20) kinds.push('S');
  const intro = { 6: 'H', 10: 'P', 15: 'B', 20: 'S' }[level] || '';
  return {
    w: size, h: size, colors, steps, kinds, intro,
    rate: kinds.length ? Math.min(0.5, 0.25 + (level - 6) * 0.015) : 0,
    chain: level >= 12 ? 0.3 : 0,
    slack: level <= 3 ? 2 : level <= 30 ? 1 : 0,
  };
}

function emptyTriples(b) {
  const out = [];
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      const i = y * b.w + x;
      if (x + 2 < b.w && !b.g[i] && !b.g[i + 1] && !b.g[i + 2]) out.push([i, i + 1, i + 2]);
      if (y + 2 < b.h && !b.g[i] && !b.g[i + b.w] && !b.g[i + 2 * b.w]) out.push([i, i + b.w, i + 2 * b.w]);
    }
  }
  return out;
}

// One step backwards in time. From board B (what is left after a move) builds the board
// before that move: a same-color triple on empty cells, one of its dots set down somewhere
// else, plus (for a special) the dots that the special will clear along with the triple.
// Playing the move forward must give exactly B again, or the step is thrown away.
function stepBack(B, s, special, rand) {
  const triples = emptyTriples(B);
  if (!triples.length) return null;
  const tri = triples[randInt(rand, triples.length)];
  const c = randInt(rand, s.colors);
  const P = cloneBoard(B);
  for (const i of tri) P.g[i] = dot(c);
  if (special) {
    const at = tri[randInt(rand, 3)];
    P.g[at] = dot(c, special);
    const queue = [at];
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q];
      const room = shuffle(reach(P, i).filter((j) => !P.g[j]), rand);
      const want = q === 0 && rand() < 0.4 ? 2 : 1;
      let placed = 0;
      for (const j of room) {
        if (placed >= want) break;
        const chain = queue.length < 3 && rand() < s.chain ? s.kinds[randInt(rand, s.kinds.length)] : '';
        P.g[j] = dot(P.g[i].k === 'B' ? c : randInt(rand, s.colors), chain);
        if (chain) queue.push(j);
        placed++;
      }
      if (!placed) return null;
    }
  }
  const to = tri[randInt(rand, 3)];
  const free = [];
  P.g.forEach((d, i) => { if (!d) free.push(i); });
  if (!free.length) return null;
  const from = free[randInt(rand, free.length)];
  P.g[from] = P.g[to];
  P.g[to] = null;
  if (lineCells(P).size) return null;
  const T = cloneBoard(P);
  applyMove(T, from, to);
  return signature(T) === signature(B) ? { board: P, move: { from, to } } : null;
}

function build(s, rand) {
  let B = emptyBoard(s.w, s.h);
  const back = [];
  const states = [signature(B)];
  const introAt = s.intro ? randInt(rand, s.steps) : -1;
  for (let n = 0; n < s.steps; n++) {
    let r = null;
    for (let tries = 0; tries < 80 && !r; tries++) {
      let special = '';
      if (n === introAt) special = s.intro;
      else if (tries < 50 && s.kinds.length && rand() < s.rate) special = s.kinds[randInt(rand, s.kinds.length)];
      r = stepBack(B, s, special, rand);
    }
    if (!r) return null;
    B = r.board;
    back.push(r.move);
    states.push(signature(B));
  }
  const solution = back.reverse();
  return {
    w: s.w, h: s.h, colors: s.colors, board: B, solution,
    path: states.reverse(), // path[i]: the board after i solution moves
    moves: solution.length + s.slack,
  };
}

// Plays the recorded solution forward: it must clear the board inside the move limit.
export function verify(p) {
  if (lineCells(p.board).size || dotCount(p.board) === 0) return false;
  const g = new Game(p);
  for (const m of p.solution) if (!g.play(m.from, m.to)) return false;
  return g.won && p.solution.length <= p.moves;
}

export function generate(level) {
  const spec = levelSpec(level);
  const rand = rng(level * 7919 + 13);
  for (let attempt = 0; attempt < 400; attempt++) {
    // if a layout keeps failing, ask for a little less
    const s = attempt < 60 ? spec : { ...spec, steps: Math.max(1, spec.steps - Math.floor((attempt - 60) / 20)), kinds: attempt < 120 ? spec.kinds : [], intro: attempt < 120 ? spec.intro : '' };
    const p = build(s, rand);
    if (p && verify(p)) return { level, ...p };
  }
  throw new Error('could not build level ' + level);
}

// Checkers rules and the computer player. Pure module: no DOM, tested in Node.
//
// Board: 64 squares, index r * 8 + c, row 0 at the top. Only dark squares ((r + c) odd) are used.
// You (side 1) start at the bottom and move up; the computer (side -1) starts at the top.
// A square holds 0 (empty), ±1 (man) or ±2 (king); the sign is the side.
//
// Two rule sets:
//   classic  — men move and capture forward only; kings move one square in any direction.
//   flying   — men also capture backward; kings fly any distance along a diagonal.
// In both: capturing is compulsory, a capture continues while it can, a man that reaches the
// far row is crowned and its move ends there. A side with no legal move loses.

export const YOU = 1;
export const CPU = -1;
export const RULES = ['classic', 'flying'];
export const DRAW_PLIES = 80; // 40 moves each with no capture and no man moved: a draw

const DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const inside = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

export function startBoard() {
  const b = new Int8Array(64);
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 0) continue;
      if (r < 3) b[r * 8 + c] = CPU;
      else if (r > 4) b[r * 8 + c] = YOU;
    }
  }
  return b;
}

const forward = (side) => (side === YOU ? -1 : 1);
const kingRow = (side) => (side === YOU ? 0 : 7);

// Every legal move for `side`. A move is { from, path: [landing squares], caps: [captured squares] }.
export function legalMoves(board, side, rules = 'classic') {
  const caps = [];
  for (let sq = 0; sq < 64; sq++) {
    if (board[sq] * side > 0) captures(board, sq, rules, caps);
  }
  if (caps.length) return caps;
  const out = [];
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq];
    if (p * side <= 0) continue;
    const r = sq >> 3, c = sq & 7;
    const king = Math.abs(p) === 2;
    for (const [dr, dc] of DIRS) {
      if (!king && dr !== forward(side)) continue;
      let rr = r + dr, cc = c + dc;
      while (inside(rr, cc) && board[rr * 8 + cc] === 0) {
        out.push({ from: sq, path: [rr * 8 + cc], caps: [] });
        if (!(king && rules === 'flying')) break;
        rr += dr; cc += dc;
      }
    }
  }
  return out;
}

// Adds every complete capture sequence that starts at `from` to `out`.
// Captured pieces stay on the board until the move ends, so none can be jumped twice.
function captures(board, from, rules, out) {
  const piece = board[from];
  const side = Math.sign(piece);
  const b = board.slice();
  b[from] = 0;
  const path = [];
  const taken = [];

  function step(sq, king) {
    const r = sq >> 3, c = sq & 7;
    let found = false;
    for (const [dr, dc] of DIRS) {
      if (!king && rules === 'classic' && dr !== forward(side)) continue;
      if (king && rules === 'flying') {
        // Slide over empty squares to the first piece, jump it, land on any empty square beyond.
        let rr = r + dr, cc = c + dc;
        while (inside(rr, cc) && b[rr * 8 + cc] === 0) { rr += dr; cc += dc; }
        if (!inside(rr, cc)) continue;
        const over = rr * 8 + cc;
        if (b[over] * side >= 0 || taken.includes(over)) continue;
        rr += dr; cc += dc;
        while (inside(rr, cc) && b[rr * 8 + cc] === 0) {
          const land = rr * 8 + cc;
          found = true;
          path.push(land); taken.push(over);
          if (!step(land, true)) out.push({ from, path: path.slice(), caps: taken.slice() });
          path.pop(); taken.pop();
          rr += dr; cc += dc;
        }
      } else {
        const r1 = r + dr, c1 = c + dc, r2 = r + 2 * dr, c2 = c + 2 * dc;
        if (!inside(r2, c2)) continue;
        const over = r1 * 8 + c1, land = r2 * 8 + c2;
        if (b[over] * side >= 0 || taken.includes(over) || b[land] !== 0) continue;
        found = true;
        path.push(land); taken.push(over);
        // A man that reaches the far row is crowned, and that ends its move.
        const crowned = !king && r2 === kingRow(side);
        if (crowned || !step(land, king)) out.push({ from, path: path.slice(), caps: taken.slice() });
        path.pop(); taken.pop();
      }
    }
    return found;
  }

  step(from, Math.abs(piece) === 2);
}

// Returns a new board with the move made.
export function applyMove(board, m) {
  const b = board.slice();
  const p = b[m.from];
  b[m.from] = 0;
  for (const s of m.caps) b[s] = 0;
  const to = m.path[m.path.length - 1];
  const side = Math.sign(p);
  b[to] = Math.abs(p) === 1 && (to >> 3) === kingRow(side) ? 2 * side : p;
  return b;
}

export const moveTo = (m) => m.path[m.path.length - 1];
export const sameMove = (a, b) => a.from === b.from && a.path.join() === b.path.join() && a.caps.join() === b.caps.join();

// A move resets the draw counter when it captures or moves a man.
export function isProgress(board, m) {
  return m.caps.length > 0 || Math.abs(board[m.from]) === 1;
}

export function countPieces(board) {
  const n = { [YOU]: 0, [CPU]: 0, youKings: 0, cpuKings: 0 };
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p) continue;
    n[Math.sign(p)]++;
    if (p === 2) n.youKings++;
    if (p === -2) n.cpuKings++;
  }
  return n;
}

// ---------- A whole game: board, whose turn, draw counter, history for undo ----------
export class Game {
  constructor(rules = 'classic') {
    this.rules = RULES.includes(rules) ? rules : 'classic';
    this.board = startBoard();
    this.side = YOU;
    this.quiet = 0;          // plies since the last capture or man move
    this.history = [];       // [{ board, side, quiet, move }]
  }

  moves() { return legalMoves(this.board, this.side, this.rules); }

  play(m) {
    this.history.push({ board: this.board, side: this.side, quiet: this.quiet, move: m });
    this.quiet = isProgress(this.board, m) ? 0 : this.quiet + 1;
    this.board = applyMove(this.board, m);
    this.side = -this.side;
  }

  undo() {
    const h = this.history.pop();
    if (!h) return null;
    this.board = h.board; this.side = h.side; this.quiet = h.quiet;
    return h.move;
  }

  lastMove() { return this.history.length ? this.history[this.history.length - 1].move : null; }

  // { over: false } or { over: true, winner: YOU | CPU | 0, reason: 'nomoves' | 'quiet' }
  status() {
    if (!this.moves().length) return { over: true, winner: -this.side, reason: 'nomoves' };
    if (this.quiet >= DRAW_PLIES) return { over: true, winner: 0, reason: 'quiet' };
    return { over: false };
  }

  // The moves as plain data, to save and rebuild the game.
  toJSON() { return { v: 1, rules: this.rules, moves: this.history.map((h) => h.move) }; }

  static fromJSON(data) {
    if (!data || data.v !== 1 || !Array.isArray(data.moves)) return null;
    const g = new Game(data.rules);
    for (const m of data.moves) {
      const legal = g.moves().find((x) => sameMove(x, m));
      if (!legal) return null;
      g.play(legal);
    }
    return g;
  }
}

// ---------- Computer player ----------
// Score from the point of view of `side`. Kings are worth more under flying rules.
function evaluate(board, side, rules) {
  const kingV = rules === 'flying' ? 330 : 230;
  let s = 0;
  let mine = 0, theirs = 0;
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq];
    if (!p) continue;
    const r = sq >> 3, c = sq & 7;
    const who = Math.sign(p);
    let v;
    if (Math.abs(p) === 2) {
      v = kingV + (3.5 - Math.abs(3.5 - c)) * 2 + (3.5 - Math.abs(3.5 - r)) * 2;
    } else {
      const adv = who === YOU ? 7 - r : r;          // rows advanced from its own back row
      v = 100 + adv * 4;
      if (adv === 0) v += 6;                        // back row guards against crowning
      if (c === 0 || c === 7) v -= 3;               // a man on the edge has only one way forward
      if (c >= 2 && c <= 5 && r >= 2 && r <= 5) v += 4;
    }
    s += who * v;
    if (who === side) mine++; else theirs++;
  }
  const own = side * s;
  // When ahead, trading pieces brings the win closer.
  if (mine > theirs && theirs > 0) return own + (12 - theirs) * 6;
  return own;
}

const WIN = 100000;

function order(moves) {
  return moves.sort((a, b) => b.caps.length - a.caps.length);
}

// Picks a move for the side to move. level: 'easy' | 'medium' | 'hard'.
// random: a function returning [0, 1) (Math.random in the app, seeded in tests).
export function chooseMove(game, level = 'medium', { random = Math.random, timeMs } = {}) {
  const root = game.moves();
  if (root.length <= 1) return root[0] || null;
  const side = game.side, rules = game.rules;
  if (level === 'easy' && random() < 0.3) return root[Math.floor(random() * root.length)];

  const maxDepth = level === 'easy' ? 2 : level === 'medium' ? 5 : 14;
  const limit = timeMs ?? (level === 'hard' ? 1100 : 600);
  const start = Date.now();
  let nodes = 0;
  let outOfTime = false;

  function search(board, who, depth, alpha, beta, ply) {
    if ((++nodes & 1023) === 0 && Date.now() - start > limit) outOfTime = true;
    if (outOfTime) return 0;
    const moves = legalMoves(board, who, rules);
    if (!moves.length) return -WIN + ply;
    // Forced captures do not use up depth (up to a point), so the search sees the exchange through.
    const forced = moves[0].caps.length > 0;
    if (depth <= 0 && !(forced && ply < maxDepth + 8)) return evaluate(board, who, rules);
    order(moves);
    let best = -Infinity;
    for (const m of moves) {
      const v = -search(applyMove(board, m), -who, forced && depth <= 0 ? 0 : depth - 1, -beta, -alpha, ply + 1);
      if (outOfTime) return 0;
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }

  let bestMove = root[0];
  let scored = root.map((m) => ({ m, v: 0 }));
  for (let depth = 1; depth <= maxDepth; depth++) {
    const round = [];
    let alpha = -Infinity;
    for (const { m } of scored) {
      const v = -search(applyMove(game.board, m), -side, depth - 1, -Infinity, -alpha, 1);
      if (outOfTime) break;
      round.push({ m, v });
      if (v > alpha) alpha = v;
    }
    if (outOfTime && round.length < scored.length) break;
    round.sort((a, b) => b.v - a.v);
    scored = round;
    bestMove = round[0].m;
    if (Math.abs(round[0].v) > WIN / 2) break; // a forced win or loss is found
    if (Date.now() - start > limit * 0.5) break;
  }

  // Easy and medium sometimes pick among moves that score almost the same, so games vary.
  const slack = level === 'easy' ? 60 : level === 'medium' ? 8 : 0;
  if (slack) {
    const top = scored.filter((x) => x.v >= scored[0].v - slack);
    return top[Math.floor(random() * top.length)].m;
  }
  return bestMove;
}

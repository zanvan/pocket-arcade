// Chess rules and a small computer player. Pure module: no DOM, no window.
//
// Board: 0x88 layout. Square = rank * 16 + file, rank 0 is White's first rank. A square is
// on the board when (sq & 0x88) === 0. This makes "did the ray fall off the board" one test.
// Piece code: type | (color << 3). Types 1..6 = pawn, knight, bishop, rook, queen, king.
// Move: one int. from (7 bits) | to << 7 | promotion type << 14 | flags << 17.

export const WHITE = 0;
export const BLACK = 1;
export const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;

export const F_CAP = 1, F_EP = 2, F_CASTLE = 4, F_DOUBLE = 8;

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const moveFrom = (m) => m & 127;
export const moveTo = (m) => (m >> 7) & 127;
export const movePromo = (m) => (m >> 14) & 7;
export const moveFlags = (m) => m >> 17;
export const isCapture = (m) => (m >> 17) & F_CAP;
const mk = (from, to, promo = 0, flags = 0) => from | (to << 7) | (promo << 14) | (flags << 17);

const KN = [-33, -31, -18, -14, 14, 18, 31, 33];
const KG = [-17, -16, -15, -1, 1, 15, 16, 17];
const BD = [-17, -15, 15, 17];
const RD = [-16, -1, 1, 16];

// Castling rights bits: 1 = White king side, 2 = White queen side, 4 / 8 = Black.
// Moving or losing a piece on one of these squares removes the matching rights.
const CMASK = new Int8Array(128).fill(15);
CMASK[0] = 13; CMASK[4] = 12; CMASK[7] = 14;
CMASK[112] = 7; CMASK[116] = 3; CMASK[119] = 11;

// ---------- Hashing (two 32-bit words, so equal positions are recognised reliably) ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) | 0;
  };
}
const rnd = mulberry32(0x5eed1234);
const ZP1 = new Int32Array(16 * 128), ZP2 = new Int32Array(16 * 128);
const ZC1 = new Int32Array(16), ZC2 = new Int32Array(16);
const ZE1 = new Int32Array(8), ZE2 = new Int32Array(8);
for (let i = 0; i < ZP1.length; i++) { ZP1[i] = rnd(); ZP2[i] = rnd(); }
for (let i = 0; i < 16; i++) { ZC1[i] = rnd(); ZC2[i] = rnd(); }
for (let i = 0; i < 8; i++) { ZE1[i] = rnd(); ZE2[i] = rnd(); }
const ZS1 = rnd(), ZS2 = rnd();

// ---------- Squares and text ----------
export const sqFile = (sq) => sq & 7;
export const sqRank = (sq) => sq >> 4;
export function sqName(sq) { return 'abcdefgh'[sq & 7] + (1 + (sq >> 4)); }
export function parseSq(s) {
  const f = 'abcdefgh'.indexOf(s[0]);
  const r = '12345678'.indexOf(s[1]);
  return f < 0 || r < 0 ? -1 : r * 16 + f;
}
const PCH = { 1: 'p', 2: 'n', 3: 'b', 4: 'r', 5: 'q', 6: 'k' };
export function moveToUci(m) {
  return sqName(moveFrom(m)) + sqName(moveTo(m)) + (movePromo(m) ? PCH[movePromo(m)] : '');
}

// ---------- Position ----------
export class Position {
  constructor() {
    this.board = new Int8Array(128);
    this.side = WHITE;
    this.castling = 0;
    this.ep = -1;            // square a pawn can be captured on, en passant (-1 = none)
    this.halfmove = 0;       // plies since a capture or pawn move
    this.fullmove = 1;
    this.kings = [4, 116];
    this.h1 = 0; this.h2 = 0;
    this.hs1 = [];           // hash of every position since the start, newest last
    this.hs2 = [];
    this.stk = [];           // undo info, 7 numbers per move
  }

  static start() { return Position.fromFen(START_FEN); }

  static fromFen(fen) {
    const p = new Position();
    const parts = String(fen).trim().split(/\s+/);
    if (parts.length < 2) throw new Error('Bad FEN');
    const rows = parts[0].split('/');
    if (rows.length !== 8) throw new Error('Bad FEN rows');
    const map = { p: 1, n: 2, b: 3, r: 4, q: 5, k: 6 };
    for (let i = 0; i < 8; i++) {
      const rank = 7 - i;
      let f = 0;
      for (const ch of rows[i]) {
        if (ch >= '1' && ch <= '8') { f += +ch; continue; }
        const lower = ch.toLowerCase();
        if (!map[lower] || f > 7) throw new Error('Bad FEN piece');
        const color = ch === lower ? BLACK : WHITE;
        const sq = rank * 16 + f;
        p.board[sq] = map[lower] | (color << 3);
        if (map[lower] === KING) p.kings[color] = sq;
        f++;
      }
      if (f !== 8) throw new Error('Bad FEN row length');
    }
    p.side = parts[1] === 'b' ? BLACK : WHITE;
    const c = parts[2] || '-';
    p.castling = (c.includes('K') ? 1 : 0) | (c.includes('Q') ? 2 : 0) | (c.includes('k') ? 4 : 0) | (c.includes('q') ? 8 : 0);
    p.ep = parts[3] && parts[3] !== '-' ? parseSq(parts[3]) : -1;
    p.halfmove = parseInt(parts[4], 10) || 0;
    p.fullmove = parseInt(parts[5], 10) || 1;
    p.computeHash();
    p.hs1 = [p.h1];
    p.hs2 = [p.h2];
    return p;
  }

  fen() {
    let out = '';
    for (let r = 7; r >= 0; r--) {
      let empty = 0;
      for (let f = 0; f < 8; f++) {
        const pc = this.board[r * 16 + f];
        if (!pc) { empty++; continue; }
        if (empty) { out += empty; empty = 0; }
        const ch = PCH[pc & 7];
        out += (pc >> 3) === WHITE ? ch.toUpperCase() : ch;
      }
      if (empty) out += empty;
      if (r) out += '/';
    }
    const c = (this.castling & 1 ? 'K' : '') + (this.castling & 2 ? 'Q' : '') + (this.castling & 4 ? 'k' : '') + (this.castling & 8 ? 'q' : '');
    return `${out} ${this.side === WHITE ? 'w' : 'b'} ${c || '-'} ${this.ep >= 0 ? sqName(this.ep) : '-'} ${this.halfmove} ${this.fullmove}`;
  }

  // The en passant file counts in the hash only when a pawn could really take (FIDE rule
  // for repetition: the same position means the same moves are possible).
  epFile() {
    const ep = this.ep;
    if (ep < 0) return -1;
    const b = this.board;
    const mine = PAWN | (this.side << 3);
    const base = this.side === WHITE ? ep - 16 : ep + 16;
    if (!((base - 1) & 0x88) && b[base - 1] === mine) return ep & 7;
    if (!((base + 1) & 0x88) && b[base + 1] === mine) return ep & 7;
    return -1;
  }

  computeHash() {
    let h1 = 0, h2 = 0;
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const pc = this.board[sq];
      if (pc) { h1 ^= ZP1[pc * 128 + sq]; h2 ^= ZP2[pc * 128 + sq]; }
    }
    if (this.side === BLACK) { h1 ^= ZS1; h2 ^= ZS2; }
    h1 ^= ZC1[this.castling]; h2 ^= ZC2[this.castling];
    const f = this.epFile();
    if (f >= 0) { h1 ^= ZE1[f]; h2 ^= ZE2[f]; }
    this.h1 = h1; this.h2 = h2;
  }

  // Is square `sq` attacked by any piece of colour `by`?
  isAttacked(sq, by) {
    const b = this.board;
    const hi = by << 3;
    // pawns attack one rank forward, so the attacker stands one rank behind
    const pd = by === WHITE ? -16 : 16;
    let t = sq + pd - 1;
    if (!(t & 0x88) && b[t] === (PAWN | hi)) return true;
    t = sq + pd + 1;
    if (!(t & 0x88) && b[t] === (PAWN | hi)) return true;
    for (let i = 0; i < 8; i++) {
      t = sq + KN[i];
      if (!(t & 0x88) && b[t] === (KNIGHT | hi)) return true;
      t = sq + KG[i];
      if (!(t & 0x88) && b[t] === (KING | hi)) return true;
    }
    for (let i = 0; i < 4; i++) {
      let d = BD[i];
      t = sq + d;
      while (!(t & 0x88)) {
        const pc = b[t];
        if (pc) { if (pc === (BISHOP | hi) || pc === (QUEEN | hi)) return true; break; }
        t += d;
      }
      d = RD[i];
      t = sq + d;
      while (!(t & 0x88)) {
        const pc = b[t];
        if (pc) { if (pc === (ROOK | hi) || pc === (QUEEN | hi)) return true; break; }
        t += d;
      }
    }
    return false;
  }

  inCheck() { return this.isAttacked(this.kings[this.side], this.side ^ 1); }

  // Pseudo-legal moves: they may leave the own king in check. capOnly = captures and
  // promotions only, for the quiet-position search.
  genMoves(capOnly = false) {
    const out = [];
    const b = this.board;
    const us = this.side, them = us ^ 1;
    const dir = us === WHITE ? 16 : -16;
    const startRank = us === WHITE ? 1 : 6;
    const lastRank = us === WHITE ? 6 : 1;   // a pawn on this rank promotes next move
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const pc = b[sq];
      if (!pc || (pc >> 3) !== us) continue;
      const type = pc & 7;
      if (type === PAWN) {
        const rank = sq >> 4;
        let t = sq + dir;
        if (!b[t]) {
          if (rank === lastRank) {
            out.push(mk(sq, t, QUEEN));
            if (!capOnly) out.push(mk(sq, t, ROOK), mk(sq, t, BISHOP), mk(sq, t, KNIGHT));
          } else if (!capOnly) {
            out.push(mk(sq, t));
            if (rank === startRank && !b[t + dir]) out.push(mk(sq, t + dir, 0, F_DOUBLE));
          }
        }
        for (let k = -1; k <= 1; k += 2) {
          t = sq + dir + k;
          if (t & 0x88) continue;
          const q = b[t];
          if (q && (q >> 3) === them) {
            if (rank === lastRank) {
              out.push(mk(sq, t, QUEEN, F_CAP));
              if (!capOnly) out.push(mk(sq, t, ROOK, F_CAP), mk(sq, t, BISHOP, F_CAP), mk(sq, t, KNIGHT, F_CAP));
            } else out.push(mk(sq, t, 0, F_CAP));
          } else if (!q && t === this.ep) {
            out.push(mk(sq, t, 0, F_CAP | F_EP));
          }
        }
      } else if (type === KNIGHT || type === KING) {
        const offs = type === KNIGHT ? KN : KG;
        for (let i = 0; i < 8; i++) {
          const t = sq + offs[i];
          if (t & 0x88) continue;
          const q = b[t];
          if (!q) { if (!capOnly) out.push(mk(sq, t)); }
          else if ((q >> 3) === them) out.push(mk(sq, t, 0, F_CAP));
        }
      } else {
        const diag = type !== ROOK;
        const orth = type !== BISHOP;
        for (let pass = 0; pass < 2; pass++) {
          if (pass === 0 ? !diag : !orth) continue;
          const dirs = pass === 0 ? BD : RD;
          for (let i = 0; i < 4; i++) {
            const d = dirs[i];
            let t = sq + d;
            while (!(t & 0x88)) {
              const q = b[t];
              if (!q) { if (!capOnly) out.push(mk(sq, t)); }
              else {
                if ((q >> 3) === them) out.push(mk(sq, t, 0, F_CAP));
                break;
              }
              t += d;
            }
          }
        }
      }
    }
    if (!capOnly) this.genCastling(out);
    return out;
  }

  genCastling(out) {
    const us = this.side;
    const rights = us === WHITE ? this.castling & 3 : (this.castling >> 2) & 3;
    if (!rights) return;
    const b = this.board;
    const base = us === WHITE ? 0 : 112;
    const them = us ^ 1;
    if (b[base + 4] !== (KING | (us << 3))) return;
    if (this.isAttacked(base + 4, them)) return;
    const rook = ROOK | (us << 3);
    if ((rights & 1) && b[base + 7] === rook && !b[base + 5] && !b[base + 6]
      && !this.isAttacked(base + 5, them) && !this.isAttacked(base + 6, them)) {
      out.push(mk(base + 4, base + 6, 0, F_CASTLE));
    }
    if ((rights & 2) && b[base] === rook && !b[base + 1] && !b[base + 2] && !b[base + 3]
      && !this.isAttacked(base + 3, them) && !this.isAttacked(base + 2, them)) {
      out.push(mk(base + 4, base + 2, 0, F_CASTLE));
    }
  }

  makeMove(m) {
    const b = this.board;
    const from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, fl = m >> 17;
    const us = this.side;
    const pc = b[from];
    const capSq = fl & F_EP ? (us === WHITE ? to - 16 : to + 16) : to;
    const cap = b[capSq];
    this.stk.push(m, cap, this.castling, this.ep, this.halfmove, this.h1, this.h2);

    let h1 = this.h1, h2 = this.h2;
    let f = this.epFile();
    if (f >= 0) { h1 ^= ZE1[f]; h2 ^= ZE2[f]; }
    h1 ^= ZC1[this.castling]; h2 ^= ZC2[this.castling];

    b[from] = 0;
    h1 ^= ZP1[pc * 128 + from]; h2 ^= ZP2[pc * 128 + from];
    if (cap) {
      b[capSq] = 0;
      h1 ^= ZP1[cap * 128 + capSq]; h2 ^= ZP2[cap * 128 + capSq];
    }
    const placed = promo ? promo | (us << 3) : pc;
    b[to] = placed;
    h1 ^= ZP1[placed * 128 + to]; h2 ^= ZP2[placed * 128 + to];

    if (fl & F_CASTLE) {
      const rf = to > from ? to + 1 : to - 2;
      const rt = to > from ? to - 1 : to + 1;
      const rook = b[rf];
      b[rf] = 0; b[rt] = rook;
      h1 ^= ZP1[rook * 128 + rf] ^ ZP1[rook * 128 + rt];
      h2 ^= ZP2[rook * 128 + rf] ^ ZP2[rook * 128 + rt];
    }
    if ((pc & 7) === KING) this.kings[us] = to;

    this.castling &= CMASK[from] & CMASK[to];
    this.ep = fl & F_DOUBLE ? (from + to) >> 1 : -1;
    this.halfmove = (pc & 7) === PAWN || cap ? 0 : this.halfmove + 1;
    if (us === BLACK) this.fullmove++;
    this.side = us ^ 1;

    h1 ^= ZS1; h2 ^= ZS2;
    h1 ^= ZC1[this.castling]; h2 ^= ZC2[this.castling];
    f = this.epFile();
    if (f >= 0) { h1 ^= ZE1[f]; h2 ^= ZE2[f]; }
    this.h1 = h1; this.h2 = h2;
    this.hs1.push(h1);
    this.hs2.push(h2);
  }

  unmakeMove() {
    const stk = this.stk;
    if (!stk.length) return 0;
    this.h2 = stk.pop(); this.h1 = stk.pop();
    this.halfmove = stk.pop();
    this.ep = stk.pop();
    this.castling = stk.pop();
    const cap = stk.pop();
    const m = stk.pop();
    this.hs1.pop(); this.hs2.pop();
    const b = this.board;
    const from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, fl = m >> 17;
    const us = this.side ^ 1;
    this.side = us;
    if (us === BLACK) this.fullmove--;
    const pc = promo ? PAWN | (us << 3) : b[to];
    b[from] = pc;
    b[to] = 0;
    if (cap) {
      const capSq = fl & F_EP ? (us === WHITE ? to - 16 : to + 16) : to;
      b[capSq] = cap;
    }
    if (fl & F_CASTLE) {
      const rf = to > from ? to + 1 : to - 2;
      const rt = to > from ? to - 1 : to + 1;
      b[rf] = b[rt];
      b[rt] = 0;
    }
    if ((pc & 7) === KING) this.kings[us] = from;
    return m;
  }

  // Strictly legal moves.
  legalMoves() {
    const pseudo = this.genMoves();
    const us = this.side, them = us ^ 1;
    const out = [];
    for (let i = 0; i < pseudo.length; i++) {
      this.makeMove(pseudo[i]);
      if (!this.isAttacked(this.kings[us], them)) out.push(pseudo[i]);
      this.unmakeMove();
    }
    return out;
  }

  // The legal move matching a text like "e2e4" or "e7e8q", or 0.
  parseUci(s) {
    for (const m of this.legalMoves()) if (moveToUci(m) === s) return m;
    return 0;
  }

  // Pieces taken so far, in order (piece codes). A promoted queen taken counts as a queen.
  capturedList() {
    const out = [];
    for (let i = 1; i < this.stk.length; i += 7) if (this.stk[i]) out.push(this.stk[i]);
    return out;
  }

  // How many earlier positions equal the current one (0 = first time).
  repeats() {
    const n = this.hs1.length;
    const lim = Math.min(this.halfmove, n - 1);
    let c = 0;
    for (let i = 2; i <= lim; i += 2) {
      if (this.hs1[n - 1 - i] === this.h1 && this.hs2[n - 1 - i] === this.h2) c++;
    }
    return c;
  }

  isRepetition() {
    const n = this.hs1.length;
    const lim = Math.min(this.halfmove, n - 1);
    for (let i = 2; i <= lim; i += 2) {
      if (this.hs1[n - 1 - i] === this.h1 && this.hs2[n - 1 - i] === this.h2) return true;
    }
    return false;
  }

  insufficientMaterial() {
    let heavy = 0, n = 0, light = 0, dark = 0;
    const b = this.board;
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const t = b[sq] & 7;
      if (!t || t === KING) continue;
      if (t === KNIGHT) n++;
      else if (t === BISHOP) { if (((sq >> 4) + (sq & 7)) & 1) light++; else dark++; }
      else heavy++;
    }
    return noMatingMaterial(heavy, n, light, dark);
  }

  // { over: false } or { over: true, reason, winner } where reason is one of
  // 'checkmate', 'stalemate', 'insufficient', 'fifty', 'repetition'. winner is 0 / 1 or -1.
  status() {
    const moves = this.legalMoves();
    if (!moves.length) {
      return this.inCheck()
        ? { over: true, reason: 'checkmate', winner: this.side ^ 1 }
        : { over: true, reason: 'stalemate', winner: -1 };
    }
    if (this.insufficientMaterial()) return { over: true, reason: 'insufficient', winner: -1 };
    if (this.halfmove >= 100) return { over: true, reason: 'fifty', winner: -1 };
    if (this.repeats() >= 2) return { over: true, reason: 'repetition', winner: -1 };
    return { over: false, winner: -1 };
  }
}

// Only kings, or kings with one minor piece, or bishops that all sit on one colour.
function noMatingMaterial(heavy, knights, light, dark) {
  if (heavy) return false;
  if (knights + light + dark <= 1) return true;
  return knights === 0 && (light === 0 || dark === 0);
}

// Counts leaf positions after `depth` plies. The standard way to prove move generation right.
export function perft(pos, depth) {
  if (depth === 0) return 1;
  const moves = pos.genMoves();
  const us = pos.side, them = us ^ 1;
  let n = 0;
  for (let i = 0; i < moves.length; i++) {
    pos.makeMove(moves[i]);
    if (!pos.isAttacked(pos.kings[us], them)) n += depth === 1 ? 1 : perft(pos, depth - 1);
    pos.unmakeMove();
  }
  return n;
}

// ---------- Evaluation ----------
const VAL = [0, 100, 320, 330, 500, 900, 0];
const PHASE = [0, 0, 1, 1, 2, 4, 0];

// Piece-square tables, written as seen from White: first row is rank 8.
const PST_SRC = {
  1: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  2: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  3: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  4: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  5: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  6: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
};
const KING_END = [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50];

const PST = new Int16Array(16 * 128);      // by piece code and 0x88 square
const KING_EG = new Int16Array(16 * 128);
for (let type = 1; type <= 6; type++) {
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const sq = r * 16 + f;
      const w = (7 - r) * 8 + f;   // table index seen from White
      const bl = r * 8 + f;        // mirrored for Black
      PST[type * 128 + sq] = PST_SRC[type][w];
      PST[(type | 8) * 128 + sq] = PST_SRC[type][bl];
      if (type === KING) {
        KING_EG[type * 128 + sq] = KING_END[w];
        KING_EG[(type | 8) * 128 + sq] = KING_END[bl];
      }
    }
  }
}

// Score in centipawns for the side to move.
export function evaluate(pos) {
  const b = pos.board;
  let score = 0, phase = 0;
  let heavy = 0, knights = 0, light = 0, dark = 0;
  let wb = 0, bb = 0;
  let kmgW = 0, kegW = 0, kmgB = 0, kegB = 0;
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    const pc = b[sq];
    if (!pc) continue;
    const type = pc & 7;
    const black = pc >> 3;
    if (type === KING) {
      if (black) { kmgB = PST[pc * 128 + sq]; kegB = KING_EG[pc * 128 + sq]; }
      else { kmgW = PST[pc * 128 + sq]; kegW = KING_EG[pc * 128 + sq]; }
      continue;
    }
    const v = VAL[type] + PST[pc * 128 + sq];
    score += black ? -v : v;
    phase += PHASE[type];
    if (type === KNIGHT) knights++;
    else if (type === BISHOP) {
      if (((sq >> 4) + (sq & 7)) & 1) light++; else dark++;
      if (black) bb++; else wb++;
    } else heavy++;
  }
  if (noMatingMaterial(heavy, knights, light, dark)) return 0;
  if (wb > 1) score += 30;
  if (bb > 1) score -= 30;
  const ph = phase > 24 ? 24 : phase;
  score += Math.round(((kmgW - kmgB) * ph + (kegW - kegB) * (24 - ph)) / 24);
  return (pos.side === WHITE ? score : -score) + 8;
}

// ---------- Search ----------
const MATE = 30000;
const INF = 32000;
const MAXPLY = 64;
const TT_BITS = 17;
const TT_SIZE = 1 << TT_BITS;
const TT_EXACT = 0, TT_LOWER = 1, TT_UPPER = 2;

// Shared between searches: a position found once is found again for free.
let tt = null;
function ttInit() {
  tt = {
    k1: new Int32Array(TT_SIZE), k2: new Int32Array(TT_SIZE), depth: new Int8Array(TT_SIZE).fill(-1),
    flag: new Int8Array(TT_SIZE), score: new Int16Array(TT_SIZE), move: new Int32Array(TT_SIZE),
  };
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

class Searcher {
  constructor(pos, { timeMs = 1000, rng = Math.random } = {}) {
    this.pos = pos;
    this.rng = rng;
    this.deadline = now() + timeMs;
    this.nodes = 0;
    this.aborted = false;
    this.killers = new Int32Array(MAXPLY * 2);
    this.history = new Int32Array(16 * 128);
    if (!tt) ttInit();
  }

  timeUp() { return now() > this.deadline; }

  // Higher = try first. Captures by victim then cheapest attacker, then killers, then history.
  orderScore(m, ttMove, ply) {
    if (m === ttMove) return 1e7;
    const b = this.pos.board;
    const fl = m >> 17;
    if (fl & F_CAP) {
      const victim = fl & F_EP ? PAWN : b[(m >> 7) & 127] & 7;
      return 2e6 + victim * 16 - (b[m & 127] & 7) + (((m >> 14) & 7) === QUEEN ? 800 : 0);
    }
    const promo = (m >> 14) & 7;
    if (promo) return 1.9e6 + promo;
    if (m === this.killers[ply * 2]) return 1.8e6;
    if (m === this.killers[ply * 2 + 1]) return 1.7e6;
    return this.history[b[m & 127] * 128 + ((m >> 7) & 127)];
  }

  ordered(moves, ttMove, ply) {
    const n = moves.length;
    const sc = new Array(n);
    for (let i = 0; i < n; i++) sc[i] = this.orderScore(moves[i], ttMove, ply);
    // selection order: swap the best remaining to the front as we go (done by the caller)
    return sc;
  }

  qsearch(alpha, beta, ply) {
    if ((++this.nodes & 2047) === 0 && this.timeUp()) this.aborted = true;
    if (this.aborted) return 0;
    const pos = this.pos;
    const stand = evaluate(pos);
    if (ply >= MAXPLY - 1) return stand;
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    const moves = pos.genMoves(true);
    const sc = this.ordered(moves, 0, ply);
    const us = pos.side, them = us ^ 1;
    const b = pos.board;
    for (let i = 0; i < moves.length; i++) {
      let bi = i;
      for (let j = i + 1; j < moves.length; j++) if (sc[j] > sc[bi]) bi = j;
      const m = moves[bi];
      moves[bi] = moves[i]; moves[i] = m;
      sc[bi] = sc[i];
      // Skip captures that cannot lift the score even with a lucky recapture-free gain.
      const fl = m >> 17;
      if (!((m >> 14) & 7)) {
        const victim = fl & F_EP ? PAWN : b[(m >> 7) & 127] & 7;
        if (stand + VAL[victim] + 200 < alpha) continue;
      }
      pos.makeMove(m);
      if (pos.isAttacked(pos.kings[us], them)) { pos.unmakeMove(); continue; }
      const score = -this.qsearch(-beta, -alpha, ply + 1);
      pos.unmakeMove();
      if (this.aborted) return 0;
      if (score >= beta) return score;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  negamax(depth, alpha, beta, ply) {
    if ((++this.nodes & 2047) === 0 && this.timeUp()) this.aborted = true;
    if (this.aborted) return 0;
    const pos = this.pos;
    if (ply > 0 && (pos.halfmove >= 100 || pos.isRepetition())) return 0;
    if (ply >= MAXPLY - 1) return evaluate(pos);
    const us = pos.side, them = us ^ 1;
    const inCheck = pos.isAttacked(pos.kings[us], them);
    if (inCheck) depth++;
    if (depth <= 0) return this.qsearch(alpha, beta, ply);

    const alpha0 = alpha;
    const idx = pos.h1 & (TT_SIZE - 1);
    let ttMove = 0;
    if (tt.depth[idx] >= 0 && tt.k1[idx] === pos.h1 && tt.k2[idx] === pos.h2) {
      ttMove = tt.move[idx];
      if (ply > 0 && tt.depth[idx] >= depth) {
        let s = tt.score[idx];
        if (s > MATE - 200) s -= ply; else if (s < -MATE + 200) s += ply;
        const fl = tt.flag[idx];
        if (fl === TT_EXACT) return s;
        if (fl === TT_LOWER && s > alpha) alpha = s;
        else if (fl === TT_UPPER && s < beta) beta = s;
        if (alpha >= beta) return s;
      }
    }

    const moves = pos.genMoves();
    const sc = this.ordered(moves, ttMove, ply);
    let best = -INF, bestMove = 0, legal = 0;
    for (let i = 0; i < moves.length; i++) {
      let bi = i;
      for (let j = i + 1; j < moves.length; j++) if (sc[j] > sc[bi]) bi = j;
      const m = moves[bi];
      moves[bi] = moves[i]; moves[i] = m;
      sc[bi] = sc[i];
      pos.makeMove(m);
      if (pos.isAttacked(pos.kings[us], them)) { pos.unmakeMove(); continue; }
      legal++;
      const score = -this.negamax(depth - 1, -beta, -alpha, ply + 1);
      pos.unmakeMove();
      if (this.aborted) return 0;
      if (score > best) {
        best = score;
        bestMove = m;
        if (score > alpha) {
          alpha = score;
          if (alpha >= beta) {
            if (!(m >> 17 & F_CAP)) {
              if (this.killers[ply * 2] !== m) {
                this.killers[ply * 2 + 1] = this.killers[ply * 2];
                this.killers[ply * 2] = m;
              }
              this.history[pos.board[m & 127] * 128 + ((m >> 7) & 127)] += depth * depth;
            }
            break;
          }
        }
      }
    }
    if (!legal) return inCheck ? -MATE + ply : 0;

    let s = best;
    if (s > MATE - 200) s += ply; else if (s < -MATE + 200) s -= ply;
    tt.k1[idx] = pos.h1; tt.k2[idx] = pos.h2;
    tt.depth[idx] = depth > 100 ? 100 : depth;
    tt.flag[idx] = best <= alpha0 ? TT_UPPER : best >= beta ? TT_LOWER : TT_EXACT;
    tt.score[idx] = s;
    tt.move[idx] = bestMove;
    return best;
  }

  // Iterative deepening over the root moves. Returns { move, score, depth, nodes }.
  run(maxDepth, stopFraction = 0.35) {
    const pos = this.pos;
    let rootMoves = pos.legalMoves();
    if (!rootMoves.length) return { move: 0, score: 0, depth: 0, nodes: 0 };
    // A shuffled start order makes equal moves vary from game to game.
    for (let i = rootMoves.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [rootMoves[i], rootMoves[j]] = [rootMoves[j], rootMoves[i]];
    }
    const t0 = now();
    const budget = this.deadline - t0;
    let best = { move: rootMoves[0], score: 0, depth: 0 };
    for (let depth = 1; depth <= maxDepth; depth++) {
      let alpha = -INF;
      let iterBest = 0, iterScore = -INF;
      for (let i = 0; i < rootMoves.length; i++) {
        const m = rootMoves[i];
        pos.makeMove(m);
        const score = -this.negamax(depth - 1, -INF, -alpha, 1);
        pos.unmakeMove();
        if (this.aborted) break;
        if (score > iterScore) { iterScore = score; iterBest = m; if (score > alpha) alpha = score; }
      }
      // A half-finished round still counts when it found a move: the previous best went first.
      if (iterBest) best = { move: iterBest, score: iterScore, depth: this.aborted ? depth - 1 : depth };
      if (this.aborted) break;
      if (iterBest) {
        const k = rootMoves.indexOf(iterBest);
        rootMoves.splice(k, 1);
        rootMoves.unshift(iterBest);
      }
      if (Math.abs(iterScore) > MATE - 100) break;
      if (now() - t0 > budget * stopFraction) break;
    }
    return { ...best, nodes: this.nodes };
  }
}

// Search the position. options: depth (max), timeMs, rng. The position is left as it was.
export function search(pos, { depth = 3, timeMs = 1000, rng = Math.random } = {}) {
  return new Searcher(pos, { timeMs, rng }).run(depth);
}

// Easy: look one move ahead at the material only, then pick at random among the moves that
// are nearly as good. It happily leaves pieces to be taken, so a beginner can win.
function easyMove(pos, rng) {
  const moves = pos.legalMoves();
  const scored = [];
  for (const m of moves) {
    pos.makeMove(m);
    let s;
    if (pos.legalMoves().length === 0) s = pos.inCheck() ? MATE : 0;   // always take a mate in one
    else s = -evaluate(pos);
    pos.unmakeMove();
    scored.push({ m, s });
  }
  let top = -Infinity;
  for (const x of scored) if (x.s > top) top = x.s;
  if (top >= MATE) return scored.find((x) => x.s === top).m;
  const near = scored.filter((x) => x.s >= top - 90);
  return near[Math.floor(rng() * near.length)].m;
}

export const LEVELS = {
  easy: { easy: true },
  medium: { depth: 3, timeMs: 900 },
  hard: { depth: 6, timeMs: 1400 },
};

// The computer's move for a level ('easy' | 'medium' | 'hard'), or 0 when there is none.
// options.timeMs shortens the thinking time (used by the hint and by tests).
export function chooseMove(pos, level = 'medium', { rng = Math.random, timeMs } = {}) {
  const cfg = LEVELS[level] || LEVELS.medium;
  const moves = pos.legalMoves();
  if (!moves.length) return 0;
  if (moves.length === 1) return moves[0];
  if (cfg.easy) return easyMove(pos, rng);
  return search(pos, { depth: cfg.depth, timeMs: timeMs || cfg.timeMs, rng }).move || moves[0];
}

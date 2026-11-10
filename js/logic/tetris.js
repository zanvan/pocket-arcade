// Falling-blocks rules: Super Rotation System with wall kicks, 7-bag, hold, lock delay.
import { shuffle } from './rng.js';

export const W = 10;
export const H = 22;      // two hidden rows on top
export const HIDDEN = 2;

const SHAPES = {
  I: ['....', 'IIII', '....', '....'],
  J: ['J..', 'JJJ', '...'],
  L: ['..L', 'LLL', '...'],
  O: ['OO', 'OO'],
  S: ['.SS', 'SS.', '...'],
  T: ['.T.', 'TTT', '...'],
  Z: ['ZZ.', '.ZZ', '...'],
};

export const TYPES = Object.keys(SHAPES);

// Rotation states 0, R, 2, L. Rotating the matrix clockwise gives the SRS states.
export const PIECES = {};
for (const [type, rows] of Object.entries(SHAPES)) {
  const n = rows.length;
  const first = [];
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') first.push([x, y]); }));
  const states = [first];
  for (let i = 1; i < 4; i++) states.push(states[i - 1].map(([x, y]) => [n - 1 - y, x]));
  PIECES[type] = { n, states };
}

// Kick tables, y pointing up as in the SRS spec (converted when applied).
const KICK_JLSTZ = {
  '01': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '10': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '12': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '21': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '23': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '32': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '30': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '03': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const KICK_I = {
  '01': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '10': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '12': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '21': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '23': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '32': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '30': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '03': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

const LINE_SCORE = [0, 100, 300, 500, 800];
export const LOCK_DELAY = 0.5;
const MAX_LOCK_RESETS = 15;
export const CLEAR_TIME = 0.28;

export class Tetris {
  constructor(rand = Math.random) {
    this.rand = rand;
    this.reset();
  }

  reset() {
    this.board = Array.from({ length: H }, () => Array(W).fill(null));
    this.bag = [];
    this.queue = [];
    this.hold = null;
    this.canHold = true;
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.over = false;
    this.clearing = null;
    this.events = [];
    this.fillQueue();
    this.spawn();
  }

  fillQueue() {
    while (this.queue.length < 5) {
      if (!this.bag.length) this.bag = shuffle([...TYPES], this.rand);
      this.queue.push(this.bag.pop());
    }
  }

  spawn(type) {
    if (!type) {
      type = this.queue.shift();
      this.fillQueue();
    }
    const p = { type, rot: 0, x: type === 'O' ? 4 : 3, y: 1 };
    this.cur = p;
    this.gravityAcc = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.lowestY = p.y;
    if (!this.fits(p)) {
      this.over = true;
      this.events.push('over');
    }
  }

  cells(p = this.cur) {
    return PIECES[p.type].states[p.rot].map(([x, y]) => [x + p.x, y + p.y]);
  }

  fits(p) {
    for (const [x, y] of this.cells(p)) {
      if (x < 0 || x >= W || y >= H || y < 0) return false;
      if (this.board[y][x]) return false;
    }
    return true;
  }

  active() { return !this.over && !this.clearing; }

  grounded() { return !this.fits({ ...this.cur, y: this.cur.y + 1 }); }

  afterManipulation() {
    if (this.grounded() && this.lockResets < MAX_LOCK_RESETS) {
      this.lockTimer = 0;
      this.lockResets++;
    }
  }

  move(dx) {
    if (!this.active()) return false;
    const p = { ...this.cur, x: this.cur.x + dx };
    if (!this.fits(p)) return false;
    this.cur = p;
    this.afterManipulation();
    return true;
  }

  rotate(dir) { // +1 clockwise, -1 counter-clockwise
    if (!this.active()) return false;
    const { type, rot } = this.cur;
    if (type === 'O') return false;
    const to = (rot + dir + 4) % 4;
    const kicks = (type === 'I' ? KICK_I : KICK_JLSTZ)['' + rot + to];
    for (const [kx, ky] of kicks) {
      const p = { ...this.cur, rot: to, x: this.cur.x + kx, y: this.cur.y - ky };
      if (this.fits(p)) {
        this.cur = p;
        this.afterManipulation();
        return true;
      }
    }
    return false;
  }

  stepDown() {
    const p = { ...this.cur, y: this.cur.y + 1 };
    if (!this.fits(p)) return false;
    this.cur = p;
    if (p.y > this.lowestY) {
      this.lowestY = p.y;
      this.lockResets = 0;
    }
    return true;
  }

  softDrop() {
    if (!this.active()) return false;
    if (this.stepDown()) {
      this.score += 1;
      this.gravityAcc = 0;
      return true;
    }
    return false;
  }

  hardDrop() {
    if (!this.active()) return 0;
    let n = 0;
    while (this.stepDown()) n++;
    this.score += 2 * n;
    this.lock();
    return n;
  }

  ghostY() {
    let y = this.cur.y;
    while (this.fits({ ...this.cur, y: y + 1 })) y++;
    return y;
  }

  holdPiece() {
    if (!this.active() || !this.canHold) return false;
    const t = this.cur.type;
    const h = this.hold;
    this.hold = t;
    if (h) this.spawn(h);
    else this.spawn();
    this.canHold = false;
    this.events.push('hold');
    return true;
  }

  gravityInterval() {
    const l = Math.min(this.level, 20);
    return Math.pow(0.8 - (l - 1) * 0.007, l - 1);
  }

  update(dt, softDropping = false) {
    if (this.over) return;
    if (this.clearing) {
      this.clearing.t -= dt;
      if (this.clearing.t <= 0) this.finishClear();
      return;
    }
    const interval = softDropping ? Math.min(this.gravityInterval(), 0.04) : this.gravityInterval();
    if (!this.grounded()) {
      this.lockTimer = 0;
      this.gravityAcc += dt;
      while (this.gravityAcc >= interval) {
        this.gravityAcc -= interval;
        if (!this.stepDown()) break;
        if (softDropping) this.score += 1;
      }
    } else {
      this.gravityAcc = 0;
      this.lockTimer += dt;
      if (this.lockTimer >= LOCK_DELAY) this.lock();
    }
  }

  lock() {
    const cells = this.cells();
    for (const [x, y] of cells) this.board[y][x] = this.cur.type;
    this.canHold = true;
    if (cells.every(([, y]) => y < HIDDEN)) {
      this.over = true;
      this.events.push('over');
      return;
    }
    const rows = [];
    for (let y = 0; y < H; y++) if (this.board[y].every(Boolean)) rows.push(y);
    if (rows.length) {
      this.score += LINE_SCORE[rows.length] * this.level;
      this.clearing = { rows, t: CLEAR_TIME };
      this.events.push('clear' + rows.length);
    } else {
      this.events.push('lock');
      this.spawn();
    }
  }

  finishClear() {
    const rows = new Set(this.clearing.rows);
    const kept = this.board.filter((_, y) => !rows.has(y));
    while (kept.length < H) kept.unshift(Array(W).fill(null));
    this.board = kept;
    this.lines += rows.size;
    const level = Math.floor(this.lines / 10) + 1;
    if (level > this.level) {
      this.level = level;
      this.events.push('level');
    }
    this.clearing = null;
    this.spawn();
  }
}

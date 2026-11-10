// Billiard (8-ball): table physics, rules and the computer player. Pure module, tested in Node.
//
// The table is W x H units, the long side along x. The "head" end (where you break from) is
// at small x. Ball 0 is the cue ball, 1-7 are solids, 8 is the black, 9-15 are stripes.
// Physics runs in fixed frames of 1/60 s split into sub-steps, so a shot played out in the
// app gives exactly the same result as the same shot simulated by the computer player.

export const W = 200;
export const H = 100;
export const R = 2.25;              // ball radius (a real ball on a 9-foot table, to scale)
export const FRAME = 1 / 60;
export const VMAX = 600;            // cue ball speed at full power, units per second
export const HEAD_X = W / 4;        // the break is played from behind this line
export const FOOT = { x: W * 0.75, y: H / 2 };

const CG = 6.6;                     // corner pocket: rail ends this far from the corner
const SG = 4.8;                     // side pocket: half the mouth width
const DECEL = 42;                   // rolling friction, units per second squared
const DRAG = 0.32;                   // speed-proportional slowing, per second
const E_BALL = 0.94;
const E_RAIL = 0.78;

export const POCKETS = [
  { x: -1.2, y: -1.2, r: 4.4 }, { x: W / 2, y: -2.9, r: 3.7 }, { x: W + 1.2, y: -1.2, r: 4.4 },
  { x: -1.2, y: H + 1.2, r: 4.4 }, { x: W / 2, y: H + 2.9, r: 3.7 }, { x: W + 1.2, y: H + 1.2, r: 4.4 },
];

// Cushion edges as line segments, including the angled jaws into each pocket.
export const RAILS = (() => {
  const s = [];
  const seg = (x1, y1, x2, y2) => s.push({ x1, y1, x2, y2 });
  for (const [y, out] of [[0, -1], [H, 1]]) {
    seg(CG, y, W / 2 - SG, y);
    seg(W / 2 + SG, y, W - CG, y);
    seg(CG, y, CG - 2.2, y + out * 3.6);
    seg(W - CG, y, W - CG + 2.2, y + out * 3.6);
    seg(W / 2 - SG, y, W / 2 - SG + 0.8, y + out * 3.6);
    seg(W / 2 + SG, y, W / 2 + SG - 0.8, y + out * 3.6);
  }
  for (const [x, out] of [[0, -1], [W, 1]]) {
    seg(x, CG, x, H - CG);
    seg(x, CG, x + out * 3.6, CG - 2.2);
    seg(x, H - CG, x + out * 3.6, H - CG + 2.2);
  }
  return s;
})();

export const groupOf = (id) => (id === 0 ? 'cue' : id === 8 ? 'eight' : id < 8 ? 'solid' : 'stripe');

// ---------- physics ----------
function moving(balls) {
  for (const b of balls) if (b.on && (b.vx || b.vy)) return true;
  return false;
}

// Advances the balls by one frame. `ev` collects what happened: first ball the cue ball
// touched, balls potted (in order), and how many cushion and ball contacts there were.
export function stepFrame(balls, ev) {
  let vmax = 0;
  for (const b of balls) if (b.on) vmax = Math.max(vmax, Math.hypot(b.vx, b.vy));
  if (!vmax) return false;
  const n = Math.min(80, Math.max(1, Math.ceil((vmax * FRAME) / (R * 0.35))));
  const h = FRAME / n;
  for (let k = 0; k < n; k++) {
    for (const b of balls) {
      if (!b.on) continue;
      b.x += b.vx * h;
      b.y += b.vy * h;
    }
    // ball against ball
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      if (!a.on) continue;
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        if (!b.on) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= 4 * R * R) continue;
        const d = Math.sqrt(d2) || 1e-6;
        const nx = dx / d, ny = dy / d;
        const u = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (u > 0) {
          const jn = ((1 + E_BALL) / 2) * u;
          a.vx -= jn * nx; a.vy -= jn * ny;
          b.vx += jn * nx; b.vy += jn * ny;
          if (ev) {
            ev.contacts++;
            ev.hardest = Math.max(ev.hardest, u);
            if (ev.firstHit == null && (a.id === 0 || b.id === 0)) ev.firstHit = a.id === 0 ? b.id : a.id;
          }
        }
        const push = (2 * R - d) / 2;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
      }
    }
    for (const b of balls) {
      if (!b.on) continue;
      // cushions: only balls near an edge can touch one
      if (b.x < CG + R || b.x > W - CG - R || b.y < R + 0.5 || b.y > H - R - 0.5 || Math.abs(b.x - W / 2) < SG + R) {
        for (const s of RAILS) {
          const ex = s.x2 - s.x1, ey = s.y2 - s.y1;
          let t = ((b.x - s.x1) * ex + (b.y - s.y1) * ey) / (ex * ex + ey * ey);
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const qx = s.x1 + ex * t, qy = s.y1 + ey * t;
          const dx = b.x - qx, dy = b.y - qy;
          const d2 = dx * dx + dy * dy;
          if (d2 >= R * R) continue;
          const d = Math.sqrt(d2) || 1e-6;
          const nx = dx / d, ny = dy / d;
          const vn = b.vx * nx + b.vy * ny;
          if (vn < 0) {
            b.vx -= (1 + E_RAIL) * vn * nx;
            b.vy -= (1 + E_RAIL) * vn * ny;
            b.vx *= 0.97; b.vy *= 0.97;
            if (ev) { ev.rails++; ev.railHit = Math.max(ev.railHit, -vn); }
          }
          b.x = qx + nx * R; b.y = qy + ny * R;
        }
      }
      // pockets (and a safety net for a ball that slipped past a jaw)
      let pocket = -1;
      for (let p = 0; p < POCKETS.length; p++) {
        const P = POCKETS[p];
        if ((b.x - P.x) ** 2 + (b.y - P.y) ** 2 < P.r * P.r) { pocket = p; break; }
      }
      if (pocket < 0 && (b.x < -2 * R || b.x > W + 2 * R || b.y < -2 * R || b.y > H + 2 * R)) {
        pocket = nearestPocket(b.x, b.y);
      }
      if (pocket >= 0) {
        b.on = false;
        b.vx = b.vy = 0;
        b.x = POCKETS[pocket].x; b.y = POCKETS[pocket].y;
        if (ev) ev.pots.push({ id: b.id, pocket });
      }
    }
    // friction
    for (const b of balls) {
      if (!b.on || (!b.vx && !b.vy)) continue;
      const sp = Math.hypot(b.vx, b.vy);
      const ns = sp - (DECEL + DRAG * sp) * h;
      if (ns <= 0.02) { b.vx = b.vy = 0; continue; }
      const f = ns / sp;
      b.vx *= f; b.vy *= f;
    }
  }
  return moving(balls);
}

function nearestPocket(x, y) {
  let best = 0, bd = Infinity;
  POCKETS.forEach((P, i) => { const d = (x - P.x) ** 2 + (y - P.y) ** 2; if (d < bd) { bd = d; best = i; } });
  return best;
}

export const newEvents = () => ({ firstHit: null, pots: [], rails: 0, contacts: 0, hardest: 0, railHit: 0 });

// ---------- racking ----------
export function rack(random = Math.random) {
  const balls = [];
  for (let id = 0; id < 16; id++) balls.push({ id, x: 0, y: 0, vx: 0, vy: 0, on: true });
  balls[0].x = HEAD_X - 6; balls[0].y = H / 2;
  // 8 in the middle of the third row; a solid and a stripe in the two back corners.
  const solids = [2, 3, 4, 5, 6, 7], stripes = [10, 11, 12, 13, 14, 15];
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const corners = random() < 0.5 ? [1, 9] : [9, 1];
  const rest = shuffle([...solids, ...stripes]);
  const order = [];
  let k = 0;
  for (let row = 0; row < 5; row++) {
    for (let j = 0; j <= row; j++) {
      if (row === 2 && j === 1) order.push(8);
      else if (row === 4 && j === 0) order.push(corners[0]);
      else if (row === 4 && j === 4) order.push(corners[1]);
      else order.push(rest[k++]);
    }
  }
  let i = 0;
  const gap = 0.02;
  for (let row = 0; row < 5; row++) {
    for (let j = 0; j <= row; j++) {
      const b = balls[order[i++]];
      b.x = FOOT.x + row * (2 * R + gap) * Math.sqrt(3) / 2;
      b.y = FOOT.y + (j - row / 2) * (2 * R + gap);
    }
  }
  return balls;
}

export function isFree(balls, x, y, except = -1) {
  if (x < R || x > W - R || y < R || y > H - R) return false;
  for (const b of balls) if (b.on && b.id !== except && (b.x - x) ** 2 + (b.y - y) ** 2 < 4 * R * R + 0.01) return false;
  return true;
}

// The nearest free place to (x, y), searching outward; used to put a ball back on the table.
export function freeSpot(balls, x, y, except = -1, maxX = W - R) {
  for (let d = 0; d < 120; d += 0.75) {
    for (let a = 0; a < 16; a++) {
      const px = x + Math.cos((a / 16) * Math.PI * 2) * d, py = y + Math.sin((a / 16) * Math.PI * 2) * d;
      if (px <= maxX && isFree(balls, px, py, except)) return { x: px, y: py };
      if (d === 0) break;
    }
  }
  return { x, y };
}

// ---------- the game and its rules ----------
export class Pool {
  constructor({ random = Math.random } = {}) {
    this.balls = rack(random);
    this.turn = 0;                  // player 0 or 1
    this.groups = [null, null];     // 'solid' | 'stripe' once the table is no longer open
    this.isBreak = true;
    this.inHand = 'kitchen';        // 'kitchen' (behind the head line), 'anywhere' or null
    this.winner = null;
    this.reason = '';
    this.ev = null;                 // events of the shot in progress
    this.shotTargets = null;
  }

  clone() {
    const p = Object.create(Pool.prototype);
    Object.assign(p, this);
    p.balls = this.balls.map((b) => ({ ...b }));
    p.groups = this.groups.slice();
    p.ev = null;
    return p;
  }

  toJSON() {
    return { v: 1, balls: this.balls.map((b) => [b.on ? 1 : 0, +b.x.toFixed(3), +b.y.toFixed(3)]), turn: this.turn, groups: this.groups, isBreak: this.isBreak, inHand: this.inHand, winner: this.winner, reason: this.reason };
  }

  static fromJSON(d) {
    if (!d || d.v !== 1 || !Array.isArray(d.balls) || d.balls.length !== 16) return null;
    const p = new Pool();
    d.balls.forEach(([on, x, y], id) => Object.assign(p.balls[id], { on: !!on, x, y, vx: 0, vy: 0 }));
    p.turn = d.turn === 1 ? 1 : 0;
    p.groups = Array.isArray(d.groups) ? d.groups.slice(0, 2) : [null, null];
    p.isBreak = !!d.isBreak;
    p.inHand = d.inHand || null;
    p.winner = d.winner ?? null;
    p.reason = d.reason || '';
    if (!p.balls[0].on) { p.balls[0].on = true; Object.assign(p.balls[0], freeSpot(p.balls, HEAD_X, H / 2, 0)); p.inHand = p.inHand || 'anywhere'; }
    return p;
  }

  remaining(group) { return this.balls.filter((b) => b.on && groupOf(b.id) === group).length; }

  // The balls `player` may hit first.
  targets(player = this.turn) {
    const g = this.groups[player];
    if (this.isBreak || !g) return this.balls.filter((b) => b.on && b.id !== 0 && (this.isBreak || b.id !== 8)).map((b) => b.id);
    const own = this.balls.filter((b) => b.on && groupOf(b.id) === g).map((b) => b.id);
    return own.length ? own : [8];
  }

  canPlaceCue(x, y) {
    if (!this.inHand) return false;
    if (this.inHand === 'kitchen' && x > HEAD_X) return false;
    return isFree(this.balls, x, y, 0);
  }

  placeCue(x, y) {
    if (!this.canPlaceCue(x, y)) return false;
    this.balls[0].x = x; this.balls[0].y = y;
    return true;
  }

  shoot(angle, power) {
    const c = this.balls[0];
    const v = Math.max(0.03, Math.min(1, power)) * VMAX;
    c.vx = Math.cos(angle) * v;
    c.vy = Math.sin(angle) * v;
    this.ev = newEvents();
    this.shotTargets = this.targets();
    this.shooter = this.turn;
  }

  // One frame of motion. Returns true while balls are still moving.
  step() { return stepFrame(this.balls, this.ev); }

  // Applies the rules once everything has stopped. Returns what happened, for messages.
  endShot() {
    const ev = this.ev || newEvents();
    const p = this.shooter ?? this.turn;
    const other = 1 - p;
    const potted = ev.pots.map((x) => x.id);
    const objects = potted.filter((id) => id !== 0);
    const res = { foul: null, potted, assigned: null, keep: false, winner: null, respotted8: false };

    if (potted.includes(0)) res.foul = 'scratch';
    else if (ev.firstHit == null) res.foul = 'nohit';
    else if (!this.shotTargets.includes(ev.firstHit)) res.foul = 'wrong';

    if (objects.includes(8)) {
      if (this.isBreak) {
        const b8 = this.balls[8];
        b8.on = true;
        Object.assign(b8, freeSpot(this.balls, FOOT.x, FOOT.y, 8));
        res.respotted8 = true;
      } else if (this.shotTargets.includes(8) && !res.foul) {
        res.winner = p; this.reason = 'won8';
      } else {
        res.winner = other; this.reason = res.foul ? 'foul8' : 'early8';
      }
    }

    if (res.winner == null) {
      if (!this.isBreak && !this.groups[p] && !res.foul) {
        const first = objects.find((id) => id !== 8);
        if (first != null) {
          this.groups[p] = groupOf(first);
          this.groups[other] = this.groups[p] === 'solid' ? 'stripe' : 'solid';
          res.assigned = this.groups[p];
        }
      }
      const own = this.groups[p];
      res.keep = !res.foul && objects.some((id) => id !== 8 && (this.isBreak || !own || groupOf(id) === own));
    }

    if (potted.includes(0)) {
      const c = this.balls[0];
      c.on = true;
      Object.assign(c, freeSpot(this.balls, HEAD_X, H / 2, 0));
    }
    this.winner = res.winner;
    this.inHand = res.winner == null && res.foul ? 'anywhere' : null;
    this.turn = res.winner != null ? this.turn : res.keep ? p : other;
    this.isBreak = false;
    this.ev = null;
    return res;
  }
}

// Plays a whole shot on a copy and returns the copy and its result (used by the computer).
export function simulate(pool, angle, power, cue = null) {
  const p = pool.clone();
  if (cue) { p.balls[0].x = cue.x; p.balls[0].y = cue.y; }
  p.shoot(angle, power);
  for (let f = 0; f < 60 * 25 && p.step(); f++) { /* run until every ball stops */ }
  for (const b of p.balls) { b.vx = 0; b.vy = 0; }
  const res = p.endShot();
  return { pool: p, res };
}

// ---------- aiming help ----------
// Follows the cue ball's straight path from (x, y) along `angle` to the first ball or cushion.
// Returns { t, hit (ball id or -1), gx, gy (ghost ball), ox, oy (object ball direction) }.
export function aimLine(balls, x, y, angle) {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  let best = Infinity, hit = -1;
  for (const b of balls) {
    if (!b.on || b.id === 0) continue;
    const fx = b.x - x, fy = b.y - y;
    const along = fx * dx + fy * dy;
    if (along <= 0) continue;
    const perp2 = fx * fx + fy * fy - along * along;
    if (perp2 >= 4 * R * R) continue;
    const t = along - Math.sqrt(4 * R * R - perp2);
    if (t < best) { best = t; hit = b.id; }
  }
  // cushions, approximated by the lines a ball centre cannot cross
  const walls = [];
  if (dx > 0) walls.push((W - R - x) / dx); else if (dx < 0) walls.push((R - x) / dx);
  if (dy > 0) walls.push((H - R - y) / dy); else if (dy < 0) walls.push((R - y) / dy);
  const tw = Math.max(0, Math.min(...walls));
  if (tw < best) { best = tw; hit = -1; }
  const gx = x + dx * best, gy = y + dy * best;
  const out = { t: best, hit, gx, gy, ox: 0, oy: 0 };
  if (hit >= 0) {
    const b = balls[hit];
    const nx = b.x - gx, ny = b.y - gy, d = Math.hypot(nx, ny) || 1;
    out.ox = nx / d; out.oy = ny / d;
  }
  return out;
}

// ---------- computer player ----------
const NOISE = { easy: 0.045, medium: 0.016, hard: 0.0045 }; // aim error in radians (spread)

function gauss(random) {
  const u = Math.max(1e-9, random()), v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function pathClear(balls, x1, y1, x2, y2, ignore, room = 2 * R) {
  const ex = x2 - x1, ey = y2 - y1, L2 = ex * ex + ey * ey || 1;
  for (const b of balls) {
    if (!b.on || ignore.includes(b.id)) continue;
    let t = ((b.x - x1) * ex + (b.y - y1) * ey) / L2;
    if (t < 0 || t > 1) continue;
    const qx = x1 + ex * t, qy = y1 + ey * t;
    if ((b.x - qx) ** 2 + (b.y - qy) ** 2 < room * room) return false;
  }
  return true;
}

// Where the computer aims for a pocket: a little inside the mouth, not the hole's centre.
function pocketAim(p) {
  const P = POCKETS[p];
  return { x: Math.min(W - 1.2, Math.max(1.2, P.x)), y: Math.min(H - 1.2, Math.max(1.2, P.y)) };
}

// Chooses { cue: {x, y} | null, angle, power } for the player to move.
export function planShot(pool, level = 'medium', random = Math.random) {
  const balls = pool.balls;
  const cue0 = balls[0];
  const noise = NOISE[level] ?? NOISE.medium;
  const finish = (s) => ({ ...s, angle: s.angle + gauss(random) * noise, power: Math.min(1, s.power * (1 + gauss(random) * 0.04)) });

  if (pool.isBreak) {
    const cue = { x: HEAD_X - 6, y: H / 2 + (random() - 0.5) * 20 };
    return finish({ cue, angle: Math.atan2(FOOT.y - cue.y, FOOT.x - cue.x), power: 1 });
  }

  const targets = pool.targets();
  const cands = [];
  const cuePlaces = (b, dir) => {
    if (!pool.inHand) return [{ x: cue0.x, y: cue0.y, fixed: true }];
    const out = [];
    for (const dist of [14, 26, 40]) {
      for (const off of [0, 0.35, -0.35]) {
        const a = Math.atan2(dir.y, dir.x) + Math.PI + off;
        const gx = b.x - dir.x * 2 * R, gy = b.y - dir.y * 2 * R;
        const x = gx + Math.cos(a) * dist, y = gy + Math.sin(a) * dist;
        if (pool.canPlaceCue(x, y)) out.push({ x, y });
      }
    }
    return out;
  };

  for (const id of targets) {
    const b = balls[id];
    for (let p = 0; p < POCKETS.length; p++) {
      const A = pocketAim(p);
      const dx = A.x - b.x, dy = A.y - b.y, d2 = Math.hypot(dx, dy);
      const dir = { x: dx / d2, y: dy / d2 };
      // Side pockets take only balls coming at them fairly straight.
      if (p === 1 || p === 4) { if (Math.abs(dir.y) < 0.55) continue; }
      if (!pathClear(balls, b.x, b.y, A.x, A.y, [0, id], 2 * R * 0.98)) continue;
      const gx = b.x - dir.x * 2 * R, gy = b.y - dir.y * 2 * R;
      for (const c of cuePlaces(b, dir)) {
        const ax = gx - c.x, ay = gy - c.y, d1 = Math.hypot(ax, ay);
        if (d1 < 0.5) continue;
        const cos = (ax * dir.x + ay * dir.y) / d1;
        if (cos < 0.3) continue;
        if (!pathClear(balls, c.x, c.y, gx, gy, [0, id])) continue;
        const score = cos * cos * 100 - d1 * 0.12 - d2 * 0.18;
        const power = Math.min(0.95, 0.16 + (d1 + d2 / Math.max(cos, 0.35)) / 380);
        cands.push({ cue: c.fixed ? null : { x: c.x, y: c.y }, angle: Math.atan2(ay, ax), power, score, id });
      }
    }
  }
  cands.sort((a, b) => b.score - a.score);

  // Try the best few for real on a copy of the table, at two strengths.
  let best = null, bestV = -Infinity;
  for (const c of cands.slice(0, 9)) {
    for (const k of [1, 1.3]) {
      const power = Math.min(1, c.power * k);
      const { pool: after, res } = simulate(pool, c.angle, power, c.cue);
      let v = -1000;
      if (res.winner === pool.turn) v = 10000;
      else if (res.winner != null) v = -10000;
      else if (!res.foul && res.keep) {
        // A good shot also leaves something to pot next.
        v = 500 + c.score + Math.min(5, after.targets(pool.turn).length ? countEasy(after) * 20 : 0);
      } else if (!res.foul) v = c.score;
      if (v > bestV) { bestV = v; best = { cue: c.cue, angle: c.angle, power }; }
    }
    if (bestV >= 500 && level !== 'hard') break;
  }
  if (best && bestV > 0) return finish(best);

  // No pot found: play a safe hit on one of our own balls.
  let safe = null, safeV = -Infinity;
  const from = pool.inHand ? freeSpot(balls, HEAD_X, H / 2, 0) : { x: cue0.x, y: cue0.y };
  for (const id of targets) {
    const b = balls[id];
    const a0 = Math.atan2(b.y - from.y, b.x - from.x);
    for (const off of [0, 0.02, -0.02, 0.05, -0.05]) {
      for (const power of [0.3, 0.5]) {
        const { res } = simulate(pool, a0 + off, power, pool.inHand ? from : null);
        const v = res.winner === pool.turn ? 1000 : res.winner != null ? -1000 : res.foul ? -100 : res.keep ? 200 : 10 + random();
        if (v > safeV) { safeV = v; safe = { cue: pool.inHand ? from : null, angle: a0 + off, power }; }
      }
    }
  }
  if (safe) return finish(safe);
  return finish({ cue: pool.inHand ? from : null, angle: random() * Math.PI * 2, power: 0.4 });
}

// How many open pots the player to move has (used to judge the position a shot leaves).
function countEasy(pool) {
  const c = pool.balls[0];
  let n = 0;
  for (const id of pool.targets()) {
    const b = pool.balls[id];
    if (pathClear(pool.balls, c.x, c.y, b.x, b.y, [0, id])) n++;
  }
  return n;
}

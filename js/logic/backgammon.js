// Backgammon rules and the computer player. Pure module, no DOM.
//
// Board (absolute numbering, shared by both sides):
//   state.pts[1..24]  signed checker count: > 0 the player, < 0 the computer
//   state.bar[side]   checkers waiting on the bar
//   state.off[side]   checkers borne off
// The player moves 24 -> 1 and bears off past 1 (home = 1..6).
// The computer moves 1 -> 24 and bears off past 24 (home = 19..24).
//
// All move generation and evaluation run in a "view" where the side to move always
// goes 24 -> 1. The computer's view is the board mirrored (point i becomes 25 - i and the
// sign flips), so one piece of code serves both sides.

export const P = 'p';
export const C = 'c';
export const BAR = 'bar';
export const OFF = 'off';

export const other = (side) => (side === P ? C : P);

export function newState() {
  const pts = new Array(25).fill(0);
  pts[24] = 2; pts[13] = 5; pts[8] = 3; pts[6] = 5;
  pts[1] = -2; pts[12] = -5; pts[17] = -3; pts[19] = -5;
  return { pts, bar: { p: 0, c: 0 }, off: { p: 0, c: 0 } };
}

export function cloneState(s) {
  return { pts: s.pts.slice(), bar: { ...s.bar }, off: { ...s.off } };
}

export function stateKey(s) {
  return s.pts.join(',') + '|' + s.bar.p + ',' + s.bar.c + '|' + s.off.p + ',' + s.off.c;
}

// Checkers of one side anywhere: on the board, on the bar, borne off. Always 15.
export function checkerTotal(s, side) {
  const sgn = side === P ? 1 : -1;
  let n = s.bar[side] + s.off[side];
  for (let i = 1; i <= 24; i++) if (s.pts[i] * sgn > 0) n += Math.abs(s.pts[i]);
  return n;
}

export function pipCount(s, side) {
  let n = 25 * s.bar[side];
  for (let i = 1; i <= 24; i++) {
    const c = s.pts[i];
    if (side === P && c > 0) n += c * i;
    if (side === C && c < 0) n += -c * (25 - i);
  }
  return n;
}

export function winner(s) {
  if (s.off.p >= 15) return P;
  if (s.off.c >= 15) return C;
  return null;
}

// A gammon: the loser has not borne off a single checker.
export function isGammon(s) {
  const w = winner(s);
  return !!w && s.off[other(w)] === 0;
}

// ---------- Dice ----------
export function rollDice(rand = Math.random) {
  return [1 + Math.floor(rand() * 6), 1 + Math.floor(rand() * 6)];
}

// Doubles give four moves of the same size.
export function diceMoves(dice) {
  return dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : [dice[0], dice[1]];
}

// Each side rolls one die; the higher one starts and plays both dice. Ties roll again.
export function openingRoll(rand = Math.random) {
  for (;;) {
    const pd = 1 + Math.floor(rand() * 6);
    const cd = 1 + Math.floor(rand() * 6);
    if (pd !== cd) return { dice: [pd, cd], p: pd, c: cd, starter: pd > cd ? P : C };
  }
}

// ---------- Mirrored view ----------
// v.a[1..24]: > 0 own checkers, < 0 opponent's. Own checkers move down. Bar entry is "point 25",
// bearing off is "point 0".
function toView(s, side) {
  const a = new Int8Array(26);
  for (let i = 1; i <= 24; i++) a[i] = side === P ? s.pts[i] : -s.pts[25 - i];
  const o = other(side);
  return { a, bar: s.bar[side], obar: s.bar[o], off: s.off[side], ooff: s.off[o] };
}

function vkey(v) {
  return v.a.join() + '|' + v.bar + ',' + v.obar + ',' + v.off + ',' + v.ooff;
}

// One single-die step: [from, to] in view coordinates (from 25 = bar, to 0 = off).
function stepsV(v, die) {
  const out = [];
  if (v.bar > 0) {
    const t = 25 - die;
    if (v.a[t] > -2) out.push([25, t]);
    return out;
  }
  let high = 0;
  for (let i = 24; i >= 1; i--) if (v.a[i] > 0) { high = i; break; }
  const allHome = high <= 6;
  for (let f = high; f >= 1; f--) {
    if (v.a[f] <= 0) continue;
    const t = f - die;
    if (t >= 1) {
      if (v.a[t] > -2) out.push([f, t]);
    } else if (allHome && (t === 0 || f === high)) {
      // Bearing off: an exact die, or a bigger die from the highest occupied point.
      out.push([f, 0]);
    }
  }
  return out;
}

function applyV(v, f, t) {
  if (f === 25) v.bar--; else v.a[f]--;
  if (t === 0) { v.off++; return false; }
  let hit = false;
  if (v.a[t] === -1) { v.a[t] = 0; v.obar++; hit = true; }
  v.a[t]++;
  return hit;
}

function undoV(v, f, t, hit) {
  if (t === 0) v.off--;
  else {
    v.a[t]--;
    if (hit) { v.a[t] = -1; v.obar--; }
  }
  if (f === 25) v.bar++; else v.a[f]++;
}

function absMove(side, st) {
  const [f, t, die, hit] = st;
  return {
    from: f === 25 ? BAR : side === P ? f : 25 - f,
    to: t === 0 ? OFF : side === P ? t : 25 - t,
    die,
    hit,
  };
}

// Most dice that can be played from here (0..rem.length). rem is sorted high to low.
function maxPlayable(v, rem, memo) {
  if (!rem.length) return 0;
  const key = vkey(v) + ':' + rem.join('');
  const known = memo.get(key);
  if (known !== undefined) return known;
  let best = 0;
  for (let k = 0; k < rem.length && best < rem.length; k++) {
    if (k > 0 && rem[k] === rem[k - 1]) continue;
    const next = rem.slice(0, k).concat(rem.slice(k + 1));
    for (const [f, t] of stepsV(v, rem[k])) {
      const hit = applyV(v, f, t);
      const r = 1 + maxPlayable(v, next, memo);
      undoV(v, f, t, hit);
      if (r > best) best = r;
      if (best === rem.length) break;
    }
  }
  memo.set(key, best);
  return best;
}

// If only one of two different dice can be played, it must be the larger one when possible.
// Returns the one die allowed, or 0 when there is no such restriction.
function onlyDie(v, rem, max) {
  if (max !== 1 || rem.length !== 2 || rem[0] === rem[1]) return 0;
  return stepsV(v, rem[0]).length ? rem[0] : rem[1];
}

const byDesc = (x, y) => y - x;

// Number of dice that must be played this turn (the most possible).
export function maxDiceUsable(state, side, dice) {
  const rem = diceMoves(dice).sort(byDesc);
  return maxPlayable(toView(state, side), rem, new Map());
}

// Calls onEnd(view, steps) once for every distinct position reachable by a legal full turn.
// steps are view-coordinates [from, to, die, hit]. The view is only valid during the call.
function walkTurn(state, side, dice, onEnd) {
  const v = toView(state, side);
  const memo = new Map();
  const rem0 = diceMoves(dice).sort(byDesc);
  const max = maxPlayable(v, rem0, memo);
  if (!max) return 0;
  const only = onlyDie(v, rem0, max);
  const ends = new Set();
  const seen = new Set();
  const path = [];
  (function go(rem) {
    if (path.length === max) {
      const key = vkey(v);
      if (!ends.has(key)) { ends.add(key); onEnd(v, path); }
      return;
    }
    // Different move orders reach the same position; explore each (position, dice left) once.
    const sk = vkey(v) + ':' + rem.join('');
    if (seen.has(sk)) return;
    seen.add(sk);
    for (let k = 0; k < rem.length; k++) {
      if (k > 0 && rem[k] === rem[k - 1]) continue;
      if (only && path.length === 0 && rem[k] !== only) continue;
      const next = rem.slice(0, k).concat(rem.slice(k + 1));
      for (const [f, t] of stepsV(v, rem[k])) {
        const hit = applyV(v, f, t);
        if (maxPlayable(v, next, memo) >= max - path.length - 1) {
          path.push([f, t, rem[k], hit]);
          go(next);
          path.pop();
        }
        undoV(v, f, t, hit);
      }
    }
  })(rem0);
  return max;
}

// Every legal full turn as a list of moves { from, to, die, hit }, one per distinct end position.
// from is a point or BAR, to is a point or OFF (absolute numbering). [] means no legal move.
export function legalMoveSequences(state, side, dice) {
  const out = [];
  walkTurn(state, side, dice, (v, path) => out.push(path.map((st) => absMove(side, st))));
  return out;
}

// Single steps the UI may offer now. `remaining` are the dice not used yet and `required`
// is how many more dice this turn must still use (from maxDiceUsable at the start of the turn,
// minus the steps already played). Only steps that can still lead to a legal full turn are returned.
export function singleStepTargets(state, side, remaining, required) {
  if (required <= 0 || !remaining.length) return [];
  const v = toView(state, side);
  const memo = new Map();
  const rem = remaining.slice().sort(byDesc);
  const only = required === 1 ? onlyDie(v, rem, 1) : 0;
  const out = [];
  for (let k = 0; k < rem.length; k++) {
    if (k > 0 && rem[k] === rem[k - 1]) continue;
    if (only && rem[k] !== only) continue;
    const next = rem.slice(0, k).concat(rem.slice(k + 1));
    for (const [f, t] of stepsV(v, rem[k])) {
      const hit = applyV(v, f, t);
      if (maxPlayable(v, next, memo) >= required - 1) out.push(absMove(side, [f, t, rem[k], hit]));
      undoV(v, f, t, hit);
    }
  }
  return out;
}

// Plays one move on the state (in place) and records move.hit.
export function applyMove(state, side, move) {
  const sgn = side === P ? 1 : -1;
  if (move.from === BAR) state.bar[side]--; else state.pts[move.from] -= sgn;
  let hit = false;
  if (move.to === OFF) state.off[side]++;
  else {
    if (state.pts[move.to] === -sgn) { state.pts[move.to] = 0; state.bar[other(side)]++; hit = true; }
    state.pts[move.to] += sgn;
  }
  move.hit = hit;
  return move;
}

export function undoMove(state, side, move) {
  const sgn = side === P ? 1 : -1;
  if (move.to === OFF) state.off[side]--;
  else {
    state.pts[move.to] -= sgn;
    if (move.hit) { state.pts[move.to] = -sgn; state.bar[other(side)]--; }
  }
  if (move.from === BAR) state.bar[side]++; else state.pts[move.from] += sgn;
}

// ---------- Computer player ----------

// Value of owning a point (view numbering: 1..6 home, 5 and 7 are the key points,
// 19..24 are anchors in the opponent's home).
const POINT_VALUE = [0, 2.5, 3.5, 4.5, 5.5, 8, 7, 6, 4.5, 2.5, 2, 2, 2, 2.5, 1.5, 1.5, 1.5, 1.5, 3.5, 5, 6.5, 4.5, 3, 2, 1.5];
const PRIME_VALUE = [0, 0, 1.5, 4, 8, 14, 22];

// Can a checker on j reach i moving up, using exactly these dice (a doubles roll has 4 equal dice)?
function reach(v, j, i, dice) {
  const D = i - j;
  if (D <= 0) return false;
  if (dice.length === 1) return D === dice[0];
  if (dice.length === 2 && dice[0] !== dice[1]) {
    const [x, y] = dice;
    if (D === x || D === y) return true;
    return D === x + y && (v.a[j + x] < 2 || v.a[j + y] < 2);
  }
  const d = dice[0];
  if (D % d) return false;
  const k = D / d;
  if (k > dice.length) return false;
  for (let m = 1; m < k; m++) if (v.a[j + m * d] >= 2) return false;
  return true;
}

// Can the opponent hit a blot on i with this roll? positions: points where it has checkers.
function canHit(v, i, dice, obar, positions) {
  if (obar > 0) {
    // Checkers on the bar must come in first, which uses up dice.
    for (let k = 0; k < dice.length; k++) {
      if (k > 0 && dice[k] === dice[k - 1]) continue;
      const e = dice[k];
      if (v.a[e] >= 2) continue;
      if (e === i) return true;
      const rest = dice.slice(0, k).concat(dice.slice(k + 1));
      if (rest.length && canHit(v, i, rest, obar - 1, positions.concat(e))) return true;
    }
    return false;
  }
  for (const j of positions) if (j < i && reach(v, j, i, dice)) return true;
  return false;
}

function shotsAt(v, i, positions) {
  let n = 0;
  for (let d1 = 1; d1 <= 6; d1++) {
    for (let d2 = 1; d2 <= 6; d2++) {
      const dice = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
      if (canHit(v, i, dice, v.obar, positions)) n++;
    }
  }
  return n;
}

// Score of a position for the side to move in the view (higher is better for that side).
export function evaluateV(v) {
  if (v.off >= 15) return 1e6;
  if (v.ooff >= 15) return -1e6;
  let my = 25 * v.bar;
  let opp = 25 * v.obar;
  let maxMine = v.bar ? 25 : 0;
  let minOpp = v.obar ? 0 : 99;
  const oppPos = [];
  for (let i = 1; i <= 24; i++) {
    const n = v.a[i];
    if (n > 0) { my += n * i; if (i > maxMine) maxMine = i; }
    else if (n < 0) { opp += -n * (25 - i); if (i < minOpp) minOpp = i; oppPos.push(i); }
  }
  let s = opp - my;

  // No contact left: it is a pure race. Bear off efficiently and leave no gaps.
  if (minOpp >= maxMine) {
    s -= (15 - v.off) * 0.4;
    for (let i = 1; i < Math.min(6, maxMine); i++) if (v.a[i] === 0) s -= 0.35;
    return s;
  }

  let oppHomeMade = 0;
  for (let i = 19; i <= 24; i++) if (v.a[i] <= -2) oppHomeMade++;
  let myHomeMade = 0;
  for (let i = 1; i <= 6; i++) if (v.a[i] >= 2) myHomeMade++;

  let run = 0;
  let builders = 0;
  for (let i = 1; i <= 25; i++) {
    const n = i <= 24 ? v.a[i] : 0;
    if (n >= 2) {
      s += POINT_VALUE[i];
      if (n > 3) s -= (n - 3) * 1.2;
      run++;
    } else {
      if (n === 1) {
        // A blot: cost = chance it is hit * what that costs (pips lost, tempo, danger of a strong board).
        const p = shotsAt(v, i, oppPos) / 36;
        if (p > 0) s -= p * ((25 - i) + 8 + 2 * oppHomeMade + (i <= 6 ? 6 : 0));
        if (i >= 7 && i <= 12) builders++;
      }
      // A prime only matters if an opposing checker is still behind it.
      if (run >= 2 && minOpp < i - run) s += PRIME_VALUE[Math.min(run, 6)];
      run = 0;
    }
  }
  s += builders * 0.4;

  if (v.bar) s -= 6 * v.bar;
  if (v.obar) s += v.obar * (10 + 2.5 * myHomeMade) + (myHomeMade === 6 ? 8 : 0);
  return s;
}

export function evaluate(state, side) {
  return evaluateV(toView(state, side));
}

// Best full turn for `side` with these dice: a list of moves (possibly empty).
export function chooseMove(state, side, dice) {
  let best = null;
  let bestScore = -Infinity;
  walkTurn(state, side, dice, (v, path) => {
    const score = evaluateV(v);
    if (score > bestScore) { bestScore = score; best = path.map((st) => st.slice()); }
  });
  return best ? best.map((st) => absMove(side, st)) : [];
}

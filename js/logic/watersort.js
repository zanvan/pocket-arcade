// Water Sort rules, level generator and solver. A tube is an array of color ids, bottom first.
import { rng, shuffle } from './rng.js';

export const CAP = 4;

export function topRun(tube) {
  if (!tube.length) return 0;
  const c = tube[tube.length - 1];
  let n = 0;
  for (let i = tube.length - 1; i >= 0 && tube[i] === c; i--) n++;
  return n;
}

export function canPour(tubes, from, to) {
  if (from === to) return false;
  const a = tubes[from], b = tubes[to];
  if (!a.length || b.length >= CAP) return false;
  return !b.length || b[b.length - 1] === a[a.length - 1];
}

// How many units a pour moves: the whole top run, or as much as fits.
export function pourAmount(tubes, from, to) {
  if (!canPour(tubes, from, to)) return 0;
  return Math.min(topRun(tubes[from]), CAP - tubes[to].length);
}

export function pour(tubes, from, to) {
  const n = pourAmount(tubes, from, to);
  if (!n) return null;
  const next = tubes.map((t) => t.slice());
  for (let i = 0; i < n; i++) next[to].push(next[from].pop());
  return next;
}

export function isComplete(tube) {
  return tube.length === CAP && tube.every((c) => c === tube[0]);
}

export function isSolved(tubes) {
  return tubes.every((t) => t.length === 0 || isComplete(t));
}

function key(tubes) {
  return tubes.map((t) => String.fromCharCode(...t.map((c) => 97 + c))).sort().join('|');
}

// Depth-first search with memory of seen positions. Returns a list of [from, to]
// moves, [] if already solved, or null if no solution was found within the limit.
export function solve(tubes, limit = 150000) {
  if (isSolved(tubes)) return [];
  const seen = new Set([key(tubes)]);
  // The stack is the current path: each frame remembers the move that reached it.
  const stack = [{ tubes, moves: movesFrom(tubes), move: null }];
  let nodes = 0;
  while (stack.length) {
    const top = stack[stack.length - 1];
    if (!top.moves.length) { stack.pop(); continue; }
    const [f, t] = top.moves.pop();
    const next = pour(top.tubes, f, t);
    const k = key(next);
    if (seen.has(k)) continue;
    seen.add(k);
    if (++nodes > limit) return null;
    stack.push({ tubes: next, moves: movesFrom(next), move: [f, t] });
    if (isSolved(next)) return stack.slice(1).map((fr) => fr.move);
  }
  return null;
}

// Useful moves only, best first (they are popped from the end, so sorted ascending).
function movesFrom(tubes) {
  const out = [];
  for (let f = 0; f < tubes.length; f++) {
    const a = tubes[f];
    if (!a.length || isComplete(a)) continue;
    const uniform = topRun(a) === a.length;
    let emptyTried = false;
    for (let t = 0; t < tubes.length; t++) {
      if (!canPour(tubes, f, t)) continue;
      const b = tubes[t];
      if (!b.length) {
        if (uniform || emptyTried) continue; // moving a one-color tube into an empty one is pointless
        emptyTried = true;
        out.push([f, t, 0]);
      } else {
        const fillsUp = topRun(a) <= CAP - b.length ? 2 : 1;
        out.push([f, t, fillsUp + (topRun(b) === b.length ? 1 : 0)]);
      }
    }
  }
  out.sort((x, y) => x[2] - y[2]);
  return out.map(([f, t]) => [f, t]);
}

export function levelSpec(level) {
  const colors = Math.min(12, 3 + Math.floor((level - 1) / 2));
  return { colors, empty: 2 };
}

// Deterministic per level; keeps dealing until the solver confirms it can be solved.
export function generate(level) {
  const { colors, empty } = levelSpec(level);
  const rand = rng(level * 2654435761 + 99);
  for (let attempt = 0; attempt < 200; attempt++) {
    const units = [];
    for (let c = 0; c < colors; c++) for (let i = 0; i < CAP; i++) units.push(c);
    shuffle(units, rand);
    const tubes = [];
    for (let i = 0; i < colors; i++) tubes.push(units.slice(i * CAP, i * CAP + CAP));
    for (let i = 0; i < empty; i++) tubes.push([]);
    if (tubes.some(isComplete)) continue;
    if (tubes.some((t) => t.length && topRun(t) >= 3)) continue; // keep starts from looking half-done
    if (solve(tubes, 60000)) return tubes;
  }
  throw new Error('no solvable deal for level ' + level);
}

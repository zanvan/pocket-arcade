// Connect Dots generator. Builds one path that visits every cell, scrambles it
// with "backbite" moves, then cuts it into pieces. Each piece's two ends become
// a pair of dots, so every puzzle has at least one full-board solution.
import { rng, randInt } from './rng.js';

export function levelSpec(level) {
  const size = level <= 3 ? 5 : level <= 8 ? 6 : level <= 14 ? 7 : level <= 22 ? 8 : 9;
  const colors = size === 5 ? 5 : size === 6 ? 6 : size === 7 ? 7 : size === 8 ? 8 : 9;
  return { size, colors };
}

function serpentine(n) {
  const path = [];
  for (let y = 0; y < n; y++) {
    for (let i = 0; i < n; i++) path.push([y % 2 ? n - 1 - i : i, y]);
  }
  return path;
}

const adjacent = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;

function backbite(path, n, rand) {
  if (rand() < 0.5) path.reverse(); // work on either end
  const [ex, ey] = path[0];
  const nbrs = [[ex + 1, ey], [ex - 1, ey], [ex, ey + 1], [ex, ey - 1]]
    .filter(([x, y]) => x >= 0 && y >= 0 && x < n && y < n);
  const [nx, ny] = nbrs[randInt(rand, nbrs.length)];
  const i = path.findIndex(([x, y]) => x === nx && y === ny);
  if (i > 1) {
    // path[0] touches path[i]: reversing the stretch before i keeps it one unbroken path
    const head = path.slice(0, i).reverse();
    path.splice(0, i, ...head);
  }
}

export function generate(level) {
  const { size: n, colors } = levelSpec(level);
  const rand = rng(level * 40503 + 7);
  for (let attempt = 0; attempt < 400; attempt++) {
    const path = serpentine(n);
    const moves = n * n * 25;
    for (let i = 0; i < moves; i++) backbite(path, n, rand);

    // segment lengths: at least 3 each, the rest spread unevenly
    const total = n * n;
    const lens = Array(colors).fill(3);
    let rest = total - 3 * colors;
    const weights = lens.map(() => 0.3 + rand() * rand() * 2);
    const sum = weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < colors; i++) {
      const add = Math.floor((rest * weights[i]) / sum);
      lens[i] += add;
    }
    let left = total - lens.reduce((a, b) => a + b, 0);
    while (left-- > 0) lens[randInt(rand, colors)]++;

    const segments = [];
    let at = 0;
    for (const len of lens) { segments.push(path.slice(at, at + len)); at += len; }

    // reject pieces whose two ends touch: those make dull, ambiguous pairs
    if (segments.some((seg) => adjacent(seg[0], seg[seg.length - 1]))) continue;
    // reject pieces that are a plain straight line (too obvious)
    if (segments.some((seg) => seg.every(([x]) => x === seg[0][0]) || seg.every(([, y]) => y === seg[0][1]))) {
      if (rand() < 0.7) continue;
    }

    const dots = segments.map((seg) => [seg[0], seg[seg.length - 1]]);
    return { size: n, dots, solution: segments };
  }
  throw new Error('could not build level ' + level);
}

// Checks a finished board: every pair joined by a path of its own color, and every cell used.
export function isSolved(size, dots, paths) {
  const used = new Set();
  for (let c = 0; c < dots.length; c++) {
    const p = paths[c];
    if (!p || p.length < 2) return false;
    const [a, b] = dots[c];
    const first = p[0], last = p[p.length - 1];
    const joins = (first[0] === a[0] && first[1] === a[1] && last[0] === b[0] && last[1] === b[1])
      || (first[0] === b[0] && first[1] === b[1] && last[0] === a[0] && last[1] === a[1]);
    if (!joins) return false;
    for (let i = 0; i < p.length; i++) {
      if (i && !adjacent(p[i - 1], p[i])) return false;
      const k = p[i][1] * size + p[i][0];
      if (used.has(k)) return false;
      used.add(k);
    }
  }
  return used.size === size * size;
}

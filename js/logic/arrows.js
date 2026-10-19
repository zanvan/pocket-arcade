// Arrows puzzle: each arrow is a bent line of cells ending in a head. Tapped, it
// slides forward out of the grid, unless another arrow is in the way of its head.
//
// Levels are built backwards: each new arrow's exit lane must be free of every
// arrow already placed. Removing arrows in reverse placement order always
// works, so every level is solvable.
import { rng, randInt, shuffle, DIRS } from './rng.js';

export function levelSpec(level) {
  const w = Math.min(4 + Math.floor((level - 1) / 3), 9);
  const h = Math.min(w + 1 + Math.floor(level / 8), 12);
  const maxLen = Math.min(2 + Math.floor((level + 1) / 3), 7);
  return { w, h, maxLen };
}

// Cells from just past the head to the edge, in travel order.
export function lane(w, h, head, dir) {
  const [dx, dy] = DIRS[dir];
  const out = [];
  let x = head[0] + dx, y = head[1] + dy;
  while (x >= 0 && y >= 0 && x < w && y < h) {
    out.push([x, y]);
    x += dx; y += dy;
  }
  return out;
}

export function generate(level) {
  const { w, h, maxLen } = levelSpec(level);
  const rand = rng(level * 104729 + 3);
  const occ = new Int16Array(w * h).fill(-1);
  const arrows = [];
  const free = (x, y) => x >= 0 && y >= 0 && x < w && y < h && occ[y * w + x] < 0;

  for (let pass = 0; pass < 3; pass++) {
    const cells = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) cells.push([x, y]);
    shuffle(cells, rand);
    for (const head of cells) {
      if (!free(head[0], head[1])) continue;
      for (const dir of shuffle([0, 1, 2, 3], rand)) {
        const [dx, dy] = DIRS[dir];
        const neck = [head[0] - dx, head[1] - dy];
        if (!free(neck[0], neck[1])) continue;
        const ln = lane(w, h, head, dir);
        if (ln.some(([x, y]) => occ[y * w + x] >= 0)) continue;
        const laneSet = new Set(ln.map(([x, y]) => y * w + x));
        // grow the tail backwards from the neck with a short random walk
        const body = [neck, head];
        const used = new Set([neck[1] * w + neck[0], head[1] * w + head[0]]);
        const target = 2 + randInt(rand, maxLen - 1);
        while (body.length < target) {
          const [tx, ty] = body[0];
          const opts = shuffle(DIRS.map(([ax, ay]) => [tx + ax, ty + ay]), rand)
            .filter(([x, y]) => free(x, y) && !used.has(y * w + x) && !laneSet.has(y * w + x));
          if (!opts.length) break;
          // prefer going straight a little more often than turning
          const prev = body[1];
          const straight = [2 * tx - prev[0], 2 * ty - prev[1]];
          const pick = opts.find((o) => o[0] === straight[0] && o[1] === straight[1] && rand() < 0.5) || opts[0];
          body.unshift(pick);
          used.add(pick[1] * w + pick[0]);
        }
        const id = arrows.length;
        for (const [x, y] of body) occ[y * w + x] = id;
        arrows.push({ id, cells: body, dir });
        break;
      }
    }
  }
  // Ids follow placement order; the reverse of that order clears the board.
  return { w, h, arrows };
}

// Index along the lane of the first blocking cell, or -1 if the lane is clear.
export function firstBlock(w, h, arrows, alive, a) {
  const head = a.cells[a.cells.length - 1];
  const occ = new Map();
  for (const b of arrows) {
    if (!alive.has(b.id) || b.id === a.id) continue;
    for (const [x, y] of b.cells) occ.set(y * w + x, b.id);
  }
  const ln = lane(w, h, head, a.dir);
  for (let i = 0; i < ln.length; i++) {
    const [x, y] = ln[i];
    if (occ.has(y * w + x)) return { index: i, by: occ.get(y * w + x) };
  }
  return null;
}

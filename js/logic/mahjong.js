// Mahjong solitaire rules, board shapes and a generator that always makes a solvable deal.
//
// Positions use a half-tile grid: a tile covers 2x2 half cells, so a tile on an upper
// layer can sit half a tile off the layer below. A tile is { id, x, y, z, face }.
import { rng, shuffle as shuffleArray } from './rng.js';

export const MAX_W = 16;   // half cells: 8 tiles wide
export const MAX_H = 20;   // half cells: 10 tiles tall

// ---------- Faces ----------
// 0-8 dots, 9-17 bamboo, 18-26 characters, 27-30 winds, 31-33 dragons,
// 34-37 flowers (all match each other), 38-41 seasons (all match each other).
export const FACE_COUNT = 42;
const FLOWER = 34;
const SEASON = 35;       // group ids; the groups 0-33 are the classic faces themselves
const GROUPS = 36;

export function groupOf(face) {
  return face < 34 ? face : face < 38 ? FLOWER : SEASON;
}

export function describe(face) {
  if (face < 9) return { suit: 'dot', n: face + 1 };
  if (face < 18) return { suit: 'bamboo', n: face - 8 };
  if (face < 27) return { suit: 'char', n: face - 17 };
  if (face < 31) return { suit: 'wind', n: face - 26 };      // 1 east, 2 south, 3 west, 4 north
  if (face < 34) return { suit: 'dragon', n: face - 30 };    // 1 red, 2 green, 3 white
  if (face < 38) return { suit: 'flower', n: face - 33 };
  return { suit: 'season', n: face - 37 };
}

export function facesMatch(a, b) {
  return groupOf(a) === groupOf(b);
}

// Two different tiles match when their faces match.
export function matchable(a, b) {
  return a !== b && a.id !== b.id && facesMatch(a.face, b.face);
}

// ---------- Board shapes ----------
// Each layer is rows of '#' (a tile) and '.' (nothing), in whole tiles. dx/dy shift the layer
// by half cells so upper layers can straddle the tiles below. A row starting with '>' is
// pushed half a tile to the right. A layer sits on the one before it unless it names its own z.
const box = (cols, rows) => Array.from({ length: rows }, () => '#'.repeat(cols));

const SHAPES = [
  { name: 'mound', layers: [
    { dx: 0, dy: 0, rows: ['.####.', '######', '######', '.####.'] },
    { dx: 2, dy: 2, rows: ['####'] },
  ] },
  { name: 'pyramid', layers: [
    { dx: 0, dy: 0, rows: box(5, 4) },
    { dx: 1, dy: 1, rows: box(4, 2) },
    { dx: 2, dy: 2, rows: ['##'] },
  ] },
  { name: 'diamond', layers: [
    { dx: 0, dy: 0, rows: ['..##..', '.####.', '######', '######', '.####.', '..##..'] },
    { dx: 2, dy: 2, rows: ['####', '####'] },
    { dx: 4, dy: 4, rows: ['##'] },
  ] },
  { name: 'cross', layers: [
    { dx: 0, dy: 0, rows: ['...##...', '...##...', '########', '########', '...##...', '...##...'] },
    { dx: 4, dy: 4, rows: ['####', '####'] },
    { dx: 6, dy: 5, rows: ['##'] },
    { z: 1, dx: 6, dy: 0, rows: ['##'] },
    { z: 1, dx: 6, dy: 10, rows: ['##'] },
  ] },
  { name: 'arch', layers: [
    { dx: 0, dy: 0, rows: ['.######.', '##....##', '##....##', '##....##', '##....##', '########'] },
    { dx: 3, dy: 0, rows: ['#####'] },
    { z: 1, dx: 3, dy: 10, rows: ['#####'] },
  ] },
  { name: 'ring', layers: [
    { dx: 0, dy: 0, rows: ['######', '######', '##..##', '##..##', '##..##', '##..##', '######', '######'] },
    { dx: 2, dy: 0, rows: ['####'] },
    { z: 1, dx: 2, dy: 14, rows: ['####'] },
  ] },
  { name: 'tower', layers: [
    { dx: 0, dy: 0, rows: box(5, 10) },
    { dx: 2, dy: 6, rows: box(2, 2) },
  ] },
  { name: 'butterfly', layers: [
    { dx: 0, dy: 0, rows: ['##....##', '###..###', '########', '###..###', '###..###', '########', '###..###', '##....##'] },
    { dx: 1, dy: 3, rows: ['##...##', '##...##'] },
    { z: 1, dx: 1, dy: 9, rows: ['##...##', '##...##'] },
  ] },
  { name: 'hourglass', layers: [
    { dx: 0, dy: 0, rows: ['########', '.######.', '..####..', '...##...', '...##...', '..####..', '.######.', '########'] },
    { dx: 1, dy: 0, rows: ['#######'] },
    { z: 1, dx: 1, dy: 14, rows: ['#######'] },
    { z: 2, dx: 3, dy: 1, rows: ['#####'] },
    { z: 2, dx: 3, dy: 13, rows: ['#####'] },
  ] },
  { name: 'turtle', layers: [
    { dx: 0, dy: 0, rows: ['.######.', '########', '########', '########', '########', '########', '.######.'] },
    { dx: 2, dy: 2, rows: box(6, 4) },
    { dx: 4, dy: 4, rows: box(4, 2) },
    { dx: 6, dy: 5, rows: ['##'] },
  ] },
  { name: 'fortress', layers: [
    { dx: 0, dy: 0, rows: ['########', '########', '##....##', '##.##.##', '##.##.##', '##....##', '########', '########'] },
    { dx: 0, dy: 0, rows: ['##....##', '##....##', '........', '...##...', '...##...', '........', '##....##', '##....##'] },
    { dx: 0, dy: 0, rows: ['#......#', '........', '........', '...##...', '........', '........', '........', '#......#'] },
  ] },
  { name: 'terrace', layers: [
    { dx: 0, dy: 0, rows: box(8, 7) },
    { dx: 1, dy: 1, rows: box(7, 6) },
  ] },
  { name: 'ziggurat', layers: [
    { dx: 0, dy: 0, rows: box(8, 8) },
    { dx: 2, dy: 2, rows: box(6, 6) },
    { dx: 4, dy: 4, rows: box(4, 4) },
    { dx: 6, dy: 6, rows: box(2, 2) },
  ] },
  { name: 'wings', layers: [
    { dx: 0, dy: 0, rows: ['##....##', '###..###', '########', '########', '########', '########', '###..###', '##....##'] },
    { dx: 1, dy: 1, rows: ['##...##', '#######', '#######', '#######', '#######', '##...##'] },
    { dx: 2, dy: 4, rows: ['##..##', '##..##'] },
  ] },
  { name: 'citadel', layers: [
    { dx: 0, dy: 0, rows: box(8, 9) },
    { dx: 1, dy: 1, rows: box(7, 7) },
    { dx: 3, dy: 3, rows: box(4, 4) },
  ] },
  { name: 'grand pyramid', layers: [
    { dx: 0, dy: 0, rows: box(8, 9) },
    { dx: 1, dy: 1, rows: box(7, 8) },
    { dx: 3, dy: 5, rows: box(4, 4) },
  ] },
];

// Turns a shape into positions. Odd counts lose the topmost tile, so pairs always work.
function build(shape) {
  const out = [];
  shape.layers.forEach((layer, i) => {
    const z = layer.z ?? i;
    layer.rows.forEach((row, r) => {
      const shift = row[0] === '>' ? 1 : 0;
      const cells = shift ? row.slice(1) : row;
      for (let c = 0; c < cells.length; c++) {
        if (cells[c] === '#') out.push({ x: layer.dx + shift + c * 2, y: layer.dy + r * 2, z });
      }
    });
  });
  if (out.length % 2) out.pop();
  return out;
}

const BUILT = SHAPES.map((s) => ({ name: s.name, tiles: build(s) })).sort((a, b) => a.tiles.length - b.tiles.length);

export const SHAPE_COUNT = BUILT.length;

// The boards grow from the smallest to the biggest over the first 30 levels. After that the
// biggest few repeat, every other round mirrored so they look different.
const RAMP = 30;
const BIG = 6;

export function shapeFor(level) {
  const n = Math.max(1, Math.floor(level));
  if (n <= RAMP) return { index: Math.min(SHAPE_COUNT - 1, Math.floor(((n - 1) * SHAPE_COUNT) / RAMP)), mirror: false };
  const k = n - RAMP - 1;
  return { index: SHAPE_COUNT - BIG + (k % BIG), mirror: Math.floor(k / BIG) % 2 === 1 };
}

export function shapeName(level) {
  return BUILT[shapeFor(level).index].name;
}

// Positions only: [{ id, x, y, z }], sorted by layer then row then column.
export function layout(level) {
  const { index, mirror } = shapeFor(level);
  const base = BUILT[index].tiles;
  const maxX = Math.max(...base.map((p) => p.x));
  const minX = Math.min(...base.map((p) => p.x));
  const minY = Math.min(...base.map((p) => p.y));
  return base
    .map((p) => ({
      x: mirror ? maxX - p.x : p.x - minX,
      y: p.y - minY,
      z: p.z,
    }))
    .sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x)
    .map((p, id) => ({ id, ...p }));
}

// ---------- Rules ----------
const overlaps = (a, b) => Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2;

// True when a tile on a higher layer sits over this one.
export function isCovered(tile, tiles) {
  for (const o of tiles) if (o.z > tile.z && overlaps(o, tile)) return true;
  return false;
}

function sideBlocked(tile, tiles, dir) {
  for (const o of tiles) {
    if (o.z === tile.z && o.x === tile.x + 2 * dir && Math.abs(o.y - tile.y) < 2) return true;
  }
  return false;
}

// Free: nothing on top, and the left or the right side is open. `tiles` are the tiles still
// on the board (the tile itself may be in the list).
export function isFree(tile, tiles) {
  if (isCovered(tile, tiles)) return false;
  return !sideBlocked(tile, tiles, -1) || !sideBlocked(tile, tiles, 1);
}

export function freeTiles(tiles) {
  return tiles.filter((t) => isFree(t, tiles));
}

// A matching pair of free tiles to show as a hint, or null.
export function findPair(tiles) {
  const free = freeTiles(tiles);
  for (let i = 0; i < free.length; i++) {
    for (let j = i + 1; j < free.length; j++) {
      if (matchable(free[i], free[j])) return [free[i], free[j]];
    }
  }
  return null;
}

export function anyMoves(tiles) {
  return findPair(tiles) !== null;
}

// ---------- Solvable deals, built backwards ----------
// Precomputes who covers and who touches whom, so a full deal needs no repeated scans.
function neighbours(pos) {
  const n = pos.length;
  const above = Array.from({ length: n }, () => []);
  const left = Array.from({ length: n }, () => []);
  const right = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const a = pos[i], b = pos[j];
      if (b.z > a.z && overlaps(a, b)) above[i].push(j);
      else if (b.z === a.z && Math.abs(a.y - b.y) < 2) {
        if (b.x === a.x - 2) left[i].push(j);
        else if (b.x === a.x + 2) right[i].push(j);
      }
    }
  }
  return { above, left, right };
}

// Takes pairs of free positions off the board, one pair at a time, until none are left.
// Put matching faces on each pair and this order is a valid way to clear the board.
// Returns [[i, j], ...] (indexes into pos) or null on a dead end.
function peel(pos, nb, rand) {
  const n = pos.length;
  const alive = new Uint8Array(n).fill(1);
  const dead = (j) => !alive[j];
  const order = [];
  for (let left = n; left > 0; left -= 2) {
    const free = [];
    for (let i = 0; i < n; i++) {
      if (alive[i] && nb.above[i].every(dead) && (nb.left[i].every(dead) || nb.right[i].every(dead))) free.push(i);
    }
    if (free.length < 2) return null;
    const a = free.splice(Math.floor(rand() * free.length), 1)[0];
    const b = free[Math.floor(rand() * free.length)];
    alive[a] = alive[b] = 0;
    order.push([a, b]);
  }
  return order;
}

function peelRetry(pos, rand, attempts = 400) {
  const nb = neighbours(pos);
  for (let k = 0; k < attempts; k++) {
    const order = peel(pos, nb, rand);
    if (order) return order;
  }
  return null;
}

// Which kinds of tile a board of n tiles uses. Each kind has 2 or 4 tiles; harder levels
// use more kinds with fewer copies each. Returns one group id per pair.
function pairPool(pairs, level, rand) {
  const lo = Math.ceil(pairs / 2);
  const f = Math.min(0.9, 0.25 + level * 0.025);
  const kinds = Math.min(GROUPS, lo + Math.floor((pairs - lo) * f));
  const groups = shuffleArray(Array.from({ length: GROUPS }, (_, i) => i), rand).slice(0, kinds);
  const doubles = pairs - kinds;          // kinds that get 4 tiles
  const pool = [];
  groups.forEach((g, i) => {
    pool.push(g);
    if (i < doubles) pool.push(g);
  });
  return shuffleArray(pool, rand);
}

// The two faces for one pair of a group. Flowers and seasons take different pictures.
function faceCursor(rand) {
  const decks = { [FLOWER]: [], [SEASON]: [] };
  return (g) => {
    if (g < FLOWER) return g;
    if (!decks[g].length) decks[g] = shuffleArray([0, 1, 2, 3], rand);
    return (g === FLOWER ? 34 : 38) + decks[g].pop();
  };
}

// Level N is the same board on every phone. Returns { tiles, solution } where solution is
// a list of [idA, idB] that clears the board, each pair free and matching when taken.
export function generate(level) {
  const pos = layout(level);
  const rand = rng(Math.imul(level, 2654435761) + 4242);
  const order = peelRetry(pos, rand);
  if (!order) throw new Error('no solvable mahjong deal for level ' + level);
  const pool = pairPool(order.length, level, rand);
  const next = faceCursor(rand);
  const tiles = pos.map((p) => ({ ...p, face: -1 }));
  // Each pair was free when peeled off the full board, so the peel order is a way to win.
  order.forEach(([a, b], k) => {
    const g = pool[k];
    tiles[a].face = next(g);
    tiles[b].face = next(g);
  });
  const solution = order.map(([a, b]) => [pos[a].id, pos[b].id]);
  return { tiles, solution };
}

// Deals the faces still on the board again, so the position can be cleared. The same
// faces come back, just in other places. Returns new tile objects or null if these
// positions cannot be cleared by any deal (for example one tile resting on another).
export function shuffle(remaining, rand = Math.random) {
  if (!remaining.length) return [];
  const pos = remaining.map((t) => ({ x: t.x, y: t.y, z: t.z }));
  const order = peelRetry(pos, rand, 300);
  if (!order) return null;
  // Pair the faces up: every kind has an even count, since pairs are removed in twos.
  const byGroup = new Map();
  for (const t of remaining) {
    const g = groupOf(t.face);
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(t.face);
  }
  const pairs = [];
  for (const faces of byGroup.values()) {
    shuffleArray(faces, rand);
    for (let i = 0; i + 1 < faces.length; i += 2) pairs.push([faces[i], faces[i + 1]]);
  }
  shuffleArray(pairs, rand);
  const out = remaining.map((t) => ({ ...t }));
  order.forEach(([a, b], k) => {
    out[a].face = pairs[k][0];
    out[b].face = pairs[k][1];
  });
  return out;
}

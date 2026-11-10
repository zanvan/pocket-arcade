// Car Jam: tap a car to drive it out of the lot into a pickup bay. Passengers wait
// in one queue; the front passenger boards the first parked car of their color.
// Full cars leave. If every bay holds a car nobody at the front wants, you're stuck.
//
// Levels are built backwards, like Arrows, so some exit order always works.
// The queue is then built from that order with at most `open` cars' groups
// mixed at a time, never more than there are bays, so the planned order wins.
import { rng, randInt, shuffle, DIRS } from './rng.js';
import { lane } from './arrows.js';

export const CAPACITY = { 2: 4, 3: 6 };

export function levelSpec(level) {
  const w = Math.min(5 + Math.floor((level + 1) / 4), 8);
  const h = Math.min(w + 1, 9);
  const colors = Math.min(3 + Math.floor((level - 1) / 2), 7);
  const open = level <= 2 ? 1 : level <= 6 ? 2 : 3;
  const bays = level <= 10 ? 5 : 4;
  const busChance = level <= 2 ? 0 : 0.25;
  return { w, h, colors, open, bays, busChance };
}

export function generate(level) {
  const spec = levelSpec(level);
  const { w, h, colors, open, bays, busChance } = spec;
  const rand = rng(level * 7919 + 11);
  const occ = new Int16Array(w * h).fill(-1);
  const cars = [];
  const free = (x, y) => x >= 0 && y >= 0 && x < w && y < h && occ[y * w + x] < 0;

  for (let pass = 0; pass < 3; pass++) {
    const cells = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) cells.push([x, y]);
    shuffle(cells, rand);
    for (const front of cells) {
      if (!free(front[0], front[1])) continue;
      for (const dir of shuffle([0, 1, 2, 3], rand)) {
        const len = rand() < busChance ? 3 : 2;
        const [dx, dy] = DIRS[dir];
        const body = [];
        for (let i = len - 1; i >= 0; i--) body.push([front[0] - dx * i, front[1] - dy * i]);
        if (!body.every(([x, y]) => free(x, y))) continue;
        if (lane(w, h, front, dir).some(([x, y]) => occ[y * w + x] >= 0)) continue;
        const id = cars.length;
        for (const [x, y] of body) occ[y * w + x] = id;
        cars.push({ id, cells: body, dir, len, color: 0 });
        break;
      }
    }
  }

  // Planned exit order: reverse of placement.
  const order = cars.map((c) => c.id).reverse();
  // Colors: shuffled round-robin so every color appears and counts stay even.
  const palette = shuffle([...Array(colors).keys()], rand);
  shuffle(order.slice(), rand).forEach((id, i) => { cars[id].color = palette[i % colors]; });

  // Passenger queue: groups start in planned order; at most `open` groups are mixed.
  const queue = [];
  const active = []; // { color, left }
  let next = 0;
  while (next < order.length || active.length) {
    const canOpen = next < order.length && active.length < Math.min(open, bays);
    if (canOpen && (!active.length || rand() < 0.35)) {
      const car = cars[order[next++]];
      active.push({ color: car.color, left: CAPACITY[car.len] });
      continue;
    }
    const g = active[randInt(rand, active.length)];
    queue.push(g.color);
    if (--g.left === 0) active.splice(active.indexOf(g), 1);
  }
  return { ...spec, cars, queue, order };
}

// Pure game state, shared by the screen and the tests.
export class CarJam {
  constructor(puzzle) {
    this.p = puzzle;
    this.inLot = new Set(puzzle.cars.map((c) => c.id));
    this.bays = Array(puzzle.bays).fill(null); // { id, color, seats, filled, arrived }
    this.queue = puzzle.queue.slice();
    this.boarded = 0;
    this.clock = 0;
  }

  blocked(id) {
    const car = this.p.cars[id];
    const front = car.cells[car.cells.length - 1];
    const ln = lane(this.p.w, this.p.h, front, car.dir);
    for (let i = 0; i < ln.length; i++) {
      const [x, y] = ln[i];
      for (const other of this.inLot) {
        if (other !== id && this.p.cars[other].cells.some((c) => c[0] === x && c[1] === y)) return { index: i, by: other };
      }
    }
    return null;
  }

  freeBay() { return this.bays.indexOf(null); }

  // Takes a car out to a bay. Returns the bay index, or a reason it can't go.
  dispatch(id) {
    if (!this.inLot.has(id)) return { error: 'gone' };
    const b = this.blocked(id);
    if (b) return { error: 'blocked', ...b };
    const bay = this.freeBay();
    if (bay < 0) return { error: 'full' };
    const car = this.p.cars[id];
    this.inLot.delete(id);
    this.bays[bay] = { id, color: car.color, seats: CAPACITY[car.len], filled: 0, arrived: false, order: ++this.clock };
    return { bay };
  }

  arrive(bay) { if (this.bays[bay]) this.bays[bay].arrived = true; }

  // Where the front passenger would go: earliest-parked matching car with room.
  boardTarget() {
    if (!this.queue.length) return -1;
    const color = this.queue[0];
    let best = -1;
    this.bays.forEach((b, i) => {
      if (b && b.arrived && b.color === color && b.filled < b.seats && (best < 0 || b.order < this.bays[best].order)) best = i;
    });
    return best;
  }

  board() {
    const i = this.boardTarget();
    if (i < 0) return -1;
    this.queue.shift();
    this.bays[i].filled++;
    this.boarded++;
    return i;
  }

  depart(bay) { this.bays[bay] = null; }

  isFull(bay) { const b = this.bays[bay]; return !!b && b.filled >= b.seats; }

  // Stuck: every bay has a parked, not-full car and none suits the front passenger.
  isStuck() {
    if (!this.queue.length) return false;
    if (this.bays.some((b) => !b || !b.arrived || b.filled >= b.seats)) return false;
    return this.boardTarget() < 0;
  }

  isWon() { return !this.queue.length && !this.inLot.size && this.bays.every((b) => !b); }
}

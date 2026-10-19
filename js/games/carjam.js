import { generate, CarJam } from '../logic/carjam.js';
import { DIRS } from '../logic/rng.js';
import { t, addHebrew } from '../core/i18n.js';
import he from '../i18n/he/carjam.js';
import { el, surface, loop, rrect, shade, levelBar, ICONS, ease } from '../core/ui.js';

addHebrew(he);

const COLORS = ['#ff4d4f', '#3b82f6', '#facc15', '#22c55e', '#a855f7', '#fb923c', '#f472b6'];
const BAY_SCALE = 0.7;
const BOARD_GAP = 0.1;     // seconds between passengers
const WALK = 0.26;         // seconds for a passenger to reach a car

export default {
  id: 'carjam',
  get title() { return t('Car Jam'); },
  icon: `<svg viewBox="0 0 64 64"><rect x="6" y="6" width="52" height="52" rx="14" fill="#232a44"/>
    <rect x="12" y="30" width="12" height="22" rx="4" fill="#ff4d4f"/><rect x="14" y="33" width="8" height="4" rx="1.5" fill="#cfe8ff"/>
    <rect x="28" y="12" width="24" height="12" rx="4" fill="#3b82f6"/><rect x="45" y="14" width="4" height="8" rx="1.5" fill="#cfe8ff"/>
    <rect x="32" y="32" width="12" height="20" rx="4" fill="#facc15"/><rect x="34" y="35" width="8" height="4" rx="1.5" fill="#cfe8ff"/>
    <circle cx="14" cy="16" r="3" fill="#ff4d4f"/><rect x="11" y="19" width="6" height="6" rx="2" fill="#ff4d4f"/></svg>`,
  info: (store) => t('Level {n}', { n: store.get('carjam.level', 1) }),
  get help() {
    return t(`<ul><li><b>Tap a car</b> to drive it out. It needs a clear road ahead.</li>
    <li>It parks in a <b>pickup bay</b>. Passengers at the front of the line board cars of <b>their color</b>.</li>
    <li>Full cars leave. If every bay fills with cars nobody wants, you're stuck.</li>
    <li>Plan ahead: send out the colors the line needs next.</li></ul>`);
  },

  mount(root, app) {
    let level = app.store.get('carjam.level', 1);
    let maxLevel = Math.max(level, app.store.get('carjam.max', 1));
    let puzzle, game, cars, walkers, boardTimer, queueShift, ended, bayFlash;
    let destroyed = false;

    const bar = levelBar(root, {
      onPrev: () => { if (level > 1) loadLevel(level - 1); },
      onNext: () => { if (level < maxLevel) loadLevel(level + 1); },
    });
    const stage = el('div', 'stage');
    root.append(stage);
    app.action(ICONS.restart, t('Restart level'), () => loadLevel(level));

    let L = {};
    const s = surface(stage, () => { layout(); draw(); });

    function layout() {
      if (!puzzle) return;
      const { w, h, bays } = puzzle;
      const cell = Math.floor(Math.min((s.w - 12) / (w + 1.5), (s.h - 10) / (h + 1.5 + 1.1 + 2.6)));
      const m = cell * 0.75;                 // ring road width
      const lotW = cell * w, lotH = cell * h;
      const queueY = Math.round(cell * 0.6);
      const bayTop = queueY + cell * 0.65;
      const bayH = cell * 2.35;
      const oy = Math.round(bayTop + bayH + m + cell * 0.15);
      const ox = Math.round((s.w - lotW) / 2);
      const bayW = Math.min(cell * 1.15, (lotW + m) / bays);
      const bayXs = Array.from({ length: bays }, (_, i) => s.w / 2 + (i - (bays - 1) / 2) * bayW * 1.08);
      L = {
        cell, m, ox, oy, lotW, lotH, queueY, bayTop, bayH, bayW, bayXs,
        ring: { l: ox - m / 2, r: ox + lotW + m / 2, t: oy - m / 2, b: oy + lotH + m / 2 },
        spacing: Math.max(12, cell * 0.5),
      };
    }

    function loadLevel(n) {
      level = n;
      maxLevel = Math.max(maxLevel, level);
      app.store.set('carjam.level', level);
      app.store.set('carjam.max', maxLevel);
      puzzle = generate(level);
      game = new CarJam(puzzle);
      cars = new Map();     // id -> visual state for cars that are moving or parked
      walkers = [];
      boardTimer = 0;
      queueShift = 0;
      ended = false;
      bayFlash = 0;
      bar.set(level, maxLevel);
      layout();
      ticker.kick();
    }

    // ---------- geometry ----------
    function lotCenter(car) {
      const xs = car.cells.map((c) => c[0]), ys = car.cells.map((c) => c[1]);
      return [
        L.ox + ((Math.min(...xs) + Math.max(...xs)) / 2 + 0.5) * L.cell,
        L.oy + ((Math.min(...ys) + Math.max(...ys)) / 2 + 0.5) * L.cell,
      ];
    }
    const angleOf = (dx, dy) => Math.atan2(dx, -dy);

    // Route from the lot to a bay: straight out, round the ring road, up into the bay.
    function route(car, bay) {
      const [cx, cy] = lotCenter(car);
      const { ring } = L;
      const bx = L.bayXs[bay];
      const by = L.bayTop + L.bayH / 2;
      const pts = [[cx, cy]];
      const leftSide = cx < L.ox + L.lotW / 2;
      if (car.dir === 0) pts.push([cx, ring.t]);
      else if (car.dir === 1) pts.push([ring.r, cy], [ring.r, ring.t]);
      else if (car.dir === 3) pts.push([ring.l, cy], [ring.l, ring.t]);
      else {
        const side = leftSide ? ring.l : ring.r;
        pts.push([cx, ring.b], [side, ring.b], [side, ring.t]);
      }
      pts.push([bx, ring.t], [bx, by]);
      // drop zero-length hops
      const out = [pts[0]];
      for (const p of pts.slice(1)) {
        const q = out[out.length - 1];
        if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.5) out.push(p);
      }
      const segs = [];
      let total = 0;
      for (let i = 1; i < out.length; i++) {
        const len = Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]);
        segs.push({ a: out[i - 1], b: out[i], len, start: total });
        total += len;
      }
      return { segs, total };
    }

    function posOnRoute(r, d) {
      for (const sg of r.segs) {
        if (d <= sg.start + sg.len || sg === r.segs[r.segs.length - 1]) {
          const t = Math.max(0, Math.min(1, (d - sg.start) / sg.len));
          return { x: sg.a[0] + (sg.b[0] - sg.a[0]) * t, y: sg.a[1] + (sg.b[1] - sg.a[1]) * t, ang: angleOf(sg.b[0] - sg.a[0], sg.b[1] - sg.a[1]) };
        }
      }
      return { x: 0, y: 0, ang: 0 };
    }

    function passengerPos(i) {
      return [L.cell * 0.55 + i * L.spacing + queueShift, L.queueY];
    }

    // ---------- input ----------
    function carAtPoint(p) {
      const x = Math.floor((p.x - L.ox) / L.cell);
      const y = Math.floor((p.y - L.oy) / L.cell);
      for (const id of game.inLot) {
        const car = puzzle.cars[id];
        if (car.cells.some((c) => c[0] === x && c[1] === y)) return car;
      }
      return null;
    }

    s.canvas.addEventListener('pointerdown', (e) => {
      if (ended) return;
      const car = carAtPoint(s.point(e));
      if (!car || cars.has(car.id)) return;
      const res = game.dispatch(car.id);
      if (res.error === 'blocked') {
        cars.set(car.id, { kind: 'bump', car, s: 0, max: res.index + 0.25, back: false });
        app.sfx('bump');
        app.haptic(35);
      } else if (res.error === 'full') {
        bayFlash = 1;
        app.toast(t('No free bay — wait for a car to fill up'));
        app.sfx('bump');
        app.haptic(25);
      } else if (!res.error) {
        const r = route(car, res.bay);
        const [cx, cy] = lotCenter(car);
        cars.set(car.id, { kind: 'drive', car, bay: res.bay, r, d: 0, v: L.cell * 5, x: cx, y: cy, ang: angleOf(...DIRS[car.dir]), scale: 1 });
        app.sfx('select');
        app.haptic(8);
      }
      ticker.kick();
    });

    // ---------- simulation ----------
    function step(dt) {
      for (const [id, v] of cars) {
        if (v.kind === 'bump') {
          if (!v.back) { v.s = Math.min(v.max, v.s + dt * 12); if (v.s >= v.max) v.back = true; }
          else { v.s = Math.max(0, v.s - dt * 8); if (v.s <= 0) cars.delete(id); }
        } else if (v.kind === 'drive') {
          v.v = Math.min(L.cell * 22, v.v + L.cell * 40 * dt);
          v.d = Math.min(v.r.total, v.d + v.v * dt);
          const p = posOnRoute(v.r, v.d);
          v.x = p.x; v.y = p.y;
          let da = p.ang - v.ang;
          while (da > Math.PI) da -= Math.PI * 2;
          while (da < -Math.PI) da += Math.PI * 2;
          v.ang += da * Math.min(1, dt * 16);
          const lastSeg = v.r.segs[v.r.segs.length - 1];
          const k = Math.max(0, Math.min(1, (v.d - lastSeg.start) / lastSeg.len));
          v.scale = 1 + (BAY_SCALE - 1) * k;
          if (v.d >= v.r.total) {
            v.kind = 'parked';
            v.ang = 0;
            v.scale = BAY_SCALE;
            game.arrive(v.bay);
            app.sfx('place');
          }
        } else if (v.kind === 'leave') {
          v.t += dt;
          v.y -= dt * L.cell * 9 * (0.4 + v.t * 3);
          if (v.t > 0.45) { cars.delete(id); game.depart(v.bay); }
        }
      }

      // boarding
      boardTimer -= dt;
      if (boardTimer <= 0 && !ended) {
        const bay = game.board();
        if (bay >= 0) {
          const [px, py] = passengerPos(0);
          const target = [...cars.values()].find((v) => v.kind === 'parked' && v.bay === bay);
          walkers.push({ color: game.bays[bay].color, x0: px, y0: py, bay, t: 0, seat: game.bays[bay].filled - 1, id: target?.car.id });
          queueShift += L.spacing;
          boardTimer = BOARD_GAP;
          app.sfx('key');
        }
      }
      queueShift = Math.max(0, queueShift - dt * L.spacing * 14);

      for (const w of walkers) w.t += dt;
      const arrived = walkers.filter((w) => w.t >= WALK);
      walkers = walkers.filter((w) => w.t < WALK);
      for (const w of arrived) {
        const stillWalking = walkers.some((x) => x.bay === w.bay);
        if (game.isFull(w.bay) && !stillWalking) {
          const v = [...cars.values()].find((c) => c.kind === 'parked' && c.bay === w.bay);
          if (v) { v.kind = 'leave'; v.t = 0; app.sfx('done'); app.haptic(15); }
        }
      }
      if (bayFlash > 0) bayFlash = Math.max(0, bayFlash - dt * 2);

      // end of game
      const quiet = walkers.length === 0 && [...cars.values()].every((v) => v.kind === 'parked');
      if (!ended && quiet) {
        if (game.isWon()) { ended = true; setTimeout(() => finish(true), 300); }
        else if (game.isStuck()) { ended = true; setTimeout(() => finish(false), 500); }
      }
    }

    async function finish(win) {
      if (destroyed) return;
      if (win) {
        app.sfx('win');
        maxLevel = Math.max(maxLevel, level + 1);
        app.store.set('carjam.max', maxLevel);
        const v = await app.modal({
          title: t('Level {n} cleared!', { n: level }),
          html: `<p style="text-align:center">${t('Everyone got a ride.')}</p>`,
          buttons: [{ label: t('Replay'), value: 'replay' }, { label: t('Next level'), value: 'next', primary: true }],
          dismissable: false,
        });
        if (!destroyed) loadLevel(v === 'next' ? level + 1 : level);
      } else {
        app.sfx('lose');
        app.haptic(60);
        await app.modal({
          title: t('Traffic jam!'),
          html: `<p style="text-align:center">${t('Every bay is taken and the next passenger wants <b style="color:{color}">this color</b>. Try a different order.', { color: COLORS[game.queue[0]] })}</p>`,
          buttons: [{ label: t('Try again'), value: true, primary: true }],
          dismissable: false,
        });
        if (!destroyed) loadLevel(level);
      }
    }

    // ---------- drawing ----------
    function drawCar(ctx, x, y, ang, len, color, scale, seats, filled) {
      const { cell } = L;
      const w = cell * 0.78 * scale;
      const l = (len * cell - cell * 0.2) * scale;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      rrect(ctx, -w / 2 + 2, -l / 2 + 3, w, l, w * 0.3);
      ctx.fill();
      ctx.fillStyle = color;
      rrect(ctx, -w / 2, -l / 2, w, l, w * 0.3);
      ctx.fill();
      ctx.fillStyle = shade(color, -0.22);
      rrect(ctx, -w * 0.36, -l / 2 + l * 0.26, w * 0.72, l * 0.6, w * 0.18);
      ctx.fill();
      // windshield and headlights
      ctx.fillStyle = '#cfe8ff';
      rrect(ctx, -w * 0.34, -l / 2 + l * 0.08, w * 0.68, Math.max(3, l * 0.12), 3 * scale);
      ctx.fill();
      ctx.fillStyle = '#fff6b0';
      ctx.fillRect(-w * 0.42, -l / 2 + 1, w * 0.18, 2.5 * scale);
      ctx.fillRect(w * 0.24, -l / 2 + 1, w * 0.18, 2.5 * scale);
      // seats
      const rows = seats / 2;
      const sy0 = -l / 2 + l * 0.3;
      const sh = (l * 0.54) / rows;
      const r = Math.min(sh * 0.32, w * 0.15);
      for (let i = 0; i < seats; i++) {
        const sx = (i % 2 ? 1 : -1) * w * 0.17;
        const sy = sy0 + (Math.floor(i / 2) + 0.5) * sh;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = i < filled ? '#ffffff' : 'rgba(0,0,0,0.3)';
        ctx.fill();
      }
      ctx.restore();
    }

    function drawPerson(ctx, x, y, color, k = 1) {
      const r = L.cell * 0.13 * k;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y - r * 1.25, r, 0, Math.PI * 2);
      ctx.fill();
      rrect(ctx, x - r * 1.05, y - r * 0.1, r * 2.1, r * 2.2, r * 0.9);
      ctx.fill();
    }

    function draw() {
      const { ctx } = s;
      s.begin();
      if (!L.cell || !game) return;
      const { cell, m, ox, oy, lotW, lotH, ring } = L;

      // bays
      for (let i = 0; i < puzzle.bays; i++) {
        const x = L.bayXs[i] - L.bayW / 2 + 3;
        rrect(ctx, x, L.bayTop, L.bayW - 6, L.bayH, 10);
        ctx.fillStyle = '#191d29';
        ctx.fill();
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = bayFlash > 0 && Math.floor(bayFlash * 8) % 2 === 0 ? '#ff5d6c' : '#3a4160';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // ring road and lot
      ctx.strokeStyle = '#2a2f40';
      ctx.lineWidth = m;
      ctx.lineJoin = 'round';
      ctx.strokeRect(ring.l, ring.t, ring.r - ring.l, ring.b - ring.t);
      ctx.setLineDash([cell * 0.25, cell * 0.25]);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(ring.l, ring.t, ring.r - ring.l, ring.b - ring.t);
      ctx.setLineDash([]);
      // road up to the bays
      ctx.fillStyle = '#2a2f40';
      ctx.fillRect(L.bayXs[0] - L.bayW * 0.3, L.bayTop + L.bayH - 6, L.bayXs[puzzle.bays - 1] - L.bayXs[0] + L.bayW * 0.6, ring.t - (L.bayTop + L.bayH) + 6);

      rrect(ctx, ox, oy, lotW, lotH, 6);
      ctx.fillStyle = '#1a1e2b';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 1; x < puzzle.w; x++) { ctx.moveTo(ox + x * cell + 0.5, oy); ctx.lineTo(ox + x * cell + 0.5, oy + lotH); }
      for (let y = 1; y < puzzle.h; y++) { ctx.moveTo(ox, oy + y * cell + 0.5); ctx.lineTo(ox + lotW, oy + y * cell + 0.5); }
      ctx.stroke();

      // cars still in the lot
      for (const id of game.inLot) {
        const car = puzzle.cars[id];
        let [cx, cy] = lotCenter(car);
        const v = cars.get(id);
        if (v && v.kind === 'bump') {
          const [dx, dy] = DIRS[car.dir];
          cx += dx * v.s * cell;
          cy += dy * v.s * cell;
        }
        drawCar(ctx, cx, cy, angleOf(...DIRS[car.dir]), car.len, COLORS[car.color], 1, car.len * 2, 0);
      }
      // cars on the road or in bays
      for (const v of cars.values()) {
        if (v.kind === 'bump') continue;
        const b = game.bays[v.bay];
        const inFlight = walkers.filter((w) => w.bay === v.bay).length;
        const filled = b ? b.filled - inFlight : v.car.len * 2;
        if (v.kind === 'leave') ctx.globalAlpha = Math.max(0, 1 - v.t / 0.45);
        drawCar(ctx, v.x, v.y, v.ang, v.car.len, COLORS[v.car.color], v.scale, v.car.len * 2, filled);
        ctx.globalAlpha = 1;
      }

      // queue
      const maxShown = Math.max(3, Math.floor((s.w - cell * 1.6) / L.spacing));
      const shown = game.queue.slice(0, maxShown);
      shown.forEach((c, i) => {
        const [x, y] = passengerPos(i);
        drawPerson(ctx, x, y, COLORS[c], i === 0 ? 1.15 : 1);
      });
      if (game.queue.length > maxShown) {
        ctx.fillStyle = '#9ba2b9';
        ctx.font = '700 13px system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        // The page is right-to-left in Hebrew; keep the sign in front of the number.
        const dir = ctx.direction;
        ctx.direction = 'ltr';
        ctx.fillText('+' + (game.queue.length - maxShown), s.w - 6, L.queueY);
        ctx.direction = dir;
      }
      // passengers walking to cars
      for (const w of walkers) {
        const k = ease.inOut(Math.min(1, w.t / WALK));
        const tx = L.bayXs[w.bay], ty = L.bayTop + L.bayH / 2;
        const x = w.x0 + (tx - w.x0) * k;
        const y = w.y0 + (ty - w.y0) * k - Math.sin(k * Math.PI) * cell * 0.4;
        drawPerson(ctx, x, y, COLORS[w.color], 1 - k * 0.4);
      }
    }

    const ticker = loop((dt) => {
      if (destroyed) return false;
      step(dt);
      draw();
      const canBoard = game.boardTarget() >= 0;
      return cars.size > 0 && [...cars.values()].some((v) => v.kind !== 'parked') || walkers.length > 0
        || canBoard || queueShift > 0 || bayFlash > 0
        || (!ended && (game.isWon() || game.isStuck()));
    });

    loadLevel(level);

    return {
      destroy() {
        destroyed = true;
        ticker.stop();
        s.destroy();
      },
    };
  },
};

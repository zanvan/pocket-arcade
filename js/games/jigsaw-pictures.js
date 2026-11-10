// The built-in pictures for Jigsaw, painted from code so the app needs no image files.
// Each painter draws on a 100 x 75 canvas (the context is scaled to fit) and uses its own
// seeded random numbers, so a picture looks the same every time and on every phone.
import { rng } from '../logic/rng.js';
import { t } from '../core/i18n.js';
import { shade } from '../core/ui.js';

export const VIEW_W = 100;
export const VIEW_H = 75;

// ---------- small helpers ----------
function grad(g, x0, y0, x1, y1, stops) {
  const l = g.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) l.addColorStop(o, c);
  return l;
}

function rad(g, x, y, r0, r1, stops) {
  const l = g.createRadialGradient(x, y, r0, x, y, r1);
  for (const [o, c] of stops) l.addColorStop(o, c);
  return l;
}

function dot(g, x, y, r, fill) {
  g.fillStyle = fill;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

function oval(g, x, y, rx, ry, fill, rot = 0) {
  g.fillStyle = fill;
  g.beginPath();
  g.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, Math.PI * 2);
  g.fill();
}

function poly(g, pts, fill) {
  g.fillStyle = fill;
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.fill();
}

function line(g, x0, y0, x1, y1, w, color) {
  g.strokeStyle = color;
  g.lineWidth = w;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
}

// Soft glow around whatever is drawn next. The blur is in canvas pixels, so scale it.
function glow(g, color, amount) {
  g.shadowColor = color;
  g.shadowBlur = amount * g.getTransform().a;
}
const noGlow = (g) => { g.shadowBlur = 0; g.shadowColor = 'transparent'; };

function stars(g, R, n, maxY, color = '255,255,255') {
  for (let i = 0; i < n; i++) {
    const y = R() * maxY;
    dot(g, R() * VIEW_W, y, 0.1 + R() * 0.2, `rgba(${color},${0.3 + R() * 0.6})`);
  }
}

function cloud(g, x, y, s, dark, light) {
  const puffs = [[-6, 0, 5, 2.2], [-2.5, -1.6, 5, 3], [2.5, -2, 5.5, 3.2], [7, -0.4, 5, 2.4], [0, 0.6, 9, 2]];
  for (const [dx, dy, rx, ry] of puffs) oval(g, x + dx * s, y + dy * s, rx * s, ry * s, dark);
  for (const [dx, dy, rx, ry] of puffs) oval(g, x + dx * s, y + (dy - 0.7) * s, rx * s * 0.9, ry * s * 0.78, light);
}

// A jagged ridge line (midpoint displacement), 129 heights between 0 and 1.
function ridgeLine(R, rough) {
  const n = 129;
  const a = new Array(n).fill(0);
  a[0] = R(); a[n - 1] = R();
  for (let step = n - 1, amp = 1; step > 1; step /= 2, amp *= rough) {
    for (let i = step / 2; i < n; i += step) a[i] = (a[i - step / 2] + a[i + step / 2]) / 2 + (R() - 0.5) * amp;
  }
  const lo = Math.min(...a), hi = Math.max(...a);
  return a.map((v) => (v - lo) / (hi - lo));
}

function pine(g, x, y, h, color, snow = false) {
  const w = h * 0.42;
  line(g, x, y, x, y - h * 0.18, h * 0.07, '#4a3020');
  for (let i = 0; i < 4; i++) {
    const top = y - h * (0.16 + 0.27 * i + 0.3), bot = y - h * (0.12 + 0.2 * i);
    const half = w * (1 - i * 0.2) / 2;
    poly(g, [[x, top], [x + half, bot], [x - half, bot]], shade(color, i * 0.05 - 0.05));
    poly(g, [[x, top], [x + half * 0.5, top + (bot - top) * 0.5], [x + half, bot]], 'rgba(0,0,0,0.14)');
    if (snow) poly(g, [[x, top], [x + half * 0.45, top + (bot - top) * 0.45], [x - half * 0.45, top + (bot - top) * 0.45]], 'rgba(255,255,255,0.85)');
  }
}

function fish(g, x, y, s, flip, body, fin, stripe) {
  g.save();
  g.translate(x, y);
  g.scale(flip * s, s);
  poly(g, [[-3.2, 0], [-6.6, -2.6], [-5.6, 0], [-6.6, 2.6]], fin);                 // tail
  poly(g, [[-1.5, -2.4], [0.6, -4.6], [2.2, -2.3]], fin);                          // back fin
  poly(g, [[-0.4, 2.2], [1.2, 3.9], [2.4, 2]], fin);                               // belly fin
  g.fillStyle = grad(g, 0, -3, 0, 3, [[0, shade(body, 0.25)], [0.6, body], [1, shade(body, -0.25)]]);
  g.beginPath(); g.ellipse(0, 0, 4.6, 2.9, 0, 0, Math.PI * 2); g.fill();
  g.save();
  g.beginPath(); g.ellipse(0, 0, 4.6, 2.9, 0, 0, Math.PI * 2); g.clip();
  for (const sx of [-1.6, 0.4]) line(g, sx, -3.2, sx - 0.5, 3.2, 0.9, stripe);
  g.restore();
  oval(g, 2.2, -0.6, 0.8, 0.8, '#ffffff');
  dot(g, 2.4, -0.6, 0.4, '#102030');
  line(g, 3.7, 0.9, 4.3, 0.7, 0.25, 'rgba(0,0,0,0.4)');
  g.restore();
}

// ---------- the pictures ----------

function sunset(g, R) {
  g.fillStyle = grad(g, 0, 0, 0, 46, [[0, '#241552'], [0.3, '#6b2f86'], [0.55, '#d9507a'], [0.8, '#ff8f4d'], [1, '#ffd36e']]);
  g.fillRect(0, 0, 100, 46);
  stars(g, R, 45, 20);
  const sx = 64, sy = 43;
  g.fillStyle = rad(g, sx, sy, 0, 36, [[0, 'rgba(255,240,170,0.95)'], [0.25, 'rgba(255,190,100,0.55)'], [1, 'rgba(255,120,80,0)']]);
  g.fillRect(0, 0, 100, 46);
  dot(g, sx, sy, 7.5, grad(g, 0, sy - 8, 0, sy + 8, [[0, '#fff7c8'], [1, '#ffc65a']]));
  for (const [x, y, s, d, l] of [[14, 13, 1.1, '#6e2a7c', '#f0708a'], [41, 20, 1.5, '#8b3a80', '#ff9a6a'], [80, 10, 1.2, '#5b2678', '#c95a8f'], [88, 26, 1, '#9a3f78', '#ffa066'], [20, 31, 0.9, '#a64576', '#ffb070'], [50, 33, 0.7, '#b34d6c', '#ffc27a']]) {
    g.globalAlpha = 0.92;
    cloud(g, x, y, s, d, l);
  }
  g.globalAlpha = 1;
  // islands on the horizon
  g.fillStyle = '#2d1745';
  g.beginPath(); g.moveTo(0, 46); g.lineTo(0, 40); g.quadraticCurveTo(5, 37, 9, 41); g.quadraticCurveTo(13, 40, 18, 46); g.fill();
  g.fillStyle = '#4a2352';
  g.beginPath(); g.moveTo(84, 46); g.quadraticCurveTo(91, 41, 100, 43); g.lineTo(100, 46); g.fill();
  // sea
  g.fillStyle = grad(g, 0, 45, 0, 75, [[0, '#e0607a'], [0.2, '#a24385'], [0.6, '#3a2870'], [1, '#150f3a']]);
  g.fillRect(0, 45.5, 100, 30);
  for (let k = 0; k < 170; k++) {
    const u = Math.pow(R(), 1.3);
    const y = 46 + u * 29, len = 1.5 + u * 9 * (0.4 + R());
    const x = R() * 100;
    const lit = Math.abs(x - sx) < 5 + u * 14;
    line(g, x, y, x + len, y, 0.15 + u * 0.35, lit ? `rgba(255,214,140,${0.25 + R() * 0.4})` : `rgba(${90 + R() * 60},${50 + R() * 30},${120 + R() * 40},${0.25 + R() * 0.3})`);
  }
  for (let y = 46; y < 75; y += 0.7) {
    const u = (y - 45) / 30;
    const w = (1.5 + u * 9) * (0.4 + R() * 0.9);
    const x = sx + (R() - 0.5) * (2 + u * 9);
    line(g, x - w / 2, y, x + w / 2, y, 0.3 + u * 0.15, `rgba(255,232,160,${0.6 - u * 0.25})`);
  }
  // sailboat
  poly(g, [[20.5, 53], [29.5, 53], [27.8, 55.2], [22.2, 55.2]], '#2a1740');
  line(g, 25, 53, 25, 42.5, 0.35, '#2a1740');
  poly(g, [[25.4, 43.5], [25.4, 52.2], [31, 52.2]], '#ffd7a0');
  poly(g, [[24.6, 45.5], [24.6, 52.2], [20.5, 52.2]], '#c95a8f');
  for (let i = 0; i < 6; i++) {
    const x = 6 + i * 6.5 + R() * 3, y = 6 + R() * 12 + (i % 2) * 5;
    g.strokeStyle = '#2a1740'; g.lineWidth = 0.32; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x - 1.5, y); g.quadraticCurveTo(x - 0.7, y - 1.1, x, y); g.quadraticCurveTo(x + 0.7, y - 1.1, x + 1.5, y); g.stroke();
  }
}

function mountains(g, R) {
  g.fillStyle = grad(g, 0, 0, 0, 52, [[0, '#4f9fe8'], [0.6, '#a9d8f7'], [1, '#fde9c9']]);
  g.fillRect(0, 0, 100, 56);
  g.fillStyle = rad(g, 82, 13, 0, 24, [[0, 'rgba(255,255,230,0.95)'], [0.3, 'rgba(255,245,200,0.4)'], [1, 'rgba(255,245,200,0)']]);
  g.fillRect(0, 0, 100, 56);
  dot(g, 82, 13, 3.4, '#fffbe6');
  for (const [x, y, s] of [[18, 10, 1.1], [50, 17, 0.8], [66, 7, 0.9]]) { g.globalAlpha = 0.85; cloud(g, x, y, s, '#d9e6f5', '#ffffff'); }
  g.globalAlpha = 1;

  const layers = [
    { base: 44, amp: 24, rough: 0.6, top: '#8fb0da', bot: '#d3e1f2', snow: 0.62 },
    { base: 52, amp: 26, rough: 0.55, top: '#5f7fb5', bot: '#9db6d6', snow: 0.66 },
    { base: 58, amp: 17, rough: 0.5, top: '#2f5d5a', bot: '#6f9c86', snow: 2 },
  ];
  layers.forEach((L, k) => {
    const a = ridgeLine(R, L.rough);
    const pts = a.map((v, i) => [(i / 128) * 100, L.base - v * L.amp]);
    g.save();
    g.beginPath();
    g.moveTo(0, 75);
    pts.forEach(([x, y]) => g.lineTo(x, y));
    g.lineTo(100, 75);
    g.closePath();
    g.fillStyle = grad(g, 0, L.base - L.amp, 0, L.base + 4, [[0, L.top], [1, L.bot]]);
    g.fill();
    g.clip();
    // shaded flank under each peak
    for (let i = 3; i < 126; i++) {
      if (a[i] > 0.5 && a[i] >= a[i - 1] && a[i] >= a[i + 1] && a[i] > a[i - 3] && a[i] > a[i + 3]) {
        const [px, py] = pts[i];
        poly(g, [[px, py], [px + 9, L.base + 3], [px - 1, L.base + 3], [px + 1.5, py + (L.base - py) * 0.45]], 'rgba(20,40,90,0.17)');
      }
    }
    // snow above a ragged line
    if (L.snow < 1) {
      const sy = L.base - L.amp * L.snow;
      g.beginPath();
      g.moveTo(0, 0); g.lineTo(100, 0);
      for (let x = 100; x >= 0; x -= 1.6) g.lineTo(x, sy + Math.sin(x * 1.7) * 0.9 + (R() - 0.5) * 1.6 + Math.sin(x * 0.4) * 1.5);
      g.closePath();
      g.fillStyle = 'rgba(250,252,255,0.95)';
      g.fill();
    }
    g.restore();
    if (k === 1) {
      g.fillStyle = grad(g, 0, 50, 0, 62, [[0, 'rgba(255,255,255,0)'], [1, 'rgba(235,245,255,0.55)']]);
      g.fillRect(0, 50, 100, 12);
    }
  });
  // lake
  g.fillStyle = grad(g, 0, 58, 0, 75, [[0, '#8fcdea'], [0.5, '#3f86bd'], [1, '#1f5a92']]);
  g.fillRect(0, 58, 100, 17);
  g.save();
  g.beginPath(); g.rect(0, 58, 100, 17); g.clip();
  g.globalAlpha = 0.35;
  g.translate(0, 116); g.scale(1, -1);
  const a = ridgeLine(rng(5), 0.5);
  poly(g, [[0, 75], ...a.map((v, i) => [(i / 128) * 100, 58 - v * 15]), [100, 75]], '#2f5d5a');
  g.restore();
  for (let k = 0; k < 60; k++) {
    const y = 59 + R() * 16, x = R() * 100;
    line(g, x, y, x + 2 + R() * 6, y, 0.2, `rgba(255,255,255,${0.2 + R() * 0.3})`);
  }
  // cabin on the far shore
  poly(g, [[63, 58.2], [63, 54.5], [69, 54.5], [69, 58.2]], '#a8442f');
  poly(g, [[62.2, 54.7], [66, 51.3], [69.8, 54.7]], '#4a3328');
  poly(g, [[65, 58.2], [65, 56], [67, 56], [67, 58.2]], '#ffd36e');
  // shores with pines
  g.fillStyle = grad(g, 0, 62, 0, 75, [[0, '#4d8a3d'], [1, '#2b5e2c']]);
  g.beginPath(); g.moveTo(0, 75); g.lineTo(0, 60); g.quadraticCurveTo(14, 63, 30, 70); g.quadraticCurveTo(40, 74, 46, 75); g.fill();
  g.beginPath(); g.moveTo(100, 75); g.lineTo(100, 62); g.quadraticCurveTo(84, 66, 72, 72); g.quadraticCurveTo(66, 75, 62, 75); g.fill();
  const trees = [[4, 66, 22], [12, 68, 16], [20, 71, 12], [27, 73, 8], [96, 68, 20], [88, 70, 14], [80, 73, 9], [58, 73.5, 6]];
  for (const [x, y, h] of trees) pine(g, x, y, h, '#1f5c3a');
  for (let k = 0; k < 50; k++) {
    const x = R() * 100, y = 70 + R() * 5;
    if ((x > 30 && x < 62) || (x > 62 && x < 70 && y < 74)) continue;
    dot(g, x, y, 0.35, ['#ffd23f', '#ffffff', '#ff6b6b', '#ff9ad5'][k % 4]);
  }
}

function balloon(g, x, y, r, cols, fade) {
  const prof = (s) => (s < 0
    ? [r * Math.cos(-s * Math.PI / 2), y + r * Math.sin(s * Math.PI / 2)]
    : [r * (0.24 + 0.76 * Math.pow(Math.cos(s * Math.PI / 2), 0.8)), y + 1.45 * r * s]);
  const bands = cols.length * 2;
  const steps = 30;
  g.save();
  g.globalAlpha = fade;
  for (let k = 0; k < bands; k++) {
    const p0 = Math.sin((-0.5 + k / bands) * Math.PI), p1 = Math.sin((-0.5 + (k + 1) / bands) * Math.PI);
    const pts = [];
    for (let i = 0; i <= steps; i++) { const [rx, yy] = prof(-1 + (2 * i) / steps); pts.push([x + rx * p0, yy]); }
    for (let i = steps; i >= 0; i--) { const [rx, yy] = prof(-1 + (2 * i) / steps); pts.push([x + rx * p1, yy]); }
    poly(g, pts, cols[k % cols.length]);
  }
  // outline and light
  const out = [];
  for (let i = 0; i <= steps; i++) { const [rx, yy] = prof(-1 + (2 * i) / steps); out.push([x - rx, yy]); }
  for (let i = steps; i >= 0; i--) { const [rx, yy] = prof(-1 + (2 * i) / steps); out.push([x + rx, yy]); }
  poly(g, out, rad(g, x - r * 0.4, y - r * 0.45, 0, r * 1.5, [[0, 'rgba(255,255,255,0.45)'], [0.5, 'rgba(255,255,255,0)'], [1, 'rgba(20,10,60,0.3)']]));
  g.strokeStyle = 'rgba(40,20,60,0.35)'; g.lineWidth = r * 0.04;
  g.beginPath(); out.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.closePath(); g.stroke();
  // flame, ropes, basket
  const by = y + 1.45 * r;
  oval(g, x, by + r * 0.08, r * 0.1, r * 0.17, '#ffb02e');
  oval(g, x, by + r * 0.12, r * 0.05, r * 0.1, '#fff1a0');
  line(g, x - r * 0.24, by, x - r * 0.2, by + r * 0.5, r * 0.025, '#3a2a20');
  line(g, x + r * 0.24, by, x + r * 0.2, by + r * 0.5, r * 0.025, '#3a2a20');
  g.fillStyle = '#9a6530';
  g.fillRect(x - r * 0.22, by + r * 0.5, r * 0.44, r * 0.34);
  g.fillStyle = '#6e4420';
  for (let i = 1; i < 4; i++) g.fillRect(x - r * 0.22 + (i * r * 0.44) / 4, by + r * 0.5, r * 0.03, r * 0.34);
  g.fillRect(x - r * 0.25, by + r * 0.47, r * 0.5, r * 0.06);
  g.restore();
}

function balloons(g, R) {
  g.fillStyle = grad(g, 0, 0, 0, 75, [[0, '#2679d1'], [0.5, '#7ec4f2'], [1, '#e8f7ff']]);
  g.fillRect(0, 0, 100, 75);
  g.fillStyle = rad(g, 12, 8, 0, 30, [[0, 'rgba(255,255,230,0.7)'], [1, 'rgba(255,255,230,0)']]);
  g.fillRect(0, 0, 100, 75);
  for (const [x, y, s] of [[20, 22, 1.5], [75, 14, 1.2], [58, 44, 1.7], [10, 52, 1.3], [92, 50, 1.1], [34, 8, 0.8]]) {
    g.globalAlpha = 0.9; cloud(g, x, y, s, '#d3e6f7', '#ffffff');
  }
  g.globalAlpha = 1;
  // far hills, then near hills
  const hill = (base, amp, f, ph, c0, c1) => {
    g.beginPath(); g.moveTo(0, 75);
    for (let x = 0; x <= 100; x += 2) g.lineTo(x, base + Math.sin(x * f + ph) * amp + Math.sin(x * f * 2.3 + ph * 2) * amp * 0.4);
    g.lineTo(100, 75); g.closePath();
    g.fillStyle = grad(g, 0, base - amp, 0, 75, [[0, c0], [1, c1]]);
    g.fill();
  };
  hill(62, 3.5, 0.07, 1, '#7fc08b', '#4f9a62');
  hill(68, 3, 0.1, 3, '#5fae55', '#2f7c3c');
  // checkered fields
  for (let i = 0; i < 24; i++) {
    const x = R() * 100, y = 66 + R() * 9, w = 3 + R() * 6;
    poly(g, [[x, y], [x + w, y], [x + w * 1.2, y + 1.6], [x - w * 0.2, y + 1.6]], ['rgba(240,210,90,0.5)', 'rgba(255,255,255,0.18)', 'rgba(60,130,60,0.35)'][i % 3]);
  }
  const sets = [
    ['#e63946', '#ffd166'], ['#2a9d8f', '#f1faee'], ['#7b2cbf', '#ffb703'], ['#ff7b00', '#ffffff'],
    ['#d00070', '#ffe66d'], ['#1d4ed8', '#fb923c'], ['#16a34a', '#fde047'],
  ];
  const list = [
    [20, 24, 5, 0.8], [88, 30, 4.5, 0.82], [74, 11, 5.5, 0.85], [40, 12, 4, 0.8], [63, 38, 6, 0.9],
    [34, 38, 8.5, 1], [10, 45, 5.5, 0.92], [50, 22, 10, 1], [82, 52, 9, 1],
  ];
  list.sort((a, b) => a[2] - b[2]);
  list.forEach(([x, y, r, fade], i) => balloon(g, x, y, r, sets[i % sets.length], fade));
}

function city(g, R) {
  g.fillStyle = grad(g, 0, 0, 0, 58, [[0, '#080c2a'], [0.5, '#2a1f63'], [0.82, '#7a3b8f'], [1, '#e0698f']]);
  g.fillRect(0, 0, 100, 75);
  stars(g, R, 70, 30);
  g.fillStyle = rad(g, 80, 12, 0, 20, [[0, 'rgba(255,248,210,0.55)'], [1, 'rgba(255,248,210,0)']]);
  g.fillRect(0, 0, 100, 40);
  dot(g, 80, 12, 4.8, '#fff8dc');
  for (const [dx, dy, r] of [[-1.5, -1, 0.9], [1.4, 1.2, 0.7], [0.6, -2, 0.5]]) dot(g, 80 + dx, 12 + dy, r, 'rgba(210,190,140,0.55)');

  const buildings = (base, hmin, hmax, wmin, wmax, colors, lit, seed) => {
    const Rb = rng(seed);
    const list = [];
    for (let x = -2; x < 102;) {
      const w = wmin + Rb() * (wmax - wmin), h = hmin + Rb() * (hmax - hmin);
      list.push({ x, w, h, c: colors[Math.floor(Rb() * colors.length)], roof: Rb() });
      x += w + (Rb() < 0.3 ? 0.4 : 0);
    }
    for (const b of list) {
      g.fillStyle = grad(g, 0, base - b.h, 0, base, [[0, shade(b.c, 0.08)], [1, shade(b.c, -0.2)]]);
      g.fillRect(b.x, base - b.h, b.w, b.h + 1);
      if (b.roof < 0.25) line(g, b.x + b.w / 2, base - b.h, b.x + b.w / 2, base - b.h - 4, 0.25, b.c);
      else if (b.roof < 0.45) g.fillRect(b.x + b.w * 0.2, base - b.h - 1.5, b.w * 0.6, 1.5);
      else if (b.roof < 0.55) poly(g, [[b.x, base - b.h], [b.x + b.w / 2, base - b.h - 3], [b.x + b.w, base - b.h]], b.c);
      if (lit) {
        for (let wy = base - b.h + 1.6; wy < base - 1; wy += 2.2) {
          for (let wx = b.x + 0.8; wx < b.x + b.w - 1; wx += 1.7) {
            if (Rb() < lit) {
              g.fillStyle = ['#ffd86b', '#ffc14d', '#fff1b0', '#ffb347', '#8fe6ff'][Math.floor(Rb() * 5)];
              g.fillRect(wx, wy, 0.9, 1.2);
            }
          }
        }
        if (b.roof > 0.9 && b.w > 5) {                     // a neon sign
          const col = ['#ff3d9a', '#3de2ff', '#7dff6a'][Math.floor(Rb() * 3)];
          glow(g, col, 3);
          g.fillStyle = col;
          g.fillRect(b.x + 0.8, base - b.h + 0.6, b.w - 1.6, 0.9);
          noGlow(g);
        }
      }
    }
    return list;
  };
  buildings(56, 8, 24, 3, 6, ['#2b2a63', '#33306e', '#3a2f6b'], 0.08, 11);
  const near = buildings(57, 18, 44, 4.5, 9, ['#171a48', '#1d1f55', '#241b52', '#13163f'], 0.42, 3);
  // the tower
  g.fillStyle = grad(g, 0, 8, 0, 56, [[0, '#d7d9ff'], [1, '#4b4a8f']]);
  poly(g, [[33, 56], [34.4, 24], [35.6, 24], [37, 56]], '#2c2a66');
  glow(g, '#ffb3e6', 3);
  oval(g, 35, 22, 6, 1.5, '#e8e4ff');
  oval(g, 35, 21, 3.2, 1.4, '#ff88c8');
  noGlow(g);
  line(g, 35, 20, 35, 12, 0.4, '#e8e4ff');
  dot(g, 35, 11.6, 0.7, '#ff4060');
  // river with reflections
  g.fillStyle = grad(g, 0, 57, 0, 75, [[0, '#d0628a'], [0.25, '#6a3a8a'], [1, '#12103a']]);
  g.fillRect(0, 57, 100, 18);
  g.save();
  g.beginPath(); g.rect(0, 57.5, 100, 18); g.clip();
  g.globalAlpha = 0.45;
  for (const b of near) {
    g.fillStyle = grad(g, 0, 57, 0, 57 + b.h * 0.6, [[0, shade(b.c, 0.1)], [1, 'rgba(10,8,40,0)']]);
    g.fillRect(b.x, 57.5, b.w, b.h * 0.6);
    for (let k = 0; k < b.w * 1.3; k++) { const lx = b.x + R() * b.w, ly = 58 + R() * b.h * 0.45; line(g, lx, ly, lx, ly + 0.8 + R() * 1.6, 0.4, ['#ffd86b', '#ffc14d', '#8fe6ff'][k % 3]); }
  }
  g.restore();
  for (let k = 0; k < 90; k++) {
    const y = 58 + R() * 17, x = R() * 100;
    line(g, x, y, x + 2 + R() * 7, y, 0.25, k % 3 ? 'rgba(10,8,40,0.5)' : 'rgba(255,200,160,0.3)');
  }
  // quay with street lamps
  g.fillStyle = '#0c0a28';
  g.fillRect(0, 56.6, 100, 1.1);
  for (let x = 4; x < 100; x += 9) {
    line(g, x, 56.6, x, 53.8, 0.3, '#0c0a28');
    g.fillStyle = rad(g, x, 53.6, 0, 2.6, [[0, 'rgba(255,230,160,0.95)'], [1, 'rgba(255,200,120,0)']]);
    g.fillRect(x - 3, 50.6, 6, 6);
    dot(g, x, 53.6, 0.4, '#fff6cc');
  }
}

function flowers(g, R) {
  g.fillStyle = grad(g, 0, 0, 0, 40, [[0, '#4b9fe6'], [0.7, '#a8dcf8'], [1, '#e3f5e8']]);
  g.fillRect(0, 0, 100, 42);
  g.fillStyle = rad(g, 84, 12, 0, 26, [[0, 'rgba(255,250,200,0.9)'], [0.3, 'rgba(255,240,170,0.35)'], [1, 'rgba(255,240,170,0)']]);
  g.fillRect(0, 0, 100, 42);
  dot(g, 84, 12, 5, '#fff3a0');
  for (const [x, y, s] of [[20, 10, 1.2], [52, 17, 0.9], [68, 6, 0.8]]) { g.globalAlpha = 0.9; cloud(g, x, y, s, '#dcebf7', '#ffffff'); }
  g.globalAlpha = 1;
  const hill = (base, amp, f, ph, c0, c1) => {
    g.beginPath(); g.moveTo(0, 75);
    for (let x = 0; x <= 100; x += 2) g.lineTo(x, base + Math.sin(x * f + ph) * amp + Math.sin(x * f * 2.7 + ph) * amp * 0.35);
    g.lineTo(100, 75); g.closePath();
    g.fillStyle = grad(g, 0, base - amp, 0, 75, [[0, c0], [1, c1]]);
    g.fill();
  };
  hill(38, 3, 0.06, 2, '#9ccf9a', '#6fae6f');
  hill(42, 3, 0.09, 5, '#6cb86a', '#3f8f4a');
  // barn and windmill on the hill
  poly(g, [[18, 44], [18, 38.5], [26, 38.5], [26, 44]], '#b83a2e');
  poly(g, [[17, 38.8], [22, 34.2], [27, 38.8]], '#7a2a24');
  poly(g, [[20.4, 44], [20.4, 40.4], [23.6, 40.4], [23.6, 44]], '#f4e3d0');
  line(g, 20.4, 40.4, 23.6, 44, 0.25, '#b83a2e'); line(g, 23.6, 40.4, 20.4, 44, 0.25, '#b83a2e');
  poly(g, [[66, 44], [67.2, 34], [68.8, 34], [70, 44]], '#efe6d6');
  g.save(); g.translate(68, 34);
  for (let i = 0; i < 4; i++) { g.rotate(Math.PI / 2); poly(g, [[0, 0], [0.8, -7.5], [-0.6, -7.5]], '#ffffff'); line(g, 0, 0, 0, -7.5, 0.3, '#8a6a4a'); }
  g.restore();
  dot(g, 68, 34, 0.9, '#8a6a4a');
  // the field
  g.fillStyle = grad(g, 0, 44, 0, 75, [[0, '#5fb04a'], [1, '#2c7a34']]);
  g.fillRect(0, 44, 100, 31);
  const pal = ['#ff4d6d', '#ff9ad5', '#ffd23f', '#ffffff', '#9b5de5', '#ff8c1a', '#4cc9f0', '#f72585'];
  const rows = 12;
  for (let r = 0; r < rows; r++) {
    const u = r / (rows - 1);
    const y = 44.5 + Math.pow(u, 1.7) * 31;
    const s = 0.5 + u * u * 3.4;
    const n = Math.round(14 + u * 8);
    for (let i = 0; i < n; i++) {
      const x = ((i + R() * 0.8) / n) * 112 - 6;
      const c = pal[Math.floor(R() * pal.length)];
      line(g, x, y + s * 0.5, x + (R() - 0.5) * s * 0.4, y + s * 3.2, s * 0.22, '#2f7d32');
      oval(g, x + s * 0.7, y + s * 2.3, s * 0.8, s * 0.3, '#3d9442', 0.5);
      const petals = 5 + (i % 3);
      for (let p = 0; p < petals; p++) {
        const a = (p / petals) * Math.PI * 2 + i;
        dot(g, x + Math.cos(a) * s * 0.62, y + Math.sin(a) * s * 0.62, s * 0.5, c);
      }
      dot(g, x, y, s * 0.4, i % 2 ? '#ffb703' : '#6b3a10');
    }
  }
  // butterflies
  for (const [x, y, c] of [[40, 30, '#ff8c1a'], [78, 28, '#c77dff'], [52, 52, '#ffffff']]) {
    oval(g, x - 1.4, y - 0.6, 1.5, 1.1, c, -0.5); oval(g, x + 1.4, y - 0.6, 1.5, 1.1, c, 0.5);
    oval(g, x - 1, y + 0.7, 1, 0.8, shade(c, -0.15), 0.4); oval(g, x + 1, y + 0.7, 1, 0.8, shade(c, -0.15), -0.4);
    line(g, x, y - 1, x, y + 1.2, 0.35, '#2a2020');
  }
}

function coral(g, x, y, len, ang, w, color, depth) {
  const x2 = x + Math.sin(ang) * len, y2 = y - Math.cos(ang) * len;
  line(g, x, y, x2, y2, w, color);
  if (depth > 0) {
    coral(g, x2, y2, len * 0.72, ang - 0.55, w * 0.7, color, depth - 1);
    coral(g, x2, y2, len * 0.72, ang + 0.5, w * 0.7, color, depth - 1);
  } else dot(g, x2, y2, w * 0.75, shade(color, 0.3));
}

function underwater(g, R) {
  g.fillStyle = grad(g, 0, 0, 0, 75, [[0, '#2fc4d6'], [0.35, '#0e86b8'], [1, '#04304f']]);
  g.fillRect(0, 0, 100, 75);
  // sun rays
  for (let i = 0; i < 7; i++) {
    const x = 5 + i * 15 + R() * 6, w = 3 + R() * 5;
    poly(g, [[x, 0], [x + w, 0], [x + w + 12, 65], [x - 4, 65]], `rgba(255,255,220,${0.05 + R() * 0.06})`);
  }
  // seabed
  g.fillStyle = grad(g, 0, 60, 0, 75, [[0, '#d9b97a'], [1, '#8d6a3b']]);
  g.beginPath(); g.moveTo(0, 75); g.lineTo(0, 64); g.quadraticCurveTo(25, 59, 50, 64); g.quadraticCurveTo(78, 69, 100, 61); g.lineTo(100, 75); g.fill();
  for (let i = 0; i < 40; i++) oval(g, R() * 100, 66 + R() * 9, 0.4 + R() * 0.8, 0.3 + R() * 0.4, ['#e8d3a0', '#b08a52', '#f2e6c4'][i % 3]);
  // coral and weed
  const corals = [[10, 66, 9, '#ff6b81'], [18, 68, 7, '#ff9f43'], [78, 66, 10, '#c56cf0'], [88, 63, 8, '#ff6b81'], [60, 68, 6, '#ffa8a8']];
  for (const [x, y, len, c] of corals) coral(g, x, y, len, 0, len * 0.14, c, 3);
  for (let i = 0; i < 9; i++) {
    const x = 28 + R() * 40, h = 9 + R() * 12;
    g.strokeStyle = ['#2ecc71', '#1aa86a', '#4fe08a'][i % 3]; g.lineWidth = 1 + R() * 0.6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, 68);
    g.bezierCurveTo(x - 4, 68 - h * 0.35, x + 4, 68 - h * 0.7, x + (R() - 0.5) * 3, 68 - h);
    g.stroke();
  }
  // a big rock with a starfish and an anemone
  oval(g, 40, 70, 9, 4, '#4b5568'); oval(g, 38, 68.6, 6, 2.5, '#69758a');
  for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5; poly(g, [[44 + Math.cos(a + 0.35) * 0.9, 69 + Math.sin(a + 0.35) * 0.9], [44 + Math.cos(a) * 2.8, 69 + Math.sin(a) * 2.8], [44 + Math.cos(a - 0.35) * 0.9, 69 + Math.sin(a - 0.35) * 0.9]], '#ff6f3c'); }
  dot(g, 44, 69, 1, '#ff8c5a');
  // fish
  const school = [[26, 22, 1.3, 1, '#ffb703', '#fb5607', '#ffe29a'], [34, 28, 1, 1, '#ffb703', '#fb5607', '#ffe29a'], [22, 30, 0.9, 1, '#ffb703', '#fb5607', '#ffe29a'],
    [70, 18, 1.8, -1, '#4cc9f0', '#3a86ff', '#ffffff'], [54, 40, 2.4, -1, '#ff5d8f', '#c9184a', '#ffd6e0'], [14, 48, 2, 1, '#80ed99', '#38b000', '#d8f3dc'],
    [84, 40, 1.4, -1, '#9d4edd', '#5a189a', '#e0aaff'], [48, 56, 1.1, 1, '#ffd60a', '#ff9500', '#ffffff']];
  for (const [x, y, s, f, b, fin, st] of school) fish(g, x, y, s, f, b, fin, st);
  // jellyfish
  const jx = 60, jy = 14;
  g.fillStyle = rad(g, jx, jy, 0, 7, [[0, 'rgba(255,190,255,0.9)'], [1, 'rgba(200,120,255,0.55)']]);
  g.beginPath(); g.ellipse(jx, jy, 5.5, 4.2, 0, Math.PI, 0); g.quadraticCurveTo(jx, jy + 2, jx - 5.5, jy); g.fill();
  for (let i = 0; i < 6; i++) {
    g.strokeStyle = 'rgba(240,170,255,0.7)'; g.lineWidth = 0.4;
    const x = jx - 4 + i * 1.6;
    g.beginPath(); g.moveTo(x, jy + 0.5); g.bezierCurveTo(x - 1.5, jy + 4, x + 2, jy + 6, x - 0.5, jy + 10); g.stroke();
  }
  // bubbles
  for (let i = 0; i < 40; i++) {
    const x = R() * 100, y = R() * 62, r = 0.3 + R() * 1;
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 0.2;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
    dot(g, x - r * 0.35, y - r * 0.35, r * 0.25, 'rgba(255,255,255,0.7)');
  }
}

function planet(g, x, y, r, c0, c1, bands) {
  g.save();
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.clip();
  g.fillStyle = rad(g, x - r * 0.35, y - r * 0.35, r * 0.1, r * 1.3, [[0, c0], [1, c1]]);
  g.fillRect(x - r, y - r, r * 2, r * 2);
  bands.forEach(([o, h, col]) => { g.fillStyle = col; g.fillRect(x - r, y - r + o * r * 2, r * 2, h * r * 2); });
  g.fillStyle = rad(g, x - r * 0.5, y - r * 0.5, r * 0.6, r * 1.5, [[0, 'rgba(0,0,30,0)'], [1, 'rgba(0,0,30,0.78)']]);
  g.fillRect(x - r, y - r, r * 2, r * 2);
  g.restore();
}

function space(g, R) {
  g.fillStyle = grad(g, 0, 0, 100, 75, [[0, '#04041a'], [1, '#0a0526']]);
  g.fillRect(0, 0, 100, 75);
  g.globalCompositeOperation = 'screen';
  for (const [x, y, r, c] of [[25, 20, 34, '140,60,220'], [75, 55, 38, '30,160,200'], [60, 15, 26, '230,60,140'], [20, 62, 28, '60,80,230'], [88, 18, 20, '240,140,60']]) {
    g.fillStyle = rad(g, x, y, 0, r, [[0, `rgba(${c},0.4)`], [0.6, `rgba(${c},0.14)`], [1, `rgba(${c},0)`]]);
    g.fillRect(0, 0, 100, 75);
  }
  g.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 320; i++) dot(g, R() * 100, R() * 75, 0.06 + R() * R() * 0.3, `rgba(${200 + R() * 55},${200 + R() * 55},255,${0.3 + R() * 0.7})`);
  for (let i = 0; i < 9; i++) {
    const x = R() * 100, y = R() * 75, s = 0.8 + R() * 1.4;
    glow(g, '#ffffff', 2);
    line(g, x - s, y, x + s, y, 0.14, '#ffffff'); line(g, x, y - s, x, y + s, 0.14, '#ffffff');
    noGlow(g);
  }
  // big striped planet
  planet(g, 30, 52, 17, '#ffb86b', '#9c3d1d', [[0.18, 0.06, 'rgba(255,230,180,0.35)'], [0.34, 0.1, 'rgba(120,40,20,0.35)'], [0.55, 0.07, 'rgba(255,220,160,0.3)'], [0.7, 0.12, 'rgba(110,30,20,0.35)']]);
  dot(g, 36, 59, 2.4, 'rgba(160,50,30,0.55)');
  // ringed planet
  g.save();
  g.translate(74, 24); g.rotate(-0.38);
  const ring = (clipTop) => {
    g.save();
    g.beginPath(); g.rect(-30, clipTop ? -20 : 0, 60, 20); g.clip();
    for (const [rx, ry, col, w] of [[20, 4.6, 'rgba(235,215,170,0.85)', 1.5], [24, 5.7, 'rgba(190,160,120,0.7)', 1], [27, 6.4, 'rgba(240,225,190,0.45)', 0.7]]) {
      g.strokeStyle = col; g.lineWidth = w;
      g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); g.stroke();
    }
    g.restore();
  };
  ring(true);
  planet(g, 0, 0, 12, '#9be7ff', '#1d4f91', [[0.3, 0.08, 'rgba(255,255,255,0.18)'], [0.55, 0.06, 'rgba(10,40,100,0.25)']]);
  ring(false);
  g.restore();
  // moon with craters
  planet(g, 12, 14, 6, '#e8e8f0', '#6a6a82', []);
  for (const [x, y, r] of [[10, 12, 1.4], [14.5, 16, 1.1], [12, 17.6, 0.7], [15, 11.5, 0.8]]) { dot(g, x, y, r, 'rgba(90,90,110,0.5)'); dot(g, x - 0.2, y - 0.2, r * 0.7, 'rgba(255,255,255,0.15)'); }
  // small red planet and a comet
  planet(g, 50, 62, 3.4, '#ff8a8a', '#7a1f2c', []);
  g.save();
  g.translate(48, 10); g.rotate(0.45);
  g.fillStyle = grad(g, 0, 0, -26, 0, [[0, 'rgba(180,230,255,0.9)'], [1, 'rgba(180,230,255,0)']]);
  g.beginPath(); g.moveTo(0, -1); g.lineTo(-26, -0.2); g.lineTo(-26, 0.2); g.lineTo(0, 1); g.fill();
  glow(g, '#bfe9ff', 3); dot(g, 0, 0, 1.2, '#ffffff'); noGlow(g);
  g.restore();
  // a little rocket
  g.save();
  g.translate(60, 42); g.rotate(0.9);
  poly(g, [[-1.3, 2.2], [-3, 4.6], [-1.3, 4.1]], '#e63946'); poly(g, [[1.3, 2.2], [3, 4.6], [1.3, 4.1]], '#e63946');
  g.fillStyle = grad(g, -1.5, 0, 1.5, 0, [[0, '#ffffff'], [1, '#aab4c8']]);
  g.beginPath(); g.moveTo(0, -5); g.quadraticCurveTo(2.2, -2, 1.6, 4); g.lineTo(-1.6, 4); g.quadraticCurveTo(-2.2, -2, 0, -5); g.fill();
  poly(g, [[0, -5], [1.1, -3.3], [-1.1, -3.3]], '#e63946');
  dot(g, 0, -0.6, 0.9, '#3a86ff'); dot(g, -0.2, -0.8, 0.3, '#bde0ff');
  poly(g, [[-1, 4], [1, 4], [0, 8]], '#ff9f1c'); poly(g, [[-0.5, 4], [0.5, 4], [0, 6]], '#fff1a0');
  g.restore();
}

function mosaic(g, R) {
  const pal = ['#0b3954', '#087e8b', '#bfd7ea', '#ff5a5f', '#c81d25', '#f5b700', '#6a4c93', '#1b998b'];
  const cols = 20, rows = 15, cw = 100 / cols, ch = 75 / rows;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = i * cw, y = j * ch;
      const base = Math.floor((Math.sin(i * 0.55 + 1) + Math.cos(j * 0.5) + 2 + R() * 1.8) * 1.4);
      const tris = R() < 0.5
        ? [[[x, y], [x + cw, y], [x, y + ch]], [[x + cw, y], [x + cw, y + ch], [x, y + ch]]]
        : [[[x, y], [x + cw, y], [x + cw, y + ch]], [[x, y], [x + cw, y + ch], [x, y + ch]]];
      tris.forEach((pts, k) => poly(g, pts, shade(pal[(base + k * (1 + Math.floor(R() * 2))) % pal.length], (R() - 0.5) * 0.35)));
    }
  }
  g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 0.18;
  for (let i = 0; i <= cols; i++) { g.beginPath(); g.moveTo(i * cw, 0); g.lineTo(i * cw, 75); g.stroke(); }
  for (let j = 0; j <= rows; j++) { g.beginPath(); g.moveTo(0, j * ch); g.lineTo(100, j * ch); g.stroke(); }
  // three medallions of rings and petals
  const medal = (cx, cy, r, c1, c2, c3) => {
    dot(g, cx, cy, r + 0.8, 'rgba(255,255,255,0.9)');
    const rings = [c1, c2, c3, c1, c2, '#fdf6e3'];
    rings.forEach((c, k) => dot(g, cx, cy, r * (1 - k * 0.17), c));
    for (let p = 0; p < 12; p++) {
      const a = (p / 12) * Math.PI * 2;
      poly(g, [[cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.5], [cx + Math.cos(a + 0.2) * r * 0.78, cy + Math.sin(a + 0.2) * r * 0.78], [cx + Math.cos(a - 0.2) * r * 0.78, cy + Math.sin(a - 0.2) * r * 0.78]], p % 2 ? c3 : '#ffffff');
    }
    dot(g, cx, cy, r * 0.17, c1);
  };
  medal(28, 26, 17, '#c81d25', '#f5b700', '#087e8b');
  medal(72, 46, 20, '#0b3954', '#ff5a5f', '#f5b700');
  medal(86, 12, 9, '#6a4c93', '#1b998b', '#f5b700');
  medal(10, 62, 8, '#f5b700', '#c81d25', '#0b3954');
}

function autumn(g, R) {
  g.fillStyle = grad(g, 0, 0, 0, 56, [[0, '#f6c874'], [0.5, '#fbe3b0'], [1, '#fff3d8']]);
  g.fillRect(0, 0, 100, 75);
  g.fillStyle = rad(g, 52, 28, 0, 36, [[0, 'rgba(255,250,220,0.95)'], [0.35, 'rgba(255,235,170,0.5)'], [1, 'rgba(255,235,170,0)']]);
  g.fillRect(0, 0, 100, 75);
  const leaves = ['#d7491f', '#f08a1c', '#e8b923', '#a8321b', '#c9741a', '#8b8a1f', '#e86a2a'];
  const crown = (cx, cy, r, n, Rr, alpha) => {
    g.globalAlpha = alpha;
    for (let i = 0; i < n; i++) {
      const a = Rr() * Math.PI * 2, d = Math.sqrt(Rr()) * r;
      dot(g, cx + Math.cos(a) * d * 1.1, cy + Math.sin(a) * d * 0.9, r * (0.2 + Rr() * 0.22), leaves[Math.floor(Rr() * leaves.length)]);
    }
    g.globalAlpha = 1;
  };
  const trunk = (x, y, h, w, c) => {
    g.fillStyle = c;
    g.beginPath(); g.moveTo(x - w, y); g.quadraticCurveTo(x - w * 0.6, y - h * 0.5, x - w * 0.45, y - h); g.lineTo(x + w * 0.45, y - h); g.quadraticCurveTo(x + w * 0.6, y - h * 0.5, x + w, y); g.fill();
  };
  // layers of trees from far to near, with mist between
  const layer = (n, yBase, hMin, hMax, seed, alpha, trunkColor) => {
    const Rl = rng(seed);
    for (let i = 0; i < n; i++) {
      const x = (i + Rl() * 0.8) * (104 / n) - 2, h = hMin + Rl() * (hMax - hMin);
      trunk(x, yBase, h * 0.5, 0.5 + h * 0.03, trunkColor);
      crown(x, yBase - h * 0.7, h * 0.5, 14, Rl, alpha);
    }
  };
  layer(16, 44, 9, 15, 4, 0.55, '#a98a66');
  g.fillStyle = grad(g, 0, 36, 0, 48, [[0, 'rgba(255,245,215,0)'], [1, 'rgba(255,245,215,0.55)']]);
  g.fillRect(0, 36, 100, 12);
  layer(10, 50, 14, 22, 9, 0.8, '#8a6b4c');
  g.fillStyle = grad(g, 0, 44, 0, 54, [[0, 'rgba(255,240,205,0)'], [1, 'rgba(255,240,205,0.35)']]);
  g.fillRect(0, 44, 100, 10);
  // ground and path
  g.fillStyle = grad(g, 0, 48, 0, 75, [[0, '#b0702a'], [1, '#6b3d16']]);
  g.fillRect(0, 50, 100, 25);
  g.beginPath(); g.moveTo(47, 50); g.quadraticCurveTo(50, 62, 36, 75); g.lineTo(76, 75); g.quadraticCurveTo(56, 62, 53, 50); g.closePath();
  g.fillStyle = grad(g, 0, 50, 0, 75, [[0, '#f4d9a0'], [1, '#c9a064']]);
  g.fill();
  for (let i = 0; i < 160; i++) {
    const u = R(), y = 50.5 + u * 24.5, x = R() * 100;
    oval(g, x, y, 0.3 + u * 1.2, 0.2 + u * 0.6, leaves[Math.floor(R() * leaves.length)], R() * 3);
  }
  // big trees close up on both sides
  for (const [x, w, top] of [[10, 5, 10], [90, 5.5, 8]]) {
    trunk(x, 78, 52, w, '#4a3020');
    line(g, x - w * 0.2, 70, x - w * 0.2, 40, 0.3, 'rgba(0,0,0,0.25)');
    line(g, x, 28, x + (x < 50 ? 10 : -10), 16, 1.4, '#4a3020');
    crown(x, top + 8, 22, 70, rng(Math.floor(x)), 1);
    crown(x + (x < 50 ? 14 : -14), top + 18, 16, 40, rng(Math.floor(x) + 3), 1);
  }
  // mushrooms and falling leaves
  for (const [x, y, s] of [[26, 68, 1.2], [29.5, 70, 0.8], [76, 66, 1], [70, 71, 1.4]]) {
    poly(g, [[x - s * 0.5, y], [x - s * 0.4, y - s * 1.6], [x + s * 0.4, y - s * 1.6], [x + s * 0.5, y]], '#f3e7d3');
    g.fillStyle = '#d62828';
    g.beginPath(); g.ellipse(x, y - s * 1.6, s * 1.5, s * 1.1, 0, Math.PI, 0); g.fill();
    for (const [dx, dy] of [[-0.6, -2], [0.5, -2.3], [0.1, -1.9]]) dot(g, x + dx * s, y + dy * s * 0.9, s * 0.2, '#ffffff');
  }
  for (let i = 0; i < 16; i++) oval(g, 14 + R() * 72, 22 + R() * 40, 0.7, 0.4, leaves[i % leaves.length], R() * 3);
}

export const PICTURES = [
  { id: 'sunset', get name() { return t('Sunset'); }, seed: 1, paint: sunset },
  { id: 'mountains', get name() { return t('Mountains'); }, seed: 2, paint: mountains },
  { id: 'balloons', get name() { return t('Hot-air balloons'); }, seed: 3, paint: balloons },
  { id: 'city', get name() { return t('City at night'); }, seed: 4, paint: city },
  { id: 'flowers', get name() { return t('Flower field'); }, seed: 5, paint: flowers },
  { id: 'sea', get name() { return t('Under the sea'); }, seed: 6, paint: underwater },
  { id: 'space', get name() { return t('Outer space'); }, seed: 7, paint: space },
  { id: 'mosaic', get name() { return t('Mosaic'); }, seed: 8, paint: mosaic },
  { id: 'autumn', get name() { return t('Autumn forest'); }, seed: 9, paint: autumn },
];

// Paints picture `pic` onto a canvas of the given pixel size.
export function paintPicture(pic, canvas) {
  const g = canvas.getContext('2d');
  g.save();
  g.scale(canvas.width / VIEW_W, canvas.height / VIEW_H);
  pic.paint(g, rng(pic.seed * 7919));
  g.restore();
  return canvas;
}

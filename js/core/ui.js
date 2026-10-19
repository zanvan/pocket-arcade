// Shared helpers for every game: storage, settings, sound, vibration, dialogs, canvas.
import { t } from './i18n.js';

export const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('pa:' + key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try { localStorage.setItem('pa:' + key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
  },
  del(key) {
    try { localStorage.removeItem('pa:' + key); } catch { /* ignore */ }
  },
};

export const settings = Object.assign({ sound: true, vibrate: true }, store.get('settings', {}));
export function saveSettings() { store.set('settings', settings); }

// ---------- Sound: tiny synthesized effects, no audio files ----------
let ac = null;
let master = null;

function audio() {
  if (!settings.sound) return null;
  try {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0.55;
      master.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  } catch {
    return null;
  }
}

// Browsers only allow audio after a touch; unlock on the first one.
window.addEventListener('pointerdown', () => { if (settings.sound) audio(); }, { capture: true });

function tone(a, { f = 440, f2 = 0, t = 0, d = 0.08, type = 'sine', v = 0.2 }) {
  const o = a.createOscillator();
  const g = a.createGain();
  const s = a.currentTime + t + 0.005;
  o.type = type;
  o.frequency.setValueAtTime(f, s);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, s + d);
  g.gain.setValueAtTime(0.0001, s);
  g.gain.exponentialRampToValueAtTime(v, s + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, s + d);
  o.connect(g);
  g.connect(master);
  o.start(s);
  o.stop(s + d + 0.03);
}

const SOUNDS = {
  tap: [{ f: 660, d: 0.05, v: 0.1 }],
  select: [{ f: 520, f2: 760, d: 0.06, v: 0.1, type: 'triangle' }],
  move: [{ f: 330, d: 0.03, type: 'triangle', v: 0.08 }],
  rotate: [{ f: 500, f2: 680, d: 0.05, type: 'triangle', v: 0.1 }],
  place: [{ f: 240, f2: 130, d: 0.09, type: 'triangle', v: 0.28 }],
  drop: [{ f: 190, f2: 70, d: 0.13, type: 'triangle', v: 0.32 }],
  clear: [{ f: 523, d: 0.08, v: 0.13 }, { f: 659, d: 0.08, t: 0.06, v: 0.13 }, { f: 784, d: 0.14, t: 0.12, v: 0.13 }],
  big: [{ f: 523, d: 0.08, v: 0.13 }, { f: 659, d: 0.08, t: 0.06, v: 0.13 }, { f: 784, d: 0.08, t: 0.12, v: 0.13 }, { f: 1047, d: 0.25, t: 0.18, v: 0.14 }],
  bump: [{ f: 140, f2: 80, d: 0.16, type: 'square', v: 0.06 }],
  pour: [{ f: 300, f2: 640, d: 0.4, type: 'sine', v: 0.07 }],
  key: [{ f: 900, d: 0.025, v: 0.05, type: 'triangle' }],
  pop: [{ f: 700, f2: 1150, d: 0.07, v: 0.1 }],
  done: [{ f: 880, d: 0.06, v: 0.1 }, { f: 1320, d: 0.12, t: 0.06, v: 0.1 }],
  win: [{ f: 523, d: 0.12, v: 0.14 }, { f: 659, d: 0.12, t: 0.11, v: 0.14 }, { f: 784, d: 0.12, t: 0.22, v: 0.14 }, { f: 1047, d: 0.35, t: 0.33, v: 0.15 }],
  lose: [{ f: 392, d: 0.16, v: 0.11, type: 'triangle' }, { f: 311, d: 0.16, t: 0.15, v: 0.11, type: 'triangle' }, { f: 233, d: 0.4, t: 0.3, v: 0.11, type: 'triangle' }],
};

export function sfx(name) {
  const a = audio();
  if (!a) return;
  const parts = SOUNDS[name];
  if (!parts) return;
  try { for (const p of parts) tone(a, p); } catch { /* audio glitch: ignore */ }
}

export function haptic(ms = 12) {
  if (!settings.vibrate || !navigator.vibrate) return;
  try { navigator.vibrate(ms); } catch { /* ignore */ }
}

// ---------- DOM helpers ----------
export function el(tag, className, html) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (html != null) e.innerHTML = html;
  return e;
}

export function fmt(n) {
  return Math.round(n).toLocaleString('en-US');
}

// ---------- Modal dialogs ----------
const openModals = new Set();

export function modal({ title, html = '', buttons = [{ label: t('OK'), value: true, primary: true }], dismissable = true, onOpen }) {
  return new Promise((resolve) => {
    const backdrop = el('div', 'modal-backdrop');
    const card = el('div', 'modal');
    const h = el('h2');
    h.textContent = title;
    const body = el('div', 'modal-body', html);
    const row = el('div', 'modal-buttons');
    card.append(h, body, row);
    backdrop.append(card);

    let done = false;
    const entry = { close };
    function close(value) {
      if (done) return;
      done = true;
      openModals.delete(entry);
      backdrop.classList.remove('show');
      setTimeout(() => backdrop.remove(), 200);
      resolve(value);
    }
    for (const b of buttons) {
      const btn = el('button', b.primary ? 'primary' : '');
      btn.textContent = b.label;
      btn.addEventListener('click', () => { sfx('tap'); close(b.value); });
      row.append(btn);
    }
    backdrop.addEventListener('pointerdown', (e) => {
      if (e.target === backdrop && dismissable) close(null);
    });
    openModals.add(entry);
    document.body.append(backdrop);
    onOpen?.(body, close);
    requestAnimationFrame(() => backdrop.classList.add('show'));
  });
}

export function closeAllModals() {
  for (const m of [...openModals]) m.close(null);
}

export function anyModalOpen() {
  return openModals.size > 0;
}

let toastEl = null;
let toastTimer = 0;
export function toast(text, ms = 1600) {
  if (!toastEl) {
    toastEl = el('div', 'toast');
    document.body.append(toastEl);
  }
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
}

// A message from one game must not linger over the next screen.
export function hideToast() {
  clearTimeout(toastTimer);
  toastEl?.classList.remove('show');
}

// ---------- Canvas surface that tracks its container's size ----------
export function surface(parent, onResize) {
  const canvas = document.createElement('canvas');
  parent.append(canvas);
  const ctx = canvas.getContext('2d');
  const s = { canvas, ctx, w: 0, h: 0, dpr: 1 };

  let alive = true;
  function fit(notify = true) {
    if (!alive) return;
    const r = parent.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.max(1, Math.floor(r.width));
    const h = Math.max(1, Math.floor(r.height));
    if (w === s.w && h === s.h && dpr === s.dpr) return;
    s.w = w; s.h = h; s.dpr = dpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    if (notify) onResize?.(s);
  }
  const ro = new ResizeObserver(() => fit());
  ro.observe(parent);
  // Size now, but tell the game only after its mount() has finished running.
  fit(false);
  queueMicrotask(() => { if (alive) onResize?.(s); });

  // Call at the start of each frame: clears and sets the pixel-ratio transform.
  s.begin = () => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
  };
  s.point = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  s.destroy = () => { alive = false; ro.disconnect(); };
  return s;
}

// ---------- Animation loop that sleeps when nothing moves (saves battery) ----------
// step(dt) returns true while it wants more frames.
export function loop(step) {
  let id = 0;
  let last = 0;
  function frame(t) {
    const dt = last ? Math.min((t - last) / 1000, 0.05) : 0;
    last = t;
    let more = false;
    try { more = step(dt); } catch (err) { console.error(err); }
    if (more) id = requestAnimationFrame(frame);
    else { id = 0; last = 0; }
  }
  return {
    kick() { if (!id) id = requestAnimationFrame(frame); },
    stop() { if (id) cancelAnimationFrame(id); id = 0; last = 0; },
  };
}

export const ease = {
  out: (t) => 1 - (1 - t) * (1 - t),
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  outBack: (t) => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
};

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }

export function rrect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function shade(hex, amt) {
  // amt in [-1, 1]: negative darkens, positive lightens.
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  r = Math.round((t - r) * p + r);
  g = Math.round((t - g) * p + g);
  b = Math.round((t - b) * p + b);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

// A glossy block, used by Blocks and Block Blast. Cached per color and size.
const blockCache = new Map();
export function blockSprite(color, size, dpr) {
  const key = color + '|' + size + '|' + dpr;
  let c = blockCache.get(key);
  if (c) return c;
  if (blockCache.size > 400) blockCache.clear();
  c = document.createElement('canvas');
  const px = Math.max(1, Math.round(size * dpr));
  c.width = c.height = px;
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const r = size * 0.18;
  const inset = Math.max(0.5, size * 0.04);
  const grad = g.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, shade(color, 0.18));
  grad.addColorStop(1, shade(color, -0.12));
  rrect(g, inset, inset, size - inset * 2, size - inset * 2, r);
  g.fillStyle = grad;
  g.fill();
  // top shine
  rrect(g, size * 0.16, size * 0.12, size * 0.68, size * 0.2, size * 0.1);
  g.fillStyle = 'rgba(255,255,255,0.28)';
  g.fill();
  // bottom edge shadow
  rrect(g, inset, size * 0.78, size - inset * 2, size * 0.18 - inset, r * 0.6);
  g.fillStyle = 'rgba(0,0,0,0.16)';
  g.fill();
  blockCache.set(key, c);
  return c;
}

export function drawBlock(ctx, color, x, y, size, dpr, alpha = 1) {
  const spr = blockSprite(color, size, dpr);
  if (alpha !== 1) ctx.globalAlpha = alpha;
  ctx.drawImage(spr, x, y, size, size);
  if (alpha !== 1) ctx.globalAlpha = 1;
}

// Floating score text, used by several games.
export class Floaters {
  constructor() { this.items = []; }
  add(text, x, y, color = '#fff', size = 22) { this.items.push({ text, x, y, color, size, t: 0 }); }
  update(dt) {
    for (const f of this.items) f.t += dt;
    this.items = this.items.filter((f) => f.t < 1.1);
    return this.items.length > 0;
  }
  draw(ctx) {
    for (const f of this.items) {
      const a = f.t < 0.8 ? 1 : 1 - (f.t - 0.8) / 0.3;
      ctx.globalAlpha = Math.max(0, a);
      ctx.font = `800 ${f.size}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      const y = f.y - ease.out(Math.min(1, f.t / 0.9)) * 40;
      // Text with no Hebrew in it (like "+40") must not be mirrored by the page's rtl direction.
      const dir = ctx.direction;
      if (!/[\u0590-\u05ff]/.test(f.text)) ctx.direction = 'ltr';
      ctx.strokeText(f.text, f.x, y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, y);
      ctx.direction = dir;
    }
    ctx.globalAlpha = 1;
  }
}

// Level navigation bar shared by the level-based games.
export function levelBar(parent, { onPrev, onNext }) {
  const bar = el('div', 'levelbar');
  const prev = el('button', 'icon-btn', ICONS.chevL);
  const lv = el('div', 'lv');
  const next = el('button', 'icon-btn', ICONS.chevR);
  prev.setAttribute('aria-label', t('Previous level'));
  next.setAttribute('aria-label', t('Next level'));
  prev.addEventListener('click', () => { sfx('tap'); onPrev(); });
  next.addEventListener('click', () => { sfx('tap'); onNext(); });
  bar.append(prev, lv, next);
  parent.append(bar);
  return {
    bar,
    set(level, maxLevel) {
      lv.textContent = t('Level {n}', { n: level });
      prev.disabled = level <= 1;
      next.disabled = level >= maxLevel;
    },
  };
}

export const ICONS = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  chevL: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 6l-6 6 6 6"/></svg>',
  chevR: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 6l6 6-6 6"/></svg>',
  restart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/></svg>',
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
  help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.6 2.6 0 0 1 5 .8c0 1.8-2.5 2.2-2.5 3.7"/><circle cx="12" cy="17" r=".6" fill="currentColor"/></svg>',
  hint: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>',
  stats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><path d="M5 20V12M12 20V5M19 20v-5"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  heart: '<svg viewBox="0 0 24 24"><path fill="#ff5d6c" d="M12 21s-7.5-4.6-9.5-9.2C1 8.3 3.3 4.5 7 4.5c2.1 0 3.6 1.1 5 3 1.4-1.9 2.9-3 5-3 3.7 0 6 3.8 4.5 7.3C19.5 16.4 12 21 12 21z"/></svg>',
  heartOff: '<svg viewBox="0 0 24 24"><path fill="none" stroke="#5a6078" stroke-width="2" d="M12 20s-7.2-4.4-9-8.7C1.6 8 3.7 5 7 5c2 0 3.5 1.2 5 3 1.5-1.8 3-3 5-3 3.3 0 5.4 3 4 6.3-1.8 4.3-9 8.7-9 8.7z"/></svg>',
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9l7 7 7-7"/></svg>',
  drop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 5l6 6 6-6M6 11l6 6 6-6"/><path d="M5 21h14"/></svg>',
  rotCW: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4.5h-4.5"/></svg>',
  rotCCW: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/></svg>',
  backspace: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z"/><path d="M17 9l-6 6M11 9l6 6"/></svg>',
};

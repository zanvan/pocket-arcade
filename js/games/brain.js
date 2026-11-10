import { t, addHebrew } from '../core/i18n.js';
import he from '../i18n/he/brain.js';
import { PUZZLES } from './brain-puzzles.js';
import { el, levelBar, ICONS } from '../core/ui.js';

addHebrew(he);

const N = PUZZLES.length;

function icon() {
  return `<svg viewBox="0 0 64 64"><rect x="6" y="6" width="52" height="52" rx="14" fill="#2b2350"/>
    <path d="M32 14c-9 0-15 6-15 13 0 5 3 8 6 10 1.6 1 2 2.4 2 4v3h14v-3c0-1.6.4-3 2-4 3-2 6-5 6-10 0-7-6-13-15-13z" fill="#ffc857"/>
    <path d="M26 49h12M27.5 53h9" stroke="#ffc857" stroke-width="3" stroke-linecap="round"/>
    <text x="32" y="36" text-anchor="middle" font-size="18" font-weight="800" fill="#2b2350" font-family="system-ui,sans-serif">?</text></svg>`;
}

// A scene is a square; 1em inside it is 1% of its width, so puzzles size things in percent.
function makeScene(root, hooks) {
  const items = [];
  const timers = [];
  let solved = false;

  const rel = (e) => {
    const r = root.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
  };

  const sc = {
    root,
    // Adds a thing to the scene. e: an emoji, or html: markup. x, y: its centre (0-100).
    // s: size in % of the scene (for emoji and text), w/h: box size in %. drag: true, or 'x'.
    add({ e, html, x = 50, y = 50, s = 10, w, h, z = 1, drag = false }) {
      const node = el('div', 'bt-item');
      if (e != null) node.textContent = e; else node.innerHTML = html;
      node.style.fontSize = s + 'em';
      node.style.zIndex = z;
      if (w != null) { node.style.width = w + '%'; node.style.height = h + '%'; }
      root.append(node);
      const it = {
        node, x, y, hx: x, hy: y, drag, onTap: null, onDrop: null,
        set(nx, ny, secs = 0) {
          it.x = nx; it.y = ny;
          node.style.transition = secs ? `left ${secs}s ease-in, top ${secs}s ease-in` : '';
          node.style.left = nx + '%';
          node.style.top = ny + '%';
        },
        home() { it.set(it.hx, it.hy, 0.25); },
        size(ns) { node.style.fontSize = ns + 'em'; },
        hide() { node.style.display = 'none'; },
        show() { node.style.display = ''; },
      };
      it.set(x, y);

      let start = null;
      node.addEventListener('pointerdown', (ev) => {
        if (solved) return;
        ev.stopPropagation();
        const p = rel(ev);
        start = { px: p.x, py: p.y, ox: it.x - p.x, oy: it.y - p.y, moved: 0 };
        if (it.drag) {
          node.setPointerCapture?.(ev.pointerId);
          node.classList.add('held');
        }
      });
      node.addEventListener('pointermove', (ev) => {
        if (!start || !it.drag || solved) return;
        const p = rel(ev);
        start.moved = Math.max(start.moved, Math.hypot(p.x - start.px, p.y - start.py));
        const nx = Math.max(0, Math.min(100, p.x + start.ox));
        const ny = it.drag === 'x' ? it.y : Math.max(0, Math.min(100, p.y + start.oy));
        it.set(nx, ny);
      });
      const end = (ev, cancelled) => {
        if (!start) return;
        const moved = start.moved;
        start = null;
        node.classList.remove('held');
        if (solved || cancelled) return;
        if (it.drag && moved > 3) it.onDrop?.(it);
        else if (it.onTap) it.onTap(it);
        else if (it.drag) it.onDrop?.(it);
        ev.stopPropagation();
      };
      node.addEventListener('pointerup', (ev) => end(ev, false));
      node.addEventListener('pointercancel', (ev) => end(ev, true));
      items.push(it);
      return it;
    },
    dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); },
    win(delay = 250) {
      if (solved) return;
      solved = true;
      timers.push(setTimeout(() => hooks.win(), delay));
    },
    wrong(msg) { if (!solved) hooks.wrong(msg); },
    sound(name) { hooks.sound(name); },
    onToken(name, fn) { hooks.token(name, fn); },
    get solved() { return solved; },
    destroy() { timers.forEach(clearTimeout); },
  };
  return sc;
}

export default {
  id: 'brain',
  added: '2026-11-10',   // the menu marks it New for a few weeks, until it is opened
  get title() { return t('Brain Teasers'); },
  icon: icon(),
  info: (store) => {
    const done = (store.get('brain.done', []) || []).length;
    return done ? t('{n} of {total} solved', { n: done, total: N }) : t('Tricky puzzles: think twice');
  },
  get help() {
    return t('<ul><li>Every level is a little puzzle with a trick. Read the question carefully: the obvious answer is often wrong.</li><li>Tap, drag things around, choose an answer or type a number.</li><li>Stuck? <b>Hint</b> gives you a clue. <b>Restart</b> puts the puzzle back as it was.</li><li>Solve a puzzle to open the next one.</li></ul>');
  },

  mount(root, app) {
    let level = Math.min(N, Math.max(1, app.store.get('brain.level', 1)));
    let maxLevel = Math.min(N, Math.max(level, app.store.get('brain.max', 1)));
    let sc = null;
    let destroyed = false;
    let typed = '';
    let tokens = {};
    let winTimer = 0;

    const lb = levelBar(root, {
      onPrev: () => go(level - 1),
      onNext: () => go(level + 1),
    });
    const wrap = el('div', 'bt');
    const q = el('div', 'bt-q');
    const holder = el('div', 'bt-holder');
    const scene = el('div', 'bt-scene');
    holder.append(scene);
    const ans = el('div', 'bt-ans');
    wrap.append(q, holder, ans);
    root.append(wrap);

    app.action(ICONS.hint, t('Hint'), showHint);
    app.action(ICONS.restart, t('Restart'), () => { app.sfx('tap'); load(); });

    // Keep the scene square and as large as the space allows.
    const fit = () => {
      const r = holder.getBoundingClientRect();
      const size = Math.max(60, Math.floor(Math.min(r.width - 16, r.height - 8)));
      scene.style.width = scene.style.height = size + 'px';
      scene.style.fontSize = size / 100 + 'px';
    };
    const ro = new ResizeObserver(fit);
    ro.observe(holder);

    function go(n) {
      if (n < 1 || n > maxLevel) return;
      level = n;
      app.store.set('brain.level', level);
      load();
    }

    function load() {
      clearTimeout(winTimer);
      sc?.destroy();
      scene.replaceChildren();
      scene.classList.remove('solved', 'shake');
      scene.style.background = '';
      ans.replaceChildren();
      tokens = {};
      typed = '';
      lb.set(level, maxLevel);
      const P = PUZZLES[level - 1];
      const tok = (name, html) => `<button class="tok" data-tok="${name}">${html}</button>`;
      // One inline box, so the question's text and tokens flow as one right-to-left line.
      q.innerHTML = `<span>${P.q(tok)}</span>`;
      q.querySelectorAll('[data-tok]').forEach((b) => b.addEventListener('click', () => {
        if (sc?.solved) return;
        const fn = tokens[b.dataset.tok];
        if (fn) fn(b);
      }));

      sc = makeScene(scene, {
        win: () => solved(),
        wrong: (msg) => wrong(msg),
        sound: (n) => app.sfx(n),
        token: (name, fn) => { tokens[name] = fn; },
      });
      try { P.build?.(sc); } catch (err) { console.error(err); }

      if (P.answer?.choices) {
        const list = P.answer.choices();
        list.forEach((label, i) => {
          const b = el('button', 'bt-choice');
          b.textContent = label;
          b.addEventListener('click', () => {
            if (sc.solved) return;
            if (i === P.answer.correct) { b.classList.add('right'); sc.win(350); }
            else { b.classList.add('nope'); setTimeout(() => b.classList.remove('nope'), 500); wrong(); }
          });
          ans.append(b);
        });
        ans.className = 'bt-ans choices' + (list.length > 3 ? ' grid' : '');
      } else if (P.answer?.number != null) {
        ans.className = 'bt-ans pad';
        const show = el('div', 'bt-typed');
        const keys = el('div', 'bt-keys');
        const render = () => { show.textContent = typed || '?'; show.classList.toggle('empty', !typed); };
        for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok']) {
          const b = el('button', 'bt-key' + (k === 'ok' ? ' ok' : ''));
          if (k === 'del') { b.innerHTML = ICONS.backspace; b.setAttribute('aria-label', t('Delete')); }
          else if (k === 'ok') b.textContent = t('OK');
          else b.textContent = k;
          b.addEventListener('click', () => {
            if (sc.solved) return;
            if (k === 'del') typed = typed.slice(0, -1);
            else if (k === 'ok') {
              if (!typed) return;
              if (+typed === P.answer.number) { show.classList.add('right'); sc.win(350); return; }
              wrong();
              typed = '';
            } else if (typed.length < 4) typed = (typed === '0' ? '' : typed) + k;
            app.sfx('key');
            render();
          });
          keys.append(b);
        }
        render();
        ans.append(show, keys);
      } else {
        ans.className = 'bt-ans';
      }
      fit();
    }

    function wrong(msg) {
      app.sfx('bump');
      app.haptic(40);
      scene.classList.remove('shake');
      void scene.offsetWidth; // restart the animation
      scene.classList.add('shake');
      app.toast(msg || t('Not quite. Try again!'), 1500);
    }

    function solved() {
      if (destroyed) return;
      scene.classList.add('solved');
      app.sfx('win');
      app.haptic(30);
      const done = new Set(app.store.get('brain.done', []) || []);
      done.add(PUZZLES[level - 1].id);
      app.store.set('brain.done', [...done]);
      if (level === maxLevel && maxLevel < N) {
        maxLevel++;
        app.store.set('brain.max', maxLevel);
      }
      lb.set(level, maxLevel);
      winTimer = setTimeout(async () => {
        if (destroyed) return;
        const all = done.size >= N;
        const last = level >= N;
        const v = await app.modal({
          title: all && last ? t('You solved them all!') : t('Solved!'),
          html: `<p style="text-align:center">${all && last ? t('Every puzzle is done. You think in a twisty way!') : t('Level {n} of {total} done.', { n: level, total: N })}</p>`,
          buttons: last
            ? [{ label: t('Close'), value: false, primary: true }]
            : [{ label: t('Close'), value: false }, { label: t('Next level'), value: true, primary: true }],
        });
        if (v && !destroyed) go(level + 1);
      }, 600);
    }

    async function showHint() {
      if (!sc) return;
      const P = PUZZLES[level - 1];
      await app.modal({ title: t('Hint'), html: `<p style="text-align:center">${P.hint()}</p>` });
    }

    load();

    return {
      destroy() {
        destroyed = true;
        clearTimeout(winTimer);
        sc?.destroy();
        ro.disconnect();
      },
    };
  },
};

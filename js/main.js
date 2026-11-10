import { el, sfx, haptic, store, modal, toast, hideToast, closeAllModals, settings, saveSettings, ICONS } from './core/ui.js';
import { t, lang, setLang, addHebrew, applyDocumentLang } from './core/i18n.js';
import heCore from './i18n/he/core.js';
import blocks from './games/tetris.js';
import blockblast from './games/blockblast.js';
import word from './games/wordle.js';
import watersort from './games/watersort.js';
import flow from './games/flow.js';
import arrows from './games/arrows.js';
import carjam from './games/carjam.js';
import mahjong from './games/mahjong.js';
import backgammon from './games/backgammon.js';
import chess from './games/chess.js';
import bubbles from './games/bubbles.js';
import dotsu from './games/dotsu.js';
import jigsaw from './games/jigsaw.js';
import checkers from './games/checkers.js';
import billiard from './games/billiard.js';
import brain from './games/brain.js';
import { orderGames, SORTS } from './core/order.js';

addHebrew(heCore);
applyDocumentLang();

const VERSION = '5636d2ac80';
// The default order: used for games never played, and as the start of "My order".
const GAMES = [checkers, billiard, brain, mahjong, backgammon, chess, bubbles, dotsu, jigsaw, blocks, blockblast, word, watersort, flow, arrows, carjam];
const app = document.getElementById('app');
const shared = { sfx, haptic, store, modal, toast };

let current = null;      // { game, inst }
let enteredFromMenu = false;
let installPrompt = null;
let offlineReady = false;
let updatePending = false; // a new service worker took over while a game was open
let arranging = false;     // the menu is in "drag to reorder" mode

// Reloads onto the new code and tells the user afterwards. Called on the menu only.
function reloadForUpdate() {
  try { sessionStorage.setItem('pa:updated', '1'); } catch { /* ignore */ }
  location.reload();
}

function route() {
  const id = location.hash.replace(/^#\/?/, '');
  closeAllModals();
  hideToast();
  if (current) {
    try { current.inst?.destroy?.(); } catch (e) { console.error(e); }
    current = null;
  }
  app.replaceChildren();
  const game = GAMES.find((g) => g.id === id);
  if (game) showGame(game);
  else if (updatePending) reloadForUpdate();
  else showMenu();
}

function showMenu() {
  enteredFromMenu = false;
  const screen = el('div', 'screen menu');
  const head = el('div', 'menu-head');
  head.innerHTML = `
    <img class="logo" src="icons/icon-192.png" alt="">
    <div class="grow"><h1>${t('Pocket Arcade')}</h1>
      <div class="sub ${offlineReady ? 'ready' : ''}"><span class="dot"></span><span class="st">${offlineReady ? t('Ready to play offline') : t('Getting offline copy…')}</span></div>
    </div>`;
  const gear = el('button', 'icon-btn', ICONS.gear);
  gear.setAttribute('aria-label', t('Settings'));
  gear.addEventListener('click', () => { sfx('tap'); openSettings(); });
  head.append(gear);

  const played = store.get('played', {}) || {};
  // A recently added game is marked New until it is opened ("seen:" also covers games opened
  // before the menu kept a play history).
  const isNew = (g) => g.added && Date.now() - Date.parse(g.added) < 45 * 864e5 && !played[g.id] && !store.get('seen:' + g.id, false);
  let sort = store.get('menu.sort', 'recent');
  if (!SORTS.includes(sort)) sort = 'recent';

  // Sort choice, and the button that lets you drag the games into your own order.
  const tools = el('div', 'menu-tools');
  const seg = el('div', 'seg');
  const sortLabel = { recent: t('Last played'), name: t('A–Z'), custom: t('My order') };
  for (const k of SORTS) {
    const b = el('button', k === sort ? 'on' : '');
    b.textContent = sortLabel[k];
    b.addEventListener('click', () => {
      sfx('tap');
      store.set('menu.sort', k);
      arranging = false;
      route();
    });
    seg.append(b);
  }
  const arrange = el('button', 'pill' + (arranging ? ' primary' : ''), arranging ? t('Done') : `${ICONS.move}<span>${t('Arrange')}</span>`);
  arrange.addEventListener('click', () => {
    sfx('tap');
    if (!arranging) store.set('menu.sort', 'custom');
    arranging = !arranging;
    route();
  });
  // Grid shows big tiles; list shows one short row per game. Arranging always uses the list,
  // so a finger on a row scrolls and only the arrows or the grip move a game.
  const view = store.get('menu.view', 'grid') === 'list' ? 'list' : 'grid';
  const right = el('div', 'menu-right');
  if (!arranging) {
    const other = view === 'list' ? 'grid' : 'list';
    const vb = el('button', 'icon-btn view-btn', ICONS[other]);
    vb.setAttribute('aria-label', other === 'list' ? t('Show as a list') : t('Show as tiles'));
    vb.addEventListener('click', () => { sfx('tap'); store.set('menu.view', other); route(); });
    right.append(vb);
  }
  right.append(arrange);
  tools.append(seg, right);

  const order = orderGames(GAMES, sort, { played, custom: store.get('menu.order', []), lang });
  const asList = arranging || view === 'list';
  const cards = el('div', 'cards' + (asList ? ' list' : '') + (arranging ? ' arranging' : ''));
  for (const g of order) {
    // While arranging a row holds buttons of its own, so it cannot be a button itself.
    const card = el(arranging ? 'div' : 'button', 'card');
    card.dataset.id = g.id;
    card.innerHTML = `${g.icon}<div class="text"><div class="name">${g.title}</div><div class="info"></div></div>`;
    try { card.querySelector('.info').textContent = g.info?.(store) || g.tagline || ''; } catch { /* ignore */ }
    if (arranging) {
      card.insertAdjacentHTML('beforeend', `<div class="move-btns">
        <button class="icon-btn up" aria-label="${t('Move up')}">${ICONS.up}</button>
        <button class="icon-btn dn" aria-label="${t('Move down')}">${ICONS.down}</button></div>
        <span class="grip" aria-hidden="true">${ICONS.grip}</span>`);
    } else if (isNew(g)) {
      card.insertAdjacentHTML('beforeend', `<span class="new">${t('New')}</span>`);
    }
    card.addEventListener('click', () => {
      if (arranging) return;
      sfx('select');
      haptic(8);
      enteredFromMenu = true;
      location.hash = '#' + g.id;
    });
    cards.append(card);
  }
  if (arranging) enableReorder(cards, screen);
  const tip = el('p', 'menu-tip', arranging ? t('Tap the arrows to move a game up or down, or drag it by the dots. Tap Done when you finish.') : '');
  // While arranging, the buttons and the tip stay at the top, so Done is always in reach.
  const bar = el('div', 'menu-bar' + (arranging ? ' stuck' : ''));
  bar.append(tools, tip);

  const foot = el('div', 'menu-foot');
  if (installPrompt) {
    const inst = el('button', 'pill primary', `${ICONS.download}<span>${t('Install app')}</span>`);
    inst.addEventListener('click', async () => {
      const p = installPrompt;
      installPrompt = null;
      inst.remove();
      try { await p.prompt(); } catch { /* ignore */ }
    });
    foot.append(inst);
  }
  const share = el('button', 'pill', `${ICONS.share}<span>${t('Share with family')}</span>`);
  share.addEventListener('click', shareApp);
  // The switch names the other language in that language, so either reader can find it.
  const langBtn = el('button', 'pill', lang === 'he' ? 'English' : 'עברית');
  langBtn.addEventListener('click', () => { sfx('tap'); setLang(lang === 'he' ? 'en' : 'he'); });
  foot.append(share, langBtn);

  screen.append(head, bar, cards, foot);
  app.append(screen);
}

function showGame(game) {
  const played = store.get('played', {}) || {};
  played[game.id] = Date.now();
  store.set('played', played);
  arranging = false;
  const screen = el('div', 'screen');
  const bar = el('header', 'topbar');
  const back = el('button', 'icon-btn back', ICONS.back);
  back.setAttribute('aria-label', t('Back to menu'));
  back.addEventListener('click', () => {
    sfx('tap');
    if (enteredFromMenu) history.back();
    else location.replace(location.pathname + location.search + '#');
  });
  const title = el('h1');
  title.textContent = game.title;
  const actions = el('div', 'actions');
  actions.style.display = 'flex';
  actions.style.gap = '6px';
  bar.append(back, title, actions);
  const body = el('main', 'game-body');
  screen.append(bar, body);
  app.append(screen);

  const ctx = {
    ...shared,
    // Adds a button to the top bar. Returns the button so the game can update it.
    action(icon, label, onClick) {
      const b = el('button', 'icon-btn badge', icon);
      b.setAttribute('aria-label', label);
      b.addEventListener('click', () => { sfx('tap'); onClick(); });
      actions.append(b);
      return b;
    },
    setTitle(t) { title.textContent = t; },
  };
  try {
    current = { game, inst: game.mount(body, ctx) };
  } catch (err) {
    console.error(err);
    body.innerHTML = `<p style="padding:20px">${t('Something went wrong starting this game.')}</p>`;
  }
  if (!store.get('seen:' + game.id, false) && game.help) {
    store.set('seen:' + game.id, true);
    current?.inst?.pause?.(true);
    modal({ title: game.title, html: game.help, buttons: [{ label: t('Play'), value: true, primary: true }] })
      .then(() => current?.inst?.resume?.());
  }
}

// Arranging: the arrows move a row one step; the grip drags it. The rows themselves scroll
// like any list. The new order is saved as "My order".
function enableReorder(cards, scroller) {
  let drag = null;
  let scrollTimer = 0;
  const save = () => store.set('menu.order', [...cards.children].map((c) => c.dataset.id));
  // The first row cannot go up and the last cannot go down.
  const refresh = () => {
    const list = [...cards.children];
    list.forEach((c, i) => {
      c.querySelector('.up').disabled = i === 0;
      c.querySelector('.dn').disabled = i === list.length - 1;
    });
  };
  const flash = (card) => {
    card.classList.remove('moved');
    void card.offsetWidth; // restart the animation
    card.classList.add('moved');
  };

  cards.addEventListener('click', (e) => {
    const btn = e.target.closest('.up, .dn');
    if (!btn || btn.disabled) return;
    const card = btn.closest('.card');
    const up = btn.classList.contains('up');
    const sib = up ? card.previousElementSibling : card.nextElementSibling;
    if (!sib) return;
    if (up) sib.before(card); else sib.after(card);
    sfx('move');
    haptic(6);
    refresh();
    save();
    flash(card);
    // Keep the moved game and the button under the finger, so pressing again keeps moving it.
    const still = card.querySelector(up ? '.up' : '.dn');
    (still.disabled ? card.querySelector(up ? '.dn' : '.up') : still).focus({ preventScroll: true });
    card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  const over = (x, y) => {
    const hit = document.elementFromPoint(x, y)?.closest('.card');
    if (!hit || hit === drag.card || hit.parentNode !== cards) return;
    const list = [...cards.children];
    if (list.indexOf(drag.card) < list.indexOf(hit)) hit.after(drag.card);
    else hit.before(drag.card);
    haptic(6);
  };
  // Near the top or bottom edge, the menu scrolls so a row can travel the whole list.
  const autoScroll = () => {
    if (!drag) return;
    const r = scroller.getBoundingClientRect();
    const edge = 70;
    const v = drag.y < r.top + edge ? -10 : drag.y > r.bottom - edge ? 10 : 0;
    if (v) { scroller.scrollTop += v; over(drag.x, drag.y); }
    scrollTimer = requestAnimationFrame(autoScroll);
  };
  const move = (e) => {
    if (!drag) return;
    drag.x = e.clientX; drag.y = e.clientY;
    over(e.clientX, e.clientY);
  };
  const end = () => {
    if (!drag) return;
    drag.card.classList.remove('dragging');
    drag = null;
    cancelAnimationFrame(scrollTimer);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    refresh();
    save();
  };
  // Only the grip starts a drag. Anywhere else on a row, a finger scrolls the list.
  cards.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest('.grip');
    if (!grip || drag) return;
    e.preventDefault();
    drag = { card: grip.closest('.card'), x: e.clientX, y: e.clientY };
    drag.card.classList.add('dragging');
    sfx('tap');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    scrollTimer = requestAnimationFrame(autoScroll);
  });
  refresh();
  save(); // "My order" starts from what is on screen now
}

async function shareApp() {
  sfx('tap');
  const url = location.href.split('#')[0];
  const text = t('Pocket Arcade: {n} games that work offline. Open the link in Chrome (Android) or Safari (iPhone), then install it to your home screen.', { n: GAMES.length });
  if (navigator.share) {
    try { await navigator.share({ title: t('Pocket Arcade'), text, url }); return; } catch { /* cancelled */ }
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    toast(t('Link copied'));
  } catch {
    modal({ title: t('Share'), html: `<p>${t('Send this link:')}</p><p><b>${url}</b></p>` });
  }
}

function openSettings() {
  const row = (key, label) => `<div class="toggle-row"><span>${label}</span><button class="switch ${settings[key] ? 'on' : ''}" data-key="${key}" aria-label="${label}"></button></div>`;
  modal({
    title: t('Settings'),
    html: `<div class="toggle-row"><span>${t('Language')}</span><div class="seg">
        <button data-lang="he" class="${lang === 'he' ? 'on' : ''}">עברית</button><button data-lang="en" class="${lang === 'en' ? 'on' : ''}">English</button></div></div>
      ${row('sound', t('Sound effects'))}${row('vibrate', t('Vibration'))}
      <p style="margin-top:14px"><b>${offlineReady ? t('Offline copy saved.') : t('Offline copy not ready yet.')}</b>
      ${offlineReady ? t('All games work in flight mode.') : t('Keep the app open on Wi‑Fi for a few seconds.')}</p>
      <p><b>${t('Install on Android:')}</b> ${t('open the link in Chrome, tap ⋮ then “Add to Home screen” → “Install”.')}<br>
      <b>${t('Install on iPhone:')}</b> ${t('open in Safari, tap Share then “Add to Home Screen”.')}</p>
      <p style="font-size:12px">${t('Version {v}', { v: VERSION })}</p>`,
    buttons: [{ label: t('Done'), value: true, primary: true }],
    onOpen(body) {
      body.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => {
        if (b.dataset.lang !== lang) setLang(b.dataset.lang);
      }));
      body.querySelectorAll('.switch').forEach((sw) => sw.addEventListener('click', () => {
        const k = sw.dataset.key;
        settings[k] = !settings[k];
        sw.classList.toggle('on', settings[k]);
        saveSettings();
        if (k === 'sound' && settings.sound) sfx('select');
        if (k === 'vibrate' && settings.vibrate) haptic(30);
      }));
    },
  });
}

function setOfflineReady() {
  offlineReady = true;
  const sub = document.querySelector('.menu-head .sub');
  if (sub) {
    sub.classList.add('ready');
    sub.querySelector('.st').textContent = t('Ready to play offline');
  }
}

window.addEventListener('hashchange', route);
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  if (!current) route();
});
window.addEventListener('appinstalled', () => { installPrompt = null; toast(t('Installed — find Arcade on your home screen')); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) current?.inst?.pause?.();
});
document.addEventListener('contextmenu', (e) => e.preventDefault());

if ('serviceWorker' in navigator) {
  // updateViaCache 'none': the browser never answers an update check from its own cache.
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
    .then(watchInstalls)
    .catch((err) => console.warn('service worker', err));
  // "ready" resolves once a worker is active, which means its install step cached every file.
  navigator.serviceWorker.ready.then(setOfflineReady);
  let reloaded = false;
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // A new version took over. Reload only on the menu, never mid-game. On a first visit the
    // first takeover is the install itself (nothing old to replace); later ones are updates.
    if (!hadController) { hadController = true; return; }
    if (reloaded) return;
    if (current) { updatePending = true; return; } // route() reloads when the menu shows
    reloaded = true;
    reloadForUpdate();
  });
  // An installed app can sit in the background for days without a page load, and the
  // browser looks for a new version mostly on a page load. So also look when the app comes
  // back on screen or back online (at most once a minute). The handler above applies it.
  let lastCheck = 0;
  const checkForUpdate = () => {
    if (!navigator.onLine || Date.now() - lastCheck < 60000) return;
    lastCheck = Date.now();
    navigator.serviceWorker.getRegistration().then((r) => r?.update()).catch(() => { /* offline */ });
  };
  const checkIfShown = () => { if (!document.hidden) checkForUpdate(); };
  document.addEventListener('visibilitychange', checkIfShown);
  window.addEventListener('pageshow', checkIfShown);
  window.addEventListener('online', checkIfShown); // while hidden, coming back on screen checks
  // An app left open on screen (a long game on Wi-Fi) also looks every 20 minutes.
  setInterval(checkIfShown, 20 * 60 * 1000);

  // If a new version fails to install (say, the network dropped halfway), try again soon
  // instead of waiting for the next time the app is opened. At most 5 retries per visit.
  let retries = 0;
  function watchInstalls(reg) {
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (!w) return;
      let installed = false;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' || w.state === 'activated') installed = true;
        // Redundant without ever installing means the install failed.
        if (w.state !== 'redundant' || installed || retries >= 5) return;
        retries++;
        setTimeout(() => { lastCheck = 0; checkIfShown(); }, 30000 * retries);
      });
    });
  }
}

try {
  if (sessionStorage.getItem('pa:updated')) {
    sessionStorage.removeItem('pa:updated');
    // The browser may update a page that is in the background: say so once it is on screen.
    const tell = () => setTimeout(() => toast(t('Updated to the newest version'), 2600), 400);
    if (!document.hidden) tell();
    else document.addEventListener('visibilitychange', tell, { once: true });
  }
} catch { /* ignore */ }

route();

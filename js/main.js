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

addHebrew(heCore);
applyDocumentLang();

const VERSION = '3e67752ebf';
const GAMES = [mahjong, backgammon, chess, bubbles, dotsu, jigsaw, blocks, blockblast, word, watersort, flow, arrows, carjam];
const app = document.getElementById('app');
const shared = { sfx, haptic, store, modal, toast };

let current = null;      // { game, inst }
let enteredFromMenu = false;
let installPrompt = null;
let offlineReady = false;
let updatePending = false; // a new service worker took over while a game was open

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

  const cards = el('div', 'cards');
  for (const g of GAMES) {
    const card = el('button', 'card');
    card.innerHTML = `${g.icon}<div class="name">${g.title}</div><div class="info"></div>`;
    try { card.querySelector('.info').textContent = g.info?.(store) || g.tagline || ''; } catch { /* ignore */ }
    card.addEventListener('click', () => {
      sfx('select');
      haptic(8);
      enteredFromMenu = true;
      location.hash = '#' + g.id;
    });
    cards.append(card);
  }

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

  screen.append(head, cards, foot);
  app.append(screen);
}

function showGame(game) {
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
  navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('service worker', err));
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

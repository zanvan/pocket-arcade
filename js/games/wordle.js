import { ANSWERS, isValid } from '../data/words.js';
import { scoreGuess, keyStates, dayNumber, dailyAnswer, emptyStats, recordResult } from '../logic/wordle.js';
import { t, addHebrew } from '../core/i18n.js';
import he from '../i18n/he/wordle.js';
import { el, ICONS } from '../core/ui.js';

addHebrew(he);

const ROWS = 6;
// A function, so the words follow the chosen language.
const praise = () => [t('Genius!'), t('Magnificent!'), t('Impressive!'), t('Splendid!'), t('Great!'), t('Phew!')];
const KB = ['qwertyuiop', 'asdfghjkl', '>zxcvbnm<'];

export default {
  id: 'word',
  get title() { return t('Word Guess'); },
  icon: `<svg viewBox="0 0 64 64"><rect x="6" y="6" width="52" height="52" rx="14" fill="#232a44"/>
    <rect x="12" y="14" width="12" height="12" rx="2.5" fill="#3a9a5b"/><rect x="26" y="14" width="12" height="12" rx="2.5" fill="#c49b2b"/><rect x="40" y="14" width="12" height="12" rx="2.5" fill="#3a3f52"/>
    <rect x="12" y="28" width="12" height="12" rx="2.5" fill="#3a9a5b"/><rect x="26" y="28" width="12" height="12" rx="2.5" fill="#3a9a5b"/><rect x="40" y="28" width="12" height="12" rx="2.5" fill="#c49b2b"/>
    <rect x="12" y="42" width="12" height="12" rx="2.5" fill="#3a9a5b"/><rect x="26" y="42" width="12" height="12" rx="2.5" fill="#3a9a5b"/><rect x="40" y="42" width="12" height="12" rx="2.5" fill="#3a9a5b"/></svg>`,
  info: (store) => {
    const st = store.get('word.daily', null);
    if (st && st.day === dayNumber() && st.done) return st.won ? t('Solved today ✓') : t('Try again tomorrow');
    return t("Today's word is waiting");
  },
  get help() {
    return t(`<p>Guess the 5-letter word in 6 tries.</p><ul>
    <li><b style="color:#3a9a5b">Green</b>: right letter, right spot.</li>
    <li><b style="color:#c49b2b">Yellow</b>: in the word, wrong spot.</li>
    <li><b>Gray</b>: not in the word.</li></ul>
    <p><b>Daily</b> is the same word for everyone each day — compare with family! <b>Practice</b> gives unlimited words.</p>`);
  },

  mount(root, app) {
    let mode = app.store.get('word.mode', 'daily');
    let st = null;          // { answer, guesses, done, won, day? }
    let typed = '';
    let busy = false;
    let destroyed = false;

    const wrap = el('div', 'wg');
    const modeBar = el('div', 'wg-mode');
    const seg = el('div', 'seg', `<button data-m="daily">${t('Daily')}</button><button data-m="practice">${t('Practice')}</button>`);
    modeBar.append(seg);
    const boardWrap = el('div', 'wg-board-wrap');
    const board = el('div', 'wg-board');
    boardWrap.append(board);
    const kb = el('div', 'kb');
    wrap.append(modeBar, boardWrap, kb);
    root.append(wrap);

    const rows = [];
    for (let r = 0; r < ROWS; r++) {
      const row = el('div', 'wg-row');
      const tiles = [];
      for (let c = 0; c < 5; c++) { const t = el('div', 'tile'); row.append(t); tiles.push(t); }
      board.append(row);
      rows.push({ row, tiles });
    }

    const keyEls = {};
    for (const line of KB) {
      const row = el('div', 'kb-row');
      for (const ch of line) {
        let k;
        if (ch === '>') { k = el('button', 'key wide', 'Enter'); k.dataset.k = 'enter'; }
        else if (ch === '<') { k = el('button', 'key wide', ICONS.backspace); k.dataset.k = 'back'; k.setAttribute('aria-label', t('Delete')); }
        else { k = el('button', 'key', ch); k.dataset.k = ch; keyEls[ch] = k; }
        row.append(k);
      }
      kb.append(row);
    }
    kb.addEventListener('pointerdown', (e) => {
      const k = e.target.closest('.key');
      if (!k) return;
      e.preventDefault();
      press(k.dataset.k);
    });

    // Fit tiles to the space between the mode bar and keyboard.
    const ro = new ResizeObserver(() => {
      const r = boardWrap.getBoundingClientRect();
      const size = Math.floor(Math.max(28, Math.min((r.width - 24 - 24) / 5, (r.height - 8 - 30) / 6, 64)));
      board.style.width = size * 5 + 24 + 'px';
      board.style.height = size * 6 + 30 + 'px';
      board.style.fontSize = Math.round(size * 0.52) + 'px';
    });
    ro.observe(boardWrap);

    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || busy || b.dataset.m === mode) return;
      app.sfx('tap');
      mode = b.dataset.m;
      app.store.set('word.mode', mode);
      load();
    });

    const statsBtn = app.action(ICONS.stats, t('Statistics'), () => showStats(false));

    function save() { app.store.set('word.' + mode, st); }

    function load() {
      seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.m === mode));
      typed = '';
      if (mode === 'daily') {
        const day = dayNumber();
        const saved = app.store.get('word.daily', null);
        st = saved && saved.day === day ? saved : { day, answer: dailyAnswer(ANSWERS, day), guesses: [], done: false, won: false };
        st.answer = dailyAnswer(ANSWERS, day);
      } else {
        const saved = app.store.get('word.practice', null);
        st = saved && !saved.done ? saved : newPractice();
      }
      save();
      renderAll();
    }

    function newPractice() {
      return { answer: ANSWERS[Math.floor(Math.random() * ANSWERS.length)], guesses: [], done: false, won: false };
    }

    function renderAll() {
      for (let r = 0; r < ROWS; r++) {
        const g = st.guesses[r];
        const res = g ? scoreGuess(g, st.answer) : null;
        rows[r].row.classList.remove('shake');
        for (let c = 0; c < 5; c++) {
          const t = rows[r].tiles[c];
          t.className = 'tile';
          t.textContent = g ? g[c] : '';
          if (g) t.classList.add(res[c]);
        }
      }
      renderTyping();
      renderKeys();
    }

    function renderTyping() {
      const r = st.guesses.length;
      if (r >= ROWS || st.done) return;
      for (let c = 0; c < 5; c++) {
        const t = rows[r].tiles[c];
        const ch = typed[c] || '';
        if (t.textContent !== ch) {
          t.textContent = ch;
          t.className = 'tile' + (ch ? ' filled' : '');
        }
      }
    }

    function renderKeys() {
      const ks = keyStates(st.guesses, st.answer);
      for (const [ch, k] of Object.entries(keyEls)) {
        k.className = 'key' + (ks[ch] ? ' ' + ks[ch] : '');
      }
    }

    function press(k) {
      if (busy || destroyed) return;
      if (st.done) {
        if (mode === 'practice' && k === 'enter') { st = newPractice(); save(); renderAll(); }
        else if (k === 'enter') showStats(true);
        return;
      }
      if (k === 'enter') { submit(); return; }
      if (k === 'back') {
        if (typed.length) { typed = typed.slice(0, -1); app.sfx('key'); renderTyping(); }
        return;
      }
      if (/^[a-z]$/.test(k) && typed.length < 5) {
        typed += k;
        app.sfx('key');
        app.haptic(5);
        renderTyping();
      }
    }

    function shakeRow(msg) {
      const row = rows[st.guesses.length].row;
      row.classList.remove('shake');
      void row.offsetWidth;
      row.classList.add('shake');
      app.toast(msg);
      app.sfx('bump');
      app.haptic(30);
    }

    async function submit() {
      if (typed.length < 5) return shakeRow(t('Not enough letters'));
      if (!isValid(typed)) return shakeRow(t('Not in word list'));
      const r = st.guesses.length;
      const guess = typed;
      st.guesses.push(guess);
      typed = '';
      const won = guess === st.answer;
      const lost = !won && st.guesses.length >= ROWS;
      if (won || lost) { st.done = true; st.won = won; }
      save();
      if (won || lost) {
        const key = 'word.stats.' + mode;
        app.store.set(key, recordResult(app.store.get(key, emptyStats()), won, st.guesses.length, mode === 'daily' ? st.day : null));
      }

      busy = true;
      const res = scoreGuess(guess, st.answer);
      const tiles = rows[r].tiles;
      await Promise.all(tiles.map((t, i) => new Promise((done) => {
        setTimeout(() => {
          t.classList.add('flip-in');
          app.sfx('tap');
          setTimeout(() => {
            t.className = 'tile flip-out ' + res[i];
            setTimeout(done, 170);
          }, 160);
        }, i * 230);
      })));
      if (destroyed) return;
      renderKeys();
      busy = false;

      if (won) {
        app.sfx('win');
        app.haptic(40);
        app.toast(praise()[r]);
        tiles.forEach((t, i) => setTimeout(() => { t.classList.add('bounce'); }, i * 90));
        setTimeout(() => { if (!destroyed) showStats(true); }, 1700);
      } else if (lost) {
        app.sfx('lose');
        app.toast(st.answer.toUpperCase(), 3000);
        setTimeout(() => { if (!destroyed) showStats(true); }, 2000);
      }
    }

    function shareText() {
      const lines = st.guesses.map((g) => scoreGuess(g, st.answer)
        .map((x) => (x === 'correct' ? '🟩' : x === 'present' ? '🟨' : '⬛')).join(''));
      return `Pocket Word #${st.day} ${st.won ? st.guesses.length : 'X'}/6\n\n${lines.join('\n')}`;
    }

    async function showStats(finished) {
      const s = { ...emptyStats(), ...app.store.get('word.stats.' + mode, emptyStats()) };
      const max = Math.max(1, ...s.dist);
      const hi = st.done && st.won ? st.guesses.length - 1 : -1;
      const dist = s.dist.map((n, i) => `<div class="dist-row"><span>${i + 1}</span>
        <span class="bar ${i === hi ? 'hi' : ''}" style="width:${Math.max(7, (n / max) * 100)}%">${n}</span></div>`).join('');
      let extra = '';
      if (mode === 'daily' && st.done) {
        const now = new Date();
        const mid = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const mins = Math.max(0, Math.round((mid - now) / 60000));
        const wasWord = st.won ? '' : t('The word was <b>{word}</b>.', { word: st.answer.toUpperCase() }) + ' ';
        const next = t('Next word in <b>{h}h {m}m</b>', { h: Math.floor(mins / 60), m: mins % 60 });
        extra = `<p style="text-align:center;margin-top:10px">${wasWord}${next}</p>`;
      } else if (mode === 'practice' && st.done && !st.won) {
        extra = `<p style="text-align:center;margin-top:10px">${t('The word was <b>{word}</b>.', { word: st.answer.toUpperCase() })}</p>`;
      }
      const buttons = [];
      if (mode === 'daily' && st.done) buttons.push({ label: t('Share'), value: 'share' });
      if (mode === 'practice' && st.done) buttons.push({ label: t('New word'), value: 'new', primary: true });
      else buttons.push({ label: t('Close'), value: 'close', primary: true });
      const v = await app.modal({
        title: mode === 'daily' ? t('Daily statistics') : t('Practice statistics'),
        html: `<div class="stats4">
          <div><div class="n">${s.played}</div><div class="l">${t('Played')}</div></div>
          <div><div class="n">${s.played ? Math.round((s.wins / s.played) * 100) : 0}</div><div class="l">${t('Win %')}</div></div>
          <div><div class="n">${s.streak}</div><div class="l">${t('Streak')}</div></div>
          <div><div class="n">${s.maxStreak}</div><div class="l">${t('Best streak')}</div></div></div>
          <div class="dist">${dist}</div>${extra}`,
        buttons,
      });
      if (destroyed) return;
      if (v === 'share') {
        const text = shareText();
        try {
          if (navigator.share) await navigator.share({ text });
          else { await navigator.clipboard.writeText(text); app.toast(t('Copied — paste it to family')); }
        } catch { /* cancelled */ }
      } else if (v === 'new') {
        st = newPractice();
        save();
        renderAll();
      }
      void finished;
    }

    function onKey(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('.modal-backdrop')) return;
      const k = e.key;
      if (k === 'Enter') press('enter');
      else if (k === 'Backspace') press('back');
      else if (/^[a-zA-Z]$/.test(k)) press(k.toLowerCase());
      else return;
      e.preventDefault();
    }
    window.addEventListener('keydown', onKey);

    void statsBtn;
    load();

    return {
      destroy() {
        destroyed = true;
        ro.disconnect();
        window.removeEventListener('keydown', onKey);
      },
    };
  },
};

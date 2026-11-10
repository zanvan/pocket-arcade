// Language: English or Hebrew. Code is written in English and every visible string goes
// through t(). Hebrew text lives in plain data files under js/i18n/he/, one per module,
// which each module registers with addHebrew(). A missing Hebrew entry falls back to English.
//
// Rule for t(): pass a string literal (test/i18n.test.mjs finds them by scanning the source
// and fails when one has no Hebrew entry). Put changing parts in {name} slots:
//   t('Level {n} done!', { n: level })

const KEY = 'pa:lang';

function initial() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved === 'he' || saved === 'en') return saved;
  } catch { /* no storage (Node tests, private mode) */ }
  const nav = typeof navigator !== 'undefined' ? navigator.language || '' : '';
  return /^(he|iw)\b/i.test(nav) ? 'he' : 'en';
}

export const lang = initial();
export const isRTL = lang === 'he';

const HE = Object.create(null);

export function addHebrew(dict) {
  Object.assign(HE, dict);
}

export function t(text, vars) {
  let out = lang === 'he' && HE[text] != null ? HE[text] : text;
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return out;
}

// Saves the choice and reloads, so every screen is drawn again in the new language.
export function setLang(next) {
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  location.reload();
}

export function applyDocumentLang() {
  document.documentElement.lang = lang;
  document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
}

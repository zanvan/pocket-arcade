// Word-guess rules: scoring a guess, keyboard colors, daily word, stats.
import { rng, shuffle } from './rng.js';

// Two passes so repeated letters are marked the way people expect:
// greens first, then yellows only while unmatched copies remain in the answer.
export function scoreGuess(guess, answer) {
  const res = Array(5).fill('absent');
  const left = {};
  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) res[i] = 'correct';
    else left[answer[i]] = (left[answer[i]] || 0) + 1;
  }
  for (let i = 0; i < 5; i++) {
    if (res[i] === 'correct') continue;
    if (left[guess[i]] > 0) {
      res[i] = 'present';
      left[guess[i]]--;
    }
  }
  return res;
}

const RANK = { absent: 1, present: 2, correct: 3 };
export function keyStates(guesses, answer) {
  const keys = {};
  for (const g of guesses) {
    const r = scoreGuess(g, answer);
    for (let i = 0; i < 5; i++) {
      const cur = keys[g[i]];
      if (!cur || RANK[r[i]] > RANK[cur]) keys[g[i]] = r[i];
    }
  }
  return keys;
}

// Local calendar day number, so the daily word changes at local midnight.
export function dayNumber(date = new Date()) {
  const start = Date.UTC(2026, 0, 1);
  const today = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((today - start) / 86400000);
}

let order = null;
export function dailyAnswer(answers, day) {
  if (!order || order.length !== answers.length) {
    order = shuffle(answers.map((_, i) => i), rng(20260101));
  }
  const n = answers.length;
  return answers[order[((day % n) + n) % n]];
}

export function emptyStats() {
  return { played: 0, wins: 0, streak: 0, maxStreak: 0, dist: [0, 0, 0, 0, 0, 0], lastDay: null };
}

// day is the daily number for daily games, null for practice games.
export function recordResult(stats, won, tries, day = null) {
  const s = { ...emptyStats(), ...stats, dist: [...(stats?.dist || [0, 0, 0, 0, 0, 0])] };
  s.played++;
  if (won) {
    s.wins++;
    s.dist[tries - 1]++;
    const continues = day == null || s.lastDay == null || s.lastDay === day - 1;
    s.streak = continues ? s.streak + 1 : 1;
    s.maxStreak = Math.max(s.maxStreak, s.streak);
  } else {
    s.streak = 0;
  }
  if (day != null) s.lastDay = day;
  return s;
}

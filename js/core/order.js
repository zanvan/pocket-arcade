// The order of the games on the menu. Pure function, tested in Node.
//   recent — last played first; games never played follow, in the default order
//   name   — alphabetical in the current language
//   custom — the order the player arranged; games added later go at the end
export const SORTS = ['recent', 'name', 'custom'];

export function orderGames(games, sort, { played = {}, custom = [], lang = 'en' } = {}) {
  const list = games.slice();
  if (sort === 'name') {
    return list.sort((a, b) => a.title.localeCompare(b.title, lang));
  }
  if (sort === 'custom') {
    const pos = new Map(custom.map((id, i) => [id, i]));
    const rank = (g) => (pos.has(g.id) ? pos.get(g.id) : custom.length + games.indexOf(g));
    return list.sort((a, b) => rank(a) - rank(b));
  }
  // Array.prototype.sort is stable, so equal times keep the default order.
  return list.sort((a, b) => (played[b.id] || 0) - (played[a.id] || 0));
}

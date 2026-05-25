/**
 * Minimal fuzzy match — substring + word-start boost.
 *
 * We don't pull in fuse.js because the catalog is small (~25 concepts)
 * and the ranking only needs to feel responsive. Score components:
 *   - whole-string match → 100
 *   - word-start (case-insensitive) → 50 + position bonus
 *   - substring match → 25
 *   - description match → half weight
 *
 * `rank(items, query)` returns the input filtered + sorted by score
 * descending. Empty query yields the input order unchanged. Stable
 * (sort preserves relative order on ties — relevant when the catalog
 * has an editorial order users have learned).
 */

export interface RankableItem {
  name: string;
  description?: string;
  iceType: string;
  category?: string;
}

function score(item: RankableItem, query: string): number {
  if (!query) return 1; // every item kept, original order
  const q = query.toLowerCase();
  const name = item.name.toLowerCase();
  const desc = (item.description ?? '').toLowerCase();
  let s = 0;

  if (name === q) s += 100;
  // Word-start: split name on non-word chars, look for any starting with q.
  const words = name.split(/[\s\-_./]+/);
  for (let i = 0; i < words.length; i++) {
    if (words[i].startsWith(q)) {
      s += 50 + Math.max(0, 10 - i);
    }
  }
  if (name.includes(q)) s += 25;
  if (desc.includes(q)) s += 10;
  return s;
}

export function rank<T extends RankableItem>(items: T[], query: string): T[] {
  if (!query.trim()) return items.slice();
  const q = query.trim();
  const scored = items
    .map((it, idx) => ({ it, s: score(it, q), idx }))
    .filter((entry) => entry.s > 0)
    .sort((a, b) => b.s - a.s || a.idx - b.idx);
  return scored.map((entry) => entry.it);
}

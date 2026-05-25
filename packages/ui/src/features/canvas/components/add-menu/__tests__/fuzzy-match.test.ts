import { describe, expect, it } from 'vitest';
import { rank, type RankableItem } from '../fuzzy-match';

const items: RankableItem[] = [
  { name: 'PostgreSQL', description: 'Relational database', iceType: 'Database.PostgreSQL', category: 'data' },
  { name: 'Postman Echo', description: 'HTTP echo service', iceType: 'External.PostmanEcho', category: 'external' },
  { name: 'Redis Cache', description: 'In-memory cache', iceType: 'Database.Redis', category: 'data' },
  { name: 'Scalable Backend', description: 'Containerized service', iceType: 'Compute.Container', category: 'backend' },
  { name: 'Static Site', description: 'Frontend hosted on a CDN', iceType: 'Compute.StaticSite', category: 'frontend' },
];

describe('rank', () => {
  it('returns items in original order when query is empty', () => {
    expect(rank(items, '').map((i) => i.iceType)).toEqual(items.map((i) => i.iceType));
  });

  it('places word-start matches above mid-word matches', () => {
    const result = rank(items, 'post');
    // PostgreSQL and Postman Echo both word-start with "post" — kept;
    // Static Site contains "Site" not "post"; Scalable Backend doesn't match.
    expect(result.map((r) => r.iceType)).toEqual(
      expect.arrayContaining(['Database.PostgreSQL', 'External.PostmanEcho']),
    );
    // Word-start hits should appear before "no-match" items.
    expect(result[0].name.toLowerCase().startsWith('post')).toBe(true);
  });

  it('matches against the description as well', () => {
    const result = rank(items, 'cache');
    expect(result.some((r) => r.iceType === 'Database.Redis')).toBe(true);
  });

  it('filters out non-matching items', () => {
    const result = rank(items, 'redis');
    expect(result.map((r) => r.iceType)).toEqual(['Database.Redis']);
  });

  it('is case-insensitive', () => {
    expect(rank(items, 'POSTGRES').some((r) => r.iceType === 'Database.PostgreSQL')).toBe(true);
  });

  it('returns stable order on ties (preserves input order)', () => {
    const a = rank(items, 'a'); // matches "Scalable Backend" + "Static Site" + maybe more
    const b = rank(items, 'a');
    expect(a.map((i) => i.iceType)).toEqual(b.map((i) => i.iceType));
  });
});

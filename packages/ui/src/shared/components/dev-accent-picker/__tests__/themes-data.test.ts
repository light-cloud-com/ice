/**
 * Smoke tests for the themes orchestrator (rf-thmdat split).
 *
 * Pins the per-group split shape:
 *  - each group has the expected 4 themes,
 *  - no theme `id` appears in two different groups,
 *  - the assembled `T` array is byte-stable in length and ordering against
 *    the original file (12 themes in the documented order).
 *
 * Per-theme palette completeness lives in `themes.test.ts`; orchestrator
 * lookup behavior (`T.find((t) => t.id === saved)`) lives in
 * `orchestrator.test.tsx`.
 */

import { describe, expect, it } from 'vitest';
import { T } from '../data/themes';
import { GROUP_1_THEMES } from '../data/themes/group-1';
import { GROUP_2_THEMES } from '../data/themes/group-2';
import { GROUP_3_THEMES } from '../data/themes/group-3';

const GROUPS = [
  { name: 'group-1', list: GROUP_1_THEMES, expectedIds: ['default', 'retro', 'cupcake', 'valentine'] },
  { name: 'group-2', list: GROUP_2_THEMES, expectedIds: ['synthwave', 'coffee', 'luxury', 'aqua'] },
  { name: 'group-3', list: GROUP_3_THEMES, expectedIds: ['forest', 'sage', 'dracula', 'night'] },
] as const;

const EXPECTED_ORDER = [
  'default',
  'retro',
  'cupcake',
  'valentine',
  'synthwave',
  'coffee',
  'luxury',
  'aqua',
  'forest',
  'sage',
  'dracula',
  'night',
] as const;

describe('themes — group bundles', () => {
  for (const { name, list, expectedIds } of GROUPS) {
    it(`${name} contains exactly ${expectedIds.length} themes`, () => {
      expect(list).toHaveLength(expectedIds.length);
    });

    it(`${name} preserves the expected theme ids in order`, () => {
      expect(list.map((t) => t.id)).toEqual([...expectedIds]);
    });
  }

  it('no theme id appears in two different groups', () => {
    const seen = new Map<string, string>();
    for (const { name, list } of GROUPS) {
      for (const t of list) {
        const prior = seen.get(t.id);
        if (prior !== undefined) {
          throw new Error(`Theme id '${t.id}' appears in both '${prior}' and '${name}'`);
        }
        seen.set(t.id, name);
      }
    }
  });
});

describe('T — assembled array', () => {
  it('contains exactly 12 themes', () => {
    expect(T).toHaveLength(12);
  });

  it('preserves the documented ordering verbatim', () => {
    expect(T.map((t) => t.id)).toEqual([...EXPECTED_ORDER]);
  });

  it('total theme count equals the sum of group sizes', () => {
    const totalGroupThemes = GROUPS.reduce((acc, { list }) => acc + list.length, 0);
    expect(T).toHaveLength(totalGroupThemes);
  });

  it('every theme in the assembled array also appears in some group bundle', () => {
    const fromGroups = new Set<string>();
    for (const { list } of GROUPS) {
      for (const t of list) fromGroups.add(t.id);
    }
    for (const t of T) {
      expect(fromGroups, t.id).toContain(t.id);
    }
  });

  it('reference-equality: assembled T entries are the same objects from group bundles', () => {
    // Spread does not clone, so each T[i] should be reference-equal to its group source.
    expect(T[0]).toBe(GROUP_1_THEMES[0]);
    expect(T[4]).toBe(GROUP_2_THEMES[0]);
    expect(T[8]).toBe(GROUP_3_THEMES[0]);
  });
});

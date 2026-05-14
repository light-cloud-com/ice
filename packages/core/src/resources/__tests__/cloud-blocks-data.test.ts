/**
 * Smoke tests for the cloud-blocks-data orchestrator (rf-cbdat split).
 *
 * Pins the per-category split shape:
 *  - each category bundle has the expected number of templates,
 *  - no two categories ship the same `name`,
 *  - the assembled BLOCK_TEMPLATES is byte-stable in length and ordering
 *    against the original file (16 entries in the documented order),
 *  - BLOCK_CATEGORIES exposes the same 8 palette buckets backed by the
 *    assembled BLOCK_TEMPLATES.
 *
 * Per-template field-level checks live in the higher-level
 * `cloud-blocks.test.ts` smoke (helper exports + sample createBlockFromTemplate).
 */

import { describe, expect, it } from 'vitest';
import { BLOCK_CATEGORIES, BLOCK_TEMPLATES } from '../cloud-blocks-data';
import { BACKEND_TEMPLATES } from '../cloud-blocks-data/backend';
import { COMPUTE_TEMPLATES } from '../cloud-blocks-data/compute';
import { DATA_TEMPLATES } from '../cloud-blocks-data/data';
import { FRONTEND_TEMPLATES } from '../cloud-blocks-data/frontend';
import { MESSAGING_TEMPLATES } from '../cloud-blocks-data/messaging';
import { NETWORKING_TEMPLATES } from '../cloud-blocks-data/networking';
import { OBSERVABILITY_TEMPLATES } from '../cloud-blocks-data/observability';
import { SECURITY_TEMPLATES } from '../cloud-blocks-data/security';
import { STORAGE_TEMPLATES } from '../cloud-blocks-data/storage';

const CATEGORY_BUNDLES = [
  { name: 'frontend', list: FRONTEND_TEMPLATES, expectedCount: 1 },
  { name: 'backend', list: BACKEND_TEMPLATES, expectedCount: 3 },
  { name: 'compute', list: COMPUTE_TEMPLATES, expectedCount: 1 },
  { name: 'data', list: DATA_TEMPLATES, expectedCount: 3 },
  { name: 'storage', list: STORAGE_TEMPLATES, expectedCount: 1 },
  { name: 'networking', list: NETWORKING_TEMPLATES, expectedCount: 2 },
  { name: 'messaging', list: MESSAGING_TEMPLATES, expectedCount: 2 },
  { name: 'observability', list: OBSERVABILITY_TEMPLATES, expectedCount: 1 },
  { name: 'security', list: SECURITY_TEMPLATES, expectedCount: 2 },
] as const;

// Original file ordering of the BlockTemplate array. Reproduced here so a
// future rearrangement of category-file imports must update this anchor too.
const EXPECTED_ORDER = [
  'static-site',
  'scalable-backend',
  'worker',
  'database',
  'redis-cache',
  'scheduled-task',
  'api-gateway',
  'event-stream',
  'queue',
  'serverless-function',
  'nosql-database',
  'file-storage',
  'logs',
  'cdn',
  'auth',
  'secrets',
] as const;

describe('cloud-blocks-data — category bundles', () => {
  for (const { name, list, expectedCount } of CATEGORY_BUNDLES) {
    it(`${name} bundle has ${expectedCount} template(s)`, () => {
      expect(list).toHaveLength(expectedCount);
    });
  }

  it('no template `name` appears in two different category bundles', () => {
    const seen = new Map<string, string>();
    for (const { name, list } of CATEGORY_BUNDLES) {
      for (const t of list) {
        const prior = seen.get(t.name);
        if (prior !== undefined) {
          throw new Error(`Template '${t.name}' appears in both '${prior}' and '${name}'`);
        }
        seen.set(t.name, name);
      }
    }
  });

  it('every template in a category bundle has a matching category field', () => {
    const expectedCategoryFor = new Map<string, ReadonlyArray<string>>([
      ['frontend', ['Frontend']],
      ['backend', ['Backend']],
      ['compute', ['Compute']],
      ['data', ['Data']],
      ['storage', ['Storage']],
      ['networking', ['Networking']],
      ['messaging', ['Messaging']],
      ['observability', ['Observability']],
      ['security', ['Security']],
    ]);
    for (const { name, list } of CATEGORY_BUNDLES) {
      const allowed = expectedCategoryFor.get(name)!;
      for (const t of list) {
        expect(allowed, `${name}/${t.name}`).toContain(t.category);
      }
    }
  });
});

describe('BLOCK_TEMPLATES — assembled list', () => {
  it('contains exactly 16 templates', () => {
    expect(BLOCK_TEMPLATES).toHaveLength(16);
  });

  it('preserves the documented ordering verbatim', () => {
    expect(BLOCK_TEMPLATES.map((t) => t.name)).toEqual([...EXPECTED_ORDER]);
  });

  it('total template count equals the sum of category bundle sizes', () => {
    const totalCategoryTemplates = CATEGORY_BUNDLES.reduce(
      (acc, { list }) => acc + list.length,
      0,
    );
    expect(BLOCK_TEMPLATES).toHaveLength(totalCategoryTemplates);
  });

  it('every template in the assembled list also appears in some category bundle', () => {
    const fromBundles = new Set<string>();
    for (const { list } of CATEGORY_BUNDLES) {
      for (const t of list) fromBundles.add(t.name);
    }
    for (const t of BLOCK_TEMPLATES) {
      expect(fromBundles, t.name).toContain(t.name);
    }
  });
});

describe('BLOCK_CATEGORIES — palette grouping', () => {
  it('exposes the 8 canonical palette buckets', () => {
    expect(BLOCK_CATEGORIES.map((c) => c.id)).toEqual([
      'frontend',
      'compute',
      'data',
      'storage',
      'networking',
      'messaging',
      'observability',
      'security',
    ]);
  });

  it('each bucket draws blocks from the assembled BLOCK_TEMPLATES', () => {
    for (const cat of BLOCK_CATEGORIES) {
      for (const b of cat.blocks) {
        // Reference equality — the filter must not clone.
        expect(BLOCK_TEMPLATES).toContain(b);
      }
    }
  });

  it('compute bucket aggregates Backend + Compute templates', () => {
    const compute = BLOCK_CATEGORIES.find((c) => c.id === 'compute')!;
    const names = compute.blocks.map((b) => b.name);
    expect(names).toContain('scalable-backend');
    expect(names).toContain('worker');
    expect(names).toContain('scheduled-task');
    expect(names).toContain('serverless-function');
  });
});

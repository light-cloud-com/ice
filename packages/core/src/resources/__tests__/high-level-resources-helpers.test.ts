/**
 * Exhaustive tests for the rf-hlres-8 helpers extraction.
 *
 * Pins the public API of `./high-level-resources/helpers.ts`:
 *   - HIGH_LEVEL_CATEGORIES assembly and ordering
 *   - getAllHighLevelResources flatMap behavior + count consistency
 *   - getHighLevelResourcesForPalette projection shape
 *   - filterResourcesByProvider filtering and 'all' bypass
 *   - getBehaviorLabel / getBehaviorColor delegate to constants
 *   - getGCPCloudAssetTypes set-builder behavior
 *   - cloudAssetToHighLevelType reverse lookup behavior
 *
 * Public consumers go through `../high-level-resources.js` (the shim
 * re-exports each named export). We exercise both surfaces here.
 */

import { describe, expect, it } from 'vitest';
import * as ShimModule from '../high-level-resources';
import * as HelpersModule from '../high-level-resources/helpers';
import {
  HIGH_LEVEL_CATEGORIES,
  cloudAssetToHighLevelType,
  filterResourcesByProvider,
  getAllHighLevelResources,
  getBehaviorColor,
  getBehaviorLabel,
  getGCPCloudAssetTypes,
  getHighLevelResourcesForPalette,
} from '../high-level-resources/helpers';

describe('helpers — public API surface', () => {
  it('exposes the 8 named runtime exports', () => {
    const expected = [
      'HIGH_LEVEL_CATEGORIES',
      'getAllHighLevelResources',
      'getHighLevelResourcesForPalette',
      'filterResourcesByProvider',
      'getBehaviorLabel',
      'getBehaviorColor',
      'getGCPCloudAssetTypes',
      'cloudAssetToHighLevelType',
    ] as const;
    for (const name of expected) {
      expect(HelpersModule[name as keyof typeof HelpersModule]).toBeDefined();
    }
  });

  it('the orchestrator shim re-exports each runtime export verbatim', () => {
    expect(ShimModule.HIGH_LEVEL_CATEGORIES).toBe(HelpersModule.HIGH_LEVEL_CATEGORIES);
    expect(ShimModule.getAllHighLevelResources).toBe(HelpersModule.getAllHighLevelResources);
    expect(ShimModule.getHighLevelResourcesForPalette).toBe(HelpersModule.getHighLevelResourcesForPalette);
    expect(ShimModule.filterResourcesByProvider).toBe(HelpersModule.filterResourcesByProvider);
    expect(ShimModule.getBehaviorLabel).toBe(HelpersModule.getBehaviorLabel);
    expect(ShimModule.getBehaviorColor).toBe(HelpersModule.getBehaviorColor);
    expect(ShimModule.getGCPCloudAssetTypes).toBe(HelpersModule.getGCPCloudAssetTypes);
    expect(ShimModule.cloudAssetToHighLevelType).toBe(HelpersModule.cloudAssetToHighLevelType);
  });
});

describe('HIGH_LEVEL_CATEGORIES', () => {
  it('contains the 7 categories in canonical order', () => {
    const ids = HIGH_LEVEL_CATEGORIES.map((c) => c.id);
    expect(ids).toEqual(['compute', 'database', 'storage', 'networking', 'messaging', 'security', 'monitoring']);
  });

  it('every category has at least one resource', () => {
    for (const cat of HIGH_LEVEL_CATEGORIES) {
      expect(cat.resources.length).toBeGreaterThan(0);
    }
  });
});

describe('getAllHighLevelResources', () => {
  it('returns the union of category.resources arrays', () => {
    const all = getAllHighLevelResources();
    const expectedTotal = HIGH_LEVEL_CATEGORIES.reduce((n, c) => n + c.resources.length, 0);
    expect(all).toHaveLength(expectedTotal);
  });

  it('preserves category order (compute first, monitoring last)', () => {
    const all = getAllHighLevelResources();
    expect(all[0]?.category).toBe('compute');
    expect(all[all.length - 1]?.category).toBe('monitoring');
  });
});

describe('getHighLevelResourcesForPalette', () => {
  it('returns one entry per category with the palette projection', () => {
    const palette = getHighLevelResourcesForPalette();
    expect(palette).toHaveLength(HIGH_LEVEL_CATEGORIES.length);
    const compute = palette.find((p) => p.categoryId === 'compute');
    expect(compute).toBeDefined();
    // Category-level shape
    expect(compute!.category).toBe('Compute');
    expect(compute!.categoryIcon).toBe('Globe');
    expect(typeof compute!.categoryDescription).toBe('string');
  });

  it('projects resources to ice_type / display_name (not id / name)', () => {
    const palette = getHighLevelResourcesForPalette();
    const fe = palette.find((p) => p.categoryId === 'compute')!.resources.find((r) => r.ice_type === 'frontend-app');
    expect(fe).toBeDefined();
    expect(fe!.display_name).toBe('Frontend App');
    expect(fe!.category).toBe('Compute');
    // Carries through behavior / providers / implementations / properties
    expect(typeof fe!.behavior).toBe('string');
    expect(Array.isArray(fe!.providers)).toBe(true);
    expect(Array.isArray(fe!.implementations)).toBe(true);
    expect(Array.isArray(fe!.properties)).toBe(true);
  });
});

describe('filterResourcesByProvider', () => {
  it('returns the full set for "all"', () => {
    const all = filterResourcesByProvider('all');
    expect(all).toHaveLength(getAllHighLevelResources().length);
  });

  it('filters to resources where providers includes the queried provider', () => {
    const aws = filterResourcesByProvider('aws');
    expect(aws.length).toBeGreaterThan(0);
    for (const r of aws) {
      expect(r.providers).toContain('aws');
    }
    const gcp = filterResourcesByProvider('gcp');
    expect(gcp.length).toBeGreaterThan(0);
    for (const r of gcp) {
      expect(r.providers).toContain('gcp');
    }
  });

  it('returns an empty array for an unknown provider', () => {
    const none = filterResourcesByProvider('totally-not-a-provider');
    expect(none).toEqual([]);
  });
});

describe('getBehaviorLabel + getBehaviorColor', () => {
  it('returns a non-empty string for known behaviors', () => {
    // Pull a known behavior from the data so we don't hard-code internal values.
    const sample = getAllHighLevelResources()[0]!;
    expect(typeof getBehaviorLabel(sample.behavior)).toBe('string');
    expect(getBehaviorLabel(sample.behavior).length).toBeGreaterThan(0);
    expect(typeof getBehaviorColor(sample.behavior)).toBe('string');
    expect(getBehaviorColor(sample.behavior).length).toBeGreaterThan(0);
  });
});

describe('getGCPCloudAssetTypes', () => {
  it('returns the set of Cloud Asset types reachable from GCP implementations', () => {
    const types = getGCPCloudAssetTypes();
    expect(Array.isArray(types)).toBe(true);
    expect(types.length).toBeGreaterThan(0);
    // Sample assertions: a handful of canonical mappings must appear.
    expect(types).toContain('run.googleapis.com/Service');
    expect(types).toContain('storage.googleapis.com/Bucket');
    expect(types).toContain('pubsub.googleapis.com/Topic');
  });

  it('returns each type at most once', () => {
    const types = getGCPCloudAssetTypes();
    expect(new Set(types).size).toBe(types.length);
  });
});

describe('cloudAssetToHighLevelType', () => {
  it('maps a known Cloud Asset type back to a high-level resource id', () => {
    // run.googleapis.com/Service ↔ gcp:cloudrun:Service ↔ a high-level resource
    // (one of the GCP-supported compute resources).
    const id = cloudAssetToHighLevelType('run.googleapis.com/Service');
    expect(typeof id).toBe('string');
    // The matched resource must actually claim a gcp:cloudrun:Service implementation.
    const matched = getAllHighLevelResources().find((r) => r.id === id);
    expect(matched).toBeDefined();
    expect(
      matched!.implementations.some((i) => i.resource_type === 'gcp:cloudrun:Service' && i.provider === 'gcp'),
    ).toBe(true);
  });

  it('returns null for unknown Cloud Asset types', () => {
    expect(cloudAssetToHighLevelType('not.real.googleapis.com/Nope')).toBeNull();
  });
});

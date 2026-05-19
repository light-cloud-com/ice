/**
 * Smoke test for `@ice/constants`. The package is a leaf data export
 * with no executable logic — coverage runs need this file just to
 * walk every declaration once. Each constant file (categories, colors,
 * connections, cost, deploy, derived, gcp, grid, ice-types, node-
 * traits, providers, templates, etc.) is imported here and the public
 * shape is asserted at a minimum.
 */

import { describe, it, expect } from 'vitest';
import * as Constants from '../index';

describe('@ice/constants — barrel export shape', () => {
  it('exposes provider arrays and metadata', () => {
    expect(Array.isArray((Constants as any).ALL_PROVIDERS)).toBe(true);
    expect((Constants as any).ALL_PROVIDERS.length).toBeGreaterThan(0);
    expect(typeof (Constants as any).CLOUD_PROVIDERS).toBe('object');
  });

  it('exposes per-provider feature flags + derived enabled lists', () => {
    const C = Constants as any;
    expect(typeof C.PROVIDER_FLAGS).toBe('object');
    expect(typeof C.isProviderEnabled).toBe('function');
    expect(typeof C.isCategoryEnabledForProvider).toBe('function');
    expect(typeof C.isIceTypeEnabledForProvider).toBe('function');
    expect(typeof C.getEnabledProvidersForCategory).toBe('function');
    expect(C.ENABLED_PROVIDER_IDS).toBeInstanceOf(Set);
    expect(Array.isArray(C.ENABLED_PROVIDERS)).toBe(true);
    // Every provider has the nested {enabled, categories} shape — a missing
    // entry means a new provider was added without registering a flag.
    for (const p of C.ALL_PROVIDERS) {
      expect(C.PROVIDER_FLAGS).toHaveProperty(p);
      expect(typeof C.PROVIDER_FLAGS[p].enabled).toBe('boolean');
      expect(typeof C.PROVIDER_FLAGS[p].categories).toBe('object');
      // Every CategoryId has an entry — exhaustive maps prevent silent defaults.
      for (const cat of C.CATEGORY_IDS) {
        expect(C.PROVIDER_FLAGS[p].categories).toHaveProperty(cat);
        expect(typeof C.PROVIDER_FLAGS[p].categories[cat]).toBe('boolean');
      }
    }
    // Enabled list and Set agree
    expect(C.ENABLED_PROVIDERS.every((p: any) => C.ENABLED_PROVIDER_IDS.has(p.id))).toBe(true);
  });

  it('isCategoryEnabledForProvider mirrors the live PROVIDER_FLAGS', () => {
    const C = Constants as any;
    // For every (provider, category), the helper's verdict must equal the
    // shipped flag's verdict. Disabled providers force false on every cat;
    // enabled providers fall through to the per-category boolean.
    for (const provider of C.ALL_PROVIDERS) {
      const cfg = C.PROVIDER_FLAGS[provider];
      for (const cat of C.CATEGORY_IDS) {
        const expected = cfg.enabled === true && cfg.categories[cat] === true;
        expect(C.isCategoryEnabledForProvider(cat, provider)).toBe(expected);
      }
    }
  });

  it('flipping a flag updates isCategoryEnabledForProvider (mechanism check)', () => {
    const C = Constants as any;
    // Pick any (provider, category) currently on; flip the category off and
    // verify the helper now returns false. Restore at the end so other
    // tests see the original config.
    const sample = C.ALL_PROVIDERS.flatMap((p: string) =>
      C.CATEGORY_IDS.filter((c: string) => C.PROVIDER_FLAGS[p].enabled && C.PROVIDER_FLAGS[p].categories[c]).map(
        (c: string) => ({ p, c }),
      ),
    )[0];
    if (!sample) return; // every combo is already off — nothing to flip
    const before = C.PROVIDER_FLAGS[sample.p].categories[sample.c];
    try {
      expect(C.isCategoryEnabledForProvider(sample.c, sample.p)).toBe(true);
      C.PROVIDER_FLAGS[sample.p].categories[sample.c] = false;
      expect(C.isCategoryEnabledForProvider(sample.c, sample.p)).toBe(false);
    } finally {
      C.PROVIDER_FLAGS[sample.p].categories[sample.c] = before;
    }
  });

  it('exposes palette CategoryIds and iceType→category resolution', () => {
    const C = Constants as any;
    expect(Array.isArray(C.CATEGORY_IDS)).toBe(true);
    expect(C.CATEGORY_IDS).toContain('Compute');
    expect(C.CATEGORY_IDS).toContain('Frontend');
    expect(typeof C.ICE_TYPE_TO_CATEGORY_ID).toBe('object');
    expect(C.getCategoryForIceType('Compute.StaticSite')).toBe('Frontend');
    expect(C.getCategoryForIceType('Compute.Container')).toBe('Compute');
    expect(C.getCategoryForIceType('Database.Redis')).toBe('Cache');
    // Prefix fallback for unmapped iceTypes
    expect(C.getCategoryForIceType('Database.SomeNewThing')).toBe('Database');
    // Unknown prefix is undefined (treated as ungated by helpers)
    expect(C.getCategoryForIceType('Bogus.Type')).toBeUndefined();
  });

  it('exposes ICE type tree + classification helpers', () => {
    expect((Constants as any).Cat).toBeDefined();
    expect((Constants as any).TREE).toBeDefined();
    expect((Constants as any).ICE).toBeDefined();
  });

  it('exposes derived lookups for type/category/resource', () => {
    expect(typeof (Constants as any).ICE_TYPE_TO_RESOURCE_ID).toBe('object');
    expect((Constants as any).VALID_TEMPLATE_ICE_TYPES).toBeInstanceOf(Set);
    expect((Constants as any).VALID_TEMPLATE_ICE_TYPES.size).toBeGreaterThan(0);
    expect(typeof (Constants as any).PREFIX_TO_CATEGORY).toBe('object');
    expect(typeof (Constants as any).TYPE_TO_CATEGORY).toBe('object');
    expect(typeof (Constants as any).REQUIRED_PROPS).toBe('object');
    expect(typeof (Constants as any).DEFAULT_PORTS).toBe('object');
    expect(typeof (Constants as any).DEFAULT_ENV_VARS).toBe('object');
  });

  it('exposes layout grid constants', () => {
    expect(typeof (Constants as any).CARD_WIDTH).toBe('number');
    expect(typeof (Constants as any).CARD_HEIGHT).toBe('number');
    expect(typeof (Constants as any).HEADER_HEIGHT).toBe('number');
    expect(typeof (Constants as any).CONTAINER_PADDING).toBe('number');
    expect(typeof (Constants as any).CHILD_GAP).toBe('number');
    expect(typeof (Constants as any).GROUP_GAP).toBe('number');
    expect(typeof (Constants as any).groupWidth).toBe('function');
    expect(typeof (Constants as any).groupHeight).toBe('function');
  });

  it('exposes connection / category metadata', () => {
    expect(typeof (Constants as any).CATEGORY_COLORS).toBe('object');
    expect(typeof (Constants as any).CATEGORY_TO_RELATIONSHIP).toBe('object');
  });

  it('exposes node-behavior labels and colors', () => {
    expect(typeof (Constants as any).BEHAVIOR_LABELS).toBe('object');
    expect(typeof (Constants as any).BEHAVIOR_COLORS).toBe('object');
  });

  it('groupWidth and groupHeight return positive numbers for plausible inputs', () => {
    const w = (Constants as any).groupWidth(2);
    const h = (Constants as any).groupHeight(2);
    expect(typeof w).toBe('number');
    expect(typeof h).toBe('number');
    expect(w).toBeGreaterThan(0);
    expect(h).toBeGreaterThan(0);
  });

  it('groupWidth/groupHeight scale with the input count', () => {
    const w1 = (Constants as any).groupWidth(1);
    const w5 = (Constants as any).groupWidth(5);
    expect(w5).toBeGreaterThanOrEqual(w1);
  });
});

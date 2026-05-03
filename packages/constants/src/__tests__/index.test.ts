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

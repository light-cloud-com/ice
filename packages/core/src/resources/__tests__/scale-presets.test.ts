/**
 * Smoke tests for the scale-presets shim split (rf-data-1).
 *
 * Verifies that the public API surface is intact after splitting
 * `scale-presets.ts` into types + data + shim.
 */

import { describe, expect, it } from 'vitest';
import * as ScalePresetsModule from '../scale-presets.js';
import {
  SCALE_PRESETS,
  SCALE_TIERS,
  SCALE_TIER_INFO,
  getAllPresetsForResource,
  getScalePreset,
} from '../scale-presets.js';

describe('scale-presets shim — public API', () => {
  it('re-exports all 7 named exports (5 values + 2 types via runtime)', () => {
    // The 5 runtime exports must all resolve.
    const namedRuntimeExports = [
      'SCALE_PRESETS',
      'SCALE_TIERS',
      'SCALE_TIER_INFO',
      'getScalePreset',
      'getAllPresetsForResource',
    ] as const;

    for (const name of namedRuntimeExports) {
      expect(ScalePresetsModule[name as keyof typeof ScalePresetsModule]).toBeDefined();
    }

    // ScaleTier and TierPreset are type-only — confirm by usage at compile time
    // (this file imports `ScaleTier` implicitly via SCALE_TIERS' element type).
  });

  it('SCALE_TIERS contains the six canonical tiers in order', () => {
    expect(SCALE_TIERS).toEqual(['dev', 'low', 'moderate', 'medium', 'high', 'very-high']);
  });

  it('SCALE_TIER_INFO has metadata for every tier in SCALE_TIERS', () => {
    for (const tier of SCALE_TIERS) {
      const info = SCALE_TIER_INFO[tier];
      expect(info.label).toBeTypeOf('string');
      expect(info.description).toBeTypeOf('string');
      expect(info.typicalUsers).toBeTypeOf('string');
      expect(info.monthlyRequests).toBeTypeOf('string');
    }
  });

  it('SCALE_PRESETS contains expected resource keys', () => {
    // Sample a few resource keys spanning compute / database / storage / messaging
    // to catch a wholesale regression in the data dict re-export.
    expect(SCALE_PRESETS['postgres-db']).toBeDefined();
    expect(SCALE_PRESETS['frontend-app']).toBeDefined();
    expect(SCALE_PRESETS['object-storage']).toBeDefined();
    expect(SCALE_PRESETS['message-queue']).toBeDefined();
    expect(SCALE_PRESETS['secret-store']).toBeDefined();
  });
});

describe('getScalePreset', () => {
  it('merges common props with provider overrides', () => {
    // postgres-db medium tier has both common props and provider-specific size.
    const result = getScalePreset('postgres-db', 'medium', 'aws');
    expect(result).toEqual({
      size: 'db.r6g.large',
      storage: '100',
      version: '17',
      production: true,
      backup_retention: '14',
    });
  });

  it('returns provider-only overrides when there are no common props', () => {
    // backend-api dev tier has only _providers and no common props.
    const result = getScalePreset('backend-api', 'dev', 'aws');
    expect(result).toEqual({ size: '0.25-512' });
  });

  it('returns empty object for unknown resource id', () => {
    expect(getScalePreset('does-not-exist', 'medium', 'aws')).toEqual({});
  });

  it('omits _providers key from the returned object', () => {
    const result = getScalePreset('postgres-db', 'medium', 'aws');
    expect(result).not.toHaveProperty('_providers');
  });

  it('returns common props only when provider has no override', () => {
    // postgres-db medium has aws/gcp/azure/digitalocean overrides but not e.g. 'kubernetes'.
    const result = getScalePreset('postgres-db', 'medium', 'kubernetes');
    expect(result).toEqual({
      storage: '100',
      version: '17',
      production: true,
      backup_retention: '14',
    });
  });
});

describe('getAllPresetsForResource', () => {
  it('returns one entry per tier in SCALE_TIERS', () => {
    const result = getAllPresetsForResource('postgres-db', 'aws');
    for (const tier of SCALE_TIERS) {
      expect(result[tier]).toBeDefined();
    }
  });

  it('matches getScalePreset for each tier', () => {
    const all = getAllPresetsForResource('postgres-db', 'aws');
    for (const tier of SCALE_TIERS) {
      expect(all[tier]).toEqual(getScalePreset('postgres-db', tier, 'aws'));
    }
  });
});

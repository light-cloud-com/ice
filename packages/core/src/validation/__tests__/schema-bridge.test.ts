/**
 * Schema Bridge Tests
 *
 * Exercises the iceType ↔ resource lookup helpers backed by
 * HIGH_LEVEL_CATEGORIES + ICE_TYPE_TO_RESOURCE_ID.
 */

import { describe, it, expect } from 'vitest';
import {
  getResourceForIceType,
  getPropertiesForIceType,
  getSupportedProviders,
  isKnownIceType,
} from '../schema-bridge';

describe('getResourceForIceType', () => {
  it('returns the matching HighLevelResource for a known iceType', () => {
    const r = getResourceForIceType('Database.PostgreSQL');
    expect(r).toBeDefined();
    expect(r?.id).toBe('postgres-db');
    expect(Array.isArray(r?.properties)).toBe(true);
  });

  it('returns undefined for unknown iceTypes', () => {
    expect(getResourceForIceType('Made.Up.Type')).toBeUndefined();
  });

  it('returns undefined for the empty string (no resourceId mapping)', () => {
    expect(getResourceForIceType('')).toBeUndefined();
  });

  it('caches the lookup map across calls (same identity)', () => {
    const a = getResourceForIceType('Database.PostgreSQL');
    const b = getResourceForIceType('Database.PostgreSQL');
    expect(a).toBe(b);
  });
});

describe('getPropertiesForIceType', () => {
  it('returns the property schema for a known iceType', () => {
    const props = getPropertiesForIceType('Database.PostgreSQL');
    expect(props.length).toBeGreaterThan(0);
    expect(props.some((p) => p.name === 'name')).toBe(true);
  });

  it('returns an empty array for an unknown iceType', () => {
    expect(getPropertiesForIceType('Made.Up.Type')).toEqual([]);
  });
});

describe('getSupportedProviders', () => {
  it('returns the providers list for a known iceType', () => {
    const providers = getSupportedProviders('Database.PostgreSQL');
    expect(providers).toContain('aws');
    expect(providers).toContain('gcp');
  });

  it('returns an empty array for an unknown iceType', () => {
    expect(getSupportedProviders('Made.Up.Type')).toEqual([]);
  });
});

describe('isKnownIceType', () => {
  it('returns false for the empty string', () => {
    expect(isKnownIceType('')).toBe(false);
  });

  it('returns true for any Group.* type without a schema', () => {
    expect(isKnownIceType('Group.Backend')).toBe(true);
  });

  it('returns true for the Network.VPC and Network.Subnet container literals', () => {
    expect(isKnownIceType('Network.VPC')).toBe(true);
    expect(isKnownIceType('Network.Subnet')).toBe(true);
  });

  it('returns true for the Source.Repository and Config.Environment specials', () => {
    expect(isKnownIceType('Source.Repository')).toBe(true);
    expect(isKnownIceType('Config.Environment')).toBe(true);
  });

  it('returns true for any iceType present in ICE_TYPE_TO_RESOURCE_ID', () => {
    expect(isKnownIceType('Database.PostgreSQL')).toBe(true);
    expect(isKnownIceType('Compute.Container')).toBe(true);
  });

  it('returns false for an unrecognised iceType string', () => {
    expect(isKnownIceType('Totally.Bogus')).toBe(false);
  });
});

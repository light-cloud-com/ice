/**
 * Tests for `schema-provider.ts`.
 *
 * The file is mostly type definitions with one runtime export:
 * `create_ice_type` — a branded-type helper that returns its input.
 */
import { describe, expect, it } from 'vitest';
import { create_ice_type } from '../schema-provider.js';

describe('create_ice_type', () => {
  it('returns the same string value (branded)', () => {
    expect(create_ice_type('aws.ec2.instance')).toBe('aws.ec2.instance');
  });

  it('preserves the empty string', () => {
    expect(create_ice_type('')).toBe('');
  });

  it('preserves arbitrary characters and whitespace', () => {
    expect(create_ice_type('  Some.Resource ')).toBe('  Some.Resource ');
  });
});

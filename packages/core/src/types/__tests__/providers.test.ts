/**
 * The providers.ts module is mostly type declarations. The single
 * runtime export is `create_provider_id`, which assembles a colon-
 * delimited string from name / region / account.
 */

import { describe, it, expect } from 'vitest';
import { create_provider_id } from '../providers';

describe('create_provider_id', () => {
  it('returns the bare name when no region/account is provided', () => {
    expect(create_provider_id({ name: 'gcp' })).toBe('gcp');
  });

  it('appends region when provided', () => {
    expect(create_provider_id({ name: 'gcp', region: 'us-central1' })).toBe('gcp:us-central1');
  });

  it('appends account when provided', () => {
    expect(create_provider_id({ name: 'aws', account: '123456789012' })).toBe('aws:123456789012');
  });

  it('joins name + region + account with colons', () => {
    expect(create_provider_id({ name: 'aws', region: 'us-east-1', account: '12345' })).toBe('aws:us-east-1:12345');
  });
});

/**
 * `toSlug` — lowercased, dash-separated, alphanumeric only, falls back to 'org'
 * when the input collapses to the empty string.
 */

import { describe, it, expect } from 'vitest';
import { toSlug } from '../slug';

describe('toSlug', () => {
  it('lowercases an all-alphabetic input', () => {
    expect(toSlug('HelloWorld')).toBe('helloworld');
  });

  it('replaces a single space with a single dash', () => {
    expect(toSlug('hello world')).toBe('hello-world');
  });

  it('collapses runs of non-alphanumeric chars into one dash', () => {
    expect(toSlug('hello   world!!!foo')).toBe('hello-world-foo');
  });

  it('trims leading and trailing dashes', () => {
    expect(toSlug('--hello--')).toBe('hello');
  });

  it('preserves digits', () => {
    expect(toSlug('abc 123')).toBe('abc-123');
  });

  it('returns "org" when the input is empty', () => {
    expect(toSlug('')).toBe('org');
  });

  it('returns "org" when only non-alphanumeric chars remain', () => {
    expect(toSlug('!!! ')).toBe('org');
  });

  it('returns "org" when the input is only dashes', () => {
    // After replace+trim the working string is empty → fallback.
    expect(toSlug('---')).toBe('org');
  });

  it('handles unicode by stripping it (non-[a-z0-9])', () => {
    expect(toSlug('café résumé')).toBe('caf-r-sum');
  });
});

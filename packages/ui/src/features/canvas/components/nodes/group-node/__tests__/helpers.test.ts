/**
 * Unit tests for the group-node helpers (`hexToTint`, `hexToBorder`).
 *
 * `hexToTint` parses a 7-char hex string ("#RRGGBB") into rgba(r, g, b, alpha)
 * with optional alpha override (default 0.09). `hexToBorder` returns the
 * input hex with a "50" suffix (50/256 ≈ 0.31 hex alpha).
 */

import { describe, it, expect } from 'vitest';
import { hexToTint, hexToBorder } from '../helpers';

describe('hexToTint', () => {
  it('default alpha = 0.09', () => {
    expect(hexToTint('#3b82f6')).toBe('rgba(59, 130, 246, 0.09)');
  });

  it('uses provided alpha override', () => {
    expect(hexToTint('#3b82f6', 0.5)).toBe('rgba(59, 130, 246, 0.5)');
  });

  it('parses lowercase hex digits', () => {
    expect(hexToTint('#abcdef', 0.1)).toBe('rgba(171, 205, 239, 0.1)');
  });

  it('parses uppercase hex digits', () => {
    expect(hexToTint('#ABCDEF', 0.1)).toBe('rgba(171, 205, 239, 0.1)');
  });

  it('handles black and white edge cases', () => {
    expect(hexToTint('#000000', 0.5)).toBe('rgba(0, 0, 0, 0.5)');
    expect(hexToTint('#ffffff', 0.25)).toBe('rgba(255, 255, 255, 0.25)');
  });
});

describe('hexToBorder', () => {
  it('appends "50" suffix to the input hex', () => {
    expect(hexToBorder('#3b82f6')).toBe('#3b82f650');
  });

  it('preserves the input letter case', () => {
    expect(hexToBorder('#ABCDEF')).toBe('#ABCDEF50');
  });

  it('does not validate the input format (passes empty/short through)', () => {
    expect(hexToBorder('')).toBe('50');
    expect(hexToBorder('#fff')).toBe('#fff50');
  });
});

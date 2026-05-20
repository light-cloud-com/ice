/**
 * `cn` — combines clsx + tailwind-merge.
 *
 * The implementation is a one-liner so we focus on observable behavior:
 * conditional values, falsy filtering, tailwind conflict resolution.
 */

import { describe, it, expect } from 'vitest';
import { cn } from '../cn';

describe('cn', () => {
  it('joins string class names with a space', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c');
  });

  it('returns the empty string when called with no inputs', () => {
    expect(cn()).toBe('');
  });

  it('drops falsy values (false, null, undefined, 0, "")', () => {
    expect(cn('a', false, null, undefined, 0, '', 'b')).toBe('a b');
  });

  it('keeps the truthy half of a ternary', () => {
    const isActive = true;
    expect(cn('base', isActive && 'active')).toBe('base active');
  });

  it('drops the falsy half of a ternary', () => {
    const isActive = false;
    expect(cn('base', isActive && 'active')).toBe('base');
  });

  it('respects object form { className: boolean }', () => {
    expect(cn({ a: true, b: false, c: true })).toBe('a c');
  });

  it('flattens nested array inputs', () => {
    expect(cn(['a', 'b'], ['c'])).toBe('a b c');
  });

  it('resolves tailwind conflicts so the last class wins', () => {
    // tailwind-merge collapses competing utilities; px-2 wins over px-4 here.
    expect(cn('px-4', 'px-2')).toBe('px-2');
  });

  it('keeps non-conflicting tailwind classes intact', () => {
    expect(cn('text-red-500', 'bg-blue-500')).toBe('text-red-500 bg-blue-500');
  });
});

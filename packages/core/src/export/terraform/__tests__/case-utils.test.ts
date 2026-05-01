/**
 * Tests for `terraform/case-utils.ts` (rf-tfexp-2).
 *
 * Pure-function helper, hit 100% with simple input/output pinning.
 * Behaviour preserved verbatim from pre-extraction L420-428 of
 * `terraform-exporter.ts`.
 */
import { describe, expect, it } from 'vitest';
import { sanitize_name } from '../case-utils.js';

describe('sanitize_name', () => {
  it('passes through alphanumerics, underscores, and hyphens', () => {
    expect(sanitize_name('foo_bar-baz123')).toBe('foo_bar-baz123');
  });

  it('replaces dots with underscore', () => {
    expect(sanitize_name('foo.bar')).toBe('foo_bar');
  });

  it('replaces slashes with underscore', () => {
    expect(sanitize_name('foo/bar')).toBe('foo_bar');
  });

  it('replaces spaces with underscore', () => {
    expect(sanitize_name('hello world')).toBe('hello_world');
  });

  it('prefixes leading digit with underscore', () => {
    expect(sanitize_name('1web')).toBe('_1web');
    expect(sanitize_name('9-foo')).toBe('_9-foo');
  });

  it('does not prefix non-leading digits', () => {
    expect(sanitize_name('a1')).toBe('a1');
  });

  it('handles empty string', () => {
    expect(sanitize_name('')).toBe('');
  });

  it('replaces unicode with underscore', () => {
    expect(sanitize_name('café')).toBe('caf_');
  });

  it('preserves underscores (key difference vs Pulumi sanitize_name behaviour)', () => {
    // Terraform: underscores preserved
    expect(sanitize_name('my_name')).toBe('my_name');
  });

  it('preserves hyphens', () => {
    expect(sanitize_name('my-name')).toBe('my-name');
  });
});

/**
 * Tests for `pulumi/case-utils.ts` (rf-pulumi-2).
 *
 * Pure-function helpers, hit 100% with simple input/output pinning.
 * Behaviour preserved verbatim from pre-extraction L317-326,
 * L356-358, L386-388, L613-615 of `pulumi-exporter.ts`.
 *
 * The two sanitisers are NOT interchangeable; pinned separately:
 *  - `sanitize_name` (YAML resource id) keeps `-` AND `_`.
 *  - `sanitize_var_name` (TS identifier) keeps only `_`, replaces
 *    `-` with `_`.
 *
 * Leading-digit rule also differs:
 *  - `sanitize_name` prepends `r-`.
 *  - `sanitize_var_name` prepends `_`.
 */
import { describe, expect, it } from 'vitest';
import { sanitize_name, sanitize_var_name, to_camel_case, to_pascal_case } from '../case-utils';

describe('to_pascal_case', () => {
  it('TitleCases a single word', () => {
    expect(to_pascal_case('foo')).toBe('Foo');
  });

  it('splits on underscore and TitleCases each segment', () => {
    expect(to_pascal_case('foo_bar')).toBe('FooBar');
    expect(to_pascal_case('foo_bar_baz')).toBe('FooBarBaz');
  });

  it('splits on hyphen and TitleCases each segment', () => {
    expect(to_pascal_case('foo-bar')).toBe('FooBar');
    expect(to_pascal_case('foo-bar-baz')).toBe('FooBarBaz');
  });

  it('lower-cases the tail of each word', () => {
    expect(to_pascal_case('FOO_BAR')).toBe('FooBar');
    expect(to_pascal_case('FOOBAR')).toBe('Foobar');
  });

  it('returns empty string for empty input', () => {
    expect(to_pascal_case('')).toBe('');
  });

  it('handles a single-character word', () => {
    expect(to_pascal_case('a')).toBe('A');
    expect(to_pascal_case('a_b')).toBe('AB');
  });

  it('preserves digits inside a word', () => {
    expect(to_pascal_case('ec2_instance')).toBe('Ec2Instance');
  });
});

describe('to_camel_case', () => {
  it('lower-cases letter after underscore and removes the underscore', () => {
    expect(to_camel_case('foo_bar')).toBe('fooBar');
    expect(to_camel_case('foo_bar_baz')).toBe('fooBarBaz');
  });

  it('is a no-op when there are no underscores', () => {
    expect(to_camel_case('foobar')).toBe('foobar');
    expect(to_camel_case('FooBar')).toBe('FooBar');
  });

  it('returns empty string for empty input', () => {
    expect(to_camel_case('')).toBe('');
  });

  it('only matches lowercase letters after underscore (regex constraint)', () => {
    // Pre-extraction regex: /_([a-z])/g — uppercase letters after _
    // are not consumed; the underscore stays.
    expect(to_camel_case('foo_BAR')).toBe('foo_BAR');
  });

  it('handles a leading underscore', () => {
    expect(to_camel_case('_foo_bar')).toBe('FooBar');
  });

  it('preserves digits', () => {
    expect(to_camel_case('foo_2bar')).toBe('foo_2bar'); // digits not matched by [a-z]
    expect(to_camel_case('foo2_bar')).toBe('foo2Bar');
  });
});

describe('sanitize_name', () => {
  it('passes through alphanumerics, underscores, and hyphens', () => {
    expect(sanitize_name('foo_bar-baz123')).toBe('foo_bar-baz123');
  });

  it('replaces dots and slashes with hyphen', () => {
    expect(sanitize_name('foo.bar')).toBe('foo-bar');
    expect(sanitize_name('foo/bar')).toBe('foo-bar');
  });

  it('replaces spaces with hyphen', () => {
    expect(sanitize_name('hello world')).toBe('hello-world');
  });

  it('prefixes leading digit with r-', () => {
    expect(sanitize_name('1web')).toBe('r-1web');
    expect(sanitize_name('9-foo')).toBe('r-9-foo');
  });

  it('does not prefix non-leading digits', () => {
    expect(sanitize_name('a1')).toBe('a1');
  });

  it('handles empty string', () => {
    expect(sanitize_name('')).toBe('');
  });

  it('replaces unicode with hyphen', () => {
    expect(sanitize_name('café')).toBe('caf-');
  });
});

describe('sanitize_var_name', () => {
  it('passes through alphanumerics and underscores', () => {
    expect(sanitize_var_name('foo_bar123')).toBe('foo_bar123');
  });

  it('replaces hyphens with underscore (key difference vs sanitize_name)', () => {
    expect(sanitize_var_name('foo-bar')).toBe('foo_bar');
  });

  it('replaces dots and slashes with underscore', () => {
    expect(sanitize_var_name('foo.bar')).toBe('foo_bar');
    expect(sanitize_var_name('foo/bar')).toBe('foo_bar');
  });

  it('prefixes leading digit with underscore (key difference vs sanitize_name)', () => {
    expect(sanitize_var_name('1web')).toBe('_1web');
    expect(sanitize_var_name('9foo')).toBe('_9foo');
  });

  it('does not prefix non-leading digits', () => {
    expect(sanitize_var_name('a1')).toBe('a1');
  });

  it('handles empty string', () => {
    expect(sanitize_var_name('')).toBe('');
  });

  it('replaces unicode with underscore', () => {
    expect(sanitize_var_name('café')).toBe('caf_');
  });

  it('differs from sanitize_name on hyphens (regression guard)', () => {
    // sanitize_name: 'foo-bar' -> 'foo-bar' (preserve)
    // sanitize_var_name: 'foo-bar' -> 'foo_bar' (replace)
    expect(sanitize_name('foo-bar')).toBe('foo-bar');
    expect(sanitize_var_name('foo-bar')).toBe('foo_bar');
  });

  it('differs from sanitize_name on leading-digit prefix (regression guard)', () => {
    // sanitize_name: '1web' -> 'r-1web'
    // sanitize_var_name: '1web' -> '_1web'
    expect(sanitize_name('1web')).toBe('r-1web');
    expect(sanitize_var_name('1web')).toBe('_1web');
  });
});

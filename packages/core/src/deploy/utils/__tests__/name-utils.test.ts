/**
 * Tests for `utils/name-utils.ts` — string sanitization helpers shared
 * across the card-to-graph translator. Pure functions; direct vitest
 * cases covering empty inputs, fallbacks, unit-prefix order, and the
 * RISK #9 `cleaned || 'unknown'` fallback for `sanitize_label_value`.
 */

import { describe, it, expect } from 'vitest';
import {
  sanitize_name,
  sanitize_label_value,
  parse_storage_gb,
  normalize_runtime,
} from '../name-utils.js';

describe('sanitize_name', () => {
  it('returns empty string when given empty input', () => {
    expect(sanitize_name('')).toBe('');
  });

  it('passes alphanumeric lowercase through unchanged', () => {
    expect(sanitize_name('myresource123')).toBe('myresource123');
  });

  it('lowercases uppercase letters', () => {
    expect(sanitize_name('MyResource')).toBe('myresource');
  });

  it('replaces spaces and special characters with hyphens', () => {
    expect(sanitize_name('my resource!name@')).toBe('my-resource-name');
  });

  it('collapses consecutive hyphens into a single hyphen', () => {
    expect(sanitize_name('foo!!!bar')).toBe('foo-bar');
    expect(sanitize_name('a---b')).toBe('a-b');
  });

  it('strips leading and trailing hyphens after replacement', () => {
    expect(sanitize_name('-foo-')).toBe('foo');
    expect(sanitize_name('!foo!')).toBe('foo');
  });

  it('truncates outputs longer than 63 characters', () => {
    const long_input = 'a'.repeat(80);
    const result = sanitize_name(long_input);
    expect(result.length).toBe(63);
    expect(result).toBe('a'.repeat(63));
  });

  it('preserves underscores by replacing them with hyphens (not allowed in names)', () => {
    expect(sanitize_name('foo_bar')).toBe('foo-bar');
  });

  it('handles digits and hyphens together', () => {
    expect(sanitize_name('app-123-prod')).toBe('app-123-prod');
  });
});

describe('sanitize_label_value', () => {
  it('returns "unknown" for null input', () => {
    expect(sanitize_label_value(null)).toBe('unknown');
  });

  it('returns "unknown" for undefined input', () => {
    expect(sanitize_label_value(undefined)).toBe('unknown');
  });

  it('returns "unknown" for empty string input', () => {
    expect(sanitize_label_value('')).toBe('unknown');
  });

  it('passes a valid label value through unchanged', () => {
    expect(sanitize_label_value('my-label_value123')).toBe('my-label_value123');
  });

  it('lowercases uppercase characters', () => {
    expect(sanitize_label_value('MyLabel')).toBe('mylabel');
  });

  it('preserves underscores (allowed in label values, unlike names)', () => {
    expect(sanitize_label_value('_foo_')).toBe('_foo_');
    expect(sanitize_label_value('foo_bar')).toBe('foo_bar');
  });

  it('falls back to "unknown" when input sanitizes to empty (RISK #9)', () => {
    // `'---'` lowercases to `'---'`, collapses to `'-'`, strips leading/trailing
    // hyphens to `''`, which triggers the `cleaned || 'unknown'` fallback at
    // the original L1545 of card-translator.ts. This fallback shows up in
    // every deployed resource's GCP labels — must remain `'unknown'` verbatim.
    expect(sanitize_label_value('---')).toBe('unknown');
    expect(sanitize_label_value('!@#')).toBe('unknown');
  });

  it('replaces special characters with hyphens', () => {
    expect(sanitize_label_value('foo bar!baz')).toBe('foo-bar-baz');
  });

  it('collapses consecutive hyphens into one', () => {
    expect(sanitize_label_value('foo!!!bar')).toBe('foo-bar');
  });

  it('strips leading and trailing hyphens', () => {
    expect(sanitize_label_value('-foo-')).toBe('foo');
  });

  it('truncates outputs longer than 63 characters', () => {
    const long_input = 'a'.repeat(80);
    expect(sanitize_label_value(long_input).length).toBe(63);
  });
});

describe('parse_storage_gb', () => {
  it('returns undefined for undefined input', () => {
    expect(parse_storage_gb(undefined)).toBeUndefined();
  });

  it('parses GB suffix as the literal number', () => {
    expect(parse_storage_gb('50 GB')).toBe(50);
  });

  it('parses TB suffix as 1024 * number', () => {
    expect(parse_storage_gb('2 TB')).toBe(2048);
  });

  it('parses MB suffix using Math.round + Math.max(1, ...) guard', () => {
    // 500 / 1024 ≈ 0.488 → rounds to 0 → guarded up to 1.
    expect(parse_storage_gb('500 MB')).toBe(1);
    // 2048 MB → round to 2 → no guard kick-in.
    expect(parse_storage_gb('2048 MB')).toBe(2);
  });

  it('returns undefined for input with no recognized unit', () => {
    expect(parse_storage_gb('foo')).toBeUndefined();
  });

  it('returns undefined for a number without a unit', () => {
    expect(parse_storage_gb('50')).toBeUndefined();
  });

  it('returns undefined when unit precedes number', () => {
    expect(parse_storage_gb('gb 50')).toBeUndefined();
  });

  it('is case-insensitive for the unit', () => {
    expect(parse_storage_gb('50 gb')).toBe(50);
    expect(parse_storage_gb('2 tb')).toBe(2048);
  });

  it('tolerates missing whitespace between number and unit', () => {
    expect(parse_storage_gb('50GB')).toBe(50);
  });
});

describe('normalize_runtime', () => {
  it('returns undefined for undefined input', () => {
    expect(normalize_runtime(undefined)).toBeUndefined();
  });

  it('normalizes "Node.js 20" to "nodejs20"', () => {
    expect(normalize_runtime('Node.js 20')).toBe('nodejs20');
  });

  it('falls back to nodejs20 when node has no version', () => {
    expect(normalize_runtime('Node')).toBe('nodejs20');
  });

  it('normalizes "Python 3.12" to "python312"', () => {
    expect(normalize_runtime('Python 3.12')).toBe('python312');
  });

  it('falls back to python312 when python has no version', () => {
    expect(normalize_runtime('Python')).toBe('python312');
  });

  it('normalizes "Go 1.21" to "go121"', () => {
    expect(normalize_runtime('Go 1.21')).toBe('go121');
  });

  it('falls back to go121 when go has no version', () => {
    expect(normalize_runtime('Go')).toBe('go121');
  });

  it('normalizes "Java 17" to "java17"', () => {
    expect(normalize_runtime('Java 17')).toBe('java17');
  });

  it('falls back to java17 when java has no version', () => {
    expect(normalize_runtime('Java')).toBe('java17');
  });

  it('falls back to lowercase non-alphanumeric strip for unknown runtimes', () => {
    expect(normalize_runtime('Rust')).toBe('rust');
  });

  it('strips non-alphanumeric characters in the fallback path', () => {
    expect(normalize_runtime('C++')).toBe('c');
  });
});

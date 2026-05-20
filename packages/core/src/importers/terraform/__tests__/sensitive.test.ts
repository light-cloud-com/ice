/**
 * Tests for Terraform sensitive-attribute masking + empty metadata
 * (rf-timp-1 extraction).
 */

import { describe, it, expect } from 'vitest';
import { mask_sensitive_attributes, mask_path, create_empty_metadata } from '../sensitive';

describe('mask_sensitive_attributes', () => {
  it('masks a top-level sensitive attribute', () => {
    const result = mask_sensitive_attributes({ password: 'secret', user: 'a' }, ['password']);
    expect(result).toEqual({ password: '***SENSITIVE***', user: 'a' });
  });

  it('masks a nested attribute via dotted path', () => {
    const result = mask_sensitive_attributes({ connection: { user: 'a', password: 'secret' } }, [
      'connection.password',
    ]);
    expect(result).toEqual({ connection: { user: 'a', password: '***SENSITIVE***' } });
  });

  it('masks an attribute referenced via bracket-array path', () => {
    const result = mask_sensitive_attributes({ tags: { '0': { value: 'v' } } }, ['tags[0].value']);
    expect(result).toEqual({ tags: { '0': { value: '***SENSITIVE***' } } });
  });

  it('returns a shallow copy — input is not mutated', () => {
    const input = { password: 'secret' };
    const result = mask_sensitive_attributes(input, ['password']);
    expect(result).not.toBe(input);
    expect(input).toEqual({ password: 'secret' });
  });

  it('skips paths that miss the object (no error)', () => {
    const result = mask_sensitive_attributes({ a: 1 }, ['nonexistent.path']);
    expect(result).toEqual({ a: 1 });
  });

  it('returns input when no sensitive paths are supplied', () => {
    const result = mask_sensitive_attributes({ a: 1 }, []);
    expect(result).toEqual({ a: 1 });
  });

  it('handles multiple paths', () => {
    const result = mask_sensitive_attributes({ p1: 'a', p2: 'b', p3: 'c' }, ['p1', 'p3']);
    expect(result).toEqual({ p1: '***SENSITIVE***', p2: 'b', p3: '***SENSITIVE***' });
  });
});

describe('mask_path', () => {
  it('returns early for an empty path', () => {
    const obj = { a: 1 };
    mask_path(obj, []);
    expect(obj).toEqual({ a: 1 });
  });

  it('returns early for a path whose first segment is missing', () => {
    const obj = { a: 1 };
    mask_path(obj, ['b']);
    expect(obj).toEqual({ a: 1 });
  });

  it('does not descend into a non-object intermediate', () => {
    const obj = { a: 'leaf' };
    mask_path(obj, ['a', 'deeper']);
    expect(obj).toEqual({ a: 'leaf' });
  });

  it('does not descend into a null intermediate', () => {
    const obj: Record<string, unknown> = { a: null };
    mask_path(obj, ['a', 'deeper']);
    expect(obj).toEqual({ a: null });
  });

  it('mutates the leaf in place at the end of the path', () => {
    const obj = { a: { b: 'v' } };
    mask_path(obj, ['a', 'b']);
    expect(obj.a.b).toBe('***SENSITIVE***');
  });
});

describe('create_empty_metadata', () => {
  it('returns the unknown sentinel shape', () => {
    const m = create_empty_metadata();
    expect(m.terraform_version).toBe('unknown');
    expect(m.state_version).toBe(0);
    expect(m.serial).toBe(0);
    expect(m.lineage).toBe('');
    expect(m.resource_count).toBe(0);
    expect(m.output_count).toBe(0);
    expect(m.imported_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

/**
 * Tests for the Result<T, E> functional helpers in core/types/result.ts.
 *
 * Pure functions, no I/O. Drives every constructor, type guard,
 * extraction helper, transformation, combinator, and async wrapper.
 */

import { describe, it, expect } from 'vitest';
import {
  success,
  failure,
  is_success,
  is_failure,
  unwrap_or,
  unwrap_or_else,
  unwrap,
  unwrap_error,
  map,
  map_error,
  flat_map,
  or_else,
  all,
  any,
  partition,
  from_promise,
  from_try,
  from_nullable,
} from '../result';

describe('constructors + guards', () => {
  it('success / failure shape', () => {
    expect(success(1)).toEqual({ ok: true, value: 1 });
    expect(failure('e')).toEqual({ ok: false, error: 'e' });
  });

  it('is_success / is_failure narrow correctly', () => {
    expect(is_success(success(1))).toBe(true);
    expect(is_success(failure('e'))).toBe(false);
    expect(is_failure(failure('e'))).toBe(true);
    expect(is_failure(success(1))).toBe(false);
  });
});

describe('extraction helpers', () => {
  it('unwrap_or returns the value on success', () => {
    expect(unwrap_or(success(1), 99)).toBe(1);
  });
  it('unwrap_or returns the default on failure', () => {
    expect(unwrap_or(failure('e'), 99)).toBe(99);
  });
  it('unwrap_or_else returns the value on success', () => {
    expect(unwrap_or_else(success(1), () => 99)).toBe(1);
  });
  it('unwrap_or_else computes the default from the error on failure', () => {
    expect(unwrap_or_else(failure('boom'), (e) => e.length)).toBe(4);
  });
  it('unwrap returns the value on success', () => {
    expect(unwrap(success(1))).toBe(1);
  });
  it('unwrap throws the error on failure', () => {
    expect(() => unwrap(failure(new Error('boom')))).toThrow(/boom/);
  });
  it('unwrap_error returns the error on failure', () => {
    expect(unwrap_error(failure('e'))).toBe('e');
  });
  it('unwrap_error throws on success', () => {
    expect(() => unwrap_error(success(1))).toThrow(/successful result/);
  });
});

describe('transformations', () => {
  it('map runs fn on success', () => {
    expect(map(success(2), (n) => n * 3)).toEqual({ ok: true, value: 6 });
  });
  it('map is a no-op on failure', () => {
    const f = failure('e');
    expect(map(f, (n: number) => n * 2)).toBe(f);
  });
  it('map_error runs fn on failure', () => {
    expect(map_error(failure('boom'), (e) => e.length)).toEqual({ ok: false, error: 4 });
  });
  it('map_error is a no-op on success', () => {
    const s = success(1);
    expect(map_error(s, (e: string) => e.length)).toBe(s);
  });
  it('flat_map chains result-returning fns on success', () => {
    expect(flat_map(success(2), (n) => success(n + 1))).toEqual({ ok: true, value: 3 });
    expect(flat_map(success(2), () => failure('e'))).toEqual({ ok: false, error: 'e' });
  });
  it('flat_map is a no-op on failure', () => {
    const f = failure('e');
    expect(flat_map(f, () => success(1))).toBe(f);
  });
  it('or_else recovers from failure', () => {
    expect(or_else(failure('e'), () => success(1))).toEqual({ ok: true, value: 1 });
    expect(or_else(failure('e'), () => failure('also-e'))).toEqual({ ok: false, error: 'also-e' });
  });
  it('or_else is a no-op on success', () => {
    const s = success(1);
    expect(or_else(s, () => success(99))).toBe(s);
  });
});

describe('combinators', () => {
  it('all collects values when every result is success', () => {
    expect(all([success(1), success(2), success(3)])).toEqual({ ok: true, value: [1, 2, 3] });
  });
  it('all returns the first failure', () => {
    expect(all([success(1), failure('e1'), failure('e2')])).toEqual({ ok: false, error: 'e1' });
  });
  it('all returns success with [] for empty input', () => {
    expect(all([])).toEqual({ ok: true, value: [] });
  });
  it('any returns the first success', () => {
    expect(any([failure('a'), success(1), failure('b')])).toEqual({ ok: true, value: 1 });
  });
  it('any returns the last failure when all fail', () => {
    expect(any([failure('a'), failure('b'), failure('c')])).toEqual({ ok: false, error: 'c' });
  });
  it('any throws on empty input', () => {
    expect(() => any([])).toThrow(/empty/);
  });
  it('partition splits into successes and failures', () => {
    const out = partition([success(1), failure('e'), success(2), failure('f')]);
    expect(out).toEqual({ successes: [1, 2], failures: ['e', 'f'] });
  });
});

describe('async helpers', () => {
  it('from_promise wraps a resolved promise into a Success', async () => {
    expect(await from_promise(Promise.resolve(1))).toEqual({ ok: true, value: 1 });
  });
  it('from_promise wraps a rejected promise into a Failure with the raw error', async () => {
    const err = new Error('boom');
    expect(await from_promise(Promise.reject(err))).toEqual({ ok: false, error: err });
  });
  it('from_promise applies an error_mapper when one is provided', async () => {
    const out = await from_promise(Promise.reject(new Error('boom')), (e) => `mapped:${(e as Error).message}`);
    expect(out).toEqual({ ok: false, error: 'mapped:boom' });
  });

  it('from_try wraps a synchronous function returning normally', () => {
    expect(from_try(() => 1)).toEqual({ ok: true, value: 1 });
  });
  it('from_try wraps a thrown error', () => {
    const err = new Error('sync-boom');
    expect(
      from_try(() => {
        throw err;
      }),
    ).toEqual({ ok: false, error: err });
  });
  it('from_try applies an error_mapper', () => {
    const out = from_try(
      () => {
        throw new Error('sync-boom');
      },
      (e) => `mapped:${(e as Error).message}`,
    );
    expect(out).toEqual({ ok: false, error: 'mapped:sync-boom' });
  });

  it('from_nullable wraps null/undefined into a Failure', () => {
    expect(from_nullable(null, 'missing')).toEqual({ ok: false, error: 'missing' });
    expect(from_nullable(undefined, 'missing')).toEqual({ ok: false, error: 'missing' });
  });
  it('from_nullable wraps a defined value into Success', () => {
    expect(from_nullable(1, 'missing')).toEqual({ ok: true, value: 1 });
    expect(from_nullable('', 'missing')).toEqual({ ok: true, value: '' }); // empty string is "defined"
    expect(from_nullable(0, 'missing')).toEqual({ ok: true, value: 0 });
  });
});

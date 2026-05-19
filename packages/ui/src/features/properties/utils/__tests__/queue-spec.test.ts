/**
 * rf-props-1 — queue-spec util.
 *
 * Two-tier parse semantics:
 *   1. Try JSON.parse and verify the result is `{ name: string, … }`.
 *   2. Otherwise fall through to the plain-string-upgrade `{ name: raw, fifo: false }`.
 *
 * The truthy `!!q.fifo` coercion in stringify is also asserted, since the
 * field is optional / loosely-typed (a `1`-valued legacy entry should
 * round-trip as `true`).
 */

import { describe, it, expect } from 'vitest';
import { parseQueue, stringifyQueue, type QueueSpec } from '../queue-spec';

describe('parseQueue', () => {
  it('returns the queue spec when given valid JSON with fifo:false', () => {
    expect(parseQueue('{"name":"orders","fifo":false}')).toEqual({
      name: 'orders',
      fifo: false,
    });
  });

  it('returns the queue spec when given valid JSON with fifo:true', () => {
    expect(parseQueue('{"name":"orders","fifo":true}')).toEqual({
      name: 'orders',
      fifo: true,
    });
  });

  it('upgrades a plain-string entry to a queue spec with fifo:false (backwards compat)', () => {
    expect(parseQueue('orders')).toEqual({ name: 'orders', fifo: false });
  });

  it('treats malformed JSON as a plain-string-upgrade name', () => {
    expect(parseQueue('invalid-json{')).toEqual({
      name: 'invalid-json{',
      fifo: false,
    });
  });

  it('treats an empty string as a queue with empty name', () => {
    expect(parseQueue('')).toEqual({ name: '', fifo: false });
  });

  it('coerces truthy fifo (e.g. fifo:1) to true via !! truthiness', () => {
    expect(parseQueue('{"name":"x","fifo":1}')).toEqual({ name: 'x', fifo: true });
  });

  it('falls through to plain-string-upgrade when parsed name is not a string', () => {
    expect(parseQueue('{"name":123,"fifo":true}')).toEqual({
      name: '{"name":123,"fifo":true}',
      fifo: false,
    });
  });

  it('falls through to plain-string-upgrade when JSON parses to an array', () => {
    expect(parseQueue('["foo"]')).toEqual({ name: '["foo"]', fifo: false });
  });

  it('falls through to plain-string-upgrade when JSON parses to null', () => {
    expect(parseQueue('null')).toEqual({ name: 'null', fifo: false });
  });
});

describe('stringifyQueue', () => {
  it('coerces an undefined fifo to false on output', () => {
    expect(stringifyQueue({ name: 'orders' })).toBe('{"name":"orders","fifo":false}');
  });

  it('preserves fifo:true on output', () => {
    expect(stringifyQueue({ name: 'orders', fifo: true })).toBe(
      '{"name":"orders","fifo":true}',
    );
  });

  it('preserves fifo:false on output', () => {
    expect(stringifyQueue({ name: 'orders', fifo: false })).toBe(
      '{"name":"orders","fifo":false}',
    );
  });

  it('coerces a truthy non-boolean fifo (e.g. 1) to true via !! truthiness', () => {
    const q = { name: 'x', fifo: 1 as unknown as boolean } as QueueSpec;
    expect(stringifyQueue(q)).toBe('{"name":"x","fifo":true}');
  });
});

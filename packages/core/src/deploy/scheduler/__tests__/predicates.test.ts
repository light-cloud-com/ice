/**
 * Unit tests for the rf-sched-3 scheduling predicates.
 *
 * Pure-function tests against a hand-rolled `SchedulerContext`. No
 * deployer / class instance / async machinery — every test seeds
 * `records`, `in_flight`, `handler_in_flight` directly and asserts
 * the predicate output.
 */

import { describe, it, expect } from 'vitest';
import { collect_ready, deps_satisfied, is_unfinished, match_handler_prefix } from '../predicates';
import type { ResourceChange } from '../../../diff/types';
import type { Graph } from '../../../types/graph';
import type { ProviderDeployer, DeployOptions, NodeTerminalStatus } from '../../types';
import type { NodeRecord, SchedulerContext } from '../types';

// ─── helpers ─────────────────────────────────────────────────────────

function build_change(name: string, type: string): ResourceChange {
  return {
    id: `${type}:${name}`,
    name,
    type,
    provider: 'gcp',
    change_type: 'create',
    property_changes: [],
    current_properties: null,
    desired_properties: {},
  };
}

function rec(
  name: string,
  type: string,
  opts: { deps?: string[]; dependents?: string[]; terminal?: NodeTerminalStatus } = {},
): NodeRecord {
  return {
    change: build_change(name, type),
    deps: new Set(opts.deps ?? []),
    dependents: new Set(opts.dependents ?? []),
    terminal: opts.terminal,
    queued_emitted: false,
  };
}

function ctx(records: NodeRecord[], overrides: Partial<SchedulerContext> = {}): SchedulerContext {
  const records_map = new Map<string, NodeRecord>();
  for (const r of records) records_map.set(r.change.id, r);
  const default_per_handler_caps: Record<string, number> = {
    'gcp.sql.': 1,
    'gcp.redis.': 1,
  };
  const default_handler_cap_prefixes = Object.keys(default_per_handler_caps).sort((a, b) => b.length - a.length);
  return {
    changes: records.map((r) => r.change),
    phase: 'create',
    graph: { edges: new Map(), nodes: new Map() } as unknown as Graph,
    deployer: {} as ProviderDeployer,
    options: { provider: 'gcp' } as DeployOptions,
    pool_size: 4,
    per_handler_caps: default_per_handler_caps,
    handler_cap_prefixes: default_handler_cap_prefixes,
    records: records_map,
    results: [],
    in_flight: new Set(),
    handler_in_flight: new Map(),
    hard_failed: false,
    aborted: false,
    ...overrides,
  };
}

// ─── is_unfinished ───────────────────────────────────────────────────

describe('is_unfinished', () => {
  it('returns false for an empty Map', () => {
    expect(is_unfinished(ctx([]))).toBe(false);
  });

  it('returns true if any record has no terminal state', () => {
    const c = ctx([rec('a', 'gcp.storage.bucket')]);
    expect(is_unfinished(c)).toBe(true);
  });

  it('returns false when every record is terminal', () => {
    const c = ctx([
      rec('a', 'gcp.storage.bucket', { terminal: 'succeeded' }),
      rec('b', 'gcp.storage.bucket', { terminal: 'failed' }),
      rec('c', 'gcp.storage.bucket', { terminal: 'cancelled-due-to-dep' }),
    ]);
    expect(is_unfinished(c)).toBe(false);
  });
});

// ─── deps_satisfied ──────────────────────────────────────────────────

describe('deps_satisfied', () => {
  it('returns true for a node with no deps', () => {
    const a = rec('a', 'gcp.storage.bucket');
    const c = ctx([a]);
    expect(deps_satisfied(c, a)).toBe(true);
  });

  it('returns false when a dep has not yet succeeded', () => {
    const a = rec('a', 'gcp.storage.bucket');
    const b = rec('b', 'gcp.storage.bucket', { deps: [a.change.id] });
    const c = ctx([a, b]);
    expect(deps_satisfied(c, b)).toBe(false);
  });

  it('returns true when all deps are succeeded', () => {
    const a = rec('a', 'gcp.storage.bucket', { terminal: 'succeeded' });
    const b = rec('b', 'gcp.storage.bucket', { deps: [a.change.id] });
    const c = ctx([a, b]);
    expect(deps_satisfied(c, b)).toBe(true);
  });

  it('returns false when a dep failed (only succeeded counts)', () => {
    const a = rec('a', 'gcp.storage.bucket', { terminal: 'failed' });
    const b = rec('b', 'gcp.storage.bucket', { deps: [a.change.id] });
    const c = ctx([a, b]);
    expect(deps_satisfied(c, b)).toBe(false);
  });

  it('returns false when a dep is missing from the records map', () => {
    const b = rec('b', 'gcp.storage.bucket', { deps: ['nonexistent:x'] });
    const c = ctx([b]);
    expect(deps_satisfied(c, b)).toBe(false);
  });
});

// ─── match_handler_prefix ────────────────────────────────────────────

describe('match_handler_prefix', () => {
  it('returns null when no prefix matches', () => {
    const c = ctx([]);
    expect(match_handler_prefix(c, 'gcp.storage.bucket')).toBeNull();
  });

  it('matches the longest configured prefix', () => {
    const c = ctx([], {
      per_handler_caps: { 'gcp.': 4, 'gcp.sql.': 1 },
      handler_cap_prefixes: ['gcp.sql.', 'gcp.'],
    });
    expect(match_handler_prefix(c, 'gcp.sql.databaseInstance')).toBe('gcp.sql.');
  });

  it('falls back to a shorter prefix when no longer one matches', () => {
    const c = ctx([], {
      per_handler_caps: { 'gcp.': 4, 'gcp.sql.': 1 },
      handler_cap_prefixes: ['gcp.sql.', 'gcp.'],
    });
    expect(match_handler_prefix(c, 'gcp.storage.bucket')).toBe('gcp.');
  });

  it('returns the default sql/redis prefixes for matching types', () => {
    const c = ctx([]);
    expect(match_handler_prefix(c, 'gcp.sql.databaseInstance')).toBe('gcp.sql.');
    expect(match_handler_prefix(c, 'gcp.redis.instance')).toBe('gcp.redis.');
    expect(match_handler_prefix(c, 'gcp.storage.bucket')).toBeNull();
  });
});

// ─── collect_ready ───────────────────────────────────────────────────

describe('collect_ready', () => {
  it('returns [] when aborted', () => {
    const a = rec('a', 'gcp.storage.bucket');
    const c = ctx([a], { aborted: true });
    expect(collect_ready(c)).toEqual([]);
  });

  it('returns [] when hard_failed', () => {
    const a = rec('a', 'gcp.storage.bucket');
    const c = ctx([a], { hard_failed: true });
    expect(collect_ready(c)).toEqual([]);
  });

  it('skips terminal records', () => {
    const a = rec('a', 'gcp.storage.bucket', { terminal: 'succeeded' });
    const b = rec('b', 'gcp.storage.bucket');
    const c = ctx([a, b]);
    expect(collect_ready(c)).toEqual(['gcp.storage.bucket:b']);
  });

  it('skips records already in flight', () => {
    const a = rec('a', 'gcp.storage.bucket');
    const b = rec('b', 'gcp.storage.bucket');
    const c = ctx([a, b], { in_flight: new Set(['gcp.storage.bucket:a']) });
    expect(collect_ready(c)).toEqual(['gcp.storage.bucket:b']);
  });

  it('skips records whose deps are not yet satisfied', () => {
    const a = rec('a', 'gcp.storage.bucket');
    const b = rec('b', 'gcp.storage.bucket', { deps: [a.change.id] });
    const c = ctx([a, b]);
    // a is ready; b isn't (a not succeeded).
    expect(collect_ready(c)).toEqual(['gcp.storage.bucket:a']);
  });

  it('respects pool_size, leaving the rest for the next tick', () => {
    const records = ['a', 'b', 'c', 'd', 'e'].map((n) => rec(n, 'gcp.storage.bucket'));
    const c = ctx(records, { pool_size: 2 });
    expect(collect_ready(c)).toEqual(['gcp.storage.bucket:a', 'gcp.storage.bucket:b']);
  });

  it('combines in_flight with within-loop reservations against pool_size', () => {
    const records = ['a', 'b', 'c'].map((n) => rec(n, 'gcp.storage.bucket'));
    const c = ctx(records, { pool_size: 2, in_flight: new Set(['gcp.storage.bucket:a']) });
    // 1 in flight + pool_size 2 → only 1 more slot. b returned, c held back.
    expect(collect_ready(c)).toEqual(['gcp.storage.bucket:b']);
  });

  it('respects per-handler caps (sql.* capped at 1)', () => {
    const records = ['s1', 's2', 's3'].map((n) => rec(n, 'gcp.sql.databaseInstance'));
    const c = ctx(records);
    expect(collect_ready(c)).toEqual(['gcp.sql.databaseInstance:s1']);
  });

  it('does not let one handler cap starve other handlers', () => {
    const records = [
      rec('sql1', 'gcp.sql.databaseInstance'),
      rec('b1', 'gcp.storage.bucket'),
      rec('b2', 'gcp.storage.bucket'),
    ];
    const c = ctx(records, { pool_size: 4 });
    // sql cap = 1, so sql2/sql3 wouldn't fit; but b1/b2 are uncapped.
    expect(collect_ready(c)).toEqual([
      'gcp.sql.databaseInstance:sql1',
      'gcp.storage.bucket:b1',
      'gcp.storage.bucket:b2',
    ]);
  });

  it('combines handler_in_flight with within-loop reservations', () => {
    const records = ['s1', 's2'].map((n) => rec(n, 'gcp.sql.databaseInstance'));
    const c = ctx(records, { handler_in_flight: new Map([['gcp.sql.', 1]]) });
    // sql cap = 1 and 1 already in flight → none ready.
    expect(collect_ready(c)).toEqual([]);
  });

  it('uses pool_size as the cap when a prefix has no explicit cap', () => {
    const records = ['x1', 'x2', 'x3'].map((n) => rec(n, 'aws.foo'));
    const c = ctx(records, {
      pool_size: 4,
      per_handler_caps: { 'aws.': 2 },
      handler_cap_prefixes: ['aws.'],
    });
    // aws.* capped at 2.
    expect(collect_ready(c)).toEqual(['aws.foo:x1', 'aws.foo:x2']);
  });

  it('preserves Map insertion order in the output', () => {
    const records = ['z', 'a', 'm'].map((n) => rec(n, 'gcp.storage.bucket'));
    const c = ctx(records);
    expect(collect_ready(c)).toEqual(['gcp.storage.bucket:z', 'gcp.storage.bucket:a', 'gcp.storage.bucket:m']);
  });
});

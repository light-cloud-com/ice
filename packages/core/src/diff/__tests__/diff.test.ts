/**
 * Tests for the ICE diff engine.
 *
 * Compares desired-state graph vs current-state graph and emits a plan of
 * resource changes. The functions under test are pure — no IO, no providers —
 * so the tests build lightweight in-memory `Graph` fixtures and assert on the
 * shape of the returned `DiffResult`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { diff_graphs, format_plan } from '../diff';
import type { DiffResult, ResourceChange } from '../types';
import { create_node_id, create_graph_id } from '../../types/graph';
import type { Edge, EdgeId, Graph, GraphMetadata, Node, NodeId } from '../../types/graph';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface NodeFixture {
  id?: string;
  type: string;
  name: string;
  properties?: Record<string, unknown>;
}

function make_node({ id, type, name, properties }: NodeFixture): Node {
  const now = '2024-01-01T00:00:00.000Z';
  return {
    id: create_node_id(id ?? `${type}_${name}`),
    type,
    name,
    properties: properties ?? {},
    metadata: {
      created_at: now,
      updated_at: now,
      labels: {},
      annotations: {},
    },
  };
}

function make_graph(nodes: Node[], opts: { name?: string } = {}): Graph {
  const now = '2024-01-01T00:00:00.000Z';
  const node_map = new Map<NodeId, Node>();
  for (const n of nodes) node_map.set(n.id, n);

  const metadata: GraphMetadata = {
    created_at: now,
    updated_at: now,
    labels: {},
    annotations: {},
  };

  return {
    id: create_graph_id(opts.name ?? 'g'),
    name: opts.name ?? 'g',
    version: '1.0.0',
    nodes: node_map,
    edges: new Map<EdgeId, Edge>(),
    metadata,
  };
}

function find_change(result: DiffResult, name: string): ResourceChange | undefined {
  return result.changes.find((c) => c.name === name);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// diff_graphs — top-level behavior
// ---------------------------------------------------------------------------

describe('diff_graphs', () => {
  it('returns no changes and a successful summary when both graphs are empty', () => {
    const desired = make_graph([]);
    const current = make_graph([]);

    const result = diff_graphs(desired, current, 'gcp');

    expect(result.success).toBe(true);
    expect(result.changes).toEqual([]);
    expect(result.summary).toEqual({
      total_changes: 0,
      creates: 0,
      updates: 0,
      deletes: 0,
      no_changes: 0,
    });
    expect(result.provider).toBe('gcp');
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(typeof result.generated_at).toBe('string');
  });

  it('marks resources present in desired but missing from current as create', () => {
    const desired = make_graph([
      make_node({ type: 'S3.Bucket', name: 'logs', properties: { region: 'us-east-1' } }),
    ]);
    const current = make_graph([]);

    const result = diff_graphs(desired, current, 'aws');

    expect(result.summary.creates).toBe(1);
    expect(result.summary.deletes).toBe(0);
    const change = find_change(result, 'logs');
    expect(change?.change_type).toBe('create');
    expect(change?.current_properties).toBeNull();
    expect(change?.desired_properties).toEqual({ region: 'us-east-1' });
    expect(change?.property_changes).toEqual([]);
    expect(change?.provider).toBe('aws');
  });

  it('marks resources present in current but missing from desired as delete and surfaces provider id', () => {
    const desired = make_graph([]);
    const current = make_graph([
      make_node({
        type: 'Ec2.Vpc',
        name: 'main',
        properties: { _aws_arn: 'arn:aws:ec2:vpc/abc', cidr: '10.0.0.0/16' },
      }),
    ]);

    const result = diff_graphs(desired, current, 'aws');

    expect(result.summary.deletes).toBe(1);
    expect(result.summary.creates).toBe(0);
    const change = find_change(result, 'main');
    expect(change?.change_type).toBe('delete');
    expect(change?.current_properties).toEqual({ _aws_arn: 'arn:aws:ec2:vpc/abc', cidr: '10.0.0.0/16' });
    expect(change?.desired_properties).toBeNull();
    expect(change?.provider_id).toBe('arn:aws:ec2:vpc/abc');
  });

  it('marks identical resources as no_change with empty property_changes', () => {
    const props = { region: 'us-east-1', acl: 'private' };
    const desired = make_graph([make_node({ type: 'S3.Bucket', name: 'data', properties: { ...props } })]);
    const current = make_graph([make_node({ type: 'S3.Bucket', name: 'data', properties: { ...props } })]);

    const result = diff_graphs(desired, current, 'aws');

    expect(result.summary.no_changes).toBe(1);
    expect(result.summary.total_changes).toBe(0);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].change_type).toBe('no_change');
    expect(result.changes[0].property_changes).toEqual([]);
  });

  it('marks resources with field-level differences as update with property_changes populated', () => {
    const desired = make_graph([
      make_node({ type: 'Ec2.Instance', name: 'web', properties: { instance_type: 't3.large' } }),
    ]);
    const current = make_graph([
      make_node({
        type: 'Ec2.Instance',
        name: 'web',
        properties: { instance_type: 't3.medium', _aws_arn: 'arn:aws:ec2:i/web' },
      }),
    ]);

    const result = diff_graphs(desired, current, 'aws');

    expect(result.summary.updates).toBe(1);
    const change = find_change(result, 'web')!;
    expect(change.change_type).toBe('update');
    expect(change.provider_id).toBe('arn:aws:ec2:i/web');
    const type_change = change.property_changes.find((p) => p.path === 'instance_type');
    expect(type_change).toEqual({ path: 'instance_type', old_value: 't3.medium', new_value: 't3.large' });
  });

  it('skips no_change records when changes_only is enabled', () => {
    const props = { region: 'us-east-1' };
    const desired = make_graph([
      make_node({ type: 'S3.Bucket', name: 'a', properties: { ...props } }),
      make_node({ type: 'S3.Bucket', name: 'b', properties: { region: 'us-west-2' } }),
    ]);
    const current = make_graph([
      make_node({ type: 'S3.Bucket', name: 'a', properties: { ...props } }),
      make_node({ type: 'S3.Bucket', name: 'b', properties: { ...props } }),
    ]);

    const result = diff_graphs(desired, current, 'aws', { changes_only: true });

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].name).toBe('b');
    expect(result.changes[0].change_type).toBe('update');
  });

  it('keeps no_change records when changes_only is disabled (default)', () => {
    const desired = make_graph([
      make_node({ type: 'S3.Bucket', name: 'a', properties: { region: 'us-east-1' } }),
    ]);
    const current = make_graph([
      make_node({ type: 'S3.Bucket', name: 'a', properties: { region: 'us-east-1' } }),
    ]);

    const result = diff_graphs(desired, current, 'aws');

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].change_type).toBe('no_change');
    expect(result.summary.no_changes).toBe(1);
  });

  it('orders changes deletes-first, then updates, then creates', () => {
    const desired = make_graph([
      make_node({ type: 'A', name: 'create_me', properties: { v: 1 } }),
      make_node({ type: 'A', name: 'update_me', properties: { v: 2 } }),
    ]);
    const current = make_graph([
      make_node({ type: 'A', name: 'update_me', properties: { v: 1 } }),
      make_node({ type: 'A', name: 'delete_me', properties: { v: 9 } }),
    ]);

    const result = diff_graphs(desired, current, 'gcp');

    expect(result.changes.map((c) => c.change_type)).toEqual(['delete', 'update', 'create']);
  });

  it('places no_change after create in the sort order', () => {
    const desired = make_graph([
      make_node({ type: 'A', name: 'unchanged', properties: { v: 1 } }),
      make_node({ type: 'A', name: 'create_me', properties: { v: 1 } }),
    ]);
    const current = make_graph([make_node({ type: 'A', name: 'unchanged', properties: { v: 1 } })]);

    const result = diff_graphs(desired, current, 'gcp');

    expect(result.changes.map((c) => c.change_type)).toEqual(['create', 'no_change']);
  });

  it('treats type+name as the resource key — same name across types are independent resources', () => {
    const desired = make_graph([
      make_node({ type: 'S3.Bucket', name: 'shared', properties: { v: 1 } }),
      make_node({ type: 'Sqs.Queue', name: 'shared', properties: { v: 1 } }),
    ]);
    const current = make_graph([make_node({ type: 'S3.Bucket', name: 'shared', properties: { v: 1 } })]);

    const result = diff_graphs(desired, current, 'aws');

    expect(result.summary.creates).toBe(1);
    expect(result.summary.no_changes).toBe(1);
    const create = result.changes.find((c) => c.change_type === 'create');
    expect(create?.type).toBe('Sqs.Queue');
  });
});

// ---------------------------------------------------------------------------
// diff_graphs — filters (target / exclude)
// ---------------------------------------------------------------------------

describe('diff_graphs filters', () => {
  it('includes only resources matching the target name when target is set', () => {
    const desired = make_graph([
      make_node({ type: 'S3.Bucket', name: 'keep', properties: {} }),
      make_node({ type: 'S3.Bucket', name: 'skip', properties: {} }),
    ]);
    const current = make_graph([]);

    const result = diff_graphs(desired, current, 'aws', { target: ['keep'] });

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].name).toBe('keep');
  });

  it('includes resources whose type matches a target pattern', () => {
    const desired = make_graph([
      make_node({ type: 'S3.Bucket', name: 'a', properties: {} }),
      make_node({ type: 'Ec2.Vpc', name: 'b', properties: {} }),
    ]);
    const current = make_graph([]);

    const result = diff_graphs(desired, current, 'aws', { target: ['S3.*'] });

    expect(result.changes.map((c) => c.name)).toEqual(['a']);
  });

  it('excludes both desired and current resources matching an exclude pattern', () => {
    const desired = make_graph([
      make_node({ type: 'S3.Bucket', name: 'public', properties: {} }),
      make_node({ type: 'S3.Bucket', name: 'private', properties: {} }),
    ]);
    const current = make_graph([
      make_node({ type: 'S3.Bucket', name: 'orphan-public', properties: {} }),
      make_node({ type: 'S3.Bucket', name: 'orphan-private', properties: {} }),
    ]);

    const result = diff_graphs(desired, current, 'aws', { exclude: ['*public*'] });

    const names = result.changes.map((c) => c.name);
    expect(names).toContain('private');
    expect(names).toContain('orphan-private');
    expect(names).not.toContain('public');
    expect(names).not.toContain('orphan-public');
  });

  it('excludes resources even when target also matches them', () => {
    const desired = make_graph([
      make_node({ type: 'S3.Bucket', name: 'keep', properties: {} }),
      make_node({ type: 'S3.Bucket', name: 'keep-but-excluded', properties: {} }),
    ]);
    const current = make_graph([]);

    const result = diff_graphs(desired, current, 'aws', {
      target: ['keep*'],
      exclude: ['*excluded*'],
    });

    expect(result.changes.map((c) => c.name)).toEqual(['keep']);
  });

  it('drops resources that match neither the target name nor type', () => {
    const desired = make_graph([make_node({ type: 'S3.Bucket', name: 'a', properties: {} })]);
    const current = make_graph([make_node({ type: 'Ec2.Vpc', name: 'b', properties: {} })]);

    const result = diff_graphs(desired, current, 'aws', { target: ['nonexistent'] });

    expect(result.changes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// diff_graphs — property comparison branches
// ---------------------------------------------------------------------------

describe('diff_graphs property comparison', () => {
  it('skips internal properties prefixed with underscore', () => {
    const desired = make_graph([
      make_node({ type: 'A', name: 'x', properties: { region: 'us', _internal: 'do-not-diff' } }),
    ]);
    const current = make_graph([
      make_node({
        type: 'A',
        name: 'x',
        properties: { region: 'us', _internal: 'something-else', _aws_arn: 'arn' },
      }),
    ]);

    const result = diff_graphs(desired, current, 'aws');

    const change = find_change(result, 'x')!;
    expect(change.change_type).toBe('no_change');
    expect(change.property_changes).toEqual([]);
  });

  it('flattens nested object diffs into dotted paths in detailed mode', () => {
    const desired = make_graph([
      make_node({
        type: 'A',
        name: 'x',
        properties: { tags: { env: 'prod', team: 'core' } },
      }),
    ]);
    const current = make_graph([
      make_node({
        type: 'A',
        name: 'x',
        properties: { tags: { env: 'staging', team: 'core' } },
      }),
    ]);

    const result = diff_graphs(desired, current, 'aws');

    const change = find_change(result, 'x')!;
    expect(change.property_changes).toEqual([
      { path: 'tags.env', old_value: 'staging', new_value: 'prod' },
    ]);
  });

  it('reports the whole nested object as a single change when detailed is false', () => {
    const desired = make_graph([
      make_node({ type: 'A', name: 'x', properties: { tags: { env: 'prod' } } }),
    ]);
    const current = make_graph([
      make_node({ type: 'A', name: 'x', properties: { tags: { env: 'staging' } } }),
    ]);

    const result = diff_graphs(desired, current, 'aws', { detailed: false });

    const change = find_change(result, 'x')!;
    expect(change.property_changes).toEqual([
      { path: 'tags', old_value: { env: 'staging' }, new_value: { env: 'prod' } },
    ]);
  });

  it('falls back to a single property change when detailed mode meets a non-object diff', () => {
    const desired = make_graph([make_node({ type: 'A', name: 'x', properties: { count: 3 } })]);
    const current = make_graph([make_node({ type: 'A', name: 'x', properties: { count: 1 } })]);

    const result = diff_graphs(desired, current, 'aws');

    const change = find_change(result, 'x')!;
    expect(change.property_changes).toEqual([{ path: 'count', old_value: 1, new_value: 3 }]);
  });

  it('recurses through deeply-nested objects to surface leaf-level dotted paths', () => {
    const desired = make_graph([
      make_node({
        type: 'A',
        name: 'x',
        properties: { spec: { network: { tier: 'PREMIUM' } } },
      }),
    ]);
    const current = make_graph([
      make_node({
        type: 'A',
        name: 'x',
        properties: { spec: { network: { tier: 'STANDARD' } } },
      }),
    ]);

    const result = diff_graphs(desired, current, 'aws');
    const change = find_change(result, 'x')!;
    expect(change.property_changes).toEqual([
      { path: 'spec.network.tier', old_value: 'STANDARD', new_value: 'PREMIUM' },
    ]);
  });

  it('skips `_`-prefixed keys at every nesting level (findings #48)', () => {
    // Top-level `_internal` is already filtered. The fix extends the
    // skip to nested levels — `spec._internal.foo` would otherwise
    // surface as a drift record even though `_`-prefixed keys are
    // documented as opaque provider metadata.
    const desired = make_graph([
      make_node({
        type: 'A',
        name: 'x',
        properties: {
          spec: { tier: 'PREMIUM', _internal: { hidden: 'desired' } },
          _provider_id: 'p-1',
        },
      }),
    ]);
    const current = make_graph([
      make_node({
        type: 'A',
        name: 'x',
        properties: {
          spec: { tier: 'PREMIUM', _internal: { hidden: 'current' } },
          _provider_id: 'p-2',
        },
      }),
    ]);

    const result = diff_graphs(desired, current, 'aws');
    expect(find_change(result, 'x')!.change_type).toBe('no_change');
  });

  it('treats arrays of primitives as a single field — element-by-element compared', () => {
    const desired = make_graph([
      make_node({ type: 'A', name: 'x', properties: { tags: ['a', 'b', 'c'] } }),
    ]);
    const current = make_graph([
      make_node({ type: 'A', name: 'x', properties: { tags: ['a', 'b'] } }),
    ]);

    const result = diff_graphs(desired, current, 'aws');
    const change = find_change(result, 'x')!;
    expect(change.property_changes).toEqual([
      { path: 'tags', old_value: ['a', 'b'], new_value: ['a', 'b', 'c'] },
    ]);
  });

  it('treats equal arrays as no change', () => {
    const desired = make_graph([
      make_node({ type: 'A', name: 'x', properties: { tags: ['a', 'b'] } }),
    ]);
    const current = make_graph([
      make_node({ type: 'A', name: 'x', properties: { tags: ['a', 'b'] } }),
    ]);
    const result = diff_graphs(desired, current, 'aws');
    expect(find_change(result, 'x')!.change_type).toBe('no_change');
  });

  it('treats arrays of objects as opaque values even when a single nested field differs', () => {
    const desired = make_graph([
      make_node({
        type: 'A',
        name: 'x',
        properties: { rules: [{ id: 1, action: 'allow' }] },
      }),
    ]);
    const current = make_graph([
      make_node({
        type: 'A',
        name: 'x',
        properties: { rules: [{ id: 1, action: 'deny' }] },
      }),
    ]);

    const result = diff_graphs(desired, current, 'aws');
    const change = find_change(result, 'x')!;
    expect(change.property_changes).toHaveLength(1);
    expect(change.property_changes[0].path).toBe('rules');
  });

  it('detects fields added on desired and reports old_value as undefined', () => {
    const desired = make_graph([
      make_node({ type: 'A', name: 'x', properties: { region: 'us', extra: 'new' } }),
    ]);
    const current = make_graph([make_node({ type: 'A', name: 'x', properties: { region: 'us' } })]);

    const result = diff_graphs(desired, current, 'aws');
    const change = find_change(result, 'x')!;
    expect(change.property_changes).toEqual([
      { path: 'extra', old_value: undefined, new_value: 'new' },
    ]);
  });

  it('detects fields removed from desired and reports new_value as undefined', () => {
    const desired = make_graph([make_node({ type: 'A', name: 'x', properties: { region: 'us' } })]);
    const current = make_graph([
      make_node({ type: 'A', name: 'x', properties: { region: 'us', stale: 'value' } }),
    ]);

    const result = diff_graphs(desired, current, 'aws');
    const change = find_change(result, 'x')!;
    expect(change.property_changes).toEqual([
      { path: 'stale', old_value: 'value', new_value: undefined },
    ]);
  });

  it('treats mismatched scalar types as a real change (string vs number)', () => {
    const desired = make_graph([make_node({ type: 'A', name: 'x', properties: { v: 1 } })]);
    const current = make_graph([make_node({ type: 'A', name: 'x', properties: { v: '1' } })]);

    const result = diff_graphs(desired, current, 'aws');
    expect(find_change(result, 'x')!.change_type).toBe('update');
  });

  it('treats null and an empty object as equivalent (findings #47)', () => {
    // Cloud provider responses commonly omit empty fields entirely
    // (returning null) while the desired-state generator produces {}.
    // The literal-different-but-semantically-equal pair was the most
    // common false-positive vector in drift reports.
    const desired = make_graph([make_node({ type: 'A', name: 'x', properties: { v: {} } })]);
    const current = make_graph([make_node({ type: 'A', name: 'x', properties: { v: null } })]);

    const result = diff_graphs(desired, current, 'aws');
    expect(find_change(result, 'x')!.change_type).toBe('no_change');
  });

  it('treats null and an empty array as equivalent (findings #47)', () => {
    const desired = make_graph([make_node({ type: 'A', name: 'x', properties: { v: [] } })]);
    const current = make_graph([make_node({ type: 'A', name: 'x', properties: { v: null } })]);

    const result = diff_graphs(desired, current, 'aws');
    expect(find_change(result, 'x')!.change_type).toBe('no_change');
  });

  it('still treats null and a non-empty array as different (findings #47)', () => {
    const desired = make_graph([make_node({ type: 'A', name: 'x', properties: { v: ['a'] } })]);
    const current = make_graph([make_node({ type: 'A', name: 'x', properties: { v: null } })]);

    const result = diff_graphs(desired, current, 'aws');
    expect(find_change(result, 'x')!.change_type).toBe('update');
  });

  it('treats undefined and an empty object as equivalent (findings #47)', () => {
    const desired = make_graph([make_node({ type: 'A', name: 'x', properties: { v: {} } })]);
    const current = make_graph([make_node({ type: 'A', name: 'x', properties: {} })]);

    const result = diff_graphs(desired, current, 'aws');
    expect(find_change(result, 'x')!.change_type).toBe('no_change');
  });

  it('treats two equal nulls as no change', () => {
    const desired = make_graph([make_node({ type: 'A', name: 'x', properties: { v: null } })]);
    const current = make_graph([make_node({ type: 'A', name: 'x', properties: { v: null } })]);

    const result = diff_graphs(desired, current, 'aws');
    expect(find_change(result, 'x')!.change_type).toBe('no_change');
  });

  it('treats objects with a different number of keys as different even if shared keys match', () => {
    const desired = make_graph([
      make_node({ type: 'A', name: 'x', properties: { spec: { a: 1, b: 2 } } }),
    ]);
    const current = make_graph([
      make_node({ type: 'A', name: 'x', properties: { spec: { a: 1 } } }),
    ]);

    const result = diff_graphs(desired, current, 'aws');
    const change = find_change(result, 'x')!;
    expect(change.change_type).toBe('update');
    // detailed mode flattens to leaf path
    expect(change.property_changes).toEqual([{ path: 'spec.b', old_value: undefined, new_value: 2 }]);
  });
});

// ---------------------------------------------------------------------------
// diff_graphs — provider id resolution
// ---------------------------------------------------------------------------

describe('diff_graphs provider_id', () => {
  it('uses _gcp_self_link first for gcp resources', () => {
    const desired = make_graph([]);
    const current = make_graph([
      make_node({
        type: 'A',
        name: 'x',
        properties: { _gcp_self_link: 'self-link-1', _gcp_id: 'fallback-id' },
      }),
    ]);

    const result = diff_graphs(desired, current, 'gcp');
    expect(find_change(result, 'x')!.provider_id).toBe('self-link-1');
  });

  it('falls back to _gcp_id for gcp when self_link is missing', () => {
    const desired = make_graph([]);
    const current = make_graph([
      make_node({ type: 'A', name: 'x', properties: { _gcp_id: 'fallback-id' } }),
    ]);

    const result = diff_graphs(desired, current, 'gcp');
    expect(find_change(result, 'x')!.provider_id).toBe('fallback-id');
  });

  it('uses _azure_id for azure', () => {
    const desired = make_graph([]);
    const current = make_graph([
      make_node({ type: 'A', name: 'x', properties: { _azure_id: '/subscriptions/x/...' } }),
    ]);

    const result = diff_graphs(desired, current, 'azure');
    expect(find_change(result, 'x')!.provider_id).toBe('/subscriptions/x/...');
  });

  it('returns undefined provider_id for unknown providers', () => {
    const desired = make_graph([]);
    const current = make_graph([
      make_node({ type: 'A', name: 'x', properties: { some_key: 'value' } }),
    ]);

    const result = diff_graphs(desired, current, 'kubernetes');
    expect(find_change(result, 'x')!.provider_id).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// format_plan
// ---------------------------------------------------------------------------

describe('format_plan', () => {
  it('returns an "up to date" message when there are no changes', () => {
    const desired = make_graph([]);
    const current = make_graph([]);
    const result = diff_graphs(desired, current, 'gcp');

    const text = format_plan(result);

    expect(text).toContain('No changes detected. Infrastructure is up to date.');
    expect(text).toContain('Provider: gcp');
  });

  it('groups creates / updates / deletes under separate headers with totals in the summary line', () => {
    const desired = make_graph([
      make_node({ type: 'S3.Bucket', name: 'new-bucket', properties: {} }),
      make_node({ type: 'Ec2.Vpc', name: 'main', properties: { cidr: '10.0.0.0/16' } }),
    ]);
    const current = make_graph([
      make_node({ type: 'Ec2.Vpc', name: 'main', properties: { cidr: '10.0.0.0/8' } }),
      make_node({ type: 'Sqs.Queue', name: 'old-queue', properties: {} }),
    ]);

    const result = diff_graphs(desired, current, 'aws');
    const text = format_plan(result);

    expect(text).toContain('Resources to create (1)');
    expect(text).toContain('+ S3.Bucket "new-bucket"');
    expect(text).toContain('Resources to update (1)');
    expect(text).toContain('~ Ec2.Vpc "main"');
    expect(text).toContain('cidr: "10.0.0.0/8" → "10.0.0.0/16"');
    expect(text).toContain('Resources to delete (1)');
    expect(text).toContain('- Sqs.Queue "old-queue"');
    expect(text).toContain('Plan: 1 to create, 1 to update, 1 to delete');
  });

  it('truncates long property change lists with a "and N more changes" tail when over 5', () => {
    const desired_props: Record<string, unknown> = {};
    const current_props: Record<string, unknown> = {};
    for (let i = 0; i < 7; i++) {
      desired_props[`field_${i}`] = `desired_${i}`;
      current_props[`field_${i}`] = `current_${i}`;
    }
    const desired = make_graph([make_node({ type: 'A', name: 'x', properties: desired_props })]);
    const current = make_graph([make_node({ type: 'A', name: 'x', properties: current_props })]);

    const text = format_plan(diff_graphs(desired, current, 'aws'));
    expect(text).toContain('... and 2 more changes');
  });

  it('does not show the "more changes" tail when there are exactly 5 property changes', () => {
    const desired_props: Record<string, unknown> = {};
    const current_props: Record<string, unknown> = {};
    for (let i = 0; i < 5; i++) {
      desired_props[`f${i}`] = `d${i}`;
      current_props[`f${i}`] = `c${i}`;
    }
    const desired = make_graph([make_node({ type: 'A', name: 'x', properties: desired_props })]);
    const current = make_graph([make_node({ type: 'A', name: 'x', properties: current_props })]);

    const text = format_plan(diff_graphs(desired, current, 'aws'));
    expect(text).not.toContain('... and');
  });

  it('omits the create / update / delete header for a section that is empty', () => {
    const desired = make_graph([make_node({ type: 'S3.Bucket', name: 'only-create', properties: {} })]);
    const current = make_graph([]);

    const text = format_plan(diff_graphs(desired, current, 'aws'));
    expect(text).toContain('Resources to create (1)');
    expect(text).not.toContain('Resources to update');
    expect(text).not.toContain('Resources to delete');
  });

  it('formats scalar property values distinctly (null, undefined, string, number, boolean)', () => {
    const desired = make_graph([
      make_node({
        type: 'A',
        name: 'x',
        properties: {
          a_null: null,
          a_undef: undefined,
          a_str: 'hello',
          a_num: 42,
          a_bool: true,
        },
      }),
    ]);
    const current = make_graph([
      make_node({
        type: 'A',
        name: 'x',
        properties: {
          a_null: 'was-string',
          a_undef: 'was-string',
          a_str: 'world',
          a_num: 99,
          a_bool: false,
        },
      }),
    ]);

    const text = format_plan(diff_graphs(desired, current, 'aws'));

    expect(text).toContain('a_null: "was-string" → null');
    expect(text).toContain('a_undef: "was-string" → undefined');
    expect(text).toContain('a_str: "world" → "hello"');
    expect(text).toContain('a_num: 99 → 42');
    expect(text).toContain('a_bool: false → true');
  });

  it('serializes object property values as JSON when detailed mode is off', () => {
    const desired = make_graph([
      make_node({ type: 'A', name: 'x', properties: { tags: { env: 'prod' } } }),
    ]);
    const current = make_graph([
      make_node({ type: 'A', name: 'x', properties: { tags: { env: 'staging' } } }),
    ]);

    const text = format_plan(diff_graphs(desired, current, 'aws', { detailed: false }));

    expect(text).toContain('tags: {"env":"staging"} → {"env":"prod"}');
  });
});

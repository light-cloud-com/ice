/**
 * Tests for `cards/migration.ts` — the persisted-node migration pipeline.
 * Covers both the single-node entry point (`migrateCardNode`, called from
 * `expandBlueprintToCard`) and the array entry point (`migrateCardNodes`,
 * called from the localStorage loader and 3 other ingestion sites).
 *
 * @see rf-cards-2
 */

import { describe, it, expect } from 'vitest';
import { migrateCardNode, migrateCardNodes } from '../migration';
import type { CardNode } from '../types';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function makeNode(overrides: Partial<CardNode> = {}): CardNode {
  return {
    id: 'n1',
    type: 'block',
    position: { x: 10, y: 20 },
    width: 200,
    height: 100,
    data: {},
    ...overrides,
  };
}

const BLOCK_TO_GROUP_SUFFIXES = ['Frontend', 'Services', 'Data', 'Messaging', 'Monitoring', 'External'] as const;

// -----------------------------------------------------------------------------
// migrateCardNode
// -----------------------------------------------------------------------------

describe('migrateCardNode — Monitoring.Terminal → Monitoring.Log', () => {
  it('rewrites the iceType to Monitoring.Log', () => {
    const node = makeNode({ data: { iceType: 'Monitoring.Terminal' } });
    const result = migrateCardNode(node);
    expect(result.data.iceType).toBe('Monitoring.Log');
  });

  it('returns a new reference (does not mutate the input)', () => {
    const node = makeNode({ data: { iceType: 'Monitoring.Terminal' } });
    const result = migrateCardNode(node);
    expect(result).not.toBe(node);
    expect(result.data).not.toBe(node.data);
    // Input is untouched.
    expect(node.data.iceType).toBe('Monitoring.Terminal');
  });

  it('preserves all other top-level fields', () => {
    const node = makeNode({
      id: 'preserve-me',
      type: 'block',
      position: { x: 42, y: 99 },
      width: 333,
      height: 222,
      parentId: 'parent-1',
      data: { iceType: 'Monitoring.Terminal' },
    });
    const result = migrateCardNode(node);
    expect(result.id).toBe('preserve-me');
    expect(result.type).toBe('block');
    expect(result.position).toEqual({ x: 42, y: 99 });
    expect(result.width).toBe(333);
    expect(result.height).toBe(222);
    expect(result.parentId).toBe('parent-1');
  });

  it('preserves sibling fields on data alongside the rewritten iceType', () => {
    const node = makeNode({
      data: { iceType: 'Monitoring.Terminal', name: 'Logs', region: 'us-east-1' },
    });
    const result = migrateCardNode(node);
    expect(result.data).toEqual({
      iceType: 'Monitoring.Log',
      name: 'Logs',
      region: 'us-east-1',
    });
  });

  it('does NOT promote type to container (Monitoring.Terminal is a leaf node)', () => {
    const node = makeNode({ type: 'block', data: { iceType: 'Monitoring.Terminal' } });
    const result = migrateCardNode(node);
    expect(result.type).toBe('block');
  });
});

describe('migrateCardNode — Cluster.* / Block.* → Group.*', () => {
  it.each(BLOCK_TO_GROUP_SUFFIXES)('Cluster.%s → Group.%s with type=container', (suffix) => {
    const node = makeNode({ type: 'block', data: { iceType: `Cluster.${suffix}` } });
    const result = migrateCardNode(node);
    expect(result.data.iceType).toBe(`Group.${suffix}`);
    expect(result.type).toBe('container');
  });

  it.each(BLOCK_TO_GROUP_SUFFIXES)('Block.%s → Group.%s with type=container', (suffix) => {
    const node = makeNode({ type: 'block', data: { iceType: `Block.${suffix}` } });
    const result = migrateCardNode(node);
    expect(result.data.iceType).toBe(`Group.${suffix}`);
    expect(result.type).toBe('container');
  });

  it('returns a new reference and does not mutate the input', () => {
    const node = makeNode({ data: { iceType: 'Cluster.Frontend' } });
    const result = migrateCardNode(node);
    expect(result).not.toBe(node);
    expect(result.data).not.toBe(node.data);
    expect(node.data.iceType).toBe('Cluster.Frontend');
    expect(node.type).toBe('block');
  });

  it('preserves all other top-level fields and sibling data', () => {
    const node = makeNode({
      id: 'preserve-me',
      type: 'block',
      position: { x: 42, y: 99 },
      width: 333,
      height: 222,
      parentId: 'parent-1',
      data: { iceType: 'Block.Services', label: 'API tier', meta: { cost: 10 } },
    });
    const result = migrateCardNode(node);
    expect(result.id).toBe('preserve-me');
    expect(result.type).toBe('container');
    expect(result.position).toEqual({ x: 42, y: 99 });
    expect(result.width).toBe(333);
    expect(result.height).toBe(222);
    expect(result.parentId).toBe('parent-1');
    expect(result.data).toEqual({
      iceType: 'Group.Services',
      label: 'API tier',
      meta: { cost: 10 },
    });
  });

  it('Cluster.<unknown-suffix> → returns the same reference (no migration)', () => {
    const node = makeNode({ data: { iceType: 'Cluster.Foo' } });
    const result = migrateCardNode(node);
    expect(result).toBe(node);
  });

  it('Block.<unknown-suffix> → returns the same reference (no migration)', () => {
    const node = makeNode({ data: { iceType: 'Block.Bar' } });
    const result = migrateCardNode(node);
    expect(result).toBe(node);
  });
});

describe('migrateCardNode — branch order (Monitoring.Terminal first)', () => {
  it('exact match Monitoring.Terminal does not start with Cluster./Block. — Terminal branch wins by exclusivity', () => {
    // The two condition sets don't overlap (`Monitoring.Terminal` does not
    // begin with `Cluster.` or `Block.`), so order is not strictly
    // required — but pin the contract anyway: Terminal wins.
    const node = makeNode({ data: { iceType: 'Monitoring.Terminal' } });
    const result = migrateCardNode(node);
    expect(result.data.iceType).toBe('Monitoring.Log');
    expect(result.type).toBe('block'); // not promoted to container
  });

  it('Cluster.Monitoring is NOT rewritten to Monitoring.Log — only the suffix branch fires', () => {
    // Pins the inverse: a Cluster.* prefix carrying the Monitoring suffix
    // takes the Group.* path, not the Terminal → Log path.
    const node = makeNode({ data: { iceType: 'Cluster.Monitoring' } });
    const result = migrateCardNode(node);
    expect(result.data.iceType).toBe('Group.Monitoring');
    expect(result.type).toBe('container');
  });
});

describe('migrateCardNode — already-migrated / no-op cases (idempotency)', () => {
  it('Monitoring.Log → returns the same reference', () => {
    const node = makeNode({ data: { iceType: 'Monitoring.Log' } });
    const result = migrateCardNode(node);
    expect(result).toBe(node);
  });

  it('Group.Frontend → returns the same reference', () => {
    const node = makeNode({ type: 'container', data: { iceType: 'Group.Frontend' } });
    const result = migrateCardNode(node);
    expect(result).toBe(node);
  });

  it('non-legacy iceType (e.g. Compute.Function) → returns the same reference', () => {
    const node = makeNode({ data: { iceType: 'Compute.Function' } });
    const result = migrateCardNode(node);
    expect(result).toBe(node);
  });

  it('empty data.iceType → returns the same reference', () => {
    const node = makeNode({ data: { iceType: '' } });
    const result = migrateCardNode(node);
    expect(result).toBe(node);
  });

  it('absent data.iceType (no key) → returns the same reference', () => {
    const node = makeNode({ data: { somethingElse: 1 } });
    const result = migrateCardNode(node);
    expect(result).toBe(node);
  });

  it('non-string data.iceType (the `as string` cast falls back to "") → returns the same reference', () => {
    // The runtime `(node.data?.iceType as string) || ''` fallback only
    // matters if a corrupt payload sneaks in a non-string. The `||`
    // turns 0 / undefined / null into ''. Pin null explicitly.
    const node = makeNode({ data: { iceType: null } });
    const result = migrateCardNode(node);
    expect(result).toBe(node);
  });

  it('idempotent: migrateCardNode(migrateCardNode(node)) ≡ migrateCardNode(node) — Terminal case', () => {
    const node = makeNode({ data: { iceType: 'Monitoring.Terminal' } });
    const once = migrateCardNode(node);
    const twice = migrateCardNode(once);
    expect(twice).toBe(once); // second pass is a no-op (returns same ref)
    expect(twice).toEqual(once);
  });

  it('idempotent: migrateCardNode(migrateCardNode(node)) ≡ migrateCardNode(node) — Cluster case', () => {
    const node = makeNode({ data: { iceType: 'Cluster.Frontend' } });
    const once = migrateCardNode(node);
    const twice = migrateCardNode(once);
    expect(twice).toBe(once);
    expect(twice).toEqual(once);
  });

  it('idempotent: migrateCardNode(migrateCardNode(node)) ≡ migrateCardNode(node) — Block case', () => {
    const node = makeNode({ data: { iceType: 'Block.Services' } });
    const once = migrateCardNode(node);
    const twice = migrateCardNode(once);
    expect(twice).toBe(once);
    expect(twice).toEqual(once);
  });
});

// -----------------------------------------------------------------------------
// migrateCardNodes
// -----------------------------------------------------------------------------

describe('migrateCardNodes', () => {
  it('returns an empty array for an empty input', () => {
    const result = migrateCardNodes([]);
    expect(result).toEqual([]);
  });

  it('migrates each node in a mixed array independently', () => {
    const terminal = makeNode({ id: 't', data: { iceType: 'Monitoring.Terminal' } });
    const cluster = makeNode({ id: 'c', data: { iceType: 'Cluster.Frontend' } });
    const block = makeNode({ id: 'b', data: { iceType: 'Block.Services' } });
    const noop = makeNode({ id: 'noop', data: { iceType: 'Compute.Function' } });

    const result = migrateCardNodes([terminal, cluster, block, noop]);
    expect(result).toHaveLength(4);

    expect(result[0].id).toBe('t');
    expect(result[0].data.iceType).toBe('Monitoring.Log');

    expect(result[1].id).toBe('c');
    expect(result[1].data.iceType).toBe('Group.Frontend');
    expect(result[1].type).toBe('container');

    expect(result[2].id).toBe('b');
    expect(result[2].data.iceType).toBe('Group.Services');
    expect(result[2].type).toBe('container');

    // Untouched: same reference.
    expect(result[3]).toBe(noop);
  });

  it('preserves order', () => {
    const a = makeNode({ id: 'a', data: { iceType: 'Compute.Function' } });
    const b = makeNode({ id: 'b', data: { iceType: 'Monitoring.Terminal' } });
    const c = makeNode({ id: 'c', data: { iceType: 'Block.Data' } });
    const result = migrateCardNodes([a, b, c]);
    expect(result.map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });

  it('returns a new array (does not mutate or reuse the input array reference)', () => {
    const input = [makeNode({ data: { iceType: 'Compute.Function' } })];
    const result = migrateCardNodes(input);
    expect(result).not.toBe(input);
    // The unchanged node is still the same reference, though.
    expect(result[0]).toBe(input[0]);
  });

  it('idempotent on an already-migrated array', () => {
    const nodes = [
      makeNode({ id: 'a', data: { iceType: 'Monitoring.Log' } }),
      makeNode({ id: 'b', type: 'container', data: { iceType: 'Group.Frontend' } }),
      makeNode({ id: 'c', data: { iceType: 'Compute.Function' } }),
    ];
    const once = migrateCardNodes(nodes);
    const twice = migrateCardNodes(once);
    expect(twice).toHaveLength(3);
    // Every node was a no-op, so each result element is the same ref as
    // the corresponding once[] element (and as the original input).
    expect(twice[0]).toBe(once[0]);
    expect(twice[1]).toBe(once[1]);
    expect(twice[2]).toBe(once[2]);
  });

  it('idempotent across two passes when input was unmigrated', () => {
    const input = [
      makeNode({ id: 'a', data: { iceType: 'Monitoring.Terminal' } }),
      makeNode({ id: 'b', data: { iceType: 'Cluster.Services' } }),
    ];
    const once = migrateCardNodes(input);
    const twice = migrateCardNodes(once);
    // After the first pass, every node is in the canonical shape, so
    // the second pass returns those same references.
    expect(twice[0]).toBe(once[0]);
    expect(twice[1]).toBe(once[1]);
    expect(twice[0].data.iceType).toBe('Monitoring.Log');
    expect(twice[1].data.iceType).toBe('Group.Services');
  });
});

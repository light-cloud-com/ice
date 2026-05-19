/**
 * Unit tests for the rf-sched-4 dispatch + resolution helpers.
 *
 * These tests exercise the standalone helpers directly, with hand-
 * rolled `SchedulerContext` fixtures. Behavior under the schedule
 * loop is covered by the integration tests in `../../__tests__/
 * scheduler.test.ts`; these focus on the leaf semantics:
 *  - error_code_for: phase → label.
 *  - emit_status: queued dedup + duration_ms population.
 *  - lookup_node: name match.
 *  - push_cancelled_result: shape + on_resource_result side-effect.
 *  - set_terminal: idempotence (terminal once only).
 *  - cancel_descendants / cancel_remaining_not_in_flight: which nodes
 *    get flipped (and which are left alone).
 *  - wake / wait_for_settle: one-shot promise pair.
 *  - on_settled: success vs failure split + bookkeeping decrement.
 *  - invoke_handler: dry_run short-circuit + create/update/delete
 *    method dispatch.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  cancel_descendants,
  cancel_remaining_not_in_flight,
  dispatch,
  emit_status,
  error_code_for,
  invoke_handler,
  lookup_node,
  on_settled,
  push_cancelled_result,
  set_terminal,
  wait_for_settle,
  wake,
} from '../dispatch';
import type { ResourceChange } from '../../../diff/types';
import type { Graph, Node, NodeId } from '../../../types/graph';
import type {
  DeployOptions,
  NodeStatusEvent,
  ProviderDeployer,
  ResourceDeployResult,
} from '../../types';
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
    desired_properties: { foo: 1 },
  };
}

function rec(name: string, type: string, opts: { dependents?: string[] } = {}): NodeRecord {
  return {
    change: build_change(name, type),
    deps: new Set(),
    dependents: new Set(opts.dependents ?? []),
    queued_emitted: false,
  };
}

function build_graph_for(records: NodeRecord[]): Graph {
  const nodes = new Map<NodeId, Node>();
  const now = new Date().toISOString();
  for (const r of records) {
    nodes.set(r.change.id as NodeId, {
      id: r.change.id as NodeId,
      type: r.change.type,
      name: r.change.name,
      properties: {},
      metadata: { created_at: now, updated_at: now, labels: {}, annotations: {} },
    });
  }
  return {
    id: 'g' as Graph['id'],
    name: 'g',
    version: '1.0',
    nodes,
    edges: new Map(),
    metadata: { created_at: now, updated_at: now, labels: {}, annotations: {} },
  };
}

function ctx(
  records: NodeRecord[],
  overrides: Partial<SchedulerContext> = {},
): SchedulerContext {
  const records_map = new Map<string, NodeRecord>();
  for (const r of records) records_map.set(r.change.id, r);
  const default_per_handler_caps: Record<string, number> = {};
  return {
    changes: records.map((r) => r.change),
    phase: 'create',
    graph: build_graph_for(records),
    deployer: {
      provider: 'gcp',
      initialize: async () => {},
      cleanup: async () => {},
      create: async () => ({ resource_id: '', name: '', type: '', action: 'create', success: true, duration_ms: 0 }),
      update: async () => ({ resource_id: '', name: '', type: '', action: 'update', success: true, duration_ms: 0 }),
      delete: async () => ({ resource_id: '', name: '', type: '', action: 'delete', success: true, duration_ms: 0 }),
    },
    options: { provider: 'gcp' } as DeployOptions,
    pool_size: 4,
    per_handler_caps: default_per_handler_caps,
    handler_cap_prefixes: [],
    records: records_map,
    results: [],
    in_flight: new Set(),
    handler_in_flight: new Map(),
    hard_failed: false,
    aborted: false,
    ...overrides,
  };
}

// ─── error_code_for ──────────────────────────────────────────────────

describe('error_code_for', () => {
  it('maps create → CREATE_FAILED', () => {
    expect(error_code_for('create')).toBe('CREATE_FAILED');
  });
  it('maps update → UPDATE_FAILED', () => {
    expect(error_code_for('update')).toBe('UPDATE_FAILED');
  });
  it('maps delete → DELETE_FAILED', () => {
    expect(error_code_for('delete')).toBe('DELETE_FAILED');
  });
});

// ─── lookup_node ─────────────────────────────────────────────────────

describe('lookup_node', () => {
  it('returns the matching node from the graph', () => {
    const a = rec('a', 'gcp.storage.bucket');
    const b = rec('b', 'gcp.storage.bucket');
    const c = ctx([a, b]);
    const node = lookup_node(c, a.change) as { name: string };
    expect(node.name).toBe('a');
  });

  it('returns undefined when no node matches', () => {
    const a = rec('a', 'gcp.storage.bucket');
    const c = ctx([a]);
    expect(lookup_node(c, build_change('zzz', 'gcp.storage.bucket'))).toBeUndefined();
  });
});

// ─── emit_status ─────────────────────────────────────────────────────

describe('emit_status', () => {
  it('does nothing when no callback is wired', () => {
    const a = rec('a', 'gcp.storage.bucket');
    const c = ctx([a]);
    expect(() => emit_status(c, a, 'queued')).not.toThrow();
  });

  it('dedups queued events per record', () => {
    const events: NodeStatusEvent[] = [];
    const a = rec('a', 'gcp.storage.bucket');
    const c = ctx([a], {
      options: { provider: 'gcp', on_node_status: (e) => events.push(e) } as DeployOptions,
    });
    emit_status(c, a, 'queued');
    emit_status(c, a, 'queued');
    expect(events).toHaveLength(1);
    expect(events[0]!.status).toBe('queued');
  });

  it('attaches duration_ms only to non-applying terminal events when applying_at is set', () => {
    const events: NodeStatusEvent[] = [];
    const a = rec('a', 'gcp.storage.bucket');
    a.applying_at = Date.now() - 50;
    const c = ctx([a], {
      options: { provider: 'gcp', on_node_status: (e) => events.push(e) } as DeployOptions,
    });
    emit_status(c, a, 'succeeded');
    expect(events[0]!.duration_ms).toBeGreaterThanOrEqual(40);
  });

  it('does not attach duration_ms to queued or applying', () => {
    const events: NodeStatusEvent[] = [];
    const a = rec('a', 'gcp.storage.bucket');
    a.applying_at = Date.now() - 50;
    const c = ctx([a], {
      options: { provider: 'gcp', on_node_status: (e) => events.push(e) } as DeployOptions,
    });
    emit_status(c, a, 'applying');
    expect(events[0]!.duration_ms).toBeUndefined();
  });

  it('swallows callback errors', () => {
    const a = rec('a', 'gcp.storage.bucket');
    const c = ctx([a], {
      options: {
        provider: 'gcp',
        on_node_status: () => {
          throw new Error('boom');
        },
      } as DeployOptions,
    });
    expect(() => emit_status(c, a, 'queued')).not.toThrow();
  });
});

// ─── set_terminal ────────────────────────────────────────────────────

describe('set_terminal', () => {
  it('flips terminal once and emits one event', () => {
    const events: NodeStatusEvent[] = [];
    const a = rec('a', 'gcp.storage.bucket');
    const c = ctx([a], {
      options: { provider: 'gcp', on_node_status: (e) => events.push(e) } as DeployOptions,
    });
    set_terminal(c, a, 'succeeded');
    set_terminal(c, a, 'failed'); // ignored
    expect(a.terminal).toBe('succeeded');
    expect(events).toHaveLength(1);
    expect(events[0]!.status).toBe('succeeded');
  });
});

// ─── push_cancelled_result ───────────────────────────────────────────

describe('push_cancelled_result', () => {
  it('pushes a synthesized result and notifies on_resource_result', () => {
    const observed: ResourceDeployResult[] = [];
    const a = rec('a', 'gcp.storage.bucket');
    const c = ctx([a], {
      options: { provider: 'gcp', on_resource_result: (r) => observed.push(r) } as DeployOptions,
    });
    push_cancelled_result(c, a);
    expect(c.results).toHaveLength(1);
    expect(c.results[0]!.success).toBe(false);
    expect(c.results[0]!.error).toMatch(/cancelled/);
    expect(observed).toHaveLength(1);
  });
});

// ─── cancel_descendants ──────────────────────────────────────────────

describe('cancel_descendants', () => {
  it('cancels transitive dependents that are not terminal and not in_flight', () => {
    const a = rec('a', 'gcp.storage.bucket', { dependents: ['gcp.storage.bucket:b'] });
    const b = rec('b', 'gcp.storage.bucket', { dependents: ['gcp.storage.bucket:c'] });
    const c_node = rec('c', 'gcp.storage.bucket');
    const c = ctx([a, b, c_node]);
    cancel_descendants(c, a);
    expect(b.terminal).toBe('cancelled-due-to-dep');
    expect(c_node.terminal).toBe('cancelled-due-to-dep');
    expect(c.results).toHaveLength(2);
  });

  it('leaves in_flight descendants untouched', () => {
    const a = rec('a', 'gcp.storage.bucket', { dependents: ['gcp.storage.bucket:b'] });
    const b = rec('b', 'gcp.storage.bucket');
    const c = ctx([a, b], { in_flight: new Set(['gcp.storage.bucket:b']) });
    cancel_descendants(c, a);
    expect(b.terminal).toBeUndefined();
    expect(c.results).toHaveLength(0);
  });

  it('does not re-cancel already-terminal descendants', () => {
    const a = rec('a', 'gcp.storage.bucket', { dependents: ['gcp.storage.bucket:b'] });
    const b = rec('b', 'gcp.storage.bucket');
    b.terminal = 'succeeded';
    const c = ctx([a, b]);
    cancel_descendants(c, a);
    expect(b.terminal).toBe('succeeded');
    expect(c.results).toHaveLength(0);
  });
});

// ─── cancel_remaining_not_in_flight ──────────────────────────────────

describe('cancel_remaining_not_in_flight', () => {
  it('flips every non-terminal, non-in_flight node', () => {
    const a = rec('a', 'gcp.storage.bucket');
    const b = rec('b', 'gcp.storage.bucket');
    const c_node = rec('c', 'gcp.storage.bucket');
    c_node.terminal = 'succeeded';
    const c = ctx([a, b, c_node], { in_flight: new Set(['gcp.storage.bucket:b']) });
    cancel_remaining_not_in_flight(c);
    expect(a.terminal).toBe('cancelled-due-to-dep');
    expect(b.terminal).toBeUndefined();
    expect(c_node.terminal).toBe('succeeded');
    expect(c.results).toHaveLength(1);
  });
});

// ─── wait_for_settle / wake ──────────────────────────────────────────

describe('wait_for_settle / wake', () => {
  it('returns a single shared promise until wake is called', async () => {
    const c = ctx([rec('a', 'gcp.storage.bucket')]);
    const p1 = wait_for_settle(c);
    const p2 = wait_for_settle(c);
    expect(p1).toBe(p2);
    let resolved = false;
    p1.then(() => {
      resolved = true;
    });
    wake(c);
    await p1;
    expect(resolved).toBe(true);
  });

  it('does nothing if wake is called with no waiter', () => {
    const c = ctx([rec('a', 'gcp.storage.bucket')]);
    expect(() => wake(c)).not.toThrow();
  });

  it('reuses a fresh promise after wake', async () => {
    const c = ctx([rec('a', 'gcp.storage.bucket')]);
    const p1 = wait_for_settle(c);
    wake(c);
    await p1;
    const p2 = wait_for_settle(c);
    expect(p2).not.toBe(p1);
  });
});

// ─── on_settled ──────────────────────────────────────────────────────

describe('on_settled', () => {
  it('marks the node terminal-succeeded on a successful result', () => {
    const a = rec('a', 'gcp.storage.bucket');
    const c = ctx([a], { in_flight: new Set([a.change.id]) });
    on_settled(
      c,
      a,
      {
        resource_id: a.change.id,
        name: a.change.name,
        type: a.change.type,
        action: 'create',
        success: true,
        duration_ms: 10,
      },
      undefined,
    );
    expect(a.terminal).toBe('succeeded');
    expect(c.in_flight.has(a.change.id)).toBe(false);
  });

  it('marks the node terminal-failed on an unsuccessful result and cancels descendants', () => {
    const a = rec('a', 'gcp.storage.bucket', { dependents: ['gcp.storage.bucket:b'] });
    const b = rec('b', 'gcp.storage.bucket');
    const c = ctx([a, b]);
    on_settled(
      c,
      a,
      {
        resource_id: a.change.id,
        name: a.change.name,
        type: a.change.type,
        action: 'create',
        success: false,
        error: 'boom',
        duration_ms: 5,
      },
      undefined,
    );
    expect(a.terminal).toBe('failed');
    expect(b.terminal).toBe('cancelled-due-to-dep');
  });

  it('synthesizes a failure result when the handler threw', () => {
    const a = rec('a', 'gcp.storage.bucket');
    const c = ctx([a]);
    on_settled(c, a, undefined, new Error('handler threw'));
    expect(c.results).toHaveLength(1);
    expect(c.results[0]!.success).toBe(false);
    expect(c.results[0]!.error).toBe('handler threw');
  });

  it('flips hard_failed when continue_on_error: false and a node fails', () => {
    const a = rec('a', 'gcp.storage.bucket');
    const c = ctx([a], { options: { provider: 'gcp', continue_on_error: false } as DeployOptions });
    on_settled(c, a, undefined, new Error('boom'));
    expect(c.hard_failed).toBe(true);
  });

  it('decrements handler_in_flight on settle', () => {
    const a = rec('a', 'gcp.sql.databaseInstance');
    const c = ctx([a], {
      handler_in_flight: new Map([['gcp.sql.', 1]]),
      handler_cap_prefixes: ['gcp.sql.'],
      per_handler_caps: { 'gcp.sql.': 1 },
    });
    on_settled(
      c,
      a,
      {
        resource_id: a.change.id,
        name: a.change.name,
        type: a.change.type,
        action: 'create',
        success: true,
        duration_ms: 0,
      },
      undefined,
    );
    expect(c.handler_in_flight.has('gcp.sql.')).toBe(false);
  });
});

// ─── invoke_handler ──────────────────────────────────────────────────

describe('invoke_handler', () => {
  it('returns a synthetic success result when dry_run is set', async () => {
    const a = rec('a', 'gcp.storage.bucket');
    const c = ctx([a], {
      options: { provider: 'gcp', dry_run: true } as DeployOptions,
    });
    const r = await invoke_handler(c, a);
    expect(r.success).toBe(true);
    expect(r.action).toBe('create');
  });

  it('dispatches to deployer.create on the create phase', async () => {
    const create = vi.fn(async () => ({
      resource_id: '',
      name: '',
      type: '',
      action: 'create' as const,
      success: true,
      duration_ms: 0,
    }));
    const update = vi.fn();
    const remove = vi.fn();
    const a = rec('a', 'gcp.storage.bucket');
    const c = ctx([a], {
      deployer: {
        provider: 'gcp',
        initialize: async () => {},
        cleanup: async () => {},
        create,
        update,
        delete: remove,
      } as ProviderDeployer,
    });
    await invoke_handler(c, a);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      'gcp.storage.bucket',
      'a',
      { foo: 1 },
      expect.objectContaining({ node: expect.any(Object) }),
    );
    expect(update).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('dispatches to deployer.update on the update phase', async () => {
    const update = vi.fn(async () => ({
      resource_id: '',
      name: '',
      type: '',
      action: 'update' as const,
      success: true,
      duration_ms: 0,
    }));
    const a = rec('a', 'gcp.storage.bucket');
    a.change.provider_id = 'pid';
    a.change.current_properties = { old: 1 };
    const c = ctx([a], {
      phase: 'update',
      deployer: {
        provider: 'gcp',
        initialize: async () => {},
        cleanup: async () => {},
        create: vi.fn(),
        update,
        delete: vi.fn(),
      } as ProviderDeployer,
    });
    await invoke_handler(c, a);
    expect(update).toHaveBeenCalledWith(
      'gcp.storage.bucket',
      'a',
      'pid',
      { foo: 1 },
      { old: 1 },
      expect.any(Object),
    );
  });

  it('dispatches to deployer.delete on the delete phase', async () => {
    const remove = vi.fn(async () => ({
      resource_id: '',
      name: '',
      type: '',
      action: 'delete' as const,
      success: true,
      duration_ms: 0,
    }));
    const a = rec('a', 'gcp.storage.bucket');
    a.change.provider_id = 'pid';
    const c = ctx([a], {
      phase: 'delete',
      deployer: {
        provider: 'gcp',
        initialize: async () => {},
        cleanup: async () => {},
        create: vi.fn(),
        update: vi.fn(),
        delete: remove,
      } as ProviderDeployer,
    });
    await invoke_handler(c, a);
    expect(remove).toHaveBeenCalledWith('gcp.storage.bucket', 'a', 'pid', expect.any(Object));
  });
});

// ─── dispatch ────────────────────────────────────────────────────────

describe('dispatch', () => {
  it('marks the node in_flight and emits applying', async () => {
    const events: NodeStatusEvent[] = [];
    const a = rec('a', 'gcp.storage.bucket');
    const c = ctx([a], {
      options: { provider: 'gcp', on_node_status: (e) => events.push(e) } as DeployOptions,
    });
    dispatch(c, a.change.id);
    // The dispatch fires invoke_handler which queues a microtask.
    expect(c.in_flight.has(a.change.id)).toBe(true);
    expect(events.some((e) => e.status === 'applying')).toBe(true);
    await new Promise((r) => setTimeout(r, 10));
  });

  it('is a no-op when the node is missing or terminal', () => {
    const a = rec('a', 'gcp.storage.bucket');
    a.terminal = 'succeeded';
    const c = ctx([a]);
    expect(() => dispatch(c, a.change.id)).not.toThrow();
    expect(c.in_flight.has(a.change.id)).toBe(false);
    expect(() => dispatch(c, 'nonexistent')).not.toThrow();
  });
});

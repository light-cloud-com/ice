/**
 * Tests for the legacy apply engine (`apply-engine.ts`).
 *
 * The parallel deploy scheduler in `core/src/deploy/scheduler.ts` is the
 * primary deploy path (decisions.md, 2026-04-28); this engine still drives
 * the rollback flow and serves as a reference. Tests assert layer batching,
 * per-resource failure semantics, dry-run, and result-shape threading.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  apply_plan,
  apply_succeeded,
  get_failed_resources,
  get_successful_resources,
} from '../apply-engine.js';
import { create_mutable_graph, type MutableGraph } from '../../graph/mutable-graph.js';
import {
  create_deployment_id,
  type DeploymentPlan,
  type PlannedChange,
  type DeploymentAction,
} from '../../types/deployment.js';
import { create_node_id, type NodeId } from '../../types/graph.js';
import type {
  ProviderClient,
  ResourceState,
  DeploymentResult,
  DestroyResult,
} from '../../types/providers.js';
import type { ApplyProgressEvent, ApplyResult } from '../types.js';

// ─── Mock the mock-provider so apply_plan picks up our fake ──────────

vi.mock('../../providers/mock-provider.js', () => ({
  create_mock_provider: vi.fn(() => current_provider),
}));

// Slot the active fake handler into a module-level let so each test can swap it.
let current_provider: ProviderClient = make_provider();

// ─── Helpers ────────────────────────────────────────────────────────

interface FakeProviderOptions {
  on_deploy?: (id: NodeId) => DeploymentResult;
  on_update?: (id: NodeId, current: ResourceState) => DeploymentResult;
  on_destroy?: (id: NodeId, current: ResourceState) => DestroyResult;
  deploy_throws?: (id: NodeId) => boolean;
}

function make_provider(opts: FakeProviderOptions = {}): ProviderClient {
  return {
    provider: 'mock',
    region: 'mock-region',
    health_check: vi.fn(async () => ({
      healthy: true,
      latency_ms: 0,
      details: {},
    })),
    deploy: vi.fn(async (node) => {
      if (opts.deploy_throws?.(node.id)) {
        throw new Error(`provider crashed for ${node.id}`);
      }
      if (opts.on_deploy) return opts.on_deploy(node.id);
      return {
        success: true,
        node_id: node.id,
        state: state_for(node.id, 'create', { from: 'deploy' }),
        duration_ms: 1,
      };
    }),
    update: vi.fn(async (node, current) => {
      if (opts.on_update) return opts.on_update(node.id, current);
      return {
        success: true,
        node_id: node.id,
        state: state_for(node.id, 'update', { from: 'update' }),
        duration_ms: 1,
      };
    }),
    destroy: vi.fn(async (node, current) => {
      if (opts.on_destroy) return opts.on_destroy(node.id, current);
      return {
        success: true,
        node_id: node.id,
        duration_ms: 1,
      };
    }),
    get_state: vi.fn(async () => null),
    refresh_state: vi.fn(async (_n, s) => s),
    supports_type: vi.fn(() => true),
    get_native_type: vi.fn((t) => t),
  };
}

function state_for(id: NodeId, action: string, extra: Record<string, unknown> = {}): ResourceState {
  return {
    cloud_id: `cloud-${id}-${action}`,
    status: 'available',
    outputs: { id, action, ...extra },
  };
}

function add_node(graph: MutableGraph, name: string, type = 'Test.Resource'): NodeId {
  const r = graph.add_node({ type, name, properties: { name } });
  if (!r.success || !r.node) throw new Error(`add_node failed: ${r.errors?.join(', ')}`);
  return r.node.id;
}

function make_change(
  node_id: NodeId,
  action: DeploymentAction,
  overrides: Partial<PlannedChange> = {},
): PlannedChange {
  return {
    node_id,
    action,
    depends_on: [],
    destructive: action === 'delete' || action === 'replace',
    ...overrides,
  };
}

function make_plan(changes: PlannedChange[]): DeploymentPlan {
  const counts = changes.reduce(
    (acc, c) => ((acc[c.action] = (acc[c.action] ?? 0) + 1), acc),
    {} as Record<string, number>,
  );
  return {
    id: create_deployment_id('plan_test'),
    graph_id: 'graph_test',
    created_at: new Date().toISOString(),
    changes,
    summary: {
      total: changes.length,
      create: counts.create ?? 0,
      update: counts.update ?? 0,
      replace: counts.replace ?? 0,
      delete: counts.delete ?? 0,
      no_op: counts.no_op ?? 0,
      destructive: changes.filter((c) => c.destructive).length,
    },
    providers: [],
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  current_provider = make_provider();
});

describe('apply_plan — happy path', () => {
  it('applies a 3-resource create plan and reports success', async () => {
    const graph = create_mutable_graph('g');
    const a = add_node(graph, 'a');
    const b = add_node(graph, 'b');
    const c = add_node(graph, 'c');

    const events: ApplyProgressEvent[] = [];
    const result = await apply_plan(
      make_plan([make_change(a, 'create'), make_change(b, 'create'), make_change(c, 'create')]),
      graph,
      { on_progress: (e) => events.push(e) },
    );

    expect(result.success).toBe(true);
    expect(result.summary).toEqual({
      total: 3,
      created: 3,
      updated: 0,
      replaced: 0,
      deleted: 0,
      skipped: 0,
      failed: 0,
    });
    expect(result.results).toHaveLength(3);
    expect(result.errors).toHaveLength(0);
    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
    expect(result.deployment_id.startsWith('deploy_')).toBe(true);
    expect(events.find((e) => e.type === 'apply_started')).toBeDefined();
    expect(events.find((e) => e.type === 'apply_completed')).toBeDefined();
    expect(events.filter((e) => e.type === 'resource_started')).toHaveLength(3);
    expect(events.filter((e) => e.type === 'resource_completed')).toHaveLength(3);
  });

  it('threads outputs, cloud_id, and duration through from handler return values', async () => {
    const graph = create_mutable_graph('g');
    const a = add_node(graph, 'a');

    current_provider = make_provider({
      on_deploy: (id) => ({
        success: true,
        node_id: id,
        state: {
          cloud_id: 'cid-explicit',
          status: 'available',
          outputs: { url: 'https://example.test/' },
        },
        duration_ms: 42,
      }),
    });

    const result = await apply_plan(make_plan([make_change(a, 'create')]), graph);
    expect(result.results[0]!.state?.cloud_id).toBe('cid-explicit');
    expect(result.results[0]!.state?.outputs).toEqual({ url: 'https://example.test/' });
    expect(typeof result.results[0]!.duration_ms).toBe('number');
  });
});

describe('apply_plan — empty plan', () => {
  it('returns immediate success with zero counts', async () => {
    const graph = create_mutable_graph('g');
    const result = await apply_plan(make_plan([]), graph);

    expect(result.success).toBe(true);
    expect(result.summary.total).toBe(0);
    expect(result.results).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('skips layer execution entirely when every change is no_op', async () => {
    const graph = create_mutable_graph('g');
    const a = add_node(graph, 'a');
    const events: ApplyProgressEvent[] = [];

    const result = await apply_plan(
      make_plan([make_change(a, 'no_op', { current_state: state_for(a, 'noop') })]),
      graph,
      { on_progress: (e) => events.push(e) },
    );

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(0);
    // no_op changes are filtered before execution → no layer/resource events
    expect(events.find((e) => e.type === 'layer_started')).toBeUndefined();
    expect(events.find((e) => e.type === 'resource_started')).toBeUndefined();
  });
});

describe('apply_plan — layer batching and parallelism', () => {
  it('walks dependent changes layer-by-layer in dependency order', async () => {
    const graph = create_mutable_graph('g');
    const a = add_node(graph, 'a');
    const b = add_node(graph, 'b');
    const c = add_node(graph, 'c');

    const start_order: NodeId[] = [];
    current_provider = make_provider({
      on_deploy: (id) => {
        start_order.push(id);
        return {
          success: true,
          node_id: id,
          state: state_for(id, 'create'),
          duration_ms: 1,
        };
      },
    });

    // c depends on b; b depends on a. Layer-batched walker should fire a, then b, then c.
    const result = await apply_plan(
      make_plan([
        make_change(a, 'create'),
        make_change(b, 'create', { depends_on: [a] }),
        make_change(c, 'create', { depends_on: [b] }),
      ]),
      graph,
    );

    expect(result.success).toBe(true);
    expect(start_order).toEqual([a, b, c]);
  });

  it('respects parallelism cap by chunking same-layer changes into batches', async () => {
    const graph = create_mutable_graph('g');
    // Five independent nodes in one layer; parallelism = 2 → 3 batches.
    const ids = ['a', 'b', 'c', 'd', 'e'].map((n) => add_node(graph, n));

    const concurrent = { now: 0, peak: 0 };
    current_provider = make_provider({
      on_deploy: async (id) => {
        concurrent.now++;
        if (concurrent.now > concurrent.peak) concurrent.peak = concurrent.now;
        // Yield to let the batch's siblings start before resolving.
        await Promise.resolve();
        concurrent.now--;
        return {
          success: true,
          node_id: id,
          state: state_for(id, 'create'),
          duration_ms: 1,
        };
      },
    } as FakeProviderOptions);

    const result = await apply_plan(
      make_plan(ids.map((id) => make_change(id, 'create'))),
      graph,
      { parallelism: 2 },
    );

    expect(result.success).toBe(true);
    // Peak in-flight must not exceed parallelism.
    expect(concurrent.peak).toBeLessThanOrEqual(2);
  });

  it('emits a layer_started event per non-empty layer', async () => {
    const graph = create_mutable_graph('g');
    const a = add_node(graph, 'a');
    const b = add_node(graph, 'b');
    const events: ApplyProgressEvent[] = [];

    await apply_plan(
      make_plan([make_change(a, 'create'), make_change(b, 'create', { depends_on: [a] })]),
      graph,
      { on_progress: (e) => events.push(e) },
    );

    const layer_starts = events.filter((e) => e.type === 'layer_started');
    expect(layer_starts).toHaveLength(2);
  });
});

describe('apply_plan — failure handling', () => {
  it('keeps going when abort_on_error is false (default) and records every failure', async () => {
    const graph = create_mutable_graph('g');
    const a = add_node(graph, 'a');
    const b = add_node(graph, 'b');

    current_provider = make_provider({
      on_deploy: (id) =>
        id === a
          ? {
              success: false,
              node_id: id,
              error: { code: 'BOOM', message: 'oops', retryable: true },
              duration_ms: 1,
            }
          : {
              success: true,
              node_id: id,
              state: state_for(id, 'create'),
              duration_ms: 1,
            },
    });

    const result = await apply_plan(
      make_plan([make_change(a, 'create'), make_change(b, 'create')]),
      graph,
    );

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.recoverable).toBe(true);
    expect(result.errors[0]!.error.code).toBe('BOOM');
    expect(result.summary.failed).toBe(1);
    expect(result.summary.created).toBe(1);
  });

  it('aborts the run after the first failure when abort_on_error is true', async () => {
    const graph = create_mutable_graph('g');
    const a = add_node(graph, 'a');
    const b = add_node(graph, 'b');
    const c = add_node(graph, 'c');

    current_provider = make_provider({
      on_deploy: (id) =>
        id === a
          ? {
              success: false,
              node_id: id,
              error: { code: 'BOOM', message: 'oops', retryable: false },
              duration_ms: 1,
            }
          : {
              success: true,
              node_id: id,
              state: state_for(id, 'create'),
              duration_ms: 1,
            },
    });

    // a fails in layer 0; b (dep on a) and c (dep on b) live in layers 1, 2.
    // With abort_on_error: true, layers 1 and 2 should not execute.
    const result = await apply_plan(
      make_plan([
        make_change(a, 'create'),
        make_change(b, 'create', { depends_on: [a] }),
        make_change(c, 'create', { depends_on: [b] }),
      ]),
      graph,
      { abort_on_error: true },
    );

    expect(result.success).toBe(false);
    expect(result.results).toHaveLength(1); // only `a` ran
    expect(result.results[0]!.node_id).toBe(a);
    expect(result.errors).toHaveLength(1);
  });

  it('treats a thrown handler error as a non-retryable APPLY_ERROR result', async () => {
    const graph = create_mutable_graph('g');
    const a = add_node(graph, 'a');

    current_provider = make_provider({ deploy_throws: (id) => id === a });

    const result = await apply_plan(make_plan([make_change(a, 'create')]), graph);

    expect(result.success).toBe(false);
    expect(result.results[0]!.error?.code).toBe('APPLY_ERROR');
    expect(result.results[0]!.error?.message).toContain('provider crashed');
    expect(result.results[0]!.error?.retryable).toBe(false);
  });

  it('serialises non-Error throws into the APPLY_ERROR message via String(err)', async () => {
    const graph = create_mutable_graph('g');
    const a = add_node(graph, 'a');

    current_provider = {
      ...make_provider(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      deploy: vi.fn(async () => {
        // Reject with a non-Error literal.
        throw 'string-rejection';
      }),
    } as ProviderClient;

    const result = await apply_plan(make_plan([make_change(a, 'create')]), graph);
    expect(result.results[0]!.error?.message).toBe('string-rejection');
  });

  it('marks the run as failed when a handler reports success=false even without an error (findings #24)', async () => {
    // Edge case: success=false but no error attached → engine records
    // a failure (summary.failed=1) but does not push an ApplyError.
    // Previously result.success was true because build_result keyed
    // off errors.length === 0; now it derives from summary.failed
    // too so the two views agree.
    const graph = create_mutable_graph('g');
    const a = add_node(graph, 'a');

    current_provider = make_provider({
      on_deploy: (id) => ({ success: false, node_id: id, duration_ms: 1 }),
    });

    const result = await apply_plan(make_plan([make_change(a, 'create')]), graph);
    expect(result.summary.failed).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(result.success).toBe(false);
  });

  it('marks a missing-from-graph node as NODE_NOT_FOUND', async () => {
    const graph = create_mutable_graph('g');
    // Add only `a`; ask the plan to also touch `ghost`.
    const a = add_node(graph, 'a');
    const ghost = create_node_id('ghost-id-not-in-graph');

    const result = await apply_plan(
      make_plan([make_change(a, 'create'), make_change(ghost, 'create')]),
      graph,
    );

    const ghost_result = result.results.find((r) => r.node_id === ghost);
    expect(ghost_result?.success).toBe(false);
    expect(ghost_result?.error?.code).toBe('NODE_NOT_FOUND');
    expect(ghost_result?.error?.retryable).toBe(false);
  });
});

describe('apply_plan — provider operation dispatch', () => {
  it('routes update changes to provider.update with current_state', async () => {
    const graph = create_mutable_graph('g');
    const a = add_node(graph, 'a');
    const cur = state_for(a, 'pre');

    const result = await apply_plan(
      make_plan([make_change(a, 'update', { current_state: cur })]),
      graph,
    );

    expect(result.summary.updated).toBe(1);
    expect(current_provider.update).toHaveBeenCalledTimes(1);
    expect((current_provider.update as ReturnType<typeof vi.fn>).mock.calls[0]![1]).toBe(cur);
  });

  it('flags update with no current_state as MISSING_STATE', async () => {
    const graph = create_mutable_graph('g');
    const a = add_node(graph, 'a');

    const result = await apply_plan(make_plan([make_change(a, 'update')]), graph);

    expect(result.results[0]!.success).toBe(false);
    expect(result.results[0]!.error?.code).toBe('MISSING_STATE');
    expect(current_provider.update).not.toHaveBeenCalled();
  });

  it('replaces by destroying then deploying when current_state is present', async () => {
    const graph = create_mutable_graph('g');
    const a = add_node(graph, 'a');

    const result = await apply_plan(
      make_plan([make_change(a, 'replace', { current_state: state_for(a, 'pre') })]),
      graph,
    );

    expect(current_provider.destroy).toHaveBeenCalledTimes(1);
    expect(current_provider.deploy).toHaveBeenCalledTimes(1);
    expect(result.summary.replaced).toBe(1);
  });

  it('replaces by deploying directly when there is no current_state, with a warning (findings #25)', async () => {
    // The replace path used to silently skip the destroy step when
    // current_state was missing — orphaned cloud resources for any
    // caller that mis-paired a 'replace' action with no state. The
    // skip is preserved (we can't destroy what we don't know about)
    // but a warning now makes the create-only mode observable.
    const graph = create_mutable_graph('g');
    const a = add_node(graph, 'a');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await apply_plan(make_plan([make_change(a, 'replace')]), graph);

    expect(current_provider.destroy).not.toHaveBeenCalled();
    expect(current_provider.deploy).toHaveBeenCalledTimes(1);
    expect(result.summary.replaced).toBe(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/replace action.*no current_state/),
    );
    warnSpy.mockRestore();
  });

  it('aborts replace when destroy fails and reports the destroy error', async () => {
    const graph = create_mutable_graph('g');
    const a = add_node(graph, 'a');

    current_provider = make_provider({
      on_destroy: (id) => ({
        success: false,
        node_id: id,
        error: { code: 'DESTROY_FAIL', message: 'no', retryable: false },
        duration_ms: 1,
      }),
    });

    const result = await apply_plan(
      make_plan([make_change(a, 'replace', { current_state: state_for(a, 'pre') })]),
      graph,
    );

    expect(result.success).toBe(false);
    expect(result.results[0]!.error?.code).toBe('DESTROY_FAIL');
    // deploy should NOT be called once destroy failed
    expect(current_provider.deploy).not.toHaveBeenCalled();
  });

  it('routes delete changes through provider.destroy', async () => {
    const graph = create_mutable_graph('g');
    const a = add_node(graph, 'a');

    const result = await apply_plan(
      make_plan([make_change(a, 'delete', { current_state: state_for(a, 'pre') })]),
      graph,
    );

    expect(current_provider.destroy).toHaveBeenCalledTimes(1);
    expect(result.summary.deleted).toBe(1);
  });

  it('flags delete with no current_state as MISSING_STATE', async () => {
    const graph = create_mutable_graph('g');
    const a = add_node(graph, 'a');

    const result = await apply_plan(make_plan([make_change(a, 'delete')]), graph);

    expect(result.results[0]!.success).toBe(false);
    expect(result.results[0]!.error?.code).toBe('MISSING_STATE');
    expect(current_provider.destroy).not.toHaveBeenCalled();
  });

  it('treats a delete failure from the provider as a recorded failure', async () => {
    const graph = create_mutable_graph('g');
    const a = add_node(graph, 'a');

    current_provider = make_provider({
      on_destroy: (id) => ({
        success: false,
        node_id: id,
        error: { code: 'DELETE_FAIL', message: 'nope', retryable: true },
        duration_ms: 1,
      }),
    });

    const result = await apply_plan(
      make_plan([make_change(a, 'delete', { current_state: state_for(a, 'pre') })]),
      graph,
    );

    expect(result.success).toBe(false);
    expect(result.results[0]!.error?.code).toBe('DELETE_FAIL');
    expect(result.errors[0]!.recoverable).toBe(true);
  });

  it('handles unknown actions with UNKNOWN_ACTION', async () => {
    const graph = create_mutable_graph('g');
    const a = add_node(graph, 'a');

    // Bypass the type system to inject an action the dispatcher doesn't know.
    const bogus = make_change(a, 'create');
    (bogus as unknown as { action: string }).action = 'frobnicate';

    const result = await apply_plan(make_plan([bogus]), graph);

    expect(result.results[0]!.success).toBe(false);
    expect(result.results[0]!.error?.code).toBe('UNKNOWN_ACTION');
    expect(result.results[0]!.error?.message).toContain('frobnicate');
  });
});

describe('apply_plan — dry run', () => {
  it('returns synthesised states without calling any provider operation', async () => {
    const graph = create_mutable_graph('g');
    const a = add_node(graph, 'a');
    const b = add_node(graph, 'b');

    const result = await apply_plan(
      make_plan([make_change(a, 'create'), make_change(b, 'update', { current_state: state_for(b, 'pre') })]),
      graph,
      { dry_run: true },
    );

    expect(current_provider.deploy).not.toHaveBeenCalled();
    expect(current_provider.update).not.toHaveBeenCalled();
    expect(current_provider.destroy).not.toHaveBeenCalled();

    expect(result.success).toBe(true);
    expect(result.results.every((r) => r.dry_run)).toBe(true);
    expect(result.results[0]!.state?.cloud_id.startsWith('dry-run-')).toBe(true);
    expect(result.results[0]!.state?.provider_metadata).toEqual({ dry_run: true });
  });

  it('still flags missing graph nodes during dry run', async () => {
    const graph = create_mutable_graph('g');
    const ghost = create_node_id('ghost');

    const result = await apply_plan(make_plan([make_change(ghost, 'create')]), graph, {
      dry_run: true,
    });
    expect(result.results[0]!.error?.code).toBe('NODE_NOT_FOUND');
    expect(result.results[0]!.dry_run).toBe(true);
  });
});

describe('apply_plan — provider selection', () => {
  it('logs and uses plan-only mode when a non-mock provider is requested', async () => {
    const graph = create_mutable_graph('g');
    const a = add_node(graph, 'a');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await apply_plan(make_plan([make_change(a, 'create')]), graph, { provider: 'gcp' });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Provider "gcp"'));

    log.mockRestore();
  });

  it('does not log when provider is mock', async () => {
    const graph = create_mutable_graph('g');
    const a = add_node(graph, 'a');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await apply_plan(make_plan([make_change(a, 'create')]), graph, { provider: 'mock' });
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('does not log when provider is unset (defaults to mock)', async () => {
    const graph = create_mutable_graph('g');
    const a = add_node(graph, 'a');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await apply_plan(make_plan([make_change(a, 'create')]), graph);
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
});

describe('apply_plan — option defaults and overrides', () => {
  it('honours custom state_path / parallelism / targets without affecting result shape', async () => {
    const graph = create_mutable_graph('g');
    const a = add_node(graph, 'a');

    const result = await apply_plan(make_plan([make_change(a, 'create')]), graph, {
      state_path: '/tmp/custom.json',
      auto_approve: true,
      parallelism: 1,
      targets: [a],
      mock: false,
    });

    expect(result.success).toBe(true);
  });

  it('runs with no on_progress callback supplied (silent run)', async () => {
    const graph = create_mutable_graph('g');
    const a = add_node(graph, 'a');

    const result = await apply_plan(make_plan([make_change(a, 'create')]), graph);
    expect(result.success).toBe(true);
  });
});

describe('utility exports', () => {
  let result: ApplyResult;

  beforeEach(() => {
    const id = create_node_id('n');
    result = {
      success: true,
      deployment_id: create_deployment_id('d'),
      summary: { total: 2, created: 1, updated: 0, replaced: 0, deleted: 0, skipped: 0, failed: 1 },
      results: [
        { node_id: id, action: 'create', success: true, duration_ms: 1 },
        { node_id: id, action: 'create', success: false, duration_ms: 1 },
      ],
      errors: [],
      duration_ms: 2,
    };
  });

  it('reports success when both result.success and errors[] are clean', () => {
    expect(apply_succeeded({ ...result, errors: [] })).toBe(true);
  });

  it('reports failure when result.success is false', () => {
    expect(apply_succeeded({ ...result, success: false })).toBe(false);
  });

  it('reports failure when errors[] is non-empty even with success flag', () => {
    expect(
      apply_succeeded({
        ...result,
        success: true,
        errors: [
          {
            node_id: create_node_id('x'),
            action: 'create',
            error: { code: 'E', message: 'm', retryable: false },
            recoverable: false,
          },
        ],
      }),
    ).toBe(false);
  });

  it('partitions results into successful and failed buckets', () => {
    expect(get_failed_resources(result)).toHaveLength(1);
    expect(get_successful_resources(result)).toHaveLength(1);
    expect(get_failed_resources(result)[0]!.success).toBe(false);
    expect(get_successful_resources(result)[0]!.success).toBe(true);
  });
});

// =========================================================================
// AbortSignal cancellation (findings #23)
// =========================================================================

describe('apply_plan — AbortSignal cancellation (findings #23)', () => {
  it('returns immediately with cancelled:true when the signal is already aborted', async () => {
    const graph = create_mutable_graph('g');
    const a = add_node(graph, 'a');
    const b = add_node(graph, 'b');

    const controller = new AbortController();
    controller.abort();

    const result = await apply_plan(
      make_plan([make_change(a, 'create'), make_change(b, 'create')]),
      graph,
      { signal: controller.signal },
    );

    expect(result.cancelled).toBe(true);
    expect(result.success).toBe(false);
    // Both changes are recorded as CANCELLED — no provider calls fired.
    expect(result.results).toHaveLength(2);
    for (const r of result.results) {
      expect(r.success).toBe(false);
      expect(r.error?.code).toBe('CANCELLED');
    }
    expect(result.errors.every((e) => e.error.code === 'CANCELLED')).toBe(true);
    expect(current_provider.deploy).not.toHaveBeenCalled();
  });

  it('stops scheduling new layers once aborted mid-flight', async () => {
    // Two layers via depends_on chain: B depends on A, so they
    // execute in separate layers. Aborting after layer 0 settles
    // means layer 1's change is recorded as CANCELLED and B's
    // provider.deploy never fires.
    const graph = create_mutable_graph('g');
    const a = add_node(graph, 'a');
    const b = add_node(graph, 'b');

    const controller = new AbortController();
    let deployedFirst = false;
    current_provider = make_provider({
      on_deploy: (id) => {
        // Trigger the abort the moment the first deploy returns.
        if (!deployedFirst) {
          deployedFirst = true;
          controller.abort();
        }
        return {
          success: true,
          node_id: id,
          state: state_for(id, 'create'),
          duration_ms: 1,
        };
      },
    });

    const result = await apply_plan(
      make_plan([make_change(a, 'create'), make_change(b, 'create', { depends_on: [a] })]),
      graph,
      { signal: controller.signal },
    );

    expect(result.cancelled).toBe(true);
    expect(result.success).toBe(false);
    // a completed, b is the cancelled one.
    const a_result = result.results.find((r) => r.node_id === a);
    const b_result = result.results.find((r) => r.node_id === b);
    expect(a_result?.success).toBe(true);
    expect(b_result?.success).toBe(false);
    expect(b_result?.error?.code).toBe('CANCELLED');
    expect((current_provider.deploy as any).mock.calls).toHaveLength(1);
  });

  it('stops between batches when parallelism makes a single layer take many rounds', async () => {
    // Two changes in the SAME layer (no dependencies), parallelism=1
    // forces them into two batches. Abort after the first batch
    // returns: the second change should be recorded as CANCELLED
    // and never dispatched.
    const graph = create_mutable_graph('g');
    const a = add_node(graph, 'a');
    const b = add_node(graph, 'b');

    const controller = new AbortController();
    let batchesDispatched = 0;
    current_provider = make_provider({
      on_deploy: (id) => {
        batchesDispatched++;
        if (batchesDispatched === 1) controller.abort();
        return {
          success: true,
          node_id: id,
          state: state_for(id, 'create'),
          duration_ms: 1,
        };
      },
    });

    const result = await apply_plan(
      make_plan([make_change(a, 'create'), make_change(b, 'create')]),
      graph,
      { signal: controller.signal, parallelism: 1 },
    );

    expect(result.cancelled).toBe(true);
    expect(result.success).toBe(false);
    expect((current_provider.deploy as any).mock.calls).toHaveLength(1);
    // Second change must be present and marked CANCELLED.
    const cancelled = result.results.find((r) => r.error?.code === 'CANCELLED');
    expect(cancelled).toBeDefined();
  });

  it('omits cancelled flag on a normal completed run', async () => {
    const graph = create_mutable_graph('g');
    const a = add_node(graph, 'a');
    const result = await apply_plan(make_plan([make_change(a, 'create')]), graph);
    expect(result.cancelled).toBeUndefined();
  });
});

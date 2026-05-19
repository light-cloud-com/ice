/**
 * Tests for the parallel deploy scheduler (pdl-1).
 *
 * Each test wires a tiny graph + mocked deployer and asserts behavior
 * on dependencies, parallelism, per-handler caps, failure isolation,
 * cancellation, and event emission.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { run_parallel_apply, type SchedulerPhase } from '../scheduler';
import type { ResourceChange } from '../../diff/types';
import type { Graph, Node, NodeId, Edge, EdgeId } from '../../types/graph';
import type {
  DeployOptions,
  NodeStatusEvent,
  NodeProgressEvent,
  ProviderDeployer,
  ResourceDeployResult,
} from '../types';

// ─── Test helpers ────────────────────────────────────────────────────

/**
 * Build a minimal Graph stub from a list of nodes and depends-on edges.
 * Mirrors the convention used by `card-translator.ts`: edges are
 * canvas-source → canvas-target with `depends_on` semantics, meaning
 * "source needs target before it can deploy."
 *
 * In the scheduler's create-phase DAG this means: target finishes
 * BEFORE source can start. For tests we'll express dependencies the
 * other way for clarity ("a → b" = "b depends on a"), so we'll pass
 * `edges_from_to` which is "from must finish before to."
 */
function build_graph(resources: Array<{ name: string; type: string }>, edges_from_to: Array<[string, string]>): Graph {
  const nodes_map = new Map<NodeId, Node>();
  const edges_map = new Map<EdgeId, Edge>();
  const now = new Date().toISOString();

  for (const { name, type } of resources) {
    const id = `${type}:${name}` as NodeId;
    nodes_map.set(id, {
      id,
      type,
      name,
      properties: {},
      metadata: {
        created_at: now,
        updated_at: now,
        labels: {},
        annotations: {},
      },
    });
  }

  for (let i = 0; i < edges_from_to.length; i++) {
    const [from, to] = edges_from_to[i]!;
    const fromName = from;
    const toName = to;
    // In the order_by_dependencies convention, `source.name → deps.target.name`
    // means source depends on target. We want "from must finish before to",
    // i.e. "to depends on from", so source = to, target = from.
    const sourceId = [...nodes_map.values()].find((n) => n.name === toName)!.id;
    const targetId = [...nodes_map.values()].find((n) => n.name === fromName)!.id;
    const edgeId = `${sourceId}->${targetId}:depends_on` as EdgeId;
    edges_map.set(edgeId, {
      id: edgeId,
      source: sourceId,
      target: targetId,
      relationship: 'depends_on',
      metadata: {
        created_at: now,
        labels: {},
        inferred: false,
      },
    });
  }

  return {
    id: 'test-graph' as Graph['id'],
    name: 'test',
    version: '1.0',
    nodes: nodes_map,
    edges: edges_map,
    metadata: {
      created_at: now,
      updated_at: now,
      labels: {},
      annotations: {},
    },
  };
}

/** Build a `ResourceChange` for a name+type. */
function build_change(
  name: string,
  type: string,
  change_type: 'create' | 'update' | 'delete' = 'create',
): ResourceChange {
  return {
    id: `${type}:${name}`,
    name,
    type,
    provider: 'gcp',
    change_type,
    property_changes: [],
    current_properties: change_type === 'create' ? null : {},
    desired_properties: change_type === 'delete' ? null : {},
  };
}

/**
 * Build a mock ProviderDeployer whose create/update/delete behavior is
 * configurable per-resource-name. Default: each call resolves
 * synchronously (next tick) with success.
 */
interface MockBehavior {
  /** ms delay before resolve/reject. */
  delay_ms?: number;
  /** Throw or resolve with success: false. */
  fail?: boolean;
  /** Error message when failing. */
  error?: string;
  /** Outputs to return on success. */
  outputs?: Record<string, unknown>;
}

interface MockTiming {
  name: string;
  applying_at?: number;
  settled_at?: number;
}

function make_mock_deployer(behaviors: Record<string, MockBehavior> = {}): {
  deployer: ProviderDeployer;
  timings: MockTiming[];
  calls: Array<{ method: string; name: string; type: string }>;
} {
  const timings: MockTiming[] = [];
  const calls: Array<{ method: string; name: string; type: string }> = [];

  const make_call = (
    method: 'create' | 'update' | 'delete',
    type: string,
    name: string,
  ): Promise<ResourceDeployResult> => {
    calls.push({ method, name, type });
    const t: MockTiming = { name, applying_at: Date.now() };
    timings.push(t);
    const behavior = behaviors[name] ?? {};
    return new Promise((resolve, reject) => {
      const finish = () => {
        t.settled_at = Date.now();
        if (behavior.fail) {
          if (behavior.error?.startsWith('throw:')) {
            reject(new Error(behavior.error.slice('throw:'.length)));
            return;
          }
          resolve({
            resource_id: `${type}:${name}`,
            name,
            type,
            action: method,
            success: false,
            error: behavior.error || 'mock failure',
            duration_ms: behavior.delay_ms ?? 0,
          });
          return;
        }
        resolve({
          resource_id: `${type}:${name}`,
          name,
          type,
          action: method,
          success: true,
          duration_ms: behavior.delay_ms ?? 0,
          outputs: behavior.outputs,
        });
      };
      if (behavior.delay_ms && behavior.delay_ms > 0) setTimeout(finish, behavior.delay_ms);
      else queueMicrotask(finish);
    });
  };

  const deployer: ProviderDeployer = {
    provider: 'gcp',
    initialize: async () => {},
    cleanup: async () => {},
    create: (type, name) => make_call('create', type, name),
    update: (type, name) => make_call('update', type, name),
    delete: (type, name) => make_call('delete', type, name),
  };
  return { deployer, timings, calls };
}

interface CapturedEvents {
  status: NodeStatusEvent[];
  progress: NodeProgressEvent[];
  resource_results: ResourceDeployResult[];
}

function capture_events(): {
  events: CapturedEvents;
  options: Pick<DeployOptions, 'on_node_status' | 'on_node_progress' | 'on_resource_result'>;
} {
  const events: CapturedEvents = {
    status: [],
    progress: [],
    resource_results: [],
  };
  return {
    events,
    options: {
      on_node_status: (e) => events.status.push(e),
      on_node_progress: (e) => events.progress.push(e),
      on_resource_result: (r) => events.resource_results.push(r),
    },
  };
}

function status_for(
  events: CapturedEvents,
  node_id: string,
  status: NodeStatusEvent['status'],
): NodeStatusEvent | undefined {
  return events.status.find((e) => e.node_id === node_id && e.status === status);
}

const create_phase: SchedulerPhase = 'create';

// ─── Tests ──────────────────────────────────────────────────────────

describe('ParallelChangeScheduler', () => {
  beforeEach(() => {
    // Each test seeds its own behavior via build_graph + behaviors.
  });

  // ─── 1. Respects deps ─────────────────────────────────────────────
  it('runs dependent nodes after their deps succeed', async () => {
    const graph = build_graph(
      [
        { name: 'a', type: 'gcp.storage.bucket' },
        { name: 'b', type: 'gcp.storage.bucket' },
      ],
      [['a', 'b']],
    );
    const { deployer } = make_mock_deployer({
      a: { delay_ms: 30 },
      b: { delay_ms: 30 },
    });
    const cap = capture_events();
    const start = Date.now();
    const results = await run_parallel_apply({
      changes: [build_change('a', 'gcp.storage.bucket'), build_change('b', 'gcp.storage.bucket')],
      phase: create_phase,
      graph,
      deployer,
      options: { provider: 'gcp', pool_size: 4, ...cap.options },
    });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(60); // a (30ms) + b (30ms)
    expect(results).toHaveLength(2);

    const a_succeeded = status_for(cap.events, 'gcp.storage.bucket:a', 'succeeded');
    const b_applying = status_for(cap.events, 'gcp.storage.bucket:b', 'applying');
    expect(a_succeeded).toBeDefined();
    expect(b_applying).toBeDefined();
    expect(new Date(a_succeeded!.at).getTime()).toBeLessThanOrEqual(new Date(b_applying!.at).getTime());
  });

  // ─── 2. Siblings parallel ─────────────────────────────────────────
  it('runs isolated siblings in parallel', async () => {
    const resources = ['a', 'b', 'c'].map((n) => ({ name: n, type: 'gcp.storage.bucket' }));
    const graph = build_graph(resources, []);
    const { deployer } = make_mock_deployer({
      a: { delay_ms: 50 },
      b: { delay_ms: 50 },
      c: { delay_ms: 50 },
    });
    const cap = capture_events();
    const start = Date.now();
    await run_parallel_apply({
      changes: resources.map((r) => build_change(r.name, r.type)),
      phase: create_phase,
      graph,
      deployer,
      options: { provider: 'gcp', pool_size: 3, ...cap.options },
    });
    const elapsed = Date.now() - start;
    // Three 50ms-each siblings with pool_size 3: ~50ms not 150ms.
    expect(elapsed).toBeLessThan(120);
    expect(elapsed).toBeGreaterThanOrEqual(45);
  });

  // ─── 3. Diamond fan-out ───────────────────────────────────────────
  it('fans out and back in across a diamond', async () => {
    const resources = ['a', 'b', 'c', 'd'].map((n) => ({ name: n, type: 'gcp.storage.bucket' }));
    const graph = build_graph(resources, [
      ['a', 'b'],
      ['a', 'c'],
      ['b', 'd'],
      ['c', 'd'],
    ]);
    const { deployer } = make_mock_deployer({
      a: { delay_ms: 30 },
      b: { delay_ms: 30 },
      c: { delay_ms: 30 },
      d: { delay_ms: 30 },
    });
    const cap = capture_events();
    const start = Date.now();
    await run_parallel_apply({
      changes: resources.map((r) => build_change(r.name, r.type)),
      phase: create_phase,
      graph,
      deployer,
      options: { provider: 'gcp', pool_size: 4, ...cap.options },
    });
    const elapsed = Date.now() - start;
    // a (30) → {b, c} parallel (30) → d (30) ≈ 90ms, NOT 120ms (sequential)
    expect(elapsed).toBeLessThan(115);
    expect(elapsed).toBeGreaterThanOrEqual(85);

    // b and c should both be applying before either succeeds
    const b_apply = status_for(cap.events, 'gcp.storage.bucket:b', 'applying');
    const c_apply = status_for(cap.events, 'gcp.storage.bucket:c', 'applying');
    const b_done = status_for(cap.events, 'gcp.storage.bucket:b', 'succeeded');
    expect(b_apply).toBeDefined();
    expect(c_apply).toBeDefined();
    // c's `applying` should fire before b's `succeeded` — i.e. they overlap.
    expect(new Date(c_apply!.at).getTime()).toBeLessThan(new Date(b_done!.at).getTime() + 5);
  });

  // ─── 4. Failure isolates descendants (continue_on_error: true) ───
  it('cancels descendants on failure, leaves siblings alone', async () => {
    // Branch A: a → b. Branch B: c → d (independent).
    const resources = ['a', 'b', 'c', 'd'].map((n) => ({ name: n, type: 'gcp.storage.bucket' }));
    const graph = build_graph(resources, [
      ['a', 'b'],
      ['c', 'd'],
    ]);
    const { deployer } = make_mock_deployer({
      a: { delay_ms: 20, fail: true, error: 'boom' },
      b: { delay_ms: 20 },
      c: { delay_ms: 20 },
      d: { delay_ms: 20 },
    });
    const cap = capture_events();
    const results = await run_parallel_apply({
      changes: resources.map((r) => build_change(r.name, r.type)),
      phase: create_phase,
      graph,
      deployer,
      options: { provider: 'gcp', pool_size: 4, continue_on_error: true, ...cap.options },
    });

    expect(results).toHaveLength(4);
    const by_name = new Map(results.map((r) => [r.name, r] as const));
    expect(by_name.get('a')?.success).toBe(false);
    expect(by_name.get('b')?.success).toBe(false);
    expect(by_name.get('c')?.success).toBe(true);
    expect(by_name.get('d')?.success).toBe(true);

    expect(status_for(cap.events, 'gcp.storage.bucket:a', 'failed')).toBeDefined();
    expect(status_for(cap.events, 'gcp.storage.bucket:b', 'cancelled-due-to-dep')).toBeDefined();
    expect(status_for(cap.events, 'gcp.storage.bucket:c', 'succeeded')).toBeDefined();
    expect(status_for(cap.events, 'gcp.storage.bucket:d', 'succeeded')).toBeDefined();
  });

  // ─── 5. continue_on_error: false ─────────────────────────────────
  it('cancels every not-yet-applying node when continue_on_error: false', async () => {
    const resources = ['a', 'b', 'c', 'd'].map((n) => ({ name: n, type: 'gcp.storage.bucket' }));
    const graph = build_graph(resources, [
      ['a', 'b'],
      ['c', 'd'],
    ]);
    // a fails fast (20ms). c is slower (80ms) and is in flight when a
    // fails. d depends on c, so d hasn't dispatched yet when a fails →
    // d should be cancelled. b depends on a and is cancelled because
    // its dep failed.
    const { deployer } = make_mock_deployer({
      a: { delay_ms: 20, fail: true, error: 'boom' },
      c: { delay_ms: 80 },
      b: { delay_ms: 20 },
      d: { delay_ms: 20 },
    });
    const cap = capture_events();
    const results = await run_parallel_apply({
      changes: resources.map((r) => build_change(r.name, r.type)),
      phase: create_phase,
      graph,
      deployer,
      options: { provider: 'gcp', pool_size: 4, continue_on_error: false, ...cap.options },
    });

    expect(results).toHaveLength(4);
    const by_name = new Map(results.map((r) => [r.name, r] as const));
    expect(by_name.get('a')?.success).toBe(false);
    // b is a descendant of a — cancelled.
    expect(status_for(cap.events, 'gcp.storage.bucket:b', 'cancelled-due-to-dep')).toBeDefined();
    // c was already in flight when a failed → finishes naturally (succeeds).
    expect(by_name.get('c')?.success).toBe(true);
    // d wasn't yet applying when a failed → cancelled (continue_on_error: false
    // turns off all not-yet-dispatched work; d hadn't started because c was
    // still running).
    expect(status_for(cap.events, 'gcp.storage.bucket:d', 'cancelled-due-to-dep')).toBeDefined();
  });

  // ─── 6. Per-handler cap = 1 ──────────────────────────────────────
  it('respects per-handler cap of 1 for gcp.sql.*', async () => {
    const resources = [
      { name: 's1', type: 'gcp.sql.databaseInstance' },
      { name: 's2', type: 'gcp.sql.databaseInstance' },
      { name: 's3', type: 'gcp.sql.databaseInstance' },
    ];
    const graph = build_graph(resources, []);
    const { deployer, timings } = make_mock_deployer({
      s1: { delay_ms: 30 },
      s2: { delay_ms: 30 },
      s3: { delay_ms: 30 },
    });
    const cap = capture_events();
    const start = Date.now();
    await run_parallel_apply({
      changes: resources.map((r) => build_change(r.name, r.type)),
      phase: create_phase,
      graph,
      deployer,
      options: { provider: 'gcp', pool_size: 6, ...cap.options },
    });
    const elapsed = Date.now() - start;
    // Three 30ms SQL instances, cap = 1 → serial → ~90ms.
    expect(elapsed).toBeGreaterThanOrEqual(85);

    // Verify they were serial: each started AFTER the previous settled.
    const sorted = [...timings].sort((a, b) => (a.applying_at ?? 0) - (b.applying_at ?? 0));
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]!.applying_at!).toBeGreaterThanOrEqual(sorted[i - 1]!.settled_at! - 5);
    }
  });

  // ─── 7. Per-handler cap doesn't starve other handlers ────────────
  it('per-handler caps do not block other handlers', async () => {
    const resources = [
      { name: 'sql', type: 'gcp.sql.databaseInstance' },
      { name: 'b1', type: 'gcp.storage.bucket' },
      { name: 'b2', type: 'gcp.storage.bucket' },
      { name: 'b3', type: 'gcp.storage.bucket' },
    ];
    const graph = build_graph(resources, []);
    const { deployer } = make_mock_deployer({
      sql: { delay_ms: 100 },
      b1: { delay_ms: 30 },
      b2: { delay_ms: 30 },
      b3: { delay_ms: 30 },
    });
    const cap = capture_events();
    const start = Date.now();
    const results = await run_parallel_apply({
      changes: resources.map((r) => build_change(r.name, r.type)),
      phase: create_phase,
      graph,
      deployer,
      options: { provider: 'gcp', pool_size: 6, ...cap.options },
    });
    const elapsed = Date.now() - start;
    // SQL (100ms) and three buckets (30ms each, can run in parallel)
    // → ~100ms total. NOT 100 + 90 = 190ms.
    expect(elapsed).toBeLessThan(140);
    expect(results).toHaveLength(4);
    expect(results.every((r) => r.success)).toBe(true);
  });

  // ─── 8. Queued events ────────────────────────────────────────────
  it('emits a queued event for every node before any applying', async () => {
    const resources = ['a', 'b', 'c'].map((n) => ({ name: n, type: 'gcp.storage.bucket' }));
    const graph = build_graph(resources, []);
    const { deployer } = make_mock_deployer({});
    const cap = capture_events();
    await run_parallel_apply({
      changes: resources.map((r) => build_change(r.name, r.type)),
      phase: create_phase,
      graph,
      deployer,
      options: { provider: 'gcp', pool_size: 3, ...cap.options },
    });

    const queued_events = cap.events.status.filter((e) => e.status === 'queued');
    expect(queued_events).toHaveLength(3);

    // First 'applying' must come AFTER the last 'queued'.
    const last_queued_idx = cap.events.status.map((e) => e.status).lastIndexOf('queued');
    const first_applying_idx = cap.events.status.findIndex((e) => e.status === 'applying');
    expect(first_applying_idx).toBeGreaterThan(last_queued_idx);
  });

  // ─── 9. Cycle detection ──────────────────────────────────────────
  it('throws synchronously on a cycle', async () => {
    const resources = ['a', 'b'].map((n) => ({ name: n, type: 'gcp.storage.bucket' }));
    const graph = build_graph(resources, [
      ['a', 'b'],
      ['b', 'a'],
    ]);
    const { deployer } = make_mock_deployer({});
    await expect(
      run_parallel_apply({
        changes: resources.map((r) => build_change(r.name, r.type)),
        phase: create_phase,
        graph,
        deployer,
        options: { provider: 'gcp' },
      }),
    ).rejects.toThrow(/Cycle detected/);
  });

  // ─── 10. Empty input ─────────────────────────────────────────────
  it('returns [] for empty input and fires no callbacks', async () => {
    const graph = build_graph([], []);
    const { deployer } = make_mock_deployer({});
    const cap = capture_events();
    const results = await run_parallel_apply({
      changes: [],
      phase: create_phase,
      graph,
      deployer,
      options: { provider: 'gcp', ...cap.options },
    });
    expect(results).toEqual([]);
    expect(cap.events.status).toHaveLength(0);
    expect(cap.events.resource_results).toHaveLength(0);
  });

  // ─── 11. Single node ─────────────────────────────────────────────
  it('handles a single node end-to-end', async () => {
    const graph = build_graph([{ name: 'a', type: 'gcp.storage.bucket' }], []);
    const { deployer } = make_mock_deployer({ a: { delay_ms: 10 } });
    const cap = capture_events();
    const results = await run_parallel_apply({
      changes: [build_change('a', 'gcp.storage.bucket')],
      phase: create_phase,
      graph,
      deployer,
      options: { provider: 'gcp', ...cap.options },
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.success).toBe(true);
    const transitions = cap.events.status.filter((e) => e.node_id === 'gcp.storage.bucket:a').map((e) => e.status);
    expect(transitions).toEqual(['queued', 'applying', 'succeeded']);
  });

  // ─── 12. abort_signal ────────────────────────────────────────────
  it('cancels not-yet-applying nodes when aborted mid-flight', async () => {
    const resources = ['a', 'b', 'c', 'd'].map((n) => ({ name: n, type: 'gcp.storage.bucket' }));
    const graph = build_graph(resources, [
      ['a', 'b'],
      ['c', 'd'],
    ]);
    const { deployer } = make_mock_deployer({
      a: { delay_ms: 80 },
      c: { delay_ms: 80 },
      b: { delay_ms: 20 },
      d: { delay_ms: 20 },
    });
    const cap = capture_events();
    const ac = new AbortController();
    // Abort mid-flight (after dispatch, before settle).
    setTimeout(() => ac.abort(), 30);
    const results = await run_parallel_apply({
      changes: resources.map((r) => build_change(r.name, r.type)),
      phase: create_phase,
      graph,
      deployer,
      options: { provider: 'gcp', pool_size: 4, abort_signal: ac.signal, ...cap.options },
    });
    expect(results).toHaveLength(4);
    // a and c were already in flight when abort fired → they finish naturally.
    expect(status_for(cap.events, 'gcp.storage.bucket:a', 'succeeded')).toBeDefined();
    expect(status_for(cap.events, 'gcp.storage.bucket:c', 'succeeded')).toBeDefined();
    // b and d were not yet applying → cancelled.
    expect(status_for(cap.events, 'gcp.storage.bucket:b', 'cancelled-due-to-dep')).toBeDefined();
    expect(status_for(cap.events, 'gcp.storage.bucket:d', 'cancelled-due-to-dep')).toBeDefined();
  });

  // ─── 13. Milestone forwarding ────────────────────────────────────
  it('forwards on_step milestones to on_node_progress', async () => {
    const graph = build_graph([{ name: 'a', type: 'gcp.run.service' }], []);

    // Custom deployer that calls on_progress with `step` events.
    const captured_progress: NodeProgressEvent[] = [];
    let captured_on_progress: ((resource: string, action: string, status: string, extra?: any) => void) | undefined;
    const deployer: ProviderDeployer = {
      provider: 'gcp',
      initialize: async (opts) => {
        captured_on_progress = opts.on_progress;
      },
      cleanup: async () => {},
      create: async (type, name) => {
        // Simulate handler ctx.on_step → deployer.on_progress(name, 'create', 'step', { step }).
        captured_on_progress?.(name, 'create', 'step', { step: { label: 'foo', index: 1, total: 3 } });
        return {
          resource_id: `${type}:${name}`,
          name,
          type,
          action: 'create',
          success: true,
          duration_ms: 0,
        };
      },
      update: async () => ({ resource_id: '', name: '', type: '', action: 'update', success: true, duration_ms: 0 }),
      delete: async () => ({ resource_id: '', name: '', type: '', action: 'delete', success: true, duration_ms: 0 }),
    };

    // Wire it through deploy_changes to exercise the wrap_on_progress_for_node_progress
    // bridge AND through the scheduler's own dispatch.
    const { deploy_changes } = await import('../deploy-engine');
    await deployer.initialize({
      provider: 'gcp',
      on_node_progress: (e) => captured_progress.push(e),
    });
    // Use deploy_changes directly so the wrapper is installed.
    await deploy_changes(
      {
        success: true,
        changes: [build_change('a', 'gcp.run.service')],
        summary: { total_changes: 1, creates: 1, updates: 0, deletes: 0, no_changes: 0 },
        provider: 'gcp',
        generated_at: new Date().toISOString(),
        errors: [],
        warnings: [],
      },
      graph,
      deployer,
      { provider: 'gcp', on_node_progress: (e) => captured_progress.push(e) },
    );
    expect(captured_progress.length).toBeGreaterThanOrEqual(1);
    const step_event = captured_progress.find((e) => e.step.label === 'foo');
    expect(step_event).toBeDefined();
    expect(step_event!.node_id).toBe('gcp.run.service:a');
    expect(step_event!.resource_name).toBe('a');
    expect(step_event!.step.index).toBe(1);
    expect(step_event!.step.total).toBe(3);
  });

  // ─── 14. Bonus — pool_size respected ─────────────────────────────
  it('limits in-flight nodes to pool_size', async () => {
    const resources = Array.from({ length: 5 }, (_, i) => ({
      name: `n${i}`,
      type: 'gcp.storage.bucket',
    }));
    const graph = build_graph(resources, []);
    const { deployer } = make_mock_deployer(Object.fromEntries(resources.map((r) => [r.name, { delay_ms: 30 }])));
    const cap = capture_events();
    const start = Date.now();
    await run_parallel_apply({
      changes: resources.map((r) => build_change(r.name, r.type)),
      phase: create_phase,
      graph,
      deployer,
      options: { provider: 'gcp', pool_size: 2, ...cap.options },
    });
    const elapsed = Date.now() - start;
    // 5 nodes, 30ms each, pool 2 → 3 batches of 30ms ≈ 90ms.
    expect(elapsed).toBeGreaterThanOrEqual(80);
    expect(elapsed).toBeLessThan(140);
  });

  // ─── Manual reasoning trace #1 (brief validation #4) ─────────────
  it('diamond a→{b,c}→d with pool 4 finishes in ~3 layers, not 4', async () => {
    const resources = ['a', 'b', 'c', 'd'].map((n) => ({ name: n, type: 'gcp.storage.bucket' }));
    const graph = build_graph(resources, [
      ['a', 'b'],
      ['a', 'c'],
      ['b', 'd'],
      ['c', 'd'],
    ]);
    const { deployer } = make_mock_deployer({
      a: { delay_ms: 50 },
      b: { delay_ms: 50 },
      c: { delay_ms: 50 },
      d: { delay_ms: 50 },
    });
    const cap = capture_events();
    const start = Date.now();
    await run_parallel_apply({
      changes: resources.map((r) => build_change(r.name, r.type)),
      phase: create_phase,
      graph,
      deployer,
      options: { provider: 'gcp', pool_size: 4, ...cap.options },
    });
    const elapsed = Date.now() - start;
    // a (50) → {b, c} parallel (50) → d (50) ≈ 150ms total. NOT 200ms.
    expect(elapsed).toBeGreaterThanOrEqual(140);
    expect(elapsed).toBeLessThan(195);
  });

  // ─── Manual reasoning trace #2 (brief validation #4 fail path) ───
  it('diamond with a failing fast cancels b/c/d and finishes near a.fail time', async () => {
    const resources = ['a', 'b', 'c', 'd'].map((n) => ({ name: n, type: 'gcp.storage.bucket' }));
    const graph = build_graph(resources, [
      ['a', 'b'],
      ['a', 'c'],
      ['b', 'd'],
      ['c', 'd'],
    ]);
    const { deployer } = make_mock_deployer({
      a: { delay_ms: 25, fail: true, error: 'boom' },
      b: { delay_ms: 50 },
      c: { delay_ms: 50 },
      d: { delay_ms: 50 },
    });
    const cap = capture_events();
    const start = Date.now();
    const results = await run_parallel_apply({
      changes: resources.map((r) => build_change(r.name, r.type)),
      phase: create_phase,
      graph,
      deployer,
      options: { provider: 'gcp', pool_size: 4, continue_on_error: true, ...cap.options },
    });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50); // a fails at 25ms, descendants cancelled
    expect(results).toHaveLength(4);
    const by_name = new Map(results.map((r) => [r.name, r] as const));
    expect(by_name.get('a')?.success).toBe(false);
    // All descendants of a cancelled.
    expect(status_for(cap.events, 'gcp.storage.bucket:b', 'cancelled-due-to-dep')).toBeDefined();
    expect(status_for(cap.events, 'gcp.storage.bucket:c', 'cancelled-due-to-dep')).toBeDefined();
    expect(status_for(cap.events, 'gcp.storage.bucket:d', 'cancelled-due-to-dep')).toBeDefined();
  });

  // ─── 15. parallelism alias falls back when pool_size missing ─────
  it('falls back to deprecated `parallelism` when pool_size is omitted', async () => {
    const resources = ['a', 'b'].map((n) => ({ name: n, type: 'gcp.storage.bucket' }));
    const graph = build_graph(resources, []);
    const { deployer } = make_mock_deployer({
      a: { delay_ms: 30 },
      b: { delay_ms: 30 },
    });
    const cap = capture_events();
    const start = Date.now();
    await run_parallel_apply({
      changes: resources.map((r) => build_change(r.name, r.type)),
      phase: create_phase,
      graph,
      deployer,
      options: { provider: 'gcp', parallelism: 2, ...cap.options },
    });
    const elapsed = Date.now() - start;
    // Both should run in parallel under the deprecated `parallelism: 2`.
    expect(elapsed).toBeLessThan(60);
  });
});

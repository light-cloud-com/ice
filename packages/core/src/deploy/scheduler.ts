/**
 * ICE Parallel Change Scheduler
 *
 * Bounded worker-pool scheduler over the per-node DAG of one deploy phase
 * (creates, updates, or deletes). Replaces the historical sequential
 * `for...of` walk in `deploy_changes`.
 *
 * Behavior summary:
 *  - One phase end-to-end before the next starts (creates → updates →
 *    deletes). Mixing phases in one DAG would let an update schedule
 *    before its create finishes; out of scope for this refactor.
 *  - Per-node DAG built from the engine's `Graph` edge set, treating
 *    every edge as a hard ordering constraint (matches the existing
 *    `order_by_dependencies` behavior). Cycle detection is fail-loud.
 *  - `pool_size` global cap + per-handler-prefix caps. Longest-prefix
 *    match wins; defaults are: `gcp.sql. = 1`, `gcp.redis. = 1`. Other
 *    handlers default to `pool_size`.
 *  - Failure isolation:
 *      * `continue_on_error: true` (current default) — failed node
 *        cancels only its descendants; siblings keep going.
 *      * `continue_on_error: false` — first failure flips every
 *        not-yet-applying node to `cancelled-due-to-dep`. Already
 *        in-flight nodes finish naturally.
 *  - Cancellation via `abort_signal` — no new dispatches; in-flight
 *    nodes finish; remaining nodes flip to `cancelled-due-to-dep`.
 *
 * The scheduler does NOT change handler signatures. It bridges the
 * existing `GCPHandlerContext.on_step` milestone channel to the new
 * `on_node_progress` callback by wrapping the host-supplied
 * `on_progress` callback before the deployer is initialized.
 */

import { build_dag } from './scheduler/dag.js';
import {
  DEFAULT_PER_HANDLER_CAPS,
  DEFAULT_POOL_SIZE,
  type NodeRecord,
  type SchedulerPhase,
  type SchedulerRunInput,
} from './scheduler/types.js';
import type { ResourceChange } from '../diff/types.js';
import type { Graph } from '../types/graph.js';
import type {
  DeployOptions,
  NodeProgressEvent,
  NodeStatusEvent,
  NodeTerminalStatus,
  ProviderDeployer,
  ResourceDeployResult,
} from './types.js';

export { DEFAULT_PER_HANDLER_CAPS, DEFAULT_POOL_SIZE } from './scheduler/types.js';
export type { SchedulerPhase, SchedulerRunInput } from './scheduler/types.js';

/**
 * Run one phase of the parallel scheduler. Returns the per-node
 * `ResourceDeployResult[]` in completion order.
 */
export async function run_parallel_apply(input: SchedulerRunInput): Promise<ResourceDeployResult[]> {
  const scheduler = new ParallelChangeScheduler(input);
  return scheduler.run();
}

/**
 * Encapsulates one phase's worth of scheduling state. Exported for
 * testability — production callers should prefer `run_parallel_apply`.
 */
export class ParallelChangeScheduler {
  private readonly changes: ResourceChange[];
  private readonly phase: SchedulerPhase;
  private readonly graph: Graph;
  private readonly deployer: ProviderDeployer;
  private readonly options: DeployOptions;

  private readonly pool_size: number;
  private readonly per_handler_caps: Record<string, number>;
  private readonly handler_cap_prefixes: string[];

  private readonly records: Map<string, NodeRecord>;
  private readonly results: ResourceDeployResult[] = [];
  private readonly in_flight = new Set<string>();
  private readonly handler_in_flight = new Map<string, number>();

  /** Resolves when at least one in-flight node has settled. */
  private settle_waker?: { promise: Promise<void>; resolve: () => void };

  /** True after first failure when `continue_on_error: false`. */
  private hard_failed = false;
  /** True after `abort_signal` fires (we observe but don't abort handlers). */
  private aborted = false;

  constructor(input: SchedulerRunInput) {
    this.changes = input.changes;
    this.phase = input.phase;
    this.graph = input.graph;
    this.deployer = input.deployer;
    this.options = input.options;

    // pool_size resolution: explicit pool_size wins; fall back to the
    // legacy `parallelism` for one revision; finally default to 6.
    this.pool_size = input.options.pool_size ?? input.options.parallelism ?? DEFAULT_POOL_SIZE;

    this.per_handler_caps = {
      ...DEFAULT_PER_HANDLER_CAPS,
      ...(input.options.per_handler_caps ?? {}),
    };
    // Longer prefixes first so `gcp.sql.instance` beats `gcp.sql.` when
    // the user has overridden a sub-tree.
    this.handler_cap_prefixes = Object.keys(this.per_handler_caps).sort((a, b) => b.length - a.length);

    this.records = build_dag(this.changes, this.phase, this.graph);
  }

  /**
   * Main schedule loop. Returns the accumulated results in completion
   * (insertion) order.
   */
  async run(): Promise<ResourceDeployResult[]> {
    if (this.records.size === 0) return [];

    // Pre-emit `queued` for every node so the host (pdl-4) can bulk-init
    // `nodesById` before any `applying` arrives.
    for (const rec of this.records.values()) {
      this.emit_status(rec, 'queued');
    }

    // Wire abort_signal observation. Once aborted, we stop scheduling
    // new work; in-flight handlers see the same signal via their
    // existing `GCPHandlerContext.abort_signal` plumbing and may finish
    // naturally or short-circuit.
    const signal = this.options.abort_signal;
    const on_abort = () => {
      this.aborted = true;
      this.wake();
    };
    if (signal) {
      if (signal.aborted) this.aborted = true;
      else signal.addEventListener('abort', on_abort, { once: true });
    }

    try {
      while (this.is_unfinished()) {
        // Cancel all not-yet-applying nodes when aborted or hard-failed
        // (continue_on_error: false). In-flight nodes are left alone —
        // handlers' existing abort_signal plumbing handles graceful
        // cancellation.
        if (this.aborted || this.hard_failed) {
          this.cancel_remaining_not_in_flight();
        }

        const ready = this.collect_ready();
        for (const id of ready) this.dispatch(id);

        if (this.in_flight.size === 0) {
          // No one in flight and nothing newly ready — done. The
          // is_unfinished check above will exit on next iteration.
          if (ready.length === 0) break;
          continue;
        }

        // Wait for any in-flight to settle before re-evaluating ready.
        await this.wait_for_settle();
      }
    } finally {
      if (signal) signal.removeEventListener('abort', on_abort);
    }

    return this.results;
  }

  /** Has every node either succeeded, failed, skipped, or been cancelled? */
  private is_unfinished(): boolean {
    for (const rec of this.records.values()) {
      if (!rec.terminal) return true;
    }
    return false;
  }

  /**
   * Find all nodes whose deps are satisfied AND a slot is available
   * AND we're allowed to dispatch (not aborted/hard-failed/already in
   * flight). Order is insertion order over `records` (Map iteration).
   *
   * Reservations are tracked locally inside this loop so that the
   * second SQL node can't slip past the per-handler cap before the
   * first one's dispatch landed: we count both `in_flight` and a
   * within-loop reservation map.
   */
  private collect_ready(): string[] {
    if (this.aborted || this.hard_failed) return [];
    const ready: string[] = [];
    let pool_reserved = 0;
    const handler_reserved = new Map<string, number>();
    for (const [id, rec] of this.records) {
      if (rec.terminal) continue;
      if (this.in_flight.has(id)) continue;
      if (!this.deps_satisfied(rec)) continue;
      // Pool cap (combine in-flight with already-reserved-this-tick).
      if (this.in_flight.size + pool_reserved >= this.pool_size) break;
      // Per-handler cap (same combination).
      const prefix = this.match_handler_prefix(rec.change.type);
      if (prefix !== null) {
        const cap = this.per_handler_caps[prefix] ?? this.pool_size;
        const used = (this.handler_in_flight.get(prefix) ?? 0) + (handler_reserved.get(prefix) ?? 0);
        if (used >= cap) continue;
      }
      ready.push(id);
      pool_reserved++;
      if (prefix !== null) {
        handler_reserved.set(prefix, (handler_reserved.get(prefix) ?? 0) + 1);
      }
    }
    return ready;
  }

  /** All deps must be in `succeeded` state. */
  private deps_satisfied(rec: NodeRecord): boolean {
    for (const dep_id of rec.deps) {
      const dep_rec = this.records.get(dep_id);
      if (!dep_rec || dep_rec.terminal !== 'succeeded') return false;
    }
    return true;
  }

  private match_handler_prefix(resource_type: string): string | null {
    for (const prefix of this.handler_cap_prefixes) {
      if (resource_type.startsWith(prefix)) return prefix;
    }
    return null;
  }

  /**
   * Begin applying a node. Marks `in_flight`, emits `applying`, then
   * fires off the async handler call. The handler's resolution drives
   * the settle wake.
   */
  private dispatch(node_id: string): void {
    const rec = this.records.get(node_id);
    if (!rec) return;
    if (rec.terminal) return;

    this.in_flight.add(node_id);
    const prefix = this.match_handler_prefix(rec.change.type);
    if (prefix !== null) {
      this.handler_in_flight.set(prefix, (this.handler_in_flight.get(prefix) ?? 0) + 1);
    }

    rec.applying_at = Date.now();
    this.emit_status(rec, 'applying');
    // Legacy on_progress bridge — keeps the deploy.service.ts:757-821
    // 'running' tracker working without changes to the service layer.
    try {
      this.options.on_progress?.(rec.change.name, this.phase, 'running');
    } catch {
      // Host callback bugs must not break the deploy.
    }

    // Kick off async — settle is wired in the .then handler.
    this.invoke_handler(rec)
      .then((result) => this.on_settled(rec, result, undefined))
      .catch((err) => this.on_settled(rec, undefined, err));
  }

  /**
   * Translate a `ResourceChange` into the right `ProviderDeployer`
   * call. Mirrors the legacy engine's call shape exactly so handler
   * behavior is unchanged.
   *
   * Note on milestone forwarding: the existing path is
   * `handler → ctx.on_step → deployer.on_progress(resource, 'create',
   * 'step', { step })`. The scheduler bridges this in
   * `deploy-engine.ts` by wrapping `options.on_progress` before
   * `deployer.initialize` runs — so by the time we land here, sub-step
   * events flow through the wrapper and reach `on_node_progress`. We
   * don't intercept inside the scheduler dispatch path itself.
   */
  private invoke_handler(rec: NodeRecord): Promise<ResourceDeployResult> {
    const change = rec.change;
    const node = this.lookup_node(change);
    const dispatch_options: Record<string, unknown> = node ? { node } : {};

    if (this.options.dry_run) {
      const action = this.phase;
      const result: ResourceDeployResult = {
        resource_id: change.id,
        name: change.name,
        type: change.type,
        action,
        success: true,
        duration_ms: 0,
      };
      return Promise.resolve(result);
    }

    if (this.phase === 'create') {
      return this.deployer.create(change.type, change.name, change.desired_properties || {}, dispatch_options);
    }
    if (this.phase === 'update') {
      return this.deployer.update(
        change.type,
        change.name,
        change.provider_id || '',
        change.desired_properties || {},
        change.current_properties || {},
        dispatch_options,
      );
    }
    return this.deployer.delete(change.type, change.name, change.provider_id || '', dispatch_options);
  }

  /** Find the engine graph node for a change, by name. */
  private lookup_node(change: ResourceChange): unknown {
    for (const node of this.graph.nodes.values()) {
      if (node.name === change.name) return node;
    }
    return undefined;
  }

  /**
   * Handler resolution — convert the result/error into a terminal
   * state, emit events, decrement bookkeeping, and wake the loop.
   */
  private on_settled(rec: NodeRecord, result: ResourceDeployResult | undefined, err: unknown): void {
    this.in_flight.delete(rec.change.id);
    const prefix = this.match_handler_prefix(rec.change.type);
    if (prefix !== null) {
      const used = (this.handler_in_flight.get(prefix) ?? 1) - 1;
      if (used <= 0) this.handler_in_flight.delete(prefix);
      else this.handler_in_flight.set(prefix, used);
    }

    let final_result: ResourceDeployResult;
    if (result) {
      final_result = result;
    } else {
      const message = err instanceof Error ? err.message : String(err);
      final_result = {
        resource_id: rec.change.id,
        name: rec.change.name,
        type: rec.change.type,
        action: this.phase,
        success: false,
        error: message,
        duration_ms: rec.applying_at ? Date.now() - rec.applying_at : 0,
      };
    }

    this.results.push(final_result);
    try {
      this.options.on_resource_result?.(final_result);
    } catch {
      // Host callback bugs must not break the schedule loop.
    }

    // Legacy on_progress bridge — re-emit a `completed`/`failed` event
    // with the historical extra payload so deploy.service.ts can
    // surface outputs/URLs/provider_ids without changes.
    try {
      this.options.on_progress?.(
        final_result.name,
        final_result.action === 'skip' ? this.phase : final_result.action,
        final_result.success ? 'completed' : 'failed',
        {
          outputs: final_result.outputs,
          error: final_result.success ? undefined : final_result.error,
          provider_id: final_result.provider_id,
        },
      );
    } catch {
      // Host callback bugs must not break the schedule loop.
    }

    const succeeded = final_result.success !== false;
    if (succeeded) {
      this.set_terminal(rec, 'succeeded', undefined);
    } else {
      this.set_terminal(rec, 'failed', {
        code: this.error_code_for(this.phase),
        message: final_result.error || 'unknown error',
        recoverable: this.phase !== 'create',
      });

      // Cancel descendants. With continue_on_error: true (default),
      // only descendants of THIS node are cancelled — siblings keep
      // running. With continue_on_error: false, the next loop tick
      // flips every other not-yet-applying node to cancelled.
      this.cancel_descendants(rec);
      if (this.options.continue_on_error === false) this.hard_failed = true;
    }

    this.wake();
  }

  /**
   * Mark a node as terminal, fire `on_node_status`, return without
   * any further state mutation.
   */
  private set_terminal(rec: NodeRecord, status: NodeTerminalStatus, error?: NodeStatusEvent['error']): void {
    if (rec.terminal) return;
    rec.terminal = status;
    this.emit_status(rec, status, error);
  }

  /**
   * Recursively flip all transitive dependents of `rec` to
   * `cancelled-due-to-dep`. In-flight descendants are left alone (they
   * finish naturally and emit their own terminal status).
   */
  private cancel_descendants(rec: NodeRecord): void {
    const queue: string[] = Array.from(rec.dependents);
    while (queue.length > 0) {
      const id = queue.shift()!;
      const dependent = this.records.get(id);
      if (!dependent) continue;
      if (dependent.terminal) continue;
      if (this.in_flight.has(id)) continue;
      this.set_terminal(dependent, 'cancelled-due-to-dep');
      // Also push synthetic results so the caller sees them in the
      // returned array — matches the shape callers built before.
      this.push_cancelled_result(dependent);
      for (const sub of dependent.dependents) queue.push(sub);
    }
  }

  /**
   * On hard-fail or abort, flip every not-yet-applying node to
   * `cancelled-due-to-dep`.
   */
  private cancel_remaining_not_in_flight(): void {
    for (const [id, rec] of this.records) {
      if (rec.terminal) continue;
      if (this.in_flight.has(id)) continue;
      this.set_terminal(rec, 'cancelled-due-to-dep');
      this.push_cancelled_result(rec);
    }
  }

  /**
   * Synthesize a `ResourceDeployResult` for a cancelled node so the
   * caller's downstream summary stays accurate.
   */
  private push_cancelled_result(rec: NodeRecord): void {
    const result: ResourceDeployResult = {
      resource_id: rec.change.id,
      name: rec.change.name,
      type: rec.change.type,
      action: this.phase,
      success: false,
      error: 'cancelled — dependency failed or deploy aborted',
      duration_ms: 0,
    };
    this.results.push(result);
    this.options.on_resource_result?.(result);
  }

  private error_code_for(phase: SchedulerPhase): string {
    if (phase === 'create') return 'CREATE_FAILED';
    if (phase === 'update') return 'UPDATE_FAILED';
    return 'DELETE_FAILED';
  }

  /**
   * Emit one `on_node_status` event. Intentionally tolerant — a
   * thrown handler must not abort the scheduler loop.
   */
  private emit_status(rec: NodeRecord, status: NodeStatusEvent['status'], error?: NodeStatusEvent['error']): void {
    if (status === 'queued' && rec.queued_emitted) return;
    if (status === 'queued') rec.queued_emitted = true;

    const cb = this.options.on_node_status;
    if (!cb) return;
    const event: NodeStatusEvent = {
      node_id: rec.change.id,
      resource_name: rec.change.name,
      resource_type: rec.change.type,
      action: this.phase,
      status,
      at: new Date().toISOString(),
    };
    if (error) event.error = error;
    if (status !== 'queued' && status !== 'applying' && rec.applying_at) {
      event.duration_ms = Date.now() - rec.applying_at;
    }
    try {
      cb(event);
    } catch {
      // Host callback bugs must not break the schedule loop.
    }
  }

  /**
   * Wait for at least one in-flight node to settle. Implemented as a
   * one-shot promise that the resolution paths complete.
   */
  private wait_for_settle(): Promise<void> {
    if (!this.settle_waker) {
      let resolve!: () => void;
      const promise = new Promise<void>((r) => (resolve = r));
      this.settle_waker = { promise, resolve };
    }
    return this.settle_waker.promise;
  }

  /** Wake any current `wait_for_settle` waiters. */
  private wake(): void {
    if (this.settle_waker) {
      const { resolve } = this.settle_waker;
      this.settle_waker = undefined;
      resolve();
    }
  }
}

/**
 * Wrap the host-supplied `on_progress` callback so that handler-level
 * `on_step` milestones (which arrive as `on_progress(resource, action,
 * 'step', { step })` from the GCPDeployer's step bridge) are forwarded
 * to the new `on_node_progress` channel. Pass-through for every other
 * status so existing service-layer behavior is preserved.
 *
 * The mapping `resource_name → node_id` is built from the changes
 * passed to the scheduler so the new channel carries the stable graph
 * id alongside the resource name.
 */
export function wrap_on_progress_for_node_progress(
  options: DeployOptions,
  changes_by_resource_name: Map<string, ResourceChange>,
): DeployOptions {
  const original_progress = options.on_progress;
  const node_progress = options.on_node_progress;
  if (!node_progress && !original_progress) return options;

  const wrapped: DeployOptions = {
    ...options,
    on_progress: (resource, action, status, extra) => {
      // Forward step events to the new channel (in addition to
      // delegating to the original callback for back-compat).
      if (status === 'step' && extra?.step && node_progress) {
        const change = changes_by_resource_name.get(resource);
        if (change) {
          try {
            node_progress({
              node_id: change.id,
              resource_name: change.name,
              step: extra.step,
              at: new Date().toISOString(),
            });
          } catch {
            // Host callback bugs must not break the deploy.
          }
        }
      }
      original_progress?.(resource, action, status, extra);
    },
  };
  return wrapped;
}

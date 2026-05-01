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
  cancel_remaining_not_in_flight,
  dispatch,
  emit_status,
  wait_for_settle,
  wake,
} from './scheduler/dispatch.js';
import { collect_ready, is_unfinished } from './scheduler/predicates.js';
import {
  DEFAULT_PER_HANDLER_CAPS,
  DEFAULT_POOL_SIZE,
  type SchedulerContext,
  type SchedulerRunInput,
} from './scheduler/types.js';
import type { ResourceDeployResult } from './types.js';

export { DEFAULT_PER_HANDLER_CAPS, DEFAULT_POOL_SIZE } from './scheduler/types.js';
export type { SchedulerPhase, SchedulerRunInput } from './scheduler/types.js';
export { wrap_on_progress_for_node_progress } from './scheduler/progress-wrapper.js';

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
 *
 * Implementation: every method body delegates to a standalone helper
 * in `./scheduler/<module>.ts`. The class is a thin shell that owns
 * the `ctx: SchedulerContext` mutable handle. Mirrors the rf-sqlite
 * decomposition (`SqliteStateStore` + `SqliteContext`).
 */
export class ParallelChangeScheduler {
  private readonly ctx: SchedulerContext;

  constructor(input: SchedulerRunInput) {
    // pool_size resolution: explicit pool_size wins; fall back to the
    // legacy `parallelism` for one revision; finally default to 6.
    const pool_size = input.options.pool_size ?? input.options.parallelism ?? DEFAULT_POOL_SIZE;

    const per_handler_caps: Record<string, number> = {
      ...DEFAULT_PER_HANDLER_CAPS,
      ...(input.options.per_handler_caps ?? {}),
    };
    // Longer prefixes first so `gcp.sql.instance` beats `gcp.sql.` when
    // the user has overridden a sub-tree.
    const handler_cap_prefixes = Object.keys(per_handler_caps).sort((a, b) => b.length - a.length);

    this.ctx = {
      changes: input.changes,
      phase: input.phase,
      graph: input.graph,
      deployer: input.deployer,
      options: input.options,
      pool_size,
      per_handler_caps,
      handler_cap_prefixes,
      records: build_dag(input.changes, input.phase, input.graph),
      results: [],
      in_flight: new Set(),
      handler_in_flight: new Map(),
      hard_failed: false,
      aborted: false,
    };
  }

  /**
   * Main schedule loop. Returns the accumulated results in completion
   * (insertion) order.
   */
  async run(): Promise<ResourceDeployResult[]> {
    const { ctx } = this;
    if (ctx.records.size === 0) return [];

    // Pre-emit `queued` for every node so the host (pdl-4) can bulk-init
    // `nodesById` before any `applying` arrives.
    for (const rec of ctx.records.values()) {
      emit_status(ctx, rec, 'queued');
    }

    // Wire abort_signal observation. Once aborted, we stop scheduling
    // new work; in-flight handlers see the same signal via their
    // existing `GCPHandlerContext.abort_signal` plumbing and may finish
    // naturally or short-circuit.
    const signal = ctx.options.abort_signal;
    const on_abort = () => {
      ctx.aborted = true;
      wake(ctx);
    };
    if (signal) {
      if (signal.aborted) ctx.aborted = true;
      else signal.addEventListener('abort', on_abort, { once: true });
    }

    try {
      while (is_unfinished(ctx)) {
        // Cancel all not-yet-applying nodes when aborted or hard-failed
        // (continue_on_error: false). In-flight nodes are left alone —
        // handlers' existing abort_signal plumbing handles graceful
        // cancellation.
        if (ctx.aborted || ctx.hard_failed) {
          cancel_remaining_not_in_flight(ctx);
        }

        const ready = collect_ready(ctx);
        for (const id of ready) dispatch(ctx, id);

        if (ctx.in_flight.size === 0) {
          // No one in flight and nothing newly ready — done. The
          // is_unfinished check above will exit on next iteration.
          if (ready.length === 0) break;
          continue;
        }

        // Wait for any in-flight to settle before re-evaluating ready.
        await wait_for_settle(ctx);
      }
    } finally {
      if (signal) signal.removeEventListener('abort', on_abort);
    }

    return ctx.results;
  }
}


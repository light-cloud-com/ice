/**
 * Parallel deploy scheduler — per-task dispatch + resolution
 * (rf-sched-4).
 *
 * Standalone helpers for the lifecycle of one node:
 *  - `dispatch` — mark in-flight, fire `applying` + legacy `running`,
 *    kick off the async handler call.
 *  - `invoke_handler` — translate `ResourceChange` into the right
 *    `ProviderDeployer.create/update/delete` call (or a synthetic
 *    `dry_run` result).
 *  - `lookup_node` — find the engine graph node for a change, by name.
 *  - `on_settled` — handler-resolution path: convert result/error into
 *    a terminal state, emit events, decrement bookkeeping, wake the
 *    schedule loop.
 *  - `set_terminal` — mark a node terminal + emit `succeeded`/`failed`/
 *    `cancelled-due-to-dep` event.
 *  - `cancel_descendants` — flip transitive dependents to
 *    `cancelled-due-to-dep` (used by per-node failure isolation).
 *  - `cancel_remaining_not_in_flight` — flip every not-yet-applying
 *    node (used by hard-fail / abort).
 *  - `push_cancelled_result` — synthesize a `ResourceDeployResult`
 *    for a cancelled node and append to `ctx.results`.
 *  - `error_code_for` — phase → DEPLOY_ERROR_CODES key.
 *  - `emit_status` — fire one `on_node_status` event with the right
 *    payload (duration_ms only after `applying`, queued dedup).
 *  - `wait_for_settle` / `wake` — one-shot promise pair the schedule
 *    loop awaits.
 *
 * All helpers take `ctx: SchedulerContext` as their first argument
 * and mutate `ctx.records[*].terminal`, `ctx.in_flight`,
 * `ctx.handler_in_flight`, `ctx.results`, `ctx.hard_failed`, and
 * `ctx.settle_waker`. The orchestrator (rf-sched-6) keeps a 1-line
 * delegate per method so external callers see no surface change.
 *
 * Pre-extraction location: `ParallelChangeScheduler` private methods
 * L237-465 (one continuous span; lifted verbatim with `this.x` →
 * `ctx.x`).
 */

import { match_handler_prefix } from './predicates';
import type { ResourceChange } from '../../diff/types';
import type { NodeStatusEvent, NodeTerminalStatus, ResourceDeployResult } from '../types';
import type { NodeRecord, SchedulerContext, SchedulerPhase } from './types';

/**
 * Begin applying a node. Marks `in_flight`, emits `applying`, then
 * fires off the async handler call. The handler's resolution drives
 * the settle wake.
 */
export function dispatch(ctx: SchedulerContext, node_id: string): void {
  const rec = ctx.records.get(node_id);
  if (!rec) return;
  if (rec.terminal) return;

  ctx.in_flight.add(node_id);
  const prefix = match_handler_prefix(ctx, rec.change.type);
  if (prefix !== null) {
    ctx.handler_in_flight.set(prefix, (ctx.handler_in_flight.get(prefix) ?? 0) + 1);
  }

  rec.applying_at = Date.now();
  emit_status(ctx, rec, 'applying');
  // Legacy on_progress bridge — keeps the deploy.service.ts:757-821
  // 'running' tracker working without changes to the service layer.
  try {
    ctx.options.on_progress?.(rec.change.name, ctx.phase, 'running');
  } catch {
    // Host callback bugs must not break the deploy.
  }

  // Kick off async — settle is wired in the .then handler.
  invoke_handler(ctx, rec)
    .then((result) => on_settled(ctx, rec, result, undefined))
    .catch((err) => on_settled(ctx, rec, undefined, err));
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
export function invoke_handler(ctx: SchedulerContext, rec: NodeRecord): Promise<ResourceDeployResult> {
  const change = rec.change;
  const node = lookup_node(ctx, change);
  const dispatch_options: Record<string, unknown> = node ? { node } : {};

  if (ctx.options.dry_run) {
    const action = ctx.phase;
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

  if (ctx.phase === 'create') {
    return ctx.deployer.create(change.type, change.name, change.desired_properties || {}, dispatch_options);
  }
  if (ctx.phase === 'update') {
    return ctx.deployer.update(
      change.type,
      change.name,
      change.provider_id || '',
      change.desired_properties || {},
      change.current_properties || {},
      dispatch_options,
    );
  }
  return ctx.deployer.delete(change.type, change.name, change.provider_id || '', dispatch_options);
}

/** Find the engine graph node for a change, by name. */
export function lookup_node(ctx: SchedulerContext, change: ResourceChange): unknown {
  for (const node of ctx.graph.nodes.values()) {
    if (node.name === change.name) return node;
  }
  return undefined;
}

/**
 * Handler resolution — convert the result/error into a terminal
 * state, emit events, decrement bookkeeping, and wake the loop.
 */
export function on_settled(
  ctx: SchedulerContext,
  rec: NodeRecord,
  result: ResourceDeployResult | undefined,
  err: unknown,
): void {
  ctx.in_flight.delete(rec.change.id);
  const prefix = match_handler_prefix(ctx, rec.change.type);
  if (prefix !== null) {
    const used = (ctx.handler_in_flight.get(prefix) ?? 1) - 1;
    if (used <= 0) ctx.handler_in_flight.delete(prefix);
    else ctx.handler_in_flight.set(prefix, used);
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
      action: ctx.phase,
      success: false,
      error: message,
      duration_ms: rec.applying_at ? Date.now() - rec.applying_at : 0,
    };
  }

  ctx.results.push(final_result);
  try {
    ctx.options.on_resource_result?.(final_result);
  } catch {
    // Host callback bugs must not break the schedule loop.
  }

  // Legacy on_progress bridge — re-emit a `completed`/`failed` event
  // with the historical extra payload so deploy.service.ts can
  // surface outputs/URLs/provider_ids without changes.
  try {
    ctx.options.on_progress?.(
      final_result.name,
      final_result.action === 'skip' ? ctx.phase : final_result.action,
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
    set_terminal(ctx, rec, 'succeeded', undefined);
  } else {
    set_terminal(ctx, rec, 'failed', {
      code: error_code_for(ctx.phase),
      message: final_result.error || 'unknown error',
      recoverable: ctx.phase !== 'create',
    });

    // Cancel descendants. With continue_on_error: true (default),
    // only descendants of THIS node are cancelled — siblings keep
    // running. With continue_on_error: false, the next loop tick
    // flips every other not-yet-applying node to cancelled.
    cancel_descendants(ctx, rec);
    if (ctx.options.continue_on_error === false) ctx.hard_failed = true;
  }

  wake(ctx);
}

/**
 * Mark a node as terminal, fire `on_node_status`, return without
 * any further state mutation.
 */
export function set_terminal(
  ctx: SchedulerContext,
  rec: NodeRecord,
  status: NodeTerminalStatus,
  error?: NodeStatusEvent['error'],
): void {
  if (rec.terminal) return;
  rec.terminal = status;
  emit_status(ctx, rec, status, error);
}

/**
 * Recursively flip all transitive dependents of `rec` to
 * `cancelled-due-to-dep`. In-flight descendants are left alone (they
 * finish naturally and emit their own terminal status).
 */
export function cancel_descendants(ctx: SchedulerContext, rec: NodeRecord): void {
  const queue: string[] = Array.from(rec.dependents);
  while (queue.length > 0) {
    const id = queue.shift()!;
    const dependent = ctx.records.get(id);
    if (!dependent) continue;
    if (dependent.terminal) continue;
    if (ctx.in_flight.has(id)) continue;
    set_terminal(ctx, dependent, 'cancelled-due-to-dep');
    // Also push synthetic results so the caller sees them in the
    // returned array — matches the shape callers built before.
    push_cancelled_result(ctx, dependent);
    for (const sub of dependent.dependents) queue.push(sub);
  }
}

/**
 * On hard-fail or abort, flip every not-yet-applying node to
 * `cancelled-due-to-dep`.
 */
export function cancel_remaining_not_in_flight(ctx: SchedulerContext): void {
  for (const [id, rec] of ctx.records) {
    if (rec.terminal) continue;
    if (ctx.in_flight.has(id)) continue;
    set_terminal(ctx, rec, 'cancelled-due-to-dep');
    push_cancelled_result(ctx, rec);
  }
}

/**
 * Synthesize a `ResourceDeployResult` for a cancelled node so the
 * caller's downstream summary stays accurate.
 */
export function push_cancelled_result(ctx: SchedulerContext, rec: NodeRecord): void {
  const result: ResourceDeployResult = {
    resource_id: rec.change.id,
    name: rec.change.name,
    type: rec.change.type,
    action: ctx.phase,
    success: false,
    error: 'cancelled — dependency failed or deploy aborted',
    duration_ms: 0,
  };
  ctx.results.push(result);
  ctx.options.on_resource_result?.(result);
}

/** Phase → `DEPLOY_ERROR_CODES` key (string literal preserved verbatim). */
export function error_code_for(phase: SchedulerPhase): string {
  if (phase === 'create') return 'CREATE_FAILED';
  if (phase === 'update') return 'UPDATE_FAILED';
  return 'DELETE_FAILED';
}

/**
 * Emit one `on_node_status` event. Intentionally tolerant — a
 * thrown handler must not abort the scheduler loop.
 *
 * Dedups `queued` so it fires at most once per node (the schedule
 * loop calls it eagerly for every record at the start of `run()`).
 * `duration_ms` is only attached on terminal events that landed
 * AFTER `applying` set `rec.applying_at` — `queued` itself never
 * carries duration.
 */
export function emit_status(
  ctx: SchedulerContext,
  rec: NodeRecord,
  status: NodeStatusEvent['status'],
  error?: NodeStatusEvent['error'],
): void {
  if (status === 'queued' && rec.queued_emitted) return;
  if (status === 'queued') rec.queued_emitted = true;

  const cb = ctx.options.on_node_status;
  if (!cb) return;
  const event: NodeStatusEvent = {
    node_id: rec.change.id,
    resource_name: rec.change.name,
    resource_type: rec.change.type,
    action: ctx.phase,
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
export function wait_for_settle(ctx: SchedulerContext): Promise<void> {
  if (!ctx.settle_waker) {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => (resolve = r));
    ctx.settle_waker = { promise, resolve };
  }
  return ctx.settle_waker.promise;
}

/** Wake any current `wait_for_settle` waiters. */
export function wake(ctx: SchedulerContext): void {
  if (ctx.settle_waker) {
    const { resolve } = ctx.settle_waker;
    ctx.settle_waker = undefined;
    resolve();
  }
}

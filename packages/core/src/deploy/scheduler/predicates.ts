/**
 * Parallel deploy scheduler — scheduling predicates (rf-sched-3).
 *
 * Pure read-only helpers over `SchedulerContext`. None of these
 * functions mutate state — they answer "is this node done?" /
 * "can this node be dispatched?" / "what's ready right now?" by
 * reading `records`, `in_flight`, `handler_in_flight`, and the
 * configuration fields (`pool_size`, `per_handler_caps`,
 * `handler_cap_prefixes`, `aborted`, `hard_failed`).
 *
 * Extracted from `ParallelChangeScheduler` (pre-extraction):
 *  - `is_unfinished()` — L309-314
 *  - `collect_ready()` — L326-351
 *  - `deps_satisfied(rec)` — L354-360
 *  - `match_handler_prefix(type)` — L362-367
 *
 * These four lift cleanly because they only READ context state, never
 * write. The orchestrator (rf-sched-6) keeps a 1-line delegate per
 * method and the loop in `run()` calls the standalone functions
 * directly.
 */

import type { NodeRecord, SchedulerContext } from './types';

/** Has every node either succeeded, failed, skipped, or been cancelled? */
export function is_unfinished(ctx: SchedulerContext): boolean {
  for (const rec of ctx.records.values()) {
    if (!rec.terminal) return true;
  }
  return false;
}

/** All deps must be in `succeeded` state. */
export function deps_satisfied(ctx: SchedulerContext, rec: NodeRecord): boolean {
  for (const dep_id of rec.deps) {
    const dep_rec = ctx.records.get(dep_id);
    if (!dep_rec || dep_rec.terminal !== 'succeeded') return false;
  }
  return true;
}

/**
 * Longest-prefix match against the configured per-handler caps. Returns
 * the matched prefix (key into `per_handler_caps`) or null if none of
 * the configured prefixes is a prefix of `resource_type`.
 */
export function match_handler_prefix(ctx: SchedulerContext, resource_type: string): string | null {
  for (const prefix of ctx.handler_cap_prefixes) {
    if (resource_type.startsWith(prefix)) return prefix;
  }
  return null;
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
export function collect_ready(ctx: SchedulerContext): string[] {
  if (ctx.aborted || ctx.hard_failed) return [];
  const ready: string[] = [];
  let pool_reserved = 0;
  const handler_reserved = new Map<string, number>();
  for (const [id, rec] of ctx.records) {
    if (rec.terminal) continue;
    if (ctx.in_flight.has(id)) continue;
    if (!deps_satisfied(ctx, rec)) continue;
    // Pool cap (combine in-flight with already-reserved-this-tick).
    if (ctx.in_flight.size + pool_reserved >= ctx.pool_size) break;
    // Per-handler cap (same combination).
    const prefix = match_handler_prefix(ctx, rec.change.type);
    if (prefix !== null) {
      const cap = ctx.per_handler_caps[prefix] ?? ctx.pool_size;
      const used = (ctx.handler_in_flight.get(prefix) ?? 0) + (handler_reserved.get(prefix) ?? 0);
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

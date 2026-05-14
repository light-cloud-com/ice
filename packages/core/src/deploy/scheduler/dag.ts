/**
 * Parallel deploy scheduler — DAG construction (rf-sched-2).
 *
 * Pure helpers for building the per-node DAG from the engine `Graph` +
 * the per-phase `ResourceChange[]`, plus fail-loud cycle detection.
 *
 * Extracted from `ParallelChangeScheduler.build_dag()` and
 * `assert_no_cycle()` (pre-extraction L167-249). No semantic change —
 * the original methods only read `this.changes`, `this.phase`,
 * `this.graph` and never wrote to instance state, so they lift cleanly
 * to standalone functions that take their inputs as arguments.
 *
 * Cycle detection (`assert_no_cycle`) is fail-loud and uses the same
 * error message text as the legacy `order_by_dependencies` so users see
 * consistent text from both schedulers.
 */

import type { Graph } from '../../types/graph';
import type { ResourceChange } from '../../diff/types';
import type { NodeRecord, SchedulerPhase } from './types';

/**
 * Build the per-node DAG from the input changes and engine graph.
 *
 * Iterates `graph.edges.values()` and links source → target as a
 * dependency between two changes when both endpoints are in this
 * phase's change set. Mirrors the existing `order_by_dependencies`
 * behavior (all edge relationships count as dependencies, not just
 * `depends_on`) — keeping the behavior change scoped to "parallel vs
 * sequential" only.
 *
 * For deletes the order reverses: a delete should run AFTER its
 * dependents are gone. Keep the convention that the existing
 * `order_by_dependencies` used for the reverse direction — flip the
 * edge when the phase is `delete`.
 *
 * Cycle detection is fail-loud (matches existing engine).
 */
export function build_dag(
  changes: ResourceChange[],
  phase: SchedulerPhase,
  graph: Graph,
): Map<string, NodeRecord> {
  // Fast-lookup: change.id → change.
  const change_by_id = new Map<string, ResourceChange>();
  // The engine graph keys nodes by `${type}:${name}`; we also need a
  // name→id index because the graph's `Edge` carries `source: NodeId`,
  // which equals `${type}:${name}` for nodes added via `add_node`.
  // ResourceChange.id is set from `desired_node.id` in diff.ts so the
  // ids align — no name lookup needed.
  for (const c of changes) change_by_id.set(c.id, c);

  const records = new Map<string, NodeRecord>();
  for (const c of changes) {
    records.set(c.id, {
      change: c,
      deps: new Set(),
      dependents: new Set(),
      queued_emitted: false,
    });
  }

  const reverse = phase === 'delete';

  for (const edge of graph.edges.values()) {
    // Edge source/target are NodeIds (`${type}:${name}`). Some changes
    // may not be in this phase (e.g. an unrelated `update` while we're
    // scheduling `create`); skip edges that don't connect two changes.
    const src_change = change_by_id.get(edge.source);
    const tgt_change = change_by_id.get(edge.target);
    if (!src_change || !tgt_change) continue;
    if (src_change === tgt_change) continue;

    const dep_node_id = reverse ? src_change.id : tgt_change.id;
    const dependent_node_id = reverse ? tgt_change.id : src_change.id;

    const dependent_record = records.get(dependent_node_id);
    const dep_record = records.get(dep_node_id);
    if (!dependent_record || !dep_record) continue;

    dependent_record.deps.add(dep_node_id);
    dep_record.dependents.add(dependent_node_id);
  }

  assert_no_cycle(records);
  return records;
}

/**
 * Cycle detection via Kahn's algorithm — same fail-loud message as
 * the legacy `order_by_dependencies` so users see consistent text.
 *
 * Throws `Error('Cycle detected in deployment graph. ...')` when any
 * subset of nodes participates in a cycle. Includes the participating
 * resource names in the message so the user can locate the offending
 * canvas edges.
 */
export function assert_no_cycle(records: Map<string, NodeRecord>): void {
  const in_degree = new Map<string, number>();
  for (const [id, rec] of records) in_degree.set(id, rec.deps.size);

  const queue: string[] = [];
  for (const [id, deg] of in_degree) if (deg === 0) queue.push(id);

  let visited = 0;
  while (queue.length > 0) {
    const id = queue.shift()!;
    visited++;
    const rec = records.get(id)!;
    for (const dep_id of rec.dependents) {
      const next = (in_degree.get(dep_id) ?? 0) - 1;
      in_degree.set(dep_id, next);
      if (next === 0) queue.push(dep_id);
    }
  }

  if (visited !== records.size) {
    const stranded = [...in_degree.entries()]
      .filter(([, deg]) => deg > 0)
      .map(([id]) => records.get(id)!.change.name);
    throw new Error(
      `Cycle detected in deployment graph. ${stranded.length} node(s) participate in a cycle: ` +
        `${stranded.join(', ')}. Review the canvas edges to break the loop before deploying.`,
    );
  }
}

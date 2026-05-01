/**
 * AI ops — ID generation and resolution helpers.
 *
 * Extracted from `operation-executor.ts` (rf-aiop-2). Two roles:
 *   1. ID generation — `generateNodeId` / `generateEdgeId` mint deterministic
 *      IDs of the shape `<kind>-<timestamp>-<counter>`. The counter is a
 *      module-private monotonically increasing integer; it must NEVER be
 *      reset between calls within a single test run, and it must NEVER
 *      collide across calls in the same millisecond — the executor's
 *      idMap relies on uniqueness for placeholder remapping. Matches
 *      `expand-blueprint.ts` pattern.
 *   2. ID resolution — `resolveId` / `nodeExists` translate AI-supplied
 *      placeholder IDs through the executor's running `idMap`, falling back
 *      to the original ID when no mapping exists (e.g. for already-real
 *      node IDs the AI references in subsequent ops).
 */

import type { Card } from '../../../../store/slices/cards-slice';

// Module-private counter — preserves monotonic uniqueness across calls.
// IMPORTANT: this is shared between node and edge IDs because both kinds
// flow through the same idMap and we never want a node and an edge to
// collide on `<timestamp>-<counter>` even theoretically.
let _counter = 0;

/** Generate a fresh node ID. Format: `node-<timestamp>-<counter>`. */
export function generateNodeId(): string {
  return `node-${Date.now()}-${_counter++}`;
}

/** Generate a fresh edge ID. Format: `edge-<timestamp>-<counter>`. */
export function generateEdgeId(): string {
  return `edge-${Date.now()}-${_counter++}`;
}

/** Resolve an ID through the remapping table, falling back to the original */
export function resolveId(id: string, idMap: Map<string, string>): string {
  return idMap.get(id) || id;
}

/** Check if a node exists in the current card (by actual or remapped ID) */
export function nodeExists(nodeId: string, card: Card, idMap: Map<string, string>): boolean {
  const resolvedId = resolveId(nodeId, idMap);
  return card.nodes.some((n) => n.id === resolvedId);
}

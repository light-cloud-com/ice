/**
 * Cheap context for "is this node disconnected on the canvas?"
 *
 * Computing this at every CardShell render via Redux selectors would
 * mean N subscriptions per render of the canvas. Instead the canvas
 * orchestrator precomputes a `Set<nodeId>` of orphaned blocks once per
 * render and broadcasts it via this context; CardShell does an O(1)
 * `Set.has()` lookup. Blocks outside a provider get `false` (no
 * orphan signalling) — that's the right behavior for tests and
 * standalone harnesses that don't have a canvas above them.
 */

import { createContext, useContext } from 'react';

const OrphanNodesContext = createContext<ReadonlySet<string>>(new Set());

export const OrphanNodesProvider = OrphanNodesContext.Provider;

export function useIsNodeOrphan(nodeId: string): boolean {
  return useContext(OrphanNodesContext).has(nodeId);
}

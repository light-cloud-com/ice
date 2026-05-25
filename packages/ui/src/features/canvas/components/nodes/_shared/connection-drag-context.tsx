/**
 * ConnectionDragContext — propagates per-port drag state from the
 * orchestrator (svg-canvas) down to TypedSockets.
 *
 * While a connection is being drawn, the orchestrator computes which
 * specific ports on which nodes can accept the dragged source port.
 * CardShell reads that set to brighten matching ports and dim
 * everything else — so the user SEES exactly where to drop instead of
 * guessing.
 *
 * Implementation note — the propagation uses a module-level singleton
 * rather than React Context. Several canvas tests invoke renderers as
 * plain functions (no React render context), so hooks throw there. The
 * orchestrator drives a state-bound update via the `<DragSync />`
 * component below, which calls `setConnectionDragInfo` synchronously
 * on every render. Consumers read the fresh value with
 * `getConnectionDragInfo()` — no hooks required.
 *
 * `null` means no drag in progress; renderers should ignore drag-
 * specific visuals.
 */

import React, { type ReactNode } from 'react';

export interface ConnectionDragInfo {
  /** Node the drag started from. */
  sourceNodeId: string;
  /** Port id the drag started from, when a typed dot was the start point. */
  sourcePortId?: string;
  /**
   * Per-node, the set of port ids on that node that ACCEPT the dragged
   * source. TypedSockets uses this to glow compatible ports and dim
   * everything else.
   */
  compatibleByNode: Map<string, Set<string>>;
  /**
   * The (nodeId, portId) of the port the wire endpoint is currently
   * magnet-snapped to, if any. TypedSockets renders this port with the
   * "snap" affordance (enlarged ring) so the user knows the drop is
   * locked in before they release.
   */
  snap: { nodeId: string; portId: string } | null;
}

// Module-level singleton holding the in-flight drag info. The orchestrator
// updates this synchronously via `<ConnectionDragProvider />` and consumers
// (CardShell) read it with `getConnectionDragInfo()`. State-bound React
// re-renders triggered by the orchestrator's own state changes propagate
// the fresh value down to children — we don't need a Context for that.
let _current: ConnectionDragInfo | null = null;

/** Returns the active drag info, or null when no drag is in progress. */
export function getConnectionDragInfo(): ConnectionDragInfo | null {
  return _current;
}

/**
 * Test helper — resets the module-level state. Production code paths use
 * `ConnectionDragProvider` to drive updates.
 */
export function _resetConnectionDragInfo(): void {
  _current = null;
}

/**
 * Per-node lookup helper. Pure function — call it from any renderer to
 * get the per-node drag state. Returns `active: false` when no drag is
 * in progress.
 */
export function getNodeDragState(nodeId: string): {
  active: boolean;
  isSource: boolean;
  /** When this is the drag-source node, the id of the port the drag started from. */
  sourcePortId: string | null;
  compatiblePortIds: Set<string> | null;
  snappedPortId: string | null;
} {
  const info = _current;
  if (!info)
    return {
      active: false,
      isSource: false,
      sourcePortId: null,
      compatiblePortIds: null,
      snappedPortId: null,
    };
  const isSource = info.sourceNodeId === nodeId;
  return {
    active: true,
    isSource,
    sourcePortId: isSource ? (info.sourcePortId ?? null) : null,
    compatiblePortIds: info.compatibleByNode.get(nodeId) ?? null,
    snappedPortId: info.snap && info.snap.nodeId === nodeId ? info.snap.portId : null,
  };
}

/**
 * Tiny render-driven syncer. Mounting this with `value={info}` writes
 * `info` into the module-level slot during render. The orchestrator
 * places this above its CardShell descendants; any prop / state change
 * that re-renders the orchestrator re-runs this setter, so children
 * see fresh drag state on the very same render pass.
 */
export const ConnectionDragProvider: React.FC<{ value: ConnectionDragInfo | null; children: ReactNode }> = ({
  value,
  children,
}) => {
  _current = value;
  return <>{children}</>;
};

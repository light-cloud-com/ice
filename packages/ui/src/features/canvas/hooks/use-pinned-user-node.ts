/**
 * usePinnedUserNode
 *
 * Virtual user-traffic-node state machinery for the canvas. The orchestrator
 * (`svg-canvas.tsx`) renders a synthetic "Public Traffic" silhouette plus
 * dashed `connects_to` edges to every exposed entry-point service via
 * `<UserTrafficOverlay>`. That overlay needs three things:
 *
 *  1. a stable `pinnedUserPos` (center point) that does NOT shift each render
 *     just because some unrelated state moved — only when the *set* of exposed
 *     node IDs changes (a structural graph change),
 *  2. a `setUserNodePos` callback so `<SvgUserNode>`'s drag handler can write
 *     the user-dragged top-left back into local state (used only for accurate
 *     connection-endpoint routing — does NOT reset `pinnedUserPos`),
 *  3. derived virtual canvas data: a single `userCanvasNode`, a list of
 *     `userConnections` from that node to every exposed service, and a merged
 *     `nodesWithUserNode` array that connection-path lookups can index into.
 *
 * The hook exposes both the SETTER (passed through to `<UserTrafficOverlay>`
 * via the orchestrator — see rf-canv-21 RISK #10) and the derived nodes /
 * connections / merged-list (consumed by the orchestrator's connection
 * machinery and by the overlay).
 *
 * Behavior preserved verbatim from the inline `useState` + two `useRef` +
 * three `useMemo` cluster previously in `svg-canvas.tsx` (lines 376–429):
 *  - the in-render side-effect block that re-pins on `exposedIdsKey` change
 *    is NOT re-cast as `useEffect` — its setState-during-render-adjacent
 *    semantics (writing to refs, never to state) is exactly what makes the
 *    "structure changed → SvgUserNode resets its drag offset" behavior fire
 *    on the same render that surfaces the new exposed-IDs key.
 *  - `userNodePos` (top-left from drag) is preferred over the derived
 *    pinned-center fallback. The fallback subtracts the half-extent so the
 *    pinned center maps to the top-left the canvas-node API expects.
 *  - `userCanvasNode` is null when both `userNodePos` AND `pinnedUserPos`
 *    are null — i.e. before any exposed service has ever produced an icon
 *    position. Subsequent rerenders with no exposed services keep the
 *    last-pinned position (the ref isn't reset to null when exposed IDs go
 *    to empty), so the icon stays anchored where it last was.
 *
 * rf-canv-21 (RISK #10).
 */

import { useMemo, useRef, useState } from 'react';
import { USER_NODE_WIDTH, USER_NODE_HEIGHT, USER_NODE_ID } from '../../../shared/components/svg-user-node';
import type { CanvasNode, CanvasConnection } from '../components/types';

/** Subset of `useExposedServices` return value this hook actually reads. */
interface ExposedServicesShape {
  nodeIds: string[];
  userIconPosition: { x: number; y: number } | null;
}

export interface UsePinnedUserNodeResult {
  /** Virtual canvas node for the user-traffic icon, or null if no position is yet pinned. */
  userCanvasNode: CanvasNode | null;
  /** Stable center point — only re-pins when the exposed-node-ID set changes. */
  pinnedUserPos: { x: number; y: number } | null;
  /** Drag-position setter — passed through to `<UserTrafficOverlay>` (RISK #10). */
  setUserNodePos: (pos: { x: number; y: number } | null) => void;
  /** Virtual `connects_to` edges from the user node to every exposed service. */
  userConnections: CanvasConnection[];
  /** `effectiveNodes` with the virtual user node appended, for connection-path lookups. */
  nodesWithUserNode: CanvasNode[];
}

export function usePinnedUserNode(
  effectiveNodes: CanvasNode[],
  exposedServices: ExposedServicesShape,
): UsePinnedUserNodeResult {
  // Pinned position for user traffic node — independent of connected node positions.
  // `pinnedUserPos` is the stable center-point passed to SvgUserNode's position prop.
  // Only recalculates when the set of exposed node IDs changes (structural graph change).
  // `userNodePos` is the top-left reported by SvgUserNode drag — used only for connection routing.
  const [userNodePos, setUserNodePos] = useState<{ x: number; y: number } | null>(null);
  const pinnedUserPosRef = useRef<{ x: number; y: number } | null>(null);
  const prevExposedIdsRef = useRef<string>('');

  // Pin position: only update from auto-computed position when exposed node IDs change
  const exposedIdsKey = exposedServices.nodeIds.slice().sort().join(',');
  if (exposedIdsKey !== prevExposedIdsRef.current) {
    prevExposedIdsRef.current = exposedIdsKey;
    pinnedUserPosRef.current = exposedServices.userIconPosition;
    // Structure changed — SvgUserNode will reset its internal drag offset
  }
  // Stable center point for SvgUserNode — does NOT change when user drags
  const pinnedUserPos = pinnedUserPosRef.current;

  // Virtual CanvasNode representing the user traffic icon (for connection routing).
  // Uses userNodePos (top-left from SvgUserNode drag) for accurate connection endpoints,
  // or falls back to pinnedUserPos (center) converted to top-left.
  const userCanvasNode: CanvasNode | null = useMemo(() => {
    const pos =
      userNodePos ||
      (pinnedUserPos ? { x: pinnedUserPos.x - USER_NODE_WIDTH / 2, y: pinnedUserPos.y - USER_NODE_HEIGHT / 2 } : null);
    if (!pos) return null;
    return {
      id: USER_NODE_ID,
      type: 'resource' as const,
      x: pos.x,
      y: pos.y,
      width: USER_NODE_WIDTH,
      height: USER_NODE_HEIGHT,
      label: 'Public Traffic',
      data: { iceType: 'Virtual.UserTraffic' },
    };
  }, [userNodePos, pinnedUserPos]);

  // Virtual connections from user node to each exposed service
  const userConnections: CanvasConnection[] = useMemo(() => {
    if (!userCanvasNode || exposedServices.nodeIds.length === 0) return [];
    return exposedServices.nodeIds.map((nodeId, _i) => ({
      id: `${USER_NODE_ID}->${nodeId}`,
      from: USER_NODE_ID,
      to: nodeId,
      data: { relationship: 'connects_to' },
    }));
  }, [userCanvasNode, exposedServices.nodeIds]);

  // Merged node list including the virtual user node (for connection path lookups)
  const nodesWithUserNode: CanvasNode[] = useMemo(() => {
    if (!userCanvasNode) return effectiveNodes;
    return [...effectiveNodes, userCanvasNode];
  }, [effectiveNodes, userCanvasNode]);

  return {
    userCanvasNode,
    pinnedUserPos,
    setUserNodePos,
    userConnections,
    nodesWithUserNode,
  };
}

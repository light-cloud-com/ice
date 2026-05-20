/**
 * rf-canv-15 — `UserTrafficOverlay` subcomponent.
 *
 * The virtual user-node icon (a cyan user silhouette positioned above the
 * canvas's exposed services) plus the outbound `<SvgConnectionPath>` lines
 * from that virtual node to each public endpoint. Both render only when the
 * canvas does NOT contain an explicit `Network.PublicEndpoint` block — i.e.
 * when the orchestrator computes `showVirtualUserNode = true`. The orchestrator
 * controls that gate via the `show` prop here.
 *
 * Two render gates are preserved verbatim from the inline svg-canvas blocks:
 *   - `show && userConnections.length > 0` → the connections layer
 *   - `show && pinnedUserPos` → the icon
 * Both gates remain INDEPENDENT — empty connections plus a pinned position
 * still renders just the icon, and vice-versa. Do NOT collapse them into one
 * `show && (pinnedUserPos || userConnections.length > 0)` guard; the two
 * blocks are individually conditional.
 *
 * Per blueprint risk #10, `setUserNodePos` writes to canvas-level state
 * (`userNodePos`) which is read by the `userCanvasNode` memo back in the
 * orchestrator. The setter must continue to flow through props until
 * `usePinnedUserNode` lands in rf-canv-21 — do NOT inline-define an internal
 * setter or move the state ownership down here.
 */

import React from 'react';
import { SvgConnectionPath } from './svg-connection-path';
import { SvgUserNode } from '../../../shared/components/svg-user-node';
import type { CanvasNode, CanvasConnection } from './types';
import type { EdgeStyle } from '../../../store/slices/ui-slice';

export interface UserTrafficOverlayProps {
  /** Gate: when false the overlay renders nothing (orchestrator's
   * `showVirtualUserNode` flag — true iff no explicit `Network.PublicEndpoint`
   * block is on the canvas). */
  show: boolean;
  /** Synthetic edges from the virtual user node to each exposed service. */
  userConnections: CanvasConnection[];
  /** Real canvas nodes plus the synthetic user node, supplied as both
   * `nodes` and `allNodes` to `<SvgConnectionPath>` so port routing can
   * resolve the virtual node. */
  nodesWithUserNode: CanvasNode[];
  /** Stable center-point for the icon. Null while no exposed service is
   * present yet (during initial render or after the user removes the last
   * exposed service). */
  pinnedUserPos: { x: number; y: number } | null;
  /** Current canvas zoom — needed by `<SvgUserNode>` to convert screen-px
   * drag deltas to canvas-px. */
  zoom: number;
  /** Reports the icon's current top-left position on every drag tick. The
   * orchestrator stores this in `userNodePos` and re-derives the user node's
   * connection endpoints. */
  setUserNodePos: (pos: { x: number; y: number }) => void;
  /** Edge styling shared with the rest of the canvas (bezier / straight /
   * rectangular). Threaded verbatim into each `<SvgConnectionPath>`. */
  edgeStyle: EdgeStyle;
}

export const UserTrafficOverlay: React.FC<UserTrafficOverlayProps> = ({
  show,
  userConnections,
  nodesWithUserNode,
  pinnedUserPos,
  zoom,
  setUserNodePos,
  edgeStyle,
}) => {
  return (
    <>
      {/* User traffic connections (same styling as regular connections) — only when no explicit Network.PublicEndpoint block */}
      {show && userConnections.length > 0 && (
        <g className="user-traffic-connections-layer">
          {userConnections.map((conn) => (
            <SvgConnectionPath
              key={conn.id}
              connection={conn}
              nodes={nodesWithUserNode}
              allNodes={nodesWithUserNode}
              isSelected={false}
              isHighlighted={false}
              direction="outgoing"
              sourcePortIndex={0}
              sourcePortCount={1}
              targetPortIndex={0}
              targetPortCount={1}
              edgeStyle={edgeStyle}
            />
          ))}
        </g>
      )}

      {/* User traffic icon for exposed services — only when no explicit Network.PublicEndpoint block */}
      {show && pinnedUserPos && <SvgUserNode position={pinnedUserPos} scale={zoom} onPositionChange={setUserNodePos} />}
    </>
  );
};

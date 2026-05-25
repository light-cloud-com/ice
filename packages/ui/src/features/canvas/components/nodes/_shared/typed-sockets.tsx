/**
 * TypedSockets — typed connection points on a block.
 *
 * Renders one SVG `<circle>` (or alternative shape) per `SocketDef` at
 * its anchor side. Color from `CATEGORY_COLORS`, shape from the
 * `SocketDef.shape` field. Each socket emits the data attributes
 * `connection-port` + `data-node-id` + `data-socket-id` + `data-side` +
 * `data-category` + `data-direction` so the canvas drag handler can
 * (a) recognize the start of a port drag and (b) persist socket ids
 * onto the resulting `CardEdge.data`.
 *
 * At LOD < 2 we degrade to anonymous L/R dots — at very low zoom the
 * extra socket detail is invisible and the work is wasted. The drop-
 * target glow (valid/invalid) is inherited from CardShell via opacity.
 *
 * Replaces the prior `ConnectionPorts` 4-side anonymous-dot component.
 * `customPorts` blocks (cron, custom-domain) keep drawing their own
 * sockets directly and don't go through this component.
 */

import React, { memo } from 'react';
import { SocketDot, type DotState } from './socket-dot';
import type { PortDef } from '@ice/types';

interface TypedSocketsProps {
  nodeId: string;
  /** Block bounds in canvas-space. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Ports to render — output of `getPortsForNode(node)`. */
  sockets: PortDef[];
  /** Drop-target glow color for the validation green/red flash. */
  validTargetColor?: string;
  isValidTarget?: boolean;
  /** Master opacity gate from CardShell — faint at idle, full on hover/select. */
  opacity?: number;
  /** Level of detail; sockets degrade to anonymous L/R dots at LOD < 2. */
  lod?: number;
  /**
   * Set of port ids on this node that ACCEPT the in-flight drag's source
   * port. CardShell reads the drag context and passes this in; null when
   * no drag is active or this node isn't a candidate target.
   */
  compatiblePortIds?: Set<string> | null;
  /** Port id currently magnet-snapped (or null). */
  snappedPortId?: string | null;
  /** True when this node is the source of an in-flight drag. */
  isDragSource?: boolean;
  /** Source port id when this node is the drag source — drives the pulsing halo on the started port. */
  sourcePortId?: string | null;
}

/** Distribute sockets along a single side, evenly spaced. */
function socketPosition(
  side: 'left' | 'right' | 'top' | 'bottom',
  index: number,
  count: number,
  x: number,
  y: number,
  w: number,
  h: number,
): { cx: number; cy: number } {
  const r = (index + 1) / (count + 1);
  switch (side) {
    case 'top':
      return { cx: x + w * r, cy: y };
    case 'right':
      return { cx: x + w, cy: y + h * r };
    case 'bottom':
      return { cx: x + w * r, cy: y + h };
    case 'left':
    default:
      return { cx: x, cy: y + h * r };
  }
}

// Visual logic — shape, color, halo, drag-context — lives in `./socket-dot`.
// TypedSockets is just the schema-driven distribution layer.

export const TypedSockets: React.FC<TypedSocketsProps> = memo(
  ({
    nodeId,
    x,
    y,
    width,
    height,
    sockets,
    isValidTarget = false,
    opacity = 1,
    lod = 3,
    compatiblePortIds = null,
    snappedPortId = null,
    isDragSource = false,
    sourcePortId = null,
  }) => {
    const dragActive = !isDragSource && compatiblePortIds !== null;
    // The source-side block highlights only its source port — the dot
    // the user grabbed — with a pulsing peer-color halo so they see
    // exactly where the wire starts.
    const sourceActive = isDragSource && sourcePortId !== null;
    // LOD degrade — at very low zoom we don't render typed shapes, just
    // anonymous L/R dots so the block still has a drag affordance. We
    // emit the data attributes anyway so drag still produces a valid
    // socket id when possible.
    if (lod < 2 || sockets.length === 0) {
      const fallback: Array<{ side: 'left' | 'right'; direction: 'in' | 'out'; id: string }> = sockets.length
        ? [
            // Pick first IN socket for left, first OUT for right.
            ...(sockets.find((s) => s.direction === 'in')
              ? [{ side: 'left' as const, direction: 'in' as const, id: sockets.find((s) => s.direction === 'in')!.id }]
              : []),
            ...(sockets.find((s) => s.direction === 'out')
              ? [
                  {
                    side: 'right' as const,
                    direction: 'out' as const,
                    id: sockets.find((s) => s.direction === 'out')!.id,
                  },
                ]
              : []),
          ]
        : [
            { side: 'left', direction: 'in', id: '' },
            { side: 'right', direction: 'out', id: '' },
          ];

      return (
        <g className="connection-ports" style={{ opacity, transition: 'opacity 120ms ease' }}>
          {fallback.map(({ side, direction, id }, idx) => {
            const pos = socketPosition(side, 0, 1, x, y, width, height);
            return (
              <circle
                key={`${side}-${idx}`}
                className="connection-port"
                data-node-id={nodeId}
                data-socket-id={id}
                data-side={side}
                data-direction={direction}
                cx={pos.cx}
                cy={pos.cy}
                r={isValidTarget ? 6 : 5}
                fill={isValidTarget ? '#22c55e' : 'var(--ice-text-tertiary)'}
                stroke="var(--ice-bg-base)"
                strokeWidth={2}
                style={{ cursor: 'crosshair' }}
              />
            );
          })}
        </g>
      );
    }

    // Group sockets by side for even distribution along the perimeter.
    const bySide: Record<'left' | 'right' | 'top' | 'bottom', PortDef[]> = {
      left: [],
      right: [],
      top: [],
      bottom: [],
    };
    for (const s of sockets) bySide[s.side].push(s);

    return (
      <g className="connection-ports" style={{ opacity, transition: 'opacity 120ms ease' }}>
        {(['left', 'right', 'top', 'bottom'] as const).flatMap((side) => {
          const list = bySide[side];
          return list.map((sock, idx) => {
            const pos = socketPosition(side, idx, list.length, x, y, width, height);
            // Derive per-port state from the drag context. When no drag
            // is in progress this is always 'idle'.
            let state: DotState = 'idle';
            if (sourceActive && sock.id === sourcePortId) {
              state = 'source-active';
            } else if (dragActive && compatiblePortIds) {
              if (snappedPortId === sock.id) state = 'snapped';
              else if (compatiblePortIds.has(sock.id)) state = 'compatible';
              else state = 'incompatible';
            }
            return (
              <SocketDot
                key={sock.id}
                socketId={sock.id}
                nodeId={nodeId}
                side={side}
                role={sock.role}
                direction={sock.direction}
                shape={sock.shape}
                label={sock.label}
                peerStyle={sock.peerStyle}
                cx={pos.cx}
                cy={pos.cy}
                isValidTarget={isValidTarget}
                state={state}
              />
            );
          });
        })}
      </g>
    );
  },
);

TypedSockets.displayName = 'TypedSockets';

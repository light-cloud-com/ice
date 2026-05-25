/**
 * Reroute node — a tiny pass-through dot used to bend wires cleanly.
 *
 * Inspired by Blender's Reroute node (Shift+RMB). The block has no
 * header / body / footer / icon: it's a colored circle 16×16 with one
 * input socket on the left and one output socket on the right. The
 * color of the dot is derived from the connection category of the
 * passing wire (computed in `passthrough.ts`) so the user reads the
 * dot the same way they read the wire — green = traffic, amber =
 * config, etc.
 *
 * Reroute lives in the `Util` iceType namespace because it's not an
 * infrastructure resource — it's a graph-routing affordance. Despite
 * not appearing in the deploy graph, it participates in the canvas
 * connection model just like any block: it has typed sockets, edges
 * attach to it, and the magnetic-attach math runs unchanged.
 */

import { CATEGORY_COLORS } from '@ice/constants';
import React, { memo } from 'react';
import { findPassthroughCategory } from './passthrough';
import { ConnectionDragGlow } from '../_shared/connection-drag-glow';
import { TypedSockets } from '../_shared/typed-sockets';
import type { CanvasConnection } from '../../types';
import type { SvgCompactNodeProps } from '../compact-node/types';
import type { SocketDef } from '@ice/types';

interface RerouteNodeProps extends SvgCompactNodeProps {
  /** All edges on the active card — used to derive the passthrough color. */
  allConnections?: CanvasConnection[];
}

export const REROUTE_SIZE = 16;

export const SvgRerouteNode: React.FC<RerouteNodeProps> = memo(
  ({ node, isSelected, connectionDragState, allConnections = [] }) => {
    const { x, y } = node;
    const W = node.width || REROUTE_SIZE;
    const H = node.height || REROUTE_SIZE;
    const cx = x + W / 2;
    const cy = y + H / 2;

    const category = findPassthroughCategory(node.id, allConnections) ?? 'traffic';
    const color = CATEGORY_COLORS[category];

    const sockets: SocketDef[] = [
      {
        id: 'in',
        side: 'left',
        category,
        direction: 'in',
        label: 'Input',
        shape: 'circle',
        multi: true,
      },
      {
        id: 'out',
        side: 'right',
        category,
        direction: 'out',
        label: 'Output',
        shape: 'circle',
        multi: true,
      },
    ];

    const isValidTarget = connectionDragState === 'valid-target';
    const isInvalidTarget = connectionDragState === 'invalid-target';
    const ringR = REROUTE_SIZE / 2 + (isSelected ? 3 : 2);

    return (
      <g data-node-id={node.id} data-iceType="Util.Reroute">
        {isSelected && (
          <circle
            cx={cx}
            cy={cy}
            r={ringR}
            fill="none"
            stroke="var(--ice-text-secondary)"
            strokeWidth={1.5}
            opacity={0.7}
          />
        )}
        <circle
          cx={cx}
          cy={cy}
          r={REROUTE_SIZE / 2}
          fill={color}
          stroke="var(--ice-bg-base)"
          strokeWidth={2}
          opacity={isInvalidTarget ? 0.4 : 1}
        />
        {isValidTarget && <ConnectionDragGlow x={x - 4} y={y - 4} width={W + 8} height={H + 8} />}
        <TypedSockets
          nodeId={node.id}
          x={x}
          y={y}
          width={W}
          height={H}
          sockets={sockets}
          isValidTarget={isValidTarget}
          opacity={1}
          lod={3}
        />
      </g>
    );
  },
);

SvgRerouteNode.displayName = 'SvgRerouteNode';

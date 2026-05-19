/**
 * `<defs>` block for the canvas SVG: holds the shift-drag lift-shadow filter
 * and the per-container `<clipPath>` masks that constrain children to their
 * parent's bounding box (BND-5 visual containment). Extracted from
 * `svg-canvas.tsx` (rf-canv-11).
 *
 * VERBATIM PRESERVATION (load-bearing):
 *   - The filter id `shift-drag-shadow` is referenced from `lift-wrapper.tsx`
 *     (rf-canv-10) via `filter="url(#shift-drag-shadow)"`. Renaming it
 *     silently breaks the lift-shadow visual on shift-drag.
 *   - The clipPath ids follow the pattern `parent-clip-${node.id}` and are
 *     referenced from `lift-wrapper.tsx` (rf-canv-10) via
 *     `clipPath="url(#parent-clip-${node.parentId})"`. Renaming them
 *     silently breaks BND-5 containment for children.
 *   - The filter and feDropShadow attribute values (x/y/width/height,
 *     dx/dy/stdDeviation/floodColor/floodOpacity) and the rect's
 *     x/y/width/height/rx are preserved verbatim from svg-canvas L2247–2270.
 *
 * PREDICATE DIVERGENCE NOTE:
 * The container filter below is INTENTIONALLY distinct from the rf-canv-2
 * `isContainerNode` util in `../../utils/node-classification`. Differences:
 *
 *   - Inline (this file): `type === 'container' || type === 'block' ||
 *     iceType ∈ {Network.VPC, Network.Subnet, Network.PrivateNetwork}`
 *   - `isContainerNode`:  `type === 'container' || type === 'group' ||
 *     iceType ∈ {Network.VPC, Network.Subnet, Network.PrivateNetwork}`
 *
 * The clipPath set INCLUDES `type === 'block'` (so block-shaped containers
 * also get a mask) and EXCLUDES `type === 'group'` and any `Group.*` iceType
 * prefix (clipPaths are not applied to Group containers — see rf-canv-10
 * lift-wrapper note: BND-5/BND-6 apply per-block-or-container, not per-group).
 * Substituting `isContainerNode` would silently emit clipPaths for groups
 * (visual change) and skip them for plain blocks (functional regression on
 * containment). Treat as its own predicate; don't fold into the util.
 */

import React from 'react';
import type { CanvasNode } from '../types';
import { CORNER_RADIUS } from '../../../../config/canvas-constants';

export interface ParentClipDefsProps {
  nodes: CanvasNode[];
}

export const ParentClipDefs: React.FC<ParentClipDefsProps> = ({ nodes }) => {
  return (
    <defs>
      <filter id="shift-drag-shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="4" stdDeviation="8" floodColor="#000" floodOpacity="0.35" />
      </filter>
      {/* BND-5: ClipPaths for parent containment — prevents children from
          visually overflowing their parent group/block boundaries */}
      {nodes
        .filter((n) => {
          const t = (n.data?.iceType as string) || '';
          return (
            n.type === 'container' ||
            n.type === 'block' ||
            t === 'Network.VPC' ||
            t === 'Network.Subnet' ||
            t === 'Network.PrivateNetwork'
          );
        })
        .map((n) => (
          <clipPath key={`parent-clip-${n.id}`} id={`parent-clip-${n.id}`}>
            <rect x={n.x} y={n.y} width={n.width} height={n.height} rx={CORNER_RADIUS} />
          </clipPath>
        ))}
    </defs>
  );
};

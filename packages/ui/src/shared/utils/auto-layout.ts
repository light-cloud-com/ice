/**
 * Auto-Layout — orchestrator shell.
 *
 * Decomposed into a `./auto-layout/` subdirectory:
 *  - `./auto-layout/types.ts` — public types + visual-size constants
 *  - `./auto-layout/visual-size.ts` — intrinsicContainerMin + resolveVisualSize
 *  - `./auto-layout/hierarchy.ts` — buildHierarchy + collectRootIds + buildPostOrder
 *  - `./auto-layout/packing.ts` — gridPackKids + repackIsolatedTopLevel
 *  - `./auto-layout/transformers.ts` — absolutizeEdgeRoutes + snapToGrid + absolutizeAll
 *  - `./auto-layout/algorithms/dagre-tree.ts` — dagreTreeLayout
 *  - `./auto-layout/algorithms/circular.ts` — circularLayout + forceResolveOverlaps
 *
 * Modes:
 *   'flow'     — dagre hierarchical tree (vertical=TB, horizontal=LR)
 *   'circular' — concentric-ring fallback (children arranged around parent center)
 *   'grid'     — alias of 'flow' (legacy — routed through dagre)
 *
 * Public API: `autoLayout`, `calculateZIndex`, `forceResolveOverlaps` plus the
 * `LayoutNode` / `LayoutEdge` / `Point` / `LayoutResult` types.
 */

import { isContainer as isContainerType } from '../../config/containment-rules';
import { dagreTreeLayout } from './auto-layout/algorithms/dagre-tree';
import { circularLayout, forceResolveOverlaps } from './auto-layout/algorithms/circular';
import {
  DEFAULT_OPTIONS,
  type LayoutNode,
  type LayoutEdge,
  type LayoutResult,
  type LayoutOptions,
} from './auto-layout/types';

export type { LayoutNode, LayoutEdge, Point, LayoutResult } from './auto-layout/types';
export { forceResolveOverlaps };

// =============================================================================
// Public entry point
// =============================================================================

export function autoLayout(nodes: LayoutNode[], edges: LayoutEdge[], options: LayoutOptions = {}): LayoutResult {
  if (nodes.length === 0) return { nodes: [], edgeRoutes: new Map() };
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (opts.layout === 'circular') {
    return circularLayout(nodes, edges, opts);
  }
  return dagreTreeLayout(nodes, edges, opts);
}

// =============================================================================
// Z-Index (used by svg-canvas.tsx and z-index-depth.test.ts)
// =============================================================================

export function calculateZIndex(iceType: string, depth: number = 0): number {
  if (iceType === 'Network.VPC') return 0 + depth;
  if (iceType === 'Network.Subnet') return 10 + depth;
  if (iceType.startsWith('Group.')) return 15 + depth;
  if (isContainerType(iceType)) return 20 + depth;
  return 100 + depth;
}

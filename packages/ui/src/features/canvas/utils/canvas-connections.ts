/**
 * Pure connection-routing helpers for the SVG canvas.
 *
 * `buildVisibleConnections` builds the bundled `CanvasConnection[]` the
 * renderer iterates from the raw Redux `edges`. The pipeline is
 * **filter → map → filter → bundle**, in that exact order: drop containment
 * edges and edges to/from containers and edges hidden at the viewLevel; map
 * source/target through `foldedRemap`; drop edges where either remapped
 * endpoint is no longer visible and drop self-loops produced by the remap;
 * bundle by `${source}->${target}` so every duplicate increments
 * `data.bundleCount`. The two-pass filter shape is load-bearing — the
 * visible-id gate has to operate on the *remapped* source/target, not the
 * originals.
 *
 * `computePortMap` distributes per-side ports across connections sharing a
 * side of the same node, sorting each group by the OTHER endpoint's
 * position so ports fan out without crossings. Side-selection uses a
 * strict-greater-than dominant-axis dispatch (`Math.abs(dx) > Math.abs(dy)`
 * — NOT `>=`); ties go to the vertical branch. Left/right groups sort by
 * other-Y, top/bottom by other-X. Connections whose source or target isn't
 * in `effectiveNodes` are skipped silently. The `>` tie-break here is the
 * mirror of `connection-preview.ts`'s `>=`; do NOT cross-port.
 *
 * Lifted out of `svg-canvas.tsx` (rf-canv-9) — last leaf util before the
 * subcomponent extractions begin. Behavior is verbatim with the inline
 * `useMemo` blocks.
 */

import { isContainerIceType } from './node-classification';
import { isEdgeVisibleAtLevel } from '../../../config/visualization-config';
import type { CanvasNode, CanvasConnection } from '../components/types';

/** Minimal raw edge shape — structural match for `CardEdge` from the Redux store. */
export interface RawCanvasEdge {
  id: string;
  source: string;
  target: string;
  data?: { relationship?: string; [key: string]: unknown };
}

/**
 * Build the bundled, viewLevel-filtered, folded-remap-aware connection list
 * the renderer iterates. One `CanvasConnection` per unique `${from}->${to}`
 * pair; duplicates contribute to `data.bundleCount`. See file-level JSDoc
 * for the load-bearing pipeline shape.
 */
export function buildVisibleConnections(args: {
  edges: RawCanvasEdge[];
  effectiveNodes: CanvasNode[];
  foldedRemap: Map<string, string>;
  viewLevel: 1 | 2;
}): CanvasConnection[] {
  const { edges, effectiveNodes, foldedRemap, viewLevel } = args;
  const visibleNodeIds = new Set(effectiveNodes.map((n) => n.id));

  // Build a set of container node IDs — edges to/from containers are never rendered
  const containerIds = new Set(
    effectiveNodes
      .filter(
        (n) =>
          n.type === 'container' ||
          n.type === ('group' as never) ||
          ((n.data?.iceType as string) || '').startsWith('Group.') ||
          isContainerIceType((n.data?.iceType as string) || ''),
      )
      .map((n) => n.id),
  );

  // First pass: remap and filter
  const remapped = edges
    .filter((edge) => {
      if (edge.data?.relationship === 'contains') return false;
      // Never render edges to/from containers (VPC, Subnet, Group)
      if (containerIds.has(edge.source) || containerIds.has(edge.target)) return false;
      const relationship = edge.data?.relationship || 'connects_to';
      if (!isEdgeVisibleAtLevel(relationship, false, viewLevel)) return false;
      return true;
    })
    .map((edge) => {
      // Apply folded remap
      const from = foldedRemap.get(edge.source) || edge.source;
      const to = foldedRemap.get(edge.target) || edge.target;
      return { ...edge, source: from, target: to };
    })
    .filter((edge) => {
      if (!visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target)) return false;
      if (edge.source === edge.target) return false;
      return true;
    });

  // Second pass: bundle connections with same from→to pair
  const bundleMap = new Map<string, { edge: (typeof remapped)[0]; count: number }>();
  for (const edge of remapped) {
    const key = `${edge.source}->${edge.target}`;
    const existing = bundleMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      bundleMap.set(key, { edge, count: 1 });
    }
  }

  return Array.from(bundleMap.values()).map(({ edge, count }) => ({
    id: edge.id,
    from: edge.source,
    to: edge.target,
    data: {
      ...(edge.data as CanvasConnection['data']),
      bundleCount: count,
    },
  }));
}

/**
 * Pick the exit/entry sides from `fromNode`'s center to `toNode`'s center
 * by dominant-axis dispatch. Strict-greater-than (`>` not `>=`) — equal-
 * magnitude `|dx|`/`|dy|` ties go to the vertical branch. Mirror of
 * `connection-preview.ts`'s `>=`; do NOT cross-port.
 */
function getSide(fromNode: CanvasNode, toNode: CanvasNode): { exitSide: string; entrySide: string } {
  const dx = toNode.x + toNode.width / 2 - (fromNode.x + fromNode.width / 2);
  const dy = toNode.y + toNode.height / 2 - (fromNode.y + fromNode.height / 2);
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? { exitSide: 'right', entrySide: 'left' } : { exitSide: 'left', entrySide: 'right' };
  }
  return dy > 0 ? { exitSide: 'bottom', entrySide: 'top' } : { exitSide: 'top', entrySide: 'bottom' };
}

/**
 * Distribute per-side ports across connections sharing a side of the same
 * node. Returned Map keys are `${connId}:${role}` (role is `'source'` or
 * `'target'`); values are `{ index, count }`. Sort order: left/right by
 * other-Y, top/bottom by other-X. Connections whose source or target isn't
 * in `effectiveNodes` are skipped silently.
 */
export function computePortMap(
  canvasConnections: CanvasConnection[],
  effectiveNodes: CanvasNode[],
): Map<string, { index: number; count: number }> {
  const map = new Map<string, { index: number; count: number }>();
  const nodeById = new Map<string, CanvasNode>();
  for (const n of effectiveNodes) nodeById.set(n.id, n);

  // Collect all connections per side-key, with the "other" node for sorting
  interface SideEntry {
    connId: string;
    role: 'source' | 'target';
    otherCx: number;
    otherCy: number;
  }
  const sideGroups = new Map<string, SideEntry[]>();

  for (const conn of canvasConnections) {
    const fromNode = nodeById.get(conn.from);
    const toNode = nodeById.get(conn.to);
    if (!fromNode || !toNode) continue;

    const { exitSide, entrySide } = getSide(fromNode, toNode);
    const sourceKey = `${conn.from}:${exitSide}`;
    const targetKey = `${conn.to}:${entrySide}`;

    const toCx = toNode.x + toNode.width / 2;
    const toCy = toNode.y + toNode.height / 2;
    const fromCx = fromNode.x + fromNode.width / 2;
    const fromCy = fromNode.y + fromNode.height / 2;

    if (!sideGroups.has(sourceKey)) sideGroups.set(sourceKey, []);
    sideGroups.get(sourceKey)!.push({ connId: conn.id, role: 'source', otherCx: toCx, otherCy: toCy });

    if (!sideGroups.has(targetKey)) sideGroups.set(targetKey, []);
    sideGroups.get(targetKey)!.push({ connId: conn.id, role: 'target', otherCx: fromCx, otherCy: fromCy });
  }

  // Sort each group by the other endpoint's position to minimize crossings:
  // left/right sides → sort by other node's Y (top-to-bottom)
  // top/bottom sides → sort by other node's X (left-to-right)
  for (const [key, entries] of sideGroups) {
    const side = key.split(':').pop()!;
    if (side === 'left' || side === 'right') {
      entries.sort((a, b) => a.otherCy - b.otherCy);
    } else {
      entries.sort((a, b) => a.otherCx - b.otherCx);
    }
    const count = entries.length;
    for (let i = 0; i < count; i++) {
      map.set(`${entries[i].connId}:${entries[i].role}`, { index: i, count });
    }
  }

  return map;
}

/**
 * Packing helpers — fall-back grid placement when dagre's hierarchical
 * tree is the wrong shape.
 *
 *  - `gridPackKids` packs an isolated container's children into a roughly-
 *    square grid (mirrors the dagre branch's padding so post-snap the
 *    inset stays consistent).
 *  - `repackIsolatedTopLevel` keeps dagre's main flow in place and packs
 *    every top-level node whose subtree never touches a flow edge into a
 *    grid below (TB) or beside (LR) the flow.
 *
 * Both helpers MUTATE `relPos` and `containerSize` — they're consumed by
 * the algorithm passes (dagreTreeLayout, circularLayout) which own those
 * maps.
 */

import { LAYOUT_GRID_STEP as GRID_STEP, LAYOUT_RANK_SEP as RANK_SEP } from '@ice/constants';
import { intrinsicContainerMin } from './visual-size';
import type { LayoutEdge, LayoutNode } from './types';

/**
 * Pack a container's isolated children into a roughly-square grid, written
 * back as group-local positions in `relPos` and the resulting bounds as
 * `containerSize[ownerId]`. Used in place of dagre when no kid pair shares
 * a flow edge — dagre would otherwise stretch the children into a 1×N rank.
 *
 * Padding mirrors the dagre branch: GRID_STEP each side, GRID_STEP*2 on top
 * (header zone), GRID_STEP at the bottom — all snap-no-op friendly.
 */
export function gridPackKids(
  kids: string[],
  ownerId: string,
  nodeMap: Map<string, LayoutNode>,
  containerSize: Map<string, { width: number; height: number }>,
  relPos: Map<string, { x: number; y: number }>,
): void {
  const sizeOf = (id: string) => {
    const cs = containerSize.get(id);
    if (cs) return cs;
    const n = nodeMap.get(id)!;
    return { width: n.width, height: n.height };
  };
  const sizes = kids.map(sizeOf);
  const avgW = sizes.reduce((s, x) => s + x.width, 0) / kids.length;
  const avgH = sizes.reduce((s, x) => s + x.height, 0) / kids.length;

  // Aim for a roughly-square content box. cols ≈ sqrt(N * avgH/avgW) yields
  // a layout whose width-to-height matches the average card aspect ratio.
  const cols = Math.max(1, Math.round(Math.sqrt(kids.length * (avgH / avgW))));

  const ownerIce = (nodeMap.get(ownerId)!.iceType as string) || '';
  const visualMin = intrinsicContainerMin(ownerIce);

  let cursorX = GRID_STEP; // left padding
  let cursorY = GRID_STEP * 2; // header zone
  let rowHeight = 0;
  let maxRightEdge = 0; // rightmost block edge across all rows

  for (let i = 0; i < kids.length; i++) {
    if (i > 0 && i % cols === 0) {
      cursorX = GRID_STEP;
      cursorY += rowHeight + GRID_STEP;
      rowHeight = 0;
    }
    const s = sizes[i];
    relPos.set(kids[i], { x: cursorX, y: cursorY });
    const rightEdge = cursorX + s.width;
    if (rightEdge > maxRightEdge) maxRightEdge = rightEdge;
    cursorX = rightEdge + GRID_STEP;
    if (s.height > rowHeight) rowHeight = s.height;
  }
  const lastBottom = cursorY + rowHeight;

  containerSize.set(ownerId, {
    width: Math.max(maxRightEdge + GRID_STEP, visualMin.width),
    height: Math.max(lastBottom + GRID_STEP, visualMin.height),
  });
}

/**
 * Keep the main flow where dagre put it, then pack every top-level node
 * whose whole subtree is untouched by flow edges into a tight grid below
 * (TB) or beside (LR) the flow. Without this, dagre spreads singleton
 * components alongside the main flow and the canvas stretches absurdly wide.
 */
export function repackIsolatedTopLevel(
  rootIds: string[],
  flowEdges: LayoutEdge[],
  childrenOf: Map<string, string[]>,
  nodeMap: Map<string, LayoutNode>,
  containerSize: Map<string, { width: number; height: number }>,
  relPos: Map<string, { x: number; y: number }>,
  rankdir: 'TB' | 'LR',
  gap: number,
): void {
  const touched = new Set<string>();
  for (const e of flowEdges) {
    touched.add(e.source);
    touched.add(e.target);
  }

  const hasFlowDescendant = new Map<string, boolean>();
  const checkFlow = (id: string): boolean => {
    const cached = hasFlowDescendant.get(id);
    if (cached !== undefined) return cached;
    if (touched.has(id)) {
      hasFlowDescendant.set(id, true);
      return true;
    }
    for (const kid of childrenOf.get(id) ?? []) {
      if (checkFlow(kid)) {
        hasFlowDescendant.set(id, true);
        return true;
      }
    }
    hasFlowDescendant.set(id, false);
    return false;
  };

  const flowRoots: string[] = [];
  const isolatedRoots: string[] = [];
  for (const id of rootIds) (checkFlow(id) ? flowRoots : isolatedRoots).push(id);

  if (isolatedRoots.length === 0 || flowRoots.length === 0) return;

  const sizeOf = (id: string): { width: number; height: number } => {
    const n = nodeMap.get(id)!;
    const cs = containerSize.get(id);
    // containerSize is authoritative for containers that have been laid out —
    // it's the shrink-wrapped post-layout size (e.g. 320 for an empty
    // Private Network, even though its pre-layout stored height was 706).
    // Using `Math.max(cs, n)` here would leak stale nodeMap values into the
    // packing loop and leave huge vertical gaps between rows.
    if (cs) return { width: cs.width, height: cs.height };
    return { width: n.width, height: n.height };
  };

  // Bounding box of the flow in top-level coordinates.
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const id of flowRoots) {
    const rel = relPos.get(id);
    if (!rel) continue;
    const s = sizeOf(id);
    if (rel.x < minX) minX = rel.x;
    if (rel.y < minY) minY = rel.y;
    if (rel.x + s.width > maxX) maxX = rel.x + s.width;
    if (rel.y + s.height > maxY) maxY = rel.y + s.height;
  }
  if (!isFinite(minX)) return;

  // Sort isolated nodes tallest-to-shortest (TB) / widest-first (LR) so a
  // giant Private Network doesn't leave a ragged row.
  const sorted = [...isolatedRoots].sort((a, b) => {
    const sa = sizeOf(a);
    const sb = sizeOf(b);
    return rankdir === 'TB' ? sb.height - sa.height : sb.width - sa.width;
  });

  // Target a roughly-square grid so 20+ isolated blocks don't stack into a
  // narrow, multi-screen-tall column. `flowWidth` is a floor — we use the
  // larger of (flow bounding box) and (sqrt(count) × typical node width)
  // so the grid gets wide enough to visually breathe.
  const avgW = sorted.reduce((s, id) => s + sizeOf(id).width, 0) / Math.max(sorted.length, 1);
  const avgH = sorted.reduce((s, id) => s + sizeOf(id).height, 0) / Math.max(sorted.length, 1);
  const gridCols = Math.max(3, Math.ceil(Math.sqrt(sorted.length)));
  const targetGridWidth = gridCols * (avgW + gap);
  const targetGridHeight = Math.max(3, Math.ceil(sorted.length / gridCols)) * (avgH + gap);

  if (rankdir === 'TB') {
    const gridWidth = Math.max(maxX - minX, targetGridWidth);
    let cursorX = minX;
    let cursorY = maxY + RANK_SEP;
    let rowHeight = 0;
    for (const id of sorted) {
      const s = sizeOf(id);
      if (cursorX > minX && cursorX + s.width > minX + gridWidth) {
        cursorX = minX;
        cursorY += rowHeight + gap;
        rowHeight = 0;
      }
      relPos.set(id, { x: cursorX, y: cursorY });
      cursorX += s.width + gap;
      if (s.height > rowHeight) rowHeight = s.height;
    }
  } else {
    const gridHeight = Math.max(maxY - minY, targetGridHeight);
    let cursorX = maxX + RANK_SEP;
    let cursorY = minY;
    let colWidth = 0;
    for (const id of sorted) {
      const s = sizeOf(id);
      if (cursorY > minY && cursorY + s.height > minY + gridHeight) {
        cursorY = minY;
        cursorX += colWidth + gap;
        colWidth = 0;
      }
      relPos.set(id, { x: cursorX, y: cursorY });
      cursorY += s.height + gap;
      if (s.width > colWidth) colWidth = s.width;
    }
  }
}

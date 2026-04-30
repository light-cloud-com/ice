/**
 * Pure helpers for the in-flight connection drag overlay.
 *
 * Two helpers, both side-effect-free, that together drive the temporary
 * bezier the user sees while dragging from a node port to another node:
 *
 * - `computeConnectionPreviewPath` builds the SVG path string. The bezier's
 *   control points are placed using a **dominant-axis** dispatch: when the
 *   horizontal delta dominates (`|dx| >= |dy|`) the curve routes left/right,
 *   otherwise it routes up/down. The control-point offset is `dist * 0.35`
 *   clamped to `[40, 200]` — enough curvature on long drags to read as a
 *   pipe, never so much on short drags that the line loops back on itself.
 *
 * - `pickPreviewColor` returns the stroke color for the in-flight bezier
 *   based on what the cursor is currently over. The lookup iterates the
 *   visible-node array IN REVERSE and breaks on the first AABB hit (so the
 *   topmost-rendered node wins, mirroring the visual stacking order). The
 *   source node is skipped — connecting back to your own port is a no-op,
 *   not a self-target. Colors are the orchestrator's three verbatim hex
 *   codes: cyan default, green for valid targets, red for invalid.
 *
 * Folds the rf-canv-6 inline holdout (
 * `hit-test-loops-differ-by-iteration-direction-and-predicate-presence`).
 * The reverse iteration + break-on-first-hit + no-predicate semantics are
 * load-bearing — do NOT route this through `findSmallestContainerHit` or
 * `findContainerAtPosition`; those use different selection rules.
 *
 * The hit rectangle is **inclusive on all four edges** (`>=` and `<=`),
 * matching the orchestrator's other AABB tests.
 */

import type { CanvasNode } from '../components/types';

interface Point {
  x: number;
  y: number;
}

/** Stroke colors for the preview bezier. Verbatim from the orchestrator. */
const PREVIEW_COLOR_DEFAULT = '#22d3ee'; // cyan — empty space
const PREVIEW_COLOR_VALID = '#22c55e'; // green — over a valid target
const PREVIEW_COLOR_INVALID = '#ef4444'; // red — over an invalid target

/**
 * Build the cubic-bezier SVG path string for the in-flight connection
 * preview. Returns an `M …  C …, …, …` string ready to drop into a `<path d>`.
 *
 * The curve uses **dominant-axis** dispatch: when the horizontal delta
 * dominates or ties (`|dx| >= |dy|`) the control points sit horizontally
 * offset from each endpoint; otherwise they sit vertically offset. The
 * offset magnitude is `dist * 0.35` clamped to `[40, 200]`.
 */
export function computeConnectionPreviewPath(sourcePoint: Point, currentPoint: Point): string {
  const dx = currentPoint.x - sourcePoint.x;
  const dy = currentPoint.y - sourcePoint.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const offset = Math.min(Math.max(dist * 0.35, 40), 200);
  // Choose control point direction based on dominant axis
  let cp1, cp2;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const sign = dx >= 0 ? 1 : -1;
    cp1 = { x: sourcePoint.x + offset * sign, y: sourcePoint.y };
    cp2 = { x: currentPoint.x - offset * sign, y: currentPoint.y };
  } else {
    const sign = dy >= 0 ? 1 : -1;
    cp1 = { x: sourcePoint.x, y: sourcePoint.y + offset * sign };
    cp2 = { x: currentPoint.x, y: currentPoint.y - offset * sign };
  }
  return `M ${sourcePoint.x} ${sourcePoint.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${currentPoint.x} ${currentPoint.y}`;
}

/**
 * Pick the stroke color for the in-flight connection preview based on what
 * lies under the cursor.
 *
 * Iterates `effectiveNodes` IN REVERSE (so later-painted, topmost-rendered
 * nodes win), skips the source node, and breaks on the first AABB hit.
 * Returns:
 *
 *  - `'#22d3ee'` (cyan) when the cursor is in empty space, when the only
 *    node under it is the source, when `dragTargets` is null/undefined, or
 *    when the hit node has no entry in `dragTargets`.
 *  - `'#22c55e'` (green) when the hit node's drag-target state is
 *    `'valid-target'`.
 *  - `'#ef4444'` (red) for any other drag-target state on the hit node.
 *
 * Reverse iteration + break-on-first-hit is load-bearing: the rf-canv-6
 * truth table flagged this as a distinct hit-test pattern that does not
 * fold into `findSmallestContainerHit` (smallest-area) or
 * `findContainerAtPosition` (z-index sort).
 */
export function pickPreviewColor(
  currentPoint: Point,
  effectiveNodes: CanvasNode[],
  sourceId: string,
  dragTargets: Map<string, string> | null | undefined,
): string {
  let previewColor = PREVIEW_COLOR_DEFAULT;
  if (dragTargets) {
    for (let i = effectiveNodes.length - 1; i >= 0; i--) {
      const node = effectiveNodes[i];
      if (node.id === sourceId) continue;
      if (
        currentPoint.x >= node.x &&
        currentPoint.x <= node.x + node.width &&
        currentPoint.y >= node.y &&
        currentPoint.y <= node.y + node.height
      ) {
        const state = dragTargets.get(node.id);
        previewColor = state === 'valid-target' ? PREVIEW_COLOR_VALID : PREVIEW_COLOR_INVALID;
        break;
      }
    }
  }
  return previewColor;
}

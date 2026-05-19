/**
 * Straight-line path builder — emitted when the user picks the
 * `'straight'` edge style.
 *
 * Extracted as the rf-conpath-4 leaf of the svg-connection-path
 * decomposition. Single pure function:
 *
 *   - `buildStraightPath(start, end)` — emits `M sx sy L ex ey` plus
 *     the segment midpoint `((sx+ex)/2, (sy+ey)/2)`. The midpoint
 *     locates the edge label / bundle badge — for a straight line, it
 *     IS the geometric midpoint (no closed-form curve evaluation
 *     needed, unlike the bezier builder).
 *
 * **String format is load-bearing**: the path-`d` is rendered straight
 * into SVG, so `M ${x} ${y} L ${x} ${y}` (single-space separators, no
 * commas, no extra whitespace) is preserved byte-for-byte from the
 * original `svg-connection-path.tsx`.
 *
 * Tiny module by line count (~5 LOC of executable code), but the
 * one-call-site / pure-function shape is exactly what the rf-conpath
 * blueprint asks for — the builder lifts cleanly and the orchestrator
 * dispatch (`if (edgeStyle === 'straight') return buildStraightPath`)
 * collapses to a clean import.
 */

import type { PathResult, Point } from '../types';

/**
 * Returns a straight-line `M ... L ...` SVG path with the segment
 * midpoint baked into the result.
 */
export function buildStraightPath(start: Point, end: Point): PathResult {
  const pathD = `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  return { pathD, midX: (start.x + end.x) / 2, midY: (start.y + end.y) / 2 };
}

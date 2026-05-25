/**
 * Path geometry primitives — shared by every builder under `./builders/`
 * and by the orchestrator at `../svg-connection-path.tsx`.
 *
 * Extracted as the rf-conpath-1 leaf of the svg-connection-path
 * decomposition. Three small types describing the inputs/outputs that
 * the pure path-building helpers operate on:
 *
 *   - `Side`   — which edge of a node a connection enters/exits.
 *   - `Point`  — `{ x, y }` plane coordinate.
 *   - `Bounds` — axis-aligned rectangle in canvas space.
 *
 * These types intentionally live in a leaf module (no React, no DOM, no
 * canvas-feature imports) so the builders can be tested against fixture
 * inputs without booting the orchestrator. The orchestrator file
 * (`../svg-connection-path.tsx`) re-imports the same names locally — the
 * runtime cost is zero (`import type` only) and the orchestrator's public
 * surface is unchanged.
 *
 * `PathResult` captures the common `{ pathD, midX, midY }` triple every
 * builder returns: the SVG path-`d` attribute string plus the midpoint
 * coordinates the orchestrator uses to place the edge label / bundle
 * badge / hover delete button. Sharing the shape lets the orchestrator's
 * `pathData` `useMemo` keep a single return type across the four builders
 * (`bezier`, `straight`, `dagre-routed`, `rectangular`).
 */

export type Side = 'left' | 'right' | 'top' | 'bottom';

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PathResult {
  pathD: string;
  midX: number;
  midY: number;
  /** Wire's actual exit point from the source — may differ from the visible socket dot when magnetic routing is active. */
  start?: Point;
  /** Wire's actual entry point on the target — may differ from the visible socket dot when magnetic routing is active. */
  end?: Point;
  /** Source side the wire exits — used by the orchestrator to draw tails or hover overlays. */
  exitSide?: Side;
  /** Target side the wire enters. */
  entrySide?: Side;
}

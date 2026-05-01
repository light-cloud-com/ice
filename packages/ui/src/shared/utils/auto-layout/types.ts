/**
 * Auto-Layout — shared types and visual size constants.
 *
 * Block-size formulas inlined here to avoid a circular import: the per-node
 * renderers under `features/canvas/components/nodes/*` transitively pull in
 * `svg-canvas.tsx`, which imports `calculateZIndex` from auto-layout.
 * Values MUST stay in sync with the corresponding `compute*` exports in the
 * renderer files.
 */

import { LAYOUT_NODE_SEP as NODE_SEP, CONTAINER_PADDING } from '@ice/constants';

// =============================================================================
// Visual size constants — keep in sync with renderer compute* exports
// =============================================================================

export const CD_EXTRA_WIDTH = 40;
export const CD_HEADER_HEIGHT = 48;
export const CD_DOMAIN_FIELD_HEIGHT = 38;
export const CD_ROUTE_ROW_HEIGHT = 36;
export const CD_ROUTE_ROW_GAP = 4;
export const CD_PADDING = 10;
export const CD_ADD_BUTTON_HEIGHT = 32;
export const MQ_HEADER_HEIGHT = 48;
export const MQ_ROW_HEIGHT = 26;
export const MQ_ROW_GAP = 4;
export const MQ_PADDING = 12;
export const SS_HEADER_HEIGHT = 48;
export const SS_ROW_HEIGHT = 20;
export const SS_PADDING = 12;
export const EC_HEADER_HEIGHT = 48;
export const EC_ROW_HEIGHT = 20;
export const EC_PADDING = 12;
export const ES_HEADER_HEIGHT = 48;
export const ES_FIELD_HEIGHT = 30;
export const ES_PADDING = 12;

// =============================================================================
// Public types
// =============================================================================

export interface LayoutNode {
  id: string;
  type: string;
  iceType: string;
  label: string;
  parentId?: string | null;
  width: number;
  height: number;
  x: number;
  y: number;
  children?: LayoutNode[];
  data: Record<string, unknown>;
  folded?: boolean;
}

export interface LayoutEdge {
  source: string;
  target: string;
  relationship?: string;
}

export interface Point {
  x: number;
  y: number;
}

export interface LayoutResult {
  nodes: LayoutNode[];
  /** Routed polyline per edge, keyed by `${source}::${target}`. Absolute canvas coordinates. */
  edgeRoutes: Map<string, Point[]>;
}

export interface LayoutOptions {
  startX?: number;
  startY?: number;
  nodeGap?: number;
  nodesPerRow?: number;
  containerPadding?: number;
  layout?: 'flow' | 'grid' | 'circular';
  direction?: 'vertical' | 'horizontal';
  zoom?: number;
}

export const DEFAULT_OPTIONS: Required<LayoutOptions> = {
  startX: 50,
  startY: 50,
  nodeGap: NODE_SEP,
  nodesPerRow: 3,
  containerPadding: CONTAINER_PADDING,
  layout: 'flow',
  direction: 'vertical',
  zoom: 1,
};

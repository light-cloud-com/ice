/**
 * Auto-Layout — shared types and visual size constants.
 *
 * Per-block layout constants live in `@ice/constants` (zero-dep leaf package)
 * so this module can re-export them without forming a circular import with
 * the renderers under `features/canvas/components/nodes/*` (those renderers
 * transitively pull in `svg-canvas.tsx`, which imports `calculateZIndex`
 * from this file).
 */

import {
  LAYOUT_NODE_SEP as NODE_SEP,
  CONTAINER_PADDING,
  CD_EXTRA_WIDTH,
  CD_HEADER_HEIGHT,
  CD_DOMAIN_FIELD_HEIGHT,
  CD_ROUTE_ROW_HEIGHT,
  CD_ROUTE_ROW_GAP,
  CD_PADDING,
  CD_ADD_BUTTON_HEIGHT,
  MQ_HEADER_HEIGHT,
  MQ_ROW_HEIGHT,
  MQ_ROW_GAP,
  MQ_PADDING,
  SS_HEADER_HEIGHT,
  SS_ROW_HEIGHT,
  SS_PADDING,
  EC_HEADER_HEIGHT,
  EC_ROW_HEIGHT,
  EC_PADDING,
  ES_HEADER_HEIGHT,
  ES_FIELD_HEIGHT,
  ES_PADDING,
} from '@ice/constants';

// Re-export for visual-size.ts and the existing `__tests__/types.test.ts`
// suite; downstream consumers can keep importing from `./types`.
export {
  CD_EXTRA_WIDTH,
  CD_HEADER_HEIGHT,
  CD_DOMAIN_FIELD_HEIGHT,
  CD_ROUTE_ROW_HEIGHT,
  CD_ROUTE_ROW_GAP,
  CD_PADDING,
  CD_ADD_BUTTON_HEIGHT,
  MQ_HEADER_HEIGHT,
  MQ_ROW_HEIGHT,
  MQ_ROW_GAP,
  MQ_PADDING,
  SS_HEADER_HEIGHT,
  SS_ROW_HEIGHT,
  SS_PADDING,
  EC_HEADER_HEIGHT,
  EC_ROW_HEIGHT,
  EC_PADDING,
  ES_HEADER_HEIGHT,
  ES_FIELD_HEIGHT,
  ES_PADDING,
};

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

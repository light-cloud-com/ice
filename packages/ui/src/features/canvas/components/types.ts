/**
 * Shared canvas type tree.
 *
 * Extracted as the rf-canv-1 leaf of the svg-canvas decomposition. The three
 * interfaces here — `CanvasNode`, `ViewState`, `CanvasConnection` — describe
 * the in-memory shape canvas-feature consumers operate on (positions, zoom
 * state, edges between nodes). They live in their own module so that any
 * future canvas component can import them without pulling on the orchestrator
 * bundle.
 *
 * The orchestrator file (`./svg-canvas.tsx`) re-exports all three via
 * `export type { ... } from './types';` so the 11+ consumer files that import
 * these types from `'./svg-canvas'` or `'../svg-canvas'` continue to resolve
 * unchanged. The re-export is type-only (zero runtime cost). Consumers are
 * free to migrate to the canonical path at their own pace.
 */

// Canvas node type - exported for use by other components
export interface CanvasNode {
  id: string;
  type: 'block' | 'resource' | 'container';
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  data: Record<string, unknown>;
  parentId?: string | null;
}

export interface ViewState {
  scale: number;
  panX: number;
  panY: number;
}

export interface CanvasConnection {
  id: string;
  from: string;
  to: string;
  type?: 'default' | 'contains';
  data?: {
    relationship?: string;
    [key: string]: unknown;
  };
}

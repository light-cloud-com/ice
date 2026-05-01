/**
 * rf-canvint-1: Shared types for the canvas-interactions hook group.
 *
 * Extracted verbatim from `use-canvas-interactions.ts`. The orchestrator
 * `useCanvasInteractions` re-exports `CanvasViewport`, `CanvasItem`,
 * `UseCanvasInteractionsOptions`, and `UseCanvasInteractionsResult` for
 * its public consumers (svg-canvas.tsx, etc.) so this module is the
 * single canonical home but the orchestrator stays the public-import
 * surface.
 *
 * Discovered: rf-canv-1 export-from-and-import-from-pattern requires
 * BOTH a `import type { ... } from './interactions/types'` (for the
 * orchestrator's internal usages) AND `export type { ... } from
 * './interactions/types'` (for outside consumers) — see the rf-canv-1
 * learning anchor.
 */

import type { RefObject, MouseEvent } from 'react';

export interface CanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface CanvasItem {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parentId?: string | null;
}

export type InteractionMode = 'none' | 'pan' | 'drag' | 'resize' | 'boxSelect';

export interface DragItemOffset {
  dx: number;
  dy: number;
  startX: number;
  startY: number;
}

export interface InteractionState {
  mode: InteractionMode;
  itemId: string | null;
  startX: number;
  startY: number;
  startItemX: number;
  startItemY: number;
  startItemWidth: number;
  startItemHeight: number;
  // Box selection start in canvas coords
  boxStartCanvasX: number;
  boxStartCanvasY: number;
  // Multi-drag: offsets for each selected item relative to primary drag item
  dragItemOffsets: Map<string, DragItemOffset>;
}

export interface UseCanvasInteractionsOptions {
  svgRef: RefObject<SVGSVGElement | null>;
  viewport: CanvasViewport;
  items: CanvasItem[];
  selectedIds?: string[];
  onViewportChange: (viewport: CanvasViewport) => void;
  onItemMove?: (id: string, x: number, y: number, skipAncestorResize?: boolean) => void;
  onItemResize?: (id: string, width: number, height: number) => void;
  onSelect?: (ids: string[]) => void;
  onToggleSelect?: (id: string) => void;
  onBoxSelect?: (rect: { x: number; y: number; width: number; height: number } | null) => void;
  onContextMenu?: (
    position: { x: number; y: number },
    type: 'canvas' | 'node' | 'edge',
    targetId?: string,
  ) => void;
  onDelete?: () => void;
  onDragOverGroup?: (
    groupId: string | null,
    draggedNodeId?: string | null,
    centerX?: number,
    centerY?: number,
  ) => void;
  onDragEnd?: (itemId: string, x: number, y: number, forceReparent?: boolean) => void;
  gridSize?: number;
  locked?: boolean;
  minZoom?: number;
  maxZoom?: number;
  resizeHandleSize?: number;
}

export interface UseCanvasInteractionsResult {
  bindCanvas: {
    onMouseDown: (e: MouseEvent) => void;
    onMouseMove: (e: MouseEvent) => void;
    onMouseUp: (e: MouseEvent) => void;
    onMouseLeave: (e: MouseEvent) => void;
    onWheel: (e: React.WheelEvent) => void;
    onAuxClick: (e: MouseEvent) => void;
    onContextMenu: (e: MouseEvent) => void;
  };
  cursor: string;
  screenToCanvas: (screenX: number, screenY: number) => { x: number; y: number };
  isInteracting: boolean;
  mode: InteractionMode;
}

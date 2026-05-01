/**
 * Canvas Interactions Hook
 *
 * Handles pan/zoom, node drag/resize, multi-select, box selection, context menu.
 *
 * Mouse controls:
 * - Left click on node: select and drag
 * - Left click + Ctrl/Cmd on node: toggle selection (multi-select)
 * - Left click on empty space: start box selection
 * - Middle mouse button: pan the canvas
 * - Scroll wheel: zoom in/out
 * - Right click: context menu
 *
 * Keyboard:
 * - W/A/S/D or Arrow keys: pan
 * - Delete/Backspace: delete selected
 */

import { useCallback, useRef } from 'react';

// rf-canvint-1: types live in `./interactions/types`. Re-export for outside
// consumers (svg-canvas.tsx imports `CanvasItem` from this orchestrator),
// AND import for in-file usages — both lines are required, see the rf-canv-1
// `export-from-and-import-from-pattern` learning.
export type {
  CanvasViewport,
  CanvasItem,
  UseCanvasInteractionsOptions,
  UseCanvasInteractionsResult,
} from './interactions/types.js';

// rf-canvint-2: pure hit-test helpers.
import {
  screenToCanvas as screenToCanvasPure,
  findItemAtPosition as findItemAtPositionPure,
} from './interactions/hit-test.js';
// rf-canvint-1: constants/helpers in `./interactions/state`. rf-canvint-5
// adds `cursorForMode`, which replaces the inline `getCursor` switch.
import { cursorForMode, freshInitialState } from './interactions/state.js';
// rf-canvint-4: keyboard-handler sub-hook.
import { useKeyboardHandlers } from './interactions/use-keyboard-handlers.js';
// rf-canvint-3: mouse-handler sub-hook.
import { useMouseHandlers } from './interactions/use-mouse-handlers.js';
import type {
  CanvasItem,
  InteractionState,
  UseCanvasInteractionsOptions,
  UseCanvasInteractionsResult,
} from './interactions/types.js';

// =============================================================================
// Hook
// =============================================================================

export function useCanvasInteractions({
  svgRef,
  viewport,
  items,
  selectedIds = [],
  onViewportChange,
  onItemMove,
  onItemResize,
  onSelect,
  onToggleSelect,
  onBoxSelect,
  onContextMenu,
  onDelete,
  onDragOverGroup,
  onDragEnd,
  gridSize = 20,
  locked = false,
  minZoom = 0.1,
  maxZoom = 2,
  resizeHandleSize = 20,
}: UseCanvasInteractionsOptions): UseCanvasInteractionsResult {
  const stateRef = useRef<InteractionState>(freshInitialState());
  const lastMousePos = useRef({ x: 0, y: 0 });
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  // rf-canvint-3: hoisted above mouse handlers because `handleMouseDown`
  // reads `spaceHeldRef.current` (Space+left-click → pan). The keyboard
  // sub-hook (rf-canvint-4) writes the ref; the mouse sub-hook reads it.
  // Owning the ref at the orchestrator keeps the cross-hook contract
  // explicit.
  const spaceHeldRef = useRef(false);

  // Screen to canvas coords. The pure helper takes the rect + viewport
  // primitives so it's testable; the closure here snapshots the live
  // refs at each call so the user always sees the current viewport.
  const screenToCanvas = useCallback(
    (screenX: number, screenY: number) => {
      const rect = svgRef.current?.getBoundingClientRect() ?? null;
      return screenToCanvasPure(screenX, screenY, rect, viewportRef.current);
    },
    [svgRef],
  );

  // Hit testing — pure helper takes the items snapshot + zoom + handle
  // size; the closure reads the live refs per call.
  const findItemAtPosition = useCallback(
    (canvasX: number, canvasY: number): { item: CanvasItem | null; isResize: boolean } =>
      findItemAtPositionPure(itemsRef.current, canvasX, canvasY, resizeHandleSize, viewportRef.current.zoom),
    [resizeHandleSize],
  );

  // rf-canvint-3: mouse-event handlers extracted into a sub-hook.
  // Refs flow IN by reference (not snapshot) so all six handlers see live
  // values across the gesture lifetime.
  const { handleMouseDown, handleMouseMove, handleMouseUp, handleWheel, handleAuxClick, handleContextMenu } =
    useMouseHandlers({
      stateRef,
      lastMousePos,
      viewportRef,
      itemsRef,
      selectedIdsRef,
      lockedRef,
      spaceHeldRef,
      svgRef,
      screenToCanvas,
      findItemAtPosition,
      onViewportChange,
      onItemMove,
      onItemResize,
      onSelect,
      onToggleSelect,
      onBoxSelect,
      onContextMenu,
      onDragOverGroup,
      onDragEnd,
      gridSize,
      minZoom,
      maxZoom,
    });

  // Keyboard panning + delete — rf-canvint-4 lifts the implementation
  // into `./interactions/use-keyboard-handlers.ts`. The orchestrator
  // owns the latest-callback refs (so the sub-hook's `[]`-dep effect
  // sees the freshest callback without re-installing window listeners),
  // plus `spaceHeldRef`/`viewportRef`/`lockedRef` (cross-hook refs).
  // `onSelectAllRef.current` is rebuilt every render with the current
  // `items` snapshot — same shape as the verbatim original.
  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;
  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onSelectAllRef = useRef<(() => void) | undefined>(undefined);
  onSelectAllRef.current = () => {
    const allIds = items.map((item) => item.id);
    onSelect?.(allIds);
  };

  useKeyboardHandlers({
    viewportRef,
    lockedRef,
    spaceHeldRef,
    onViewportChangeRef,
    onDeleteRef,
    onSelectRef,
    onSelectAllRef,
  });

  return {
    bindCanvas: {
      onMouseDown: handleMouseDown,
      onMouseMove: handleMouseMove,
      onMouseUp: handleMouseUp,
      onMouseLeave: handleMouseUp,
      onWheel: handleWheel,
      onAuxClick: handleAuxClick,
      onContextMenu: handleContextMenu,
    },
    cursor: cursorForMode(stateRef.current.mode),
    screenToCanvas,
    isInteracting: stateRef.current.mode !== 'none',
    mode: stateRef.current.mode,
  };
}

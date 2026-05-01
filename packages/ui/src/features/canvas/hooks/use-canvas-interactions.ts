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

import { useCallback, useRef, useEffect } from 'react';

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
// rf-canvint-1: constants/helpers in `./interactions/state`.
import { KEYBOARD_PAN_SPEED, freshInitialState } from './interactions/state.js';
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

  // Cursor
  const getCursor = (): string => {
    switch (stateRef.current.mode) {
      case 'pan':
        return 'grabbing';
      case 'drag':
        return 'move';
      case 'resize':
        return 'se-resize';
      case 'boxSelect':
        return 'crosshair';
      default:
        return 'default';
    }
  };

  // Keyboard panning + delete (rf-canvint-4 will lift this into a sub-hook).
  // `spaceHeldRef` is declared above (read by the mouse-handler sub-hook
  // for Space+left-click pan).
  const pressedKeysRef = useRef<Set<string>>(new Set());
  const animationFrameRef = useRef<number | null>(null);
  const isAnimatingRef = useRef(false);
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

  useEffect(() => {
    const updateKeyboardPan = () => {
      if (!isAnimatingRef.current) return;

      const keys = pressedKeysRef.current;
      if (keys.size === 0) {
        isAnimatingRef.current = false;
        animationFrameRef.current = null;
        return;
      }

      const vp = viewportRef.current;
      let panDx = 0;
      let panDy = 0;

      if (keys.has('w') || keys.has('arrowup')) panDy += KEYBOARD_PAN_SPEED;
      if (keys.has('s') || keys.has('arrowdown')) panDy -= KEYBOARD_PAN_SPEED;
      if (keys.has('a') || keys.has('arrowleft')) panDx += KEYBOARD_PAN_SPEED;
      if (keys.has('d') || keys.has('arrowright')) panDx -= KEYBOARD_PAN_SPEED;

      if (panDx !== 0 || panDy !== 0) {
        onViewportChangeRef.current({ ...vp, x: vp.x + panDx, y: vp.y + panDy });
      }

      animationFrameRef.current = requestAnimationFrame(updateKeyboardPan);
    };

    const startKeyboardPan = () => {
      if (!isAnimatingRef.current && pressedKeysRef.current.size > 0) {
        isAnimatingRef.current = true;
        animationFrameRef.current = requestAnimationFrame(updateKeyboardPan);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return;

      const key = e.key.toLowerCase();

      // Track space for space+drag pan
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        spaceHeldRef.current = true;
      }

      const panKeys = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];

      if (panKeys.includes(key)) {
        e.preventDefault();
        pressedKeysRef.current.add(key);
        startKeyboardPan();
      }

      // Delete/Backspace (blocked when canvas locked)
      if ((key === 'delete' || key === 'backspace') && !lockedRef.current) {
        e.preventDefault();
        onDeleteRef.current?.();
      }

      // Escape — deselect all
      if (key === 'escape') {
        e.preventDefault();
        onSelectRef.current?.([]);
      }

      // Ctrl+A — select all
      if (key === 'a' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        onSelectAllRef.current?.();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (e.key === ' ' || e.code === 'Space') spaceHeldRef.current = false;
      pressedKeysRef.current.delete(key);

      if (pressedKeysRef.current.size === 0) {
        isAnimatingRef.current = false;
        if (animationFrameRef.current !== null) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
      }
    };

    const handleBlur = () => {
      pressedKeysRef.current.clear();
      isAnimatingRef.current = false;
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      isAnimatingRef.current = false;
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

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
    cursor: getCursor(),
    screenToCanvas,
    isInteracting: stateRef.current.mode !== 'none',
    mode: stateRef.current.mode,
  };
}

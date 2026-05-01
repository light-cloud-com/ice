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

import { useCallback, useRef, useEffect, type MouseEvent } from 'react';

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
import type {
  CanvasItem,
  DragItemOffset,
  InteractionState,
  InteractionMode,
  UseCanvasInteractionsOptions,
  UseCanvasInteractionsResult,
} from './interactions/types.js';

// rf-canvint-1: constants + helpers in `./interactions/state`.
import { INITIAL_STATE, KEYBOARD_PAN_SPEED, freshInitialState, snapToGrid } from './interactions/state.js';

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

  // Screen to canvas coords
  const screenToCanvas = useCallback(
    (screenX: number, screenY: number) => {
      if (!svgRef.current) return { x: 0, y: 0 };
      const rect = svgRef.current.getBoundingClientRect();
      const vp = viewportRef.current;
      return {
        x: (screenX - rect.left - vp.x) / vp.zoom,
        y: (screenY - rect.top - vp.y) / vp.zoom,
      };
    },
    [svgRef],
  );

  // Hit testing
  const isInResizeHandle = useCallback(
    (item: CanvasItem, canvasX: number, canvasY: number): boolean => {
      const handleSize = resizeHandleSize / viewportRef.current.zoom;
      return (
        canvasX >= item.x + item.width - handleSize &&
        canvasX <= item.x + item.width &&
        canvasY >= item.y + item.height - handleSize &&
        canvasY <= item.y + item.height
      );
    },
    [resizeHandleSize],
  );

  const isInItem = useCallback((item: CanvasItem, canvasX: number, canvasY: number): boolean => {
    return canvasX >= item.x && canvasX <= item.x + item.width && canvasY >= item.y && canvasY <= item.y + item.height;
  }, []);

  const findItemAtPosition = useCallback(
    (canvasX: number, canvasY: number): { item: CanvasItem | null; isResize: boolean } => {
      const currentItems = itemsRef.current;
      for (let i = currentItems.length - 1; i >= 0; i--) {
        const item = currentItems[i];
        if (isInResizeHandle(item, canvasX, canvasY)) {
          return { item, isResize: true };
        }
        if (isInItem(item, canvasX, canvasY)) {
          return { item, isResize: false };
        }
      }
      return { item: null, isResize: false };
    },
    [isInResizeHandle, isInItem],
  );

  // Mouse down
  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      lastMousePos.current = { x: e.clientX, y: e.clientY };

      // Middle mouse or Space+left click — pan
      if (e.button === 1 || (e.button === 0 && spaceHeldRef.current)) {
        e.preventDefault();
        stateRef.current = {
          ...INITIAL_STATE,
          mode: 'pan',
          startX: e.clientX,
          startY: e.clientY,
        };
        return;
      }

      // Left button only
      if (e.button !== 0) return;

      const canvasPos = screenToCanvas(e.clientX, e.clientY);
      const { item, isResize } = findItemAtPosition(canvasPos.x, canvasPos.y);

      const isMultiSelect = e.ctrlKey || e.metaKey;

      if (item) {
        if (isMultiSelect) {
          // Toggle this item's selection
          onToggleSelect?.(item.id);
          return;
        }

        // Always select the clicked item (child), not its parent
        if (!selectedIdsRef.current.includes(item.id)) {
          onSelect?.([item.id]);
        }

        // For drag operations, use the clicked item as the drag target
        const dragTarget = item;

        if (lockedRef.current) return; // Canvas locked — allow selection but no drag/resize

        if (isResize && onItemResize) {
          stateRef.current = {
            ...INITIAL_STATE,
            mode: 'resize',
            itemId: item.id,
            startX: e.clientX,
            startY: e.clientY,
            startItemX: item.x,
            startItemY: item.y,
            startItemWidth: item.width,
            startItemHeight: item.height,
            dragItemOffsets: new Map(),
          };
        } else if (onItemMove) {
          // Build offsets for all selected items (multi-drag support)
          const offsets = new Map<string, DragItemOffset>();
          const currentSelected = selectedIdsRef.current;
          if (currentSelected.length > 1 && currentSelected.includes(dragTarget.id)) {
            // Filter: only include top-level items (whose parent is NOT also selected)
            for (const id of currentSelected) {
              if (id === dragTarget.id) continue;
              const otherItem = itemsRef.current.find((i) => i.id === id);
              if (!otherItem) continue;
              // Skip if parent is also selected (will be moved by parent's handleNodeMove)
              if (otherItem.parentId && currentSelected.includes(otherItem.parentId)) continue;
              offsets.set(id, {
                dx: otherItem.x - dragTarget.x,
                dy: otherItem.y - dragTarget.y,
                startX: otherItem.x,
                startY: otherItem.y,
              });
            }
          }

          stateRef.current = {
            ...INITIAL_STATE,
            mode: 'drag',
            itemId: dragTarget.id,
            startX: e.clientX,
            startY: e.clientY,
            startItemX: dragTarget.x,
            startItemY: dragTarget.y,
            startItemWidth: dragTarget.width,
            startItemHeight: dragTarget.height,
            dragItemOffsets: offsets,
          };

          // Shift+mousedown: immediately trigger lift effect (don't wait for drag move)
          if (e.shiftKey && onDragOverGroup) {
            onDragOverGroup(null, dragTarget.id);
          }
        }
      } else {
        // Click on empty space — start box selection
        stateRef.current = {
          ...INITIAL_STATE,
          mode: 'boxSelect',
          startX: e.clientX,
          startY: e.clientY,
          boxStartCanvasX: canvasPos.x,
          boxStartCanvasY: canvasPos.y,
        };
        // Clear selection immediately if not holding Ctrl
        if (!isMultiSelect) {
          onSelect?.([]);
        }
      }
    },
    [screenToCanvas, findItemAtPosition, onSelect, onToggleSelect, onItemMove, onItemResize, onDragOverGroup],
  );

  // Mouse move
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const state = stateRef.current;
      if (state.mode === 'none') return;

      const vp = viewportRef.current;
      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;
      lastMousePos.current = { x: e.clientX, y: e.clientY };

      if (state.mode === 'pan') {
        onViewportChange({ ...vp, x: vp.x + dx, y: vp.y + dy });
      } else if (state.mode === 'drag' && state.itemId && onItemMove) {
        const totalDx = e.clientX - state.startX;
        const totalDy = e.clientY - state.startY;
        const rawX = state.startItemX + totalDx / vp.zoom;
        const rawY = state.startItemY + totalDy / vp.zoom;
        const newX = gridSize > 0 ? snapToGrid(rawX, gridSize) : rawX;
        const newY = gridSize > 0 ? snapToGrid(rawY, gridSize) : rawY;

        // When Shift is held, skip ancestor container resizing (user intends to reparent/detach)
        const skipResize = e.shiftKey;

        // Move the primary drag item
        onItemMove(state.itemId, newX, newY, skipResize);

        // Move all other selected items (multi-drag)
        for (const [otherId, offset] of state.dragItemOffsets) {
          const otherRawX = newX + offset.dx;
          const otherRawY = newY + offset.dy;
          const otherX = gridSize > 0 ? snapToGrid(otherRawX, gridSize) : otherRawX;
          const otherY = gridSize > 0 ? snapToGrid(otherRawY, gridSize) : otherRawY;
          onItemMove(otherId, otherX, otherY, skipResize);
        }

        // Notify about drag-over group detection (only when Shift is held for reparenting)
        if (onDragOverGroup) {
          if (e.shiftKey) {
            const centerX = newX + state.startItemWidth / 2;
            const centerY = newY + state.startItemHeight / 2;
            // Pass center coordinates so handleDragOverGroup can do its own
            // container search across all nesting levels
            onDragOverGroup(null, state.itemId, centerX, centerY);
          } else {
            onDragOverGroup(null, null);
          }
        }
      } else if (state.mode === 'resize' && state.itemId && onItemResize) {
        const totalDx = e.clientX - state.startX;
        const totalDy = e.clientY - state.startY;
        const rawW = Math.max(100, state.startItemWidth + totalDx / vp.zoom);
        const rawH = Math.max(60, state.startItemHeight + totalDy / vp.zoom);
        const newWidth = gridSize > 0 ? snapToGrid(rawW, gridSize) : rawW;
        const newHeight = gridSize > 0 ? snapToGrid(rawH, gridSize) : rawH;
        onItemResize(state.itemId, newWidth, newHeight);
      } else if (state.mode === 'boxSelect') {
        const currentCanvas = screenToCanvas(e.clientX, e.clientY);
        const x = Math.min(state.boxStartCanvasX, currentCanvas.x);
        const y = Math.min(state.boxStartCanvasY, currentCanvas.y);
        const width = Math.abs(currentCanvas.x - state.boxStartCanvasX);
        const height = Math.abs(currentCanvas.y - state.boxStartCanvasY);

        // Only start showing box after a small threshold (5px)
        if (width > 5 || height > 5) {
          onBoxSelect?.({ x, y, width, height });
        }
      }
    },
    [screenToCanvas, onViewportChange, onItemMove, onItemResize, onBoxSelect, onDragOverGroup, gridSize],
  );

  // Mouse up
  const handleMouseUp = useCallback(
    (_e: MouseEvent) => {
      const state = stateRef.current;

      // Notify drag end for re-parenting
      if (state.mode === 'drag' && state.itemId && onDragEnd) {
        const vp = viewportRef.current;
        const totalDx = _e.clientX - state.startX;
        const totalDy = _e.clientY - state.startY;
        const newX = state.startItemX + totalDx / vp.zoom;
        const newY = state.startItemY + totalDy / vp.zoom;
        // Shift held = explicitly reparent into container at drop position
        const forceReparent = _e.shiftKey;
        onDragEnd(state.itemId, newX, newY, forceReparent);

        // Also notify drag end for all other selected items (multi-drag)
        for (const [otherId, offset] of state.dragItemOffsets) {
          onDragEnd(otherId, newX + offset.dx, newY + offset.dy, forceReparent);
        }

        // Clear drag-over highlight and shift-drag state
        onDragOverGroup?.(null, null);
      }

      if (state.mode === 'boxSelect') {
        // Finish box selection — find items inside the rect
        const currentCanvas = screenToCanvas(_e.clientX, _e.clientY);
        const x = Math.min(state.boxStartCanvasX, currentCanvas.x);
        const y = Math.min(state.boxStartCanvasY, currentCanvas.y);
        const width = Math.abs(currentCanvas.x - state.boxStartCanvasX);
        const height = Math.abs(currentCanvas.y - state.boxStartCanvasY);

        if (width > 5 || height > 5) {
          // Find all items that intersect with the box
          const selectedItemIds = itemsRef.current
            .filter((item) => {
              return item.x + item.width > x && item.x < x + width && item.y + item.height > y && item.y < y + height;
            })
            .map((item) => item.id);

          onSelect?.(selectedItemIds);
        }

        // Clear the box rect
        onBoxSelect?.(null);
      }

      stateRef.current = freshInitialState();
    },
    [screenToCanvas, onSelect, onBoxSelect, onDragEnd, onDragOverGroup],
  );

  // Wheel — zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      if (!svgRef.current) return;

      const rect = svgRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const vp = viewportRef.current;

      // Smooth continuous zoom — layout re-org is debounced separately
      const zoomFactor = e.deltaY > 0 ? 0.95 : 1.05;
      const newZoom = Math.max(minZoom, Math.min(maxZoom, vp.zoom * zoomFactor));
      const zoomRatio = newZoom / vp.zoom;
      const newX = mouseX - (mouseX - vp.x) * zoomRatio;
      const newY = mouseY - (mouseY - vp.y) * zoomRatio;

      onViewportChange({ x: newX, y: newY, zoom: newZoom });
    },
    [svgRef, minZoom, maxZoom, onViewportChange],
  );

  // Aux click — prevent middle-click auto-scroll
  const handleAuxClick = useCallback((e: MouseEvent) => {
    if (e.button === 1) e.preventDefault();
  }, []);

  // Context menu — right-click
  const handleContextMenu = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();

      if (!onContextMenu) return;

      const canvasPos = screenToCanvas(e.clientX, e.clientY);
      const { item } = findItemAtPosition(canvasPos.x, canvasPos.y);

      if (item) {
        // Right-click on a node
        if (!selectedIdsRef.current.includes(item.id)) {
          onSelect?.([item.id]);
        }
        onContextMenu({ x: e.clientX, y: e.clientY }, 'node', item.id);
      } else {
        // Right-click on empty canvas
        onContextMenu({ x: e.clientX, y: e.clientY }, 'canvas');
      }
    },
    [screenToCanvas, findItemAtPosition, onContextMenu, onSelect],
  );

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

  // Keyboard panning + delete
  const pressedKeysRef = useRef<Set<string>>(new Set());
  const animationFrameRef = useRef<number | null>(null);
  const isAnimatingRef = useRef(false);
  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;
  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;
  const spaceHeldRef = useRef(false);
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

/**
 * rf-canvint-3: Mouse-handler sub-hook for the canvas-interactions
 * group.
 *
 * Bundles the six mouse-event callbacks (`handleMouseDown`,
 * `handleMouseMove`, `handleMouseUp`, `handleWheel`, `handleAuxClick`,
 * `handleContextMenu`) into one sub-hook. The orchestrator owns ALL
 * the refs (`stateRef`, `lastMousePos`, `viewportRef`, `itemsRef`,
 * `selectedIdsRef`, `lockedRef`, `spaceHeldRef`) and the `svgRef`,
 * and threads them in by reference — the live-by-ref invariant is
 * preserved verbatim, the sub-hook never snapshots them.
 *
 * The shape mirrors the original closure bodies one-for-one. No
 * behavior change: same gesture transitions, same reset semantics,
 * same multi-drag offset map, same shift-key reparent semantics.
 *
 * Discovered: rf-canv-2
 * `inline-classification-duplications-are-not-actually-duplicates` —
 * the six handlers each fan out into different gesture sub-modes
 * (pan/drag/resize/boxSelect/etc.) and intentionally share the same
 * `stateRef` Map identity. Bundling them is correct; trying to split
 * each gesture into its own sub-hook would force the Map's identity
 * (and the `lastMousePos` / `stateRef` cross-handler reads) through
 * an extra abstraction layer that gains nothing.
 */

import { useCallback, type MouseEvent, type MutableRefObject, type RefObject } from 'react';
import { freshInitialState, INITIAL_STATE, snapToGrid } from './state';
import { SCALE_MAX, SCALE_MIN } from '../../../../config/canvas-constants';
import type {
  CanvasItem,
  CanvasViewport,
  DragItemOffset,
  InteractionState,
  UseCanvasInteractionsOptions,
} from './types';

interface UseMouseHandlersDeps {
  // Refs owned by the orchestrator — passed by reference (NOT snapshotted)
  // so all handlers see live values across the gesture lifetime. The
  // orchestrator builds these via `useRef<T>(initial)` which returns
  // `MutableRefObject<T>` (writable + non-null `.current`); typing them
  // as `MutableRefObject` here mirrors the orchestrator's actual ref
  // shape and lets the handler bodies write back into `stateRef.current`
  // and `lastMousePos.current` without `RefObject<T>`'s readonly guard.
  stateRef: MutableRefObject<InteractionState>;
  lastMousePos: MutableRefObject<{ x: number; y: number }>;
  viewportRef: MutableRefObject<CanvasViewport>;
  itemsRef: MutableRefObject<CanvasItem[]>;
  selectedIdsRef: MutableRefObject<string[]>;
  lockedRef: MutableRefObject<boolean>;
  spaceHeldRef: MutableRefObject<boolean>;
  // svgRef is an external ref forwarded from the parent (svg-canvas.tsx
  // passes its own `useRef<SVGSVGElement>(null)`); the `.current` IS
  // nullable here.
  svgRef: RefObject<SVGSVGElement | null>;

  // Closures from the orchestrator that snapshot live refs per call.
  screenToCanvas: (screenX: number, screenY: number) => { x: number; y: number };
  findItemAtPosition: (canvasX: number, canvasY: number) => { item: CanvasItem | null; isResize: boolean };

  // Option callbacks + scalars threaded through verbatim.
  onViewportChange: UseCanvasInteractionsOptions['onViewportChange'];
  onItemMove: UseCanvasInteractionsOptions['onItemMove'];
  onItemResize: UseCanvasInteractionsOptions['onItemResize'];
  onSelect: UseCanvasInteractionsOptions['onSelect'];
  onToggleSelect: UseCanvasInteractionsOptions['onToggleSelect'];
  onBoxSelect: UseCanvasInteractionsOptions['onBoxSelect'];
  onContextMenu: UseCanvasInteractionsOptions['onContextMenu'];
  onDragOverGroup: UseCanvasInteractionsOptions['onDragOverGroup'];
  onDragEnd: UseCanvasInteractionsOptions['onDragEnd'];
  gridSize: number;
}

interface UseMouseHandlersResult {
  handleMouseDown: (e: MouseEvent) => void;
  handleMouseMove: (e: MouseEvent) => void;
  handleMouseUp: (e: MouseEvent) => void;
  handleWheel: (e: React.WheelEvent) => void;
  handleAuxClick: (e: MouseEvent) => void;
  handleContextMenu: (e: MouseEvent) => void;
}

export function useMouseHandlers(deps: UseMouseHandlersDeps): UseMouseHandlersResult {
  const {
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
  } = deps;

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
    [
      itemsRef,
      lastMousePos,
      lockedRef,
      selectedIdsRef,
      spaceHeldRef,
      stateRef,
      screenToCanvas,
      findItemAtPosition,
      onSelect,
      onToggleSelect,
      onItemMove,
      onItemResize,
      onDragOverGroup,
    ],
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
    [
      lastMousePos,
      stateRef,
      viewportRef,
      screenToCanvas,
      onViewportChange,
      onItemMove,
      onItemResize,
      onBoxSelect,
      onDragOverGroup,
      gridSize,
    ],
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
    [itemsRef, stateRef, viewportRef, screenToCanvas, onSelect, onBoxSelect, onDragEnd, onDragOverGroup],
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
      const newZoom = Math.max(SCALE_MIN, Math.min(SCALE_MAX, vp.zoom * zoomFactor));
      const zoomRatio = newZoom / vp.zoom;
      const newX = mouseX - (mouseX - vp.x) * zoomRatio;
      const newY = mouseY - (mouseY - vp.y) * zoomRatio;

      onViewportChange({ x: newX, y: newY, zoom: newZoom });
    },
    [svgRef, viewportRef, SCALE_MIN, SCALE_MAX, onViewportChange],
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
    [selectedIdsRef, screenToCanvas, findItemAtPosition, onContextMenu, onSelect],
  );

  return {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleWheel,
    handleAuxClick,
    handleContextMenu,
  };
}

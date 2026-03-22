/**
 * Canvas Mouse Events Hook
 *
 * Handles all mouse interactions for the SVG canvas:
 * - Pan (drag on empty space, middle mouse, or space+drag)
 * - Zoom (scroll wheel with zoom-to-cursor)
 * - Element drag with optional snap-to-grid
 * - Element resize
 * - Selection (single, multi with Ctrl, box selection)
 * - Connection creation
 */

import { useCallback, useState, useRef, useEffect, type RefObject } from 'react';
import type { ViewState, CanvasNode } from '../components/svg-canvas';
import type { Point } from './use-canvas-utils';

// =============================================================================
// Types
// =============================================================================

type DragType = 'canvas' | 'element' | 'resize' | 'selection' | 'connection' | null;

interface DragState {
  isDragging: boolean;
  dragType: DragType;
  draggedNodeId: string | null;
  dragOffset: Point;
  startPos: Point;
  /** For resize: which corner/edge is being dragged */
  resizeHandle: 'se' | 'sw' | 'ne' | 'nw' | 'e' | 'w' | 'n' | 's' | null;
  /** Original node dimensions when resize started */
  originalBounds: { x: number; y: number; width: number; height: number } | null;
}

interface UseCanvasMouseEventsProps {
  svgRef: RefObject<SVGSVGElement>;
  viewState: ViewState;
  nodes: CanvasNode[];
  screenToCanvas: (screenX: number, screenY: number) => Point;
  onViewStateChange: (viewState: ViewState) => void;
  onNodeMove: (nodeId: string, x: number, y: number) => void;
  onNodeResize?: (nodeId: string, width: number, height: number, x?: number, y?: number) => void;
  onSelect: (nodeIds: string[]) => void;
  /** Grid size for snap-to-grid (0 = disabled) */
  gridSize?: number;
  /** Enable snap-to-grid */
  snapToGrid?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

const SCALE_MIN = 0.1;
const SCALE_MAX = 3;
const ZOOM_SENSITIVITY = 0.002; // Smoother zoom
const RESIZE_HANDLE_SIZE = 24; // Size of resize hit area (larger for easier grabbing)

// =============================================================================
// Hook
// =============================================================================

export const useCanvasMouseEvents = ({
  svgRef,
  viewState,
  nodes,
  screenToCanvas,
  onViewStateChange,
  onNodeMove,
  onNodeResize,
  onSelect,
  gridSize = 20,
  snapToGrid = false,
}: UseCanvasMouseEventsProps) => {
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    dragType: null,
    draggedNodeId: null,
    dragOffset: { x: 0, y: 0 },
    startPos: { x: 0, y: 0 },
    resizeHandle: null,
    originalBounds: null,
  });

  // Track if space is pressed for pan mode
  const [spacePressed, setSpacePressed] = useState(false);
  const lastPanPos = useRef<Point>({ x: 0, y: 0 });

  // Keyboard listeners for space key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        setSpacePressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setSpacePressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  /**
   * Snap a value to grid
   */
  const snapValue = useCallback(
    (value: number): number => {
      if (!snapToGrid || gridSize <= 0) return value;
      return Math.round(value / gridSize) * gridSize;
    },
    [snapToGrid, gridSize],
  );

  /**
   * Handle mouse wheel for zooming (zoom towards cursor)
   */
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();

      if (!svgRef.current) return;

      const rect = svgRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Smoother zoom calculation
      const zoomDelta = -e.deltaY * ZOOM_SENSITIVITY;
      const zoomFactor = Math.exp(zoomDelta);
      const newScale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, viewState.scale * zoomFactor));

      // Zoom towards mouse position
      const scaleRatio = newScale / viewState.scale;
      const newPanX = mouseX - (mouseX - viewState.panX) * scaleRatio;
      const newPanY = mouseY - (mouseY - viewState.panY) * scaleRatio;

      onViewStateChange({
        scale: newScale,
        panX: newPanX,
        panY: newPanY,
      });
    },
    [svgRef, viewState, onViewStateChange],
  );

  /**
   * Check if position is on a resize handle
   */
  const getResizeHandle = useCallback(
    (node: CanvasNode, canvasPos: Point): DragState['resizeHandle'] => {
      const handleSize = RESIZE_HANDLE_SIZE / viewState.scale;
      const { x, y, width, height } = node;

      // Check corners first (higher priority)
      // Bottom-right
      if (
        canvasPos.x >= x + width - handleSize &&
        canvasPos.x <= x + width &&
        canvasPos.y >= y + height - handleSize &&
        canvasPos.y <= y + height
      ) {
        return 'se';
      }

      return null;
    },
    [viewState.scale],
  );

  /**
   * Find node at canvas position
   */
  const findNodeAtPosition = useCallback(
    (canvasPos: Point): { node: CanvasNode | null; resizeHandle: DragState['resizeHandle'] } => {
      // Sort by parent (children first) so we select children over parents
      const sortedNodes = [...nodes].sort((a, b) => {
        if (a.parentId && !b.parentId) return -1;
        if (!a.parentId && b.parentId) return 1;
        return 0;
      });

      for (const node of sortedNodes) {
        // Check if on resize handle first
        const handle = getResizeHandle(node, canvasPos);
        if (handle) {
          return { node, resizeHandle: handle };
        }

        // Check if inside node bounds
        if (
          canvasPos.x >= node.x &&
          canvasPos.x <= node.x + node.width &&
          canvasPos.y >= node.y &&
          canvasPos.y <= node.y + node.height
        ) {
          return { node, resizeHandle: null };
        }
      }
      return { node: null, resizeHandle: null };
    },
    [nodes, getResizeHandle],
  );

  /**
   * Handle mouse down - start drag operations
   */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 2) return; // Ignore right click

      const canvasPos = screenToCanvas(e.clientX, e.clientY);
      const isMiddleButton = e.button === 1;
      const isCtrlPressed = e.ctrlKey || e.metaKey;

      // Middle mouse or space+click = always pan
      if (isMiddleButton || spacePressed) {
        e.preventDefault();
        lastPanPos.current = { x: e.clientX, y: e.clientY };
        setDragState({
          isDragging: true,
          dragType: 'canvas',
          draggedNodeId: null,
          dragOffset: { x: 0, y: 0 },
          startPos: { x: e.clientX, y: e.clientY },
          resizeHandle: null,
          originalBounds: null,
        });
        return;
      }

      // Check if clicking on a node or resize handle
      const { node: clickedNode, resizeHandle } = findNodeAtPosition(canvasPos);

      if (clickedNode) {
        // Select the node
        if (!isCtrlPressed) {
          onSelect([clickedNode.id]);
        }

        if (resizeHandle && onNodeResize) {
          // Start resize
          setDragState({
            isDragging: true,
            dragType: 'resize',
            draggedNodeId: clickedNode.id,
            dragOffset: { x: 0, y: 0 },
            startPos: canvasPos,
            resizeHandle,
            originalBounds: {
              x: clickedNode.x,
              y: clickedNode.y,
              width: clickedNode.width,
              height: clickedNode.height,
            },
          });
        } else {
          // Start element drag
          setDragState({
            isDragging: true,
            dragType: 'element',
            draggedNodeId: clickedNode.id,
            dragOffset: {
              x: canvasPos.x - clickedNode.x,
              y: canvasPos.y - clickedNode.y,
            },
            startPos: canvasPos,
            resizeHandle: null,
            originalBounds: null,
          });
        }
      } else {
        // Clear selection when clicking empty space
        if (!isCtrlPressed) {
          onSelect([]);
        }

        // Start canvas pan
        lastPanPos.current = { x: e.clientX, y: e.clientY };
        setDragState({
          isDragging: true,
          dragType: 'canvas',
          draggedNodeId: null,
          dragOffset: { x: 0, y: 0 },
          startPos: { x: e.clientX, y: e.clientY },
          resizeHandle: null,
          originalBounds: null,
        });
      }
    },
    [screenToCanvas, findNodeAtPosition, onSelect, onNodeResize, spacePressed],
  );

  /**
   * Handle mouse move - update drag operations
   */
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragState.isDragging) return;

      if (dragState.dragType === 'canvas') {
        // Pan the canvas - use delta from last position for smoother panning
        const dx = e.clientX - lastPanPos.current.x;
        const dy = e.clientY - lastPanPos.current.y;

        lastPanPos.current = { x: e.clientX, y: e.clientY };

        onViewStateChange({
          ...viewState,
          panX: viewState.panX + dx,
          panY: viewState.panY + dy,
        });
      } else if (dragState.dragType === 'element' && dragState.draggedNodeId) {
        // Move the element
        const canvasPos = screenToCanvas(e.clientX, e.clientY);
        let newX = canvasPos.x - dragState.dragOffset.x;
        let newY = canvasPos.y - dragState.dragOffset.y;

        // Apply snap-to-grid
        newX = snapValue(newX);
        newY = snapValue(newY);

        onNodeMove(dragState.draggedNodeId, newX, newY);
      } else if (
        dragState.dragType === 'resize' &&
        dragState.draggedNodeId &&
        dragState.originalBounds &&
        onNodeResize
      ) {
        // Resize the element
        const canvasPos = screenToCanvas(e.clientX, e.clientY);
        const { originalBounds, resizeHandle } = dragState;

        let newWidth = originalBounds.width;
        let newHeight = originalBounds.height;
        let newX = originalBounds.x;
        let newY = originalBounds.y;

        if (resizeHandle === 'se') {
          // Southeast corner - resize width and height
          newWidth = Math.max(100, canvasPos.x - originalBounds.x);
          newHeight = Math.max(60, canvasPos.y - originalBounds.y);
        }

        // Apply snap-to-grid
        newWidth = snapValue(newWidth);
        newHeight = snapValue(newHeight);

        onNodeResize(dragState.draggedNodeId, newWidth, newHeight, newX, newY);
      }
    },
    [dragState, viewState, screenToCanvas, onViewStateChange, onNodeMove, onNodeResize, snapValue],
  );

  /**
   * Handle mouse up - finish drag operations
   */
  const handleMouseUp = useCallback(() => {
    setDragState({
      isDragging: false,
      dragType: null,
      draggedNodeId: null,
      dragOffset: { x: 0, y: 0 },
      startPos: { x: 0, y: 0 },
      resizeHandle: null,
      originalBounds: null,
    });
  }, []);

  /**
   * Get cursor style based on current state
   */
  const getCursor = useCallback((): string => {
    if (spacePressed || dragState.dragType === 'canvas') {
      return dragState.isDragging ? 'grabbing' : 'grab';
    }
    if (dragState.dragType === 'resize') {
      return 'se-resize';
    }
    if (dragState.dragType === 'element') {
      return 'move';
    }
    return 'default';
  }, [spacePressed, dragState]);

  return {
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    dragState,
    getCursor,
    spacePressed,
  };
};

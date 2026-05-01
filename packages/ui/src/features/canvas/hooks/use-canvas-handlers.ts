/**
 * useCanvasHandlers
 *
 * Bundles the nine event-handler `useCallback`s the canvas orchestrator
 * (`svg-canvas.tsx`) wires into the per-node renderer, the connection
 * layer, the canvas interactions hook, and the inline JSX surface:
 *
 *  - `handleDeleteSelected`      — Delete-key dispatch: deletes every
 *                                   currently-selected node id, then
 *                                   clears the selection.
 *  - `handleNodeHover`           — sets `hoveredNodeId` for connected-edge
 *                                   highlighting.
 *  - `handleConnectionHover`     — sets the per-connection tooltip info
 *                                   (follows mouse, rendered as HTML
 *                                   overlay).
 *  - `handleEdgeDelete`          — dispatches `deleteCardEdge`.
 *  - `handleEdgeSelect`          — dispatches `setSelectedNodes([])` then
 *                                   `setSelectedEdges([connectionId])`.
 *  - `handleUpdateNodeData`      — dispatches `updateCardNodeData` for
 *                                   inline +/- scaling and other in-node
 *                                   controls.
 *  - `handlePipelineClick`       — selects a node to surface its pipeline
 *                                   in the properties panel.
 *  - `handleContextMenu`         — converts a viewport-space click to
 *                                   canvas-space, then dispatches
 *                                   `openContextMenu`. Closes over the
 *                                   live viewport reference and an
 *                                   `svgRef` for `getBoundingClientRect()`.
 *  - `handleCanvasClick`         — `onMouseDown` on the outer container;
 *                                   forwards to the optional `onFocus`
 *                                   prop so callers can mark this canvas
 *                                   pane as focused for split-view input
 *                                   routing.
 *
 * The hook also owns two pieces of orchestrator-private state — the
 * `hoveredNodeId` for highlighting connected edges and the per-connection
 * `ConnectionTooltipInfo` shown as an HTML overlay. Both setters are
 * exposed because the JSX surface itself drives them on `onMouseDown` /
 * `onMouseLeave` to dismiss any lingering tooltip.
 *
 * Behavior preserved verbatim from the inline cluster previously in
 * `svg-canvas.tsx` L390-661 (rf-canv2-3).
 *
 * rf-canv2-3.
 */

import { useCallback, useState } from 'react';
import { useDispatch } from 'react-redux';
import {
  deleteCardNode,
  deleteCardEdge,
  updateCardNodeData,
} from '../../../store/slices/cards-slice';
import {
  setSelectedNodes,
  setSelectedEdges,
} from '../../../store/slices/selection-slice';
import { openContextMenu } from '../../../store/slices/ui-slice';
import type { ConnectionTooltipInfo } from '../components/svg-connection-path';
import type { AppDispatch } from '../../../store';

/**
 * The orchestrator's local viewport shape (NOT the `ViewState` exported
 * from `./types` — that one is `{ scale, panX, panY }` for canvas-grid
 * consumption). `useCanvasViewport` returns this `{x, y, zoom}` shape and
 * the context-menu handler closes over `viewport.{x, y, zoom}` directly.
 */
export interface CanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface UseCanvasHandlersArgs {
  /** Currently-selected node ids — needed by handleDeleteSelected. */
  selectedNodes: string[];
  /** Live viewport (zoom + pan) — closure dep of handleContextMenu. */
  viewport: CanvasViewport;
  /** SVG element ref — `getBoundingClientRect()` for screen→canvas math. */
  svgRef: React.RefObject<SVGSVGElement | null>;
  /** Optional outer-container click hook (split-pane focus). */
  onFocus?: () => void;
}

export interface UseCanvasHandlersResult {
  hoveredNodeId: string | null;
  setHoveredNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  connTooltip: ConnectionTooltipInfo | null;
  setConnTooltip: React.Dispatch<React.SetStateAction<ConnectionTooltipInfo | null>>;
  handleDeleteSelected: () => void;
  handleNodeHover: (nodeId: string | null) => void;
  handleConnectionHover: (info: ConnectionTooltipInfo | null) => void;
  handleEdgeDelete: (connectionId: string) => void;
  handleEdgeSelect: (connectionId: string) => void;
  handleUpdateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  handlePipelineClick: (nodeId: string) => void;
  handleContextMenu: (
    position: { x: number; y: number },
    type: 'canvas' | 'node' | 'edge',
    targetId?: string,
  ) => void;
  handleCanvasClick: () => void;
}

export function useCanvasHandlers(args: UseCanvasHandlersArgs): UseCanvasHandlersResult {
  const { selectedNodes, viewport, svgRef, onFocus } = args;
  const dispatch = useDispatch<AppDispatch>();

  // Track which node is hovered (for highlighting connected edges)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  // Track connection tooltip (follows mouse)
  const [connTooltip, setConnTooltip] = useState<ConnectionTooltipInfo | null>(null);

  // Handle delete selected nodes
  const handleDeleteSelected = useCallback(() => {
    for (const nodeId of selectedNodes) {
      dispatch(deleteCardNode(nodeId));
    }
    dispatch(setSelectedNodes([]));
  }, [selectedNodes, dispatch]);

  const handleNodeHover = useCallback((nodeId: string | null) => {
    setHoveredNodeId(nodeId);
  }, []);

  const handleConnectionHover = useCallback((info: ConnectionTooltipInfo | null) => {
    setConnTooltip(info);
  }, []);

  const handleEdgeDelete = useCallback(
    (connectionId: string) => {
      dispatch(deleteCardEdge(connectionId));
    },
    [dispatch],
  );

  const handleEdgeSelect = useCallback(
    (connectionId: string) => {
      dispatch(setSelectedNodes([]));
      dispatch(setSelectedEdges([connectionId]));
    },
    [dispatch],
  );

  // Update node data fields (for inline controls like +/- scaling).
  // Property propagation (repo sync, domain sync, etc.) is handled
  // reactively by useComputingFlows() — no manual forwarding needed.
  const handleUpdateNodeData = useCallback(
    (nodeId: string, data: Record<string, unknown>) => {
      dispatch(updateCardNodeData({ nodeId, data }));
    },
    [dispatch],
  );

  // Select node to show pipeline in properties panel
  const handlePipelineClick = useCallback(
    (nodeId: string) => {
      dispatch(setSelectedNodes([nodeId]));
      dispatch(setSelectedEdges([]));
    },
    [dispatch],
  );

  // Handle context menu
  const handleContextMenu = useCallback(
    (
      position: { x: number; y: number },
      type: 'canvas' | 'node' | 'edge',
      targetId?: string,
    ) => {
      // Compute canvas position from viewport (avoids dependency on screenToCanvas)
      const rect = svgRef.current?.getBoundingClientRect();
      const canvasPos = rect
        ? {
            x: (position.x - rect.left - viewport.x) / viewport.zoom,
            y: (position.y - rect.top - viewport.y) / viewport.zoom,
          }
        : { x: 0, y: 0 };
      dispatch(openContextMenu({ position, canvasPosition: canvasPos, type, targetId }));
    },
    [dispatch, viewport.x, viewport.y, viewport.zoom, svgRef],
  );

  // Handle focus/click on canvas
  const handleCanvasClick = useCallback(() => {
    onFocus?.();
  }, [onFocus]);

  return {
    hoveredNodeId,
    setHoveredNodeId,
    connTooltip,
    setConnTooltip,
    handleDeleteSelected,
    handleNodeHover,
    handleConnectionHover,
    handleEdgeDelete,
    handleEdgeSelect,
    handleUpdateNodeData,
    handlePipelineClick,
    handleContextMenu,
    handleCanvasClick,
  };
}

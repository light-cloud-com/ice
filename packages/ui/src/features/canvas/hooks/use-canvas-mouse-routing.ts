/**
 * useCanvasMouseRouting
 *
 * Routes the SVG element's mouse events between three concerns:
 *   1. Connection-tooltip dismissal (`setConnTooltip(null)` on every
 *      onMouseDown / onMouseLeave entry — keeps stale tooltips off the
 *      cursor while another interaction starts).
 *   2. Connection-port drags (when the cursor's onMouseDown target has
 *      the `.connection-port` class, the port-drag handler claims the
 *      event and the canvas pan/select handlers are skipped). Per
 *      blueprint risk #5 the classList sniff lives on the orchestrator
 *      side so port-drag and pan/select stay disjoint at the dispatch
 *      seam.
 *   3. Canvas pan/select/box-select (when no port-drag and no in-flight
 *      connection draw, `bindCanvas` from `useCanvasInteractions` owns
 *      the event).
 *
 * The output is a bundle of six handlers — onMouseDown, onMouseMove,
 * onMouseUp, onMouseLeave, onAuxClick, onContextMenu — that the
 * orchestrator can spread directly onto its `<svg>`.
 *
 * Behavior preserved verbatim from the inline arrow-function block in
 * `svg-canvas.tsx` (rf-svgcv2-2). No memoization wrap added — the
 * orchestrator instantiates the hook on every render and passes fresh
 * functions to the SVG; React's diff is cheap here because the SVG
 * never goes through React.memo.
 */

import type React from 'react';

import type { useCanvasInteractions } from './use-canvas-interactions';

type CanvasInteractionsBindings = ReturnType<typeof useCanvasInteractions>['bindCanvas'];

export interface UseCanvasMouseRoutingArgs {
  /** Canvas pan/select/box-select bindings from useCanvasInteractions. */
  bindCanvas: CanvasInteractionsBindings;
  /** Truthy when the user is mid-drag from a connection port. Routes
   *  onMouseMove / onMouseUp to the connection handlers instead of
   *  bindCanvas. */
  drawingConnection: unknown;
  /** Connection-port drag-start handler. Pre-gated on the SVG event
   *  target's `.connection-port` class. */
  handleConnectionPortDown: (e: React.MouseEvent) => void;
  /** Connection-drag onMouseMove. */
  handleConnectionMove: (e: React.MouseEvent) => void;
  /** Connection-drag onMouseUp. */
  handleConnectionEnd: (e: React.MouseEvent) => void;
  /** Tooltip dismiss setter (passed through from useCanvasHandlers). */
  setConnTooltip: (info: null) => void;
}

export interface SvgMouseHandlers {
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseUp: (e: React.MouseEvent) => void;
  onMouseLeave: (e: React.MouseEvent) => void;
  onAuxClick: CanvasInteractionsBindings['onAuxClick'];
  onContextMenu: CanvasInteractionsBindings['onContextMenu'];
}

export function useCanvasMouseRouting(args: UseCanvasMouseRoutingArgs): SvgMouseHandlers {
  const {
    bindCanvas,
    drawingConnection,
    handleConnectionPortDown,
    handleConnectionMove,
    handleConnectionEnd,
    setConnTooltip,
  } = args;

  const onMouseDown = (e: React.MouseEvent) => {
    // Dismiss any lingering connection tooltip on interaction start
    setConnTooltip(null);
    // Check if click is on a connection port first
    const target = e.target as SVGElement;
    if (target.classList.contains('connection-port')) {
      handleConnectionPortDown(e);
      return;
    }
    // Otherwise delegate to normal canvas interactions
    bindCanvas.onMouseDown(e);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (drawingConnection) {
      handleConnectionMove(e);
      return;
    }
    bindCanvas.onMouseMove(e);
  };

  const onMouseUp = (e: React.MouseEvent) => {
    if (drawingConnection) {
      handleConnectionEnd(e);
      return;
    }
    bindCanvas.onMouseUp(e);
  };

  const onMouseLeave = (e: React.MouseEvent) => {
    setConnTooltip(null);
    bindCanvas.onMouseLeave(e);
  };

  return {
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onMouseLeave,
    onAuxClick: bindCanvas.onAuxClick,
    onContextMenu: bindCanvas.onContextMenu,
  };
}

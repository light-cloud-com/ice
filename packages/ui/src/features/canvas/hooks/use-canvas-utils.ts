/**
 * Canvas Utilities Hook
 *
 * Provides utility functions for coordinate conversion and canvas operations.
 */

import { useCallback, type RefObject } from 'react';
import type { ViewState } from '../components/svg-canvas';

export interface Point {
  x: number;
  y: number;
}

export const useCanvasUtils = (svgRef: RefObject<SVGSVGElement>, viewState: ViewState) => {
  /**
   * Convert screen coordinates to canvas (world) coordinates
   */
  const screenToCanvas = useCallback(
    (screenX: number, screenY: number): Point => {
      if (!svgRef.current) {
        return { x: screenX, y: screenY };
      }

      const rect = svgRef.current.getBoundingClientRect();
      return {
        x: (screenX - rect.left - viewState.panX) / viewState.scale,
        y: (screenY - rect.top - viewState.panY) / viewState.scale,
      };
    },
    [svgRef, viewState.panX, viewState.panY, viewState.scale]
  );

  /**
   * Convert canvas (world) coordinates to screen coordinates
   */
  const canvasToScreen = useCallback(
    (canvasX: number, canvasY: number): Point => {
      if (!svgRef.current) {
        return { x: canvasX, y: canvasY };
      }

      const rect = svgRef.current.getBoundingClientRect();
      return {
        x: canvasX * viewState.scale + viewState.panX + rect.left,
        y: canvasY * viewState.scale + viewState.panY + rect.top,
      };
    },
    [svgRef, viewState.panX, viewState.panY, viewState.scale]
  );

  /**
   * Check if a point is within an element's bounds
   */
  const isPointInElement = useCallback(
    (point: Point, element: { x: number; y: number; width: number; height: number }): boolean => {
      return (
        point.x >= element.x &&
        point.x <= element.x + element.width &&
        point.y >= element.y &&
        point.y <= element.y + element.height
      );
    },
    []
  );

  /**
   * Calculate distance between two points
   */
  const distance = useCallback((p1: Point, p2: Point): number => {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  }, []);

  return {
    screenToCanvas,
    canvasToScreen,
    isPointInElement,
    distance,
  };
};

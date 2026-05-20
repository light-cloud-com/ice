/**
 * useCanvasDimensions
 *
 * Tracks the canvas container's pixel dimensions via a `ResizeObserver` on
 * the orchestrator's container ref. Until the observer fires its first
 * measurement, returns a default of 800×600. The orchestrator
 * (`svg-canvas.tsx`) passes its `containerRef` (a
 * `useRef<HTMLDivElement>(null)`) and consumes `dimensions.width` /
 * `dimensions.height` on the SVG element and on the `<CanvasGrid>` inside
 * the transform group.
 *
 * Behavior preserved verbatim from the inline `useState` + `useEffect`
 * cluster previously in `svg-canvas.tsx`:
 *  - default `{ width: 800, height: 600 }` until first observer entry,
 *  - `width > 0 && height > 0` guard before each `setDimensions`,
 *  - `[]` dep array — the observer is installed once on mount,
 *  - cleanup calls `resizeObserver.disconnect()` on unmount.
 *
 * rf-canv-18.
 */

import { useEffect, useState } from 'react';

export function useCanvasDimensions(containerRef: React.RefObject<HTMLDivElement | null>): {
  width: number;
  height: number;
} {
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width, height });
        }
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [containerRef]);

  return dimensions;
}

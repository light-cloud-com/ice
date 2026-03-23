/**
 * Canvas Controls — Floating zoom controls overlay
 *
 * Zoom in, zoom out, zoom-to-fit buttons on the bottom-right of the canvas.
 */

import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import React, { useCallback, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { selectActiveCard } from '../../../store/slices/cards-slice';
import { setPaneViewport } from '../../../store/slices/ui-slice';
import type { RootState, AppDispatch } from '../../../store';

const defaultViewport = { panX: 0, panY: 0, scale: 1 };

export const CanvasControls: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const activeCard = useSelector(selectActiveCard);
  const splitView = useSelector((s: RootState) => s.ui.splitView);
  const activePane = splitView.panes.find((p) => p.id === splitView.activePaneId);
  const viewport = useMemo(() => activePane?.viewport || defaultViewport, [activePane?.viewport]);

  const setViewport = useCallback(
    (panX: number, panY: number, scale: number) => {
      if (activePane) {
        dispatch(setPaneViewport({ paneId: activePane.id, viewport: { panX, panY, scale } }));
      }
    },
    [dispatch, activePane],
  );

  const handleZoomIn = useCallback(() => {
    const newScale = Math.min(viewport.scale * 1.25, 3);
    setViewport(viewport.panX, viewport.panY, newScale);
  }, [viewport, setViewport]);

  const handleZoomOut = useCallback(() => {
    const newScale = Math.max(viewport.scale * 0.8, 0.1);
    setViewport(viewport.panX, viewport.panY, newScale);
  }, [viewport, setViewport]);

  const handleZoomToFit = useCallback(() => {
    if (!activeCard || activeCard.nodes.length === 0) return;

    const nodes = activeCard.nodes as Array<{ position: { x: number; y: number }; width: number; height: number }>;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    for (const n of nodes) {
      const x = n.position?.x ?? 0;
      const y = n.position?.y ?? 0;
      const w = n.width || 220;
      const h = n.height || 80;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    }

    // Add padding
    const padding = 60;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const contentW = maxX - minX;
    const contentH = maxY - minY;

    // Estimate available canvas size (approximate)
    const canvasW = window.innerWidth * 0.6;
    const canvasH = window.innerHeight * 0.7;

    const scaleX = canvasW / contentW;
    const scaleY = canvasH / contentH;
    const newScale = Math.min(Math.max(Math.min(scaleX, scaleY), 0.1), 2);

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const newPanX = canvasW / 2 / newScale - centerX;
    const newPanY = canvasH / 2 / newScale - centerY;

    setViewport(newPanX, newPanY, newScale);
  }, [activeCard, setViewport]);

  const zoomPercent = Math.round(viewport.scale * 100);

  return (
    <div className="absolute bottom-3 right-3 flex items-center gap-0.5 bg-ice-surface/90 backdrop-blur border border-ice-border rounded-lg shadow-sm px-1 py-0.5 z-10">
      <button
        onClick={handleZoomOut}
        className="p-1.5 rounded text-ice-text-3 hover:text-ice-text-1 hover:bg-ice-hover transition-colors"
        title="Zoom out"
      >
        <ZoomOut className="w-3.5 h-3.5" />
      </button>

      <span className="text-ice-xs text-ice-text-3 font-mono w-10 text-center tabular-nums">{zoomPercent}%</span>

      <button
        onClick={handleZoomIn}
        className="p-1.5 rounded text-ice-text-3 hover:text-ice-text-1 hover:bg-ice-hover transition-colors"
        title="Zoom in"
      >
        <ZoomIn className="w-3.5 h-3.5" />
      </button>

      <div className="w-px h-4 bg-ice-border mx-0.5" />

      <button
        onClick={handleZoomToFit}
        className="p-1.5 rounded text-ice-text-3 hover:text-ice-text-1 hover:bg-ice-hover transition-colors"
        title="Zoom to fit"
      >
        <Maximize2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

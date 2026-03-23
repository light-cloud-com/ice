/**
 * Minimap — Bird's-eye view of the canvas
 *
 * Shows all nodes as small colored rectangles with the current viewport as a frame.
 * Click to pan the canvas to that location.
 */

import React, { useMemo, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { selectActiveCard } from '../../../store/slices/cards-slice';
import { setPaneViewport } from '../../../store/slices/ui-slice';
import type { RootState, AppDispatch } from '../../../store';

const MINIMAP_W = 160;
const MINIMAP_H = 100;
const defaultViewport = { panX: 0, panY: 0, scale: 1 };
const PADDING = 10;

const CATEGORY_COLORS: Record<string, string> = {
  Application: '#3b82f6',
  Block: '#3b82f6',
  Database: '#8b5cf6',
  Storage: '#10b981',
  Network: '#ec4899',
  Security: '#f59e0b',
  Messaging: '#6366f1',
  Source: '#6366f1',
  Config: '#78716c',
  AI: '#a855f7',
  default: '#64748b',
};

export const Minimap: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const activeCard = useSelector(selectActiveCard);
  const splitView = useSelector((s: RootState) => s.ui.splitView);
  const activePane = splitView.panes.find((p) => p.id === splitView.activePaneId);
  const viewport = useMemo(() => activePane?.viewport || defaultViewport, [activePane?.viewport]);

  const nodes = useMemo(() => {
    if (!activeCard) return [];
    return (activeCard.nodes || []).map((n: any) => ({
      id: n.id,
      x: n.position?.x ?? 0,
      y: n.position?.y ?? 0,
      w: n.width || 220,
      h: n.height || 80,
      category: ((n.data?.iceType as string) || '').split('.')[0] || 'default',
    }));
  }, [activeCard]);

  // Compute bounds and scale
  const { scale, offsetX, offsetY, bounds: _bounds } = useMemo(() => {
    if (nodes.length === 0)
      return { scale: 1, offsetX: 0, offsetY: 0, bounds: { minX: 0, minY: 0, maxX: 500, maxY: 300 } };

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.w);
      maxY = Math.max(maxY, n.y + n.h);
    }
    minX -= PADDING;
    minY -= PADDING;
    maxX += PADDING;
    maxY += PADDING;

    const contentW = maxX - minX || 1;
    const contentH = maxY - minY || 1;
    const s = Math.min(MINIMAP_W / contentW, MINIMAP_H / contentH);

    return {
      scale: s,
      offsetX: -minX * s + (MINIMAP_W - contentW * s) / 2,
      offsetY: -minY * s + (MINIMAP_H - contentH * s) / 2,
      bounds: { minX, minY, maxX, maxY },
    };
  }, [nodes]);

  // Viewport rectangle in minimap coords
  const vpRect = useMemo(() => {
    const canvasW = window.innerWidth * 0.6;
    const canvasH = window.innerHeight * 0.7;
    const x = -viewport.panX * scale + offsetX;
    const y = -viewport.panY * scale + offsetY;
    const w = (canvasW / viewport.scale) * scale;
    const h = (canvasH / viewport.scale) * scale;
    return { x, y, w, h };
  }, [viewport, scale, offsetX, offsetY]);

  const handleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      // Convert minimap coords to canvas coords
      const canvasX = (mx - offsetX) / scale;
      const canvasY = (my - offsetY) / scale;

      const canvasW = window.innerWidth * 0.6;
      const canvasH = window.innerHeight * 0.7;

      if (activePane) {
        dispatch(
          setPaneViewport({
            paneId: activePane.id,
            viewport: {
              panX: -(canvasX - canvasW / viewport.scale / 2),
              panY: -(canvasY - canvasH / viewport.scale / 2),
              scale: viewport.scale,
            },
          }),
        );
      }
    },
    [scale, offsetX, offsetY, viewport, activePane, dispatch],
  );

  if (nodes.length === 0) return null;

  return (
    <div className="absolute bottom-3 left-3 z-10">
      <svg
        width={MINIMAP_W}
        height={MINIMAP_H}
        className="bg-ice-surface/90 backdrop-blur border border-ice-border rounded-lg shadow-sm cursor-crosshair"
        onClick={handleClick}
      >
        {/* Node rectangles */}
        {nodes.map((n) => (
          <rect
            key={n.id}
            x={n.x * scale + offsetX}
            y={n.y * scale + offsetY}
            width={Math.max(n.w * scale, 2)}
            height={Math.max(n.h * scale, 1.5)}
            rx={1}
            fill={CATEGORY_COLORS[n.category] || CATEGORY_COLORS.default}
            opacity={0.7}
          />
        ))}

        {/* Viewport frame */}
        <rect
          x={vpRect.x}
          y={vpRect.y}
          width={vpRect.w}
          height={vpRect.h}
          rx={1}
          fill="none"
          stroke="var(--ice-text-primary)"
          strokeWidth={1}
          opacity={0.3}
        />
      </svg>
    </div>
  );
};

/**
 * useCanvasViewport
 *
 * Viewport hook for the SVG canvas — picks the pane viewport when `paneId`
 * is set, falls back to the card's viewport otherwise. Computes the LOD
 * level (1 / 2 / 3) from the resolved zoom. Triggers a `scaleLayoutForZoom`
 * dispatch when `state.ui.autoOrganizeOnZoom` is enabled and the zoom
 * delta exceeds half a `ZOOM_STEP` (so small wheel ticks don't churn the
 * layout). Returns the canvas-shape viewport (`{ x, y, zoom }`), the lod,
 * the raw `sourceViewport` (`{ panX, panY, scale }` — the unconverted
 * form), and a `persistViewport` callback that selects the right action
 * creator based on which of `paneId` / `cardId` is provided:
 *
 *  - `paneId` → `setPaneViewport`
 *  - `cardId` → `setCardViewportById`
 *  - neither → `setCardViewport` (legacy active-card fallback)
 *
 * Behavior preserved verbatim from the inline blocks previously in
 * `svg-canvas.tsx` (rf-canv-19):
 *  - pane-vs-card precedence (pane wins if it has a viewport),
 *  - card fallback default `{ panX: 0, panY: 0, scale: 1 }`,
 *  - format conversion `{ panX, panY, scale }` → `{ x, y, zoom }`,
 *  - LOD thresholds: `> LOD_THRESHOLD_L3 ? 3 : > LOD_THRESHOLD_L2 ? 2 : 1`,
 *  - debounce: skip dispatch when `|zoom - prevZoom| < ZOOM_STEP * 0.5`,
 *  - `prevAutoZoomRef` updates on every effect run regardless of branch
 *    (the disabled-flag branch also resets the ref so re-enabling doesn't
 *    fire a stale-delta dispatch).
 *
 * rf-canv-19.
 */

import { useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  scaleLayoutForZoom,
  selectActiveCard,
  setCardViewport,
  setCardViewportById,
} from '../../../store/slices/cards-slice';
import { setPaneViewport } from '../../../store/slices/ui-slice';
import {
  LOD_THRESHOLD_L3,
  LOD_THRESHOLD_L2,
  ZOOM_STEP,
} from '../../../config/canvas-constants';
import type { RootState, AppDispatch } from '../../../store';

export interface UseCanvasViewportArgs {
  cardId?: string;
  paneId?: string;
}

export interface UseCanvasViewportResult {
  viewport: { x: number; y: number; zoom: number };
  lod: 1 | 2 | 3;
  sourceViewport: { panX: number; panY: number; scale: number };
  persistViewport: (vp: { x: number; y: number; zoom: number }) => void;
}

export function useCanvasViewport(
  args: UseCanvasViewportArgs,
): UseCanvasViewportResult {
  const { cardId, paneId } = args;
  const dispatch = useDispatch<AppDispatch>();

  // Pane viewport (if a paneId was provided and matches an existing pane).
  const splitView = useSelector((state: RootState) => state.ui.splitView);
  const pane = paneId ? splitView.panes.find((p) => p.id === paneId) : null;

  // Card viewport — the fallback when there is no pane viewport. The
  // selector reads the active card if no cardId was passed; the canvas
  // orchestrator's outer scope already resolves `card` the same way and
  // we mirror that here.
  const activeCard = useSelector(selectActiveCard);
  const allCards = useSelector((state: RootState) => state.cards.cards);
  const card = cardId ? allCards.find((c) => c.id === cardId) : activeCard;

  // Use pane viewport if available, otherwise fall back to card viewport.
  const paneViewport = pane?.viewport;
  const cardViewport = card?.viewport || { panX: 0, panY: 0, scale: 1 };
  const sourceViewport = paneViewport || cardViewport;

  // Convert to format expected by canvas interactions.
  const viewport = {
    x: sourceViewport.panX,
    y: sourceViewport.panY,
    zoom: sourceViewport.scale,
  };

  // Semantic zoom: Level of Detail based on zoom level.
  // L3 (full): > 95% — default experience, all details visible
  // L2 (compact): 50-95% — bigger icon + label + status only, no metadata
  // L1 (iconic): < 50% — large centered icon + bold label + status dot
  const lod: 1 | 2 | 3 =
    viewport.zoom > LOD_THRESHOLD_L3 ? 3 : viewport.zoom > LOD_THRESHOLD_L2 ? 2 : 1;

  // Proportional zoom scaling: when autoOrganizeOnZoom is enabled, scale
  // positions and sizes proportionally instead of re-running the full layout.
  // This keeps the relative arrangement identical — blocks just grow/shrink
  // in place around the diagram centroid. No topology rearrangement = no jumps.
  // Full re-layout only happens on manual organize button clicks.
  const autoOrganizeOnZoom = useSelector(
    (state: RootState) => state.ui.autoOrganizeOnZoom,
  );
  const prevAutoZoomRef = useRef(viewport.zoom);

  useEffect(() => {
    if (!autoOrganizeOnZoom) {
      prevAutoZoomRef.current = viewport.zoom;
      return;
    }

    const prevZoom = prevAutoZoomRef.current;
    const delta = Math.abs(viewport.zoom - prevZoom);
    if (delta < ZOOM_STEP * 0.5) return;

    prevAutoZoomRef.current = viewport.zoom;
    dispatch(scaleLayoutForZoom({ zoom: viewport.zoom, prevZoom }));
  }, [viewport.zoom, autoOrganizeOnZoom, dispatch]);

  // Persistence callback: routes to the right action creator based on which
  // of paneId / cardId was provided. The setCardViewport (no args/no id)
  // variant is the legacy active-card fallback — preserved verbatim.
  const persistViewport = (vp: { x: number; y: number; zoom: number }) => {
    if (paneId) {
      dispatch(
        setPaneViewport({
          paneId,
          viewport: { panX: vp.x, panY: vp.y, scale: vp.zoom },
        }),
      );
    } else if (cardId) {
      dispatch(
        setCardViewportById({
          cardId,
          viewport: { panX: vp.x, panY: vp.y, scale: vp.zoom },
        }),
      );
    } else {
      dispatch(setCardViewport({ panX: vp.x, panY: vp.y, scale: vp.zoom }));
    }
  };

  return { viewport, lod, sourceViewport, persistViewport };
}

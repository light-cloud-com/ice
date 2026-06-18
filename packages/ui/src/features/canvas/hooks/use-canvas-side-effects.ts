/**
 * useCanvasSideEffects
 *
 * Bundles the six "miscellaneous" useEffect blocks the orchestrator
 * (`svg-canvas.tsx`) used to run inline. Behavior is preserved verbatim
 * from the pre-rf-canv-22 inline form — including dep arrays, ordering,
 * and the two behavior-risk flags called out in the rf-canv blueprint:
 *
 *  - **Risk #7**: the `autoOrganizeCard` import-time threshold is
 *    `currentCount - prevCount > 10`. The bulk-import branch must NOT
 *    trip on small blueprint drops (container + 1-3 children = 2-4
 *    nodes). Do NOT change the threshold.
 *  - **Risk #8**: `overlayDismissed` gates the empty-canvas overlay
 *    (`EmptyCanvasOverlay`, mounted by `svg-canvas.tsx`). It resets to
 *    `false` on card change and is set `true` on AI intent (the user is
 *    driving the AI command bar, so the hint would be noise) or when the
 *    overlay's own dismiss button fires `dismissOverlay`. The hook now
 *    surfaces `{ overlayDismissed, dismissOverlay }` — the "future unit"
 *    the prior blueprint anticipated. Keep the per-card-id reset and the
 *    per-AI-intent dismiss writes verbatim.
 *
 * Six effects, in source order:
 *
 *  1. **Install inspector** — `installInspector()` once on mount.
 *     Wires `window.__iceInspect` for manual console use.
 *
 *  2. **Update inspector state** — on every change to `viewport.zoom`,
 *     `lod`, `nodes`, or `edges`, projects nodes + edges to the
 *     inspector's compact shape and feeds them via
 *     `updateInspectorState`. When `localStorage.getItem('ice-debug')`
 *     is `'true'` (literal string), also runs `inspectLayout` to print
 *     the formatted report. The localStorage read is wrapped in a
 *     try/catch so private browsing / sandboxed contexts that throw on
 *     `getItem` don't crash the canvas.
 *
 *  3. **Auto-organize on bulk import** — tracked via
 *     `prevNodeCountRef`, fires `autoOrganizeCard({ zoom })` after a
 *     100ms timer when:
 *       - `currentCount > 0 AND (prevCount === 0 OR currentCount -
 *         prevCount > 10)`.
 *     The threshold guards against blueprint-drop noise (2-4 nodes per
 *     drop). `viewport.zoom` is intentionally OMITTED from the dep
 *     array — re-running on zoom would trigger spurious organize
 *     calls; we only care about node-count jumps. Ref stores the
 *     *previous* count so the next render computes the delta from the
 *     correct baseline.
 *
 *  4. **logCanvasRender** — debug logger fed `{ nodeCount, edgeCount,
 *     visibleCount, viewLevel }` on every change to the four
 *     primitives in the dep array.
 *
 *  5. **Overlay reset on card change** — when `card?.id` changes,
 *     resets the empty-canvas overlay's dismiss state to `false`.
 *     `prevCardIdRef` tracks the previous id so the setter only fires
 *     on a genuine card switch (avoids redundant writes when other
 *     selectors update without a card change).
 *
 *  6. **Overlay dismiss on AI intent** — when `aiCurrentIntent`
 *     becomes truthy, marks the overlay dismissed (the user is
 *     interacting with the AI command bar, so the overlay would be
 *     visually noisy).
 *
 * rf-canv-22.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { logCanvasRender } from '../../../shared/utils/debug-logger';
import { inspectLayout, updateInspectorState, installInspector } from '../../../shared/utils/layout-inspector';
import { autoOrganizeCard, type Card, type CardNode, type CardEdge } from '../../../store/slices/cards-slice';
import { setEdgeStyle } from '../../../store/slices/ui-slice';
import type { ViewLevel } from '../../../config/visualization-config';
import type { AppDispatch } from '../../../store';
import type { CanvasNode } from '../components/types';

export interface UseCanvasSideEffectsArgs {
  /** Active card (may be undefined while cards load) — only `card?.id` is read. */
  card: Card | undefined;
  /** Card-owned nodes — read for inspector projection + auto-organize node-count. */
  nodes: CardNode[];
  /** Card-owned edges — read for inspector projection + logCanvasRender. */
  edges: CardEdge[];
  /** Visible canvas nodes (after view-level filter) — only `.length` is read for logCanvasRender. */
  canvasNodes: CanvasNode[];
  /** Effective canvas nodes (after fold collapse) — only `.length` is read for logCanvasRender. */
  effectiveNodes: CanvasNode[];
  /** Viewport state — only `viewport.zoom` is read (inspector state + auto-organize). */
  viewport: { zoom: number };
  /** Level-of-detail bucket — fed into inspector state. */
  lod: 1 | 2 | 3;
  /** Active view level — fed into logCanvasRender. */
  viewLevel: ViewLevel;
  /** Latest AI intent string (or null) — toggles overlay-dismiss. */
  aiCurrentIntent: string | null | undefined;
  /** Redux dispatch — used by the auto-organize timer callback. */
  dispatch: AppDispatch;
}

export interface UseCanvasSideEffectsResult {
  /** True when the empty-canvas overlay should be hidden (dismissed or AI-driven). */
  overlayDismissed: boolean;
  /** Marks the empty-canvas overlay dismissed (wired to its close button). */
  dismissOverlay: () => void;
}

export function useCanvasSideEffects(args: UseCanvasSideEffectsArgs): UseCanvasSideEffectsResult {
  const { card, nodes, edges, canvasNodes, effectiveNodes, viewport, lod, viewLevel, aiCurrentIntent, dispatch } = args;

  // ── Effect 1: install inspector once on mount ──────────────────────────
  useEffect(() => {
    installInspector();
  }, []);

  // ── Effect 2: feed inspector state + optional auto-log ─────────────────
  useEffect(() => {
    const inspectNodes = nodes.map((n) => ({
      id: n.id,
      type: n.type,
      label: (n.data?.label as string) || n.id,
      iceType: (n.data?.iceType as string) || '',
      x: n.position.x,
      y: n.position.y,
      width: n.width,
      height: n.height,
      parentId: n.parentId,
      folded: !!n.data?.folded,
    }));
    const inspectEdges = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      relationship: e.data?.relationship as string | undefined,
    }));
    const state = { zoom: viewport.zoom, lod, nodes: inspectNodes, edges: inspectEdges };
    updateInspectorState(state);

    // Auto-log when ice-debug is enabled
    try {
      if (localStorage.getItem('ice-debug') === 'true') {
        inspectLayout(state);
      }
    } catch {
      /* ignore */
    }
  }, [viewport.zoom, lod, nodes, edges]);

  // ── Effect 3: auto-organize on bulk node-count delta ───────────────────
  // Track previous node count for auto-organize on import
  const prevNodeCountRef = useRef(0);

  useEffect(() => {
    const currentCount = nodes.length;
    const prevCount = prevNodeCountRef.current;

    // Auto-organize when nodes are imported (0 → many, or large bulk add)
    // Threshold >10 avoids triggering on blueprint drops (container + 1-3 children = 2-4 nodes)
    if (currentCount > 0 && (prevCount === 0 || currentCount - prevCount > 10)) {
      const timer = setTimeout(() => {
        dispatch(autoOrganizeCard({ zoom: viewport.zoom }));
        // CCL1 — the import-time organize is directional (master branch), so it
        // computes orthogonal dagre routes; render them via the rectangular edge
        // style instead of letting bezier discard them.
        dispatch(setEdgeStyle('rectangular'));
      }, 100);
      prevNodeCountRef.current = currentCount;
      return () => clearTimeout(timer);
    }

    prevNodeCountRef.current = currentCount;
    // viewport.zoom intentionally omitted — re-running on zoom changes would
    // trigger spurious auto-organize calls; we only care about node-count jumps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length, dispatch]);

  // ── Effect 4: logCanvasRender on render-shape changes ──────────────────
  useEffect(() => {
    logCanvasRender({
      nodeCount: canvasNodes.length,
      edgeCount: edges.length,
      visibleCount: effectiveNodes.length,
      viewLevel,
    });
  }, [canvasNodes.length, edges.length, effectiveNodes.length, viewLevel]);

  // ── Overlay-dismiss state (rf-canv risk #8: now surfaced to the overlay) ──
  // Dismiss state for the empty canvas overlay
  const [overlayDismissed, setOverlayDismissed] = useState(false);
  const dismissOverlay = useCallback(() => setOverlayDismissed(true), []);

  // ── Effect 5: reset overlay-dismiss when card changes ──────────────────
  // Reset when card changes
  const prevCardIdRef = useRef(card?.id);
  useEffect(() => {
    if (card?.id !== prevCardIdRef.current) {
      prevCardIdRef.current = card?.id;
      setOverlayDismissed(false);
    }
  }, [card?.id]);

  // ── Effect 6: dismiss overlay on AI intent ─────────────────────────────
  // Dismiss when user sends an AI command (they expect to see the canvas)
  useEffect(() => {
    if (aiCurrentIntent) {
      setOverlayDismissed(true);
    }
  }, [aiCurrentIntent]);

  return { overlayDismissed, dismissOverlay };
}

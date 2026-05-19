/**
 * Cards slice — scale-layout / blueprint-expand reducers.
 *
 * Two reducers spread into `createSlice`'s `reducers` block in the
 * orchestrator (`cards-slice.ts`) so RTK still owns the action type strings
 * (`'cards/scaleLayoutForZoom'`, `'cards/expandBlueprintToCard'`).
 *
 * `scaleLayoutForZoom` is invoked from `useCanvasViewport` whenever the
 * viewport zoom crosses one of the discrete `ZOOM_STEP` boundaries. The
 * goal is to scale node positions and sizes proportionally around the
 * centroid of top-level nodes — relative arrangement stays identical, but
 * blocks grow/shrink in place. RISK #10 (blueprint, learnings): the scale
 * factors are HARD-CODED to `scaleX = 1` / `scaleY = 1`. Block dimensions
 * (`CARD_WIDTH × CARD_HEIGHT`) are now fixed at all zoom levels, so the
 * effective transform is identity. The centroid math still runs — it is
 * kept intact so future sizing changes that re-introduce zoom-dependent
 * dimensions can flip the constants without rewriting the reducer. Do
 * NOT replace `scaleX` / `scaleY` with `zoom / prevZoom`; the canvas
 * ceased to zoom block dimensions in rf-canv-* and the viewport pan/scale
 * is now what handles visual zoom.
 *
 * `expandBlueprintToCard` is the ingestion-path counterpart to the
 * palette drop / blueprint expansion flow: a single flat resource node
 * (built by `expandBlueprint(...)` in `@ice/blocks`) is appended to the
 * active card. The payload runs through `migrateCardNode` BEFORE landing
 * on the card — RISK #8 (blueprint): every ingestion site (addNodeToCard,
 * importToActiveCard, addToActiveCard, expandBlueprintToCard) must call
 * the migrator so backend canvas restores, AI tool-use writes, and
 * blueprint-emitted nodes converge on the same shape regardless of the
 * legacy iceTypes the source happened to carry. See learning
 * `data-version-bump-migrates-not-wipes`.
 *
 * @see rf-cards-13
 */

import { migrateCardNode } from '../migration';
import { pushSnapshot } from '../snapshot';
import type { ExpandedBlueprint } from '../../../../config/blocks';
import type { CardNode, CardsState } from '../types';
import type { PayloadAction } from '@reduxjs/toolkit';

export const scaleBlueprintReducers = {
  // ── Proportional zoom scaling ──────────────────────────────────────
  // Instead of re-running the full layout (which rearranges topology and
  // causes jumps), scale positions and sizes proportionally around the
  // centroid.  The relative arrangement stays identical — blocks just
  // grow/shrink in place.
  scaleLayoutForZoom: (state: CardsState, action: PayloadAction<{ zoom: number; prevZoom: number }>) => {
    const card = state.cards.find((c) => c.id === state.activeCardId);
    if (!card || card.nodes.length === 0) return;

    const { zoom, prevZoom } = action.payload;
    if (Math.abs(zoom - prevZoom) < 0.001) return;

    // Block dimensions are now fixed (CARD_WIDTH × CARD_HEIGHT) at all
    // zoom levels, so the scale factor is always 1.  We keep the centroid
    // logic intact in case future sizing changes re-introduce zoom-dependent
    // dimensions.
    const scaleX = 1;
    const scaleY = 1;

    // Compute centroid of top-level nodes (scale around this point)
    const topNodes = card.nodes.filter((n) => !n.parentId);
    if (topNodes.length === 0) return;

    let cx = 0,
      cy = 0;
    for (const n of topNodes) {
      cx += n.position.x + n.width / 2;
      cy += n.position.y + n.height / 2;
    }
    cx /= topNodes.length;
    cy /= topNodes.length;

    // Scale every node's position and size around the centroid
    for (const node of card.nodes) {
      const nodeCx = node.position.x + node.width / 2;
      const nodeCy = node.position.y + node.height / 2;

      // Scale center position relative to centroid
      const newCx = cx + (nodeCx - cx) * scaleX;
      const newCy = cy + (nodeCy - cy) * scaleY;

      // Scale dimensions
      const newW = node.width * scaleX;
      const newH = node.height * scaleY;

      node.position.x = newCx - newW / 2;
      node.position.y = newCy - newH / 2;
      node.width = newW;
      node.height = newH;
    }
  },

  // Expand a blueprint into the active card (single flat resource node)
  expandBlueprintToCard: (state: CardsState, action: PayloadAction<ExpandedBlueprint>) => {
    pushSnapshot(state);
    const card = state.cards.find((c) => c.id === state.activeCardId);
    if (!card) return;

    // Run blueprint-emitted nodes through the migrator for parity with
    // the other ingestion paths — defends against any blueprint that
    // still references a legacy iceType.
    card.nodes.push(migrateCardNode(action.payload.node as CardNode));
  },
} as const;

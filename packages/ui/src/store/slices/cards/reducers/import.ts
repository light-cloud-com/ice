/**
 * Cards slice — full-card import reducer.
 *
 * One reducer covering the "replace active card with this payload" ingestion
 * path used by cloud restore and the canvas context-menu's "import from
 * cloud" affordance. Spread into `createSlice`'s `reducers` block in the
 * orchestrator (`cards-slice.ts`) so RTK still owns the action type string
 * (`'cards/importToActiveCard'`).
 *
 * `importToActiveCard` is unique among the ingestion reducers because it
 * REPLACES `card.nodes` and `card.edges` wholesale (not merge — see
 * `addToActiveCard` in `node-delete-merge.ts` for the merge variant) and
 * THEN runs auto-layout on the fresh content unless the caller opts out.
 *
 * Two-phase mutation, in fixed order:
 *   1. `card.nodes = migrateCardNodes(payload.nodes)` and
 *      `card.edges = payload.edges` — replace, with migration on the node
 *      side so any legacy iceType (e.g. `Monitoring.Terminal`) is upgraded
 *      before landing on the canvas (RISK #8 in the rf-cards blueprint:
 *      ingestion-path migration parity).
 *   2. If `skipAutoOrganize` is falsy AND the card has at least one node,
 *      run `autoLayout` to compute fresh positions/sizes and edge routes,
 *      remap `card.nodes` to the layout output, THEN call
 *      `applyEdgeRoutes(card.edges, edgeRoutes)`. The order of step (2) is
 *      load-bearing (RISK #3): edge routes are absolute canvas coordinates
 *      keyed off the post-layout node positions; calling `applyEdgeRoutes`
 *      before the node remap would write routes that are correct in the
 *      layout coordinate space but mismatched against the OLD node
 *      positions still on the draft.
 *
 * `skipAutoOrganize: true` short-circuits step (2) entirely — the caller
 * keeps the payload's positions verbatim. Used when the payload already
 * carries laid-out coordinates from a prior session and re-running layout
 * would visually shift the canvas.
 *
 * Calls `pushSnapshot(state)` (no actionType) so each import becomes its
 * own undo step — these are user-initiated, not high-frequency events.
 *
 * @see rf-cards-11
 */

import type { PayloadAction } from '@reduxjs/toolkit';
import type { CardNode, CardEdge, CardsState } from '../types';
import { migrateCardNodes } from '../migration';
import { applyEdgeRoutes } from '../edge-routes';
import { pushSnapshot } from '../snapshot';
import { autoLayout, type LayoutNode } from '../../../../shared/utils/auto-layout';

export const importReducers = {
  // Import nodes/edges to active card (for cloud import) - auto-organizes by default
  importToActiveCard: (
    state: CardsState,
    action: PayloadAction<{ nodes: CardNode[]; edges: CardEdge[]; skipAutoOrganize?: boolean }>,
  ) => {
    pushSnapshot(state);
    const card = state.cards.find((c) => c.id === state.activeCardId);
    if (card) {
      // Migrate incoming nodes (cloud restore / clipboard / AI write) so
      // any legacy iceType is upgraded before landing on the canvas.
      card.nodes = migrateCardNodes(action.payload.nodes);
      card.edges = action.payload.edges;

      // Auto-organize unless explicitly skipped
      if (!action.payload.skipAutoOrganize && card.nodes.length > 0) {
        // Convert CardNodes to LayoutNodes
        const layoutNodes: LayoutNode[] = card.nodes.map((node) => ({
          id: node.id,
          type: node.type,
          iceType: (node.data?.iceType as string) || '',
          label: (node.data?.label as string) || node.id,
          parentId: node.parentId || null,
          width: node.width || 280,
          height: node.height || 160,
          x: node.position.x,
          y: node.position.y,
          data: node.data,
          folded: (node.data?.folded as boolean) || false,
        }));

        // Convert edges for layout
        const layoutEdges = card.edges.map((e) => ({
          source: e.source,
          target: e.target,
          relationship: e.data?.relationship as string | undefined,
        }));

        // Apply auto-layout
        const { nodes: organizedNodes, edgeRoutes } = autoLayout(layoutNodes, layoutEdges, {
          startX: 50,
          startY: 50,
          nodeGap: 80,
          nodesPerRow: 3,
          containerPadding: 30,
        });

        // Create a map of organized positions
        const organizedMap = new Map(organizedNodes.map((n) => [n.id, n]));

        // Update card nodes with new positions and sizes
        card.nodes = card.nodes.map((node) => {
          const organized = organizedMap.get(node.id);
          if (organized) {
            return {
              ...node,
              position: { x: organized.x, y: organized.y },
              width: organized.width,
              height: organized.height,
            };
          }
          return node;
        });

        applyEdgeRoutes(card.edges, edgeRoutes);
      }
    }
  },
} as const;

/**
 * Cards slice — node/edge add + edge mutation reducers.
 *
 * Five reducers covering ingestion of new nodes/edges into the active card,
 * the deploy-overlay clear path, and two edge-data mutations. Spread into
 * `createSlice`'s `reducers` block in the orchestrator (`cards-slice.ts`)
 * so RTK still owns the action type strings (`'cards/addNodeToCard'` etc.).
 *
 * - `addNodeToCard` — push one CardNode onto the active card; runs the
 *   incoming payload through `migrateCardNode` for legacy-iceType parity
 *   with the other ingestion paths (`importToActiveCard`, `addToActiveCard`,
 *   `expandBlueprintToCard`).
 * - `addEdgeToCard` — push one CardEdge onto the active card.
 * - `clearCardDeployOverlay` — wipe the 20 deploy-overlay fields from
 *   every node's `data` on the targeted card. The cardId arg supplies
 *   which card to clear; falls back to active card when omitted. Used by
 *   the destroy flow to stop showing "Live"/URL pills for resources that
 *   no longer exist. The 20-field list MUST stay in sync with what the
 *   deploy hydrator + node-outputs writer produce — missing one leaves a
 *   ghost pill after destroy (RISK #7 in `state/blueprints/rf-cards.md`).
 *   The spread-and-delete pattern (`const next = { ...node.data }; delete
 *   next[key]; node.data = next`) is RTK Immer-safe; a direct `delete` on
 *   the Proxy would be flagged by Immer's strict mode.
 * - `updateCardEdgeData` — merge a partial `data` patch onto a single
 *   edge; preserves existing fields not in the patch.
 * - `reverseCardEdge` — swap an edge's `source` and `target`. Used by
 *   the edge-menu's "reverse direction" affordance.
 *
 * All five reducers call `pushSnapshot(state)` (no actionType) so each
 * action becomes its own undo step — these are user-initiated, not
 * high-frequency drag/resize events that need coalescing.
 *
 * @see rf-cards-7
 */

import { migrateCardNode } from '../migration';
import { pushSnapshot } from '../snapshot';
import type { CardNode, CardEdge, CardsState } from '../types';
import type { PayloadAction } from '@reduxjs/toolkit';

export const nodeEdgeAddReducers = {
  // Add node to active card
  addNodeToCard: (state: CardsState, action: PayloadAction<CardNode>) => {
    pushSnapshot(state);
    const card = state.cards.find((c) => c.id === state.activeCardId);
    if (card) {
      // Run external payloads through the migrator so any legacy iceType
      // (e.g. Monitoring.Terminal carried by an AI tool-use write) is
      // upgraded before it lands on the canvas.
      card.nodes.push(migrateCardNode(action.payload));
    }
  },

  // Add edge to active card
  addEdgeToCard: (state: CardsState, action: PayloadAction<CardEdge>) => {
    pushSnapshot(state);
    const card = state.cards.find((c) => c.id === state.activeCardId);
    if (card) {
      card.edges.push(action.payload);
    }
  },

  // Clear all deploy-related overlay fields from every node in the
  // active card. Used after a successful destroy so the canvas blocks
  // and properties panel stop showing "Live" / URL pills for resources
  // that no longer exist. The fields wiped here mirror the ones the
  // deploy subscription hook + node-outputs hydrator set when a deploy
  // succeeds; missing one would leave a ghost field on the block.
  clearCardDeployOverlay: (state: CardsState, action: PayloadAction<{ cardId?: string }>) => {
    pushSnapshot(state);
    const cardId = action.payload?.cardId || state.activeCardId;
    const card = state.cards.find((c) => c.id === cardId);
    if (!card) return;
    const fieldsToClear = [
      'provider_id',
      'deploy_status',
      'deploy_progress',
      'deploy_error',
      'deploy_outputs',
      'last_deployed_at',
      'deployed_image',
      'url',
      'default_url',
      'firebaseapp_url',
      'console_url',
      'site_id',
      'source_repo',
      'source_branch',
      'republished_from_repo',
      'custom_domain',
      'custom_domain_url',
      'custom_domain_status',
      'custom_domain_dns_records',
      'public_grant_failed',
      'public_grant_error',
      'public_grant_strategy',
      'ip_address',
      'IPAddress',
    ];
    for (const node of card.nodes) {
      if (!node.data) continue;
      const next = { ...node.data };
      let changed = false;
      for (const key of fieldsToClear) {
        if (next[key] !== undefined) {
          delete next[key];
          changed = true;
        }
      }
      if (changed) node.data = next;
    }
  },

  // Update edge data in active card
  updateCardEdgeData: (state: CardsState, action: PayloadAction<{ edgeId: string; data: Record<string, unknown> }>) => {
    pushSnapshot(state);
    const card = state.cards.find((c) => c.id === state.activeCardId);
    if (card) {
      const edge = card.edges.find((e) => e.id === action.payload.edgeId);
      if (edge) {
        edge.data = { ...edge.data, ...action.payload.data };
      }
    }
  },

  // Reverse edge direction (swap source ↔ target)
  reverseCardEdge: (state: CardsState, action: PayloadAction<string>) => {
    pushSnapshot(state);
    const card = state.cards.find((c) => c.id === state.activeCardId);
    if (card) {
      const edge = card.edges.find((e) => e.id === action.payload);
      if (edge) {
        const tmp = edge.source;
        edge.source = edge.target;
        edge.target = tmp;
      }
    }
  },
} as const;

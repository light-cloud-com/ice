/**
 * Cards Slice
 *
 * Manages multiple canvas cards/tabs, each with separate nodes and edges.
 */

import { LAYOUT_NODE_SEP } from '@ice/constants';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { isContainer as isContainerIceType } from '../../config/containment-rules';
import { autoLayout, type LayoutNode } from '../../shared/utils/auto-layout';
import type { ExpandedBlueprint } from '../../config/blocks';

// =============================================================================
// Types
// =============================================================================
//
// Types live in `./cards/types` (rf-cards-1). The re-export preserves the
// public import path for external consumers; the `import type` line brings
// the names into THIS module's lexical scope for internal references. After
// rf-cards-6 moved the lifecycle reducers (the only `Card` / `CardViewport` /
// `DEFAULT_VIEWPORT` consumers in this file) into `./cards/reducers/card-
// lifecycle`, only the three names actually referenced syntactically below
// stay in the local `import type` list.

export type { CardNode, CardEdge, CardViewport, Card, CardsState } from './cards/types';
import type { CardNode, CardEdge, CardsState } from './cards/types';

// =============================================================================
// Migration
// =============================================================================
//
// Migration lives in `./cards/migration` (rf-cards-2). The re-export
// preserves the public import path for external consumers; the runtime
// import brings the names into THIS module's lexical scope so the four
// internal ingestion sites (addNodeToCard, importToActiveCard,
// addToActiveCard, expandBlueprintToCard) and the localStorage loader
// can call them directly.

export { migrateCardNodes } from './cards/migration';
import { migrateCardNode, migrateCardNodes } from './cards/migration';

// =============================================================================
// Persistence
// =============================================================================
//
// Persistence lives in `./cards/persistence` (rf-cards-4). The runtime
// import brings `loadPersistedCards` into THIS module's lexical scope so
// the `loadedCards` initial-state assembly below can call it directly.
// The 3 storage-key constants stay module-private inside that file.

import { loadPersistedCards } from './cards/persistence';

// =============================================================================
// Snapshot
// =============================================================================
//
// `pushSnapshot` (and its coalescing state, history cap, etc.) lives in
// `./cards/snapshot` (rf-cards-5). The runtime import brings the function
// into THIS module's lexical scope so every undoable reducer can call it.
// `_lastSnapshotAction` is a module-private `let` in that file — keeping
// it module-scoped is what makes drag/resize coalescing work (RISK #5).

import { pushSnapshot } from './cards/snapshot';

// =============================================================================
// Reducer groups
// =============================================================================
//
// Card-lifecycle reducers (rf-cards-6) live in `./cards/reducers/card-lifecycle`.
// The runtime import brings the case-reducer object into THIS module's lexical
// scope so the `createSlice` `reducers:` block can spread it. RTK still owns
// the action type strings (`'cards/setActiveCard'` etc.) because action types
// are derived from the keys of the spread object inside `createSlice`.

import { cardLifecycleReducers } from './cards/reducers/card-lifecycle';
import { nodeEdgeAddReducers } from './cards/reducers/node-edge-add';
import { nodePositionReducers } from './cards/reducers/node-position';

// =============================================================================
// Initial State
// =============================================================================

const loadedCards = loadPersistedCards();
const initialState: CardsState = {
  ...loadedCards,
  history: {},
};

// =============================================================================
// Edge routes
// =============================================================================
//
// Edge-route helpers (and the legacy `cascadeContainerReflow` dead-code
// helper) live in `./cards/edge-routes` (rf-cards-3). The runtime import
// brings the names into THIS module's lexical scope so the import /
// auto-organize reducers can call them. After rf-cards-8 extracted the
// position reducers, `invalidateEdgeRoutesTouching` is no longer needed
// in this file — only `applyEdgeRoutes` (used by importToActiveCard and
// autoOrganizeCard) stays.

import { applyEdgeRoutes } from './cards/edge-routes';

// =============================================================================
// Slice
// =============================================================================

const cardsSlice = createSlice({
  name: 'cards',
  initialState,
  reducers: {
    ...cardLifecycleReducers,
    ...nodeEdgeAddReducers,
    ...nodePositionReducers,

    // Toggle node fold state in active card
    toggleCardNodeFold: (state, action: PayloadAction<string>) => {
      const card = state.cards.find((c) => c.id === state.activeCardId);
      if (card) {
        const node = card.nodes.find((n) => n.id === action.payload);
        if (node && node.data) {
          node.data.folded = !node.data.folded;
        }
      }
    },

    // Update a node's parent (for drag in/out of groups)
    updateCardNodeParent: (state, action: PayloadAction<{ nodeId: string; parentId: string | null }>) => {
      pushSnapshot(state);
      const card = state.cards.find((c) => c.id === state.activeCardId);
      if (card) {
        const node = card.nodes.find((n) => n.id === action.payload.nodeId);
        if (node) {
          if (action.payload.parentId) {
            node.parentId = action.payload.parentId;
          } else {
            delete node.parentId;
          }
        }
      }
    },

    // Update a node's data fields (label, groupColor, etc.)
    updateCardNodeData: (state, action: PayloadAction<{ nodeId: string; data: Record<string, unknown> }>) => {
      pushSnapshot(state);
      const card = state.cards.find((c) => c.id === state.activeCardId);
      if (card) {
        const node = card.nodes.find((n) => n.id === action.payload.nodeId);
        if (node) {
          node.data = { ...node.data, ...action.payload.data };
        }
      }
    },

    // Delete node from active card
    deleteCardNode: (state, action: PayloadAction<string>) => {
      pushSnapshot(state);
      const card = state.cards.find((c) => c.id === state.activeCardId);
      if (card) {
        card.nodes = card.nodes.filter((n) => n.id !== action.payload);
        // Also remove edges connected to this node
        card.edges = card.edges.filter((e) => e.source !== action.payload && e.target !== action.payload);
      }
    },

    // Delete edge from active card
    deleteCardEdge: (state, action: PayloadAction<string>) => {
      pushSnapshot(state);
      const card = state.cards.find((c) => c.id === state.activeCardId);
      if (card) {
        card.edges = card.edges.filter((e) => e.id !== action.payload);
      }
    },

    // Import nodes/edges to active card (for cloud import) - auto-organizes by default
    importToActiveCard: (
      state,
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

    // Add nodes/edges to active card (merge, not replace) — for combining templates
    addToActiveCard: (state, action: PayloadAction<{ nodes: CardNode[]; edges: CardEdge[] }>) => {
      pushSnapshot(state);
      const card = state.cards.find((c) => c.id === state.activeCardId);
      if (card) {
        // Find the bounding box of existing nodes to offset new ones
        let maxX = 0;
        let maxY = 0;
        for (const node of card.nodes) {
          const right = node.position.x + (node.width || 220);
          const bottom = node.position.y + (node.height || 56);
          if (right > maxX) maxX = right;
          if (bottom > maxY) maxY = bottom;
        }

        // Offset new nodes to the right of existing content (with gap)
        const offsetX = card.nodes.length > 0 ? maxX + 120 : 0;
        const offsetY = 0;

        // Migrate incoming nodes (template merge / clipboard) before
        // offsetting so any legacy iceType is upgraded in place.
        const offsetNodes = migrateCardNodes(action.payload.nodes).map((node) => ({
          ...node,
          position: {
            x: node.position.x + offsetX,
            y: node.position.y + offsetY,
          },
        }));

        card.nodes = [...card.nodes, ...offsetNodes];
        card.edges = [...card.edges, ...action.payload.edges];
      }
    },

    // Auto-organize nodes in active card.
    // When containerId is provided, only reorganize inside that container (per-group organize).
    // Otherwise, organize all levels (master organize).
    autoOrganizeCard: (
      state,
      action: PayloadAction<
        | {
            direction?: 'vertical' | 'horizontal';
            layout?: 'flow' | 'grid' | 'circular';
            containerId?: string;
            zoom?: number;
          }
        | undefined
      >,
    ) => {
      const card = state.cards.find((c) => c.id === state.activeCardId);
      if (!card || card.nodes.length === 0) return;
      pushSnapshot(state);

      const direction = action?.payload?.direction || 'vertical';
      const layout = action?.payload?.layout || 'flow';
      const containerId = action?.payload?.containerId;
      const zoom = action?.payload?.zoom;

      // Cleanup pass: strip parentId where the parent isn't a valid container.
      // A node qualifies as a container if it's typed `'container'` OR its
      // iceType is a container type (e.g. Network.PrivateNetwork, Network.VPC,
      // Network.Subnet, Group.*). Without the iceType check, blocks like
      // Private Network — stored as `type: 'resource'` — would drop their
      // children's parentId right before layout, breaking containment.
      const containerIds = new Set(
        card.nodes
          .filter((n) => n.type === 'container' || isContainerIceType((n.data?.iceType as string) || ''))
          .map((n) => n.id),
      );
      for (const node of card.nodes) {
        if (node.parentId && !containerIds.has(node.parentId)) {
          delete node.parentId;
        }
      }

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

      // Apply auto-layout with direction and layout mode.
      // nodeGap MUST be a multiple of LAYOUT_GRID_STEP (40). Using e.g. 36 makes
      // each block-step (width 240 + gap 36 = 276) misalign with the grid, so
      // the post-layout snapToGrid pass rounds adjacent positions inconsistently
      // and eats one grid step (40px) out of one gap per row.
      const { nodes: organizedNodes, edgeRoutes } = autoLayout(layoutNodes, layoutEdges, {
        startX: 50,
        startY: 50,
        nodeGap: LAYOUT_NODE_SEP,
        nodesPerRow: 3,
        containerPadding: 30,
        direction,
        layout,
        zoom,
      });

      const organizedMap = new Map(organizedNodes.map((n) => [n.id, n]));

      if (containerId) {
        // Per-container organize: keep the container position, update size + children positions
        const containerOrganized = organizedMap.get(containerId);
        const containerOld = card.nodes.find((n) => n.id === containerId);
        if (!containerOrganized || !containerOld) return;

        // Offset = difference between old and new container position
        const dx = containerOld.position.x - containerOrganized.x;
        const dy = containerOld.position.y - containerOrganized.y;

        // Collect all descendants of this container
        const descendantIds = new Set<string>();
        const collectDescendants = (parentId: string) => {
          for (const node of card.nodes) {
            if (node.parentId === parentId && !descendantIds.has(node.id)) {
              descendantIds.add(node.id);
              collectDescendants(node.id);
            }
          }
        };
        collectDescendants(containerId);

        card.nodes = card.nodes.map((node) => {
          if (node.id === containerId) {
            return {
              ...node,
              width: containerOrganized.width,
              height: containerOrganized.height,
            };
          }
          if (descendantIds.has(node.id)) {
            const organized = organizedMap.get(node.id);
            if (organized) {
              const isFolded = !!node.data?.folded;
              return {
                ...node,
                position: { x: organized.x + dx, y: organized.y + dy },
                width: organized.width,
                height: isFolded ? node.height : organized.height,
              };
            }
          }
          return node;
        });
      } else {
        // Compute old centroid (center of mass of all top-level nodes)
        const topNodes = card.nodes.filter((n) => !n.parentId);
        let oldCentroidX = 0,
          oldCentroidY = 0;
        if (topNodes.length > 0) {
          for (const n of topNodes) {
            oldCentroidX += n.position.x + n.width / 2;
            oldCentroidY += n.position.y + n.height / 2;
          }
          oldCentroidX /= topNodes.length;
          oldCentroidY /= topNodes.length;
        }

        // Master organize: update all nodes with layout positions + sizes
        card.nodes = card.nodes.map((node) => {
          const organized = organizedMap.get(node.id);
          if (organized) {
            const isFolded = !!node.data?.folded;
            return {
              ...node,
              position: { x: organized.x, y: organized.y },
              width: organized.width,
              height: isFolded ? node.height : organized.height,
            };
          }
          return node;
        });

        // Centroid-stabilize: shift the entire layout so the centroid of
        // top-level nodes stays at the same position. This prevents the
        // whole diagram from drifting when node sizes change with zoom.
        if (topNodes.length > 0) {
          const newTopNodes = card.nodes.filter((n) => !n.parentId);
          let newCentroidX = 0,
            newCentroidY = 0;
          for (const n of newTopNodes) {
            newCentroidX += n.position.x + n.width / 2;
            newCentroidY += n.position.y + n.height / 2;
          }
          newCentroidX /= newTopNodes.length;
          newCentroidY /= newTopNodes.length;

          const dx = oldCentroidX - newCentroidX;
          const dy = oldCentroidY - newCentroidY;
          if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
            for (const node of card.nodes) {
              node.position.x += dx;
              node.position.y += dy;
            }
            // Shift routes by the same amount so they stay aligned with nodes
            for (const [key, pts] of edgeRoutes) {
              edgeRoutes.set(
                key,
                pts.map((p) => ({ x: p.x + dx, y: p.y + dy })),
              );
            }
          }
        }
      }

      // NOTE: `cascadeContainerReflow` and `forceResolveOverlaps` are intentionally
      // skipped here. `autoLayout` already sizes every container to
      // `max(content + padding, MIN_CONTAINER, visual minimum)` and places
      // siblings with 48px clearance. The legacy cascade recomputes container
      // size from raw child content (ignoring visual minimums like Private
      // Network's 560×320 floor) AND repositions the container around its
      // children's centroid — both of which undo the fresh dagre layout and
      // manifest as overlapping blocks.

      // Persist dagre's routed polylines so SvgConnectionPath can draw edges
      // that actually bend around nodes instead of cutting straight through.
      // Only safe for master-organize: per-container organize leaves outside
      // nodes in old positions, which would mismatch fresh routes.
      if (!containerId) {
        applyEdgeRoutes(card.edges, edgeRoutes);
      }
    },

    // ── Proportional zoom scaling ──────────────────────────────────────
    // Instead of re-running the full layout (which rearranges topology and
    // causes jumps), scale positions and sizes proportionally around the
    // centroid.  The relative arrangement stays identical — blocks just
    // grow/shrink in place.
    scaleLayoutForZoom: (state, action: PayloadAction<{ zoom: number; prevZoom: number }>) => {
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
    expandBlueprintToCard: (state, action: PayloadAction<ExpandedBlueprint>) => {
      pushSnapshot(state);
      const card = state.cards.find((c) => c.id === state.activeCardId);
      if (!card) return;

      // Run blueprint-emitted nodes through the migrator for parity with
      // the other ingestion paths — defends against any blueprint that
      // still references a legacy iceType.
      card.nodes.push(migrateCardNode(action.payload.node as CardNode));
    },

    // Undo last change on active card
    undoCardChange: (state) => {
      const card = state.cards.find((c) => c.id === state.activeCardId);
      if (!card) return;

      const history = state.history[card.id];
      if (!history || history.past.length === 0) return;

      // Save current state to future (redo)
      history.future.push({
        nodes: JSON.parse(JSON.stringify(card.nodes)),
        edges: JSON.parse(JSON.stringify(card.edges)),
      });

      // Restore from past
      const snapshot = history.past.pop()!;
      card.nodes = snapshot.nodes;
      card.edges = snapshot.edges;
    },

    // Redo last undone change on active card
    redoCardChange: (state) => {
      const card = state.cards.find((c) => c.id === state.activeCardId);
      if (!card) return;

      const history = state.history[card.id];
      if (!history || history.future.length === 0) return;

      // Save current state to past (undo)
      history.past.push({
        nodes: JSON.parse(JSON.stringify(card.nodes)),
        edges: JSON.parse(JSON.stringify(card.edges)),
      });

      // Restore from future
      const snapshot = history.future.pop()!;
      card.nodes = snapshot.nodes;
      card.edges = snapshot.edges;
    },

    // Group selected nodes into a new Group.Custom container
    groupSelectedNodes: (state, action: PayloadAction<string[]>) => {
      const nodeIds = action.payload;
      if (nodeIds.length < 2) return;

      const card = state.cards.find((c) => c.id === state.activeCardId);
      if (!card) return;

      pushSnapshot(state);

      const selectedNodes = card.nodes.filter((n) => nodeIds.includes(n.id));
      if (selectedNodes.length < 2) return;

      // Compute bounding box of selected nodes
      const PADDING = 40;
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const node of selectedNodes) {
        minX = Math.min(minX, node.position.x);
        minY = Math.min(minY, node.position.y);
        maxX = Math.max(maxX, node.position.x + node.width);
        maxY = Math.max(maxY, node.position.y + node.height);
      }

      const groupNode: CardNode = {
        id: `group-${Date.now()}`,
        type: 'container',
        position: { x: minX - PADDING, y: minY - PADDING },
        width: maxX - minX + PADDING * 2,
        height: maxY - minY + PADDING * 2 + 30, // extra 30 for group header
        data: {
          label: 'New Group',
          iceType: 'Group.Custom',
          groupColor: '#3b82f6',
          behavior: 'container',
          status: 'active',
          folded: false,
        },
      };

      card.nodes.push(groupNode);

      // Reparent selected nodes (only top-level ones, not already children of each other)
      for (const node of selectedNodes) {
        if (!nodeIds.includes(node.parentId || '')) {
          node.parentId = groupNode.id;
        }
      }
    },
  },
});

// =============================================================================
// Exports
// =============================================================================

export const {
  setActiveCard,
  createCard,
  deleteCard,
  renameCard,
  addNodeToCard,
  addEdgeToCard,
  clearCardDeployOverlay,
  updateCardEdgeData,
  reverseCardEdge,
  updateCardNodePosition,
  updateCardNodePositions,
  resizeCardNode,
  toggleCardNodeFold,
  updateCardNodeParent,
  updateCardNodeData,
  deleteCardNode,
  deleteCardEdge,
  importToActiveCard,
  addToActiveCard,
  setCardViewport,
  setCardViewportById,
  autoOrganizeCard,
  scaleLayoutForZoom,
  expandBlueprintToCard,
  undoCardChange,
  redoCardChange,
  groupSelectedNodes,
} = cardsSlice.actions;

export default cardsSlice.reducer;

// =============================================================================
// Selectors
// =============================================================================

export const selectActiveCard = (state: { cards: CardsState }) =>
  state.cards.cards.find((c) => c.id === state.cards.activeCardId);
export const selectCanUndo = (state: { cards: CardsState }) => {
  if (!state.cards.activeCardId) return false;
  const h = state.cards.history[state.cards.activeCardId];
  return h ? h.past.length > 0 : false;
};
export const selectCanRedo = (state: { cards: CardsState }) => {
  if (!state.cards.activeCardId) return false;
  const h = state.cards.history[state.cards.activeCardId];
  return h ? h.future.length > 0 : false;
};

/**
 * Cards Slice
 *
 * Manages multiple canvas cards/tabs, each with separate nodes and edges.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { autoLayout, type LayoutNode } from '../../shared/utils/auto-layout';
import type { ExpandedBlueprint } from '../../config/blocks';

// =============================================================================
// Types
// =============================================================================

export interface CardNode {
  id: string;
  type: 'block' | 'resource' | 'container';
  position: { x: number; y: number };
  width: number;
  height: number;
  parentId?: string;
  data: Record<string, unknown>;
}

export interface CardEdge {
  id: string;
  source: string;
  target: string;
  data?: { relationship?: string; [key: string]: unknown };
}

export interface CardViewport {
  panX: number;
  panY: number;
  scale: number;
}

export interface Card {
  id: string;
  name: string;
  nodes: CardNode[];
  edges: CardEdge[];
  viewport: CardViewport;
  createdAt: number;
  projectId?: string;
  environmentId?: string;
}

const DEFAULT_VIEWPORT: CardViewport = {
  panX: 0,
  panY: 0,
  scale: 1,
};

/** Snapshot of a card's nodes + edges for undo/redo */
interface CardSnapshot {
  nodes: CardNode[];
  edges: CardEdge[];
}

/** Per-card undo/redo history */
interface CardHistory {
  past: CardSnapshot[];
  future: CardSnapshot[];
}

export interface CardsState {
  cards: Card[];
  activeCardId: string;
  /** Per-card undo/redo stacks keyed by card ID */
  history: Record<string, CardHistory>;
}

// =============================================================================
// Persistence
// =============================================================================

const CARDS_STORAGE_KEY = 'ice-cards';

/**
 * Data version — bump this to force-clear persisted cards on next load.
 * v5: Removed hardcoded demo card — cards now come from backend.
 */
const CARDS_DATA_VERSION = 5;
const CARDS_VERSION_KEY = 'ice-cards-version';

/**
 * Organizational iceTypes that migrated from Block.* to Group.*
 */
const BLOCK_TO_GROUP_TYPES = new Set(['Frontend', 'Services', 'Data', 'Messaging', 'Monitoring', 'External']);

/**
 * Migrate persisted node data:
 * - Cluster.* iceType → Block.* (legacy)
 * - Block.Frontend/Services/Data/Messaging/Monitoring/External → Group.* with type: 'group'
 */
function migrateCardNodes(nodes: CardNode[]): CardNode[] {
  return nodes.map((node) => {
    const iceType = (node.data?.iceType as string) || '';

    // Legacy: Cluster.* → Block.*
    if (iceType.startsWith('Cluster.')) {
      const suffix = iceType.slice('Cluster.'.length);
      // Check if it should be a Group instead
      if (BLOCK_TO_GROUP_TYPES.has(suffix)) {
        return {
          ...node,
          type: 'container' as const,
          data: { ...node.data, iceType: `Group.${suffix}` },
        };
      }
      return {
        ...node,
        type: 'block' as const,
        data: { ...node.data, iceType: `Block.${suffix}` },
      };
    }

    // Migrate organizational Block.* → Group.*
    if (iceType.startsWith('Block.')) {
      const suffix = iceType.slice('Block.'.length);
      if (BLOCK_TO_GROUP_TYPES.has(suffix)) {
        return {
          ...node,
          type: 'container' as const,
          data: { ...node.data, iceType: `Group.${suffix}` },
        };
      }
    }

    return node;
  });
}

function loadPersistedCards(): CardsState {
  try {
    // Version check — clear stale data when data format changes
    const storedVersion = parseInt(localStorage.getItem(CARDS_VERSION_KEY) || '0', 10);
    if (storedVersion < CARDS_DATA_VERSION) {
      localStorage.removeItem(CARDS_STORAGE_KEY);
      localStorage.setItem(CARDS_VERSION_KEY, String(CARDS_DATA_VERSION));
      return { cards: [], activeCardId: null, history: {} };
    }

    const raw = localStorage.getItem(CARDS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.cards && parsed.cards.length > 0) {
        const cards = parsed.cards
          .filter((c: any) => c.id !== 'demo') // drop legacy demo card
          .map((c: any) => ({ ...c, nodes: migrateCardNodes(c.nodes || []) }));
        return {
          cards,
          activeCardId: parsed.activeCardId === 'demo' ? cards[0]?.id || null : parsed.activeCardId || null,
          history: {},
        };
      }
    }
  } catch {
    /* ignore corrupt data */
  }
  return { cards: [], activeCardId: null, history: {} };
}

// =============================================================================
// Initial State
// =============================================================================

const MAX_HISTORY = 50;

const loadedCards = loadPersistedCards();
const initialState: CardsState = {
  ...loadedCards,
  history: {},
};

/**
 * Coalescing: track the last action type that created a snapshot.
 * Sequential calls to the same high-frequency action (position, resize)
 * only snapshot on the FIRST call, so dragging creates one undo step.
 */
let _lastSnapshotAction = '';

/** High-frequency actions that should be coalesced into one undo step */
const COALESCE_ACTIONS = new Set(['updateCardNodePosition', 'updateCardNodePositions', 'resizeCardNode']);

/**
 * Push a snapshot of the active card's current state onto its undo stack.
 * Called before any mutation that should be undoable.
 * Clears the redo stack (new action invalidates future).
 *
 * For high-frequency actions (drag/resize), only the first call in a
 * sequence creates a snapshot — subsequent calls are coalesced.
 */
function pushSnapshot(state: CardsState, actionType?: string): void {
  // Coalesce rapid-fire position/resize updates
  if (actionType && COALESCE_ACTIONS.has(actionType)) {
    if (_lastSnapshotAction === actionType) return; // already snapshotted
  }
  _lastSnapshotAction = actionType || '';

  const card = state.cards.find((c) => c.id === state.activeCardId);
  if (!card) return;

  const cardId = card.id;
  if (!state.history[cardId]) {
    state.history[cardId] = { past: [], future: [] };
  }

  const history = state.history[cardId];
  history.past.push({
    nodes: JSON.parse(JSON.stringify(card.nodes)),
    edges: JSON.parse(JSON.stringify(card.edges)),
  });

  // Cap history size
  if (history.past.length > MAX_HISTORY) {
    history.past.shift();
  }

  // New action clears redo
  history.future = [];
}

// =============================================================================
// Slice
// =============================================================================

const cardsSlice = createSlice({
  name: 'cards',
  initialState,
  reducers: {
    // Set active card
    setActiveCard: (state, action: PayloadAction<string>) => {
      if (state.cards.some((c) => c.id === action.payload)) {
        state.activeCardId = action.payload;
      }
    },

    // Create new card
    createCard: (
      state,
      action: PayloadAction<{ name?: string; id?: string; projectId?: string; environmentId?: string } | undefined>,
    ) => {
      const id = action.payload?.id || `card-${Date.now()}`;
      const existingNames = state.cards.map((c) => c.name);
      const name = action.payload?.name || 'New Card';

      // Ensure unique name
      let counter = 1;
      let uniqueName = name;
      while (existingNames.includes(uniqueName)) {
        uniqueName = `${name} ${counter++}`;
      }

      const newCard: Card = {
        id,
        name: uniqueName,
        nodes: [],
        edges: [],
        viewport: { ...DEFAULT_VIEWPORT },
        createdAt: Date.now(),
        projectId: action.payload?.projectId,
        environmentId: action.payload?.environmentId,
      };

      state.cards.push(newCard);
      state.activeCardId = id;
    },

    // Delete card
    deleteCard: (state, action: PayloadAction<string>) => {
      const cardId = action.payload;
      const cardIndex = state.cards.findIndex((c) => c.id === cardId);

      if (cardIndex === -1) return;

      state.cards.splice(cardIndex, 1);

      // If we deleted the active card, switch to another or clear
      if (state.activeCardId === cardId) {
        state.activeCardId = state.cards.length > 0 ? state.cards[Math.max(0, cardIndex - 1)].id : '';
      }
    },

    // Rename card
    renameCard: (state, action: PayloadAction<{ cardId: string; name: string }>) => {
      const card = state.cards.find((c) => c.id === action.payload.cardId);
      if (card) {
        card.name = action.payload.name;
      }
    },

    // Add node to active card
    addNodeToCard: (state, action: PayloadAction<CardNode>) => {
      pushSnapshot(state);
      const card = state.cards.find((c) => c.id === state.activeCardId);
      if (card) {
        card.nodes.push(action.payload);
      }
    },

    // Add edge to active card
    addEdgeToCard: (state, action: PayloadAction<CardEdge>) => {
      pushSnapshot(state);
      const card = state.cards.find((c) => c.id === state.activeCardId);
      if (card) {
        card.edges.push(action.payload);
      }
    },

    // Update edge data in active card
    updateCardEdgeData: (state, action: PayloadAction<{ edgeId: string; data: Record<string, unknown> }>) => {
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
    reverseCardEdge: (state, action: PayloadAction<string>) => {
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

    // Update node position in active card (L2 / canonical position)
    updateCardNodePosition: (state, action: PayloadAction<{ nodeId: string; x: number; y: number }>) => {
      pushSnapshot(state, 'updateCardNodePosition');
      const card = state.cards.find((c) => c.id === state.activeCardId);
      if (card) {
        const node = card.nodes.find((n) => n.id === action.payload.nodeId);
        if (node) {
          node.position.x = action.payload.x;
          node.position.y = action.payload.y;
        }
      }
    },

    // Batch update node positions in active card (L2 / canonical position)
    updateCardNodePositions: (
      state,
      action: PayloadAction<Array<{ id: string; position: { x: number; y: number } }>>,
    ) => {
      pushSnapshot(state, 'updateCardNodePositions');
      const card = state.cards.find((c) => c.id === state.activeCardId);
      if (card) {
        for (const update of action.payload) {
          const node = card.nodes.find((n) => n.id === update.id);
          if (node) {
            node.position.x = update.position.x;
            node.position.y = update.position.y;
          }
        }
      }
    },

    // Resize node in active card
    resizeCardNode: (state, action: PayloadAction<{ id: string; width: number; height: number }>) => {
      pushSnapshot(state, 'resizeCardNode');
      const card = state.cards.find((c) => c.id === state.activeCardId);
      if (card) {
        const node = card.nodes.find((n) => n.id === action.payload.id);
        if (node) {
          node.width = action.payload.width;
          node.height = action.payload.height;
        }
      }
    },

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
        card.nodes = action.payload.nodes;
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
          const organizedNodes = autoLayout(layoutNodes, layoutEdges, {
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
        }
      }
    },

    // Update viewport for active card
    setCardViewport: (state, action: PayloadAction<CardViewport>) => {
      const card = state.cards.find((c) => c.id === state.activeCardId);
      if (card) {
        card.viewport = action.payload;
      }
    },

    // Update viewport for a specific card (used by split view)
    setCardViewportById: (state, action: PayloadAction<{ cardId: string; viewport: CardViewport }>) => {
      const card = state.cards.find((c) => c.id === action.payload.cardId);
      if (card) {
        card.viewport = action.payload.viewport;
      }
    },

    // Auto-organize nodes in active card
    autoOrganizeCard: (state) => {
      const card = state.cards.find((c) => c.id === state.activeCardId);
      if (!card || card.nodes.length === 0) return;
      pushSnapshot(state);

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
      const organizedNodes = autoLayout(layoutNodes, layoutEdges, {
        startX: 50,
        startY: 50,
        nodeGap: 80,
        nodesPerRow: 3,
        containerPadding: 30,
      });

      // Create a map of organized positions
      const organizedMap = new Map(organizedNodes.map((n) => [n.id, n]));

      // Update card nodes with new positions and sizes.
      // For folded nodes, preserve their stored expanded height —
      // the layout uses the collapsed height for positioning, but the stored
      // height should reflect the expanded size for when they're unfolded.
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
    },

    // Expand a blueprint into the active card (single flat resource node)
    expandBlueprintToCard: (state, action: PayloadAction<ExpandedBlueprint>) => {
      pushSnapshot(state);
      const card = state.cards.find((c) => c.id === state.activeCardId);
      if (!card) return;

      card.nodes.push(action.payload.node as CardNode);
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
  setCardViewport,
  setCardViewportById,
  autoOrganizeCard,
  expandBlueprintToCard,
  undoCardChange,
  redoCardChange,
  groupSelectedNodes,
} = cardsSlice.actions;

export default cardsSlice.reducer;

// =============================================================================
// Selectors
// =============================================================================

export const selectCards = (state: { cards: CardsState }) => state.cards.cards;
export const selectActiveCardId = (state: { cards: CardsState }) => state.cards.activeCardId;
export const selectActiveCard = (state: { cards: CardsState }) =>
  state.cards.cards.find((c) => c.id === state.cards.activeCardId);
export const selectCanUndo = (state: { cards: CardsState }) => {
  const h = state.cards.history[state.cards.activeCardId];
  return h ? h.past.length > 0 : false;
};
export const selectCanRedo = (state: { cards: CardsState }) => {
  const h = state.cards.history[state.cards.activeCardId];
  return h ? h.future.length > 0 : false;
};

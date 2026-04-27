/**
 * Cards Slice
 *
 * Manages multiple canvas cards/tabs, each with separate nodes and edges.
 */

import { LAYOUT_NODE_SEP } from '@ice/constants';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import {
  CONTAINER_PADDING,
  HEADER_HEIGHT,
  MIN_CONTAINER_WIDTH,
  MIN_CONTAINER_HEIGHT,
} from '../../config/canvas-constants';
import { isContainer as isContainerIceType } from '../../config/containment-rules';
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
  activeCardId: string | null;
  /** Per-card undo/redo stacks keyed by card ID */
  history: Record<string, CardHistory>;
}

// =============================================================================
// Persistence
// =============================================================================

const CARDS_STORAGE_KEY = 'ice-cards';

/**
 * Data version — bumped whenever the persisted node shape changes. The
 * loader runs `migrateCardNodes` over the stored payload before bumping
 * the version key, so a version-mismatch is a *migrate* event, never a
 * wipe (see learning `data-version-bump-migrates-not-wipes`). Every
 * ingestion reducer that accepts external nodes (addNodeToCard,
 * importToActiveCard, addToActiveCard, expandBlueprintToCard) also runs
 * the migrator so backend-saved canvases / clipboard imports / AI
 * tool-use writes pick up the same fixes the localStorage loader does.
 *
 * v5: Removed hardcoded demo card — cards now come from backend.
 * v6: Monitoring.Terminal → Monitoring.Log consolidation.
 */
const CARDS_DATA_VERSION = 6;
const CARDS_VERSION_KEY = 'ice-cards-version';

/**
 * Organizational iceTypes that migrated from Block.* to Group.*
 */
const BLOCK_TO_GROUP_TYPES = new Set(['Frontend', 'Services', 'Data', 'Messaging', 'Monitoring', 'External']);

/**
 * Migrate a single persisted node:
 * - Legacy Cluster.* / Block.* organizational types → Group.* with type: 'container'
 * - Legacy `Monitoring.Terminal` → `Monitoring.Log` (v5 → v6 consolidation).
 *
 * Idempotent — running it on already-migrated payloads is a no-op and
 * returns the same reference for nodes that didn't need a change.
 */
function migrateCardNode(node: CardNode): CardNode {
  const iceType = (node.data?.iceType as string) || '';

  // v5 → v6: Monitoring.Terminal collapsed into Monitoring.Log.
  if (iceType === 'Monitoring.Terminal') {
    return { ...node, data: { ...node.data, iceType: 'Monitoring.Log' } };
  }

  // Legacy: Cluster.* / Block.* organizational types → Group.*
  if (iceType.startsWith('Cluster.') || iceType.startsWith('Block.')) {
    const prefix = iceType.startsWith('Cluster.') ? 'Cluster.' : 'Block.';
    const suffix = iceType.slice(prefix.length);
    if (BLOCK_TO_GROUP_TYPES.has(suffix)) {
      return {
        ...node,
        type: 'container' as const,
        data: { ...node.data, iceType: `Group.${suffix}` },
      };
    }
  }

  return node;
}

/**
 * Migrate every node in a payload. Exported so external ingestion paths
 * (backend canvas restore, AI tool-use writes, tests) can reuse the same
 * migration pipeline as the localStorage loader.
 */
export function migrateCardNodes(nodes: CardNode[]): CardNode[] {
  return nodes.map(migrateCardNode);
}

function loadPersistedCards(): CardsState {
  try {
    const storedVersion = parseInt(localStorage.getItem(CARDS_VERSION_KEY) || '0', 10);
    const raw = localStorage.getItem(CARDS_STORAGE_KEY);

    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.cards && parsed.cards.length > 0) {
        const cards = parsed.cards
          .filter((c: any) => c.id !== 'demo') // drop legacy demo card
          .map((c: any) => ({ ...c, nodes: migrateCardNodes(c.nodes || []) }));

        // Persist the migrated payload back so we don't re-migrate on
        // every load, and bump the version key. We MIGRATE, never wipe —
        // a version mismatch is the trigger for migration, not for
        // discarding the user's canvas.
        if (storedVersion < CARDS_DATA_VERSION) {
          try {
            localStorage.setItem(
              CARDS_STORAGE_KEY,
              JSON.stringify({ ...parsed, cards }),
            );
            localStorage.setItem(CARDS_VERSION_KEY, String(CARDS_DATA_VERSION));
          } catch {
            /* localStorage write failed (quota, private mode); leave the
             * in-memory migrated payload — next session will re-migrate. */
          }
        }

        return {
          cards,
          activeCardId: parsed.activeCardId === 'demo' ? cards[0]?.id || null : parsed.activeCardId || null,
          history: {},
        };
      }
    }

    // No prior payload — just record the current data version for
    // future migrations.
    if (storedVersion < CARDS_DATA_VERSION) {
      try {
        localStorage.setItem(CARDS_VERSION_KEY, String(CARDS_DATA_VERSION));
      } catch {
        /* ignore */
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
// Cascading container reflow
// =============================================================================

/**
 * After an organize action, propagate container size changes upward.
 * Process deepest containers first (leaf-up) so children are sized before parents.
 */
/**
 * Copy each edge's routed polyline (produced by dagre during auto-layout)
 * onto the edge's data so SvgConnectionPath can draw through it. Absent
 * routes clear the stored waypoints so stale paths don't linger.
 */
/**
 * Drop the cached `routePoints` on any edge incident to this node — once a
 * node has moved, its dagre-computed route is stale and would render as a
 * polyline through empty space until the next auto-organize.
 */
function invalidateEdgeRoutesTouching(edges: CardEdge[], nodeId: string): void {
  for (const edge of edges) {
    if (edge.source !== nodeId && edge.target !== nodeId) continue;
    if (edge.data?.routePoints) delete edge.data.routePoints;
  }
}

function applyEdgeRoutes(edges: CardEdge[], edgeRoutes: Map<string, Array<{ x: number; y: number }>>): void {
  for (const edge of edges) {
    const route = edgeRoutes.get(`${edge.source}::${edge.target}`);
    if (!edge.data) edge.data = {};
    if (route && route.length >= 2) {
      edge.data.routePoints = route.map((p) => ({ x: p.x, y: p.y }));
    } else {
      delete edge.data.routePoints;
    }
  }
}

// eslint-disable-next-line unused-imports/no-unused-vars
function cascadeContainerReflow(nodes: CardNode[]): void {
  const containers = nodes.filter((n) => n.type === 'container');
  if (containers.length === 0) return;

  const depthOf = (nodeId: string): number => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node?.parentId) return 0;
    return 1 + depthOf(node.parentId);
  };
  const depths = new Map(containers.map((c) => [c.id, depthOf(c.id)]));
  const sorted = [...containers].sort((a, b) => (depths.get(b.id) || 0) - (depths.get(a.id) || 0));

  for (const container of sorted) {
    const children = nodes.filter((n) => n.parentId === container.id);
    if (children.length === 0) continue;

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const child of children) {
      minX = Math.min(minX, child.position.x);
      minY = Math.min(minY, child.position.y);
      maxX = Math.max(maxX, child.position.x + child.width);
      maxY = Math.max(maxY, child.position.y + child.height);
    }

    // Symmetric padding: equal on all sides. HEADER_HEIGHT is added to top
    // only for the label bar, so top padding = CONTAINER_PADDING + HEADER_HEIGHT.
    const contentW = maxX - minX;
    const contentH = maxY - minY;
    const newW = Math.max(contentW + CONTAINER_PADDING * 2, MIN_CONTAINER_WIDTH);
    const newH = Math.max(contentH + CONTAINER_PADDING * 2 + HEADER_HEIGHT, MIN_CONTAINER_HEIGHT);

    // Center the container around its children (symmetric L/R padding)
    const contentCenterX = (minX + maxX) / 2;
    const contentCenterY = (minY + maxY) / 2;
    container.width = newW;
    container.height = newH;
    container.position.x = contentCenterX - newW / 2;
    // Vertically: shift up by half the header to keep content visually centered
    container.position.y = contentCenterY - (newH - HEADER_HEIGHT) / 2 - HEADER_HEIGHT;
  }
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
        // Run external payloads through the migrator so any legacy iceType
        // (e.g. Monitoring.Terminal carried by an AI tool-use write) is
        // upgraded before it lands on the canvas.
        card.nodes.push(migrateCardNode(action.payload));
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

    // Clear all deploy-related overlay fields from every node in the
    // active card. Used after a successful destroy so the canvas blocks
    // and properties panel stop showing "Live" / URL pills for resources
    // that no longer exist. The fields wiped here mirror the ones the
    // deploy subscription hook + node-outputs hydrator set when a deploy
    // succeeds; missing one would leave a ghost field on the block.
    clearCardDeployOverlay: (state, action: PayloadAction<{ cardId?: string }>) => {
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
    // BND-2: Clamps child nodes to parent bounds as a safety net.
    updateCardNodePosition: (state, action: PayloadAction<{ nodeId: string; x: number; y: number }>) => {
      pushSnapshot(state, 'updateCardNodePosition');
      const card = state.cards.find((c) => c.id === state.activeCardId);
      if (card) {
        const node = card.nodes.find((n) => n.id === action.payload.nodeId);
        if (node) {
          let { x, y } = action.payload;
          if (node.parentId) {
            const parent = card.nodes.find((n) => n.id === node.parentId);
            if (parent) {
              const minX = parent.position.x + CONTAINER_PADDING;
              const minY = parent.position.y + CONTAINER_PADDING + HEADER_HEIGHT;
              const maxX = parent.position.x + parent.width - CONTAINER_PADDING - node.width;
              const maxY = parent.position.y + parent.height - CONTAINER_PADDING - node.height;
              x = Math.max(minX, Math.min(maxX, x));
              y = Math.max(minY, Math.min(maxY, y));
            }
          }
          node.position.x = x;
          node.position.y = y;
          invalidateEdgeRoutesTouching(card.edges, action.payload.nodeId);
        }
      }
    },

    // Batch update node positions in active card (L2 / canonical position)
    // BND-2: Clamps child nodes to parent bounds as a safety net.
    // Parent positions are applied first (they appear earlier in the update array)
    // so that expanded parent dimensions are available for child clamping.
    // Pass skipClamp: true during Shift+drag to allow nodes to escape containers.
    updateCardNodePositions: (
      state,
      action: PayloadAction<
        | {
            updates: Array<{ id: string; position: { x: number; y: number } }>;
            skipClamp?: boolean;
          }
        | Array<{ id: string; position: { x: number; y: number } }>
      >,
    ) => {
      pushSnapshot(state, 'updateCardNodePositions');
      const card = state.cards.find((c) => c.id === state.activeCardId);
      if (card) {
        // Support both old array format and new { updates, skipClamp } format
        const updates = Array.isArray(action.payload) ? action.payload : action.payload.updates;
        const skipClamp = Array.isArray(action.payload) ? false : !!action.payload.skipClamp;

        // First pass: apply all position updates
        const movedIds = new Set<string>();
        for (const update of updates) {
          const node = card.nodes.find((n) => n.id === update.id);
          if (node) {
            node.position.x = update.position.x;
            node.position.y = update.position.y;
            movedIds.add(update.id);
          }
        }
        for (const id of movedIds) invalidateEdgeRoutesTouching(card.edges, id);
        // Second pass: clamp children to their parent bounds (skip during Shift+drag)
        if (!skipClamp) {
          for (const update of updates) {
            const node = card.nodes.find((n) => n.id === update.id);
            if (node?.parentId) {
              const parent = card.nodes.find((n) => n.id === node.parentId);
              if (parent) {
                const minX = parent.position.x + CONTAINER_PADDING;
                const minY = parent.position.y + CONTAINER_PADDING + HEADER_HEIGHT;
                const maxX = parent.position.x + parent.width - CONTAINER_PADDING - node.width;
                const maxY = parent.position.y + parent.height - CONTAINER_PADDING - node.height;
                node.position.x = Math.max(minX, Math.min(maxX, node.position.x));
                node.position.y = Math.max(minY, Math.min(maxY, node.position.y));
              }
            }
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

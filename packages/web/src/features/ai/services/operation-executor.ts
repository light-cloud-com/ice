/**
 * AI Operation Executor
 *
 * Takes an array of AiCanvasOp and dispatches the corresponding Redux actions.
 * Handles ID remapping, blueprint resolution, validation, and undo snapshots.
 */

import type { AppDispatch } from '../../../store';
import type { AiCanvasOp, AddBlueprintOp } from '@ice-saas/types';
import type { Card, CardNode } from '../../../store/slices/cards-slice';
import {
  addNodeToCard,
  addEdgeToCard,
  updateCardNodeData,
  updateCardNodePosition,
  updateCardNodePositions,
  resizeCardNode,
  updateCardNodeParent,
  deleteCardNode,
  deleteCardEdge,
  updateCardEdgeData,
  autoOrganizeCard,
  selectActiveCard,
} from '../../../store/slices/cards-slice';
import { getBlueprint, expandBlueprint } from '../../../config/blocks';
import type { Provider } from '../../../config/blocks/types';
import { canContain } from '../../../config/containment-rules';
import { store } from '../../../store';

// =============================================================================
// Types
// =============================================================================

export interface SkippedOp {
  op: AiCanvasOp;
  reason: string;
}

export interface ExecutionResult {
  success: boolean;
  executedOps: number;
  skippedOps: SkippedOp[];
  /** Map of AI-generated placeholder IDs to real IDs */
  createdNodeIds: Map<string, string>;
}

/** Max operations per AI response to prevent overwhelming the canvas */
const MAX_OPS = 50;

// =============================================================================
// ID Generation (matches expand-blueprint.ts pattern)
// =============================================================================

let _counter = 0;

function generateNodeId(): string {
  return `node-${Date.now()}-${_counter++}`;
}

function generateEdgeId(): string {
  return `edge-${Date.now()}-${_counter++}`;
}

// =============================================================================
// Helpers
// =============================================================================

/** Resolve an ID through the remapping table, falling back to the original */
function resolveId(id: string, idMap: Map<string, string>): string {
  return idMap.get(id) || id;
}

/** Check if a node exists in the current card (by actual or remapped ID) */
function nodeExists(nodeId: string, card: Card, idMap: Map<string, string>): boolean {
  const resolvedId = resolveId(nodeId, idMap);
  return card.nodes.some((n) => n.id === resolvedId);
}

// =============================================================================
// Positioning — non-overlapping grid placement
// =============================================================================

const NODE_GAP_X = 40;
const NODE_GAP_Y = 40;
const NODE_WIDTH = 280;
const NODE_HEIGHT = 160;
const COLS_PER_ROW = 3;
const CONTAINER_INNER_PAD = 30;
const CONTAINER_HEADER_PAD = 50;

/**
 * Find a non-overlapping position for a new node.
 * If parentId is provided, positions inside the parent.
 * Uses a grid layout based on existing siblings.
 */
function findPosition(
  card: Card,
  parentId?: string,
  nodeWidth: number = NODE_WIDTH,
  nodeHeight: number = NODE_HEIGHT,
): { x: number; y: number } {
  if (parentId) {
    return findChildPosition(card, parentId, nodeWidth, nodeHeight);
  }
  return findRootPosition(card, nodeWidth);
}

function findRootPosition(card: Card, nodeWidth: number): { x: number; y: number } {
  const rootNodes = card.nodes.filter((n) => !n.parentId);
  if (rootNodes.length === 0) return { x: 100, y: 100 };

  const col = rootNodes.length % COLS_PER_ROW;
  const row = Math.floor(rootNodes.length / COLS_PER_ROW);

  // Use actual widths to avoid overlap
  const colWidth = Math.max(nodeWidth, NODE_WIDTH) + NODE_GAP_X;
  const rowHeight = NODE_HEIGHT + NODE_GAP_Y;

  return {
    x: 100 + col * colWidth,
    y: 100 + row * rowHeight,
  };
}

function findChildPosition(
  card: Card,
  parentId: string,
  nodeWidth: number,
  nodeHeight: number,
): { x: number; y: number } {
  const parent = card.nodes.find((n) => n.id === parentId);
  if (!parent) return { x: 100, y: 100 };

  const siblings = card.nodes.filter((n) => n.parentId === parentId);
  const startX = parent.position.x + CONTAINER_INNER_PAD;
  const startY = parent.position.y + CONTAINER_HEADER_PAD;

  if (siblings.length === 0) {
    return { x: startX, y: startY };
  }

  // Find the first position that doesn't overlap any sibling
  // Try grid positions, then fall back to stacking below
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < COLS_PER_ROW; col++) {
      const x = startX + col * (nodeWidth + NODE_GAP_X);
      const y = startY + row * (nodeHeight + NODE_GAP_Y);

      const overlaps = siblings.some((s) => {
        const sw = s.width || NODE_WIDTH;
        const sh = s.height || NODE_HEIGHT;
        return !(x + nodeWidth + NODE_GAP_X <= s.position.x ||
                 x >= s.position.x + sw + NODE_GAP_X ||
                 y + nodeHeight + NODE_GAP_Y <= s.position.y ||
                 y >= s.position.y + sh + NODE_GAP_Y);
      });

      if (!overlaps) return { x, y };
    }
  }

  // Fallback: stack below last sibling
  let maxBottom = startY;
  for (const s of siblings) {
    maxBottom = Math.max(maxBottom, s.position.y + (s.height || NODE_HEIGHT));
  }
  return { x: startX, y: maxBottom + NODE_GAP_Y };
}

// =============================================================================
// Blueprint Resolution
// =============================================================================

function resolveBlueprint(
  op: AddBlueprintOp,
  card: Card,
  idMap: Map<string, string>,
): CardNode | null {
  const blueprint = getBlueprint(op.blockType, op.provider);
  if (!blueprint) return null;

  const parentContainerId = op.parentId ? resolveId(op.parentId, idMap) : undefined;
  const position = op.position || findPosition(card, parentContainerId);

  const expanded = expandBlueprint(blueprint, {
    position,
    provider: (op.provider as Provider) || undefined,
    parentContainerId,
  });

  const node = expanded.node as CardNode;

  if (op.label) {
    node.data = { ...node.data, label: op.label };
  }
  if (op.dataOverrides) {
    node.data = { ...node.data, ...op.dataOverrides };
  }

  return node;
}

// =============================================================================
// Container Auto-Resize
// =============================================================================

const RESIZE_PAD = 30;
const RESIZE_HEADER = 40;

/**
 * After AI operations, auto-resize all group/container nodes
 * to fit their children with padding. Processes deepest containers first
 * (bottom-up) so nested containers resize correctly.
 */
function autoResizeContainers(dispatch: AppDispatch, card: Card): void {
  // Find all container nodes (groups)
  const containers = card.nodes.filter((n) => n.type === 'container');
  if (containers.length === 0) return;

  // Sort by depth (deepest first) — containers inside other containers resize first
  const depthOf = (node: CardNode): number => {
    let d = 0;
    let current = node;
    while (current.parentId) {
      d++;
      const parent = card.nodes.find((n) => n.id === current.parentId);
      if (!parent) break;
      current = parent;
    }
    return d;
  };

  const sorted = [...containers].sort((a, b) => depthOf(b) - depthOf(a));

  for (const container of sorted) {
    const children = card.nodes.filter((n) => n.parentId === container.id);
    if (children.length === 0) continue;

    // Find bounding box of children
    let minX = Infinity, minY = Infinity, maxR = -Infinity, maxB = -Infinity;
    for (const child of children) {
      minX = Math.min(minX, child.position.x);
      minY = Math.min(minY, child.position.y);
      maxR = Math.max(maxR, child.position.x + (child.width || 280));
      maxB = Math.max(maxB, child.position.y + (child.height || 160));
    }

    // Required container bounds (children bbox + padding)
    const reqX = minX - RESIZE_PAD;
    const reqY = minY - RESIZE_PAD - RESIZE_HEADER;
    const reqW = (maxR + RESIZE_PAD) - reqX;
    const reqH = (maxB + RESIZE_PAD) - reqY;

    // Expand container to fit (don't shrink below current size or required)
    const newX = Math.min(container.position.x, reqX);
    const newY = Math.min(container.position.y, reqY);
    const newW = Math.max(container.width || 280, reqW, (maxR + RESIZE_PAD) - newX);
    const newH = Math.max(container.height || 160, reqH, (maxB + RESIZE_PAD) - newY);

    if (newX !== container.position.x || newY !== container.position.y) {
      dispatch(updateCardNodePositions([{ id: container.id, position: { x: newX, y: newY } }]));
    }
    if (newW !== container.width || newH !== container.height) {
      dispatch(resizeCardNode({ id: container.id, width: newW, height: newH }));
    }
  }
}

// =============================================================================
// Execute
// =============================================================================

/**
 * Execute an array of AI canvas operations against the Redux store.
 *
 * Returns a snapshot of the card state before execution (for undo)
 * and the execution result with stats.
 */
export function executeAiOperations(
  dispatch: AppDispatch,
  operations: AiCanvasOp[],
): { result: ExecutionResult; snapshot: Card | null } {
  const card = selectActiveCard(store.getState());
  if (!card) {
    return {
      result: { success: false, executedOps: 0, skippedOps: [], createdNodeIds: new Map() },
      snapshot: null,
    };
  }

  // Snapshot for undo
  const snapshot = structuredClone(card);

  // Enforce operation limit
  const ops = operations.slice(0, MAX_OPS);

  const idMap = new Map<string, string>();
  const skippedOps: SkippedOp[] = [];
  let executedOps = 0;

  // Re-read card after each mutation so subsequent ops see the updated state
  const getCard = () => selectActiveCard(store.getState()) || card;

  for (const op of ops) {
    try {
      switch (op.op) {
        case 'addBlueprint': {
          const currentCard = getCard();
          const node = resolveBlueprint(op, currentCard, idMap);
          if (!node) {
            skippedOps.push({ op, reason: `Blueprint not found: ${op.blockType}` });
            break;
          }
          // Map AI-provided placeholder ID and blockType to real node ID
          if (op.id) {
            idMap.set(op.id, node.id);
          }
          idMap.set(op.blockType, node.id);
          // Also map any placeholder that may appear in edges
          if (op.parentId) {
            const resolvedParent = resolveId(op.parentId, idMap);
            if (!currentCard.nodes.some((n) => n.id === resolvedParent)) {
              // Parent doesn't exist, place at root
              delete node.parentId;
            }
          }
          dispatch(addNodeToCard(node));
          executedOps++;
          break;
        }

        case 'addNode': {
          const realId = generateNodeId();
          idMap.set(op.node.id, realId);
          const currentCard = getCard();

          const parentId = op.node.parentId ? resolveId(op.node.parentId, idMap) : undefined;
          if (parentId && !currentCard.nodes.some((n) => n.id === parentId)) {
            skippedOps.push({ op, reason: `Parent node not found: ${op.node.parentId}` });
            break;
          }

          // Size: groups/containers start small — auto-resize will expand them
          const isGroup = op.node.type === 'container';
          const iceType = (op.node.data?.iceType as string) || '';
          const isVpc = iceType === 'Network.VPC';
          const isSubnet = iceType === 'Network.Subnet';
          const defaultWidth = isVpc ? 200 : isSubnet ? 200 : isGroup ? 200 : NODE_WIDTH;
          const defaultHeight = isVpc ? 100 : isSubnet ? 100 : isGroup ? 100 : NODE_HEIGHT;
          const nodeW = op.node.width || defaultWidth;
          const nodeH = op.node.height || defaultHeight;

          // Use shared positioning — avoids overlaps
          const position = (op.node.position && op.node.position.x !== 0 && op.node.position.y !== 0)
            ? op.node.position
            : findPosition(currentCard, parentId, nodeW, nodeH);

          dispatch(addNodeToCard({
            id: realId,
            type: op.node.type,
            position,
            width: nodeW,
            height: nodeH,
            data: op.node.data,
            ...(parentId ? { parentId } : {}),
          }));
          executedOps++;
          break;
        }

        case 'addEdge': {
          const currentCard = getCard();
          const sourceId = resolveId(op.edge.source, idMap);
          const targetId = resolveId(op.edge.target, idMap);

          if (!currentCard.nodes.some((n) => n.id === sourceId)) {
            skippedOps.push({ op, reason: `Source node not found: ${op.edge.source}` });
            break;
          }
          if (!currentCard.nodes.some((n) => n.id === targetId)) {
            skippedOps.push({ op, reason: `Target node not found: ${op.edge.target}` });
            break;
          }

          const edgeId = generateEdgeId();
          idMap.set(op.edge.id, edgeId);

          dispatch(addEdgeToCard({
            id: edgeId,
            source: sourceId,
            target: targetId,
            data: op.edge.data,
          }));
          executedOps++;
          break;
        }

        case 'updateNodeData': {
          const resolvedId = resolveId(op.nodeId, idMap);
          if (!nodeExists(op.nodeId, getCard(), idMap)) {
            skippedOps.push({ op, reason: `Node not found: ${op.nodeId}` });
            break;
          }
          dispatch(updateCardNodeData({ nodeId: resolvedId, data: op.data }));
          executedOps++;
          break;
        }

        case 'updateNodePosition': {
          const resolvedId = resolveId(op.nodeId, idMap);
          if (!nodeExists(op.nodeId, getCard(), idMap)) {
            skippedOps.push({ op, reason: `Node not found: ${op.nodeId}` });
            break;
          }
          dispatch(updateCardNodePosition({ nodeId: resolvedId, x: op.x, y: op.y }));
          executedOps++;
          break;
        }

        case 'resizeNode': {
          const resolvedId = resolveId(op.id, idMap);
          if (!getCard().nodes.some((n) => n.id === resolvedId)) {
            skippedOps.push({ op, reason: `Node not found: ${op.id}` });
            break;
          }
          dispatch(resizeCardNode({ id: resolvedId, width: op.width, height: op.height }));
          executedOps++;
          break;
        }

        case 'reparentNode': {
          const resolvedNodeId = resolveId(op.nodeId, idMap);
          const currentCard = getCard();
          if (!currentCard.nodes.some((n) => n.id === resolvedNodeId)) {
            skippedOps.push({ op, reason: `Node not found: ${op.nodeId}` });
            break;
          }

          if (op.parentId) {
            const resolvedParentId = resolveId(op.parentId, idMap);
            const parentNode = currentCard.nodes.find((n) => n.id === resolvedParentId);
            const childNode = currentCard.nodes.find((n) => n.id === resolvedNodeId);
            if (!parentNode) {
              skippedOps.push({ op, reason: `Parent node not found: ${op.parentId}` });
              break;
            }
            const parentIceType = (parentNode.data?.iceType as string) || '';
            const childIceType = (childNode?.data?.iceType as string) || '';
            if (parentIceType && childIceType && !canContain(parentIceType, childIceType)) {
              skippedOps.push({ op, reason: `${parentIceType} cannot contain ${childIceType}` });
              break;
            }
            dispatch(updateCardNodeParent({ nodeId: resolvedNodeId, parentId: resolvedParentId }));
          } else {
            dispatch(updateCardNodeParent({ nodeId: resolvedNodeId, parentId: null }));
          }
          executedOps++;
          break;
        }

        case 'deleteNode': {
          const resolvedId = resolveId(op.nodeId, idMap);
          if (!getCard().nodes.some((n) => n.id === resolvedId)) {
            skippedOps.push({ op, reason: `Node not found: ${op.nodeId}` });
            break;
          }
          dispatch(deleteCardNode(resolvedId));
          executedOps++;
          break;
        }

        case 'deleteEdge': {
          const resolvedId = resolveId(op.edgeId, idMap);
          if (!getCard().edges.some((e) => e.id === resolvedId)) {
            skippedOps.push({ op, reason: `Edge not found: ${op.edgeId}` });
            break;
          }
          dispatch(deleteCardEdge(resolvedId));
          executedOps++;
          break;
        }

        case 'updateEdgeData': {
          const resolvedId = resolveId(op.edgeId, idMap);
          if (!getCard().edges.some((e) => e.id === resolvedId)) {
            skippedOps.push({ op, reason: `Edge not found: ${op.edgeId}` });
            break;
          }
          dispatch(updateCardEdgeData({ edgeId: resolvedId, data: op.data }));
          executedOps++;
          break;
        }

        case 'autoOrganize': {
          dispatch(autoOrganizeCard());
          executedOps++;
          break;
        }

        default:
          skippedOps.push({ op, reason: `Unknown operation type` });
      }
    } catch (err) {
      skippedOps.push({ op, reason: `Execution error: ${(err as Error).message}` });
    }
  }

  // Log skipped if any were truncated
  if (operations.length > MAX_OPS) {
    const truncated = operations.length - MAX_OPS;
    console.warn(`AI operation limit reached: ${truncated} operations truncated`);
  }

  // Auto-resize all container/group nodes to fit their children + margin
  autoResizeContainers(dispatch, getCard());

  return {
    result: {
      success: executedOps > 0,
      executedOps,
      skippedOps,
      createdNodeIds: idMap,
    },
    snapshot,
  };
}

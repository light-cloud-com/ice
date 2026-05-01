/**
 * AI Operation Executor
 *
 * Takes an array of AiCanvasOp and dispatches the corresponding Redux actions.
 * Handles ID remapping, blueprint resolution, validation, and undo snapshots.
 */

import { getBlueprint, expandBlueprint } from '../../../config/blocks';
import { canContain } from '../../../config/containment-rules';
import { store } from '../../../store';
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
import type { Provider } from '../../../config/blocks/types';
import type { AppDispatch } from '../../../store';
import type { Card, CardNode } from '../../../store/slices/cards-slice';
import type { AiCanvasOp, AddBlueprintOp } from '@ice/types';
import {
  MAX_OPS,
  NODE_GAP_X,
  NODE_GAP_Y,
  NODE_WIDTH,
  NODE_HEIGHT,
  HELPER_NODE_WIDTH,
  HELPER_NODE_HEIGHT,
  COLS_PER_ROW,
  CONTAINER_INNER_PAD,
  CONTAINER_HEADER_PAD,
  RESIZE_PAD,
  RESIZE_HEADER,
} from './ai-ops/types';
import { generateNodeId, generateEdgeId, resolveId, nodeExists } from './ai-ops/id-utils';
import {
  isHelperIceType,
  findPosition,
  findChildPosition,
} from './ai-ops/position-finder';

// =============================================================================
// Types — re-exported from ai-ops/types
// =============================================================================

import type { SkippedOp, ExecutionResult } from './ai-ops/types';
export type { SkippedOp, ExecutionResult } from './ai-ops/types';

// =============================================================================
// Blueprint Resolution
// =============================================================================

function resolveBlueprint(op: AddBlueprintOp, card: Card, idMap: Map<string, string>): CardNode | null {
  const blueprint = getBlueprint(op.iceType, op.provider);
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
    let minX = Infinity,
      minY = Infinity,
      maxR = -Infinity,
      maxB = -Infinity;
    for (const child of children) {
      minX = Math.min(minX, child.position.x);
      minY = Math.min(minY, child.position.y);
      maxR = Math.max(maxR, child.position.x + (child.width || 280));
      maxB = Math.max(maxB, child.position.y + (child.height || 160));
    }

    // Required container bounds (children bbox + padding)
    const reqX = minX - RESIZE_PAD;
    const reqY = minY - RESIZE_PAD - RESIZE_HEADER;
    const reqW = maxR + RESIZE_PAD - reqX;
    const reqH = maxB + RESIZE_PAD - reqY;

    // Expand container to fit (don't shrink below current size or required)
    const newX = Math.min(container.position.x, reqX);
    const newY = Math.min(container.position.y, reqY);
    const newW = Math.max(container.width || 280, reqW, maxR + RESIZE_PAD - newX);
    const newH = Math.max(container.height || 160, reqH, maxB + RESIZE_PAD - newY);

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
            skippedOps.push({ op, reason: `Blueprint not found: ${op.iceType}` });
            break;
          }
          // Map AI-provided placeholder ID and iceType to real node ID
          if (op.id) {
            idMap.set(op.id, node.id);
          }
          idMap.set(op.iceType, node.id);
          // Validate parentId — only containers can have children
          if (node.parentId) {
            const resolvedParent = resolveId(node.parentId, idMap);
            const parentNode = currentCard.nodes.find((n) => n.id === resolvedParent);
            if (!parentNode || parentNode.type !== 'container') {
              // Parent doesn't exist or isn't a container — place at root
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

          let parentId = op.node.parentId ? resolveId(op.node.parentId, idMap) : undefined;
          if (parentId) {
            const parentNode = currentCard.nodes.find((n) => n.id === parentId);
            if (!parentNode) {
              skippedOps.push({ op, reason: `Parent node not found: ${op.node.parentId}` });
              break;
            }
            // Only containers can have children — drop parentId for non-container targets
            if (parentNode.type !== 'container') {
              parentId = undefined;
            }
          }

          // Size: groups/containers start small — auto-resize will expand them.
          // Helper nodes (auth, secrets, logs, etc.) get a compact size.
          const isGroup = op.node.type === 'container';
          const iceType = (op.node.data?.iceType as string) || '';
          const isVpc = iceType === 'Network.VPC';
          const isSubnet = iceType === 'Network.Subnet';
          const isHelper = isHelperIceType(iceType);
          const defaultWidth = isVpc ? 280 : isSubnet ? 260 : isGroup ? 260 : isHelper ? HELPER_NODE_WIDTH : NODE_WIDTH;
          const defaultHeight = isVpc
            ? 180
            : isSubnet
              ? 150
              : isGroup
                ? 150
                : isHelper
                  ? HELPER_NODE_HEIGHT
                  : NODE_HEIGHT;
          const nodeW = op.node.width || defaultWidth;
          const nodeH = op.node.height || defaultHeight;

          // Use shared positioning — avoids overlaps
          const position =
            op.node.position && op.node.position.x !== 0 && op.node.position.y !== 0
              ? op.node.position
              : findPosition(currentCard, parentId, nodeW, nodeH);

          dispatch(
            addNodeToCard({
              id: realId,
              type: op.node.type,
              position,
              width: nodeW,
              height: nodeH,
              data: op.node.data,
              ...(parentId ? { parentId } : {}),
            }),
          );
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

          dispatch(
            addEdgeToCard({
              id: edgeId,
              source: sourceId,
              target: targetId,
              data: op.edge.data,
            }),
          );
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
          const childNode = currentCard.nodes.find((n) => n.id === resolvedNodeId);
          if (!childNode) {
            skippedOps.push({ op, reason: `Node not found: ${op.nodeId}` });
            break;
          }

          if (op.parentId) {
            const resolvedParentId = resolveId(op.parentId, idMap);
            const parentNode = currentCard.nodes.find((n) => n.id === resolvedParentId);
            if (!parentNode) {
              skippedOps.push({ op, reason: `Parent node not found: ${op.parentId}` });
              break;
            }
            // Only containers can have children
            if (parentNode.type !== 'container') {
              skippedOps.push({ op, reason: `${parentNode.data?.label || parentNode.id} is not a container` });
              break;
            }
            const parentIceType = (parentNode.data?.iceType as string) || '';
            const childIceType = (childNode?.data?.iceType as string) || '';
            if (parentIceType && childIceType && !canContain(parentIceType, childIceType)) {
              skippedOps.push({ op, reason: `${parentIceType} cannot contain ${childIceType}` });
              break;
            }
            dispatch(updateCardNodeParent({ nodeId: resolvedNodeId, parentId: resolvedParentId }));

            // Reposition the child inside the new parent using the non-overlapping
            // grid algorithm so it doesn't land on top of existing siblings.
            const updatedCard = getCard();
            const newPos = findChildPosition(
              updatedCard,
              resolvedParentId,
              childNode.width || NODE_WIDTH,
              childNode.height || NODE_HEIGHT,
            );
            dispatch(updateCardNodePosition({ nodeId: resolvedNodeId, x: newPos.x, y: newPos.y }));
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
          dispatch(autoOrganizeCard({ direction: 'vertical' }));
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

  // Safety net: auto-connect orphaned security/helper nodes to the nearest backend.
  // The AI sometimes adds auth/secrets without connecting them via edges.
  if (executedOps > 0) {
    const finalCard = getCard();
    const connectedIds = new Set<string>();
    for (const e of finalCard.edges) {
      connectedIds.add(e.source);
      connectedIds.add(e.target);
    }

    // Find backend nodes (Compute.Container, scalable backend, etc.)
    const backends = finalCard.nodes.filter((n) => {
      const t = ((n.data?.iceType as string) || '').toLowerCase();
      return /container|backend|worker|service/.test(t) && n.type !== 'container';
    });

    // Find orphaned helper nodes (security, auth, secrets, logs) with no edges
    const orphanHelpers = finalCard.nodes.filter((n) => {
      if (connectedIds.has(n.id)) return false;
      const t = ((n.data?.iceType as string) || '').toLowerCase();
      return /security|auth|secret|identity|monitoring|log|observ/.test(t);
    });

    if (backends.length > 0 && orphanHelpers.length > 0) {
      const primaryBackend = backends[0];
      for (const helper of orphanHelpers) {
        const edgeId = generateEdgeId();
        dispatch(
          addEdgeToCard({
            id: edgeId,
            source: primaryBackend.id,
            target: helper.id,
            data: { relationship: 'depends_on' },
          }),
        );
        executedOps++;
      }
    }
  }

  // Auto-resize all container/group nodes to fit their children + margin
  autoResizeContainers(dispatch, getCard());

  // If any structural operations were applied (adds, reparents, deletes),
  // trigger a full auto-organize to produce a clean architecture diagram layout.
  // Skip if the AI already included an explicit autoOrganize operation.
  const hasStructuralOps = ops.some(
    (o) => o.op === 'addNode' || o.op === 'addBlueprint' || o.op === 'reparentNode' || o.op === 'deleteNode',
  );
  const hasExplicitOrganize = ops.some((o) => o.op === 'autoOrganize');
  if (hasStructuralOps && !hasExplicitOrganize && executedOps > 0) {
    dispatch(autoOrganizeCard({ direction: 'vertical' }));
  }

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

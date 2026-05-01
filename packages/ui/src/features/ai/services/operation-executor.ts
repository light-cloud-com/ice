/**
 * AI Operation Executor
 *
 * Takes an array of AiCanvasOp and dispatches the corresponding Redux actions.
 * Handles ID remapping, blueprint resolution, validation, and undo snapshots.
 */

import { canContain } from '../../../config/containment-rules';
import { store } from '../../../store';
import {
  addNodeToCard,
  addEdgeToCard,
  updateCardNodeData,
  updateCardNodePosition,
  resizeCardNode,
  updateCardNodeParent,
  deleteCardNode,
  deleteCardEdge,
  updateCardEdgeData,
  autoOrganizeCard,
  selectActiveCard,
} from '../../../store/slices/cards-slice';
import type { AppDispatch } from '../../../store';
import type { Card } from '../../../store/slices/cards-slice';
import type { AiCanvasOp } from '@ice/types';
import {
  MAX_OPS,
  NODE_WIDTH,
  NODE_HEIGHT,
  HELPER_NODE_WIDTH,
  HELPER_NODE_HEIGHT,
} from './ai-ops/types';
import { generateNodeId, generateEdgeId, resolveId, nodeExists } from './ai-ops/id-utils';
import {
  isHelperIceType,
  findPosition,
  findChildPosition,
} from './ai-ops/position-finder';
import { resolveBlueprint } from './ai-ops/blueprint-resolver';
import { autoResizeContainers } from './ai-ops/auto-resize';

// =============================================================================
// Types — re-exported from ai-ops/types
// =============================================================================

import type { SkippedOp, ExecutionResult } from './ai-ops/types';
export type { SkippedOp, ExecutionResult } from './ai-ops/types';

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

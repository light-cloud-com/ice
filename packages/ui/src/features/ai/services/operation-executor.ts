/**
 * AI Operation Executor
 *
 * Takes an array of AiCanvasOp and dispatches the corresponding Redux actions.
 * Handles ID remapping, blueprint resolution, validation, and undo snapshots.
 */

import { autoResizeContainers } from './ai-ops/auto-resize';
import { resolveBlueprint } from './ai-ops/blueprint-resolver';
import { generateNodeId, generateEdgeId, resolveId, nodeExists } from './ai-ops/id-utils';
import { pickNodeDefaults } from './ai-ops/node-defaults';
import { connectOrphanHelpers } from './ai-ops/orphan-helpers';
import { findPosition, findChildPosition } from './ai-ops/position-finder';
import { validateReparent } from './ai-ops/reparent-validator';
import { MAX_OPS, NODE_WIDTH, NODE_HEIGHT } from './ai-ops/types';
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
import { setEdgeStyle } from '../../../store/slices/ui-slice';
import type { SkippedOp, ExecutionResult } from './ai-ops/types';
import type { AppDispatch } from '../../../store';
import type { Card } from '../../../store/slices/cards-slice';
import type { AiCanvasOp } from '@ice/types';

// =============================================================================
// Types — re-exported from ai-ops/types
// =============================================================================

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
          const iceType = (op.node.data?.iceType as string) || '';
          const defaults = pickNodeDefaults(op.node.type, iceType);
          const nodeW = op.node.width || defaults.width;
          const nodeH = op.node.height || defaults.height;

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
            const verdict = validateReparent(currentCard, childNode, resolvedParentId, op.parentId);
            if (verdict.kind === 'skip') {
              skippedOps.push({ op, reason: verdict.reason });
              break;
            }
            dispatch(updateCardNodeParent({ nodeId: resolvedNodeId, parentId: verdict.resolvedParentId }));

            // Reposition the child inside the new parent using the non-overlapping
            // grid algorithm so it doesn't land on top of existing siblings.
            const updatedCard = getCard();
            const newPos = findChildPosition(
              updatedCard,
              verdict.resolvedParentId,
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
          dispatch(setEdgeStyle('rectangular')); // CCL1 — render the computed dagre routes
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
    executedOps += connectOrphanHelpers(dispatch, getCard());
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
    dispatch(setEdgeStyle('rectangular')); // CCL1 — render the computed dagre routes
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

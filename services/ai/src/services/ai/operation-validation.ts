/**
 * Operation validation — gatekeepers for the AI's canvas-op output.
 *
 * `VALID_OPS` is the closed set of op types the AI may emit; any
 * unknown `op` is dropped silently. `VALID_GROUP_TYPES` is the
 * closed set of container iceTypes for `addNode` operations whose
 * `node.type === 'group'` — keeps the AI from inventing new
 * container kinds.
 *
 * `validateOperations` is a filter that runs both checks plus the
 * addBlueprint iceType gate against the canvas-supplied
 * `allowedBlockTypes` registry. Rejections that originate from the
 * model (unknown iceType, unknown group iceType) emit a `console.warn`
 * — the unknown-op-type case is silent because the model often
 * speculates and self-corrects in the next turn.
 */

import type { AiCanvasOp } from '@ice/types';

export const VALID_OPS = new Set([
  'addNode',
  'addEdge',
  'updateNodeData',
  'updateNodePosition',
  'resizeNode',
  'reparentNode',
  'deleteNode',
  'deleteEdge',
  'updateEdgeData',
  'autoOrganize',
  'addBlueprint',
]);

// Valid addNode group iceTypes (containers, not resources)
export const VALID_GROUP_TYPES = new Set([
  'Network.VPC',
  'Network.Subnet',
  'Group.Frontend',
  'Group.Services',
  'Group.Data',
  'Group.Messaging',
  'Group.Monitoring',
  'Group.External',
  'Group.Custom',
]);

/**
 * Filter the AI-emitted operations array down to the subset that
 * passes the closed-set gates. Returns a fresh array; the input
 * array is not mutated.
 */
export function validateOperations(ops: unknown[], allowedBlockTypes?: Set<string>): AiCanvasOp[] {
  return ops.filter((op): op is AiCanvasOp => {
    if (!op || typeof op !== 'object') return false;
    const record = op as Record<string, unknown>;
    const opType = record.op;
    if (typeof opType !== 'string' || !VALID_OPS.has(opType)) return false;

    // Validate addBlueprint uses a real registered iceType
    if (opType === 'addBlueprint' && allowedBlockTypes) {
      const iceType = record.iceType as string;
      if (!iceType || !allowedBlockTypes.has(iceType)) {
        console.warn(`[AI] Rejected unknown iceType: "${iceType}"`);
        return false;
      }
    }

    // Validate addNode group types
    if (opType === 'addNode') {
      const node = record.node as Record<string, unknown> | undefined;
      if (node?.type === 'group') {
        const iceType = (node.data as Record<string, unknown>)?.iceType as string;
        if (iceType && !VALID_GROUP_TYPES.has(iceType)) {
          console.warn(`[AI] Rejected unknown group iceType: "${iceType}"`);
          return false;
        }
      }
    }

    return true;
  });
}

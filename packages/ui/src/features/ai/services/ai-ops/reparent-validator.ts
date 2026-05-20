/**
 * AI ops — reparent validator.
 *
 * Extracted from `operation-executor.ts` (rf-aiop-7). Pure validator that
 * walks the same gauntlet of checks the `reparentNode` case used to
 * inline. Returns either a "skip" verdict (with the reason string the
 * orchestrator pushes into `skippedOps`) or an "ok" verdict (with the
 * resolved parent id). The orchestrator is responsible for dispatching;
 * this module is dispatch-free.
 *
 * The four checks, in order:
 *   1. Parent node exists in the current card.
 *   2. Parent node has type === 'container'.
 *   3. Containment rules permit child → parent (canContain(parent.iceType,
 *      child.iceType)). Only checked when both iceTypes are non-empty.
 *
 * Edge case preserved verbatim: the "is not a container" reason string
 * uses `parent.data?.label || parent.id` so the user sees the
 * human-readable name when one is set, falling back to the raw node id.
 */

import { canContain } from '../../../../config/containment-rules';
import type { Card, CardNode } from '../../../../store/slices/cards-slice';

export type ReparentVerdict = { kind: 'skip'; reason: string } | { kind: 'ok'; resolvedParentId: string };

export function validateReparent(
  card: Card,
  childNode: CardNode,
  resolvedParentId: string,
  /** Original AI-supplied parent id, used in the "not found" reason string
   *  so the user sees the placeholder name they typed/the AI emitted (e.g.
   *  "ai-placeholder-parent") rather than the resolved real id. Defaults
   *  to the resolved id for callers that don't track the original. */
  originalParentId: string = resolvedParentId,
): ReparentVerdict {
  const parentNode = card.nodes.find((n) => n.id === resolvedParentId);
  if (!parentNode) {
    return { kind: 'skip', reason: `Parent node not found: ${originalParentId}` };
  }
  // Only containers can have children
  if (parentNode.type !== 'container') {
    return {
      kind: 'skip',
      reason: `${parentNode.data?.label || parentNode.id} is not a container`,
    };
  }
  const parentIceType = (parentNode.data?.iceType as string) || '';
  const childIceType = (childNode?.data?.iceType as string) || '';
  if (parentIceType && childIceType && !canContain(parentIceType, childIceType)) {
    return { kind: 'skip', reason: `${parentIceType} cannot contain ${childIceType}` };
  }
  return { kind: 'ok', resolvedParentId };
}

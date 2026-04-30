/**
 * Pure cardinality-rule check for the "one Source.Repository / one
 * Config.Environment per service" canvas constraint.
 *
 * `findExistingSpecialConnection`, given a candidate `sourceNode → targetNode`
 * drag, identifies whether either endpoint is a "special" block — a
 * `Source.Repository`, a node whose `data.behavior === 'source'`, or a
 * `Config.Environment` — and whether the OTHER endpoint (the service) already
 * has an edge of that same special kind. The rule is symmetric: either drag
 * direction is recognised. The function is pure: it returns the diagnosis as
 * `{ specialType: 'source' | 'config' | null; conflict: boolean }` and leaves
 * console.warn / drag-cancel to the orchestrator. `specialType` is the short
 * banner label ("GitHub Repo" for `'source'`, "Env Variables" for `'config'`).
 *
 * Behaviour preserved verbatim from `svg-canvas.tsx`'s `handleConnectionEnd` —
 * including the fact that re-drawing an already-existing same-source/target
 * edge still counts the existing edge as a conflict (the rule does not exclude
 * the candidate from the lookup). Callers that want self-edge tolerance must
 * filter `edges` before passing them in.
 */

import type { CanvasNode } from '../components/types';

/** Edge shape this rule needs — same shape as `CardEdge` from the cards slice. */
interface SpecialRuleEdge {
  source: string;
  target: string;
}

export interface SpecialConnectionResult {
  specialType: 'source' | 'config' | null;
  conflict: boolean;
}

export function findExistingSpecialConnection(
  sourceNode: CanvasNode,
  targetNode: CanvasNode,
  edges: ReadonlyArray<SpecialRuleEdge>,
  nodes: ReadonlyArray<CanvasNode>,
): SpecialConnectionResult {
  const srcType = (sourceNode.data?.iceType as string) || '';
  const tgtType = (targetNode.data?.iceType as string) || '';

  // Check both directions: which node is the "special" block, which is the service.
  const fullSpecialType =
    srcType === 'Source.Repository' || sourceNode.data?.behavior === 'source'
      ? 'Source.Repository'
      : srcType === 'Config.Environment'
        ? 'Config.Environment'
        : tgtType === 'Source.Repository' || targetNode.data?.behavior === 'source'
          ? 'Source.Repository'
          : tgtType === 'Config.Environment'
            ? 'Config.Environment'
            : null;

  if (!fullSpecialType) return { specialType: null, conflict: false };

  const specialType: 'source' | 'config' = fullSpecialType === 'Source.Repository' ? 'source' : 'config';

  const serviceNodeId =
    fullSpecialType === srcType || (fullSpecialType === 'Source.Repository' && sourceNode.data?.behavior === 'source')
      ? targetNode.id
      : sourceNode.id;

  // Find existing connections of the same special type to this service.
  const existingSpecial = edges.filter((e) => {
    if (e.source !== serviceNodeId && e.target !== serviceNodeId) return false;
    const otherNode = nodes.find((n) => n.id === (e.source === serviceNodeId ? e.target : e.source));
    if (!otherNode) return false;
    const otherType = (otherNode.data?.iceType as string) || '';
    if (fullSpecialType === 'Source.Repository') {
      return otherType === 'Source.Repository' || otherNode.data?.behavior === 'source';
    }
    return otherType === fullSpecialType;
  });

  return { specialType, conflict: existingSpecial.length > 0 };
}

/**
 * Computing Flows — reactive property propagation engine.
 *
 * Public API:
 *   computeDerived(nodes, edges) → PatchSet
 *   diffPatches(patchSet, nodes, edges) → PatchSet (only changed values)
 *   PROPAGATION_RULES / AGGREGATE_RULES — the declarative rule arrays
 */

export { computeDerived, diffPatches } from './compute-derived';
export { PROPAGATION_RULES, AGGREGATE_RULES } from './propagation-rules';
export type {
  PropagationNode,
  PropagationEdge,
  PropagationRule,
  AggregateRule,
  PropagationContext,
  PatchSet,
  NodePatch,
  EdgePatch,
  EdgeDeletion,
  PropagationDirection,
} from './types';

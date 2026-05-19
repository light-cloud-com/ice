/**
 * AI ops — barrel export.
 *
 * The seven helper modules created during the rf-aiop-* series. Imported
 * by `operation-executor.ts` (the orchestrator) and re-exported here so a
 * future caller could hit the helpers directly without reaching through
 * the orchestrator file.
 */

export type { SkippedOp, ExecutionResult } from './types';
export {
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
} from './types';
export { generateNodeId, generateEdgeId, resolveId, nodeExists } from './id-utils';
export {
  isHelperIceType,
  findPosition,
  findRootPosition,
  findChildPosition,
} from './position-finder';
export { resolveBlueprint } from './blueprint-resolver';
export { autoResizeContainers } from './auto-resize';
export { pickNodeDefaults, type NodeDefaults } from './node-defaults';
export { connectOrphanHelpers } from './orphan-helpers';
export { validateReparent, type ReparentVerdict } from './reparent-validator';

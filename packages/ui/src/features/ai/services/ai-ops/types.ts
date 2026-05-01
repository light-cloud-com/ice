/**
 * AI ops — shared types and layout constants.
 *
 * Extracted from `operation-executor.ts` (rf-aiop-1). Two roles:
 *   1. Public types `SkippedOp` / `ExecutionResult` — re-exported from the
 *      executor's public API so external consumers keep their import path.
 *   2. Module-private layout constants used by the position-finder and
 *      auto-resize helpers — exported here so each helper module can import
 *      from a single shared source instead of redeclaring values.
 *
 * The constants are preserved verbatim from the source file. Any change to
 * `NODE_GAP_*`, `NODE_*`, `HELPER_*`, `COLS_PER_ROW`, or `CONTAINER_*_PAD`
 * shifts the on-canvas position of every AI-placed node, so they're frozen
 * here as the single source of truth for the family.
 */

import type { AiCanvasOp } from '@ice/types';

// =============================================================================
// Public types — re-exported from operation-executor
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

// =============================================================================
// Operation cap
// =============================================================================

/** Max operations per AI response to prevent overwhelming the canvas */
export const MAX_OPS = 50;

// =============================================================================
// Layout constants — non-overlapping grid placement
// =============================================================================

export const NODE_GAP_X = 36;
export const NODE_GAP_Y = 36;
export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 72;
export const HELPER_NODE_WIDTH = 170;
export const HELPER_NODE_HEIGHT = 56;
export const COLS_PER_ROW = 3;
export const CONTAINER_INNER_PAD = 30;
export const CONTAINER_HEADER_PAD = 50;

// =============================================================================
// Auto-resize constants
// =============================================================================

export const RESIZE_PAD = 24;
export const RESIZE_HEADER = 40;

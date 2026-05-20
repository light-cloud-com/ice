/**
 * ai-ops barrel export smoke test.
 *
 * The barrel re-exports types + a constant set + helper functions from the
 * sibling modules. A single import statement exercises every re-export line
 * (statement-level coverage). Each named export must be defined at runtime
 * so consumers don't import undefined.
 */

import { describe, it, expect } from 'vitest';
import * as aiOps from '..';

describe('ai-ops/index — barrel exports', () => {
  it('exposes all numeric tunables from types', () => {
    expect(aiOps.MAX_OPS).toBeTypeOf('number');
    expect(aiOps.NODE_GAP_X).toBeTypeOf('number');
    expect(aiOps.NODE_GAP_Y).toBeTypeOf('number');
    expect(aiOps.NODE_WIDTH).toBeTypeOf('number');
    expect(aiOps.NODE_HEIGHT).toBeTypeOf('number');
    expect(aiOps.HELPER_NODE_WIDTH).toBeTypeOf('number');
    expect(aiOps.HELPER_NODE_HEIGHT).toBeTypeOf('number');
    expect(aiOps.COLS_PER_ROW).toBeTypeOf('number');
    expect(aiOps.CONTAINER_INNER_PAD).toBeTypeOf('number');
    expect(aiOps.CONTAINER_HEADER_PAD).toBeTypeOf('number');
    expect(aiOps.RESIZE_PAD).toBeTypeOf('number');
    expect(aiOps.RESIZE_HEADER).toBeTypeOf('number');
  });

  it('exposes the id-utils helpers', () => {
    expect(aiOps.generateNodeId).toBeTypeOf('function');
    expect(aiOps.generateEdgeId).toBeTypeOf('function');
    expect(aiOps.resolveId).toBeTypeOf('function');
    expect(aiOps.nodeExists).toBeTypeOf('function');
  });

  it('exposes the position-finder helpers', () => {
    expect(aiOps.isHelperIceType).toBeTypeOf('function');
    expect(aiOps.findPosition).toBeTypeOf('function');
    expect(aiOps.findRootPosition).toBeTypeOf('function');
    expect(aiOps.findChildPosition).toBeTypeOf('function');
  });

  it('exposes the high-level orchestration helpers', () => {
    expect(aiOps.resolveBlueprint).toBeTypeOf('function');
    expect(aiOps.autoResizeContainers).toBeTypeOf('function');
    expect(aiOps.pickNodeDefaults).toBeTypeOf('function');
    expect(aiOps.connectOrphanHelpers).toBeTypeOf('function');
    expect(aiOps.validateReparent).toBeTypeOf('function');
  });
});

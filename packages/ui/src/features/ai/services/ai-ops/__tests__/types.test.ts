/**
 * rf-aiop-1 — types + constants.
 *
 * The constants are load-bearing: every layout decision in the AI op pipeline
 * (find-position, child placement, container auto-resize) reads from this
 * module. The tests freeze the values so a future "innocent" change shows up
 * as a test failure, not as a silently shifted canvas.
 */

import { describe, it, expect } from 'vitest';
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
} from '../types';
import type { SkippedOp, ExecutionResult } from '../types';

describe('rf-aiop-1 types/constants', () => {
  it('MAX_OPS is 50', () => {
    expect(MAX_OPS).toBe(50);
  });

  it('NODE_GAP_X / NODE_GAP_Y are 36', () => {
    expect(NODE_GAP_X).toBe(36);
    expect(NODE_GAP_Y).toBe(36);
  });

  it('NODE_WIDTH is 220 and NODE_HEIGHT is 72', () => {
    expect(NODE_WIDTH).toBe(220);
    expect(NODE_HEIGHT).toBe(72);
  });

  it('HELPER_NODE_WIDTH is 170 and HELPER_NODE_HEIGHT is 56', () => {
    expect(HELPER_NODE_WIDTH).toBe(170);
    expect(HELPER_NODE_HEIGHT).toBe(56);
  });

  it('COLS_PER_ROW is 3', () => {
    expect(COLS_PER_ROW).toBe(3);
  });

  it('CONTAINER_INNER_PAD is 30 and CONTAINER_HEADER_PAD is 50', () => {
    expect(CONTAINER_INNER_PAD).toBe(30);
    expect(CONTAINER_HEADER_PAD).toBe(50);
  });

  it('RESIZE_PAD is 24 and RESIZE_HEADER is 40', () => {
    expect(RESIZE_PAD).toBe(24);
    expect(RESIZE_HEADER).toBe(40);
  });

  it('SkippedOp shape: { op, reason } is structurally constructable', () => {
    const skipped: SkippedOp = {
      op: { op: 'autoOrganize' },
      reason: 'unit test',
    };
    expect(skipped.op.op).toBe('autoOrganize');
    expect(skipped.reason).toBe('unit test');
  });

  it('ExecutionResult shape: success/executedOps/skippedOps/createdNodeIds is structurally constructable', () => {
    const result: ExecutionResult = {
      success: true,
      executedOps: 0,
      skippedOps: [],
      createdNodeIds: new Map<string, string>([['placeholder', 'real']]),
    };
    expect(result.success).toBe(true);
    expect(result.executedOps).toBe(0);
    expect(result.skippedOps).toEqual([]);
    expect(result.createdNodeIds.get('placeholder')).toBe('real');
  });
});

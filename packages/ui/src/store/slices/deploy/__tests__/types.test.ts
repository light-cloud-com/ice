/**
 * Tests for `deploy/types.ts` — type module + STATUS_RANK constant.
 *
 * Most exports are TypeScript-only (interfaces, type aliases) so they can't
 * be exercised at runtime. The runtime-only export is `STATUS_RANK`, used
 * by `orderNodesForPanel` to sort nodes for the deploy panel. Pinning its
 * shape catches accidental edits to the rank ordering (e.g. someone putting
 * `succeeded` before `applying` would break the panel UX) and to the key
 * set (a new `DeployNodeStatus` would need a corresponding rank).
 *
 * @see rf-dslice-1
 */

import { describe, expect, it } from 'vitest';
import { STATUS_RANK } from '../types';

describe('STATUS_RANK', () => {
  it('ranks applying first (rank 0)', () => {
    expect(STATUS_RANK.applying).toBe(0);
  });

  it('ranks queued second (rank 1)', () => {
    expect(STATUS_RANK.queued).toBe(1);
  });

  it('ranks all four terminal statuses at rank 2 — they share the bucket sorted by last_at', () => {
    expect(STATUS_RANK.succeeded).toBe(2);
    expect(STATUS_RANK.failed).toBe(2);
    expect(STATUS_RANK.skipped).toBe(2);
    expect(STATUS_RANK['cancelled-due-to-dep']).toBe(2);
  });

  it('exhaustively covers the 6 DeployNodeStatus values', () => {
    expect(Object.keys(STATUS_RANK).sort()).toEqual([
      'applying',
      'cancelled-due-to-dep',
      'failed',
      'queued',
      'skipped',
      'succeeded',
    ]);
  });
});

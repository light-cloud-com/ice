/**
 * Tests for `inline-table-view/types.ts` (rf-itab-1). Locks the
 * exported constants so a downstream change to ALL_STATUSES order or
 * the STATUS_ORDER weights is caught by a failing test.
 */
import { describe, it, expect } from 'vitest';
import { ALL_STATUSES, STATUS_ORDER } from '../types';

describe('inline-table-view/types', () => {
  describe('ALL_STATUSES', () => {
    it('lists every RowStatus exactly once', () => {
      expect(ALL_STATUSES).toEqual(['live', 'drifted', 'deploying', 'building', 'queued', 'failed', 'idle']);
    });

    it('has 7 entries (live, drifted, deploying, building, queued, failed, idle)', () => {
      expect(ALL_STATUSES).toHaveLength(7);
    });

    it('contains no duplicates', () => {
      expect(new Set(ALL_STATUSES).size).toBe(ALL_STATUSES.length);
    });
  });

  describe('STATUS_ORDER', () => {
    it('has weight 0 for failed (highest sort priority)', () => {
      expect(STATUS_ORDER.failed).toBe(0);
    });

    it('places drifted right after failed', () => {
      expect(STATUS_ORDER.drifted).toBe(1);
    });

    it('places idle last', () => {
      expect(STATUS_ORDER.idle).toBe(6);
    });

    it('orders the in-flight statuses (deploying, building, queued)', () => {
      expect(STATUS_ORDER.deploying).toBe(2);
      expect(STATUS_ORDER.building).toBe(3);
      expect(STATUS_ORDER.queued).toBe(4);
    });

    it('places live below queued (live is "settled, no problems")', () => {
      expect(STATUS_ORDER.live).toBe(5);
    });

    it('covers every RowStatus key from ALL_STATUSES', () => {
      for (const s of ALL_STATUSES) {
        expect(STATUS_ORDER).toHaveProperty(s);
      }
    });

    it('uses unique weights (no ties)', () => {
      const weights = Object.values(STATUS_ORDER);
      expect(new Set(weights).size).toBe(weights.length);
    });
  });
});

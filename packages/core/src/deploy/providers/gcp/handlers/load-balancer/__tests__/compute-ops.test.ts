/**
 * Tests for `load-balancer/compute-ops.ts` (rf-lbal-1).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { wait_for_compute_op } from '../compute-ops.js';
import type { GCPHandlerContext } from '../../../types.js';

function ctxWithGet(get: (...args: any[]) => any): GCPHandlerContext {
  return {
    project: 'my-project',
    region: 'us',
    rest_client: { get } as any,
    clients: new Map(),
  } as any;
}

describe('load-balancer/compute-ops', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('wait_for_compute_op', () => {
    it('returns when status === DONE on first poll', async () => {
      const get = vi.fn().mockResolvedValue({ status: 'DONE' });
      const ctx = ctxWithGet(get);
      await expect(wait_for_compute_op(ctx, 'op-1')).resolves.toBeUndefined();
      expect(get).toHaveBeenCalledWith(
        'https://compute.googleapis.com/compute/v1/projects/my-project/global/operations/op-1',
      );
    });

    it('throws when DONE response carries an error field', async () => {
      const get = vi.fn().mockResolvedValue({ status: 'DONE', error: { errors: [{ code: 'BAD' }] } });
      const ctx = ctxWithGet(get);
      await expect(wait_for_compute_op(ctx, 'op-2')).rejects.toThrow();
    });

    it('polls until DONE — calling GET multiple times', async () => {
      let count = 0;
      const get = vi.fn().mockImplementation(async () => {
        count++;
        return count < 3 ? { status: 'PENDING' } : { status: 'DONE' };
      });
      const ctx = ctxWithGet(get);
      const promise = wait_for_compute_op(ctx, 'op-3');
      // Two 3000ms intervals between three polls
      await vi.advanceTimersByTimeAsync(6_000);
      await promise;
      expect(get).toHaveBeenCalledTimes(3);
    });

    it('throws operation_timed_out after 120s of PENDING', async () => {
      const get = vi.fn().mockResolvedValue({ status: 'PENDING' });
      const ctx = ctxWithGet(get);
      const promise = wait_for_compute_op(ctx, 'op-4');
      // Attach the rejection handler BEFORE advancing time so the runtime
      // sees us listening; otherwise vitest flags it as an unhandled
      // rejection even though the test eventually awaits it.
      const expectation = expect(promise).rejects.toThrow();
      await vi.advanceTimersByTimeAsync(121_000);
      await expectation;
    });

    it('continues to poll if status is missing on the response', async () => {
      let count = 0;
      const get = vi.fn().mockImplementation(async () => {
        count++;
        return count < 2 ? {} : { status: 'DONE' };
      });
      const ctx = ctxWithGet(get);
      const promise = wait_for_compute_op(ctx, 'op-5');
      await vi.advanceTimersByTimeAsync(3_500);
      await promise;
      expect(get).toHaveBeenCalledTimes(2);
    });
  });
});

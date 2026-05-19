/**
 * Unit tests for `services/deploy/src/services/memory-queue.ts` —
 * the in-memory `InMemoryQueue` + `InMemoryWorker` fallback used by the
 * desktop edition (no Redis). Sequential job processing with retry counts.
 *
 * Per `deploy-service-test-script-and-typecheck-traps`, vitest globals are
 * imported explicitly. Per `vi-spyon-accumulates-across-it-blocks-without-
 * explicit-reset`, mocks are cleared in `beforeEach`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InMemoryQueue, InMemoryWorker } from '../memory-queue';

/** Tick the microtask queue so the queue's `processNext()` chain unwinds. */
async function flush(): Promise<void> {
  // Two flushes cover the await-chain inside processNext + the recursive call.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('InMemoryQueue', () => {
  describe('add', () => {
    it('returns a job with name, data, attemptsMade=0 and a memory-prefixed id', async () => {
      const queue = new InMemoryQueue();
      // No processor bound — job is enqueued but not processed.
      const job = await queue.add('build', { project: 'acme' });

      expect(job.name).toBe('build');
      expect(job.data).toEqual({ project: 'acme' });
      expect(job.attemptsMade).toBe(0);
      expect(job.id).toMatch(/^mem-\d+-[a-z0-9]+$/);
    });

    it('defaults opts.attempts to 1 when not provided', async () => {
      const queue = new InMemoryQueue();
      const job = await queue.add('build', {});
      expect(job.opts.attempts).toBe(1);
    });

    it('defaults opts.attempts to 1 when add() is called with no opts argument', async () => {
      const queue = new InMemoryQueue();
      // Exercise the default-parameter branch: `opts: any = {}`.
      const job = await queue.add('build', { foo: 'bar' });
      expect(job.opts.attempts).toBe(1);
    });

    it('forwards opts.attempts when provided', async () => {
      const queue = new InMemoryQueue();
      const job = await queue.add('build', {}, { attempts: 5 });
      expect(job.opts.attempts).toBe(5);
    });

    it('produces unique ids for sequential jobs', async () => {
      const queue = new InMemoryQueue();
      const a = await queue.add('a', {});
      const b = await queue.add('b', {});
      expect(a.id).not.toBe(b.id);
    });
  });

  describe('processNext (via worker binding)', () => {
    it('does nothing when no processor is bound, even after add()', async () => {
      const queue = new InMemoryQueue();
      await queue.add('build', {});
      await flush();
      // No processor was ever bound, so nothing should have run; no throws.
      // Asserting on internal state via `as any`:
      expect((queue as any).processing).toBe(false);
      expect((queue as any).queue).toHaveLength(1);
    });

    it('processes a job, increments attemptsMade, and notifies onCompleted', async () => {
      const queue = new InMemoryQueue();
      const processor = vi.fn(async () => {});
      const onCompleted = vi.fn();

      const worker = new InMemoryWorker('q', processor as any);
      worker.on('completed', onCompleted);
      worker._bind(queue);

      const job = await queue.add('build', { x: 1 });
      await flush();

      expect(processor).toHaveBeenCalledTimes(1);
      expect(processor).toHaveBeenCalledWith(job);
      expect(job.attemptsMade).toBe(1);
      expect(onCompleted).toHaveBeenCalledTimes(1);
      expect(onCompleted).toHaveBeenCalledWith(job);
    });

    it('does not throw when processor succeeds without an onCompleted listener bound', async () => {
      const queue = new InMemoryQueue();
      const processor = vi.fn(async () => {});

      const worker = new InMemoryWorker('q', processor as any);
      // Note: never registered 'completed' — exercises the `?.()` optional chain.
      worker._bind(queue);

      await queue.add('build', {});
      await flush();

      expect(processor).toHaveBeenCalledTimes(1);
    });

    it('processes queued jobs sequentially in FIFO order', async () => {
      const queue = new InMemoryQueue();
      const order: string[] = [];
      const processor = vi.fn(async (job: any) => {
        order.push(job.name);
      });

      const worker = new InMemoryWorker('q', processor as any);
      worker._bind(queue);

      await queue.add('a', {});
      await queue.add('b', {});
      await queue.add('c', {});
      await flush();
      await flush();

      expect(order).toEqual(['a', 'b', 'c']);
    });

    it('retries a failing job up to opts.attempts, then notifies onFailed with the original error', async () => {
      const queue = new InMemoryQueue();
      const processor = vi.fn(async () => {
        throw new Error('boom');
      });
      const onCompleted = vi.fn();
      const onFailed = vi.fn();

      const worker = new InMemoryWorker('q', processor as any);
      worker.on('completed', onCompleted);
      worker.on('failed', onFailed);
      worker._bind(queue);

      const job = await queue.add('build', {}, { attempts: 3 });
      await flush();
      await flush();
      await flush();

      // 3 attempts before final-failure callback.
      expect(processor).toHaveBeenCalledTimes(3);
      expect(job.attemptsMade).toBe(3);
      expect(onCompleted).not.toHaveBeenCalled();
      expect(onFailed).toHaveBeenCalledTimes(1);
      const [failedJob, err] = onFailed.mock.calls[0];
      expect(failedJob).toBe(job);
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toBe('boom');
    });

    it('treats a non-Error throw by wrapping String(err) into a new Error for onFailed', async () => {
      const queue = new InMemoryQueue();
      const processor = vi.fn(async () => {
        // Throw a plain string — exercises `err instanceof Error ? err : new Error(String(err))`.
        throw 'plain string failure';
      });
      const onFailed = vi.fn();

      const worker = new InMemoryWorker('q', processor as any);
      worker.on('failed', onFailed);
      worker._bind(queue);

      await queue.add('build', {});
      await flush();

      expect(onFailed).toHaveBeenCalledTimes(1);
      const err = onFailed.mock.calls[0][1];
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toBe('plain string failure');
    });

    it('does not throw when processor fails and no onFailed listener is bound', async () => {
      const queue = new InMemoryQueue();
      const processor = vi.fn(async () => {
        throw new Error('boom');
      });

      const worker = new InMemoryWorker('q', processor as any);
      // No 'failed' listener — exercises the `?.()` optional chain on onFailed.
      worker._bind(queue);

      await queue.add('build', {});
      await flush();

      expect(processor).toHaveBeenCalledTimes(1);
    });

    it('succeeds on retry: failed first attempt is re-queued and onCompleted fires once', async () => {
      const queue = new InMemoryQueue();
      let attempt = 0;
      const processor = vi.fn(async () => {
        attempt++;
        if (attempt === 1) throw new Error('transient');
      });
      const onCompleted = vi.fn();
      const onFailed = vi.fn();

      const worker = new InMemoryWorker('q', processor as any);
      worker.on('completed', onCompleted);
      worker.on('failed', onFailed);
      worker._bind(queue);

      const job = await queue.add('build', {}, { attempts: 2 });
      await flush();
      await flush();

      expect(processor).toHaveBeenCalledTimes(2);
      expect(job.attemptsMade).toBe(2);
      expect(onCompleted).toHaveBeenCalledTimes(1);
      expect(onFailed).not.toHaveBeenCalled();
    });

    it('uses default attempts=1 when retry attempt count is zero (no `opts.attempts` set on job.opts)', async () => {
      const queue = new InMemoryQueue();
      const processor = vi.fn(async () => {
        throw new Error('boom');
      });
      const onFailed = vi.fn();

      const worker = new InMemoryWorker('q', processor as any);
      worker.on('failed', onFailed);
      worker._bind(queue);

      // `add` always backstops opts.attempts to 1 — overwrite via internal queue
      // to exercise the `(job.opts.attempts || 1)` fallback inside processNext.
      const job = {
        id: 'mem-test-x',
        name: 'build',
        data: {},
        attemptsMade: 0,
        opts: {},
      } as any;
      (queue as any).queue.push(job);
      (queue as any).processNext();
      await flush();

      expect(processor).toHaveBeenCalledTimes(1);
      expect(onFailed).toHaveBeenCalledTimes(1);
    });
  });

  describe('close', () => {
    it('clears the queue and resolves', async () => {
      const queue = new InMemoryQueue();
      // Don't bind a processor — entries pile up in the buffer.
      await queue.add('a', {});
      await queue.add('b', {});
      expect((queue as any).queue).toHaveLength(2);

      await expect(queue.close()).resolves.toBeUndefined();
      expect((queue as any).queue).toHaveLength(0);
    });
  });
});

describe('InMemoryWorker', () => {
  it('stores the processor passed to its constructor', () => {
    const processor = vi.fn(async () => {});
    const worker = new InMemoryWorker('q', processor as any);
    // Internal field is private, accessed via cast — verifies constructor wiring.
    expect((worker as any)._processor).toBe(processor);
  });

  it('accepts an optional opts argument with default {}', () => {
    const processor = vi.fn(async () => {});
    // Default-arg branch: ctor invoked with two args, opts defaults to {}.
    const worker = new InMemoryWorker('q', processor as any);
    expect((worker as any)._processor).toBe(processor);
  });

  describe('on', () => {
    it('registers a completed handler', () => {
      const worker = new InMemoryWorker('q', vi.fn() as any);
      const handler = vi.fn();
      worker.on('completed', handler);
      expect((worker as any)._onCompleted).toBe(handler);
    });

    it('registers a failed handler', () => {
      const worker = new InMemoryWorker('q', vi.fn() as any);
      const handler = vi.fn();
      worker.on('failed', handler);
      expect((worker as any)._onFailed).toBe(handler);
    });

    it('ignores unknown event names without registering a handler or throwing', () => {
      const worker = new InMemoryWorker('q', vi.fn() as any);
      const handler = vi.fn();
      // Unknown event — exercises the unmatched-branch path in `on`.
      worker.on('unknown' as any, handler);
      expect((worker as any)._onCompleted).toBeNull();
      expect((worker as any)._onFailed).toBeNull();
    });
  });

  describe('_bind', () => {
    it('writes processor, onCompleted, and onFailed onto the queue instance', () => {
      const queue = new InMemoryQueue();
      const processor = vi.fn(async () => {});
      const onCompleted = vi.fn();
      const onFailed = vi.fn();

      const worker = new InMemoryWorker('q', processor as any);
      worker.on('completed', onCompleted);
      worker.on('failed', onFailed);
      worker._bind(queue);

      expect((queue as any).processor).toBe(processor);
      expect((queue as any).onCompleted).toBe(onCompleted);
      expect((queue as any).onFailed).toBe(onFailed);
    });

    it('writes nulls onto the queue when no handlers were registered', () => {
      const queue = new InMemoryQueue();
      const processor = vi.fn(async () => {});

      const worker = new InMemoryWorker('q', processor as any);
      worker._bind(queue);

      expect((queue as any).processor).toBe(processor);
      expect((queue as any).onCompleted).toBeNull();
      expect((queue as any).onFailed).toBeNull();
    });
  });

  describe('close', () => {
    it('resolves without rejecting', async () => {
      const worker = new InMemoryWorker('q', vi.fn() as any);
      await expect(worker.close()).resolves.toBeUndefined();
    });
  });
});

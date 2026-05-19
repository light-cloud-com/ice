/**
 * Tests for `cloud-storage/bucket-creator.ts` (rf-cstor-3) — the
 * highest-risk unit in the rf-cstor series. The two-tier creation +
 * adoption flow has 8+ branches; this suite pins each one.
 *
 * RISK #2 — "already exists" guard checks 3 conditions across both the
 * initial-fail catch and the retry-fail catch. Missing one would bubble
 * a real 409 unhandled.
 *
 * RISK #3 — adopted-bucket UBLA-disable only sets `ublaForcedOn = true`
 * for the UBLA constraint message; non-UBLA disable errors are swallowed
 * silently (best-effort). The outer adoption-fetch catch is also a
 * best-effort swallow.
 */

import { describe, it, expect, vi } from 'vitest';
import { createOrAdoptBucket } from '../bucket-creator';
import type { GCPHandlerContext } from '../../../types';

function makeCtx(): { ctx: GCPHandlerContext; logs: string[] } {
  const logs: string[] = [];
  const ctx = {
    clients: { get: () => null } as any,
    on_log: (m: string) => logs.push(m),
  } as unknown as GCPHandlerContext;
  return { ctx, logs };
}

function baseOptions(publicAccess: boolean): Record<string, any> {
  const opts: Record<string, any> = {
    location: 'US',
    storageClass: 'STANDARD',
    labels: {},
  };
  if (publicAccess) {
    opts.iamConfiguration = {
      publicAccessPrevention: 'inherited',
      uniformBucketLevelAccess: { enabled: false },
    };
    opts.predefinedDefaultObjectAcl = 'publicRead';
  }
  return opts;
}

describe('cloud-storage/bucket-creator', () => {
  describe('clean create (no errors)', () => {
    it('returns ublaForcedOn=false, bucketAlreadyExisted=false on first-try success', async () => {
      const storage = { createBucket: vi.fn().mockResolvedValue(undefined) };
      const { ctx } = makeCtx();
      const out = await createOrAdoptBucket(storage, 'my-bucket', baseOptions(true), true, ctx);
      expect(out).toEqual({ ublaForcedOn: false, bucketAlreadyExisted: false });
      expect(storage.createBucket).toHaveBeenCalledTimes(1);
    });

    it('passes the createOptions through to storage.createBucket verbatim', async () => {
      const storage = { createBucket: vi.fn().mockResolvedValue(undefined) };
      const { ctx } = makeCtx();
      const opts = baseOptions(true);
      await createOrAdoptBucket(storage, 'my-bucket', opts, true, ctx);
      expect(storage.createBucket).toHaveBeenCalledWith('my-bucket', opts);
    });

    it('handles publicAccess=false with no iamConfiguration block', async () => {
      const storage = { createBucket: vi.fn().mockResolvedValue(undefined) };
      const { ctx } = makeCtx();
      const opts = baseOptions(false);
      const out = await createOrAdoptBucket(storage, 'priv', opts, false, ctx);
      expect(out).toEqual({ ublaForcedOn: false, bucketAlreadyExisted: false });
    });
  });

  describe('UBLA org-policy retry (publicAccess=true)', () => {
    it('retries with UBLA on and ACL bits removed, returns ublaForcedOn=true', async () => {
      const ublaErr = Object.assign(new Error('storage.uniformBucketLevelAccess constraint'), {});
      const storage = {
        createBucket: vi.fn().mockRejectedValueOnce(ublaErr).mockResolvedValueOnce(undefined),
      };
      const { ctx, logs } = makeCtx();
      const opts = baseOptions(true);
      const out = await createOrAdoptBucket(storage, 'b', opts, true, ctx);
      expect(out).toEqual({ ublaForcedOn: true, bucketAlreadyExisted: false });
      expect(storage.createBucket).toHaveBeenCalledTimes(2);
      // Retry options were mutated: UBLA on, no predefinedDefaultObjectAcl.
      const retryOpts = storage.createBucket.mock.calls[1]?.[1];
      expect(retryOpts.iamConfiguration).toEqual({
        publicAccessPrevention: 'inherited',
        uniformBucketLevelAccess: { enabled: true },
      });
      expect(retryOpts.predefinedDefaultObjectAcl).toBeUndefined();
      // Operator log surfaces the retry rationale.
      expect(logs.some((l) => l.includes('Retrying b with UBLA on'))).toBe(true);
    });

    it('detects UBLA constraint via either error-string variant', async () => {
      // Variant A: full path `storage.uniformBucketLevelAccess`.
      const errA = new Error('storage.uniformBucketLevelAccess: enforced');
      const storageA = {
        createBucket: vi.fn().mockRejectedValueOnce(errA).mockResolvedValueOnce(undefined),
      };
      const ctxA = makeCtx();
      const outA = await createOrAdoptBucket(storageA, 'b', baseOptions(true), true, ctxA.ctx);
      expect(outA.ublaForcedOn).toBe(true);

      // Variant B: bare `uniformBucketLevelAccess` (no `storage.` prefix).
      const errB = new Error('uniformBucketLevelAccess required');
      const storageB = {
        createBucket: vi.fn().mockRejectedValueOnce(errB).mockResolvedValueOnce(undefined),
      };
      const ctxB = makeCtx();
      const outB = await createOrAdoptBucket(storageB, 'b', baseOptions(true), true, ctxB.ctx);
      expect(outB.ublaForcedOn).toBe(true);
    });

    it('does NOT retry when publicAccess=false even on UBLA constraint (no public path needed)', async () => {
      // Without publicAccess the createOptions don't set ACL bits, so the
      // optimistic-vs-locked retry only makes sense for public buckets.
      const ublaErr = new Error('storage.uniformBucketLevelAccess constraint');
      const storage = { createBucket: vi.fn().mockRejectedValue(ublaErr) };
      const { ctx } = makeCtx();
      await expect(createOrAdoptBucket(storage, 'b', baseOptions(false), false, ctx)).rejects.toThrow(
        'storage.uniformBucketLevelAccess constraint',
      );
      expect(storage.createBucket).toHaveBeenCalledTimes(1);
    });

    describe('retry inner "already exists" guard (RISK #2)', () => {
      it('adopts on retry hit-409 via .code', async () => {
        const ublaErr = new Error('storage.uniformBucketLevelAccess');
        const retryErr = Object.assign(new Error('conflict'), { code: 409 });
        const storage = {
          createBucket: vi.fn().mockRejectedValueOnce(ublaErr).mockRejectedValueOnce(retryErr),
        };
        const { ctx, logs } = makeCtx();
        const out = await createOrAdoptBucket(storage, 'b', baseOptions(true), true, ctx);
        expect(out).toEqual({ ublaForcedOn: true, bucketAlreadyExisted: true });
        expect(logs.some((l) => l.includes('adopting (UBLA-on)'))).toBe(true);
      });

      it('adopts on retry hit "you already own it" message', async () => {
        const ublaErr = new Error('uniformBucketLevelAccess');
        const retryErr = new Error('you already own it');
        const storage = {
          createBucket: vi.fn().mockRejectedValueOnce(ublaErr).mockRejectedValueOnce(retryErr),
        };
        const { ctx } = makeCtx();
        const out = await createOrAdoptBucket(storage, 'b', baseOptions(true), true, ctx);
        expect(out).toEqual({ ublaForcedOn: true, bucketAlreadyExisted: true });
      });

      it('adopts on retry hit "already own this bucket" message', async () => {
        const ublaErr = new Error('uniformBucketLevelAccess');
        const retryErr = new Error('already own this bucket');
        const storage = {
          createBucket: vi.fn().mockRejectedValueOnce(ublaErr).mockRejectedValueOnce(retryErr),
        };
        const { ctx } = makeCtx();
        const out = await createOrAdoptBucket(storage, 'b', baseOptions(true), true, ctx);
        expect(out).toEqual({ ublaForcedOn: true, bucketAlreadyExisted: true });
      });

      it('re-throws other errors from the retry (not an "already exists" variant)', async () => {
        const ublaErr = new Error('uniformBucketLevelAccess');
        const retryErr = new Error('quota exceeded');
        const storage = {
          createBucket: vi.fn().mockRejectedValueOnce(ublaErr).mockRejectedValueOnce(retryErr),
        };
        const { ctx } = makeCtx();
        await expect(createOrAdoptBucket(storage, 'b', baseOptions(true), true, ctx)).rejects.toThrow('quota exceeded');
      });
    });
  });

  describe('initial "already exists" adoption path', () => {
    it('detects 409 via .code', async () => {
      const err = Object.assign(new Error('Conflict'), { code: 409 });
      const existingBucket = {
        getMetadata: vi.fn().mockResolvedValue([{}]),
      };
      const storage = {
        createBucket: vi.fn().mockRejectedValueOnce(err),
        bucket: vi.fn().mockReturnValue(existingBucket),
      };
      const { ctx, logs } = makeCtx();
      const out = await createOrAdoptBucket(storage, 'b', baseOptions(true), true, ctx);
      expect(out).toEqual({ ublaForcedOn: false, bucketAlreadyExisted: true });
      expect(logs.some((l) => l.includes('already exists from a prior deploy'))).toBe(true);
    });

    it('detects "you already own it" via message', async () => {
      const err = new Error('you already own it');
      const existingBucket = { getMetadata: vi.fn().mockResolvedValue([{}]) };
      const storage = {
        createBucket: vi.fn().mockRejectedValueOnce(err),
        bucket: vi.fn().mockReturnValue(existingBucket),
      };
      const { ctx } = makeCtx();
      const out = await createOrAdoptBucket(storage, 'b', baseOptions(true), true, ctx);
      expect(out.bucketAlreadyExisted).toBe(true);
    });

    it('detects "already own this bucket" via message', async () => {
      const err = new Error('already own this bucket');
      const existingBucket = { getMetadata: vi.fn().mockResolvedValue([{}]) };
      const storage = {
        createBucket: vi.fn().mockRejectedValueOnce(err),
        bucket: vi.fn().mockReturnValue(existingBucket),
      };
      const { ctx } = makeCtx();
      const out = await createOrAdoptBucket(storage, 'b', baseOptions(true), true, ctx);
      expect(out.bucketAlreadyExisted).toBe(true);
    });

    it('does not call setMetadata when adopted bucket has UBLA already disabled', async () => {
      const err = new Error('you already own it');
      const existingBucket = {
        getMetadata: vi
          .fn()
          .mockResolvedValue([{ iamConfiguration: { uniformBucketLevelAccess: { enabled: false } } }]),
        setMetadata: vi.fn(),
      };
      const storage = {
        createBucket: vi.fn().mockRejectedValueOnce(err),
        bucket: vi.fn().mockReturnValue(existingBucket),
      };
      const { ctx } = makeCtx();
      const out = await createOrAdoptBucket(storage, 'b', baseOptions(true), true, ctx);
      expect(out).toEqual({ ublaForcedOn: false, bucketAlreadyExisted: true });
      expect(existingBucket.setMetadata).not.toHaveBeenCalled();
    });

    it('attempts UBLA-disable when adopted bucket has UBLA enabled', async () => {
      const err = new Error('you already own it');
      const existingBucket = {
        getMetadata: vi.fn().mockResolvedValue([{ iamConfiguration: { uniformBucketLevelAccess: { enabled: true } } }]),
        setMetadata: vi.fn().mockResolvedValue(undefined),
      };
      const storage = {
        createBucket: vi.fn().mockRejectedValueOnce(err),
        bucket: vi.fn().mockReturnValue(existingBucket),
      };
      const { ctx } = makeCtx();
      const out = await createOrAdoptBucket(storage, 'b', baseOptions(true), true, ctx);
      expect(out).toEqual({ ublaForcedOn: false, bucketAlreadyExisted: true });
      expect(existingBucket.setMetadata).toHaveBeenCalledWith({
        iamConfiguration: {
          uniformBucketLevelAccess: { enabled: false },
          publicAccessPrevention: 'inherited',
        },
      });
    });

    it('sets ublaForcedOn=true when adopted-bucket UBLA-disable hits the constraint string (RISK #3)', async () => {
      const err = new Error('you already own it');
      const disableErr = new Error('storage.uniformBucketLevelAccess constraint');
      const existingBucket = {
        getMetadata: vi.fn().mockResolvedValue([{ iamConfiguration: { uniformBucketLevelAccess: { enabled: true } } }]),
        setMetadata: vi.fn().mockRejectedValue(disableErr),
      };
      const storage = {
        createBucket: vi.fn().mockRejectedValueOnce(err),
        bucket: vi.fn().mockReturnValue(existingBucket),
      };
      const { ctx, logs } = makeCtx();
      const out = await createOrAdoptBucket(storage, 'b', baseOptions(true), true, ctx);
      expect(out).toEqual({ ublaForcedOn: true, bucketAlreadyExisted: true });
      expect(logs.some((l) => l.includes('UBLA locked on by org policy'))).toBe(true);
    });

    it('detects UBLA constraint via either error-string variant in adopted-bucket disable (RISK #3)', async () => {
      // Bare variant.
      const err = new Error('you already own it');
      const disableErr = new Error('uniformBucketLevelAccess locked');
      const existingBucket = {
        getMetadata: vi.fn().mockResolvedValue([{ iamConfiguration: { uniformBucketLevelAccess: { enabled: true } } }]),
        setMetadata: vi.fn().mockRejectedValue(disableErr),
      };
      const storage = {
        createBucket: vi.fn().mockRejectedValueOnce(err),
        bucket: vi.fn().mockReturnValue(existingBucket),
      };
      const { ctx } = makeCtx();
      const out = await createOrAdoptBucket(storage, 'b', baseOptions(true), true, ctx);
      expect(out.ublaForcedOn).toBe(true);
    });

    it('SILENTLY swallows non-UBLA disable errors (RISK #3 — keeps ublaForcedOn=false)', async () => {
      const err = new Error('you already own it');
      const disableErr = new Error('some other random failure');
      const existingBucket = {
        getMetadata: vi.fn().mockResolvedValue([{ iamConfiguration: { uniformBucketLevelAccess: { enabled: true } } }]),
        setMetadata: vi.fn().mockRejectedValue(disableErr),
      };
      const storage = {
        createBucket: vi.fn().mockRejectedValueOnce(err),
        bucket: vi.fn().mockReturnValue(existingBucket),
      };
      const { ctx } = makeCtx();
      const out = await createOrAdoptBucket(storage, 'b', baseOptions(true), true, ctx);
      // The non-UBLA error is silently caught; ublaForcedOn stays false
      // (the bucket may still have UBLA on, but the orchestrator will
      // discover that on the next IAM call). This matches the original
      // inline behavior — the catch block does NOT re-throw.
      expect(out).toEqual({ ublaForcedOn: false, bucketAlreadyExisted: true });
    });

    it('falls through silently when getMetadata rejects (best-effort outer catch)', async () => {
      const err = new Error('you already own it');
      const existingBucket = {
        getMetadata: vi.fn().mockRejectedValue(new Error('metadata fetch failed')),
      };
      const storage = {
        createBucket: vi.fn().mockRejectedValueOnce(err),
        bucket: vi.fn().mockReturnValue(existingBucket),
      };
      const { ctx } = makeCtx();
      const out = await createOrAdoptBucket(storage, 'b', baseOptions(true), true, ctx);
      // The metadata-rejection is handled by `.catch(() => [null])`
      // which yields `[null]` — UBLA check sees `null?.iam... === true`
      // as false, so we don't try setMetadata. Result is plain "adopt".
      expect(out).toEqual({ ublaForcedOn: false, bucketAlreadyExisted: true });
    });

    it('falls through silently when storage.bucket throws (outer try/catch)', async () => {
      const err = new Error('you already own it');
      const storage = {
        createBucket: vi.fn().mockRejectedValueOnce(err),
        bucket: vi.fn().mockImplementation(() => {
          throw new Error('bucket() failed');
        }),
      };
      const { ctx } = makeCtx();
      const out = await createOrAdoptBucket(storage, 'b', baseOptions(true), true, ctx);
      // Outer best-effort catch swallows everything inside the adoption
      // probe, so we get bucketAlreadyExisted=true with default
      // ublaForcedOn=false.
      expect(out).toEqual({ ublaForcedOn: false, bucketAlreadyExisted: true });
    });
  });

  describe('non-recoverable errors', () => {
    it('re-throws a non-UBLA non-409 error from the initial create', async () => {
      const err = new Error('quota exceeded');
      const storage = { createBucket: vi.fn().mockRejectedValueOnce(err) };
      const { ctx } = makeCtx();
      await expect(createOrAdoptBucket(storage, 'b', baseOptions(true), true, ctx)).rejects.toThrow('quota exceeded');
      expect(storage.createBucket).toHaveBeenCalledTimes(1);
    });

    it('coerces non-Error throws to strings for message scanning', async () => {
      // Producer threw a string instead of an Error — the helper must
      // still scan it for the "already exists" / UBLA strings rather
      // than crashing on `.message` access.
      const storage = { createBucket: vi.fn().mockRejectedValueOnce('you already own it') };
      const existingBucket = { getMetadata: vi.fn().mockResolvedValue([{}]) };

      (storage as any).bucket = vi.fn().mockReturnValue(existingBucket);
      const { ctx } = makeCtx();
      const out = await createOrAdoptBucket(storage, 'b', baseOptions(true), true, ctx);
      expect(out.bucketAlreadyExisted).toBe(true);
    });
  });
});

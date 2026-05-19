/**
 * Tests for `load-balancer/backend-creator.ts` (rf-lbal-3).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../compute-ops', () => ({
  wait_for_compute_op: vi.fn().mockResolvedValue(undefined),
}));

import {
  ignore_conflict,
  verify_backend_bucket_exists,
  create_serverless_backend,
  create_default_backend_service,
} from '../backend-creator';
import { wait_for_compute_op } from '../compute-ops';
import type { GCPHandlerContext } from '../../../types';

function makeCtx(rest: { get?: any; post?: any } = {}): GCPHandlerContext {
  return {
    project: 'p',
    region: 'us-central1',
    clients: new Map(),
    rest_client: {
      get: rest.get ?? vi.fn(),
      post: rest.post ?? vi.fn(),
      delete: vi.fn(),
    } as any,
  } as any;
}

describe('load-balancer/backend-creator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(wait_for_compute_op).mockResolvedValue(undefined);
  });

  describe('ignore_conflict', () => {
    it('resolves when the inner promise resolves', async () => {
      await expect(ignore_conflict(Promise.resolve(42))).resolves.toBeUndefined();
    });

    it('swallows 409 errors', async () => {
      await expect(ignore_conflict(Promise.reject(new Error('409 conflict')))).resolves.toBeUndefined();
    });

    it('swallows alreadyExists errors', async () => {
      await expect(ignore_conflict(Promise.reject(new Error('reason: alreadyExists')))).resolves.toBeUndefined();
    });

    it('swallows ALREADY_EXISTS errors', async () => {
      await expect(ignore_conflict(Promise.reject(new Error('ALREADY_EXISTS')))).resolves.toBeUndefined();
    });

    it('rethrows non-conflict errors', async () => {
      await expect(ignore_conflict(Promise.reject(new Error('500 internal')))).rejects.toThrow('500 internal');
    });

    it('rethrows when inner rejection has no .message (string fallback)', async () => {
      await expect(ignore_conflict(Promise.reject('plain reject'))).rejects.toBe('plain reject');
    });
  });

  describe('verify_backend_bucket_exists', () => {
    it('returns null when the bucket exists (GET succeeds)', async () => {
      const get = vi.fn().mockResolvedValue({ name: 'bucket-1' });
      const ctx = makeCtx({ get });
      const out = await verify_backend_bucket_exists(ctx, 'bucket-1');
      expect(out).toBeNull();
      expect(get).toHaveBeenCalledWith(
        'https://compute.googleapis.com/compute/v1/projects/p/global/backendBuckets/bucket-1',
      );
    });

    it('returns an error message when the GET 404s', async () => {
      const get = vi.fn().mockRejectedValue(new Error('404 not found'));
      const ctx = makeCtx({ get });
      const out = await verify_backend_bucket_exists(ctx, 'missing');
      expect(out).toContain("Backend bucket 'missing' does not exist");
    });

    it('returns an error message when GET says NOT_FOUND', async () => {
      const get = vi.fn().mockRejectedValue(new Error('reason: NOT_FOUND'));
      const ctx = makeCtx({ get });
      const out = await verify_backend_bucket_exists(ctx, 'missing');
      expect(out).toContain('does not exist');
    });

    it('returns a generic message for non-404 errors', async () => {
      const get = vi.fn().mockRejectedValue(new Error('500 internal'));
      const ctx = makeCtx({ get });
      const out = await verify_backend_bucket_exists(ctx, 'x');
      expect(out).toBe('Failed to verify backend bucket exists: 500 internal');
    });
  });

  describe('create_serverless_backend', () => {
    it('returns an error string when sourceServiceName is missing', async () => {
      const ctx = makeCtx();
      const reportStep = vi.fn();
      const err = await create_serverless_backend(ctx, { backendName: 'foo' }, {}, reportStep);
      expect(err).toContain('missing sourceServiceName');
    });

    it('issues NEG + backend service POSTs and returns null on success', async () => {
      const post = vi.fn().mockResolvedValue({ name: 'op-1' });
      const ctx = makeCtx({ post });
      const reportStep = vi.fn();
      const err = await create_serverless_backend(
        ctx,
        { backendName: 'foo', sourceServiceName: 'svc-1' },
        { timeout_sec: 60, labels: { env: 'prod' } },
        reportStep,
      );
      expect(err).toBeNull();
      // First POST = NEG creation
      expect(post).toHaveBeenNthCalledWith(
        1,
        'https://compute.googleapis.com/compute/v1/projects/p/regions/us-central1/networkEndpointGroups',
        expect.objectContaining({ name: 'foo-neg', networkEndpointType: 'SERVERLESS', cloudRun: { service: 'svc-1' } }),
      );
      // Second POST = backend service
      expect(post).toHaveBeenNthCalledWith(
        2,
        'https://compute.googleapis.com/compute/v1/projects/p/global/backendServices',
        expect.objectContaining({
          name: 'foo',
          loadBalancingScheme: 'EXTERNAL_MANAGED',
          protocol: 'HTTPS',
          timeoutSec: 60,
          labels: { env: 'prod' },
        }),
      );
      expect(reportStep).toHaveBeenCalledWith(1, 'Creating Serverless NEG for svc-1');
      expect(reportStep).toHaveBeenCalledWith(1, 'Creating backend service foo');
    });

    it('defaults timeout_sec=30 and labels={} when not provided', async () => {
      const post = vi.fn().mockResolvedValue({ name: 'op-1' });
      const ctx = makeCtx({ post });
      await create_serverless_backend(ctx, { backendName: 'foo', sourceServiceName: 'svc-1' }, {}, vi.fn());
      const call2 = post.mock.calls[1][1];
      expect(call2.timeoutSec).toBe(30);
      expect(call2.labels).toEqual({});
    });

    it('swallows 409 errors on either POST (idempotent)', async () => {
      const post = vi.fn().mockRejectedValue(new Error('409 already exists'));
      const ctx = makeCtx({ post });
      const err = await create_serverless_backend(ctx, { backendName: 'foo', sourceServiceName: 'svc-1' }, {}, vi.fn());
      expect(err).toBeNull();
    });

    it('rethrows non-conflict errors on the NEG POST', async () => {
      const post = vi.fn().mockRejectedValue(new Error('500 internal'));
      const ctx = makeCtx({ post });
      await expect(
        create_serverless_backend(ctx, { backendName: 'foo', sourceServiceName: 'svc-1' }, {}, vi.fn()),
      ).rejects.toThrow('500 internal');
    });
  });

  describe('create_default_backend_service', () => {
    it('issues a POST and returns the backend service name', async () => {
      const post = vi.fn().mockResolvedValue({ name: 'op-1' });
      const ctx = makeCtx({ post });
      const out = await create_default_backend_service(ctx, 'lb-1', { scheme: 'EXTERNAL', backend_protocol: 'HTTP' });
      expect(out).toBe('lb-1-backend');
      expect(post).toHaveBeenCalledWith(
        'https://compute.googleapis.com/compute/v1/projects/p/global/backendServices',
        expect.objectContaining({
          name: 'lb-1-backend',
          loadBalancingScheme: 'EXTERNAL',
          protocol: 'HTTP',
          timeoutSec: 30,
          labels: {},
        }),
      );
    });

    it('defaults loadBalancingScheme=EXTERNAL, protocol=HTTP, timeout=30, labels={}', async () => {
      const post = vi.fn().mockResolvedValue({ name: 'op-1' });
      const ctx = makeCtx({ post });
      await create_default_backend_service(ctx, 'lb-1', {});
      const body = post.mock.calls[0][1];
      expect(body.loadBalancingScheme).toBe('EXTERNAL');
      expect(body.protocol).toBe('HTTP');
      expect(body.timeoutSec).toBe(30);
      expect(body.labels).toEqual({});
    });
  });
});

/**
 * Tests for `cloud-run/iam.ts` (rf-crun-3).
 */
import { describe, it, expect, vi } from 'vitest';
import { grant_public_access } from '../iam.js';
import type { GCPHandlerContext } from '../../../types.js';

function makeCtx(post: (...args: any[]) => any, on_log?: (msg: string) => void): GCPHandlerContext {
  return {
    project: 'p',
    region: 'us',
    clients: new Map(),
    rest_client: { post } as any,
    on_log,
  } as any;
}

describe('cloud-run/iam', () => {
  describe('grant_public_access', () => {
    it('no-ops when allow_unauthenticated is explicitly false', async () => {
      const post = vi.fn();
      const ctx = makeCtx(post);
      await grant_public_access(ctx, 'projects/p/locations/us/services/x', { allow_unauthenticated: false });
      expect(post).not.toHaveBeenCalled();
    });

    it('no-ops when provider_id is empty', async () => {
      const post = vi.fn();
      const ctx = makeCtx(post);
      await grant_public_access(ctx, '', {});
      expect(post).not.toHaveBeenCalled();
    });

    it('issues a setIamPolicy POST when allow_unauthenticated is undefined (default = grant)', async () => {
      const post = vi.fn().mockResolvedValue({});
      const ctx = makeCtx(post);
      await grant_public_access(ctx, 'projects/p/locations/us/services/x', {});
      expect(post).toHaveBeenCalledWith(
        'https://run.googleapis.com/v2/projects/p/locations/us/services/x:setIamPolicy',
        {
          policy: {
            bindings: [{ role: 'roles/run.invoker', members: ['allUsers'] }],
          },
        },
      );
    });

    it('issues the grant when allow_unauthenticated is explicitly true', async () => {
      const post = vi.fn().mockResolvedValue({});
      const ctx = makeCtx(post);
      await grant_public_access(ctx, 'p/x', { allow_unauthenticated: true });
      expect(post).toHaveBeenCalled();
    });

    it('logs success via on_log when the grant succeeds', async () => {
      const post = vi.fn().mockResolvedValue({});
      const onLog = vi.fn();
      const ctx = makeCtx(post, onLog);
      await grant_public_access(ctx, 'p/x', {});
      expect(onLog).toHaveBeenCalledWith('Set public access (allUsers invoker)');
    });

    it('swallows errors and logs a warning when the IAM call throws', async () => {
      const post = vi.fn().mockRejectedValue(new Error('PERMISSION_DENIED'));
      const onLog = vi.fn();
      const ctx = makeCtx(post, onLog);
      await expect(grant_public_access(ctx, 'p/x', {})).resolves.toBeUndefined();
      expect(onLog).toHaveBeenCalledWith(expect.stringContaining('Could not set public access'));
      expect(onLog).toHaveBeenCalledWith(expect.stringContaining('PERMISSION_DENIED'));
    });

    it('uses String(err) fallback when the rejected value has no .message', async () => {
      const post = vi.fn().mockRejectedValue('plain string err');
      const onLog = vi.fn();
      const ctx = makeCtx(post, onLog);
      await grant_public_access(ctx, 'p/x', {});
      expect(onLog).toHaveBeenCalledWith(expect.stringContaining('plain string err'));
    });

    it('does not throw when on_log is undefined', async () => {
      const post = vi.fn().mockRejectedValue(new Error('x'));
      const ctx = makeCtx(post);
      await expect(grant_public_access(ctx, 'p/x', {})).resolves.toBeUndefined();
    });
  });
});

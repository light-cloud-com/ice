/**
 * Tests for `cloud-run/image-resolver.ts` (rf-crun-2). Mocks
 * `cloud-build-helper.js` to keep the suite hermetic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../cloud-build-helper', () => ({
  ensure_artifact_registry: vi.fn().mockResolvedValue(undefined),
  build_from_source: vi.fn().mockResolvedValue('built-image-uri'),
}));

import { ensure_artifact_registry, build_from_source } from '../../cloud-build-helper';
import { resolve_image, deleteArtifactRegistryImagesForService, AR_REPO } from '../image-resolver';
import type { GCPHandlerContext } from '../../../types';

function makeCtx(overrides: Partial<GCPHandlerContext> = {}): GCPHandlerContext {
  return {
    project: 'my-project',
    region: 'us-central1',
    clients: new Map(),
    rest_client: { delete: vi.fn() } as any,
    ...overrides,
  } as any;
}

describe('cloud-run/image-resolver', () => {
  describe('AR_REPO constant', () => {
    it('matches the convention used by ICE for all Cloud Run builds', () => {
      expect(AR_REPO).toBe('ice-images');
    });
  });

  describe('resolve_image', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(build_from_source).mockResolvedValue('built-image-uri');
      vi.mocked(ensure_artifact_registry).mockResolvedValue(undefined);
    });

    it('returns the explicit image when no repository is set', async () => {
      const ctx = makeCtx();
      const img = await resolve_image('foo', { image: 'gcr.io/p/foo:1' }, 'us-central1', ctx);
      expect(img).toBe('gcr.io/p/foo:1');
      expect(ensure_artifact_registry).not.toHaveBeenCalled();
      expect(build_from_source).not.toHaveBeenCalled();
    });

    it('throws CLOUD_RUN_NO_SOURCE when neither image nor repository is set', async () => {
      const ctx = makeCtx();
      await expect(resolve_image('foo', {}, 'us-central1', ctx)).rejects.toThrow();
    });

    it('builds from source when repository is set, ignoring any stale image value', async () => {
      const ctx = makeCtx();
      const img = await resolve_image(
        'foo',
        { image: 'stale-image', repository: 'me/foo', branch: 'develop' },
        'europe-west4',
        ctx,
      );
      expect(img).toBe('built-image-uri');
      expect(ensure_artifact_registry).toHaveBeenCalledWith(ctx, 'europe-west4', 'ice-images');
      expect(build_from_source).toHaveBeenCalledWith(
        ctx,
        'europe-west4',
        'me/foo',
        'develop',
        'europe-west4-docker.pkg.dev/my-project/ice-images/foo:latest',
        undefined,
        undefined,
      );
    });

    it('defaults branch to "main" when not specified', async () => {
      const ctx = makeCtx();
      await resolve_image('foo', { repository: 'me/foo' }, 'us-central1', ctx);
      expect(build_from_source).toHaveBeenCalledWith(
        ctx,
        'us-central1',
        'me/foo',
        'main',
        'us-central1-docker.pkg.dev/my-project/ice-images/foo:latest',
        undefined,
        undefined,
      );
    });

    it('forwards onLog through to ensure_artifact_registry / build_from_source', async () => {
      const ctx = makeCtx();
      const onLog = vi.fn();
      await resolve_image('foo', { repository: 'me/foo' }, 'us-central1', ctx, onLog);
      expect(onLog).toHaveBeenCalled(); // BUILDING_FROM_SOURCE + CREATING_ARTIFACT_REGISTRY
      expect(build_from_source).toHaveBeenCalledWith(
        ctx,
        'us-central1',
        'me/foo',
        'main',
        expect.any(String),
        onLog,
        undefined,
      );
    });

    it('reports steps 1 (artifact registry) and 2 (build) when reportStep is provided', async () => {
      const ctx = makeCtx();
      const reportStep = vi.fn();
      await resolve_image('foo', { repository: 'me/foo' }, 'us-central1', ctx, undefined, reportStep);
      expect(reportStep).toHaveBeenCalledWith(1, 'Ensuring artifact registry');
      expect(reportStep).toHaveBeenCalledWith(2, 'Building from source');
    });

    it('forwards inner build steps at outer index 2 so the bar refreshes label without advancing', async () => {
      const ctx = makeCtx();
      const reportStep = vi.fn();
      // Capture the forwarded helper passed into build_from_source.
      vi.mocked(build_from_source).mockImplementation(async (_c, _r, _repo, _b, _u, _l, forward) => {
        forward?.(7, 'inner label');
        return 'img';
      });
      await resolve_image('foo', { repository: 'me/foo' }, 'us-central1', ctx, undefined, reportStep);
      expect(reportStep).toHaveBeenCalledWith(2, 'inner label');
    });

    it('does NOT pass forwardBuildStep when reportStep is undefined', async () => {
      const ctx = makeCtx();
      await resolve_image('foo', { repository: 'me/foo' }, 'us-central1', ctx);
      expect(build_from_source).toHaveBeenCalledWith(
        ctx,
        'us-central1',
        'me/foo',
        'main',
        expect.any(String),
        undefined,
        undefined,
      );
    });
  });

  describe('deleteArtifactRegistryImagesForService', () => {
    it('issues a DELETE against the package URL', async () => {
      const del = vi.fn().mockResolvedValue({ name: 'op-1' });
      const ctx = makeCtx({ rest_client: { delete: del } as any });
      await deleteArtifactRegistryImagesForService(ctx, 'my-svc', 'us-central1');
      expect(del).toHaveBeenCalledWith(
        'https://artifactregistry.googleapis.com/v1/projects/my-project/locations/us-central1/repositories/ice-images/packages/my-svc',
      );
    });

    it('URL-encodes the service name in the package path', async () => {
      const del = vi.fn().mockResolvedValue({ name: 'op-1' });
      const ctx = makeCtx({ rest_client: { delete: del } as any });
      await deleteArtifactRegistryImagesForService(ctx, 'svc with spaces', 'us-central1');
      expect(del).toHaveBeenCalledWith(expect.stringContaining('packages/svc%20with%20spaces'));
    });

    it('swallows 404 errors silently (best-effort)', async () => {
      const del = vi.fn().mockRejectedValue(new Error('Request failed: 404 not found'));
      const ctx = makeCtx({ rest_client: { delete: del } as any });
      await expect(deleteArtifactRegistryImagesForService(ctx, 'x', 'us')).resolves.toBeUndefined();
    });

    it('swallows NOT_FOUND errors silently', async () => {
      const del = vi.fn().mockRejectedValue(new Error('NOT_FOUND for this resource'));
      const ctx = makeCtx({ rest_client: { delete: del } as any });
      await expect(deleteArtifactRegistryImagesForService(ctx, 'x', 'us')).resolves.toBeUndefined();
    });

    it('swallows notFound errors (camelCase variant)', async () => {
      const del = vi.fn().mockRejectedValue(new Error('reason: notFound'));
      const ctx = makeCtx({ rest_client: { delete: del } as any });
      await expect(deleteArtifactRegistryImagesForService(ctx, 'x', 'us')).resolves.toBeUndefined();
    });

    it('rethrows non-404 errors', async () => {
      const del = vi.fn().mockRejectedValue(new Error('500 internal error'));
      const ctx = makeCtx({ rest_client: { delete: del } as any });
      await expect(deleteArtifactRegistryImagesForService(ctx, 'x', 'us')).rejects.toThrow('500 internal error');
    });

    it('rethrows when the error has no message (string fallback)', async () => {
      const del = vi.fn().mockRejectedValue('plain string');
      const ctx = makeCtx({ rest_client: { delete: del } as any });
      await expect(deleteArtifactRegistryImagesForService(ctx, 'x', 'us')).rejects.toBe('plain string');
    });
  });
});

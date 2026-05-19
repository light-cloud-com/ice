/**
 * Unit tests for `services/deploy/src/services/destroy-runner.ts` —
 * the per-item destroy attempt (`attemptDestroy`) and canvas-correlation-
 * gated wire emit (`emitDestroyLifecycle`) helpers extracted from the two
 * destroy loops in `deploy.service.ts` (rf-deploy-13).
 *
 * Per the `deploy-service-tests-must-import-vitest-explicitly` learning,
 * vitest globals are imported explicitly.
 *
 * Per `vi-spyon-accumulates-across-it-blocks-without-explicit-reset`,
 * mocks are cleared in `beforeEach` to avoid call-counter carry-over
 * across `it` blocks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../deploy-event-dispatcher', () => ({
  emitDestroyNodeStatus: vi.fn(),
}));

import { attemptDestroy, emitDestroyLifecycle } from '../destroy-runner';
import * as dispatcher from '../deploy-event-dispatcher';

const emitDestroyNodeStatusMock = (dispatcher as any).emitDestroyNodeStatus as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('attemptDestroy', () => {
  it('returns { success: true, raw } when deployer.delete resolves { success: true }', async () => {
    const raw = { success: true, provider_id: 'p-1' };
    const deleteFn = vi.fn(async () => raw);
    const deployer = { delete: deleteFn as any };

    const result = await attemptDestroy({
      deployer,
      type: 'gcp.run.service',
      name: 'web',
      providerId: 'p-1',
      provider: 'gcp',
      project: 'lc-ice',
    });

    expect(result).toEqual({ success: true, raw });
  });

  it('returns { success: false, error, raw } when deployer.delete resolves { success: false, error: "boom" }', async () => {
    const raw = { success: false, error: 'boom' };
    const deleteFn = vi.fn(async () => raw);
    const deployer = { delete: deleteFn as any };

    const result = await attemptDestroy({
      deployer,
      type: 'gcp.run.service',
      name: 'web',
      providerId: 'p-1',
      provider: 'gcp',
      project: 'lc-ice',
    });

    expect(result).toEqual({ success: false, error: 'boom', raw });
  });

  it('returns { success: false, error: "delete returned non-success" } when result has no error string', async () => {
    const raw = { success: false };
    const deleteFn = vi.fn(async () => raw);
    const deployer = { delete: deleteFn as any };

    const result = await attemptDestroy({
      deployer,
      type: 'gcp.run.service',
      name: 'web',
      providerId: 'p-1',
      provider: 'gcp',
      project: 'lc-ice',
    });

    expect(result).toEqual({ success: false, error: 'delete returned non-success', raw });
  });

  it('with treatNotFoundAsSuccess: true + result error containing NOT_FOUND → returns { success: true, raw }', async () => {
    const raw = { success: false, error: 'gcp.compute.NOT_FOUND: instance gone' };
    const deleteFn = vi.fn(async () => raw);
    const deployer = { delete: deleteFn as any };

    const result = await attemptDestroy({
      deployer,
      type: 'gcp.compute.instance',
      name: 'vm',
      providerId: 'p-1',
      provider: 'gcp',
      project: 'lc-ice',
      treatNotFoundAsSuccess: true,
    });

    expect(result).toEqual({ success: true, raw });
  });

  it('with treatNotFoundAsSuccess: true + result error containing 404 → returns { success: true, raw }', async () => {
    const raw = { success: false, error: 'HTTP 404: not found' };
    const deleteFn = vi.fn(async () => raw);
    const deployer = { delete: deleteFn as any };

    const result = await attemptDestroy({
      deployer,
      type: 'gcp.storage.bucket',
      name: 'b',
      providerId: 'b',
      provider: 'gcp',
      project: 'lc-ice',
      treatNotFoundAsSuccess: true,
    });

    expect(result).toEqual({ success: true, raw });
  });

  it('with treatNotFoundAsSuccess: false + same NOT_FOUND result → returns { success: false, error, raw }', async () => {
    const raw = { success: false, error: 'gcp.compute.NOT_FOUND: instance gone' };
    const deleteFn = vi.fn(async () => raw);
    const deployer = { delete: deleteFn as any };

    const result = await attemptDestroy({
      deployer,
      type: 'gcp.compute.instance',
      name: 'vm',
      providerId: 'p-1',
      provider: 'gcp',
      project: 'lc-ice',
      treatNotFoundAsSuccess: false,
    });

    expect(result).toEqual({ success: false, error: 'gcp.compute.NOT_FOUND: instance gone', raw });
  });

  it('catch path: deployer.delete throws → returns { success: false, error: msg } (no raw)', async () => {
    const deleteFn = vi.fn(async () => {
      throw new Error('network down');
    });
    const deployer = { delete: deleteFn as any };

    const result = await attemptDestroy({
      deployer,
      type: 'gcp.run.service',
      name: 'web',
      providerId: 'p-1',
      provider: 'gcp',
      project: 'lc-ice',
    });

    expect(result).toEqual({ success: false, error: 'network down' });
    expect((result as any).raw).toBeUndefined();
  });

  it('catch path with treatNotFoundAsSuccess: true + thrown error containing NOT_FOUND → returns { success: true } (no raw)', async () => {
    const deleteFn = vi.fn(async () => {
      throw new Error('gcp.NOT_FOUND: instance already destroyed');
    });
    const deployer = { delete: deleteFn as any };

    const result = await attemptDestroy({
      deployer,
      type: 'gcp.compute.instance',
      name: 'vm',
      providerId: 'p-1',
      provider: 'gcp',
      project: 'lc-ice',
      treatNotFoundAsSuccess: true,
    });

    expect(result).toEqual({ success: true });
    expect((result as any).raw).toBeUndefined();
  });

  it('catch path with treatNotFoundAsSuccess: true + 404 in thrown message → returns { success: true }', async () => {
    const deleteFn = vi.fn(async () => {
      throw new Error('Got HTTP 404 from API');
    });
    const deployer = { delete: deleteFn as any };

    const result = await attemptDestroy({
      deployer,
      type: 'gcp.storage.bucket',
      name: 'b',
      providerId: 'b',
      provider: 'gcp',
      project: 'lc-ice',
      treatNotFoundAsSuccess: true,
    });

    expect(result).toEqual({ success: true });
  });

  it('catch path with treatNotFoundAsSuccess: false + NOT_FOUND in thrown message → returns { success: false, error: msg }', async () => {
    const deleteFn = vi.fn(async () => {
      throw new Error('gcp.NOT_FOUND: surprise');
    });
    const deployer = { delete: deleteFn as any };

    const result = await attemptDestroy({
      deployer,
      type: 'gcp.run.service',
      name: 'web',
      providerId: 'p-1',
      provider: 'gcp',
      project: 'lc-ice',
      treatNotFoundAsSuccess: false,
    });

    expect(result).toEqual({ success: false, error: 'gcp.NOT_FOUND: surprise' });
  });

  it('forwards provider, project, type, name, providerId to deployer.delete verbatim', async () => {
    const deleteFn = vi.fn(async () => ({ success: true }));
    const deployer = { delete: deleteFn as any };

    await attemptDestroy({
      deployer,
      type: 'gcp.run.service',
      name: 'svc-name',
      providerId: 'projects/foo/services/bar',
      provider: 'gcp',
      project: 'my-project',
    });

    expect(deleteFn).toHaveBeenCalledTimes(1);
    expect(deleteFn).toHaveBeenCalledWith(
      'gcp.run.service',
      'svc-name',
      'projects/foo/services/bar',
      { provider: 'gcp', project: 'my-project' },
    );
  });

  it('catch path: stringifies non-Error throws via String(err)', async () => {
    // Defends the `err?.message || String(err)` fallback: a thrown
    // non-Error (e.g. plain object) should still produce a string error.
    const deleteFn = vi.fn(async () => {
      throw 'plain string';
    });
    const deployer = { delete: deleteFn as any };

    const result = await attemptDestroy({
      deployer,
      type: 'gcp.run.service',
      name: 'web',
      providerId: 'p-1',
      provider: 'gcp',
      project: 'lc-ice',
    });

    expect(result).toEqual({ success: false, error: 'plain string' });
  });
});

describe('emitDestroyLifecycle', () => {
  it('calls emitDestroyNodeStatus with payload mapping when canvasNodeId is provided', () => {
    emitDestroyLifecycle({
      cardId: 'card-1',
      canvasNodeId: 'node-A',
      resourceName: 'web',
      resourceType: 'gcp.run.service',
      status: 'queued',
    });

    expect(emitDestroyNodeStatusMock).toHaveBeenCalledTimes(1);
    expect(emitDestroyNodeStatusMock).toHaveBeenCalledWith('card-1', {
      canvasNodeId: 'node-A',
      resourceName: 'web',
      resourceType: 'gcp.run.service',
      status: 'queued',
      duration_ms: undefined,
      error: undefined,
    });
  });

  it('skips entirely when canvasNodeId is undefined (no call to the dispatcher)', () => {
    emitDestroyLifecycle({
      cardId: 'card-1',
      canvasNodeId: undefined,
      resourceName: 'web',
      resourceType: 'gcp.run.service',
      status: 'queued',
    });

    expect(emitDestroyNodeStatusMock).not.toHaveBeenCalled();
  });

  it('treats empty-string canvasNodeId as missing (skips — matches the if (t.nodeId) truthiness gate in the original loops)', () => {
    emitDestroyLifecycle({
      cardId: 'card-1',
      canvasNodeId: '',
      resourceName: 'web',
      resourceType: 'gcp.run.service',
      status: 'queued',
    });

    expect(emitDestroyNodeStatusMock).not.toHaveBeenCalled();
  });

  it('forwards optional durationMs and error fields verbatim', () => {
    emitDestroyLifecycle({
      cardId: 'card-1',
      canvasNodeId: 'node-A',
      resourceName: 'web',
      resourceType: 'gcp.run.service',
      status: 'failed',
      durationMs: 1234,
      error: { code: 'DESTROY_FAILED', message: 'boom' },
    });

    expect(emitDestroyNodeStatusMock).toHaveBeenCalledTimes(1);
    expect(emitDestroyNodeStatusMock).toHaveBeenCalledWith('card-1', {
      canvasNodeId: 'node-A',
      resourceName: 'web',
      resourceType: 'gcp.run.service',
      status: 'failed',
      duration_ms: 1234,
      error: { code: 'DESTROY_FAILED', message: 'boom' },
    });
  });

  it.each(['queued', 'applying', 'succeeded', 'failed'] as const)(
    'each status value (%s) round-trips through to the dispatcher',
    (status) => {
      emitDestroyLifecycle({
        cardId: 'card-1',
        canvasNodeId: 'node-A',
        resourceName: 'web',
        resourceType: 'gcp.run.service',
        status,
      });

      expect(emitDestroyNodeStatusMock).toHaveBeenCalledTimes(1);
      expect(emitDestroyNodeStatusMock).toHaveBeenCalledWith(
        'card-1',
        expect.objectContaining({ status }),
      );
    },
  );

  it('forwards recoverable on the error sub-object', () => {
    emitDestroyLifecycle({
      cardId: 'card-1',
      canvasNodeId: 'node-A',
      resourceName: 'web',
      resourceType: 'gcp.run.service',
      status: 'failed',
      error: { code: 'DESTROY_FAILED', message: 'boom', recoverable: true },
    });

    expect(emitDestroyNodeStatusMock).toHaveBeenCalledTimes(1);
    expect(emitDestroyNodeStatusMock.mock.calls[0]?.[1]).toMatchObject({
      error: { code: 'DESTROY_FAILED', message: 'boom', recoverable: true },
    });
  });
});

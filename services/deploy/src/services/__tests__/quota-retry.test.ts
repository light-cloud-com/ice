/**
 * Unit tests for `services/deploy/src/services/quota-retry.ts` — the
 * auto-cleanup-on-quota-failure orchestration extracted from
 * deploy.service.ts in rf-deploy-14.
 *
 * Per the `deploy-service-tests-must-import-vitest-explicitly` learning,
 * vitest globals are imported explicitly so the deploy package's typecheck
 * stays green.
 *
 * The helper takes `deployGraph` as a function parameter rather than
 * importing `@ice/core` directly, so the tests pass a `vi.fn()` and never
 * need to mock the heavy core engine.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../deploy-event-dispatcher.js', () => ({
  emitLog: vi.fn(),
}));

vi.mock('../scheduler-callbacks.js', () => ({
  makeSchedulerCallbacks: vi.fn(() => ({
    on_log: vi.fn(),
    on_node_status: vi.fn(),
    on_node_progress: vi.fn(),
    on_resource_result: vi.fn(),
  })),
}));

vi.mock('../orphan-cleanup.service.js', () => ({
  cleanupOrphanedIceResources: vi.fn(),
}));

import { hasQuotaFailure, retryAfterQuotaCleanup } from '../quota-retry.js';
import * as dispatcher from '../deploy-event-dispatcher.js';
import * as schedulerCallbacks from '../scheduler-callbacks.js';
import * as orphanCleanup from '../orphan-cleanup.service.js';

const emitLogMock = (dispatcher as any).emitLog as ReturnType<typeof vi.fn>;
const makeSchedulerCallbacksMock = (schedulerCallbacks as any).makeSchedulerCallbacks as ReturnType<typeof vi.fn>;
const cleanupOrphanedIceResourcesMock = (orphanCleanup as any).cleanupOrphanedIceResources as ReturnType<typeof vi.fn>;

describe('hasQuotaFailure', () => {
  it('returns false when resources is undefined', () => {
    expect(hasQuotaFailure(undefined)).toBe(false);
  });

  it('returns false when resources is null', () => {
    expect(hasQuotaFailure(null as any)).toBe(false);
  });

  it('returns false when resources is empty', () => {
    expect(hasQuotaFailure([])).toBe(false);
  });

  it('returns false when no failed resource matches any QUOTA_PATTERN', () => {
    expect(
      hasQuotaFailure([
        { success: false, error: 'Some other error' },
        { success: false, error: 'Permission denied' },
      ]),
    ).toBe(false);
  });

  it('returns true on a QUOTA_EXCEEDED substring', () => {
    expect(hasQuotaFailure([{ success: false, error: 'Operation failed: QUOTA_EXCEEDED on resource' }])).toBe(true);
  });

  it("returns true on a Quota 'BACKEND_BUCKETS' substring", () => {
    expect(
      hasQuotaFailure([{ success: false, error: "googleapi error: Quota 'BACKEND_BUCKETS' exceeded" }]),
    ).toBe(true);
  });

  it('returns true on a Backend bucket quota exceeded substring', () => {
    expect(
      hasQuotaFailure([{ success: false, error: 'Backend bucket quota exceeded — try cleanup' }]),
    ).toBe(true);
  });

  it('returns false when the matching error is on a SUCCESSFUL resource (gate requires !r.success)', () => {
    expect(hasQuotaFailure([{ success: true, error: 'QUOTA_EXCEEDED (logged but not fatal)' }])).toBe(false);
  });

  it('returns false when a failed resource has no error string', () => {
    expect(
      hasQuotaFailure([
        { success: false, error: undefined },
        { success: false, error: null },
        { success: false /* no error key */ },
      ]),
    ).toBe(false);
  });

  it('returns true on a mixed batch when at least one entry matches', () => {
    expect(
      hasQuotaFailure([
        { success: true, name: 'a' },
        { success: false, error: 'Some unrelated failure' },
        { success: false, error: 'QUOTA_EXCEEDED on backend bucket' },
        { success: true, name: 'b' },
      ]),
    ).toBe(true);
  });
});

describe('retryAfterQuotaCleanup', () => {
  function makeArgs(overrides: any = {}) {
    return {
      cardId: 'card-1',
      orgId: 'org-1',
      gcpProject: 'project-A',
      result: {
        resources: [
          { name: 'r-other', success: true },
          { name: 'r-quota', success: false, error: 'QUOTA_EXCEEDED on backend bucket' },
        ],
        success: false,
        summary: { failed: 1, succeeded: 1 },
      },
      deployer: { id: 'deployer-mock' },
      deployGraph: vi.fn(),
      translation: { graph: { __sentinel: 'graph' } },
      currentGraph: { __sentinel: 'currentGraph' },
      graphIdToCanvasId: new Map<string, string>([['gcp.bb:r-quota', 'canvas-r-quota']]),
      authClient: {
        projectId: 'project-A',
        _ice_key_file_path: '/tmp/key.json',
        _ice_parsed_credentials: { type: 'service_account' },
      },
      options: { provider: 'gcp', region: 'us-central1' },
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    // Restore the default factory output between tests since we
    // sometimes override it.
    makeSchedulerCallbacksMock.mockImplementation(() => ({
      on_log: vi.fn(),
      on_node_status: vi.fn(),
      on_node_progress: vi.fn(),
      on_resource_result: vi.fn(),
    }));
  });

  it('returns immediately when there is no quota failure (no logs, no cleanup)', async () => {
    const args = makeArgs({
      result: {
        resources: [
          { name: 'r1', success: true },
          { name: 'r2', success: false, error: 'Permission denied' },
        ],
        success: false,
        summary: { failed: 1, succeeded: 1 },
      },
    });

    await retryAfterQuotaCleanup(args);

    expect(emitLogMock).not.toHaveBeenCalled();
    expect(cleanupOrphanedIceResourcesMock).not.toHaveBeenCalled();
    expect(args.deployGraph).not.toHaveBeenCalled();
  });

  it('emits the scanning log and calls cleanupOrphanedIceResources(orgId, gcpProject, { dryRun: false })', async () => {
    cleanupOrphanedIceResourcesMock.mockResolvedValueOnce({ deleted: [] });
    const args = makeArgs();

    await retryAfterQuotaCleanup(args);

    expect(emitLogMock).toHaveBeenCalledWith(
      'card-1',
      '[auto-cleanup] Backend bucket quota exceeded — scanning for orphaned ICE resources to free up the slot...',
    );
    expect(cleanupOrphanedIceResourcesMock).toHaveBeenCalledWith('org-1', 'project-A', { dryRun: false });
  });

  it('emits the "No orphans found" log and does NOT call deployGraph when deletedCount === 0', async () => {
    cleanupOrphanedIceResourcesMock.mockResolvedValueOnce({ deleted: [] });
    const args = makeArgs();

    await retryAfterQuotaCleanup(args);

    expect(emitLogMock).toHaveBeenCalledWith(
      'card-1',
      '[auto-cleanup] No orphans found. Quota is exhausted by active deployments — destroy an old project or request a quota increase.',
    );
    expect(args.deployGraph).not.toHaveBeenCalled();
  });

  it('emits the singular "Freed 1 orphaned resource — retrying failed resources." log when deletedCount === 1', async () => {
    cleanupOrphanedIceResourcesMock.mockResolvedValueOnce({ deleted: [{ type: 'BackendBucket', name: 'old-bb' }] });
    const args = makeArgs({ deployGraph: vi.fn().mockResolvedValueOnce({ resources: [] }) });

    await retryAfterQuotaCleanup(args);

    expect(emitLogMock).toHaveBeenCalledWith(
      'card-1',
      '[auto-cleanup] Freed 1 orphaned resource — retrying failed resources.',
    );
  });

  it('emits the plural "Freed 3 orphaned resources — retrying failed resources." log when deletedCount === 3', async () => {
    cleanupOrphanedIceResourcesMock.mockResolvedValueOnce({
      deleted: [
        { type: 'BackendBucket', name: 'a' },
        { type: 'BackendBucket', name: 'b' },
        { type: 'BackendBucket', name: 'c' },
      ],
    });
    const args = makeArgs({ deployGraph: vi.fn().mockResolvedValueOnce({ resources: [] }) });

    await retryAfterQuotaCleanup(args);

    expect(emitLogMock).toHaveBeenCalledWith(
      'card-1',
      '[auto-cleanup] Freed 3 orphaned resources — retrying failed resources.',
    );
  });

  it('emits the "Retrying deploy after orphan cleanup..." log and calls deployGraph when deletedCount > 0', async () => {
    cleanupOrphanedIceResourcesMock.mockResolvedValueOnce({ deleted: [{ type: 'BB', name: 'x' }] });
    const deployGraph = vi.fn().mockResolvedValueOnce({ resources: [] });
    const args = makeArgs({ deployGraph });

    await retryAfterQuotaCleanup(args);

    expect(emitLogMock).toHaveBeenCalledWith('card-1', '[auto-cleanup] Retrying deploy after orphan cleanup...');
    expect(deployGraph).toHaveBeenCalledTimes(1);
  });

  it('passes the retry shape into deployGraph: provider, project, regions, continue_on_error, callbacks, auth_*; NO on_resource_result', async () => {
    cleanupOrphanedIceResourcesMock.mockResolvedValueOnce({ deleted: [{ type: 'BB', name: 'x' }] });
    const onLog = vi.fn();
    const onNodeStatus = vi.fn();
    const onNodeProgress = vi.fn();
    const onResourceResult = vi.fn();
    makeSchedulerCallbacksMock.mockImplementationOnce(() => ({
      on_log: onLog,
      on_node_status: onNodeStatus,
      on_node_progress: onNodeProgress,
      on_resource_result: onResourceResult,
    }));
    const deployGraph = vi.fn().mockResolvedValueOnce({ resources: [] });
    const args = makeArgs({ deployGraph });

    await retryAfterQuotaCleanup(args);

    expect(deployGraph).toHaveBeenCalledTimes(1);
    const [desired, current, deployer, opts] = deployGraph.mock.calls[0];
    expect(desired).toBe(args.translation.graph);
    expect(current).toBe(args.currentGraph);
    expect(deployer).toBe(args.deployer);
    expect(opts.provider).toBe('gcp');
    expect(opts.project).toBe('project-A');
    expect(opts.regions).toEqual(['us-central1']);
    expect(opts.continue_on_error).toBe(true);
    expect(opts.auth_client).toBe(args.authClient);
    expect(opts.auth_key_file).toBe('/tmp/key.json');
    expect(opts.auth_credentials).toEqual({ type: 'service_account' });
    expect(opts.on_log).toBe(onLog);
    expect(opts.on_node_status).toBe(onNodeStatus);
    expect(opts.on_node_progress).toBe(onNodeProgress);
    expect('on_resource_result' in opts).toBe(false);
    // makeSchedulerCallbacks invoked with retry-shape: warnOnMiss false, no totals.
    expect(makeSchedulerCallbacksMock).toHaveBeenCalledWith({
      cardId: 'card-1',
      graphIdToCanvasId: args.graphIdToCanvasId,
      warnOnMiss: false,
    });
  });

  it('falls back to defaults when options.provider/region are missing', async () => {
    cleanupOrphanedIceResourcesMock.mockResolvedValueOnce({ deleted: [{ type: 'BB', name: 'x' }] });
    const deployGraph = vi.fn().mockResolvedValueOnce({ resources: [] });
    const args = makeArgs({ deployGraph, options: {} });

    await retryAfterQuotaCleanup(args);

    const opts = deployGraph.mock.calls[0][3];
    expect(opts.provider).toBe('gcp');
    expect(opts.regions).toEqual(['us-central1']);
  });

  it('merges retry success into result.resources by name (retry success overrides primary failure)', async () => {
    cleanupOrphanedIceResourcesMock.mockResolvedValueOnce({ deleted: [{ type: 'BB', name: 'x' }] });
    const deployGraph = vi
      .fn()
      .mockResolvedValueOnce({ resources: [{ name: 'r-quota', success: true, provider_id: 'pid-new' }] });
    const args = makeArgs({ deployGraph });

    await retryAfterQuotaCleanup(args);

    expect(args.result.resources).toEqual([
      { name: 'r-other', success: true },
      { name: 'r-quota', success: true, provider_id: 'pid-new' },
    ]);
  });

  it('does NOT override primary success when retry returns success: false for the same name', async () => {
    cleanupOrphanedIceResourcesMock.mockResolvedValueOnce({ deleted: [{ type: 'BB', name: 'x' }] });
    // Retry attempts r-other again but fails; r-other was successful in primary.
    const deployGraph = vi
      .fn()
      .mockResolvedValueOnce({ resources: [{ name: 'r-other', success: false, error: 'second-pass error' }] });
    const args = makeArgs({ deployGraph });

    await retryAfterQuotaCleanup(args);

    // r-other from primary (success: true) must be preserved verbatim.
    const rOther = args.result.resources.find((r: any) => r.name === 'r-other');
    expect(rOther).toEqual({ name: 'r-other', success: true });
  });

  it('recomputes result.success and result.summary.failed after a successful retry merge', async () => {
    cleanupOrphanedIceResourcesMock.mockResolvedValueOnce({ deleted: [{ type: 'BB', name: 'x' }] });
    const deployGraph = vi.fn().mockResolvedValueOnce({ resources: [{ name: 'r-quota', success: true }] });
    const args = makeArgs({ deployGraph });

    await retryAfterQuotaCleanup(args);

    expect(args.result.success).toBe(true);
    expect(args.result.summary.failed).toBe(0);
  });

  it('does NOT throw when result.summary is missing during recompute', async () => {
    cleanupOrphanedIceResourcesMock.mockResolvedValueOnce({ deleted: [{ type: 'BB', name: 'x' }] });
    const deployGraph = vi.fn().mockResolvedValueOnce({ resources: [{ name: 'r-quota', success: true }] });
    const args = makeArgs({
      deployGraph,
      result: {
        resources: [
          { name: 'r-other', success: true },
          { name: 'r-quota', success: false, error: 'QUOTA_EXCEEDED on backend bucket' },
        ],
        success: false,
        // summary intentionally absent.
      },
    });

    await retryAfterQuotaCleanup(args);

    expect(args.result.success).toBe(true);
    expect((args.result as any).summary).toBeUndefined();
  });

  it('does NOT mutate result when retryResult.resources is empty', async () => {
    cleanupOrphanedIceResourcesMock.mockResolvedValueOnce({ deleted: [{ type: 'BB', name: 'x' }] });
    const deployGraph = vi.fn().mockResolvedValueOnce({ resources: [] });
    const args = makeArgs({ deployGraph });
    const beforeResources = [...args.result.resources];

    await retryAfterQuotaCleanup(args);

    // Empty retry → original resources, success, summary all unchanged.
    expect(args.result.resources).toEqual(beforeResources);
    expect(args.result.success).toBe(false);
    expect(args.result.summary.failed).toBe(1);
  });

  it('catches cleanup errors and emits "Cleanup attempt failed: <msg>"; result is NOT mutated', async () => {
    cleanupOrphanedIceResourcesMock.mockRejectedValueOnce(new Error('orphan scan API blew up'));
    const args = makeArgs();
    const beforeResources = [...args.result.resources];
    const beforeSuccess = args.result.success;

    await retryAfterQuotaCleanup(args);

    expect(emitLogMock).toHaveBeenCalledWith(
      'card-1',
      '[auto-cleanup] Cleanup attempt failed: orphan scan API blew up',
    );
    expect(args.result.resources).toEqual(beforeResources);
    expect(args.result.success).toBe(beforeSuccess);
  });

  it('non-Error throw (string) flows through cleanupErr?.message || cleanupErr to a sensible string', async () => {
    cleanupOrphanedIceResourcesMock.mockImplementationOnce(() => {
      throw 'plain-string-failure';
    });
    const args = makeArgs();

    await retryAfterQuotaCleanup(args);

    expect(emitLogMock).toHaveBeenCalledWith(
      'card-1',
      '[auto-cleanup] Cleanup attempt failed: plain-string-failure',
    );
  });

  it('passes auth_key_file and auth_credentials from authClient private fields verbatim', async () => {
    cleanupOrphanedIceResourcesMock.mockResolvedValueOnce({ deleted: [{ type: 'BB', name: 'x' }] });
    const deployGraph = vi.fn().mockResolvedValueOnce({ resources: [] });
    const args = makeArgs({
      deployGraph,
      authClient: {
        _ice_key_file_path: '/secrets/specific.json',
        _ice_parsed_credentials: { client_email: 'x@y' },
      },
    });

    await retryAfterQuotaCleanup(args);

    const opts = deployGraph.mock.calls[0][3];
    expect(opts.auth_key_file).toBe('/secrets/specific.json');
    expect(opts.auth_credentials).toEqual({ client_email: 'x@y' });
  });
});

/**
 * Tests for `services/apply-pipeline-helpers.ts` — extracted from
 * `apply-deployment.ts` in rf-deploy2-2 housekeeping. Covers:
 *
 * - `normalizeIdempotentResultErrors`: NOT_FOUND on delete + ALREADY_EXISTS
 *   on create rewrite to success; recalculates result.success.
 * - `persistResourceMappings`: writes mapping rows for successful resources
 *   with a source_node_id; skips ones without; mutates res.source_node_id
 *   in place.
 * - `logSourceRepoDiagnostics`: emits diagnostic log lines for empty repo
 *   field + dangling repository nodes.
 *
 * Mocks `./deploy-event-dispatcher.js` for `emitLog` and
 * `./resource-mapping.service.js` for `upsertResourceMapping`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const emitLog = vi.fn();
const upsertResourceMapping = vi.fn().mockResolvedValue(undefined);

vi.mock('../services/deploy-event-dispatcher.js', () => ({
  emitDeployEvent: vi.fn(),
  emitLog,
  emitDestroyNodeStatus: vi.fn(),
}));

vi.mock('../services/resource-mapping.service.js', () => ({
  upsertResourceMapping,
}));

async function getHelpers() {
  const mod = await import('../services/apply-pipeline-helpers.js');
  return mod;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('normalizeIdempotentResultErrors', () => {
  it('rewrites NOT_FOUND on delete to success + emits log', async () => {
    const { normalizeIdempotentResultErrors } = await getHelpers();
    const result = {
      success: false,
      resources: [
        { name: 'r1', action: 'delete', success: false, error: 'NOT_FOUND: bucket gone' },
      ],
      summary: { failed: 1 },
    };
    normalizeIdempotentResultErrors('card-1', result);

    expect(result.resources[0].success).toBe(true);
    expect(result.resources[0].error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.summary.failed).toBe(0);
    expect(emitLog).toHaveBeenCalledWith('card-1', expect.stringContaining('already deleted'));
  });

  it('rewrites ALREADY_EXISTS on create to no_change + emits log', async () => {
    const { normalizeIdempotentResultErrors } = await getHelpers();
    const result = {
      success: false,
      resources: [
        { name: 'r1', action: 'create', success: false, error: 'ALREADY_EXISTS: already there' },
      ],
      summary: { failed: 1 },
    };
    normalizeIdempotentResultErrors('card-1', result);

    expect(result.resources[0].success).toBe(true);
    expect(result.resources[0].action).toBe('no_change');
    expect(result.resources[0].error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(emitLog).toHaveBeenCalledWith('card-1', expect.stringContaining('already exists'));
  });

  it('leaves real failures alone', async () => {
    const { normalizeIdempotentResultErrors } = await getHelpers();
    const result = {
      success: false,
      resources: [{ name: 'r1', action: 'create', success: false, error: 'PERMISSION_DENIED' }],
      summary: { failed: 1 },
    };
    normalizeIdempotentResultErrors('card-1', result);

    expect(result.resources[0].success).toBe(false);
    expect(result.success).toBe(false);
    expect(emitLog).not.toHaveBeenCalled();
  });

  it('no-ops when result has no resources', async () => {
    const { normalizeIdempotentResultErrors } = await getHelpers();
    const result = { success: true, resources: [], summary: { failed: 0 } };
    normalizeIdempotentResultErrors('card-1', result);
    expect(emitLog).not.toHaveBeenCalled();
  });
});

describe('persistResourceMappings', () => {
  it('writes a mapping row + mutates source_node_id when findSourceNodeId resolves', async () => {
    const { persistResourceMappings } = await getHelpers();
    const result = {
      resources: [{ name: 'bucket-aaa', type: 'gcp.storage.bucket', success: true, provider_id: 'pid-1' }],
    };
    const findSourceNodeId = vi.fn().mockReturnValue('node-A');
    const nameToLabel = new Map([['bucket-aaa', 'Bucket A']]);

    await persistResourceMappings({
      cardId: 'card-1',
      result,
      findSourceNodeId,
      nameToLabel,
      environment: 'development',
    });

    expect(result.resources[0].source_node_id).toBe('node-A');
    expect(upsertResourceMapping).toHaveBeenCalledTimes(1);
    expect(upsertResourceMapping).toHaveBeenCalledWith({
      cardId: 'card-1',
      nodeId: 'node-A',
      environment: 'development',
      resourceType: 'gcp.storage.bucket',
      resourceName: 'bucket-aaa',
      providerId: 'pid-1',
    });
  });

  it('skips upsert when findSourceNodeId returns undefined', async () => {
    const { persistResourceMappings } = await getHelpers();
    const result = {
      resources: [{ name: 'bucket-aaa', type: 'gcp.storage.bucket', success: true, provider_id: 'pid-1' }],
    };
    const findSourceNodeId = vi.fn().mockReturnValue(undefined);
    const nameToLabel = new Map();

    await persistResourceMappings({
      cardId: 'card-1',
      result,
      findSourceNodeId,
      nameToLabel,
      environment: 'development',
    });

    expect(result.resources[0].source_node_id).toBeUndefined();
    expect(upsertResourceMapping).not.toHaveBeenCalled();
  });

  it('does not throw when upsert rejects (best-effort)', async () => {
    const { persistResourceMappings } = await getHelpers();
    upsertResourceMapping.mockRejectedValueOnce(new Error('db down'));
    const result = {
      resources: [{ name: 'bucket-aaa', type: 'gcp.storage.bucket', success: true, provider_id: 'pid-1' }],
    };
    await expect(
      persistResourceMappings({
        cardId: 'card-1',
        result,
        findSourceNodeId: () => 'node-A',
        nameToLabel: new Map(),
        environment: 'development',
      }),
    ).resolves.toBeUndefined();
  });
});

describe('logSourceRepoDiagnostics', () => {
  it('logs an EMPTY-repository line for repos missing the field', async () => {
    const { logSourceRepoDiagnostics } = await getHelpers();
    const nodes = [{ id: 'node-12345678', data: { iceType: 'Source.Repository', repository: '' } }];
    logSourceRepoDiagnostics('card-1', nodes, []);
    expect(emitLog.mock.calls.some(([_, msg]) => String(msg).includes('EMPTY repository'))).toBe(true);
  });

  it('logs a NO-targets line for repos with no connected edges', async () => {
    const { logSourceRepoDiagnostics } = await getHelpers();
    const nodes = [
      { id: 'node-12345678', data: { iceType: 'Source.Repository', repository: 'org/repo', branch: 'main' } },
    ];
    logSourceRepoDiagnostics('card-1', nodes, []);
    expect(emitLog.mock.calls.some(([_, msg]) => String(msg).includes('NO connected targets'))).toBe(true);
  });

  it('logs a connected-targets line when edges resolve', async () => {
    const { logSourceRepoDiagnostics } = await getHelpers();
    const nodes = [
      { id: 'src-12345678', data: { iceType: 'Source.Repository', repository: 'org/repo', branch: 'main' } },
      { id: 'cmp-12345678', data: { iceType: 'Compute.Run', label: 'Backend' } },
    ];
    const edges = [{ id: 'e1', source: 'src-12345678', target: 'cmp-12345678' }];
    logSourceRepoDiagnostics('card-1', nodes, edges);
    expect(emitLog.mock.calls.some(([_, msg]) => String(msg).includes('Backend'))).toBe(true);
  });

  it('does not throw when nodes is malformed', async () => {
    const { logSourceRepoDiagnostics } = await getHelpers();
    expect(() => logSourceRepoDiagnostics('card-1', null as any, null as any)).not.toThrow();
  });
});

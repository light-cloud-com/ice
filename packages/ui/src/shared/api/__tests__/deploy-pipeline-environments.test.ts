/**
 * Tests for the `deploy` / `pipeline` / `environments` HTTP adapter
 * domains extracted in rf-httpapi-5.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

(globalThis as any).window = (globalThis as any).window || {
  location: { origin: 'http://localhost:3000' },
  open: vi.fn(),
};
(globalThis as any).localStorage = (globalThis as any).localStorage || {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

const mockAxios = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

vi.mock('../axios-instance', () => ({ default: mockAxios }));

beforeEach(() => {
  mockAxios.get.mockReset();
  mockAxios.post.mockReset();
  mockAxios.put.mockReset();
  mockAxios.delete.mockReset();
});

// ─── deploy adapter ─────────────────────────────────────────────────────────

describe('http-api/deploy', () => {
  it('plan() POSTs /canvas/deploy/plan with cardId/nodes/edges/options', async () => {
    mockAxios.post.mockResolvedValueOnce({ data: { plan: 'p' } });
    const { createDeployAdapter } = await import('../http-api/deploy');
    const a = createDeployAdapter();
    await a.plan('c1', [{ id: 'n1' }], [{ id: 'e1' }], { dryRun: true });
    expect(mockAxios.post).toHaveBeenCalledWith('/canvas/deploy/plan', {
      cardId: 'c1',
      nodes: [{ id: 'n1' }],
      edges: [{ id: 'e1' }],
      options: { dryRun: true },
    });
  });

  it('apply() POSTs /canvas/deploy/apply', async () => {
    mockAxios.post.mockResolvedValueOnce({ data: {} });
    const { createDeployAdapter } = await import('../http-api/deploy');
    const a = createDeployAdapter();
    await a.apply('c1', [], [], { gcpProject: 'p1' });
    expect(mockAxios.post).toHaveBeenCalledWith('/canvas/deploy/apply', {
      cardId: 'c1',
      nodes: [],
      edges: [],
      options: { gcpProject: 'p1' },
    });
  });

  it('destroy() POSTs /canvas/deploy/destroy', async () => {
    mockAxios.post.mockResolvedValueOnce({ data: {} });
    const { createDeployAdapter } = await import('../http-api/deploy');
    const a = createDeployAdapter();
    await a.destroy('c1', { force: true });
    expect(mockAxios.post).toHaveBeenCalledWith('/canvas/deploy/destroy', { cardId: 'c1', options: { force: true } });
  });

  it('destroyAll() POSTs /canvas/deploy/destroy-all and forwards gcpProject', async () => {
    mockAxios.post.mockResolvedValueOnce({ data: {} });
    const { createDeployAdapter } = await import('../http-api/deploy');
    const a = createDeployAdapter();
    await a.destroyAll('c1', { gcpProject: 'p1' });
    expect(mockAxios.post).toHaveBeenCalledWith('/canvas/deploy/destroy-all', {
      cardId: 'c1',
      gcpProject: 'p1',
    });

    mockAxios.post.mockResolvedValueOnce({ data: {} });
    await a.destroyAll('c2');
    expect(mockAxios.post).toHaveBeenLastCalledWith('/canvas/deploy/destroy-all', {
      cardId: 'c2',
      gcpProject: undefined,
    });
  });

  it('getStatus() GETs /canvas/deploy/status/<id>', async () => {
    mockAxios.get.mockResolvedValueOnce({ data: { status: 'ok' } });
    const { createDeployAdapter } = await import('../http-api/deploy');
    const a = createDeployAdapter();
    await a.getStatus('d1');
    expect(mockAxios.get).toHaveBeenCalledWith('/canvas/deploy/status/d1');
  });

  it('authenticate() resolves { success: true } without a network call', async () => {
    const { createDeployAdapter } = await import('../http-api/deploy');
    const a = createDeployAdapter();
    expect(await a.authenticate()).toEqual({ success: true });
    expect(mockAxios.post).not.toHaveBeenCalled();
  });

  it('getResources() / getDeployments() / getCurrentDeploy() use card-keyed paths', async () => {
    mockAxios.get.mockResolvedValue({ data: [] });
    const { createDeployAdapter } = await import('../http-api/deploy');
    const a = createDeployAdapter();
    await a.getResources('c1');
    expect(mockAxios.get).toHaveBeenCalledWith('/canvas/deploy/resources/c1');
    await a.getDeployments('c2');
    expect(mockAxios.get).toHaveBeenLastCalledWith('/canvas/deploy/history/c2');
    await a.getCurrentDeploy('c3');
    expect(mockAxios.get).toHaveBeenLastCalledWith('/canvas/deploy/current/c3');
  });

  it('requirements() POSTs /canvas/deploy/requirements with cardId/nodes/options', async () => {
    mockAxios.post.mockResolvedValueOnce({ data: [] });
    const { createDeployAdapter } = await import('../http-api/deploy');
    const a = createDeployAdapter();
    await a.requirements('c1', [{ id: 'n1' }], { gcpProject: 'p1' });
    expect(mockAxios.post).toHaveBeenCalledWith('/canvas/deploy/requirements', {
      cardId: 'c1',
      nodes: [{ id: 'n1' }],
      options: { gcpProject: 'p1' },
    });
  });

  it('getDeployStream() GETs /canvas/deploy/stream/<id> with `since` and optional deployment_id', async () => {
    mockAxios.get.mockResolvedValue({ data: [] });
    const { createDeployAdapter } = await import('../http-api/deploy');
    const a = createDeployAdapter();
    await a.getDeployStream('c1');
    expect(mockAxios.get).toHaveBeenCalledWith('/canvas/deploy/stream/c1', { params: { since: 0 } });
    await a.getDeployStream('c1', 7);
    expect(mockAxios.get).toHaveBeenLastCalledWith('/canvas/deploy/stream/c1', { params: { since: 7 } });
    await a.getDeployStream('c1', 7, 'd1');
    expect(mockAxios.get).toHaveBeenLastCalledWith('/canvas/deploy/stream/c1', {
      params: { since: 7, deployment_id: 'd1' },
    });
  });

  it('getNodeOutputs() GETs /canvas/deploy/node-outputs/<id> with optional environment param', async () => {
    mockAxios.get.mockResolvedValue({ data: {} });
    const { createDeployAdapter } = await import('../http-api/deploy');
    const a = createDeployAdapter();
    await a.getNodeOutputs('c1');
    expect(mockAxios.get).toHaveBeenCalledWith('/canvas/deploy/node-outputs/c1', { params: undefined });
    await a.getNodeOutputs('c1', 'staging');
    expect(mockAxios.get).toHaveBeenLastCalledWith('/canvas/deploy/node-outputs/c1', {
      params: { environment: 'staging' },
    });
  });

  it('cleanupOrphans() POSTs /canvas/deploy/cleanup-orphans, defaulting to {} when no args', async () => {
    mockAxios.post.mockResolvedValue({ data: {} });
    const { createDeployAdapter } = await import('../http-api/deploy');
    const a = createDeployAdapter();
    await a.cleanupOrphans();
    expect(mockAxios.post).toHaveBeenCalledWith('/canvas/deploy/cleanup-orphans', {});
    await a.cleanupOrphans({ gcpProject: 'p1', dryRun: true });
    expect(mockAxios.post).toHaveBeenLastCalledWith('/canvas/deploy/cleanup-orphans', {
      gcpProject: 'p1',
      dryRun: true,
    });
  });

  it('openExternal() forwards to window.open with safe defaults', async () => {
    const { createDeployAdapter } = await import('../http-api/deploy');
    const a = createDeployAdapter();
    a.openExternal('http://example.com');
    expect((globalThis as any).window.open).toHaveBeenCalledWith(
      'http://example.com',
      '_blank',
      'noopener,noreferrer',
    );
  });
});

// ─── pipeline adapter ───────────────────────────────────────────────────────

describe('http-api/pipeline', () => {
  it('getRules() GETs /pipeline/rules/<cardId>/<nodeId>', async () => {
    mockAxios.get.mockResolvedValueOnce({ data: [] });
    const { createPipelineAdapter } = await import('../http-api/pipeline');
    const a = createPipelineAdapter();
    await a.getRules('c1', 'n1');
    expect(mockAxios.get).toHaveBeenCalledWith('/pipeline/rules/c1/n1');
  });

  it('createRule() POSTs /pipeline/rules with the input', async () => {
    mockAxios.post.mockResolvedValueOnce({ data: { id: 'r1' } });
    const { createPipelineAdapter } = await import('../http-api/pipeline');
    const a = createPipelineAdapter();
    await a.createRule({ name: 'auto', branch: 'main' });
    expect(mockAxios.post).toHaveBeenCalledWith('/pipeline/rules', { name: 'auto', branch: 'main' });
  });

  it('updateRule() PUTs /pipeline/rules/<id> with updates', async () => {
    mockAxios.put.mockResolvedValueOnce({ data: {} });
    const { createPipelineAdapter } = await import('../http-api/pipeline');
    const a = createPipelineAdapter();
    await a.updateRule('r1', { active: false });
    expect(mockAxios.put).toHaveBeenCalledWith('/pipeline/rules/r1', { active: false });
  });

  it('deleteRule() DELETEs /pipeline/rules/<id>', async () => {
    mockAxios.delete.mockResolvedValueOnce({ data: {} });
    const { createPipelineAdapter } = await import('../http-api/pipeline');
    const a = createPipelineAdapter();
    await a.deleteRule('r1');
    expect(mockAxios.delete).toHaveBeenCalledWith('/pipeline/rules/r1');
  });

  it('getEvents() GETs /pipeline/events/<cardId>/<nodeId>', async () => {
    mockAxios.get.mockResolvedValueOnce({ data: [] });
    const { createPipelineAdapter } = await import('../http-api/pipeline');
    const a = createPipelineAdapter();
    await a.getEvents('c1', 'n1');
    expect(mockAxios.get).toHaveBeenCalledWith('/pipeline/events/c1/n1');
  });

  it('detectFramework() POSTs /pipeline/detect-framework with repository + branch', async () => {
    mockAxios.post.mockResolvedValueOnce({ data: {} });
    const { createPipelineAdapter } = await import('../http-api/pipeline');
    const a = createPipelineAdapter();
    await a.detectFramework('octocat/hello', 'main');
    expect(mockAxios.post).toHaveBeenCalledWith('/pipeline/detect-framework', {
      repository: 'octocat/hello',
      branch: 'main',
    });
  });

  it('triggerDeploy() POSTs /pipeline/trigger with ruleId + optional branch', async () => {
    mockAxios.post.mockResolvedValueOnce({ data: {} });
    const { createPipelineAdapter } = await import('../http-api/pipeline');
    const a = createPipelineAdapter();
    await a.triggerDeploy('r1', 'main');
    expect(mockAxios.post).toHaveBeenCalledWith('/pipeline/trigger', { ruleId: 'r1', branch: 'main' });
  });

  it('retryDeploy() POSTs /pipeline/retry with eventId', async () => {
    mockAxios.post.mockResolvedValueOnce({ data: {} });
    const { createPipelineAdapter } = await import('../http-api/pipeline');
    const a = createPipelineAdapter();
    await a.retryDeploy('e1');
    expect(mockAxios.post).toHaveBeenCalledWith('/pipeline/retry', { eventId: 'e1' });
  });

  it('cancelDeploy() POSTs /pipeline/cancel with eventId', async () => {
    mockAxios.post.mockResolvedValueOnce({ data: {} });
    const { createPipelineAdapter } = await import('../http-api/pipeline');
    const a = createPipelineAdapter();
    await a.cancelDeploy('e1');
    expect(mockAxios.post).toHaveBeenCalledWith('/pipeline/cancel', { eventId: 'e1' });
  });
});

// ─── environments adapter ───────────────────────────────────────────────────

describe('http-api/environments', () => {
  it('list() POSTs /environments/list', async () => {
    mockAxios.post.mockResolvedValueOnce({ data: [] });
    const { createEnvironmentsAdapter } = await import('../http-api/environments');
    const a = createEnvironmentsAdapter();
    await a.list('p1');
    expect(mockAxios.post).toHaveBeenCalledWith('/environments/list', { projectId: 'p1' });
  });

  it('create() POSTs /environments/create with the full input', async () => {
    mockAxios.post.mockResolvedValueOnce({ data: { id: 'e1' } });
    const { createEnvironmentsAdapter } = await import('../http-api/environments');
    const a = createEnvironmentsAdapter();
    await a.create({ projectId: 'p1', name: 'staging', type: 'cloud', region: 'us-east-1' });
    expect(mockAxios.post).toHaveBeenCalledWith('/environments/create', {
      projectId: 'p1',
      name: 'staging',
      type: 'cloud',
      region: 'us-east-1',
    });
  });

  it('update() POSTs /environments/update with envId + spread fields', async () => {
    mockAxios.post.mockResolvedValueOnce({ data: {} });
    const { createEnvironmentsAdapter } = await import('../http-api/environments');
    const a = createEnvironmentsAdapter();
    await a.update('e1', { name: 'prod', region: 'us-east-1' });
    expect(mockAxios.post).toHaveBeenCalledWith('/environments/update', {
      envId: 'e1',
      name: 'prod',
      region: 'us-east-1',
    });
  });

  it('delete() POSTs /environments/delete with envId', async () => {
    mockAxios.post.mockResolvedValueOnce({ data: {} });
    const { createEnvironmentsAdapter } = await import('../http-api/environments');
    const a = createEnvironmentsAdapter();
    await a.delete('e1');
    expect(mockAxios.post).toHaveBeenCalledWith('/environments/delete', { envId: 'e1' });
  });

  it('compare() / promote() POST with sourceEnvId + targetEnvId', async () => {
    mockAxios.post.mockResolvedValue({ data: {} });
    const { createEnvironmentsAdapter } = await import('../http-api/environments');
    const a = createEnvironmentsAdapter();
    await a.compare('e1', 'e2');
    expect(mockAxios.post).toHaveBeenCalledWith('/environments/compare', { sourceEnvId: 'e1', targetEnvId: 'e2' });
    await a.promote('e1', 'e2');
    expect(mockAxios.post).toHaveBeenLastCalledWith('/environments/promote', {
      sourceEnvId: 'e1',
      targetEnvId: 'e2',
    });
  });

  it('togglePrPreviews() POSTs /environments/pr-previews', async () => {
    mockAxios.post.mockResolvedValueOnce({ data: {} });
    const { createEnvironmentsAdapter } = await import('../http-api/environments');
    const a = createEnvironmentsAdapter();
    await a.togglePrPreviews('p1', true);
    expect(mockAxios.post).toHaveBeenCalledWith('/environments/pr-previews', { projectId: 'p1', enabled: true });
  });
});

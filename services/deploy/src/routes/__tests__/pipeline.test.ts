/**
 * HTTP tests for the Pipeline router (`/api/pipeline/...`).
 *
 * Same in-process pattern as `logs.test.ts`: boot Express on an ephemeral
 * port and hit it with `fetch`. The pipeline service module, the deploy
 * queue, and the prisma client (`@ice/db`) are mocked at their module
 * boundaries. Auth (`requireAuth`, `requireProjectAccess`) is a shim so
 * each test dials in the auth outcome it cares about.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

// ── Pipeline service mocks ────────────────────────────────────────────

const getRulesForNodeMock = vi.fn();
const createRuleMock = vi.fn();
const updateRuleMock = vi.fn();
const deleteRuleMock = vi.fn();
const getEventsForNodeMock = vi.fn();
const detectFrameworkMock = vi.fn();
const createDeploymentEventMock = vi.fn();
const updateEventProgressMock = vi.fn();

vi.mock('../../services/pipeline.service', () => ({
  getRulesForNode: (...args: unknown[]) => getRulesForNodeMock(...args),
  createRule: (...args: unknown[]) => createRuleMock(...args),
  updateRule: (...args: unknown[]) => updateRuleMock(...args),
  deleteRule: (...args: unknown[]) => deleteRuleMock(...args),
  getEventsForNode: (...args: unknown[]) => getEventsForNodeMock(...args),
  detectFramework: (...args: unknown[]) => detectFrameworkMock(...args),
  createDeploymentEvent: (...args: unknown[]) => createDeploymentEventMock(...args),
  updateEventProgress: (...args: unknown[]) => updateEventProgressMock(...args),
}));

// ── Queue mock ────────────────────────────────────────────────────────

const queueAddMock = vi.fn();
const getDeployQueueMock = vi.fn(() => ({ add: queueAddMock }));

vi.mock('../../services/queue.service', () => ({
  getDeployQueue: () => getDeployQueueMock(),
}));

// ── Prisma mock (for resolveRuleToCard / resolveEventToCard / /trigger / /retry) ─

const ruleFindUniqueMock = vi.fn();
const eventFindUniqueMock = vi.fn();

vi.mock('@ice/db', () => ({
  default: {
    deploymentRule: { findUnique: (...args: unknown[]) => ruleFindUniqueMock(...args) },
    deploymentEvent: { findUnique: (...args: unknown[]) => eventFindUniqueMock(...args) },
  },
}));

// ── Auth shim ─────────────────────────────────────────────────────────

type AuthMode = 'allow' | 'no-auth' | 'no-project-access' | 'no-org';
let currentAuth: AuthMode = 'allow';
let currentUserId: string | undefined = 'user-1';
let currentOrgId: string | undefined = 'org-real';

vi.mock('@ice/shared', () => ({
  requireAuth: (req: any, res: any, next: any) => {
    if (currentAuth === 'no-auth') {
      return res.status(401).json({ message: 'Missing authorization token' });
    }
    req.userId = currentUserId;
    req.organisationId = currentAuth === 'no-org' ? undefined : currentOrgId;
    next();
  },
  requireProjectAccess:
    (_role: string) =>
    (_req: any, res: any, next: any) => {
      if (currentAuth === 'no-project-access') {
        return res.status(403).json({ message: 'Insufficient project permissions' });
      }
      next();
    },
}));

// ── Test harness ──────────────────────────────────────────────────────

let server: http.Server;
let baseUrl: string;

beforeEach(async () => {
  vi.clearAllMocks();
  currentAuth = 'allow';
  currentUserId = 'user-1';
  currentOrgId = 'org-real';

  // The SUT's `/rules` POST handler logs to console.error on service throw.
  vi.spyOn(console, 'error').mockImplementation(() => {});

  const { default: pipelineRouter } = await import('../pipeline');
  const app = express();
  app.use(express.json());
  app.use('/api/pipeline', pipelineRouter);

  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  vi.restoreAllMocks();
});

// ── HTTP helpers ──────────────────────────────────────────────────────

async function request(method: string, path: string, body?: unknown) {
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(`${baseUrl}${path}`, init);
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json, raw: text };
}

const get = (p: string) => request('GET', p);
const post = (p: string, b?: unknown) => request('POST', p, b);
const put = (p: string, b?: unknown) => request('PUT', p, b);
const del = (p: string, b?: unknown) => request('DELETE', p, b);

// ── GET /rules/:cardId/:nodeId ────────────────────────────────────────

describe('GET /api/pipeline/rules/:cardId/:nodeId', () => {
  it('returns 200 with the rules list and forwards path params to the service', async () => {
    const rules = [{ id: 'r1', card_id: 'c1', node_id: 'n1' }];
    getRulesForNodeMock.mockResolvedValue(rules);

    const res = await get('/api/pipeline/rules/c1/n1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, rules });
    expect(getRulesForNodeMock).toHaveBeenCalledWith('c1', 'n1');
  });

  it('returns 500 with the error envelope when the service throws', async () => {
    getRulesForNodeMock.mockRejectedValue(new Error('db down'));

    const res = await get('/api/pipeline/rules/c1/n1');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'db down' });
  });

  it('returns 401 when requireAuth rejects (router-level guard)', async () => {
    currentAuth = 'no-auth';
    const res = await get('/api/pipeline/rules/c1/n1');
    expect(res.status).toBe(401);
    expect(getRulesForNodeMock).not.toHaveBeenCalled();
  });

  it('returns 403 when requireProjectAccess rejects', async () => {
    currentAuth = 'no-project-access';
    const res = await get('/api/pipeline/rules/c1/n1');
    expect(res.status).toBe(403);
    expect(getRulesForNodeMock).not.toHaveBeenCalled();
  });
});

// ── POST /rules ───────────────────────────────────────────────────────

const validCreateBody = {
  cardId: 'c1',
  nodeId: 'n1',
  repository: 'owner/repo',
  branch_pattern: 'main',
};

describe('POST /api/pipeline/rules', () => {
  it('returns 200 with the created rule and forwards organisationId/userId from auth', async () => {
    const rule = { id: 'r1', ...validCreateBody };
    createRuleMock.mockResolvedValue(rule);

    const res = await post('/api/pipeline/rules', validCreateBody);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, rule });
    expect(createRuleMock).toHaveBeenCalledWith(validCreateBody, 'org-real', 'user-1');
  });

  it('returns 400 listing every missing field when cardId, nodeId and repository are all absent', async () => {
    const res = await post('/api/pipeline/rules', {});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('cardId');
    expect(res.body.error).toContain('nodeId');
    expect(res.body.error).toContain('repository');
    expect(createRuleMock).not.toHaveBeenCalled();
  });

  it('returns 400 mentioning only the missing field when one is absent', async () => {
    const { repository: _omit, ...rest } = validCreateBody;
    const res = await post('/api/pipeline/rules', rest);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('repository');
    expect(res.body.error).not.toContain('cardId');
    expect(res.body.error).not.toContain('nodeId');
  });

  it('returns 400 mentioning only cardId when only cardId is missing', async () => {
    const { cardId: _omit, ...rest } = validCreateBody;
    const res = await post('/api/pipeline/rules', rest);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('cardId');
    expect(res.body.error).not.toContain('nodeId');
    expect(res.body.error).not.toContain('repository');
  });

  it('returns 400 mentioning only nodeId when only nodeId is missing', async () => {
    const { nodeId: _omit, ...rest } = validCreateBody;
    const res = await post('/api/pipeline/rules', rest);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('nodeId');
    expect(res.body.error).not.toContain('cardId');
    expect(res.body.error).not.toContain('repository');
  });

  it('returns 400 with an organisation context message when auth has no organisationId', async () => {
    currentAuth = 'no-org';
    const res = await post('/api/pipeline/rules', validCreateBody);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/organisation/i);
    expect(createRuleMock).not.toHaveBeenCalled();
  });

  it('returns 400 with the service error message and logs on console when the service throws', async () => {
    createRuleMock.mockRejectedValue(new Error('webhook registration failed'));

    const res = await post('/api/pipeline/rules', validCreateBody);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'webhook registration failed' });
    expect(console.error).toHaveBeenCalled();
  });

  it('returns 403 when requireProjectAccess rejects', async () => {
    currentAuth = 'no-project-access';
    const res = await post('/api/pipeline/rules', validCreateBody);
    expect(res.status).toBe(403);
    expect(createRuleMock).not.toHaveBeenCalled();
  });
});

// ── PUT /rules/:ruleId ────────────────────────────────────────────────

describe('PUT /api/pipeline/rules/:ruleId', () => {
  it('returns 200 with the updated rule and forwards ruleId, body, organisationId', async () => {
    ruleFindUniqueMock.mockResolvedValue({ card_id: 'c1' });
    updateRuleMock.mockResolvedValue({ id: 'r1', branch_pattern: 'develop' });

    const res = await put('/api/pipeline/rules/r1', { branch_pattern: 'develop' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.rule).toEqual({ id: 'r1', branch_pattern: 'develop' });
    // updateRule receives the body merged with the cardId injected by middleware
    expect(updateRuleMock).toHaveBeenCalledWith(
      'r1',
      expect.objectContaining({ branch_pattern: 'develop', cardId: 'c1' }),
      'org-real',
    );
  });

  it('does not inject cardId when the rule lookup returns null', async () => {
    ruleFindUniqueMock.mockResolvedValue(null);
    updateRuleMock.mockResolvedValue({ id: 'r1' });

    await put('/api/pipeline/rules/r1', { branch_pattern: 'develop' });

    const callArg = updateRuleMock.mock.calls[0][1];
    expect(callArg.cardId).toBeUndefined();
  });

  it('preserves an explicit cardId in the body without re-querying prisma', async () => {
    updateRuleMock.mockResolvedValue({ id: 'r1' });

    await put('/api/pipeline/rules/r1', { cardId: 'c-explicit', name: 'x' });

    expect(ruleFindUniqueMock).not.toHaveBeenCalled();
    const callArg = updateRuleMock.mock.calls[0][1];
    expect(callArg.cardId).toBe('c-explicit');
  });

  it('returns 400 with the service error message when updateRule throws', async () => {
    ruleFindUniqueMock.mockResolvedValue({ card_id: 'c1' });
    updateRuleMock.mockRejectedValue(new Error('rule not found'));

    const res = await put('/api/pipeline/rules/r1', {});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'rule not found' });
  });

  it('returns 403 when requireProjectAccess rejects', async () => {
    currentAuth = 'no-project-access';
    ruleFindUniqueMock.mockResolvedValue({ card_id: 'c1' });
    const res = await put('/api/pipeline/rules/r1', { branch_pattern: 'main' });
    expect(res.status).toBe(403);
    expect(updateRuleMock).not.toHaveBeenCalled();
  });
});

// ── DELETE /rules/:ruleId ─────────────────────────────────────────────

describe('DELETE /api/pipeline/rules/:ruleId', () => {
  it('returns 200 and forwards ruleId, userId, organisationId to deleteRule', async () => {
    ruleFindUniqueMock.mockResolvedValue({ card_id: 'c1' });
    deleteRuleMock.mockResolvedValue(undefined);

    const res = await del('/api/pipeline/rules/r1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(deleteRuleMock).toHaveBeenCalledWith('r1', 'user-1', 'org-real');
  });

  it('returns 400 with the error envelope when deleteRule throws', async () => {
    ruleFindUniqueMock.mockResolvedValue({ card_id: 'c1' });
    deleteRuleMock.mockRejectedValue(new Error('insufficient permissions'));

    const res = await del('/api/pipeline/rules/r1');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'insufficient permissions' });
  });

  it('returns 403 when requireProjectAccess (owner role) rejects', async () => {
    currentAuth = 'no-project-access';
    ruleFindUniqueMock.mockResolvedValue({ card_id: 'c1' });
    const res = await del('/api/pipeline/rules/r1');
    expect(res.status).toBe(403);
    expect(deleteRuleMock).not.toHaveBeenCalled();
  });
});

// ── GET /events/:cardId/:nodeId ───────────────────────────────────────

describe('GET /api/pipeline/events/:cardId/:nodeId', () => {
  it('returns 200 with the events list', async () => {
    const events = [{ id: 'e1', status: 'success' }];
    getEventsForNodeMock.mockResolvedValue(events);

    const res = await get('/api/pipeline/events/c1/n1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, events });
    expect(getEventsForNodeMock).toHaveBeenCalledWith('c1', 'n1');
  });

  it('returns 500 when the service throws', async () => {
    getEventsForNodeMock.mockRejectedValue(new Error('boom'));

    const res = await get('/api/pipeline/events/c1/n1');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'boom' });
  });

  it('returns 403 when requireProjectAccess rejects', async () => {
    currentAuth = 'no-project-access';
    const res = await get('/api/pipeline/events/c1/n1');
    expect(res.status).toBe(403);
    expect(getEventsForNodeMock).not.toHaveBeenCalled();
  });
});

// ── POST /detect-framework ────────────────────────────────────────────

describe('POST /api/pipeline/detect-framework', () => {
  it('returns 200 with the detection and forwards userId, repository, branch', async () => {
    const detection = { framework: 'next', buildCommand: 'next build' };
    detectFrameworkMock.mockResolvedValue(detection);

    const res = await post('/api/pipeline/detect-framework', {
      repository: 'owner/repo',
      branch: 'develop',
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, detection });
    expect(detectFrameworkMock).toHaveBeenCalledWith('user-1', 'owner/repo', 'develop');
  });

  it('forwards undefined branch when the body omits it', async () => {
    detectFrameworkMock.mockResolvedValue({ framework: 'static' });

    const res = await post('/api/pipeline/detect-framework', { repository: 'owner/repo' });

    expect(res.status).toBe(200);
    expect(detectFrameworkMock).toHaveBeenCalledWith('user-1', 'owner/repo', undefined);
  });

  it('returns 400 when repository is missing', async () => {
    const res = await post('/api/pipeline/detect-framework', {});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'repository is required' });
    expect(detectFrameworkMock).not.toHaveBeenCalled();
  });

  it('returns 400 with the service error message when detection throws', async () => {
    detectFrameworkMock.mockRejectedValue(new Error('GitHub auth required'));

    const res = await post('/api/pipeline/detect-framework', { repository: 'owner/repo' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'GitHub auth required' });
  });

  it('returns 401 at the router-level guard when requireAuth rejects', async () => {
    currentAuth = 'no-auth';
    const res = await post('/api/pipeline/detect-framework', { repository: 'owner/repo' });
    expect(res.status).toBe(401);
    expect(detectFrameworkMock).not.toHaveBeenCalled();
  });
});

// ── POST /trigger ─────────────────────────────────────────────────────

describe('POST /api/pipeline/trigger', () => {
  const fullRule = {
    id: 'r1',
    card_id: 'c1',
    node_id: 'n1',
    repository: 'owner/repo',
    branch_pattern: 'main',
    environment: 'production',
    build_command: 'npm run build',
    install_command: 'npm ci',
    output_dir: 'dist',
    framework: 'next',
  };

  it('returns 200 with the event, queues the pipeline job with the full payload', async () => {
    ruleFindUniqueMock.mockResolvedValue(fullRule);
    createDeploymentEventMock.mockResolvedValue({ id: 'e1' });
    queueAddMock.mockResolvedValue(undefined);

    const res = await post('/api/pipeline/trigger', {
      ruleId: 'r1',
      commitSha: 'sha-abc',
      branch: 'develop',
      commitMessage: 'fix: thing',
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, event: { id: 'e1' } });
    expect(createDeploymentEventMock).toHaveBeenCalledWith(
      'r1',
      'manual',
      'sha-abc',
      'develop',
      'fix: thing',
      'user-1',
    );
    expect(queueAddMock).toHaveBeenCalledTimes(1);
    const [jobName, payload, opts] = queueAddMock.mock.calls[0];
    expect(jobName).toBe('pipeline');
    expect(payload).toMatchObject({
      type: 'pipeline',
      eventId: 'e1',
      ruleId: 'r1',
      cardId: 'c1',
      nodeId: 'n1',
      repository: 'owner/repo',
      branch: 'develop',
      commitSha: 'sha-abc',
      commitMessage: 'fix: thing',
      commitAuthor: 'user-1',
      environment: 'production',
      buildCommand: 'npm run build',
      installCommand: 'npm ci',
      outputDir: 'dist',
      framework: 'next',
    });
    expect(opts).toEqual({ attempts: 1, removeOnComplete: 100, removeOnFail: 100 });
  });

  it('falls back to HEAD/main/"Manual deploy" when commitSha/branch/commitMessage are omitted', async () => {
    ruleFindUniqueMock.mockResolvedValue(fullRule);
    createDeploymentEventMock.mockResolvedValue({ id: 'e2' });
    queueAddMock.mockResolvedValue(undefined);

    await post('/api/pipeline/trigger', { ruleId: 'r1' });

    expect(createDeploymentEventMock).toHaveBeenCalledWith(
      'r1',
      'manual',
      'HEAD',
      'main',
      'Manual deploy',
      'user-1',
    );
    const payload = queueAddMock.mock.calls[0][1];
    // branch falls back to rule.branch_pattern when body branch is absent
    expect(payload.branch).toBe('main');
    expect(payload.commitSha).toBe('HEAD');
    expect(payload.commitMessage).toBe('Manual deploy');
  });

  it('returns 400 when ruleId is missing from the body', async () => {
    const res = await post('/api/pipeline/trigger', {});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'ruleId is required' });
    expect(createDeploymentEventMock).not.toHaveBeenCalled();
    expect(queueAddMock).not.toHaveBeenCalled();
  });

  it('returns 404 when prisma cannot find the rule', async () => {
    ruleFindUniqueMock.mockResolvedValueOnce({ card_id: 'c1' }); // resolveRuleToCard hit
    ruleFindUniqueMock.mockResolvedValueOnce(null); // handler-level lookup
    createDeploymentEventMock.mockResolvedValue({ id: 'e1' });

    const res = await post('/api/pipeline/trigger', { ruleId: 'r1' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, error: 'Rule not found' });
    expect(queueAddMock).not.toHaveBeenCalled();
  });

  it('returns 500 when createDeploymentEvent throws', async () => {
    ruleFindUniqueMock.mockResolvedValue(fullRule);
    createDeploymentEventMock.mockRejectedValue(new Error('db unavailable'));

    const res = await post('/api/pipeline/trigger', { ruleId: 'r1' });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'db unavailable' });
    expect(queueAddMock).not.toHaveBeenCalled();
  });

  it('returns 500 when the queue.add call rejects', async () => {
    ruleFindUniqueMock.mockResolvedValue(fullRule);
    createDeploymentEventMock.mockResolvedValue({ id: 'e1' });
    queueAddMock.mockRejectedValue(new Error('redis offline'));

    const res = await post('/api/pipeline/trigger', { ruleId: 'r1' });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'redis offline' });
  });

  it('returns 403 when requireProjectAccess rejects', async () => {
    currentAuth = 'no-project-access';
    ruleFindUniqueMock.mockResolvedValue({ card_id: 'c1' });
    const res = await post('/api/pipeline/trigger', { ruleId: 'r1' });
    expect(res.status).toBe(403);
    expect(createDeploymentEventMock).not.toHaveBeenCalled();
  });
});

// ── POST /retry ───────────────────────────────────────────────────────

describe('POST /api/pipeline/retry', () => {
  const failedEvent = {
    id: 'e-old',
    status: 'failed',
    commit_sha: 'sha-old',
    branch: 'main',
    commit_message: 'original commit',
    rule: {
      id: 'r1',
      card_id: 'c1',
      node_id: 'n1',
      repository: 'owner/repo',
      environment: 'production',
      build_command: 'npm run build',
      install_command: 'npm ci',
      output_dir: 'dist',
      framework: 'next',
    },
  };

  it('returns 200, creates a manual retry event, and queues a pipeline job', async () => {
    eventFindUniqueMock.mockResolvedValue(failedEvent);
    createDeploymentEventMock.mockResolvedValue({ id: 'e-new' });
    queueAddMock.mockResolvedValue(undefined);

    const res = await post('/api/pipeline/retry', { eventId: 'e-old' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, event: { id: 'e-new' } });
    expect(createDeploymentEventMock).toHaveBeenCalledWith(
      'r1',
      'manual',
      'sha-old',
      'main',
      'Retry: original commit',
      'user-1',
    );
    expect(queueAddMock).toHaveBeenCalledTimes(1);
    const [jobName, payload, opts] = queueAddMock.mock.calls[0];
    expect(jobName).toBe('pipeline');
    expect(payload).toMatchObject({
      type: 'pipeline',
      eventId: 'e-new',
      ruleId: 'r1',
      cardId: 'c1',
      nodeId: 'n1',
      repository: 'owner/repo',
      branch: 'main',
      commitSha: 'sha-old',
      environment: 'production',
      buildCommand: 'npm run build',
      installCommand: 'npm ci',
      outputDir: 'dist',
      framework: 'next',
    });
    expect(opts).toEqual({ attempts: 1, removeOnComplete: 100, removeOnFail: 100 });
  });

  it('uses an empty string when the original commit_message is null', async () => {
    eventFindUniqueMock.mockResolvedValue({ ...failedEvent, commit_message: null });
    createDeploymentEventMock.mockResolvedValue({ id: 'e-new' });
    queueAddMock.mockResolvedValue(undefined);

    await post('/api/pipeline/retry', { eventId: 'e-old' });

    expect(createDeploymentEventMock).toHaveBeenCalledWith(
      'r1',
      'manual',
      'sha-old',
      'main',
      'Retry: ',
      'user-1',
    );
  });

  it('returns 400 when eventId is missing from the body', async () => {
    const res = await post('/api/pipeline/retry', {});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'eventId is required' });
    expect(eventFindUniqueMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the event is not found', async () => {
    eventFindUniqueMock.mockResolvedValueOnce(null); // resolveEventToCard
    eventFindUniqueMock.mockResolvedValueOnce(null); // handler-level lookup

    const res = await post('/api/pipeline/retry', { eventId: 'missing' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, error: 'Event not found' });
  });

  it('returns 400 when the event status is not "failed"', async () => {
    eventFindUniqueMock.mockResolvedValue({ ...failedEvent, status: 'success' });

    const res = await post('/api/pipeline/retry', { eventId: 'e-old' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'Can only retry failed events' });
    expect(createDeploymentEventMock).not.toHaveBeenCalled();
  });

  it('returns 500 when prisma throws during the retry lookup', async () => {
    // resolveEventToCard middleware swallows lookup so the handler runs;
    // the second findUnique call (inside the handler) rejects.
    eventFindUniqueMock.mockResolvedValueOnce({ rule: { card_id: 'c1' } });
    eventFindUniqueMock.mockRejectedValueOnce(new Error('connection lost'));

    const res = await post('/api/pipeline/retry', { eventId: 'e-old' });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'connection lost' });
  });

  it('returns 403 when requireProjectAccess rejects', async () => {
    currentAuth = 'no-project-access';
    // resolveEventToCard runs before requireProjectAccess; let it succeed
    eventFindUniqueMock.mockResolvedValue({ rule: { card_id: 'c1' } });

    const res = await post('/api/pipeline/retry', { eventId: 'e-old' });

    expect(res.status).toBe(403);
    expect(createDeploymentEventMock).not.toHaveBeenCalled();
  });
});

// ── POST /cancel ──────────────────────────────────────────────────────

describe('POST /api/pipeline/cancel', () => {
  it('returns 200 and forwards eventId + cancelled status to updateEventProgress', async () => {
    eventFindUniqueMock.mockResolvedValue({ rule: { card_id: 'c1' } });
    updateEventProgressMock.mockResolvedValue(undefined);

    const res = await post('/api/pipeline/cancel', { eventId: 'e-1' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(updateEventProgressMock).toHaveBeenCalledWith('e-1', 'cancelled', 'Cancelled by user');
  });

  it('returns 400 when eventId is missing from the body', async () => {
    const res = await post('/api/pipeline/cancel', {});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'eventId is required' });
    expect(updateEventProgressMock).not.toHaveBeenCalled();
  });

  it('returns 500 when updateEventProgress throws', async () => {
    eventFindUniqueMock.mockResolvedValue({ rule: { card_id: 'c1' } });
    updateEventProgressMock.mockRejectedValue(new Error('event not found'));

    const res = await post('/api/pipeline/cancel', { eventId: 'e-1' });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'event not found' });
  });

  it('returns 403 when requireProjectAccess rejects', async () => {
    currentAuth = 'no-project-access';
    eventFindUniqueMock.mockResolvedValue({ rule: { card_id: 'c1' } });
    const res = await post('/api/pipeline/cancel', { eventId: 'e-1' });
    expect(res.status).toBe(403);
    expect(updateEventProgressMock).not.toHaveBeenCalled();
  });
});

// ── resolveRuleToCard / resolveEventToCard middleware behavior ────────

describe('resolveRuleToCard middleware', () => {
  it('does not query prisma when ruleId is absent from params and body', async () => {
    // /trigger with no ruleId hits the resolveRuleToCard middleware first;
    // the middleware should short-circuit without calling prisma.
    await post('/api/pipeline/trigger', {});

    expect(ruleFindUniqueMock).not.toHaveBeenCalled();
  });

  it('looks up the rule by id from the body when params do not carry ruleId', async () => {
    ruleFindUniqueMock.mockResolvedValueOnce({ card_id: 'c1' });
    ruleFindUniqueMock.mockResolvedValueOnce({
      id: 'r1',
      card_id: 'c1',
      node_id: 'n1',
      repository: 'owner/repo',
      branch_pattern: 'main',
      environment: 'production',
      build_command: 'b',
      install_command: 'i',
      output_dir: 'o',
      framework: 'next',
    });
    createDeploymentEventMock.mockResolvedValue({ id: 'e1' });
    queueAddMock.mockResolvedValue(undefined);

    await post('/api/pipeline/trigger', { ruleId: 'r1' });

    // resolveRuleToCard called once; handler called findUnique a second time
    expect(ruleFindUniqueMock).toHaveBeenCalledTimes(2);
    expect(ruleFindUniqueMock.mock.calls[0][0]).toEqual({
      where: { id: 'r1' },
      select: { card_id: true },
    });
  });
});

describe('resolveEventToCard middleware', () => {
  it('does not query prisma when eventId is absent from the body', async () => {
    await post('/api/pipeline/cancel', {});

    expect(eventFindUniqueMock).not.toHaveBeenCalled();
  });

  it('skips card_id injection when the event has no rule relation', async () => {
    // Event lookup returns event without `rule` — middleware leaves cardId
    // unset, requireProjectAccess shim still allows the call through.
    eventFindUniqueMock.mockResolvedValueOnce({ rule: null });
    updateEventProgressMock.mockResolvedValue(undefined);

    const res = await post('/api/pipeline/cancel', { eventId: 'e-1' });

    expect(res.status).toBe(200);
    expect(eventFindUniqueMock).toHaveBeenCalledTimes(1);
  });

  it('preserves an explicit cardId in the body without re-querying prisma', async () => {
    updateEventProgressMock.mockResolvedValue(undefined);

    const res = await post('/api/pipeline/cancel', { eventId: 'e-1', cardId: 'c-explicit' });

    expect(res.status).toBe(200);
    expect(eventFindUniqueMock).not.toHaveBeenCalled();
  });
});

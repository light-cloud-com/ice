/**
 * HTTP tests for the GitHub webhook router (`POST /api/webhooks/github`).
 *
 * The gateway applies `express.raw({ type: 'application/json' })` to this
 * route before `express.json()` runs, so the SUT receives `req.body` as a
 * Buffer. We mirror that here — the test app installs `express.raw()` on
 * the same path, and tests post pre-stringified JSON with a real HMAC-
 * SHA-256 signature derived from the raw body. (Per-rule webhook secrets;
 * there is no global env-var secret in this service.)
 *
 * Pipeline service + queue service + dynamic `@ice/service-canvas` import
 * are mocked at the module boundary so the route's job — header gating,
 * idempotency dedup, signature acceptance, branch routing, queue payload
 * shape — is what we actually exercise.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHmac } from 'node:crypto';

// ── Mocks (must be hoisted before the router import) ──────────────────

const matchRulesForPushMock = vi.fn();
const matchRulesForMergeMock = vi.fn();
const shouldSkipDuplicateMock = vi.fn();
const createDeploymentEventMock = vi.fn();
const updateEventProgressMock = vi.fn();
const failEventMock = vi.fn();

vi.mock('../../services/pipeline.service', () => ({
  matchRulesForPush: (...args: unknown[]) => matchRulesForPushMock(...args),
  matchRulesForMerge: (...args: unknown[]) => matchRulesForMergeMock(...args),
  shouldSkipDuplicate: (...args: unknown[]) => shouldSkipDuplicateMock(...args),
  createDeploymentEvent: (...args: unknown[]) => createDeploymentEventMock(...args),
  updateEventProgress: (...args: unknown[]) => updateEventProgressMock(...args),
  failEvent: (...args: unknown[]) => failEventMock(...args),
}));

const queueAddMock = vi.fn();
const getDeployQueueMock = vi.fn(() => ({ add: queueAddMock }));

vi.mock('../../services/queue.service', () => ({
  getDeployQueue: () => getDeployQueueMock(),
}));

const webhookDeliveryCreate = vi.fn();
const webhookDeliveryUpdate = vi.fn();
const deploymentRuleFindMany = vi.fn();
const canvasCardFindUnique = vi.fn();
const canvasProjectFindUnique = vi.fn();

vi.mock('@ice/db', () => ({
  default: {
    webhookDelivery: {
      create: (...args: unknown[]) => webhookDeliveryCreate(...args),
      update: (...args: unknown[]) => webhookDeliveryUpdate(...args),
    },
    deploymentRule: {
      findMany: (...args: unknown[]) => deploymentRuleFindMany(...args),
    },
    canvasCard: {
      findUnique: (...args: unknown[]) => canvasCardFindUnique(...args),
    },
    canvasProject: {
      findUnique: (...args: unknown[]) => canvasProjectFindUnique(...args),
    },
  },
}));

// `@ice/service-canvas` is loaded via dynamic import inside the PR handler.
// vi.mock hoists the registration; the SUT's `await import('@ice/service-canvas')`
// resolves to whichever factory we set here.
const createEnvironmentMock = vi.fn();
const findEnvironmentByNameMock = vi.fn();
const closePrEnvironmentMock = vi.fn();

vi.mock('@ice/service-canvas', () => ({
  createEnvironment: (...args: unknown[]) => createEnvironmentMock(...args),
  findEnvironmentByName: (...args: unknown[]) => findEnvironmentByNameMock(...args),
  closePrEnvironment: (...args: unknown[]) => closePrEnvironmentMock(...args),
}));

// ── Test harness ──────────────────────────────────────────────────────

let server: http.Server;
let baseUrl: string;

beforeEach(async () => {
  vi.clearAllMocks();

  webhookDeliveryCreate.mockResolvedValue({});
  webhookDeliveryUpdate.mockResolvedValue({});
  deploymentRuleFindMany.mockResolvedValue([]);
  canvasCardFindUnique.mockResolvedValue(null);
  canvasProjectFindUnique.mockResolvedValue(null);
  matchRulesForPushMock.mockResolvedValue([]);
  matchRulesForMergeMock.mockResolvedValue([]);
  shouldSkipDuplicateMock.mockResolvedValue(false);
  createDeploymentEventMock.mockResolvedValue({ id: 'evt-1' });
  updateEventProgressMock.mockResolvedValue(undefined);
  failEventMock.mockResolvedValue(undefined);
  queueAddMock.mockResolvedValue(undefined);
  createEnvironmentMock.mockReset();
  findEnvironmentByNameMock.mockResolvedValue(null);
  closePrEnvironmentMock.mockResolvedValue(undefined);

  // Suppress the router's expected console.error / console.warn noise so
  // test output stays readable.
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  // Import after mocks are in place.
  const { default: webhooksRouter } = await import('../webhooks');
  const app = express();
  // Mirror gateway: raw body parser MUST run before any json middleware
  // for this route — the SUT relies on `Buffer.isBuffer(req.body)`.
  app.use('/api/webhooks/github', express.raw({ type: 'application/json' }));
  app.use('/api/webhooks', webhooksRouter);

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

// ── Helpers ───────────────────────────────────────────────────────────

const SECRET = 'test-secret';

function sign(rawBody: string, secret = SECRET): string {
  return 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
}

async function postWebhook(
  body: unknown,
  headers: Record<string, string> = {},
  rawOverride?: string,
) {
  const rawBody = rawOverride ?? JSON.stringify(body);
  const res = await fetch(`${baseUrl}/api/webhooks/github`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-GitHub-Event': 'ping',
      'X-GitHub-Delivery': `delivery-${Math.random().toString(36).slice(2)}`,
      ...headers,
    },
    body: rawBody,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json as any, raw: text };
}

const baseRule = {
  id: 'rule-1',
  card_id: 'card-1',
  node_id: 'node-1',
  repository: 'owner/repo',
  branch_pattern: 'main',
  trigger_type: 'push',
  environment: 'production',
  enabled: true,
  webhook_secret: SECRET,
  webhook_id: 1,
  webhook_status: 'registered',
  webhook_error: null,
  organisation_id: 'org-1',
  build_command: 'npm run build',
  install_command: 'npm install',
  output_dir: 'dist',
  framework: 'next',
  created_by: 'user-1',
};

function pushPayload(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    ref: 'refs/heads/main',
    deleted: false,
    repository: { full_name: 'owner/repo' },
    after: 'sha-after',
    head_commit: {
      id: 'sha-head',
      message: 'commit message',
      author: { username: 'octocat', name: 'Octo Cat' },
    },
    ...overrides,
  };
}

// ── 1. Header gating ──────────────────────────────────────────────────

describe('POST /api/webhooks/github — header gating', () => {
  it('returns 400 when X-GitHub-Event is missing', async () => {
    const body = pushPayload();
    const raw = JSON.stringify(body);
    const res = await fetch(`${baseUrl}/api/webhooks/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Delivery': 'd-1',
      },
      body: raw,
    });
    const text = await res.text();
    expect(res.status).toBe(400);
    expect(JSON.parse(text)).toEqual({ error: 'Missing GitHub event headers' });
    expect(webhookDeliveryCreate).not.toHaveBeenCalled();
  });

  it('returns 400 when X-GitHub-Delivery is missing', async () => {
    const body = pushPayload();
    const raw = JSON.stringify(body);
    const res = await fetch(`${baseUrl}/api/webhooks/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'push',
      },
      body: raw,
    });
    expect(res.status).toBe(400);
    expect(webhookDeliveryCreate).not.toHaveBeenCalled();
  });
});

// ── 2. Idempotency / dedup ────────────────────────────────────────────

describe('POST /api/webhooks/github — idempotency', () => {
  it('returns 200 with "Already processed" on Prisma P2002 unique violation', async () => {
    const dupErr: any = new Error('Unique constraint failed');
    dupErr.code = 'P2002';
    webhookDeliveryCreate.mockRejectedValue(dupErr);

    const res = await postWebhook(pushPayload(), { 'X-GitHub-Event': 'push' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Already processed' });
    // We never reach push handling on dedup
    expect(matchRulesForPushMock).not.toHaveBeenCalled();
    // And we don't try to "mark as processed" because the row was the prior delivery's
    expect(webhookDeliveryUpdate).not.toHaveBeenCalled();
  });

  it('records delivery row, then marks processed=true with the result string', async () => {
    matchRulesForPushMock.mockResolvedValue([]);
    const body = pushPayload();
    const raw = JSON.stringify(body);

    const res = await postWebhook(body, {
      'X-GitHub-Event': 'push',
      'X-GitHub-Delivery': 'd-42',
      'X-Hub-Signature-256': sign(raw),
    });

    expect(res.status).toBe(200);
    expect(webhookDeliveryCreate).toHaveBeenCalledWith({
      data: { delivery_id: 'd-42', event: 'push', processed: false },
    });
    expect(webhookDeliveryUpdate).toHaveBeenCalledTimes(1);
    const updateArgs = webhookDeliveryUpdate.mock.calls[0]![0];
    expect(updateArgs.where).toEqual({ delivery_id: 'd-42' });
    expect(updateArgs.data.processed).toBe(true);
    expect(typeof updateArgs.data.result).toBe('string');
  });
});

// ── 3. Ping event ─────────────────────────────────────────────────────

describe('POST /api/webhooks/github — ping', () => {
  it('returns 200 with message=pong and skips push/merge handling', async () => {
    const res = await postWebhook({}, { 'X-GitHub-Event': 'ping' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'pong' });
    expect(matchRulesForPushMock).not.toHaveBeenCalled();
    expect(matchRulesForMergeMock).not.toHaveBeenCalled();
    expect(webhookDeliveryUpdate.mock.calls[0]![0].data.result).toBe('pong');
  });
});

// ── 4. Unhandled event types ──────────────────────────────────────────

describe('POST /api/webhooks/github — unhandled events', () => {
  it('returns 200 with "unhandled event: <name>" for events we do not route', async () => {
    const res = await postWebhook({}, { 'X-GitHub-Event': 'workflow_run' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'unhandled event: workflow_run' });
    expect(webhookDeliveryUpdate.mock.calls[0]![0].data.result).toBe('unhandled event: workflow_run');
  });
});

// ── 5. Push — payload guards ──────────────────────────────────────────

describe('POST /api/webhooks/github — push payload guards', () => {
  it('returns 200 with "no repository in payload" when repository is missing', async () => {
    const body = { ref: 'refs/heads/main' };
    const res = await postWebhook(body, { 'X-GitHub-Event': 'push' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'no repository in payload' });
    expect(matchRulesForPushMock).not.toHaveBeenCalled();
  });

  it('returns 200 with "not a branch push" when ref is a tag (refs/tags/...)', async () => {
    const body = pushPayload({ ref: 'refs/tags/v1.0.0' });
    const res = await postWebhook(body, { 'X-GitHub-Event': 'push' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'not a branch push' });
    expect(matchRulesForPushMock).not.toHaveBeenCalled();
  });

  it('returns 200 with "not a branch push" when ref is missing entirely', async () => {
    const body = pushPayload({ ref: undefined });
    const res = await postWebhook(body, { 'X-GitHub-Event': 'push' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'not a branch push' });
  });

  it('returns 200 with "branch deletion — skipped" when payload.deleted is true', async () => {
    const body = pushPayload({ deleted: true });
    const res = await postWebhook(body, { 'X-GitHub-Event': 'push' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'branch deletion — skipped' });
    expect(matchRulesForPushMock).not.toHaveBeenCalled();
  });
});

// ── 6. Push — rule matching + signature ───────────────────────────────

describe('POST /api/webhooks/github — push rule matching', () => {
  it('returns 200 with "no matching rules" when matchRulesForPush returns []', async () => {
    matchRulesForPushMock.mockResolvedValue([]);
    const res = await postWebhook(pushPayload(), {
      'X-GitHub-Event': 'push',
      'X-Hub-Signature-256': sign(JSON.stringify(pushPayload())),
    });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/no matching rules for owner\/repo:main/);
    expect(createDeploymentEventMock).not.toHaveBeenCalled();
    expect(queueAddMock).not.toHaveBeenCalled();
  });

  it('rejects the push when no matching rule has a webhook_secret configured', async () => {
    matchRulesForPushMock.mockResolvedValue([{ ...baseRule, webhook_secret: null }]);
    const res = await postWebhook(pushPayload(), {
      'X-GitHub-Event': 'push',
      'X-Hub-Signature-256': sign(JSON.stringify(pushPayload())),
    });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/^rejected: no webhook secret configured/);
    expect(createDeploymentEventMock).not.toHaveBeenCalled();
  });

  it('rejects with "missing x-hub-signature-256" when header is absent but secret is set', async () => {
    matchRulesForPushMock.mockResolvedValue([baseRule]);
    const res = await postWebhook(pushPayload(), { 'X-GitHub-Event': 'push' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/^rejected: missing x-hub-signature-256 header/);
    expect(createDeploymentEventMock).not.toHaveBeenCalled();
  });

  it('rejects with "invalid signature" when HMAC does not match any rule\'s secret', async () => {
    matchRulesForPushMock.mockResolvedValue([baseRule]);
    const body = pushPayload();
    const raw = JSON.stringify(body);
    const wrongSig = sign(raw, 'not-the-secret');
    const res = await postWebhook(body, {
      'X-GitHub-Event': 'push',
      'X-Hub-Signature-256': wrongSig,
    });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('invalid signature');
    expect(createDeploymentEventMock).not.toHaveBeenCalled();
  });

  it('treats a malformed signature as invalid (timingSafeEqual length mismatch)', async () => {
    // `sha256=` followed by truncated hex — different byte length than the
    // expected digest, which makes timingSafeEqual throw; the SUT swallows
    // and returns false.
    matchRulesForPushMock.mockResolvedValue([baseRule]);
    const res = await postWebhook(pushPayload(), {
      'X-GitHub-Event': 'push',
      'X-Hub-Signature-256': 'sha256=deadbeef',
    });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('invalid signature');
  });

  it('accepts a signature matching ANY rule when multiple rules carry different secrets', async () => {
    const ruleA = { ...baseRule, id: 'rule-A', webhook_secret: 'wrong' };
    const ruleB = { ...baseRule, id: 'rule-B', webhook_secret: SECRET };
    matchRulesForPushMock.mockResolvedValue([ruleA, ruleB]);

    const body = pushPayload();
    const raw = JSON.stringify(body);
    const res = await postWebhook(body, {
      'X-GitHub-Event': 'push',
      'X-Hub-Signature-256': sign(raw, SECRET),
    });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/^processed:/);
    // Both rules deploy because both pass; signature only needs to match one.
    expect(createDeploymentEventMock).toHaveBeenCalledTimes(2);
    expect(queueAddMock).toHaveBeenCalledTimes(2);
  });
});

// ── 7. Push — successful enqueue ──────────────────────────────────────

describe('POST /api/webhooks/github — push enqueue', () => {
  it('creates a DeploymentEvent and enqueues a pipeline job with the canonical payload', async () => {
    matchRulesForPushMock.mockResolvedValue([baseRule]);
    createDeploymentEventMock.mockResolvedValue({ id: 'evt-99' });

    const body = pushPayload();
    const raw = JSON.stringify(body);
    const res = await postWebhook(body, {
      'X-GitHub-Event': 'push',
      'X-Hub-Signature-256': sign(raw),
    });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('processed: 1 deployed, 0 skipped');

    expect(createDeploymentEventMock).toHaveBeenCalledWith(
      'rule-1',
      'push',
      'sha-head',
      'main',
      'commit message',
      'octocat',
    );
    expect(queueAddMock).toHaveBeenCalledTimes(1);
    const [jobName, jobData, jobOpts] = queueAddMock.mock.calls[0]!;
    expect(jobName).toBe('pipeline');
    expect(jobData).toMatchObject({
      type: 'pipeline',
      eventId: 'evt-99',
      ruleId: 'rule-1',
      cardId: 'card-1',
      nodeId: 'node-1',
      repository: 'owner/repo',
      branch: 'main',
      commitSha: 'sha-head',
      commitMessage: 'commit message',
      commitAuthor: 'octocat',
      environment: 'production',
      buildCommand: 'npm run build',
      installCommand: 'npm install',
      outputDir: 'dist',
      framework: 'next',
    });
    expect(jobOpts).toEqual({ attempts: 1, removeOnComplete: 100, removeOnFail: 100 });

    expect(updateEventProgressMock).toHaveBeenCalledWith('evt-99', 'queued', 'Queued for deployment');
  });

  it('falls back to payload.after for commit SHA when head_commit is absent', async () => {
    matchRulesForPushMock.mockResolvedValue([baseRule]);
    const body = pushPayload({ head_commit: undefined });
    const raw = JSON.stringify(body);
    await postWebhook(body, {
      'X-GitHub-Event': 'push',
      'X-Hub-Signature-256': sign(raw),
    });

    const eventArgs = createDeploymentEventMock.mock.calls[0]!;
    expect(eventArgs[2]).toBe('sha-after');
    expect(eventArgs[4]).toBe(''); // commit message
    expect(eventArgs[5]).toBe(''); // commit author
  });

  it('uses author.name when author.username is missing', async () => {
    matchRulesForPushMock.mockResolvedValue([baseRule]);
    const body = pushPayload({
      head_commit: {
        id: 'sha-head',
        message: 'msg',
        author: { name: 'Just Name' },
      },
    });
    await postWebhook(body, {
      'X-GitHub-Event': 'push',
      'X-Hub-Signature-256': sign(JSON.stringify(body)),
    });
    expect(createDeploymentEventMock.mock.calls[0]![5]).toBe('Just Name');
  });

  it('skips a rule whose last deploy of the same SHA failed (shouldSkipDuplicate=true)', async () => {
    matchRulesForPushMock.mockResolvedValue([baseRule]);
    shouldSkipDuplicateMock.mockResolvedValue(true);
    const body = pushPayload();
    const res = await postWebhook(body, {
      'X-GitHub-Event': 'push',
      'X-Hub-Signature-256': sign(JSON.stringify(body)),
    });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('processed: 0 deployed, 1 skipped');
    expect(createDeploymentEventMock).not.toHaveBeenCalled();
    expect(queueAddMock).not.toHaveBeenCalled();
  });

  it('marks the event failed when queue.add throws and continues with no exception', async () => {
    matchRulesForPushMock.mockResolvedValue([baseRule]);
    createDeploymentEventMock.mockResolvedValue({ id: 'evt-fail' });
    queueAddMock.mockRejectedValue(new Error('redis exploded'));

    const body = pushPayload();
    const res = await postWebhook(body, {
      'X-GitHub-Event': 'push',
      'X-Hub-Signature-256': sign(JSON.stringify(body)),
    });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('processed: 0 deployed, 0 skipped');
    expect(failEventMock).toHaveBeenCalledWith('evt-fail', 'Failed to queue: redis exploded');
    expect(updateEventProgressMock).not.toHaveBeenCalled();
  });
});

// ── 8. Pull request — opened + ephemeral env creation ─────────────────

describe('POST /api/webhooks/github — pull_request opened', () => {
  function prOpenedBody(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      action: 'opened',
      repository: { full_name: 'owner/repo' },
      pull_request: {
        number: 42,
        title: 'Add cool feature',
        merged: false,
        head: { ref: 'feature/login', sha: 'sha-pr' },
        base: { ref: 'main' },
        user: { login: 'octocat' },
      },
      ...overrides,
    };
  }

  it('creates an ephemeral env when project has pr_previews_enabled and queues deploys for each PR rule', async () => {
    deploymentRuleFindMany
      // First call: find rules for repo
      .mockResolvedValueOnce([{ ...baseRule, card_id: 'card-1' }])
      // Second call (per-PR-env): find rules for the new PR card
      .mockResolvedValueOnce([{ ...baseRule, card_id: 'pr-card', id: 'rule-pr' }]);
    canvasCardFindUnique.mockResolvedValue({ project_id: 'proj-1' });
    canvasProjectFindUnique.mockResolvedValue({ id: 'proj-1', pr_previews_enabled: true });
    findEnvironmentByNameMock.mockResolvedValue(null);
    createEnvironmentMock.mockResolvedValue({ card: { id: 'pr-card' } });
    createDeploymentEventMock.mockResolvedValue({ id: 'evt-pr' });

    const body = prOpenedBody();
    const res = await postWebhook(body, { 'X-GitHub-Event': 'pull_request' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/PR #42 opened: 1 ephemeral env\(s\) created \+ deployed/);
    expect(createEnvironmentMock).toHaveBeenCalledWith(
      'proj-1',
      'system',
      'pr-42',
      'pr',
      undefined,
      42,
      'feature/login',
      'owner/repo',
    );
    expect(createDeploymentEventMock).toHaveBeenCalledWith(
      'rule-pr',
      'push',
      'sha-pr',
      'feature/login',
      'PR #42: Add cool feature',
      'octocat',
    );
    expect(queueAddMock).toHaveBeenCalledTimes(1);
    const [, jobData] = queueAddMock.mock.calls[0]!;
    expect(jobData).toMatchObject({
      type: 'pipeline',
      eventId: 'evt-pr',
      branch: 'feature/login',
      commitSha: 'sha-pr',
      environment: 'pr-42',
    });
    // commitMessage / commitAuthor are NOT forwarded in the PR-deploy path
    expect((jobData as any).commitMessage).toBeUndefined();
  });

  it('skips creation when env already exists (synchronize re-fire)', async () => {
    deploymentRuleFindMany.mockResolvedValueOnce([baseRule]);
    canvasCardFindUnique.mockResolvedValue({ project_id: 'proj-1' });
    canvasProjectFindUnique.mockResolvedValue({ id: 'proj-1', pr_previews_enabled: true });
    findEnvironmentByNameMock.mockResolvedValue({ id: 'existing-env' });

    const body = { ...prOpenedBody(), action: 'synchronize' };
    const res = await postWebhook(body, { 'X-GitHub-Event': 'pull_request' });

    // The created counter never increments → falls through to the
    // generic "PR <action> — handled" tail.
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('PR synchronize — handled');
    expect(createEnvironmentMock).not.toHaveBeenCalled();
  });

  it('falls through to "PR opened — handled" when the project has previews disabled', async () => {
    deploymentRuleFindMany.mockResolvedValueOnce([baseRule]);
    canvasCardFindUnique.mockResolvedValue({ project_id: 'proj-1' });
    canvasProjectFindUnique.mockResolvedValue({ id: 'proj-1', pr_previews_enabled: false });

    const body = prOpenedBody();
    const res = await postWebhook(body, { 'X-GitHub-Event': 'pull_request' });
    expect(res.body.message).toBe('PR opened — handled');
    expect(createEnvironmentMock).not.toHaveBeenCalled();
  });

  it('uses HEAD when pull_request.head.sha is missing', async () => {
    deploymentRuleFindMany
      .mockResolvedValueOnce([{ ...baseRule, card_id: 'card-1' }])
      .mockResolvedValueOnce([{ ...baseRule, card_id: 'pr-card', id: 'rule-pr' }]);
    canvasCardFindUnique.mockResolvedValue({ project_id: 'proj-1' });
    canvasProjectFindUnique.mockResolvedValue({ id: 'proj-1', pr_previews_enabled: true });
    findEnvironmentByNameMock.mockResolvedValue(null);
    createEnvironmentMock.mockResolvedValue({ card: { id: 'pr-card' } });

    const body = prOpenedBody({
      pull_request: {
        number: 7,
        title: 'wip',
        head: { ref: 'wip-branch' }, // no sha
        base: { ref: 'main' },
      },
    });
    await postWebhook(body, { 'X-GitHub-Event': 'pull_request' });

    expect(createDeploymentEventMock.mock.calls[0]![2]).toBe('HEAD');
  });

  it('uses an empty title in the deploy-event message when pull_request.title is missing', async () => {
    deploymentRuleFindMany
      .mockResolvedValueOnce([{ ...baseRule, card_id: 'card-1' }])
      .mockResolvedValueOnce([{ ...baseRule, card_id: 'pr-card', id: 'rule-pr' }]);
    canvasCardFindUnique.mockResolvedValue({ project_id: 'proj-1' });
    canvasProjectFindUnique.mockResolvedValue({ id: 'proj-1', pr_previews_enabled: true });
    findEnvironmentByNameMock.mockResolvedValue(null);
    createEnvironmentMock.mockResolvedValue({ card: { id: 'pr-card' } });

    const body = prOpenedBody({
      pull_request: {
        number: 11,
        // no `title`, no `user`
        head: { ref: 'b', sha: 's' },
        base: { ref: 'main' },
      },
    });
    await postWebhook(body, { 'X-GitHub-Event': 'pull_request' });

    expect(createDeploymentEventMock.mock.calls[0]![4]).toBe('PR #11: ');
    // user.login also nullable-chains through to undefined
    expect(createDeploymentEventMock.mock.calls[0]![5]).toBeUndefined();
  });

  it('skips card with null project (orphaned rule does not crash)', async () => {
    deploymentRuleFindMany.mockResolvedValueOnce([baseRule]);
    canvasCardFindUnique.mockResolvedValue(null);

    const body = prOpenedBody();
    const res = await postWebhook(body, { 'X-GitHub-Event': 'pull_request' });
    // Empty projectIds → loop skipped → falls to "PR opened — handled"
    expect(res.body.message).toBe('PR opened — handled');
    expect(canvasProjectFindUnique).not.toHaveBeenCalled();
  });

  it('logs but does not fail the request when queueing the per-PR deploy throws', async () => {
    deploymentRuleFindMany
      .mockResolvedValueOnce([{ ...baseRule, card_id: 'card-1' }])
      .mockResolvedValueOnce([{ ...baseRule, card_id: 'pr-card', id: 'rule-pr' }]);
    canvasCardFindUnique.mockResolvedValue({ project_id: 'proj-1' });
    canvasProjectFindUnique.mockResolvedValue({ id: 'proj-1', pr_previews_enabled: true });
    findEnvironmentByNameMock.mockResolvedValue(null);
    createEnvironmentMock.mockResolvedValue({ card: { id: 'pr-card' } });
    queueAddMock.mockRejectedValue(new Error('queue exploded'));

    const body = prOpenedBody();
    const res = await postWebhook(body, { 'X-GitHub-Event': 'pull_request' });

    expect(res.status).toBe(200);
    // We still report the env was created
    expect(res.body.message).toMatch(/PR #42 opened: 1 ephemeral env/);
  });

  it('logs but does not fail when ephemeral env creation throws', async () => {
    deploymentRuleFindMany.mockResolvedValueOnce([baseRule]);
    canvasCardFindUnique.mockResolvedValue({ project_id: 'proj-1' });
    canvasProjectFindUnique.mockResolvedValue({ id: 'proj-1', pr_previews_enabled: true });
    findEnvironmentByNameMock.mockResolvedValue(null);
    createEnvironmentMock.mockRejectedValue(new Error('canvas unreachable'));

    const body = prOpenedBody();
    const res = await postWebhook(body, { 'X-GitHub-Event': 'pull_request' });
    // Outer catch swallows; falls through to "PR opened — handled"
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('PR opened — handled');
  });

  it('skips ephemeral-env path when prNumber is missing on opened action', async () => {
    const body = {
      action: 'opened',
      repository: { full_name: 'owner/repo' },
      pull_request: { number: undefined, head: { ref: 'b' }, base: { ref: 'main' } },
    };
    const res = await postWebhook(body, { 'X-GitHub-Event': 'pull_request' });
    expect(res.body.message).toBe('PR opened — handled');
    expect(createEnvironmentMock).not.toHaveBeenCalled();
  });
});

// ── 9. Pull request — closed (not merged) ────────────────────────────

describe('POST /api/webhooks/github — pull_request closed (not merged)', () => {
  it('destroys the ephemeral env and returns the not-merged message', async () => {
    closePrEnvironmentMock.mockResolvedValue(undefined);
    const body = {
      action: 'closed',
      repository: { full_name: 'owner/repo' },
      pull_request: {
        number: 7,
        merged: false,
        head: { ref: 'b', sha: 's' },
        base: { ref: 'main' },
      },
    };
    const res = await postWebhook(body, { 'X-GitHub-Event': 'pull_request' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('PR #7 closed (not merged) — ephemeral env destroyed');
    expect(closePrEnvironmentMock).toHaveBeenCalledWith('owner/repo', 7);
  });

  it('logs but does not fail when closePrEnvironment throws', async () => {
    closePrEnvironmentMock.mockRejectedValue(new Error('canvas down'));
    const body = {
      action: 'closed',
      repository: { full_name: 'owner/repo' },
      pull_request: {
        number: 7,
        merged: false,
        head: { ref: 'b', sha: 's' },
        base: { ref: 'main' },
      },
    };
    const res = await postWebhook(body, { 'X-GitHub-Event': 'pull_request' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('PR #7 closed (not merged) — ephemeral env destroyed');
  });
});

// ── 10. Pull request — merged → triggers merge rules ──────────────────

describe('POST /api/webhooks/github — pull_request merged', () => {
  function mergedBody(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      action: 'closed',
      repository: { full_name: 'owner/repo' },
      pull_request: {
        number: 9,
        merged: true,
        title: 'Feature done',
        merge_commit_sha: 'sha-merge',
        head: { ref: 'feature/x', sha: 'sha-head' },
        base: { ref: 'main' },
        user: { login: 'merger' },
      },
      ...overrides,
    };
  }

  it('queues a merge job per matching rule with merge-shaped payload', async () => {
    matchRulesForMergeMock.mockResolvedValue([baseRule]);
    createDeploymentEventMock.mockResolvedValue({ id: 'evt-merge' });

    const body = mergedBody();
    const res = await postWebhook(body, { 'X-GitHub-Event': 'pull_request' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('merge processed: 1 deployed');
    expect(matchRulesForMergeMock).toHaveBeenCalledWith('owner/repo', 'main');
    expect(createDeploymentEventMock).toHaveBeenCalledWith(
      'rule-1',
      'merge',
      'sha-merge',
      'main',
      'Feature done',
      'merger',
    );
    expect(queueAddMock).toHaveBeenCalledTimes(1);
    const [, jobData] = queueAddMock.mock.calls[0]!;
    expect(jobData).toMatchObject({
      type: 'pipeline',
      branch: 'main',
      commitSha: 'sha-merge',
      commitMessage: 'Feature done',
      commitAuthor: 'merger',
      environment: 'production',
    });
    expect(updateEventProgressMock).toHaveBeenCalledWith('evt-merge', 'queued', 'Queued for deployment');
  });

  it('returns "missing branch/commit info" when merge_commit_sha is null', async () => {
    const body = mergedBody({
      pull_request: {
        number: 9,
        merged: true,
        title: 't',
        merge_commit_sha: null,
        head: { ref: 'f', sha: 's' },
        base: { ref: 'main' },
        user: { login: 'u' },
      },
    });
    const res = await postWebhook(body, { 'X-GitHub-Event': 'pull_request' });
    expect(res.body.message).toBe('missing branch/commit info');
    expect(matchRulesForMergeMock).not.toHaveBeenCalled();
  });

  it('returns "missing branch/commit info" when base.ref is missing', async () => {
    const body = mergedBody({
      pull_request: {
        number: 9,
        merged: true,
        title: 't',
        merge_commit_sha: 'sha',
        head: { ref: 'f', sha: 's' },
        base: {},
        user: { login: 'u' },
      },
    });
    const res = await postWebhook(body, { 'X-GitHub-Event': 'pull_request' });
    expect(res.body.message).toBe('missing branch/commit info');
  });

  it('returns "no merge rules" when matchRulesForMerge returns []', async () => {
    matchRulesForMergeMock.mockResolvedValue([]);
    const res = await postWebhook(mergedBody(), { 'X-GitHub-Event': 'pull_request' });
    expect(res.body.message).toBe('no merge rules for owner/repo:main');
  });

  it('skips a rule whose previous deploy of the merge SHA failed', async () => {
    matchRulesForMergeMock.mockResolvedValue([baseRule]);
    shouldSkipDuplicateMock.mockResolvedValue(true);
    const res = await postWebhook(mergedBody(), { 'X-GitHub-Event': 'pull_request' });
    expect(res.body.message).toBe('merge processed: 0 deployed');
    expect(createDeploymentEventMock).not.toHaveBeenCalled();
  });

  it('marks the merge event failed when queue.add throws', async () => {
    matchRulesForMergeMock.mockResolvedValue([baseRule]);
    createDeploymentEventMock.mockResolvedValue({ id: 'evt-merge-fail' });
    queueAddMock.mockRejectedValue(new Error('queue down'));

    const res = await postWebhook(mergedBody(), { 'X-GitHub-Event': 'pull_request' });
    expect(res.body.message).toBe('merge processed: 0 deployed');
    expect(failEventMock).toHaveBeenCalledWith('evt-merge-fail', 'Failed to queue: queue down');
  });
});

// ── 11. Pull request — non-routed actions ─────────────────────────────

describe('POST /api/webhooks/github — pull_request other actions', () => {
  it('returns "PR <action> — handled" for actions that are neither opened/synchronize/closed', async () => {
    const body = {
      action: 'labeled',
      repository: { full_name: 'owner/repo' },
      pull_request: {
        number: 1,
        merged: false,
        head: { ref: 'b' },
        base: { ref: 'main' },
      },
    };
    const res = await postWebhook(body, { 'X-GitHub-Event': 'pull_request' });
    expect(res.body.message).toBe('PR labeled — handled');
  });
});

// ── 12. Top-level error path ──────────────────────────────────────────

describe('POST /api/webhooks/github — internal failure', () => {
  it('returns 500 with error.message when handler throws after delivery row created', async () => {
    // Force the push handler to throw. matchRulesForPush is the first awaited
    // call inside `handlePushEvent`; rejecting it bubbles to the outer catch.
    matchRulesForPushMock.mockRejectedValue(new Error('db boom'));
    const body = pushPayload();
    const res = await postWebhook(body, {
      'X-GitHub-Event': 'push',
      'X-Hub-Signature-256': sign(JSON.stringify(body)),
    });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'db boom' });
    // The "mark as processed" path is best-effort; it still got called with
    // an error result string.
    const lastUpdate = webhookDeliveryUpdate.mock.calls.at(-1)![0];
    expect(lastUpdate.data.result).toMatch(/^error: db boom/);
  });

  it('does NOT crash the server when the post-error delivery update itself rejects', async () => {
    matchRulesForPushMock.mockRejectedValue(new Error('outer fail'));
    webhookDeliveryUpdate.mockRejectedValue(new Error('mark-processed fail'));

    const body = pushPayload();
    const res = await postWebhook(body, {
      'X-GitHub-Event': 'push',
      'X-Hub-Signature-256': sign(JSON.stringify(body)),
    });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'outer fail' });
  });

  it('returns a 500 envelope when webhookDelivery.create throws a non-P2002 error (findings #8)', async () => {
    // Previously the SUT re-threw out of an async route handler.
    // Express 4 has no default async-error handler, so the request
    // hung until the client timed out. The fix converts the rethrow
    // into a 500 with an error envelope, same shape as the outer
    // catch arm. Pinned here so a regression to the rethrow surfaces.
    const fatal: any = new Error('db unavailable');
    fatal.code = 'P9999';
    webhookDeliveryCreate.mockRejectedValueOnce(fatal);

    const body = pushPayload();
    const res = await postWebhook(body, {
      'X-GitHub-Event': 'push',
      'X-Hub-Signature-256': sign(JSON.stringify(body)),
    });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'db unavailable' });
    expect(webhookDeliveryCreate).toHaveBeenCalledTimes(1);
    // The SUT bails before reaching push handling.
    expect(matchRulesForPushMock).not.toHaveBeenCalled();
  });
});

// ── 13. Body-shape edge cases ─────────────────────────────────────────

describe('POST /api/webhooks/github — body parsing edge cases', () => {
  it('falls back to JSON.stringify(req.body) when raw body is not a Buffer', async () => {
    // Hit the same router via a fresh app that does NOT install
    // `express.raw()`; here `express.json()` parses the body to an object,
    // and the SUT's `Buffer.isBuffer(req.body) ? req.body : Buffer.from(...)`
    // fallback runs. We get to verify the fallback is reachable.
    await new Promise<void>((resolve) => server.close(() => resolve()));

    const { default: webhooksRouter } = await import('../webhooks');
    const app = express();
    app.use(express.json({ limit: '1mb' }));
    app.use('/api/webhooks', webhooksRouter);
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
    const port = (server.address() as AddressInfo).port;
    const local = `http://127.0.0.1:${port}`;

    matchRulesForPushMock.mockResolvedValue([baseRule]);
    const body = pushPayload();
    const raw = JSON.stringify(body);
    // Recompute the signature against the JSON re-stringification used by
    // the fallback path. (Property order is preserved by V8 for string keys.)
    const sig = sign(raw);

    const res = await fetch(`${local}/api/webhooks/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'push',
        'X-GitHub-Delivery': 'd-fallback',
        'X-Hub-Signature-256': sig,
      },
      body: raw,
    });
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(JSON.parse(text).message).toMatch(/^processed:/);
  });
});

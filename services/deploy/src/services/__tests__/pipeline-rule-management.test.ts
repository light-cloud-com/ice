/**
 * Unit tests for `services/deploy/src/services/pipeline/rule-management.ts` —
 * the deployment rule CRUD + canvas-edge auto-creator extracted from
 * pipeline.service.ts in rf-pipe-2.
 *
 * Per the `vi-spyon-accumulates-across-it-blocks-without-explicit-reset`
 * learning, console spies are torn down via `vi.restoreAllMocks()` in
 * `afterEach` — re-spying alone in `beforeEach` would carry call counts
 * across `it` blocks and break `toHaveBeenCalledTimes(N)` assertions.
 *
 * The webhook helpers (`registerGitHubWebhook` / `unregisterGitHubWebhook`)
 * are module-mocked at their import path (`../pipeline/github-webhooks.js`)
 * so we don't need to stub `fetch` here — those helpers have their own
 * test file (rf-pipe-5).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@ice/db', () => ({
  default: {
    deploymentRule: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    canvasCard: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../pipeline/github-webhooks.js', () => ({
  registerGitHubWebhook: vi.fn(),
  unregisterGitHubWebhook: vi.fn(),
}));

import prisma from '@ice/db';
import * as webhooks from '../pipeline/github-webhooks.js';
import {
  createRule,
  updateRule,
  deleteRule,
  getRulesForNode,
  ensureRulesForCanvas,
} from '../pipeline/rule-management.js';

const ruleFindFirst = (prisma as any).deploymentRule.findFirst as ReturnType<typeof vi.fn>;
const ruleFindMany = (prisma as any).deploymentRule.findMany as ReturnType<typeof vi.fn>;
const ruleCreate = (prisma as any).deploymentRule.create as ReturnType<typeof vi.fn>;
const ruleUpdate = (prisma as any).deploymentRule.update as ReturnType<typeof vi.fn>;
const ruleDelete = (prisma as any).deploymentRule.delete as ReturnType<typeof vi.fn>;
const cardFindUnique = (prisma as any).canvasCard.findUnique as ReturnType<typeof vi.fn>;
const cardFindMany = (prisma as any).canvasCard.findMany as ReturnType<typeof vi.fn>;
const registerWebhook = (webhooks as any).registerGitHubWebhook as ReturnType<typeof vi.fn>;
const unregisterWebhook = (webhooks as any).unregisterGitHubWebhook as ReturnType<typeof vi.fn>;

beforeEach(() => {
  ruleFindFirst.mockReset();
  ruleFindMany.mockReset();
  ruleCreate.mockReset();
  ruleUpdate.mockReset();
  ruleDelete.mockReset();
  cardFindUnique.mockReset();
  cardFindMany.mockReset();
  registerWebhook.mockReset();
  unregisterWebhook.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createRule', () => {
  it('creates a fresh rule, registers webhook, then patches webhook fields onto the row', async () => {
    ruleFindFirst.mockResolvedValue(null);
    ruleCreate.mockResolvedValue({ id: 'rule-1', repository: 'o/r' });
    ruleUpdate.mockResolvedValue({ id: 'rule-1' });
    registerWebhook.mockResolvedValue({ status: 'registered', webhookId: 42 });

    const result = await createRule(
      { cardId: 'c1', nodeId: 'n1', repository: 'o/r' },
      'org-1',
      'user-1',
    );

    expect(result.webhook_status).toBe('registered');
    expect(result.webhook_error).toBeUndefined();

    // First call: insert the rule with defaults
    expect(ruleCreate).toHaveBeenCalledTimes(1);
    const createArgs = ruleCreate.mock.calls[0]![0].data;
    expect(createArgs.card_id).toBe('c1');
    expect(createArgs.node_id).toBe('n1');
    expect(createArgs.repository).toBe('o/r');
    expect(createArgs.branch_pattern).toBe('main');
    expect(createArgs.trigger_type).toBe('push');
    expect(createArgs.environment).toBe('production');
    expect(createArgs.organisation_id).toBe('org-1');
    expect(createArgs.created_by).toBe('user-1');
    // 32 random bytes → 64 hex chars
    expect(createArgs.webhook_secret).toMatch(/^[0-9a-f]{64}$/);

    // Second update: patch webhook fields onto the row
    expect(ruleUpdate).toHaveBeenCalledTimes(1);
    expect(ruleUpdate.mock.calls[0]![0].where).toEqual({ id: 'rule-1' });
    expect(ruleUpdate.mock.calls[0]![0].data).toEqual({
      webhook_id: 42,
      webhook_status: 'registered',
      webhook_error: undefined,
    });

    expect(registerWebhook).toHaveBeenCalledWith('user-1', 'o/r', createArgs.webhook_secret);
  });

  it('warns once when webhook registration fails but still returns the rule', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    ruleFindFirst.mockResolvedValue(null);
    ruleCreate.mockResolvedValue({ id: 'rule-1' });
    ruleUpdate.mockResolvedValue({ id: 'rule-1' });
    registerWebhook.mockResolvedValue({ status: 'failed', error: 'no admin' });

    const result = await createRule(
      { cardId: 'c', nodeId: 'n', repository: 'o/r' },
      'org',
      'user',
    );

    expect(result.webhook_status).toBe('failed');
    expect(result.webhook_error).toBe('no admin');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]![0]).toContain('[pipeline] Webhook not registered for o/r');
  });

  it('reuses an existing rule and updates mutable fields without rotating webhook secret', async () => {
    ruleFindFirst.mockResolvedValue({
      id: 'rule-old',
      trigger_type: 'push',
      environment: 'staging',
      build_command: 'old build',
      install_command: 'old install',
      output_dir: 'old',
      framework: 'old',
      webhook_status: 'registered',
      webhook_error: null,
    });
    ruleUpdate.mockResolvedValue({ id: 'rule-old', repository: 'o/r' });

    const result = await createRule(
      {
        cardId: 'c',
        nodeId: 'n',
        repository: 'o/r',
        framework: 'next',
        buildCommand: 'new build',
      },
      'org',
      'user',
    );

    // Should NOT create a new row
    expect(ruleCreate).not.toHaveBeenCalled();
    // Should NOT register a new webhook (existing secret is preserved)
    expect(registerWebhook).not.toHaveBeenCalled();
    // Should update mutable fields only
    expect(ruleUpdate).toHaveBeenCalledTimes(1);
    const updateArgs = ruleUpdate.mock.calls[0]![0].data;
    expect(updateArgs.framework).toBe('next');
    expect(updateArgs.build_command).toBe('new build');
    // Falls back to existing values when input doesn't override
    expect(updateArgs.install_command).toBe('old install');

    // Webhook fields are carried from the existing row
    expect(result.webhook_status).toBe('registered');
  });

  it('defaults branchPattern to "main" when input omits it', async () => {
    ruleFindFirst.mockResolvedValue(null);
    ruleCreate.mockResolvedValue({ id: 'r' });
    ruleUpdate.mockResolvedValue({ id: 'r' });
    registerWebhook.mockResolvedValue({ status: 'registered' });

    await createRule({ cardId: 'c', nodeId: 'n', repository: 'o/r' }, 'org', 'user');

    expect(ruleFindFirst.mock.calls[0]![0].where.branch_pattern).toBe('main');
    expect(ruleCreate.mock.calls[0]![0].data.branch_pattern).toBe('main');
  });
});

describe('updateRule', () => {
  it('scopes update by ruleId + organisationId and forwards all fields', async () => {
    ruleUpdate.mockResolvedValue({ id: 'r1' });
    await updateRule(
      'r1',
      {
        triggerType: 'merge',
        branchPattern: 'develop',
        environment: 'staging',
        buildCommand: 'b',
        installCommand: 'i',
        outputDir: 'o',
        framework: 'react',
        enabled: false,
      },
      'org-1',
    );
    expect(ruleUpdate).toHaveBeenCalledWith({
      where: { id: 'r1', organisation_id: 'org-1' },
      data: {
        trigger_type: 'merge',
        branch_pattern: 'develop',
        environment: 'staging',
        build_command: 'b',
        install_command: 'i',
        output_dir: 'o',
        framework: 'react',
        enabled: false,
      },
    });
  });
});

describe('deleteRule', () => {
  it('throws when rule is not in scope', async () => {
    ruleFindFirst.mockResolvedValue(null);
    await expect(deleteRule('r1', 'user', 'org')).rejects.toThrow('Rule not found');
    expect(ruleDelete).not.toHaveBeenCalled();
    expect(unregisterWebhook).not.toHaveBeenCalled();
  });

  it('removes the GitHub webhook when one exists, then deletes the rule', async () => {
    ruleFindFirst.mockResolvedValue({ id: 'r1', repository: 'o/r', webhook_id: 99 });
    unregisterWebhook.mockResolvedValue(undefined);
    ruleDelete.mockResolvedValue({ id: 'r1' });

    await deleteRule('r1', 'user-1', 'org-1');

    expect(unregisterWebhook).toHaveBeenCalledWith('user-1', 'o/r', 99);
    expect(ruleDelete).toHaveBeenCalledWith({ where: { id: 'r1' } });
  });

  it('still deletes the rule when webhook removal fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    ruleFindFirst.mockResolvedValue({ id: 'r1', repository: 'o/r', webhook_id: 99 });
    unregisterWebhook.mockRejectedValue(new Error('boom'));
    ruleDelete.mockResolvedValue({ id: 'r1' });

    await deleteRule('r1', 'user-1', 'org-1');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]![0]).toContain('Failed to remove webhook 99');
    expect(ruleDelete).toHaveBeenCalledTimes(1);
  });

  it('skips webhook removal when webhook_id is null', async () => {
    ruleFindFirst.mockResolvedValue({ id: 'r1', repository: 'o/r', webhook_id: null });
    ruleDelete.mockResolvedValue({ id: 'r1' });

    await deleteRule('r1', 'u', 'org');

    expect(unregisterWebhook).not.toHaveBeenCalled();
    expect(ruleDelete).toHaveBeenCalledTimes(1);
  });
});

describe('getRulesForNode', () => {
  it('returns [] when card is not found', async () => {
    cardFindUnique.mockResolvedValue(null);
    const rules = await getRulesForNode('c-x', 'n-y');
    expect(rules).toEqual([]);
    expect(ruleFindMany).not.toHaveBeenCalled();
  });

  it('queries rules across all cards in the same project (canvas branching)', async () => {
    cardFindUnique.mockResolvedValue({ project_id: 'p1' });
    cardFindMany.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }]);
    ruleFindMany.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]);

    const rules = await getRulesForNode('c1', 'n1');

    expect(rules).toHaveLength(2);
    expect(cardFindMany).toHaveBeenCalledWith({
      where: { project_id: 'p1' },
      select: { id: true },
    });
    expect(ruleFindMany).toHaveBeenCalledWith({
      where: { card_id: { in: ['c1', 'c2', 'c3'] }, node_id: 'n1' },
      orderBy: { created_at: 'asc' },
    });
  });
});

describe('ensureRulesForCanvas', () => {
  function makeNodes(input: Array<{ id: string; iceType?: string; data?: Record<string, unknown> }>) {
    return input.map((n) => ({ id: n.id, data: { iceType: n.iceType, ...(n.data || {}) } }));
  }

  it('skips edges that have no Source.Repository endpoint', async () => {
    const nodes = makeNodes([
      { id: 'a', iceType: 'Compute.CloudRun' },
      { id: 'b', iceType: 'Compute.Bucket' },
    ]);
    const result = await ensureRulesForCanvas(
      'card',
      nodes,
      [{ source: 'a', target: 'b' }],
      'org',
      'user',
      'production',
    );
    expect(result.created).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(ruleCreate).not.toHaveBeenCalled();
  });

  it('skips edges where the non-repo node is not a Compute.*', async () => {
    const nodes = makeNodes([
      { id: 'r', iceType: 'Source.Repository', data: { repository: 'o/r' } },
      { id: 's', iceType: 'Storage.Bucket' },
    ]);
    const result = await ensureRulesForCanvas(
      'c',
      nodes,
      [{ source: 'r', target: 's' }],
      'org',
      'user',
      'production',
    );
    expect(result.created).toEqual([]);
    expect(ruleCreate).not.toHaveBeenCalled();
  });

  it('skips when the repo node has no repository value', async () => {
    const nodes = makeNodes([
      { id: 'r', iceType: 'Source.Repository', data: {} },
      { id: 'c', iceType: 'Compute.CloudRun' },
    ]);
    const result = await ensureRulesForCanvas(
      'card',
      nodes,
      [{ source: 'r', target: 'c' }],
      'org',
      'user',
      'production',
    );
    expect(result.created).toEqual([]);
    expect(ruleCreate).not.toHaveBeenCalled();
  });

  it('creates a rule per Source.Repository → Compute edge and forwards repo metadata', async () => {
    ruleFindFirst.mockResolvedValue(null);
    ruleCreate.mockImplementation(async ({ data }: any) => ({ id: `rule-${data.node_id}`, ...data }));
    ruleUpdate.mockImplementation(async ({ where }: any) => ({ id: where.id }));
    registerWebhook.mockResolvedValue({ status: 'registered', webhookId: 1 });

    const nodes = makeNodes([
      {
        id: 'r',
        iceType: 'Source.Repository',
        data: {
          repository: 'acme/web',
          branch: 'develop',
          buildCommand: 'pnpm build',
          installCommand: 'pnpm install',
          outputDirectory: 'dist',
          framework: 'next',
        },
      },
      { id: 'c', iceType: 'Compute.CloudRun' },
    ]);

    const result = await ensureRulesForCanvas(
      'card-1',
      nodes,
      [{ source: 'r', target: 'c' }],
      'org-1',
      'user-1',
      'production',
    );

    expect(result.errors).toEqual([]);
    expect(result.created).toHaveLength(1);
    expect(result.created[0]).toMatchObject({
      nodeId: 'c',
      repository: 'acme/web',
      webhookStatus: 'registered',
    });

    expect(ruleCreate).toHaveBeenCalledTimes(1);
    const data = ruleCreate.mock.calls[0]![0].data;
    expect(data.branch_pattern).toBe('develop');
    expect(data.build_command).toBe('pnpm build');
    expect(data.install_command).toBe('pnpm install');
    expect(data.output_dir).toBe('dist');
    expect(data.framework).toBe('next');
  });

  it('records errors when createRule throws but keeps processing other edges', async () => {
    ruleFindFirst.mockResolvedValue(null);
    let calls = 0;
    ruleCreate.mockImplementation(async ({ data }: any) => {
      calls += 1;
      if (calls === 1) throw new Error('db disconnect');
      return { id: 'r2', ...data };
    });
    ruleUpdate.mockResolvedValue({ id: 'r2' });
    registerWebhook.mockResolvedValue({ status: 'registered' });

    const nodes = makeNodes([
      { id: 'r', iceType: 'Source.Repository', data: { repository: 'a/b' } },
      { id: 'c1', iceType: 'Compute.CloudRun' },
      { id: 'c2', iceType: 'Compute.CloudFunction' },
    ]);

    const result = await ensureRulesForCanvas(
      'card',
      nodes,
      [
        { source: 'r', target: 'c1' },
        { source: 'r', target: 'c2' },
      ],
      'org',
      'user',
      'production',
    );

    expect(result.errors).toEqual([{ nodeId: 'c1', repository: 'a/b', error: 'db disconnect' }]);
    expect(result.created).toHaveLength(1);
    expect(result.created[0]!.nodeId).toBe('c2');
  });

  it('handles reversed edge direction (Compute.* → Source.Repository)', async () => {
    ruleFindFirst.mockResolvedValue(null);
    ruleCreate.mockImplementation(async ({ data }: any) => ({ id: 'r', ...data }));
    ruleUpdate.mockResolvedValue({ id: 'r' });
    registerWebhook.mockResolvedValue({ status: 'registered' });

    const nodes = makeNodes([
      { id: 'c', iceType: 'Compute.CloudRun' },
      { id: 'r', iceType: 'Source.Repository', data: { repository: 'o/r' } },
    ]);

    const result = await ensureRulesForCanvas(
      'card',
      nodes,
      [{ source: 'c', target: 'r' }], // reversed
      'org',
      'user',
      'production',
    );

    expect(result.created).toHaveLength(1);
    expect(result.created[0]!.nodeId).toBe('c');
  });

  it('falls back to the compute node data when Source.Repository node has no repository', async () => {
    ruleFindFirst.mockResolvedValue(null);
    ruleCreate.mockImplementation(async ({ data }: any) => ({ id: 'r', ...data }));
    ruleUpdate.mockResolvedValue({ id: 'r' });
    registerWebhook.mockResolvedValue({ status: 'registered' });

    const nodes = makeNodes([
      { id: 'r', iceType: 'Source.Repository', data: {} },
      { id: 'c', iceType: 'Compute.CloudRun', data: { repository: 'inline/repo', branch: 'staging' } },
    ]);

    const result = await ensureRulesForCanvas(
      'card',
      nodes,
      [{ source: 'r', target: 'c' }],
      'org',
      'user',
      'production',
    );

    expect(result.created).toHaveLength(1);
    expect(result.created[0]!.repository).toBe('inline/repo');
    expect(ruleCreate.mock.calls[0]![0].data.branch_pattern).toBe('staging');
  });
});

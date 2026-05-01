/**
 * Deployment rule lifecycle: create / update / delete / fetch by node,
 * plus the canvas-edge auto-creator that materializes rules from
 * Source.Repository → Compute edges at deploy time.
 *
 * Extracted from `pipeline.service.ts` (rf-pipe-2). The webhook
 * registration is delegated to `./github-webhooks.ts` — rule creation
 * fires registration as a best-effort side-effect: a rule is useful
 * even if the webhook fails (manual deploys still work), and the
 * webhook status/error is persisted on the rule row for the UI.
 */

import crypto from 'crypto';
import prisma from '@ice/db';
import { type CreateRuleInput } from './types.js';
import { registerGitHubWebhook, unregisterGitHubWebhook } from './github-webhooks.js';

/**
 * Walk the deploy graph for Source.Repository → Compute edges and ensure
 * a DeploymentRule + GitHub webhook exists for each pair. Idempotent —
 * if a rule already exists, it's left alone (createRule's existing
 * findFirst+update path handles that).
 *
 * Why this lives here and not in the UI properties panel: the user
 * shouldn't have to click into the Source.Repository block's properties
 * just to enable push-to-deploy. The deploy is the moment they say "I
 * want this connected to my repo" — so we set up the webhook then.
 *
 * Returns the rules that were created or adopted, plus any errors so
 * the caller can surface them in the deploy log without failing the
 * deploy itself.
 */
export async function ensureRulesForCanvas(
  cardId: string,
  nodes: Array<{ id: string; type?: string; data?: Record<string, unknown> }>,
  edges: Array<{ source: string; target: string }>,
  organisationId: string,
  userId: string,
  defaultEnvironment: string,
): Promise<{
  created: Array<{ ruleId: string; nodeId: string; repository: string; webhookStatus?: string }>;
  errors: Array<{ nodeId: string; repository: string; error: string }>;
}> {
  const created: Array<{ ruleId: string; nodeId: string; repository: string; webhookStatus?: string }> = [];
  const errors: Array<{ nodeId: string; repository: string; error: string }> = [];

  const nodesById = new Map(nodes.map((n) => [n.id, n]));

  for (const edge of edges) {
    const src = nodesById.get(edge.source);
    const dst = nodesById.get(edge.target);
    if (!src || !dst) continue;

    let repoNode: typeof src;
    let computeNode: typeof src;
    if ((src.data?.iceType as string) === 'Source.Repository') {
      repoNode = src;
      computeNode = dst;
    } else if ((dst.data?.iceType as string) === 'Source.Repository') {
      repoNode = dst;
      computeNode = src;
    } else {
      continue;
    }

    const computeIce = (computeNode.data?.iceType as string) || '';
    if (!computeIce.startsWith('Compute.')) continue;

    // Repo data lives on the Source.Repository node OR (if the user
    // typed it directly into the compute block's properties) on the
    // compute node itself. Prefer the source node value.
    const repository = String(repoNode.data?.repository || (computeNode.data as any)?.repository || '').trim();
    if (!repository) continue;

    const branch = String(repoNode.data?.branch || (computeNode.data as any)?.branch || 'main').trim() || 'main';
    const buildCommand = String(repoNode.data?.buildCommand || '').trim() || undefined;
    const installCommand = String(repoNode.data?.installCommand || '').trim() || undefined;
    const outputDir = String(repoNode.data?.outputDirectory || '').trim() || undefined;
    const framework =
      String(repoNode.data?.framework || (computeNode.data as any)?.framework || '').trim() || undefined;

    try {
      const rule = await createRule(
        {
          cardId,
          nodeId: computeNode.id,
          repository,
          triggerType: 'push',
          branchPattern: branch,
          environment: defaultEnvironment,
          buildCommand,
          installCommand,
          outputDir,
          framework,
        },
        organisationId,
        userId,
      );
      created.push({
        ruleId: rule.id,
        nodeId: computeNode.id,
        repository,
        webhookStatus: (rule as any).webhook_status,
      });
    } catch (err: any) {
      errors.push({ nodeId: computeNode.id, repository, error: err?.message || String(err) });
    }
  }

  return { created, errors };
}

export async function createRule(input: CreateRuleInput, organisationId: string, userId: string) {
  const branchPattern = input.branchPattern || 'main';

  // Idempotent by design: if a rule for this (card_id, node_id, branch_pattern)
  // already exists, return it and update any changed fields. The DB has a
  // unique index on those three columns, so a blind `.create()` throws
  // P2002 on the second call. Callers (the UI, React StrictMode double-
  // mount, tests) legitimately re-trigger creation and expect idempotency.
  const existing = await prisma.deploymentRule.findFirst({
    where: {
      card_id: input.cardId,
      node_id: input.nodeId,
      branch_pattern: branchPattern,
    },
  });

  if (existing) {
    // Update mutable fields (repository, framework, commands, environment)
    // but keep the webhook_secret / webhook_id stable — rotating the
    // secret would invalidate the existing GitHub webhook.
    const updated = await prisma.deploymentRule.update({
      where: { id: existing.id },
      data: {
        repository: input.repository,
        trigger_type: input.triggerType || existing.trigger_type,
        environment: input.environment || existing.environment,
        build_command: input.buildCommand ?? existing.build_command,
        install_command: input.installCommand ?? existing.install_command,
        output_dir: input.outputDir ?? existing.output_dir,
        framework: input.framework ?? existing.framework,
      },
    });
    return {
      ...updated,
      webhook_status: existing.webhook_status,
      webhook_error: existing.webhook_error,
    };
  }

  const webhookSecret = crypto.randomBytes(32).toString('hex');

  const rule = await prisma.deploymentRule.create({
    data: {
      card_id: input.cardId,
      node_id: input.nodeId,
      repository: input.repository,
      trigger_type: input.triggerType || 'push',
      branch_pattern: branchPattern,
      environment: input.environment || 'production',
      build_command: input.buildCommand,
      install_command: input.installCommand,
      output_dir: input.outputDir,
      framework: input.framework,
      webhook_secret: webhookSecret,
      organisation_id: organisationId,
      created_by: userId,
    },
  });

  // Register webhook on GitHub (best-effort — don't fail rule creation).
  //
  // Webhook registration is a separate concern from the rule itself: the
  // rule is useful even without a webhook (manual triggers still work),
  // and fine-grained PATs often lack the repo:admin permission needed to
  // create webhooks. Previously the caller only saw a generic stack trace
  // in the gateway log; now the failure mode and remediation are stored
  // on the rule row and surfaced to the UI via `webhook_status` /
  // `webhook_error`.
  const webhookResult = await registerGitHubWebhook(userId, input.repository, webhookSecret);
  await prisma.deploymentRule.update({
    where: { id: rule.id },
    data: {
      webhook_id: webhookResult.webhookId,
      webhook_status: webhookResult.status,
      webhook_error: webhookResult.error,
    },
  });

  if (webhookResult.status === 'failed') {
    // Single clean warning line — no stack trace, no misleading "Error:"
    // prefix. The details are persisted on the rule for the UI to show.
    console.warn(
      `[pipeline] Webhook not registered for ${input.repository} — ${webhookResult.error}. ` +
        `The rule was created and works for manual deploys; auto-deploy on push will not trigger until this is resolved.`,
    );
  }

  return { ...rule, webhook_status: webhookResult.status, webhook_error: webhookResult.error };
}

export async function updateRule(
  ruleId: string,
  updates: Partial<CreateRuleInput> & { enabled?: boolean },
  organisationId: string,
) {
  return prisma.deploymentRule.update({
    where: { id: ruleId, organisation_id: organisationId },
    data: {
      trigger_type: updates.triggerType,
      branch_pattern: updates.branchPattern,
      environment: updates.environment,
      build_command: updates.buildCommand,
      install_command: updates.installCommand,
      output_dir: updates.outputDir,
      framework: updates.framework,
      enabled: updates.enabled,
    },
  });
}

export async function deleteRule(ruleId: string, userId: string, organisationId: string) {
  const rule = await prisma.deploymentRule.findFirst({
    where: { id: ruleId, organisation_id: organisationId },
  });
  if (!rule) throw new Error('Rule not found');

  // Remove webhook from GitHub (best-effort)
  if (rule.webhook_id) {
    try {
      await unregisterGitHubWebhook(userId, rule.repository, rule.webhook_id);
    } catch (err) {
      console.warn(`Failed to remove webhook ${rule.webhook_id}:`, err);
    }
  }

  await prisma.deploymentRule.delete({ where: { id: ruleId } });
}

export async function getRulesForNode(cardId: string, nodeId: string) {
  // Find all cards in the same project (for Canvas Branching — rules are shared across environments)
  const card = await prisma.canvasCard.findUnique({ where: { id: cardId }, select: { project_id: true } });
  if (!card) return [];

  const projectCards = await prisma.canvasCard.findMany({
    where: { project_id: card.project_id },
    select: { id: true },
  });
  const cardIds = projectCards.map((c) => c.id);

  return prisma.deploymentRule.findMany({
    where: { card_id: { in: cardIds }, node_id: nodeId },
    orderBy: { created_at: 'asc' },
  });
}

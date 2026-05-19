/**
 * GitHub Webhook Handler
 *
 * POST /api/webhooks/github — receives push/PR events from GitHub
 *
 * Flow:
 * 1. Verify HMAC-SHA256 signature
 * 2. Deduplicate via WebhookDelivery table
 * 3. Match against DeploymentRules
 * 4. Queue pipeline deploy jobs
 */

import crypto from 'crypto';
import prisma from '@ice/db';
import { Router, type Router as RouterType, type Request, type Response } from 'express';
import {
  matchRulesForPush,
  matchRulesForMerge,
  shouldSkipDuplicate,
  createDeploymentEvent,
  updateEventProgress,
  failEvent,
} from '../services/pipeline.service';
import { getDeployQueue } from '../services/queue.service';

const router: RouterType = Router();

// ─── Raw body parsing (needed for HMAC verification) ────────────────────────

// Note: express.json() must NOT be applied to this route.
// The raw body is required for signature verification.
// We use express.raw() at the route level.

router.post('/github', async (req: Request, res: Response) => {
  const event = req.headers['x-github-event'] as string;
  const deliveryId = req.headers['x-github-delivery'] as string;
  const signature = req.headers['x-hub-signature-256'] as string;

  if (!event || !deliveryId) {
    return res.status(400).json({ error: 'Missing GitHub event headers' });
  }

  // Get the raw body buffer (provided by express.raw() in gateway)
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
  const payload = JSON.parse(rawBody.toString('utf8'));

  // ── Idempotency check ──
  try {
    await prisma.webhookDelivery.create({
      data: { delivery_id: deliveryId, event, processed: false },
    });
  } catch (err: any) {
    // Unique constraint violation = already processed
    if (err.code === 'P2002') {
      return res.status(200).json({ message: 'Already processed' });
    }
    // Express 4 has no default async-error handler. Re-throwing here
    // would leave the request hanging until the client times out (see
    // findings.md #8). Convert to a 500 response in the same shape as
    // the lower catch arm.
    console.error(`Webhook idempotency-write error (${event}):`, err);
    return res.status(500).json({ error: err.message ?? 'Idempotency check failed' });
  }

  // ── Route by event type ──
  try {
    let result = 'ignored';

    switch (event) {
      case 'push':
        result = await handlePushEvent(payload, rawBody, signature);
        break;
      case 'pull_request':
        result = await handlePullRequestEvent(payload, rawBody, signature);
        break;
      case 'ping':
        result = 'pong';
        break;
      default:
        result = `unhandled event: ${event}`;
    }

    // Mark as processed
    await prisma.webhookDelivery.update({
      where: { delivery_id: deliveryId },
      data: { processed: true, result },
    });

    res.status(200).json({ message: result });
  } catch (err: any) {
    console.error(`Webhook error (${event}):`, err);

    await prisma.webhookDelivery
      .update({
        where: { delivery_id: deliveryId },
        data: { processed: true, result: `error: ${err.message}` },
      })
      .catch(() => {});

    res.status(500).json({ error: err.message });
  }
});

// ─── Push Event Handler ─────────────────────────────────────────────────────

async function handlePushEvent(payload: any, rawBody: Buffer, signature: string): Promise<string> {
  const repo = payload.repository?.full_name;
  if (!repo) return 'no repository in payload';

  // Extract branch from ref (refs/heads/main → main)
  const ref: string = payload.ref || '';
  if (!ref.startsWith('refs/heads/')) return 'not a branch push';
  const branch = ref.replace('refs/heads/', '');

  // Ignore branch deletion pushes
  if (payload.deleted) return 'branch deletion — skipped';

  const headCommit = payload.head_commit;
  const commitSha = headCommit?.id || payload.after;
  const commitMessage = headCommit?.message || '';
  const commitAuthor = headCommit?.author?.username || headCommit?.author?.name || '';

  // Find matching rules
  const rules = await matchRulesForPush(repo, branch, commitSha);
  if (rules.length === 0) return `no matching rules for ${repo}:${branch}`;

  // Verify HMAC signature against raw body — require a webhook secret on all rules
  const rulesWithSecrets = rules.filter((r) => r.webhook_secret);
  if (rulesWithSecrets.length === 0) {
    console.warn(`No webhook secret configured for rules matching ${repo}. Rejecting.`);
    return 'rejected: no webhook secret configured — set a webhook secret on your deployment rules';
  }

  if (!signature) {
    console.warn(`No signature header for ${repo}`);
    return 'rejected: missing x-hub-signature-256 header';
  }

  const signatureValid = rulesWithSecrets.some((rule) => verifySignature(rawBody, signature, rule.webhook_secret!));

  if (!signatureValid) {
    console.warn(`Invalid webhook signature for ${repo}`);
    return 'invalid signature';
  }

  let deployed = 0;
  let skipped = 0;

  for (const rule of rules) {
    // Commit deduplication: skip if last deploy of same SHA failed
    const shouldSkip = await shouldSkipDuplicate(rule.id, commitSha);
    if (shouldSkip) {
      skipped++;
      continue;
    }

    // Create deployment event
    const event = await createDeploymentEvent(rule.id, 'push', commitSha, branch, commitMessage, commitAuthor);

    // Queue the pipeline job
    try {
      const queue = getDeployQueue();
      await queue.add(
        'pipeline',
        {
          type: 'pipeline',
          eventId: event.id,
          ruleId: rule.id,
          cardId: rule.card_id,
          nodeId: rule.node_id,
          repository: rule.repository,
          branch,
          commitSha,
          commitMessage,
          commitAuthor,
          environment: rule.environment,
          buildCommand: rule.build_command,
          installCommand: rule.install_command,
          outputDir: rule.output_dir,
          framework: rule.framework,
        },
        {
          attempts: 1, // Pipeline deploys don't auto-retry
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      );

      await updateEventProgress(event.id, 'queued', 'Queued for deployment');
      deployed++;
    } catch (err: any) {
      await failEvent(event.id, `Failed to queue: ${err.message}`);
    }
  }

  return `processed: ${deployed} deployed, ${skipped} skipped`;
}

// ─── Pull Request Event Handler ─────────────────────────────────────────────

async function handlePullRequestEvent(payload: any, _rawBody: Buffer, _signature: string): Promise<string> {
  const action = payload.action;
  const repo = payload.repository?.full_name;
  const prNumber = payload.pull_request?.number;
  const prBranch = payload.pull_request?.head?.ref;

  // ── PR opened/synchronized → create ephemeral environment ──
  if ((action === 'opened' || action === 'synchronize') && prNumber && prBranch) {
    try {
      // Dynamic cross-package import — canvas depends on deploy, so we avoid
      // a static circular dep. Typed as any because the module is resolved at runtime.

      const mod = (await import('@ice/service-canvas' as any)) as any;
      const { createEnvironment, findEnvironmentByName } = mod;

      // Find projects with pr_previews_enabled that have rules for this repo
      const rules = await prisma.deploymentRule.findMany({
        where: { repository: repo, enabled: true },
      });

      const projectIds = new Set<string>();
      for (const rule of rules) {
        const card = await prisma.canvasCard.findUnique({ where: { id: rule.card_id }, select: { project_id: true } });
        if (card) projectIds.add(card.project_id);
      }

      let created = 0;
      for (const projectId of projectIds) {
        const project = await prisma.canvasProject.findUnique({ where: { id: projectId } });
        if (!project?.pr_previews_enabled) continue;

        const envName = `pr-${prNumber}`;
        const existing = await findEnvironmentByName(projectId, envName);
        if (existing) continue; // Already exists (synchronize event)

        const newEnv = await createEnvironment(projectId, 'system', envName, 'pr', undefined, prNumber, prBranch, repo);
        created++;

        // Queue a deploy for the new PR environment
        try {
          const prRules = await prisma.deploymentRule.findMany({
            where: { card_id: newEnv.card.id, enabled: true },
          });
          for (const rule of prRules) {
            const commitSha = payload.pull_request?.head?.sha || 'HEAD';
            const event = await createDeploymentEvent(
              rule.id,
              'push',
              commitSha,
              prBranch,
              `PR #${prNumber}: ${payload.pull_request?.title || ''}`,
              payload.pull_request?.user?.login,
            );
            const queue = getDeployQueue();
            await queue.add(
              'pipeline',
              {
                type: 'pipeline',
                eventId: event.id,
                ruleId: rule.id,
                cardId: rule.card_id,
                nodeId: rule.node_id,
                repository: rule.repository,
                branch: prBranch,
                commitSha,
                environment: envName,
                buildCommand: rule.build_command,
                installCommand: rule.install_command,
                outputDir: rule.output_dir,
                framework: rule.framework,
              },
              { attempts: 1, removeOnComplete: 100, removeOnFail: 100 },
            );
          }
        } catch (deployErr: any) {
          console.warn(`Failed to queue deploy for PR #${prNumber} env:`, deployErr);
        }
      }

      if (created > 0) return `PR #${prNumber} opened: ${created} ephemeral env(s) created + deployed`;
    } catch (err: any) {
      console.error(`Failed to create ephemeral env for PR #${prNumber}:`, err);
    }
  }

  // ── PR closed → destroy ephemeral environment ──
  if (action === 'closed' && prNumber) {
    try {
      const mod = (await import('@ice/service-canvas' as any)) as any;
      const { closePrEnvironment } = mod;
      await closePrEnvironment(repo, prNumber);
    } catch (err: any) {
      console.error(`Failed to close ephemeral env for PR #${prNumber}:`, err);
    }

    // If merged, also trigger deploy rules
    if (!payload.pull_request?.merged) {
      return `PR #${prNumber} closed (not merged) — ephemeral env destroyed`;
    }
  }

  // ── Merged PR → trigger deploy rules ──
  if (action !== 'closed' || !payload.pull_request?.merged) {
    return `PR ${action} — handled`;
  }

  const targetBranch = payload.pull_request.base?.ref;
  const commitSha = payload.pull_request.merge_commit_sha;
  const commitMessage = payload.pull_request.title;
  const commitAuthor = payload.pull_request.user?.login;

  if (!targetBranch || !commitSha) return 'missing branch/commit info';

  const rules = await matchRulesForMerge(repo, targetBranch);
  if (rules.length === 0) return `no merge rules for ${repo}:${targetBranch}`;

  let deployed = 0;

  for (const rule of rules) {
    const shouldSkip = await shouldSkipDuplicate(rule.id, commitSha);
    if (shouldSkip) continue;

    const event = await createDeploymentEvent(rule.id, 'merge', commitSha, targetBranch, commitMessage, commitAuthor);

    try {
      const queue = getDeployQueue();
      await queue.add(
        'pipeline',
        {
          type: 'pipeline',
          eventId: event.id,
          ruleId: rule.id,
          cardId: rule.card_id,
          nodeId: rule.node_id,
          repository: rule.repository,
          branch: targetBranch,
          commitSha,
          commitMessage,
          commitAuthor,
          environment: rule.environment,
          buildCommand: rule.build_command,
          installCommand: rule.install_command,
          outputDir: rule.output_dir,
          framework: rule.framework,
        },
        {
          attempts: 1,
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      );

      await updateEventProgress(event.id, 'queued', 'Queued for deployment');
      deployed++;
    } catch (err: any) {
      await failEvent(event.id, `Failed to queue: ${err.message}`);
    }
  }

  return `merge processed: ${deployed} deployed`;
}

// ─── HMAC Verification ──────────────────────────────────────────────────────

function verifySignature(body: Buffer, signature: string, secret: string): boolean {
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export default router;

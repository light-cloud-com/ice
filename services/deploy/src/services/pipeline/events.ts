/**
 * Deployment event lifecycle: query by node, create, progress, fail.
 *
 * Extracted from `pipeline.service.ts` (rf-pipe-3). The webhook +
 * pipeline socket updates fire from `updateEventProgress` — every
 * status change pushes both a per-node update (so a single node's
 * pipeline panel can stream commits) and a per-card update (so the
 * card-level dashboard can re-render).
 *
 * `failEvent` is a thin wrapper: it logs a synthetic "error" step
 * onto deployment_logs, then forwards to `updateEventProgress` with
 * `status='failed'`. The wrapper exists so callers don't have to
 * keep re-typing the timestamp + step shape.
 */

import prisma from '@ice/db';
import { emitPipelineUpdate, emitCardPipelineUpdate } from '@ice/shared';
import { type DeployStep } from './types.js';

export async function getEventsForNode(cardId: string, nodeId: string, limit = 20) {
  // Find all cards in the same project (rules are shared across environments)
  const card = await prisma.canvasCard.findUnique({ where: { id: cardId }, select: { project_id: true } });
  if (!card) return [];

  const projectCards = await prisma.canvasCard.findMany({
    where: { project_id: card.project_id },
    select: { id: true },
  });
  const cardIds = projectCards.map((c) => c.id);

  const rules = await prisma.deploymentRule.findMany({
    where: { card_id: { in: cardIds }, node_id: nodeId },
    select: { id: true },
  });
  const ruleIds = rules.map((r) => r.id);
  if (ruleIds.length === 0) return [];

  return prisma.deploymentEvent.findMany({
    where: { rule_id: { in: ruleIds } },
    orderBy: { started_at: 'desc' },
    take: limit,
    include: { rule: { select: { branch_pattern: true, environment: true } } },
  });
}

export async function createDeploymentEvent(
  ruleId: string,
  trigger: string,
  commitSha: string,
  branch: string,
  commitMessage?: string,
  commitAuthor?: string,
) {
  // Cancel any existing queued events for this rule
  await prisma.deploymentEvent.updateMany({
    where: { rule_id: ruleId, status: { in: ['queued'] } },
    data: { status: 'cancelled' },
  });

  return prisma.deploymentEvent.create({
    data: {
      rule_id: ruleId,
      trigger,
      commit_sha: commitSha,
      commit_message: commitMessage,
      commit_author: commitAuthor,
      branch,
      status: 'queued',
      deployment_stage: 'Queued for deployment',
      deployment_logs: [],
    },
  });
}

export async function updateEventProgress(eventId: string, status: string, stage: string, step?: DeployStep) {
  const event = await prisma.deploymentEvent.findUnique({ where: { id: eventId } });
  if (!event) return;

  const logs = (event.deployment_logs as unknown as DeployStep[]) || [];
  if (step) logs.push(step);

  const updates: any = {
    status,
    deployment_stage: stage,
    deployment_logs: logs,
  };

  if (status === 'success' || status === 'failed') {
    updates.completed_at = new Date();
    updates.duration_seconds = Math.round((Date.now() - event.started_at.getTime()) / 1000);
  }

  const updated = await prisma.deploymentEvent.update({
    where: { id: eventId },
    data: updates,
    include: { rule: true },
  });

  // Emit real-time updates
  emitPipelineUpdate(updated.rule.node_id, {
    nodeId: updated.rule.node_id,
    cardId: updated.rule.card_id,
    status: updated.status,
    deployment_stage: updated.deployment_stage,
    deployment_logs: updated.deployment_logs,
    commit_sha: updated.commit_sha,
    commit_message: updated.commit_message,
    commit_author: updated.commit_author,
    branch: updated.branch,
    progress: statusToProgress(updated.status),
    error: updated.error,
    started_at: updated.started_at.toISOString(),
    duration_seconds: updated.duration_seconds,
  });

  emitCardPipelineUpdate(updated.rule.card_id, {
    nodeId: updated.rule.node_id,
    status: updated.status,
    deployment_stage: updated.deployment_stage,
    commit_sha: updated.commit_sha,
    commit_message: updated.commit_message,
    progress: statusToProgress(updated.status),
  });

  return updated;
}

export async function failEvent(eventId: string, error: string) {
  const event = await prisma.deploymentEvent.findUnique({ where: { id: eventId } });
  if (!event) return;

  const logs = (event.deployment_logs as unknown as DeployStep[]) || [];
  logs.push({
    step: 'error',
    status: 'failed',
    message: error,
    timestamp: new Date().toISOString(),
  });

  return updateEventProgress(eventId, 'failed', `Failed: ${error}`, undefined);
}

/**
 * Map a textual deployment status onto a 0–100 progress integer for
 * UI progress bars. Kept here because it's only consumed by
 * `updateEventProgress` — emit consumers receive the resolved number,
 * not the function.
 */
function statusToProgress(status: string): number {
  switch (status) {
    case 'queued':
      return 0;
    case 'building':
      return 33;
    case 'deploying':
      return 66;
    case 'success':
      return 100;
    case 'failed':
      return 100;
    default:
      return 0;
  }
}

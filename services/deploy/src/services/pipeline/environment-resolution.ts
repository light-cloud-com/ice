/**
 * Canvas Branching environment-name → card-id resolver.
 *
 * Extracted from `pipeline.service.ts` (rf-pipe-7). A DeploymentRule
 * carries a card_id (the card the rule was created on) plus an
 * environment name (e.g. "production" / "staging"). When a webhook
 * fires we want to deploy onto the card representing THAT named
 * environment in the same project, not necessarily the rule's
 * original card. This resolver looks up the Environment row by
 * (project_id, name) and returns its card_id; on any error or
 * missing row it falls back to the original card_id so the deploy
 * still happens (best-effort routing).
 *
 * Pure DB-access helper, lives in its own module so the
 * pipeline.service.ts shim is purely re-exports.
 */

import prisma from '@ice/db';

/**
 * Given a card_id from a DeploymentRule and an environment name,
 * find the project that owns that card, then find the environment
 * by name, and return its card_id. Falls back to the original cardId.
 */
export async function resolveEnvironmentCardId(ruleCardId: string, environmentName: string): Promise<string> {
  try {
    const card = await prisma.canvasCard.findUnique({
      where: { id: ruleCardId },
      select: { project_id: true },
    });
    if (!card) return ruleCardId;

    const env = await prisma.environment.findFirst({
      where: { project_id: card.project_id, name: environmentName },
      select: { card_id: true },
    });

    return env?.card_id ?? ruleCardId;
  } catch {
    return ruleCardId;
  }
}

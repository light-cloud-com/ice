/**
 * Pipeline Service — CI/CD deployment rules, webhook registration, framework detection
 *
 * Manages DeploymentRules that map GitHub push/merge events to deployments.
 * Registers webhooks on GitHub repos and processes incoming events.
 */

import prisma from '@ice/db';

export {
  ensureRulesForCanvas,
  createRule,
  updateRule,
  deleteRule,
  getRulesForNode,
} from './pipeline/rule-management.js';
export {
  getEventsForNode,
  createDeploymentEvent,
  updateEventProgress,
  failEvent,
} from './pipeline/events.js';
export {
  matchRulesForPush,
  matchRulesForMerge,
  shouldSkipDuplicate,
} from './pipeline/rule-matching.js';
export { detectFramework } from './pipeline/framework-detection.js';
export type { DeployStep, FrameworkDetection } from './pipeline/types.js';

// ─── Environment Resolution (for Canvas Branching) ──────────────────────────

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

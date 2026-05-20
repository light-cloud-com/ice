/**
 * Pipeline Service — CI/CD deployment rules, webhook registration, framework detection.
 *
 * This module is a thin re-export shim over the `pipeline/` subdirectory.
 * The implementation was decomposed in the rf-pipe series (rf-pipe-1..7)
 * across:
 *
 *   - pipeline/types.ts                — shared types + GitHub API constants
 *   - pipeline/rule-management.ts      — rule CRUD + canvas-edge auto-creator
 *   - pipeline/events.ts               — deployment event lifecycle
 *   - pipeline/rule-matching.ts        — webhook → rule matchers + duplicate guard
 *   - pipeline/github-webhooks.ts      — GitHub auth + webhook lifecycle
 *   - pipeline/framework-detection.ts  — repo framework probe via Contents API
 *   - pipeline/environment-resolution.ts — Canvas Branching env → card_id resolver
 *
 * External consumers (queue.service, routes/pipeline.ts, routes/webhooks.ts,
 * deploy.service via dynamic import) should keep importing from this shim
 * to insulate themselves from internal restructuring of the pipeline
 * subdirectory.
 */

export { ensureRulesForCanvas, createRule, updateRule, deleteRule, getRulesForNode } from './pipeline/rule-management';
export { getEventsForNode, createDeploymentEvent, updateEventProgress, failEvent } from './pipeline/events';
export { matchRulesForPush, matchRulesForMerge, shouldSkipDuplicate } from './pipeline/rule-matching';
export { detectFramework } from './pipeline/framework-detection';
export { resolveEnvironmentCardId } from './pipeline/environment-resolution';
export type { DeployStep, FrameworkDetection } from './pipeline/types';

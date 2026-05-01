/**
 * Deploy Service — Real deployment using @ice/core deployers
 *
 * Translates canvas card nodes → deployable graph → cloud provisioning.
 * Uses user's own cloud credentials (not Light Cloud's).
 */

import prisma from '@ice/db';
import * as providerService from '@ice/service-credentials';
import {
  acquireDeployLock,
  cancelDeploy as cancelLockDeploy,
  DeployLockError,
  finishDeploySnapshot,
  getDeploySnapshot,
  releaseTempDir,
  startDeploySnapshot,
  type DeployProgressSnapshot,
} from './deploy-locks.js';
import {
  getExistingNameMap,
  getResourceMap,
  seedMappingsFromHistory,
  upsertResourceMapping,
  removeResourceMapping,
} from './resource-mapping.service.js';
import { resolveProviderAuth, cleanupProviderAuth } from '../providers/registry.js';
import { computeCompleteTotals, deriveCompleteOutcome, computeDeploySummary } from '../utils/deploy-outcome.js';
import { buildResourceNameMaps, makeFindSourceNodeId } from '../utils/find-source-node-id.js';
import { resolveProjectContext } from '../utils/project-context.js';
import { createDeployer, getCoreEngine } from './deployer-factory.js';
import { autoEnableGCPApis } from './gcp-api-enabler.js';
import { installSnapshotPersister, flushSnapshotNow } from './snapshot-persister.js';
import { acquireWriteLock } from './deploy-lock-wrapper.js';
import { emitDeployEvent, emitLog } from './deploy-event-dispatcher.js';
import { makeSchedulerCallbacks } from './scheduler-callbacks.js';
import { buildBaselineGraph } from './baseline-graph.js';
import {
  collectDestroyAllTargets,
  orderTargetsForDelete,
  resolveDestroyAllProject,
} from './destroy-targets.js';
import { attemptDestroy, emitDestroyLifecycle } from './destroy-runner.js';
import { retryAfterQuotaCleanup } from './quota-retry.js';

installSnapshotPersister();

export type { DeployProgressSnapshot } from './deploy-locks.js';

/** Public re-export so routes can hit the cancel machinery directly. */
export function requestDeployCancel(cardId: string): boolean {
  return cancelLockDeploy(cardId);
}

/** Read the in-memory snapshot of an in-flight deploy for a card. */
export function getCurrentDeploySnapshot(cardId: string) {
  return getDeploySnapshot(cardId);
}

// `planDeployment` was extracted to `./plan-deployment.ts` in rf-deploy2-1.
// Re-export so `routes/canvas-deploy.ts`'s `import * as deployService`
// namespace import keeps resolving and `services/deploy/src/index.ts`'s
// `export *` continues to surface the public API.
export { planDeployment } from './plan-deployment.js';

// `applyDeployment` was extracted to `./apply-deployment.ts` in rf-deploy2-2.
// Re-export so `routes/canvas-deploy.ts`'s `import * as deployService`
// namespace import keeps resolving and `services/queue.service.ts`'s
// `import { applyDeployment } from './deploy.service'` continues to work.
export { applyDeployment } from './apply-deployment.js';

// `destroyAllForCard` was extracted to `./destroy-all-for-card.ts` in
// rf-deploy2-3. Re-export so `routes/canvas-deploy.ts`'s namespace
// import keeps resolving the symbol.
export { destroyAllForCard } from './destroy-all-for-card.js';

// `destroyDeployment` was extracted to `./destroy-deployment.ts` in
// rf-deploy2-4. Re-export so `routes/canvas-deploy.ts`'s namespace
// import keeps resolving the symbol.
export { destroyDeployment } from './destroy-deployment.js';

// `rollbackDeployment` was extracted to `./rollback-deployment.ts` in
// rf-deploy2-5. Re-export so `routes/canvas-deploy.ts`'s namespace
// import keeps resolving the symbol.
export { rollbackDeployment } from './rollback-deployment.js';

export async function getDeploymentStatus(deploymentId: string) {
  return prisma.canvasDeployment.findUnique({ where: { id: deploymentId } });
}

export async function getDeployedResources(cardId: string) {
  const deployment = await prisma.canvasDeployment.findFirst({
    where: { card_id: cardId, status: 'success' },
    orderBy: { created_at: 'desc' },
  });
  return deployment?.results || [];
}

// `getNodeDeploymentOverlay` was extracted to `./canvas-overlay.ts` in
// rf-deploy-15. Re-export so `routes/canvas-deploy.ts`'s
// `import * as deployService` namespace import keeps resolving.
export { getNodeDeploymentOverlay } from './canvas-overlay.js';

// `checkDrift` was extracted to `./drift.service.ts` in rf-deploy-16.
// Re-export so `services/deploy/src/index.ts`'s `export *` and any
// existing tests importing via `services/deploy.service.js` keep
// resolving the symbol unchanged.
export { checkDrift } from './drift.service.js';

export async function getDeploymentHistory(
  cardId: string,
  options: {
    environment?: string;
    actionType?: 'plan' | 'apply' | 'destroy' | 'rollback';
    limit?: number;
  } = {},
) {
  const { environment, actionType, limit = 100 } = options;
  return prisma.canvasDeployment.findMany({
    where: {
      card_id: cardId,
      ...(environment ? { environment } : {}),
      ...(actionType ? { action_type: actionType } : {}),
    },
    orderBy: { created_at: 'desc' },
    take: Math.min(Math.max(limit, 1), 500),
  });
}


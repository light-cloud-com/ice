/**
 * Deploy Service — Real deployment using @ice/core deployers
 *
 * Thin orchestrator: each public entry point (plan/apply/destroy/destroyAll/
 * rollback) lives in its own sibling module after the rf-deploy2 series
 * (2026-04-30 follow-up to rf-deploy). This file is now a re-export shim
 * + the small DB-only helpers (`getDeploymentStatus`, `getDeployedResources`,
 * `getDeploymentHistory`) and the in-memory snapshot accessors
 * (`requestDeployCancel`, `getCurrentDeploySnapshot`).
 *
 * Translates canvas card nodes → deployable graph → cloud provisioning.
 * Uses user's own cloud credentials (not Light Cloud's).
 */

import prisma from '@ice/db';
import { cancelDeploy as cancelLockDeploy, getDeploySnapshot } from './deploy-locks';
import { installSnapshotPersister } from './snapshot-persister';

// Side-effect: install the DB persister for `DeployProgressSnapshot` on
// module load. Without this call, refreshed pages can't see live progress
// after a gateway restart (the in-memory snapshot is lost; the DB copy
// is the only fallback). Has to happen at module-load time so it runs
// before the first deploy/destroy/rollback.
installSnapshotPersister();

export type { DeployProgressSnapshot } from './deploy-locks';

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
export { planDeployment } from './plan-deployment';

// `applyDeployment` was extracted to `./apply-deployment.ts` in rf-deploy2-2.
// Re-export so `routes/canvas-deploy.ts`'s `import * as deployService`
// namespace import keeps resolving and `services/queue.service.ts`'s
// `import { applyDeployment } from './deploy.service'` continues to work.
export { applyDeployment } from './apply-deployment';

// `destroyAllForCard` was extracted to `./destroy-all-for-card.ts` in
// rf-deploy2-3. Re-export so `routes/canvas-deploy.ts`'s namespace
// import keeps resolving the symbol.
export { destroyAllForCard } from './destroy-all-for-card';

// `destroyDeployment` was extracted to `./destroy-deployment.ts` in
// rf-deploy2-4. Re-export so `routes/canvas-deploy.ts`'s namespace
// import keeps resolving the symbol.
export { destroyDeployment } from './destroy-deployment';

// `rollbackDeployment` was extracted to `./rollback-deployment.ts` in
// rf-deploy2-5. Re-export so `routes/canvas-deploy.ts`'s namespace
// import keeps resolving the symbol.
export { rollbackDeployment } from './rollback-deployment';

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
export { getNodeDeploymentOverlay } from './canvas-overlay';

// `checkDrift` was extracted to `./drift.service.ts` in rf-deploy-16.
// Re-export so `services/deploy/src/index.ts`'s `export *` and any
// existing tests importing via `services/deploy.service.js` keep
// resolving the symbol unchanged.
export { checkDrift } from './drift.service';

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

/**
 * Destroy Runner — narrow helpers shared by `destroyDeployment` and
 * `destroyAllForCard` in `deploy.service.ts` (rf-deploy-13).
 *
 * **Why two helpers and NOT a unified runner.** The two destroy loops in
 * the orchestrator iterate fundamentally different lifecycle shapes:
 *
 *  - `destroyAllForCard` walks `DestroyTarget[]` (collected in rf-deploy-11)
 *    across every historical deployment, treats NOT_FOUND/404 as success
 *    (the resource is gone, which is the desired state), bookkeeps via
 *    `{ deleted, failed }` arrays of `{type, name}` shapes, and cleans up
 *    its mappings via direct `prisma.deployedResourceMapping.deleteMany`.
 *
 *  - `destroyDeployment` walks a single deployment row's
 *    `DeployResultResource[]`, filters `res.success && res.provider_id`,
 *    propagates errors verbatim (because the selector already gated on
 *    `res.success`, so a NOT_FOUND on a previously-successful resource is
 *    a real signal worth surfacing), bookkeeps via the raw deployer
 *    response array (`deleteResults`), uses the `removeResourceMapping`
 *    helper, and surfaces per-resource `emitLog` lines + console.log
 *    chatter.
 *
 * Forcing those two shapes into one runner with options for selector +
 * error-handling + logging + mapping-cleanup turns into a 10-knob function
 * with a small dedup payoff. So we extract two narrow helpers — the
 * per-item destroy attempt (`attemptDestroy`) and the canvas-correlation-
 * gated wire emit (`emitDestroyLifecycle`) — and leave each loop in
 * `deploy.service.ts` with its own selector / bookkeeping / logging shape.
 *
 * The blueprint at `.claude/state/blueprints/rf-deploy.md` calls out this
 * unit as **BEHAVIOR-RISK** for exactly this reason: pulling the selectors
 * apart was tempting, but the right answer is to leave them at the
 * callsites and only extract the truly-reusable bits.
 */

import { emitDestroyNodeStatus } from './deploy-event-dispatcher';

/**
 * Per-item destroy attempt: calls `deployer.delete` with a standardized
 * result shape, classifies success/failure, and optionally treats
 * NOT_FOUND/404 as success.
 *
 *  - `treatNotFoundAsSuccess: true` (used by `destroyAllForCard`) — the
 *    iterator walks every historical resource regardless of whether its
 *    last apply succeeded, so a NOT_FOUND on delete just means the cloud
 *    already has the desired state and we should book it as a success.
 *
 *  - `treatNotFoundAsSuccess: false` (used by `destroyDeployment`) — the
 *    iterator already gated on `res.success && res.provider_id`, so a
 *    NOT_FOUND/404 on a resource we previously DID create is a real
 *    signal worth surfacing as a failure (something else cleaned up the
 *    resource out from under us, or the provider_id is stale).
 *
 * The "raw" field carries the underlying deployer response so callers
 * that bookkeep raw responses (destroyDeployment's `deleteResults`) get
 * the original shape back. `attemptDestroy` is allowed to omit `raw` from
 * the catch-branch return (the original inline catch in destroyAllForCard
 * never had a deployer-response object to mirror — it built `{ resource_id,
 * success, error }` from the thrown error directly).
 */
export async function attemptDestroy(args: {
  deployer: {
    delete: (
      type: string,
      name: string,
      providerId: string,
      opts: { provider: string; project: string },
    ) => Promise<{ success: boolean; error?: string; [key: string]: unknown }>;
  };
  type: string;
  name: string;
  providerId: string;
  provider: string;
  project: string;
  treatNotFoundAsSuccess?: boolean;
}): Promise<{ success: boolean; error?: string; raw?: { success: boolean; error?: string; [key: string]: unknown } }> {
  const { deployer, type, name, providerId, provider, project, treatNotFoundAsSuccess = false } = args;
  try {
    const res = await deployer.delete(type, name, providerId, { provider, project });
    if (res.success) {
      return { success: true, raw: res };
    }
    if (treatNotFoundAsSuccess && (res.error?.includes('NOT_FOUND') || res.error?.includes('404'))) {
      return { success: true, raw: res };
    }
    const errMsg = res.error || 'delete returned non-success';
    return { success: false, error: errMsg, raw: res };
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (treatNotFoundAsSuccess && (msg.includes('NOT_FOUND') || msg.includes('404'))) {
      return { success: true };
    }
    return { success: false, error: msg };
  }
}

/**
 * Wire-emit helper: skips the emit entirely when `canvasNodeId` is missing
 * (legacy historical rows with no `source_node_id` / `nodeId`), otherwise
 * dispatches via `emitDestroyNodeStatus`.
 *
 * Both destroy paths gate on the truthiness of the canvas correlation —
 * the original inline shape was `if (t.nodeId) emitDestroyNodeStatus(...)`
 * (and `if (res.source_node_id) ...` for `destroyDeployment`). Centralising
 * the gate here removes the most-repeated 5-line block from each loop and
 * preserves the original truthiness check (empty-string and undefined both
 * silently skip the emit, matching the `if (t.nodeId)` behavior).
 */
export function emitDestroyLifecycle(args: {
  cardId: string;
  canvasNodeId: string | undefined;
  resourceName: string;
  resourceType: string;
  status: 'queued' | 'applying' | 'succeeded' | 'failed';
  durationMs?: number;
  error?: { code: string; message: string; recoverable?: boolean };
}): void {
  const { cardId, canvasNodeId, resourceName, resourceType, status, durationMs, error } = args;
  if (!canvasNodeId) return;
  emitDestroyNodeStatus(cardId, {
    canvasNodeId,
    resourceName,
    resourceType,
    status,
    duration_ms: durationMs,
    error,
  });
}

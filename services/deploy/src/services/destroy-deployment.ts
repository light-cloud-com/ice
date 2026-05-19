/**
 * Destroy-deployment orchestration — extracted from `deploy.service.ts`
 * in rf-deploy2-4 (follow-up to the 2026-04-29 rf-deploy series).
 *
 * Owns `destroyDeployment`: destroys the resources from the latest
 * successful or partial apply for a card, in REVERSE deployment order so
 * dependency-ordered creates become dependency-ordered destroys. Differs
 * from `destroyAllForCard` which walks every historical row and the full
 * mapping table — this path only touches `deployment.results.resources`
 * filtered by `success && provider_id` (real, non-pseudo, previously-
 * created cloud objects).
 */

import prisma from '@ice/db';
import * as providerService from '@ice/service-credentials';
import { emitDeployEvent, emitLog } from './deploy-event-dispatcher';
import { acquireWriteLock } from './deploy-lock-wrapper';
import { finishDeploySnapshot, releaseTempDir, startDeploySnapshot } from './deploy-locks';
import { createDeployer } from './deployer-factory';
import { attemptDestroy, emitDestroyLifecycle } from './destroy-runner';
import { removeResourceMapping } from './resource-mapping.service';
import { resolveProviderAuth } from '../providers/registry';

export async function destroyDeployment(cardId: string, orgId: string, userId?: string) {
  // Per-card lock — no concurrent destroys on the same card.
  let releaseLock: () => void;
  try {
    releaseLock = acquireWriteLock(cardId, 'destroy');
  } catch (err) {
    console.warn('[destroy] LOCK FAILED cardId=' + cardId + ' err=' + (err as any)?.message);
    throw err;
  }
  // Find the latest APPLY baseline — filtering by action_type='apply' is
  // load-bearing: without it, a card that was apply → destroy would
  // pick up its own destroy row (which has no provider_ids to delete)
  // and silently do nothing on the next destroy click, leaving the user
  // thinking "destroy is broken" when actually nothing was deployed.
  //
  // Also check if there's a newer destroy row — if so, this apply was
  // already rolled back and there's nothing to destroy.
  const latestApply = await prisma.canvasDeployment.findFirst({
    where: {
      card_id: cardId,
      status: { in: ['success', 'partial'] },
      action_type: 'apply',
    },
    orderBy: { created_at: 'desc' },
  });

  if (!latestApply || !latestApply.results) {
    console.warn('[destroy] NO APPLY BASELINE cardId=' + cardId + ' — nothing to destroy.');
    releaseLock();
    throw new Error(
      'No deployment found to destroy. Use destroy-everything mode if you need to clean up orphaned resources.',
    );
  }

  const newerDestroy = await prisma.canvasDeployment.findFirst({
    where: {
      card_id: cardId,
      action_type: 'destroy',
      status: { in: ['success', 'partial'] },
      created_at: { gt: latestApply.created_at },
    },
    orderBy: { created_at: 'desc' },
  });
  if (newerDestroy) {
    console.warn(
      '[destroy] apply@' + latestApply.id + ' was already destroyed@' + newerDestroy.id + ' — nothing to do.',
    );
    releaseLock();
    throw new Error(
      'This card was already destroyed. Use destroy-everything mode to clean up any orphaned resources from failed deploys.',
    );
  }

  const deployment = latestApply;

  const provider = deployment.provider || 'gcp';
  const credentials = await providerService.getDecryptedCredentials(orgId, provider);
  if (!credentials) {
    console.warn('[destroy] NO CREDENTIALS orgId=' + orgId + ' provider=' + provider);
    releaseLock();
    throw new Error('Provider not connected');
  }

  // Create destroy record
  const destroyRecord = await prisma.canvasDeployment.create({
    data: {
      card_id: cardId,
      user_id: userId,
      status: 'deploying',
      action_type: 'destroy',
      provider,
      region: deployment.region,
      environment: deployment.environment,
    },
  });

  // pdl-10 — open a snapshot so `nextDeploySeq` returns contiguous seqs
  // for the destroy events (per-resource node_status + log lines + final
  // complete). Without this, all destroy events would fall through to
  // the `Date.now()` seq-fallback path, breaking the dedup-on-reconnect
  // contract for the multi-step destroy narrative — destroy is no longer
  // a "rare, idempotent point-in-time update" once we emit
  // queued/applying/succeeded per resource. Mirrors the apply-path's
  // `startDeploySnapshot(cardId, deployment.id)` at line ~575.
  startDeploySnapshot(cardId, destroyRecord.id);

  const startTime = Date.now();
  let tempCredentialsDir: string | undefined;

  emitLog(cardId, `Starting destroy for card ${cardId}...`);

  try {
    const deployer = await createDeployer(provider);

    const scopedAuth = await resolveProviderAuth(provider, {
      orgId,
      credentials,
      requestedScope: { project: credentials.project_id, region: deployment.region },
      onLog: (msg) => emitLog(cardId, msg),
    });
    const authClient: any = scopedAuth.authClient;
    tempCredentialsDir = scopedAuth.tempDir;

    await deployer.initialize({
      provider,
      project: scopedAuth.scope.project || authClient?.projectId || authClient?.project_id,
      regions: [deployment.region],
      continue_on_error: true,
      // pdl-10 — per-resource wire emit is now driven by the destroy loop
      // below (using each resource's `source_node_id` written by pdl-4's
      // post-deploy resource-mapping step). The deployer's own `on_log`
      // is still wired for free-text handler logs that don't belong to a
      // specific resource (e.g. authentication / region setup chatter).
      on_log: (message: string) => emitLog(cardId, message),
      auth_client: authClient,
      auth_key_file: scopedAuth.keyFilePath,
      auth_credentials: scopedAuth.parsedCredentials,
    });

    // Delete resources in REVERSE deployment order so dependency-ordered
    // creates become dependency-ordered destroys. Phase 0 fix: without this,
    // a load-balancer destroy would try to delete the backend service before
    // the forwarding rule that references it.
    const results = deployment.results as any;
    const resources = ((results.resources as any[]) || []).slice().reverse();
    const deleteResults: any[] = [];

    const destroyProject =
      scopedAuth.scope.project || (authClient as any)?.projectId || (authClient as any)?.project_id;

    // pdl-10 — emit `queued` for every resource that has a canvas
    // correlation, BEFORE the loop starts. This matches the apply-path
    // scheduler's behavior (every node enters `queued` first, then
    // transitions to `applying` when the worker picks it up). Resources
    // without `source_node_id` (legacy pre-pdl-4 rows) are silently
    // skipped — the per-resource emitLog line below still gives them a
    // log-scroll record, and the final `complete` event still tallies
    // them in the totals.
    for (const res of resources) {
      if (res.success && res.provider_id && res.source_node_id) {
        emitDestroyLifecycle({
          cardId,
          canvasNodeId: res.source_node_id,
          resourceName: res.name,
          resourceType: res.type,
          status: 'queued',
        });
      }
    }

    for (const res of resources) {
      if (res.success && res.provider_id) {
        // pdl-10 — capture the applying-at marker so duration_ms can be
        // computed for the terminal event below. Only resources with a
        // canvas correlation get the wire emit.
        const applyingAt = Date.now();
        emitDestroyLifecycle({
          cardId,
          canvasNodeId: res.source_node_id,
          resourceName: res.name,
          resourceType: res.type,
          status: 'applying',
        });
        // rf-deploy-13 — per-item delete attempt + result classification
        // moved to `./destroy-runner.ts`. The console.log lines, the
        // per-resource emitLog, and the `removeResourceMapping` helper
        // call all stay here because they're specific to this loop's
        // bookkeeping shape. `treatNotFoundAsSuccess: false` because the
        // selector above (`res.success && res.provider_id`) already
        // filtered to resources we previously DID create — a NOT_FOUND
        // here is a real signal worth surfacing as a failure.
        const result = await attemptDestroy({
          deployer,
          type: res.type,
          name: res.name,
          providerId: res.provider_id,
          provider,
          project: destroyProject,
          treatNotFoundAsSuccess: false,
        });
        if (result.raw) {
          // Result branch: the deployer returned a response (success or
          // !success). Mirror the original raw-response push to
          // `deleteResults` so downstream readers see the original shape.
          const deleteResult = result.raw;
          deleteResults.push(deleteResult);
          const durationMs = Date.now() - applyingAt;
          emitDestroyLifecycle({
            cardId,
            canvasNodeId: res.source_node_id,
            resourceName: res.name,
            resourceType: res.type,
            status: result.success ? 'succeeded' : 'failed',
            durationMs,
            error: result.success
              ? undefined
              : { code: 'DESTROY_FAILED', message: result.error || 'delete returned non-success' },
          });
          // Surface a per-resource log line — the deploy panel's log
          // scroll consumes this surface alongside the new node_status
          // events the per-node row UI watches. Both surfaces stay.
          emitLog(
            cardId,
            `${res.name}: delete ${deleteResult.success ? 'completed' : 'failed' + (deleteResult.error ? ` (${deleteResult.error})` : '')}`,
          );
          // Phase 1: remove the stable name mapping once the resource is gone.
          if (deleteResult.success && res.source_node_id) {
            await removeResourceMapping({
              cardId,
              nodeId: res.source_node_id,
              environment: deployment.environment,
            }).catch(() => {
              // Non-fatal — the mapping may not exist yet for older rows.
            });
          }
        } else {
          // Catch branch: deployer.delete threw. Mirror the original
          // inline catch's `{ resource_id, success: false, error }` shape
          // and surface a `Failed to delete ${name}: ${err.message}` log.
          const errMsg = result.error || 'delete threw';
          deleteResults.push({ resource_id: res.resource_id, success: false, error: errMsg });
          // pdl-10 — emit `failed` for the canvas-correlated row before
          // the log line so the per-node UI updates immediately. The
          // throw-path needs the same treatment as the deleteResult.error
          // branch above; otherwise a thrown delete (auth fail, network
          // hang) leaves the row stuck on `applying` forever.
          // NOTE: the original inline catch did NOT include duration_ms
          // on the throw path; preserve that omission verbatim.
          emitDestroyLifecycle({
            cardId,
            canvasNodeId: res.source_node_id,
            resourceName: res.name,
            resourceType: res.type,
            status: 'failed',
            error: { code: 'DESTROY_FAILED', message: errMsg },
          });
          emitLog(cardId, `Failed to delete ${res.name}: ${errMsg}`);
        }
      }
    }

    await deployer.cleanup();

    const durationMs = Date.now() - startTime;
    const allSuccess = deleteResults.every((r: any) => r.success);

    const deletedCount = deleteResults.filter((r: any) => r.success).length;
    const failedCount = deleteResults.filter((r: any) => !r.success).length;
    await prisma.canvasDeployment.update({
      where: { id: destroyRecord.id },
      data: {
        status: allSuccess ? 'success' : 'failed',
        results: { action: 'destroy', resources: deleteResults } as any,
        summary: {
          created: 0,
          updated: 0,
          deleted: deletedCount,
          failed: failedCount,
          total: deleteResults.length,
        } as any,
        duration_ms: durationMs,
      },
    });

    emitDeployEvent(cardId, {
      type: 'complete',
      card_id: cardId,
      outcome: allSuccess ? 'success' : 'partial',
      totals: {
        queued: 0,
        applying: 0,
        succeeded: deletedCount,
        failed: failedCount,
        skipped: 0,
        cancelled: 0,
      },
      at: new Date().toISOString(),
      seq: 0,
    });

    // pdl-10 — close the snapshot so a late-joining tab still sees the
    // terminal per-node state for a 60s grace window. Mirrors the apply
    // path's `finishDeploySnapshot(cardId, finalStatus)` at line ~1209.
    finishDeploySnapshot(cardId, allSuccess ? 'success' : 'partial');

    return { success: allSuccess, deploymentId: destroyRecord.id, duration_ms: durationMs };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;

    await prisma.canvasDeployment.update({
      where: { id: destroyRecord.id },
      data: {
        status: 'failed',
        duration_ms: durationMs,
        error: err.message,
      },
    });

    emitDeployEvent(cardId, {
      type: 'complete',
      card_id: cardId,
      outcome: 'failure',
      totals: { queued: 0, applying: 0, succeeded: 0, failed: 0, skipped: 0, cancelled: 0 },
      at: new Date().toISOString(),
      seq: 0,
    });

    // pdl-10 — also close the snapshot on the engine-level catch path.
    finishDeploySnapshot(cardId, 'failed');

    return { success: false, deploymentId: destroyRecord.id, error: err.message };
  } finally {
    releaseTempDir(tempCredentialsDir);
    releaseLock();
  }
}

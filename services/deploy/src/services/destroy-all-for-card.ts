/**
 * Destroy-all-for-card orchestration — extracted from `deploy.service.ts`
 * in rf-deploy2-3 (follow-up to the 2026-04-29 rf-deploy series).
 *
 * Owns `destroyAllForCard`: the "nuke" path that destroys EVERY ICE-managed
 * resource for a card across all historical deployments and environments.
 * Unlike `destroyDeployment` (which only destroys the latest success/partial
 * row), this walks the full `DeployedResourceMapping` table for the card,
 * every `canvasDeployment` row's `results.resources`, and the card's parent
 * project's GCP backend-bucket/URL-map/forwarding-rule collection,
 * deduping and destroying anything labeled `ice-managed=true`.
 */

import prisma from '@ice/db';
import * as providerService from '@ice/service-credentials';
import { emitDeployEvent, emitLog } from './deploy-event-dispatcher';
import { acquireWriteLock } from './deploy-lock-wrapper';
import { finishDeploySnapshot, releaseTempDir, startDeploySnapshot } from './deploy-locks';
import { createDeployer } from './deployer-factory';
import { attemptDestroy, emitDestroyLifecycle } from './destroy-runner';
import { collectDestroyAllTargets, orderTargetsForDelete, resolveDestroyAllProject } from './destroy-targets';
import { resolveProviderAuth } from '../providers/registry';

/**
 * Destroy EVERY ICE-managed resource for a card across all historical
 * deployments and environments. Unlike `destroyDeployment` (which only
 * destroys the latest success/partial row), this function walks the
 * full `DeployedResourceMapping` table for the card, every
 * `canvasDeployment` row's `results.resources`, and the card's parent
 * project's GCP backend-bucket/URL-map/forwarding-rule collection,
 * deduping and destroying anything labeled `ice-managed=true`.
 *
 * This is the "nuke" button — user explicitly wants a clean slate for
 * this project before starting fresh. Used when iterating on templates
 * accumulated orphaned resources that hit GCP quotas.
 */
export async function destroyAllForCard(
  cardId: string,
  orgId: string,
  userId?: string,
  options: { gcpProject?: string } = {},
) {
  const releaseLock = acquireWriteLock(cardId, 'destroy');

  try {
    // rf-deploy-11 — collection + de-dupe + most-recent-historical-row pull
    // moved to `./destroy-targets.ts`. Mapping-table precedence preserved.
    const { targets, latestRow } = await collectDestroyAllTargets(cardId);

    if (targets.size === 0) {
      releaseLock();
      return { success: true, deleted: [], failed: [], total: 0 };
    }

    const provider = latestRow?.provider || 'gcp';
    const credentials = await providerService.getDecryptedCredentials(orgId, provider);
    if (!credentials) {
      releaseLock();
      throw new Error('Provider not connected');
    }

    // rf-deploy-11 — 3-tier project priority moved to `./destroy-targets.ts`.
    // The throw stays here because it has to release the deploy lock first.
    const gcpProject = resolveDestroyAllProject({ options, credentials, targets: targets.values() }) ?? '';
    if (!gcpProject) {
      releaseLock();
      throw new Error(
        'Cannot resolve GCP project id for destroy-all. Pass the project in the request body or reconnect the ' +
          'provider credential with a non-null project_id.',
      );
    }

    const destroyRecord = await prisma.canvasDeployment.create({
      data: {
        card_id: cardId,
        user_id: userId,
        status: 'deploying',
        action_type: 'destroy',
        provider,
        region: latestRow?.region || 'us-central1',
        environment: latestRow?.environment || 'development',
      },
    });

    // pdl-10 — open a snapshot so `nextDeploySeq` returns contiguous seqs
    // for every per-resource node_status emit + the final complete. Same
    // motivation as `destroyDeployment`: destroy is no longer a single
    // idempotent point-in-time update once we emit per-resource
    // queued/applying/succeeded.
    startDeploySnapshot(cardId, destroyRecord.id);

    emitLog(cardId, `Destroying ${targets.size} ICE-managed resources across all historical deploys for this card...`);

    const deployer = await createDeployer(provider);

    const scopedAuth = await resolveProviderAuth(provider, {
      orgId,
      credentials,
      requestedScope: { project: gcpProject },
      onLog: (msg) => emitLog(cardId, msg),
    });
    const authClient: any = scopedAuth.authClient;
    const tempCredentialsDir: string | undefined = scopedAuth.tempDir;

    try {
      await deployer.initialize({
        provider,
        project: gcpProject,
        regions: [latestRow?.region || 'us-central1'],
        continue_on_error: true,
        auth_client: authClient,
        auth_key_file: scopedAuth.keyFilePath,
        auth_credentials: scopedAuth.parsedCredentials,
        on_log: (message: string) => emitLog(cardId, message),
        // pdl-10 — per-resource wire emit is now driven by the destroy
        // loop below, using each target's `nodeId` (sourced from either
        // the `DeployedResourceMapping` row's `node_id` or the historical
        // result's `source_node_id`). Targets without a `nodeId`
        // (legacy pre-pdl-4 historical rows) skip the wire emit and rely
        // on the per-resource log line surface.
      });

      // rf-deploy-11 — dependency-aware sort moved to `./destroy-targets.ts`.
      // Dependent resources tear down first, origins last.
      const ordered = orderTargetsForDelete([...targets.values()]);

      // pdl-10 — emit `queued` for every target with a canvas correlation
      // BEFORE the loop starts. Mirrors the apply scheduler's behavior.
      // Targets without a nodeId (legacy historical rows) are silently
      // skipped — the destroy still runs for them, just without a per-row
      // UI surface.
      for (const t of ordered) {
        emitDestroyLifecycle({
          cardId,
          canvasNodeId: t.nodeId,
          resourceName: t.name,
          resourceType: t.type,
          status: 'queued',
        });
      }

      const deleted: Array<{ type: string; name: string }> = [];
      const failed: Array<{ type: string; name: string; error: string }> = [];
      for (const t of ordered) {
        // pdl-10 — emit `applying` for canvas-correlated targets and
        // capture the start time for duration_ms on the terminal event.
        const applyingAt = Date.now();
        emitDestroyLifecycle({
          cardId,
          canvasNodeId: t.nodeId,
          resourceName: t.name,
          resourceType: t.type,
          status: 'applying',
        });
        // rf-deploy-13 — per-item delete attempt + result classification +
        // NOT_FOUND/404-as-success treatment moved to `./destroy-runner.ts`.
        // The bookkeeping (`deleted` / `failed` arrays) and mapping cleanup
        // (direct prisma.deployedResourceMapping.deleteMany) stay here
        // because they're specific to this loop's "destroy everything"
        // shape. `treatNotFoundAsSuccess: true` because this loop walks
        // every historical resource regardless of whether its last apply
        // succeeded — a NOT_FOUND just means the cloud already matches
        // the desired state.
        const result = await attemptDestroy({
          deployer,
          type: t.type,
          name: t.name,
          providerId: t.providerId || t.name,
          provider,
          project: gcpProject,
          treatNotFoundAsSuccess: true,
        });
        if (result.success) {
          deleted.push({ type: t.type, name: t.name });
          emitDestroyLifecycle({
            cardId,
            canvasNodeId: t.nodeId,
            resourceName: t.name,
            resourceType: t.type,
            status: 'succeeded',
            durationMs: Date.now() - applyingAt,
          });
          // Clean up the mapping row for this resource.
          await prisma.deployedResourceMapping
            .deleteMany({ where: { card_id: cardId, resource_name: t.name, resource_type: t.type } })
            .catch(() => undefined);
        } else {
          const errMsg = result.error || 'delete returned non-success';
          failed.push({ type: t.type, name: t.name, error: errMsg });
          emitDestroyLifecycle({
            cardId,
            canvasNodeId: t.nodeId,
            resourceName: t.name,
            resourceType: t.type,
            status: 'failed',
            durationMs: Date.now() - applyingAt,
            error: { code: 'DESTROY_FAILED', message: errMsg },
          });
        }
      }

      await deployer.cleanup();
      const allSuccess = failed.length === 0;
      await prisma.canvasDeployment.update({
        where: { id: destroyRecord.id },
        data: {
          status: allSuccess ? 'success' : 'partial',
          results: { action: 'destroy_all', deleted, failed } as any,
          summary: {
            created: 0,
            updated: 0,
            deleted: deleted.length,
            failed: failed.length,
            total: targets.size,
          } as any,
          duration_ms: Date.now() - Date.parse(destroyRecord.created_at.toISOString()),
        },
      });

      emitDeployEvent(cardId, {
        type: 'complete',
        card_id: cardId,
        outcome: allSuccess ? 'success' : 'partial',
        totals: {
          queued: 0,
          applying: 0,
          succeeded: deleted.length,
          failed: failed.length,
          skipped: 0,
          cancelled: 0,
        },
        at: new Date().toISOString(),
        seq: 0,
      });

      // pdl-10 — close the snapshot so a late-joining tab still sees the
      // terminal per-node state for a 60s grace window.
      finishDeploySnapshot(cardId, allSuccess ? 'success' : 'partial');

      return { success: allSuccess, deleted, failed, total: targets.size, deploymentId: destroyRecord.id };
    } catch (err: any) {
      // pdl-10 critic finding B2 — any throw between `startDeploySnapshot`
      // (line above) and the success-path `finishDeploySnapshot` would
      // leak the snapshot, leaving `nextDeploySeq` allocating against a
      // dead `deploymentId` and the next destroy's emits getting the
      // wrong correlation. The apply path's `applyDeployment` catches
      // engine throws and closes the snapshot at line ~1322; mirror that
      // shape here. Engine throws can come from `deployer.initialize`,
      // `deployer.cleanup`, the prisma update, or the `complete` emit
      // itself — any of those leaves the per-card snapshot stranded
      // unless we close it on the catch path.
      finishDeploySnapshot(cardId, 'failed');
      // Mark the destroy record failed so downstream readers (the deploy
      // panel's hydrate-from-history path) see a coherent terminal row
      // rather than the still-'deploying' status from the create above.
      await prisma.canvasDeployment
        .update({
          where: { id: destroyRecord.id },
          data: {
            status: 'failed',
            duration_ms: Date.now() - Date.parse(destroyRecord.created_at.toISOString()),
            error: err?.message || String(err),
          },
        })
        .catch(() => {
          // Non-fatal — even if the DB update fails, we still want to
          // release the snapshot and re-throw the original error.
        });
      throw err;
    } finally {
      releaseTempDir(tempCredentialsDir);
    }
  } finally {
    releaseLock();
  }
}

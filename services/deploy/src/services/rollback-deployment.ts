/**
 * Rollback-deployment orchestration — extracted from `deploy.service.ts`
 * in rf-deploy2-5 (follow-up to the 2026-04-29 rf-deploy series).
 *
 * Owns `rollbackDeployment`: rolls a card back to a target deployment by
 * building a desired graph from the target's historical resources, diffing
 * it against the latest fully-successful deployment, and running the
 * resulting create/delete/update through the regular deployer. Differs
 * from `applyDeployment` in that the desired graph is reconstructed from
 * persisted resources (no card-translator pass) — so per-resource wire
 * status is intentionally dropped (no graphIdToCanvasId map exists for
 * the historical row's resources).
 */

import prisma from '@ice/db';
import * as providerService from '@ice/service-credentials';
import { releaseTempDir } from './deploy-locks';
import { resolveProviderAuth } from '../providers/registry';
import { computeCompleteTotals, deriveCompleteOutcome, computeDeploySummary } from '../utils/deploy-outcome';
import { createDeployer, getCoreEngine } from './deployer-factory';
import { acquireWriteLock } from './deploy-lock-wrapper';
import { emitDeployEvent, emitLog } from './deploy-event-dispatcher';
import { buildBaselineGraph } from './baseline-graph';

export async function rollbackDeployment(deploymentId: string, cardId: string, orgId: string, userId?: string) {
  // Per-card lock — rollback is a deploy variant; blocks concurrent applies.
  const releaseLock = acquireWriteLock(cardId, 'rollback');
  // 1. Find the target deployment to roll back to
  const targetDeployment = await prisma.canvasDeployment.findUnique({
    where: { id: deploymentId },
  });

  if (!targetDeployment) {
    releaseLock();
    throw new Error('Target deployment not found');
  }

  if (targetDeployment.card_id !== cardId) {
    releaseLock();
    throw new Error('Deployment does not belong to this card');
  }

  if (targetDeployment.status !== 'success') {
    releaseLock();
    throw new Error('Can only roll back to a successful deployment');
  }

  const targetResults = targetDeployment.results as any;
  if (!targetResults?.resources) {
    releaseLock();
    throw new Error('Target deployment has no resource data to roll back to');
  }

  const provider = targetDeployment.provider || 'gcp';
  const credentials = await providerService.getDecryptedCredentials(orgId, provider);
  if (!credentials) {
    releaseLock();
    throw new Error('Provider not connected. Please connect your cloud provider first.');
  }

  // 2. Create rollback deployment record
  const rollbackRecord = await prisma.canvasDeployment.create({
    data: {
      card_id: cardId,
      user_id: userId,
      status: 'deploying',
      action_type: 'rollback',
      provider,
      region: targetDeployment.region,
      environment: targetDeployment.environment,
      plan: { rollback_to: deploymentId } as any,
    },
  });

  const startTime = Date.now();
  let tempCredentialsDir: string | undefined;

  emitLog(cardId, `Rolling back to deployment ${deploymentId.slice(0, 8)}...`);

  try {
    const core = await getCoreEngine();
    const { MutableGraph } = core;

    const deployer = await createDeployer(provider);

    const scopedAuth = await resolveProviderAuth(provider, {
      orgId,
      credentials,
      requestedScope: { project: credentials.project_id, region: targetDeployment.region },
      onLog: (msg) => emitLog(cardId, msg),
    });
    const authClient: any = scopedAuth.authClient;
    const gcpProject = scopedAuth.scope.project || authClient?.projectId || authClient?.project_id;
    tempCredentialsDir = scopedAuth.tempDir;

    await deployer.authenticate(authClient, gcpProject);

    // 3. Build desired state from target deployment's resources
    const desiredGraph = new MutableGraph('desired');
    const targetResources = targetResults.resources || [];
    for (const res of targetResources) {
      if (res.success && res.resource_id) {
        try {
          desiredGraph.add_node({
            name: res.name,
            type: res.type,
            properties: {
              ...res.outputs,
              provider_id: res.provider_id,
            },
          });
        } catch {
          // Ignore duplicates
        }
      }
    }

    // 4. Build current state from the latest fully-successful deployment.
    // Rollback uses status='success' only (rolling forward to a partial
    // state would compound the failure) and is scoped to the rollback
    // record's environment so rolling back prod doesn't load dev's latest
    // success as the baseline. Extracted in rf-deploy-10 to
    // `./baseline-graph.ts` (shared with the apply path which uses a
    // wider status filter).
    const { currentGraph } = await buildBaselineGraph({
      cardId,
      environment: rollbackRecord.environment,
      excludeDeploymentId: rollbackRecord.id,
      statusFilter: ['success'],
    });

    emitLog(cardId, `Rolling back: target has ${targetResources.filter((r: any) => r.success).length} resources`);

    // 5. Deploy using diff: desired (target) vs current (latest).
    // Per-resource wire status is dropped on the rollback path for the
    // same reason as destroy — there's no card-translator translation
    // here (the desired graph is built from the target deployment's
    // historical resources, not the current canvas), so we don't have a
    // graphIdToCanvasId map. Future work: build the same map from the
    // target deployment's persisted `source_node_id` fields.
    const { deploy_graph } = core;
    const result = await deploy_graph(desiredGraph, currentGraph, deployer, {
      provider,
      project: gcpProject,
      regions: [targetDeployment.region || 'us-central1'],
      auth_client: authClient,
      auth_key_file: (authClient as any)?._ice_key_file_path,
      auth_credentials: (authClient as any)?._ice_parsed_credentials,
    });

    const durationMs = Date.now() - startTime;

    await prisma.canvasDeployment.update({
      where: { id: rollbackRecord.id },
      data: {
        status: result.success ? 'success' : 'failed',
        results: result as any,
        summary: computeDeploySummary(result) as any,
        duration_ms: durationMs,
        error: result.errors?.length > 0 ? result.errors.map((e: any) => e.message).join('; ') : null,
      },
    });

    await deployer.cleanup();

    emitDeployEvent(cardId, {
      type: 'complete',
      card_id: cardId,
      outcome: deriveCompleteOutcome(result.resources, { engineSuccess: result.success }),
      totals: computeCompleteTotals(result.resources),
      at: new Date().toISOString(),
      seq: 0,
    });

    return {
      success: result.success,
      deploymentId: rollbackRecord.id,
      duration_ms: durationMs,
      error: result.success ? null : 'Rollback failed — check resource configuration',
      result,
    };
  } catch (err: any) {
    console.error('Rollback error:', err.message, err.stack);

    const durationMs = Date.now() - startTime;

    await prisma.canvasDeployment.update({
      where: { id: rollbackRecord.id },
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

    return { success: false, deploymentId: rollbackRecord.id, duration_ms: durationMs, error: err.message };
  } finally {
    releaseTempDir(tempCredentialsDir);
    releaseLock();
  }
}

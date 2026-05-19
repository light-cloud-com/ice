/**
 * Apply-deployment orchestration — extracted from `deploy.service.ts` in
 * rf-deploy2-2 (follow-up to the 2026-04-29 rf-deploy series).
 *
 * Owns the `applyDeployment` public entry point: the 5-phase pipeline
 * (translate → auto-rules → auth → diff/baseline → deploy → persist).
 * The body is verbatim from the original deploy.service.ts at the time
 * of extraction — every previously-extracted helper (deploy-event-dispatcher,
 * baseline-graph, find-source-node-id, scheduler-callbacks, quota-retry,
 * etc.) is still composed here, just from a dedicated file rather than
 * inline alongside destroy/rollback.
 */

import prisma from '@ice/db';
import * as providerService from '@ice/service-credentials';
import {
  acquireDeployLock,
  DeployLockError,
  finishDeploySnapshot,
  releaseTempDir,
  startDeploySnapshot,
} from './deploy-locks';
import {
  getExistingNameMap,
  getResourceMap,
  seedMappingsFromHistory,
} from './resource-mapping.service';
import { resolveProviderAuth } from '../providers/registry';
import { computeCompleteTotals, deriveCompleteOutcome, computeDeploySummary } from '../utils/deploy-outcome';
import { buildResourceNameMaps, makeFindSourceNodeId } from '../utils/find-source-node-id';
import { resolveProjectContext } from '../utils/project-context';
import { createDeployer, getCoreEngine } from './deployer-factory';
import { autoEnableGCPApis } from './gcp-api-enabler';
import { flushSnapshotNow } from './snapshot-persister';
import { emitDeployEvent, emitLog } from './deploy-event-dispatcher';
import { makeSchedulerCallbacks } from './scheduler-callbacks';
import { buildBaselineGraph } from './baseline-graph';
import { retryAfterQuotaCleanup } from './quota-retry';
import {
  ensureAutoDeployRules,
  logDiffForDebugging,
  logSourceRepoDiagnostics,
  normalizeIdempotentResultErrors,
  persistResourceMappings,
} from './apply-pipeline-helpers';

export async function applyDeployment(
  cardId: string,
  nodes: any[],
  edges: any[],
  options: any,
  orgId: string,
  userId?: string,
) {
  // Per-card lock — prevents concurrent applies to the same card from racing
  // each other (credential env pollution, duplicate resource creation, etc.).
  // The lock also hands back the AbortSignal that the cancel endpoint flips.
  let releaseLock: () => void;
  let cancelSignal: AbortSignal;
  try {
    const lock = acquireDeployLock(cardId, 'apply');
    releaseLock = lock.release;
    cancelSignal = lock.signal;
  } catch (err) {
    if (err instanceof DeployLockError) {
      return {
        success: false,
        error: err.message,
        code: err.code,
      };
    }
    throw err;
  }

  // 1. Get user's provider credentials
  const credentials = await providerService.getDecryptedCredentials(orgId, options.provider || 'gcp');
  if (!credentials) {
    releaseLock();
    throw new Error('Provider not connected. Please connect your cloud provider first.');
  }

  // Short-circuit for an obviously-empty canvas before touching the DB.
  // Prevents the "phantom success" case where a canvas with only Group
  // nodes (or nothing at all) reports a clean deploy despite never
  // provisioning a single cloud resource. The stricter post-translation
  // check below catches subtler cases (e.g. every node skipped by the
  // provider filter).
  const hasAnyNonContainerNode = (nodes || []).some((n: any) => {
    if (!n) return false;
    const nt = n.type;
    if (nt === 'container' || nt === 'group') return false;
    const iceType = String(n.data?.iceType || '');
    if (!iceType) return false;
    if (iceType.startsWith('Group.')) return false;
    return true;
  });
  if (!hasAnyNonContainerNode) {
    releaseLock();
    return {
      success: false,
      error: 'Nothing to deploy — add at least one resource block to the canvas before deploying.',
      code: 'EMPTY_CANVAS',
    };
  }

  // 2. Create deployment record
  const deployment = await prisma.canvasDeployment.create({
    data: {
      card_id: cardId,
      user_id: userId,
      status: 'deploying',
      action_type: 'apply',
      provider: options.provider || 'gcp',
      region: options.region || 'us-central1',
      environment: options.environment || 'development',
    },
  });

  // Seed the in-memory progress snapshot so any tab that opens the same
  // project mid-deploy can fetch the current state via /deploy/current/:cardId
  // without waiting for the next socket event.
  startDeploySnapshot(cardId, deployment.id);

  const startTime = Date.now();
  let tempCredentialsDir: string | undefined;

  emitLog(cardId, `Starting deployment for card ${cardId}...`);

  // Long-running body. Wrapped so the HTTP path can fire-and-forget it
  // (returns immediately with `async: true`) while the queue worker still
  // awaits to preserve serial job processing. The body is unchanged from
  // the previous synchronous version — it writes its own terminal state
  // to the DB row and emits a `complete` socket event on every exit path,
  // so async callers don't lose anything by not awaiting.
  const runBody = async () => {
  try {
    const core = await getCoreEngine();
    const { translate_card_to_graph, deploy_graph } = core;

    // 3. Translate card nodes to deployable graph
    const { projectId, projectName, environmentType } = await resolveProjectContext(cardId);
    const environment = environmentType;

    // Phase 1: seed + load the stable name map before translation so updates
    // hit existing resources instead of creating duplicates.
    await seedMappingsFromHistory(cardId, environment);
    const existingNames = await getExistingNameMap(cardId, environment);

    const translation = translate_card_to_graph({
      nodes: nodes.map((n: any) => ({
        id: n.id,
        type: n.type || 'block',
        data: n.data || {},
      })),
      edges: edges.map((e: any) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        data: e.data,
      })),
      provider: options.provider || 'gcp',
      projectName: projectName || options.projectName || projectId,
      environment,
      gcpProject: options.gcpProject || credentials.project_id,
      region: options.region || 'us-central1',
      existing_names: existingNames,
      cardId,
    });

    emitLog(cardId, `Translated ${translation.deployable_count} resources for deployment`);

    // Surface translator warnings (anti-patterns, dropped backends, etc.)
    // so the user sees them in the deploy log instead of having to dig
    // through the canvas validation panel.
    if (translation.warnings && translation.warnings.length > 0) {
      for (const w of translation.warnings) {
        emitLog(cardId, `[translator] ${w}`);
      }
    }

    // If translation produced zero deployables, fail loudly instead of
    // letting the deployer report "success" for a no-op. This catches the
    // case where every block was filtered out by provider mismatch or
    // skipped as non-deployable (Group/Container/etc.).
    if (!translation.deployable_count || translation.deployable_count === 0) {
      const skippedSummary = (translation.skipped || [])
        .map((s: any) => `${s.label || s.nodeId}: ${s.reason}`)
        .join('; ');
      const detail = skippedSummary
        ? ` All ${translation.skipped.length} block(s) were skipped (${skippedSummary}).`
        : '';
      throw new Error(`Nothing to deploy — 0 deployable resources after translation.${detail}`);
    }

    // Diagnostic: show every Source.Repository → Compute edge the
    // deploy service found in the canvas input. Extracted to
    // `./apply-pipeline-helpers.ts` in rf-deploy2-2 housekeeping.
    logSourceRepoDiagnostics(cardId, nodes, edges);

    // 3.5. Auto-register deployment rules for any Source.Repository →
    // Compute edges. This is what makes "push to GitHub auto-redeploys
    // my Firebase Hosting site" work without the user manually clicking
    // into the Source.Repository properties panel. Idempotent — re-uses
    // existing rules and webhooks. Extracted to
    // `./apply-pipeline-helpers.ts` in rf-deploy2-2 housekeeping.
    await ensureAutoDeployRules({
      cardId,
      nodes,
      edges,
      orgId,
      userId,
      environment: options.environment,
    });

    // 4. Create deployer with user's credentials
    const deployer = await createDeployer(options.provider);

    // Resolve provider auth via the credential resolver registry. Replaces
    // the copy-pasted OAuth2Client / GoogleAuth / SA-key block that used to
    // live in every deploy function (Phase D of the reliability rework).
    const scopedAuth = await resolveProviderAuth(options.provider || 'gcp', {
      orgId,
      credentials,
      requestedScope: {
        project: options.gcpProject || credentials.project_id,
        region: options.region,
      },
      onLog: (msg) => emitLog(cardId, msg),
    });
    const authClient: any = scopedAuth.authClient;
    tempCredentialsDir = scopedAuth.tempDir;

    // Auto-enable required GCP APIs before deploying
    const gcpProject = scopedAuth.scope.project || authClient?.projectId || authClient?.project_id;
    if ((options.provider || 'gcp') === 'gcp') {
      const accessToken = scopedAuth.accessToken || null;
      if (accessToken) {
        await autoEnableGCPApis(gcpProject, accessToken, nodes, (msg: string) => {
          emitLog(cardId, msg);
        });
      }
    }

    // 5. Build current state from the last qualifying deployment (if any).
    // This enables update/skip semantics — without it, every deploy is "create all".
    // Apply uses status in ['success', 'partial'] (partial deploys land real
    // resources the next plan must respect) and excludes the in-flight row
    // (which has status='deploying' now but could be observed as 'partial'
    // by a concurrent read mid-flight). Extracted in rf-deploy-10 to
    // `./baseline-graph.ts` (also reused on the rollback path with a
    // tighter status filter).
    const { currentGraph, foundCount, hasResults } = await buildBaselineGraph({
      cardId,
      environment,
      excludeDeploymentId: deployment.id,
      statusFilter: ['success', 'partial'],
    });
    if (hasResults) {
      emitLog(
        cardId,
        `Found ${foundCount} existing resource(s) from previous deployment`,
      );
    }

    // Log diff for debugging — extracted to `./apply-pipeline-helpers.ts`
    // in rf-deploy2-2 housekeeping. Pure console.log output.
    logDiffForDebugging(translation.graph, currentGraph);

    // Build the resource-name lookup tables (current translation +
    // persisted-mapping fallback) and the 4-tier source-node resolver.
    // Extracted in rf-deploy-3 to `../utils/find-source-node-id.ts`.
    // The persisted-map loader stays in this file so the helper can stay
    // pure (no DB).
    const persistedMap = await getResourceMap(cardId, environment).catch(() => new Map());
    const { nameToNodeId, graphIdToCanvasId, persistedNameToNodeId, persistedProviderIdToNodeId } =
      buildResourceNameMaps(translation.deployables || [], persistedMap);
    // `nameToLabel` is only used by the post-deploy resource-mapping log
    // line (see ~line 1104) and is built inline because the helper's
    // signature deliberately omits it (no other callsite reads it).
    const nameToLabel = new Map<string, string>();
    for (const d of translation.deployables || []) {
      nameToLabel.set(d.resource_name, d.label);
    }

    const findSourceNodeId = makeFindSourceNodeId({
      nameToNodeId,
      persistedNameToNodeId,
      persistedProviderIdToNodeId,
      cardId,
    });

    // Per-deploy total. Used only for the "X of N" rollup we still mirror
    // into the in-memory snapshot for late-joining clients to hydrate
    // (the wire complete event carries the canonical totals). The
    // misleading per-resource progress percentage is gone — replaced by
    // the per-node `node_status` stream, see decisions entry
    // "2026-04-28 — Parallel deploy scheduler with per-node live status".
    const totalResources = translation.deployable_count || 1;
    const completedBox = { count: 0 };

    const callbacks = makeSchedulerCallbacks({
      cardId,
      graphIdToCanvasId,
      totals: { total: totalResources, completed: completedBox },
      warnOnMiss: true,
    });

    const result = await deploy_graph(translation.graph, currentGraph, deployer, {
      provider: options.provider || 'gcp',
      project: gcpProject,
      regions: [options.region || 'us-central1'],
      continue_on_error: true,
      abort_signal: cancelSignal,
      auth_client: authClient,
      auth_key_file: (authClient as any)?._ice_key_file_path,
      auth_credentials: (authClient as any)?._ice_parsed_credentials,
      on_node_status: callbacks.on_node_status,
      on_node_progress: callbacks.on_node_progress,
      on_log: callbacks.on_log,
      on_resource_result: callbacks.on_resource_result,
    });

    // Post-process results:
    // - NOT_FOUND on delete → treat as success (already gone)
    // - ALREADY_EXISTS on create → treat as success (already exists)
    // Extracted to `./apply-pipeline-helpers.ts` in rf-deploy2-2 housekeeping.
    normalizeIdempotentResultErrors(cardId, result);

    // Auto-cleanup on backend bucket quota error + retry once. Extracted
    // to `./quota-retry.ts` (rf-deploy-14) — the gate, the orphan
    // cleanup, and the retry-merge are all encapsulated there. This
    // call is a no-op short-circuit when the result has no quota
    // failure; mutates `result` in place when it does.
    await retryAfterQuotaCleanup({
      cardId,
      orgId,
      gcpProject,
      result,
      deployer,
      deployGraph: deploy_graph,
      translation,
      currentGraph,
      graphIdToCanvasId,
      authClient,
      options,
    });

    const durationMs = Date.now() - startTime;

    // 6. Persist the stable name mapping. Extracted to
    // `./apply-pipeline-helpers.ts` in rf-deploy2-2 housekeeping. The
    // helper mutates `res.source_node_id` in place on the result.resources
    // array so the persisted DB row carries the correlation — see the
    // helper's docstring for why that matters for the canvas overlay.
    await persistResourceMappings({
      cardId,
      result,
      findSourceNodeId,
      nameToLabel,
      environment,
    });

    // Phase 1: distinguish partial-success from full-failure so the baseline
    // query above can pick it up next time. `success` still means "every
    // resource created cleanly"; `partial` means "at least one succeeded
    // but not all"; `failed` means "nothing landed."
    const hasAnyResourceSuccess = (result.resources || []).some((r: any) => r.success);
    const finalStatus: 'success' | 'partial' | 'failed' = result.success
      ? 'success'
      : hasAnyResourceSuccess
        ? 'partial'
        : 'failed';

    // Update deployment record
    await prisma.canvasDeployment.update({
      where: { id: deployment.id },
      data: {
        status: finalStatus,
        results: result as any,
        summary: computeDeploySummary(result) as any,
        duration_ms: durationMs,
        error: result.errors?.length > 0 ? result.errors.map((e: any) => e.message).join('; ') : null,
      },
    });

    // Finalize the in-memory snapshot so late-joining clients see the
    // terminal state for a short grace window before it's cleared.
    finishDeploySnapshot(cardId, finalStatus);

    await deployer.cleanup();

    // Build a meaningful error message from results
    let errorMsg: string | null = null;
    if (!result.success) {
      const resourceErrors = (result.resources || [])
        .filter((r: any) => !r.success && r.error)
        .map((r: any) => r.error);
      const topLevelErrors = (result.errors || []).map((e: any) => e.message || e.error || String(e));
      const allErrors = [...topLevelErrors, ...resourceErrors];
      errorMsg = allErrors.length > 0 ? allErrors.join('; ') : 'Deployment failed — check resource configuration';
    }

    if (!result.success) {
      console.error('Deploy result (not success):', JSON.stringify(result, null, 2));
    }

    // Emit completion. The wire complete event carries an `outcome`
    // (success/partial/failure/cancelled) + `totals` rollup; the legacy
    // `success: bool` + `results: <full DeployResult>` shape is gone.
    // The full DeployResult lives on the `canvasDeployment` row already
    // (written above) and is fetched separately by the deploy panel —
    // including it on the wire is duplication.
    const cancelled = cancelSignal?.aborted === true;
    emitDeployEvent(cardId, {
      type: 'complete',
      card_id: cardId,
      outcome: deriveCompleteOutcome(result.resources, { cancelled, engineSuccess: result.success }),
      totals: computeCompleteTotals(result.resources),
      at: new Date().toISOString(),
      seq: 0,
    });

    return {
      success: result.success,
      deploymentId: deployment.id,
      duration_ms: durationMs,
      error: errorMsg,
      result,
    };
  } catch (err: any) {
    console.error('Deploy error:', err.message, err.stack);

    const durationMs = Date.now() - startTime;

    await prisma.canvasDeployment.update({
      where: { id: deployment.id },
      data: {
        status: 'failed',
        duration_ms: durationMs,
        error: err.message,
      },
    });

    finishDeploySnapshot(cardId, 'failed');

    // Catch-path complete: this is a hard engine throw, not a partial
    // outcome — surface as 'failure' (or 'cancelled' if the abort
    // signal was the trigger). The error text lives in the DB row.
    const cancelled = cancelSignal?.aborted === true;
    emitDeployEvent(cardId, {
      type: 'complete',
      card_id: cardId,
      outcome: cancelled ? 'cancelled' : 'failure',
      totals: { queued: 0, applying: 0, succeeded: 0, failed: 0, skipped: 0, cancelled: 0 },
      at: new Date().toISOString(),
      seq: 0,
    });

    return { success: false, deploymentId: deployment.id, duration_ms: durationMs, error: err.message };
  } finally {
    // Always clean up temp credential directory (directory + file inside).
    releaseTempDir(tempCredentialsDir);
    // DR-O3: force the throttled snapshot persister to flush before the
    // in-memory snapshot is cleared. Without this, a sub-500ms deploy
    // could finish before the first throttled write fires, leaving a
    // second tab with no snapshot to hydrate from.
    await flushSnapshotNow(cardId);
    releaseLock();
  }
  };

  // HTTP path defaults to async: return immediately so the request doesn't
  // sit open for 20+ minutes (which is what was triggering the 500-on-30-
  // min request-timeout the user hit). The client subscribes to socket
  // progress + the deploy_event tape via useDeploySubscription; when the
  // body finishes (or fails), it writes terminal status to the DB row and
  // emits a `complete` event that the client picks up.
  //
  // Queue worker passes `executeAsync: false` so its job loop stays serial
  // — running multiple deploys for the same card in parallel would race
  // on the deploy lock anyway.
  const executeAsync = options?.executeAsync !== false;
  if (executeAsync) {
    runBody().catch((err) => console.error('[applyDeployment] background uncaught:', err));
    return {
      success: true,
      async: true,
      deploymentId: deployment.id,
    };
  }
  return await runBody();
}

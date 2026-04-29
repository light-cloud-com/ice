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
import { mapStatusToOverlay } from '../utils/deploy-event-formatter.js';
import { computeCompleteTotals, deriveCompleteOutcome, computeDeploySummary } from '../utils/deploy-outcome.js';
import { buildResourceNameMaps, makeFindSourceNodeId } from '../utils/find-source-node-id.js';
import { resolveProjectContext } from '../utils/project-context.js';
import { createDeployer, getCoreEngine } from './deployer-factory.js';
import { autoEnableGCPApis, enableGcpApi } from './gcp-api-enabler.js';
import { installSnapshotPersister, flushSnapshotNow } from './snapshot-persister.js';
import { acquireWriteLock } from './deploy-lock-wrapper.js';
import { emitDeployEvent, emitLog, emitDestroyNodeStatus } from './deploy-event-dispatcher.js';
import { makeSchedulerCallbacks } from './scheduler-callbacks.js';
import { buildBaselineGraph } from './baseline-graph.js';
import {
  collectDestroyAllTargets,
  orderTargetsForDelete,
  resolveDestroyAllProject,
} from './destroy-targets.js';

installSnapshotPersister();

// Re-export `mapStatusToOverlay` so the public API of this module is
// preserved after rf-deploy-1 moved the implementation into
// `../utils/deploy-event-formatter.ts`. Downstream consumers (notably
// `services/deploy/src/index.ts`'s `export *` and tests that import via
// `services/deploy.service.js`) keep working unchanged.
export { mapStatusToOverlay };

// Re-export the outcome helpers extracted in rf-deploy-2 so the public
// API of this module is preserved. `computeCompleteTotals` and
// `deriveCompleteOutcome` are imported by `__tests__/deploy-event-translation.test.ts`
// via this file; `computeDeploySummary` was already module-private.
export { computeCompleteTotals, deriveCompleteOutcome };

// Re-export `enableGcpApi` so the public API of this module is preserved
// after rf-deploy-6 moved the implementation into `./gcp-api-enabler.ts`.
// `google-verification.service.ts` imports it from the canonical home now,
// but any other consumer that still goes through this orchestrator keeps
// resolving.
export { enableGcpApi };

// Re-export the event-dispatcher trio extracted in rf-deploy-9 so any
// legacy importer that still resolves them through this orchestrator
// (e.g. `queue.service.ts` / `requirement-poller.service.ts` / future
// downstream units rf-deploy-12 / rf-deploy-13 / rf-deploy-14) keeps
// working without a sweeping multi-file edit. The canonical home is
// `./deploy-event-dispatcher.ts`.
export { emitDeployEvent, emitLog, emitDestroyNodeStatus } from './deploy-event-dispatcher.js';

export type { DeployProgressSnapshot } from './deploy-locks.js';

/** Public re-export so routes can hit the cancel machinery directly. */
export function requestDeployCancel(cardId: string): boolean {
  return cancelLockDeploy(cardId);
}

/** Read the in-memory snapshot of an in-flight deploy for a card. */
export function getCurrentDeploySnapshot(cardId: string) {
  return getDeploySnapshot(cardId);
}

export async function planDeployment(cardId: string, nodes: any[], edges: any[], options: any, userId?: string) {
  try {
    const core = await getCoreEngine();
    const { translate_card_to_graph } = core;

    const { projectId, projectName, environmentType } = await resolveProjectContext(cardId);
    // Card's environment type from the DB is authoritative — the frontend
    // can override only when the lookup falls back to a stub.
    const environment = environmentType;

    // Seed the mapping table from history on first use after the Phase 1
    // upgrade, then load the name map so the translator reuses stable names.
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
      // Prefer the project name (visible in the project tree), fall back
      // to whatever the caller explicitly passed, then to a project-id
      // stub so resource names are never just "untitled".
      projectName: projectName || options.projectName || projectId,
      environment,
      gcpProject: options.gcpProject,
      region: options.region || 'us-central1',
      existing_names: existingNames,
      cardId,
    });

    // Build a proper plan shape the UI expects: creates/updates/deletes as arrays
    // of { name, type, action }. For now we only emit `creates` — update/delete
    // diffing happens at apply time against the last-deployed graph.
    const creates = (translation.deployables || []).map((d: any) => ({
      name: d.resource_name,
      type: d.resource_type,
      action: 'create' as const,
      source_node_id: d.node_id,
      label: d.label,
    }));

    const plan = {
      _schema_version: 1,
      creates,
      updates: [] as Array<{ name: string; type: string; action: 'update' }>,
      deletes: [] as Array<{ name: string; type: string; action: 'delete' }>,
      deployable_count: translation.deployable_count,
      skipped: translation.skipped || [],
      warnings: translation.warnings || [],
      graph_summary: {
        nodes: translation.graph?.nodes?.length || translation.graph?.get_nodes?.()?.length || 0,
        edges: translation.graph?.edges?.length || translation.graph?.get_edges?.()?.length || 0,
      },
    };

    const deployment = await prisma.canvasDeployment.create({
      data: {
        card_id: cardId,
        user_id: userId,
        status: 'planned',
        action_type: 'plan',
        provider: options.provider || 'gcp',
        region: options.region || 'us-central1',
        environment: options.environment || 'development',
        plan: plan as any,
      },
    });

    return { success: true, plan, deploymentId: deployment.id };
  } catch (err: any) {
    // Fallback to basic plan if core engine translation fails
    console.error('Core engine plan error, falling back:', err.message);
    return fallbackPlan(cardId, nodes, edges, options, userId);
  }
}

async function fallbackPlan(cardId: string, nodes: any[], edges: any[], options: any, userId?: string) {
  const deployableNodes = (nodes || []).filter(
    (n: any) => n.type === 'resource' && n.data?.provider === (options?.provider || 'gcp'),
  );

  const plan = {
    _schema_version: 1,
    creates: deployableNodes.map((n: any) => ({
      name: n.data?.label || n.id,
      type: n.data?.iceType || 'unknown',
      action: 'create' as const,
      source_node_id: n.id,
      label: n.data?.label || n.id,
    })),
    updates: [] as Array<{ name: string; type: string; action: 'update' }>,
    deletes: [] as Array<{ name: string; type: string; action: 'delete' }>,
    deployable_count: deployableNodes.length,
    skipped: (nodes || [])
      .filter((n: any) => n.type === 'resource' && n.data?.provider !== (options?.provider || 'gcp'))
      .map((n: any) => ({
        nodeId: n.id,
        label: n.data?.label || n.id,
        reason: 'Non-matching provider',
      })),
    warnings: [],
    graph_summary: { nodes: deployableNodes.length, edges: (edges || []).length },
  };

  const deployment = await prisma.canvasDeployment.create({
    data: {
      card_id: cardId,
      user_id: userId,
      status: 'planned',
      action_type: 'plan',
      provider: options?.provider || 'gcp',
      region: options?.region || 'us-central1',
      environment: options?.environment || 'development',
      plan: plan as any,
    },
  });

  return { success: true, plan, deploymentId: deployment.id };
}

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
    // deploy service found in the canvas input. The most common
    // "github repo not deploying" cause is that the Source.Repository
    // node has an empty `repository` field — this log makes that
    // immediately obvious without needing to inspect Redux state.
    try {
      const repoNodes = (nodes as any[]).filter((n) => (n.data?.iceType as string) === 'Source.Repository');
      if (repoNodes.length > 0) {
        emitLog(cardId, `[diagnostic] Found ${repoNodes.length} Source.Repository node(s) in canvas`);
        for (const r of repoNodes) {
          const repoVal = String(r.data?.repository || '').trim();
          const branchVal = String(r.data?.branch || 'main').trim();
          const connectedEdges = (edges as any[]).filter((e) => e.source === r.id || e.target === r.id);
          const connectedTargets = connectedEdges
            .map((e) => (e.source === r.id ? e.target : e.source))
            .map((tid) => (nodes as any[]).find((n) => n.id === tid))
            .filter(Boolean);
          if (!repoVal) {
            emitLog(
              cardId,
              `[diagnostic] Source.Repository ${r.id.slice(0, 8)} has EMPTY repository field — open its properties panel and pick a repo, then redeploy.`,
            );
          } else if (connectedTargets.length === 0) {
            emitLog(
              cardId,
              `[diagnostic] Source.Repository ${r.id.slice(0, 8)} (${repoVal}) has NO connected targets — drag an edge to a compute block.`,
            );
          } else {
            const targetSummary = connectedTargets
              .map((tn: any) => `${(tn.data?.label as string) || tn.id.slice(0, 8)} (${tn.data?.iceType})`)
              .join(', ');
            emitLog(
              cardId,
              `[diagnostic] Source.Repository ${r.id.slice(0, 8)} → ${repoVal}#${branchVal} → ${targetSummary}`,
            );
          }
        }
      }
    } catch (e: any) {
      // Diagnostic must never fail the deploy
      emitLog(cardId, `[diagnostic] Source.Repository scan failed: ${e?.message || e}`);
    }

    // 3.5. Auto-register deployment rules for any Source.Repository →
    // Compute edges. This is what makes "push to GitHub auto-redeploys
    // my Firebase Hosting site" work without the user manually clicking
    // into the Source.Repository properties panel. Idempotent — re-uses
    // existing rules and webhooks.
    if (userId) {
      try {
        const { ensureRulesForCanvas } = await import('./pipeline.service.js');
        const ruleResult = await ensureRulesForCanvas(
          cardId,
          nodes,
          edges,
          orgId,
          userId,
          options.environment || 'development',
        );
        for (const rule of ruleResult.created) {
          const webhookNote =
            rule.webhookStatus === 'active'
              ? 'webhook active — pushes will auto-redeploy'
              : rule.webhookStatus === 'failed'
                ? 'webhook NOT registered (PAT missing repo:admin scope) — manual deploys only'
                : 'webhook pending';
          emitLog(
            cardId,
            `[pipeline] Source.Repository → ${rule.repository} wired to node ${rule.nodeId.slice(0, 8)} (${webhookNote})`,
          );
        }
        for (const err of ruleResult.errors) {
          emitLog(cardId, `[pipeline] Could not register auto-deploy rule for ${err.repository}: ${err.error}`);
        }
      } catch (err: any) {
        // Non-fatal — auto-rule registration is best-effort.
        emitLog(cardId, `[pipeline] Auto-rule registration failed (non-fatal): ${err?.message || err}`);
      }
    }

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
      console.log('Auto-enable: project=', gcpProject, 'hasToken=', !!accessToken);
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

    // Log diff for debugging
    const desiredNodes = translation.graph?.nodes?.values ? [...translation.graph.nodes.values()] : [];
    const currentNodes = currentGraph?.nodes?.values ? [...currentGraph.nodes.values()] : [];
    console.log(`Diff: desired=${desiredNodes.length} nodes, current=${currentNodes.length} nodes`);
    console.log(
      'Desired:',
      desiredNodes.map((n: any) => `${n.type}::${n.name}`),
    );
    console.log(
      'Current:',
      currentNodes.map((n: any) => `${n.type}::${n.name}`),
    );

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
    if (result.resources?.length > 0) {
      for (const res of result.resources) {
        if (!res.success && res.error) {
          if (res.action === 'delete' && res.error.includes('NOT_FOUND')) {
            res.success = true;
            res.error = undefined;
            emitLog(cardId, `${res.name}: already deleted (NOT_FOUND) — marking as removed`);
          } else if (res.action === 'create' && res.error.includes('ALREADY_EXISTS')) {
            res.success = true;
            res.error = undefined;
            res.action = 'no_change';
            emitLog(cardId, `${res.name}: already exists — skipping`);
          }
        }
      }
      // Recalculate success
      result.success = result.resources.every((r: any) => r.success);
      if (result.summary) {
        result.summary.failed = result.resources.filter((r: any) => !r.success).length;
      }
    }

    // Auto-cleanup on backend bucket quota error + retry once. The
    // user's pain point: hitting the GCP default 3-backend-bucket
    // limit during iteration leaves the user staring at a "Cleanup
    // Orphans" button that they didn't know they had to click. Instead
    // we detect the quota error in the deploy result, run orphan
    // cleanup automatically, and re-run the failed resources.
    const QUOTA_PATTERNS = ['QUOTA_EXCEEDED', "Quota 'BACKEND_BUCKETS'", 'Backend bucket quota exceeded'];
    const hasQuotaFailure = (result.resources || []).some(
      (r: any) => !r.success && r.error && QUOTA_PATTERNS.some((p) => String(r.error).includes(p)),
    );
    if (hasQuotaFailure) {
      emitLog(
        cardId,
        '[auto-cleanup] Backend bucket quota exceeded — scanning for orphaned ICE resources to free up the slot...',
      );
      try {
        const { cleanupOrphanedIceResources } = await import('./orphan-cleanup.service.js');
        const cleanup = await cleanupOrphanedIceResources(orgId, gcpProject, { dryRun: false });
        const deletedCount = cleanup.deleted.length;
        emitLog(
          cardId,
          deletedCount > 0
            ? `[auto-cleanup] Freed ${deletedCount} orphaned resource${deletedCount === 1 ? '' : 's'} — retrying failed resources.`
            : '[auto-cleanup] No orphans found. Quota is exhausted by active deployments — destroy an old project or request a quota increase.',
        );

        if (deletedCount > 0) {
          // Re-run only the resources that failed with a quota error.
          // We rebuild a sub-graph by filtering the original translation
          // to only the failed names + their dependencies. The
          // forwarding rule + URL map + target proxy chain depends on
          // the backend bucket, so freeing one slot fixes the whole
          // downstream chain on retry.
          emitLog(cardId, '[auto-cleanup] Retrying deploy after orphan cleanup...');
          const retryCallbacks = makeSchedulerCallbacks({
            cardId,
            graphIdToCanvasId,
            warnOnMiss: false,
            // No `totals` — retry skips overall-progress writes per the
            // original behavior.
          });
          const retryResult = await deploy_graph(translation.graph, currentGraph, deployer, {
            provider: options.provider || 'gcp',
            project: gcpProject,
            regions: [options.region || 'us-central1'],
            continue_on_error: true,
            auth_client: authClient,
            auth_key_file: (authClient as any)?._ice_key_file_path,
            auth_credentials: (authClient as any)?._ice_parsed_credentials,
            on_log: retryCallbacks.on_log,
            on_node_status: retryCallbacks.on_node_status,
            on_node_progress: retryCallbacks.on_node_progress,
            // on_resource_result intentionally omitted to match the
            // original retry shape.
          });
          // Merge retry results into the primary result: any resource
          // that succeeded on retry overrides its failed entry from the
          // first attempt. The deploy engine internally skips already-
          // existing resources via ALREADY_EXISTS handling.
          if (retryResult.resources?.length > 0) {
            const byName = new Map<string, any>();
            for (const r of result.resources) byName.set(r.name, r);
            for (const r of retryResult.resources) {
              if (r.success) byName.set(r.name, r);
            }
            result.resources = Array.from(byName.values());
            result.success = result.resources.every((r: any) => r.success);
            if (result.summary) {
              result.summary.failed = result.resources.filter((r: any) => !r.success).length;
            }
          }
        }
      } catch (cleanupErr: any) {
        emitLog(cardId, `[auto-cleanup] Cleanup attempt failed: ${cleanupErr?.message || cleanupErr}`);
      }
    }

    const durationMs = Date.now() - startTime;

    // 6. Persist the stable name mapping. Phase 1: every successful
    // resource's (node_id → name + provider_id) becomes the source of
    // truth for future plans, surviving label changes.
    //
    // Critical: mutate `res.source_node_id` IN PLACE on the
    // result.resources array so the persisted DB row has it. The live
    // wire emit for per-resource lifecycle is covered by
    // `on_node_status`'s terminal event — there's no `resource_result`
    // wire event in the new contract, just persistence + the canvas
    // overlay write driven by `getNodeDeploymentOverlay` on next page
    // load. Without source_node_id on the persisted row,
    // `getNodeDeploymentOverlay` would filter the entry out (every
    // overlay row requires source_node_id) and the canvas block would
    // never show any URL or status after a refresh.
    if (result.resources?.length > 0) {
      for (const res of result.resources) {
        const source_node_id = findSourceNodeId(res);
        if (source_node_id) {
          res.source_node_id = source_node_id;
        }
        const label = source_node_id ? nameToLabel.get(res.name) || '-' : '-';
        console.log(`Resource result: ${res.name} → matched node: ${source_node_id || 'NONE'} (label: ${label})`);

        if (source_node_id && res.success && res.name && res.type) {
          await upsertResourceMapping({
            cardId,
            nodeId: source_node_id,
            environment,
            resourceType: res.type,
            resourceName: res.name,
            providerId: res.provider_id,
          }).catch((err: any) => {
            console.warn(`Failed to upsert resource mapping for ${res.name}:`, err.message);
          });
        }
      }
    }

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
    const gcpProject =
      resolveDestroyAllProject({ options, credentials, targets: targets.values() }) ?? '';
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
        if (t.nodeId) {
          emitDestroyNodeStatus(cardId, {
            canvasNodeId: t.nodeId,
            resourceName: t.name,
            resourceType: t.type,
            status: 'queued',
          });
        }
      }

      const deleted: Array<{ type: string; name: string }> = [];
      const failed: Array<{ type: string; name: string; error: string }> = [];
      for (const t of ordered) {
        // pdl-10 — emit `applying` for canvas-correlated targets and
        // capture the start time for duration_ms on the terminal event.
        const applyingAt = Date.now();
        if (t.nodeId) {
          emitDestroyNodeStatus(cardId, {
            canvasNodeId: t.nodeId,
            resourceName: t.name,
            resourceType: t.type,
            status: 'applying',
          });
        }
        try {
          const res = await deployer.delete(t.type, t.name, t.providerId || t.name, {
            provider,
            project: gcpProject,
          });
          if (res.success || res.error?.includes('NOT_FOUND') || res.error?.includes('404')) {
            deleted.push({ type: t.type, name: t.name });
            if (t.nodeId) {
              emitDestroyNodeStatus(cardId, {
                canvasNodeId: t.nodeId,
                resourceName: t.name,
                resourceType: t.type,
                status: 'succeeded',
                duration_ms: Date.now() - applyingAt,
              });
            }
            // Clean up the mapping row for this resource.
            await prisma.deployedResourceMapping
              .deleteMany({ where: { card_id: cardId, resource_name: t.name, resource_type: t.type } })
              .catch(() => undefined);
          } else {
            const errMsg = res.error || 'delete returned non-success';
            failed.push({ type: t.type, name: t.name, error: errMsg });
            if (t.nodeId) {
              emitDestroyNodeStatus(cardId, {
                canvasNodeId: t.nodeId,
                resourceName: t.name,
                resourceType: t.type,
                status: 'failed',
                duration_ms: Date.now() - applyingAt,
                error: { code: 'DESTROY_FAILED', message: errMsg },
              });
            }
          }
        } catch (err: any) {
          const msg = err?.message || String(err);
          if (msg.includes('NOT_FOUND') || msg.includes('404')) {
            deleted.push({ type: t.type, name: t.name });
            // Treat NOT_FOUND/404 as a successful destroy (the resource is
            // gone, which is what we wanted) — same shape as the inline
            // success branch above.
            if (t.nodeId) {
              emitDestroyNodeStatus(cardId, {
                canvasNodeId: t.nodeId,
                resourceName: t.name,
                resourceType: t.type,
                status: 'succeeded',
                duration_ms: Date.now() - applyingAt,
              });
            }
            await prisma.deployedResourceMapping
              .deleteMany({ where: { card_id: cardId, resource_name: t.name, resource_type: t.type } })
              .catch(() => undefined);
          } else {
            failed.push({ type: t.type, name: t.name, error: msg });
            if (t.nodeId) {
              emitDestroyNodeStatus(cardId, {
                canvasNodeId: t.nodeId,
                resourceName: t.name,
                resourceType: t.type,
                status: 'failed',
                duration_ms: Date.now() - applyingAt,
                error: { code: 'DESTROY_FAILED', message: msg },
              });
            }
          }
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

export async function destroyDeployment(cardId: string, orgId: string, userId?: string) {
  console.log('[destroy] ENTRY cardId=' + cardId + ' orgId=' + orgId);
  // Per-card lock — no concurrent destroys on the same card.
  let releaseLock: () => void;
  try {
    releaseLock = acquireWriteLock(cardId, 'destroy');
    console.log('[destroy] lock acquired cardId=' + cardId);
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
  console.log('[destroy] baseline found deploymentId=' + deployment.id + ' status=' + deployment.status);

  const provider = deployment.provider || 'gcp';
  const credentials = await providerService.getDecryptedCredentials(orgId, provider);
  if (!credentials) {
    console.warn('[destroy] NO CREDENTIALS orgId=' + orgId + ' provider=' + provider);
    releaseLock();
    throw new Error('Provider not connected');
  }
  console.log('[destroy] credentials resolved provider=' + provider);

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
    console.log(
      '[destroy] begin delete loop project=' +
        destroyProject +
        ' resources=' +
        resources.length +
        ' (will delete in reverse deployment order)',
    );

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
        emitDestroyNodeStatus(cardId, {
          canvasNodeId: res.source_node_id,
          resourceName: res.name,
          resourceType: res.type,
          status: 'queued',
        });
      }
    }

    for (const res of resources) {
      if (res.success && res.provider_id) {
        console.log('[destroy] deleting ' + res.type + '/' + res.name + ' provider_id=' + res.provider_id);
        // pdl-10 — capture the applying-at marker so duration_ms can be
        // computed for the terminal event below. Only resources with a
        // canvas correlation get the wire emit.
        const hasCanvasId = Boolean(res.source_node_id);
        const applyingAt = Date.now();
        if (hasCanvasId) {
          emitDestroyNodeStatus(cardId, {
            canvasNodeId: res.source_node_id,
            resourceName: res.name,
            resourceType: res.type,
            status: 'applying',
          });
        }
        try {
          const deleteResult = await deployer.delete(res.type, res.name, res.provider_id, {
            provider,
            project: destroyProject,
          });
          console.log(
            '[destroy]   → ' +
              res.type +
              '/' +
              res.name +
              ' success=' +
              deleteResult.success +
              (deleteResult.error ? ' error=' + deleteResult.error : ''),
          );
          deleteResults.push(deleteResult);
          if (hasCanvasId) {
            const durationMs = Date.now() - applyingAt;
            if (deleteResult.success) {
              emitDestroyNodeStatus(cardId, {
                canvasNodeId: res.source_node_id,
                resourceName: res.name,
                resourceType: res.type,
                status: 'succeeded',
                duration_ms: durationMs,
              });
            } else {
              emitDestroyNodeStatus(cardId, {
                canvasNodeId: res.source_node_id,
                resourceName: res.name,
                resourceType: res.type,
                status: 'failed',
                duration_ms: durationMs,
                error: {
                  code: 'DESTROY_FAILED',
                  message: deleteResult.error || 'delete returned non-success',
                },
              });
            }
          }
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
        } catch (err: any) {
          deleteResults.push({ resource_id: res.resource_id, success: false, error: err.message });
          // pdl-10 — emit `failed` for the canvas-correlated row before
          // the log line so the per-node UI updates immediately. The
          // throw-path needs the same treatment as the deleteResult.error
          // branch above; otherwise a thrown delete (auth fail, network
          // hang) leaves the row stuck on `applying` forever.
          if (res.source_node_id) {
            emitDestroyNodeStatus(cardId, {
              canvasNodeId: res.source_node_id,
              resourceName: res.name,
              resourceType: res.type,
              status: 'failed',
              error: {
                code: 'DESTROY_FAILED',
                message: err.message || String(err),
              },
            });
          }
          emitLog(cardId, `Failed to delete ${res.name}: ${err.message}`);
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

/**
 * Compute a per-node overlay of deploy state for a card. Used by the
 * frontend on card load to hydrate canvas block node data with:
 *
 *   - deploy_status (active / error / idle)
 *   - deploy_outputs (raw resource outputs from GCP)
 *   - provider_id
 *   - last_deployed_at
 *   - domain (the custom domain URL, propagated from CustomDomain blocks to
 *     every compute block they're connected to so the Static Site block
 *     displays "https://mysite.com" instead of only the bucket URL)
 *
 * This is the second half of the fix for "user doesn't see the domain
 * attached to deployed resources" — outputs are now read at load time
 * without requiring a live socket event or a panel to be open.
 */
export async function getNodeDeploymentOverlay(
  cardId: string,
  environment = 'development',
): Promise<Record<string, any>> {
  // Load the latest deploy for the card+env. Accept success OR partial so
  // half-successful deploys still show up on the canvas.
  const deployment = await prisma.canvasDeployment.findFirst({
    where: {
      card_id: cardId,
      environment,
      status: { in: ['success', 'partial'] },
    },
    orderBy: { created_at: 'desc' },
  });
  if (!deployment?.results) return {};

  const results = deployment.results as any;
  const resources = (results.resources || []) as any[];
  const overlay: Record<string, any> = {};

  // Primary pass — raw outputs per resource keyed by source_node_id.
  // Seed `default_url` from the handler's own output so it's available even
  // when no Internet/LB edge exists — it's the URL the user can always hit
  // regardless of custom-domain status.
  //
  // Also normalize known-broken stored URLs at read time:
  //   - `https://storage.googleapis.com/<bucket>/` (trailing slash, no
  //     object) is a bucket-list request and returns 403 even with
  //     allUsers:objectViewer. Rewrite to `/<index_page>` so existing
  //     deploy rows render a URL that actually works — the user doesn't
  //     need to destroy and redeploy to pick up the fix.
  for (const res of resources) {
    if (!res.source_node_id) continue;
    const handlerOutputs = { ...(res.outputs || {}) };
    const rawUrl = handlerOutputs.url as string | undefined;
    if (
      typeof rawUrl === 'string' &&
      /^gcp\.storage\.bucket$/.test(res.type || '') &&
      /^https:\/\/storage\.googleapis\.com\/[^/]+\/?$/.test(rawUrl)
    ) {
      const bucketName = rawUrl.replace(/\/$/, '').split('/').pop() || '';
      const indexPage = (handlerOutputs.index_page as string) || 'index.html';
      handlerOutputs.url = `https://storage.googleapis.com/${bucketName}/${indexPage}`;
    }
    const ownUrl = handlerOutputs.url as string | undefined;
    overlay[res.source_node_id] = {
      deploy_status: res.success ? 'active' : 'error',
      deploy_outputs: {
        ...handlerOutputs,
        default_url: ownUrl || handlerOutputs.default_url,
      },
      provider_id: res.provider_id,
      deploy_error: res.success ? undefined : res.error,
      last_deployed_at: deployment.updated_at.toISOString(),
      deploy_resource_type: res.type,
      deploy_resource_name: res.name,
    };
  }

  // Second pass — propagate a CustomDomain URL to every deployable node
  // connected to the forwarding rule that references its cert. The load
  // balancer handler emits `url`, `domain`, and `ssl_certificate` onto its
  // own outputs (see `handlers/load-balancer.ts`); we forward those to the
  // StaticSite / Cloud Run block so the user sees the friendly URL on the
  // block they actually think of as "their site."
  //
  // Non-destructive: the compute block's own URL (e.g. the bucket's
  // `https://storage.googleapis.com/...` or Cloud Run's `.run.app` URL) is
  // preserved as `default_url` so the UI can render both — custom domain
  // primary, default fallback underneath. Overwriting would make the user
  // lose sight of the always-available internal URL.
  const card = await prisma.canvasCard.findUnique({ where: { id: cardId } });
  if (!card) return overlay;

  const nodes = (card.nodes as any[]) || [];
  const edges = (card.edges as any[]) || [];
  const findNode = (id: string) => nodes.find((n: any) => n.id === id);

  // Find forwarding rule node(s) that carry a domain/url in their outputs.
  for (const [nodeId, entry] of Object.entries(overlay)) {
    const node = findNode(nodeId);
    if (!node) continue;
    const iceType = node.data?.iceType as string | undefined;
    if (iceType !== 'Network.PublicEndpoint') continue;
    const lbUrl = entry.deploy_outputs?.url as string | undefined;
    const lbDomain = entry.deploy_outputs?.domain as string | undefined;
    const lbIp = (entry.deploy_outputs?.ip_address || entry.deploy_outputs?.IPAddress) as string | undefined;
    if (!lbUrl && !lbDomain && !lbIp) continue;

    // Walk every edge touching this PublicEndpoint node, find the compute
    // block on the other side, and overlay the right URL onto it. With
    // per-edge subdomain support, each compute block gets its own host
    // (`<subdomain>.<rootDomain>`) rather than the bare root domain.
    const rootDomain = (lbDomain || (node.data?.domain as string) || '').trim();
    for (const edge of edges) {
      const otherId = edge.source === nodeId ? edge.target : edge.target === nodeId ? edge.source : null;
      if (!otherId) continue;
      const other = findNode(otherId);
      if (!other) continue;
      const otherIce = (other.data?.iceType as string | undefined) || '';
      if (!/^Compute\./.test(otherIce)) continue;
      const subdomain = ((edge.data as any)?.subdomain as string | undefined)?.trim() || '';
      const host = subdomain && rootDomain ? `${subdomain}.${rootDomain}` : rootDomain;
      const existing = overlay[otherId] || {};
      const existingOutputs = existing.deploy_outputs || {};
      // Preserve the compute block's own URL as `default_url` so the UI
      // can always show "Default: <internal url>" next to the public URL.
      const nodeOwnUrl = existingOutputs.url as string | undefined;
      const nodeOwnDefault = existingOutputs.default_url as string | undefined;
      const defaultUrl = nodeOwnDefault || nodeOwnUrl;
      // Primary URL priority: per-edge host > LB url > node's own url.
      const primaryUrl = (host ? `https://${host}` : undefined) || lbUrl || nodeOwnUrl;
      overlay[otherId] = {
        ...existing,
        deploy_outputs: {
          ...existingOutputs,
          domain: host || existingOutputs.domain,
          url: primaryUrl,
          default_url: defaultUrl,
          ip_address: lbIp || existingOutputs.ip_address,
        },
      };
    }
  }

  // Third pass — mirror the deployed domain onto the PublicEndpoint block
  // itself so the canvas block shows `https://<domain>` directly.
  for (const node of nodes) {
    if ((node.data?.iceType as string | undefined) !== 'Network.PublicEndpoint') continue;
    const domain = String(node.data?.domain || '').trim();
    if (!domain) continue;
    const existing = overlay[node.id] || {};
    overlay[node.id] = {
      ...existing,
      deploy_outputs: {
        ...(existing.deploy_outputs || {}),
        domain,
        url: `https://${domain}`,
      },
    };
  }

  return overlay;
}

/**
 * Phase 7 — real drift detection.
 *
 * Compares the canvas desired state against *actual* GCP state by calling
 * each handler's `describe` method. This catches drift that the old
 * stored-vs-canvas comparison missed entirely (e.g., someone deleted a
 * bucket in the console — the old check would report in_sync because the
 * stored record still showed it as deployed).
 *
 * Sources of truth:
 *   - Mapping table (`DeployedResourceMapping`): the node_id → resource_name
 *     contract that survived Phase 1.
 *   - GCP `describe` calls: the real cloud state.
 *   - Canvas desired state: what the user wants right now.
 */
export async function checkDrift(cardId: string, nodes: any[], options?: { environment?: string; orgId?: string }) {
  const environment = options?.environment || 'development';

  const mapping = await prisma.deployedResourceMapping.findMany({
    where: { card_id: cardId, environment },
  });
  if (mapping.length === 0) {
    return { driftResults: [], checkedAt: new Date().toISOString(), unsupported: false };
  }

  // If we have an org id, spin up a real deployer so describe calls can hit GCP.
  // Without one, we fall back to stored-state comparison which is still better
  // than nothing for sanity checking canvas consistency.
  const canQueryGcp = Boolean(options?.orgId);
  let deployer: any = null;
  let driftScopedAuth: any = null;
  if (canQueryGcp) {
    try {
      const credentials = await providerService.getDecryptedCredentials(options!.orgId!, 'gcp');
      if (credentials) {
        deployer = await createDeployer('gcp');
        driftScopedAuth = await resolveProviderAuth('gcp', {
          orgId: options!.orgId!,
          credentials,
          requestedScope: { project: credentials.project_id },
        });
        await deployer.initialize({
          provider: 'gcp',
          project: driftScopedAuth.scope.project || (driftScopedAuth.authClient as any)?.projectId,
          regions: ['us-central1'],
          auth_client: driftScopedAuth.authClient,
          auth_credentials: driftScopedAuth.parsedCredentials,
          auth_key_file: driftScopedAuth.keyFilePath,
        });
      }
    } catch (err: any) {
      console.warn('[drift] failed to initialize deployer, falling back to stored-state drift:', err.message);
      deployer = null;
    }
  }

  const driftResults: Array<{
    nodeId: string;
    status: 'in_sync' | 'drifted' | 'missing' | 'extra' | 'unknown';
    changes: Array<{ path: string; desired: unknown; actual: unknown }>;
  }> = [];

  const canvasById = new Map<string, any>();
  for (const n of nodes) if (n.type === 'resource') canvasById.set(n.id, n);

  try {
    // 1. For every mapped (node_id → resource) entry, describe the real resource.
    for (const m of mapping) {
      const canvasNode = canvasById.get(m.node_id);

      if (deployer && typeof deployer.describe === 'function') {
        const desc = await deployer.describe(m.resource_type, m.resource_name, m.provider_id || m.resource_name);
        if (desc.supported === false) {
          driftResults.push({ nodeId: m.node_id, status: 'unknown', changes: [] });
          continue;
        }
        if (!desc.exists) {
          // Deleted externally — report as missing regardless of canvas state.
          driftResults.push({ nodeId: m.node_id, status: 'missing', changes: [] });
          continue;
        }

        // Compare desired (from canvas) vs actual (from GCP).
        const changes: Array<{ path: string; desired: unknown; actual: unknown }> = [];
        if (canvasNode) {
          const desiredProps = (canvasNode.data?.properties || {}) as Record<string, unknown>;
          const actualProps = (desc.properties || {}) as Record<string, unknown>;
          for (const [key, desiredVal] of Object.entries(desiredProps)) {
            if (key.startsWith('_') || desiredVal == null || desiredVal === '') continue;
            const actualVal = actualProps[key];
            if (actualVal === undefined) continue; // ICE doesn't manage this field for this type
            if (JSON.stringify(actualVal) !== JSON.stringify(desiredVal)) {
              changes.push({ path: key, desired: desiredVal, actual: actualVal });
            }
          }
        }
        driftResults.push({
          nodeId: m.node_id,
          status: changes.length > 0 ? 'drifted' : canvasNode ? 'in_sync' : 'extra',
          changes,
        });
      } else {
        // No GCP query available — fall back to "if canvas has it, call it in-sync".
        driftResults.push({
          nodeId: m.node_id,
          status: canvasNode ? 'in_sync' : 'extra',
          changes: [],
        });
      }
    }

    // 2. Canvas nodes with no mapping are new (never deployed).
    for (const [nodeId, node] of canvasById.entries()) {
      if (!node.data?.iceType) continue;
      if (!mapping.find((m) => m.node_id === nodeId)) {
        // Not yet deployed — report as unknown so the UI can show it distinctly.
        driftResults.push({ nodeId, status: 'unknown', changes: [] });
      }
    }
  } finally {
    if (deployer) {
      try {
        await deployer.cleanup();
      } catch {}
    }
    if (driftScopedAuth) {
      try {
        await cleanupProviderAuth('gcp', driftScopedAuth);
      } catch {}
    }
  }

  return { driftResults, checkedAt: new Date().toISOString(), unsupported: !deployer };
}

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


/**
 * Deploy Service — Real deployment using @ice/core deployers
 *
 * Translates canvas card nodes → deployable graph → cloud provisioning.
 * Uses user's own cloud credentials (not Light Cloud's).
 */

import prisma from '@ice/db';
import * as providerService from '@ice/service-credentials';
import {
  emitDeployComplete,
  emitDeployLog,
  emitDeployNodeProgress,
  emitDeployNodeStatus,
  emitDeployRequirementVerified,
} from '@ice/shared';
import type {
  DeployEvent,
  DeployLogEvent,
} from '@ice/types';
import type { NodeStatusEvent, NodeProgressEvent } from '@ice/core';
import { nextDeploySeq, recordDeployEvent } from './deploy-event-log.js';
import {
  acquireDeployLock,
  cancelDeploy as cancelLockDeploy,
  DeployLockError,
  finishDeploySnapshot,
  getDeploySnapshot,
  releaseTempDir,
  setSnapshotPersister,
  startDeploySnapshot,
  updateDeploySnapshot,
  updateDeploySnapshotNode,
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
import { describeEventForLog, mapStatusToOverlay } from '../utils/deploy-event-formatter.js';
import { computeCompleteTotals, deriveCompleteOutcome, computeDeploySummary } from '../utils/deploy-outcome.js';
import { buildResourceNameMaps, makeFindSourceNodeId } from '../utils/find-source-node-id.js';
import { resolveProjectContext } from '../utils/project-context.js';

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

// ── Snapshot persistence ─────────────────────────────────────────────────────
//
// Install a DB persister for `DeployProgressSnapshot` so the latest state
// is always durable on `CanvasDeployment.snapshot`. This is what lets a
// refreshed page see live progress even after a gateway restart: the
// in-memory snapshot is lost but the DB copy survives and `/current/:cardId`
// falls back to it. We throttle writes to once every 500ms per card so a
// burst of progress events doesn't hammer the DB.
const pendingSnapshotWrites = new Map<string, NodeJS.Timeout>();
const SNAPSHOT_WRITE_INTERVAL_MS = 500;

setSnapshotPersister((snapshot: DeployProgressSnapshot) => {
  if (!snapshot.deploymentId) return;
  const cardId = snapshot.cardId;
  if (pendingSnapshotWrites.has(cardId)) return; // a write is already queued
  const timer = setTimeout(() => {
    pendingSnapshotWrites.delete(cardId);
    const latest = getDeploySnapshot(cardId);
    if (!latest?.deploymentId) return;
    prisma.canvasDeployment
      .update({
        where: { id: latest.deploymentId },
        data: { snapshot: latest as any },
      })
      .catch((err: any) => {
        console.warn('[snapshot-persist] write failed:', err.message);
      });
  }, SNAPSHOT_WRITE_INTERVAL_MS);
  timer.unref?.();
  pendingSnapshotWrites.set(cardId, timer);
});

/**
 * Force a pending snapshot write to flush NOW. Called at the end of
 * applyDeployment so a very short deploy (e.g. 400 ms no-op) that finishes
 * before the 500 ms throttle fires still leaves its terminal state in
 * the DB — otherwise a second tab opening right as the deploy ends sees
 * no snapshot and can get stuck on a stale "deploying" view.
 */
async function flushSnapshotNow(cardId: string): Promise<void> {
  const pending = pendingSnapshotWrites.get(cardId);
  if (pending) {
    clearTimeout(pending);
    pendingSnapshotWrites.delete(cardId);
  }
  const latest = getDeploySnapshot(cardId);
  if (!latest?.deploymentId) return;
  try {
    await prisma.canvasDeployment.update({
      where: { id: latest.deploymentId },
      data: { snapshot: latest as any },
    });
  } catch (err: any) {
    console.warn('[snapshot-persist] final flush failed:', err.message);
  }
}

/**
 * Emit a typed {@link DeployEvent} over the socket and persist a row to
 * the event log so reconnecting clients can replay the narrative. The
 * caller passes a `DeployEvent` with `seq: 0` as a placeholder; this
 * helper allocates the next monotonic seq from `nextDeploySeq` and
 * mutates `event.seq` in place so both the wire emit and the persistent
 * log row carry the SAME number — see `deploy-event-log.ts:nextDeploySeq`
 * for why that matters (reconnect dedup correctness).
 *
 * For events fired OUTSIDE an active deploy (e.g. the requirement-poller
 * after a deploy has finished), `nextDeploySeq` returns null and we fall
 * back to `Date.now()`. Those events are rare, idempotent, and the
 * frontend treats them as point-in-time updates rather than replayable
 * tape — the dedup-on-reconnect contract isn't load-bearing for them.
 *
 * Replaces the legacy untyped `emitDeployProgress(cardId, { type, ... })`
 * shadow that fronted the @ice/shared wire emitter — pdl-2 split the wire
 * into five typed helpers, this dispatcher routes by `event.type`.
 */
function emitDeployEvent(cardId: string, event: DeployEvent): void {
  // Allocate seq before either side-effect so they share the value.
  // Falls back to Date.now() for events fired outside an active deploy.
  const allocated = nextDeploySeq(cardId);
  event.seq = allocated ?? Date.now();

  console.log(
    '[deploy] emit cardId=' +
      cardId +
      ' type=' +
      event.type +
      ' seq=' +
      event.seq +
      ' detail=' +
      describeEventForLog(event),
  );

  try {
    switch (event.type) {
      case 'node_status':
        emitDeployNodeStatus(cardId, event);
        break;
      case 'node_progress':
        emitDeployNodeProgress(cardId, event);
        break;
      case 'log':
        emitDeployLog(cardId, event);
        break;
      case 'complete':
        emitDeployComplete(cardId, event);
        break;
      case 'requirement_verified':
        emitDeployRequirementVerified(cardId, event);
        break;
    }
  } catch (err: any) {
    console.warn('[deploy] wire emit failed: ' + err.message);
  }

  try {
    recordDeployEvent(cardId, event.seq, event.type, event);
  } catch (err: any) {
    // Event-log failures must never break the live emit.
    console.warn('[deploy] recordDeployEvent failed: ' + err.message);
  }
}

/** Convenience wrapper for the most-common case: emit a free-text log line. */
function emitLog(cardId: string, message: string, level: DeployLogEvent['level'] = 'info'): void {
  emitDeployEvent(cardId, {
    type: 'log',
    card_id: cardId,
    level,
    message,
    at: new Date().toISOString(),
    seq: 0,
  });
}

/**
 * pdl-10 — emit a `node_status` event for a destroy operation. Mirrors the
 * apply-path's `on_node_status` translation but builds the payload directly
 * from the persisted resource shape (no `translation.deployables[]` map
 * exists for destroy — each resource carries its own `source_node_id` from
 * the post-deploy resource-mapping step at line ~1170, or its `node_id`
 * from the `DeployedResourceMapping` table).
 *
 * `canvasNodeId` is required — destroy events without a canvas correlation
 * are silently skipped at the call site (legacy resources persisted before
 * pdl-4's resource-mapping step have no `source_node_id` and fall through
 * to the `emitLog` log-line path instead, which still gives the deploy
 * panel's log scroll a record of the deletion).
 *
 * Updates the in-memory snapshot's nodeStatuses too so a tab joining
 * mid-destroy hydrates the same overlay color as the live event would
 * have produced — same medicine as the apply-path's `on_node_status`
 * snapshot mirror.
 *
 * Per learning anchor `ux-destroy-action-bypasses-node-status-wire`: this
 * helper closes the gap pdl-4's implementer noted in their deviation —
 * destroy paths DO have per-resource canvas-node-id information (it just
 * lives in different places than the apply path's translation map).
 */
function emitDestroyNodeStatus(
  cardId: string,
  payload: {
    canvasNodeId: string;
    resourceName: string;
    resourceType: string;
    status: 'queued' | 'applying' | 'succeeded' | 'failed';
    error?: { code: string; message: string; recoverable?: boolean };
    duration_ms?: number;
  },
): void {
  emitDeployEvent(cardId, {
    type: 'node_status',
    card_id: cardId,
    node_id: payload.canvasNodeId,
    resource_name: payload.resourceName,
    resource_type: payload.resourceType,
    action: 'delete',
    status: payload.status,
    error: payload.error,
    duration_ms: payload.duration_ms,
    at: new Date().toISOString(),
    seq: 0, // emitDeployEvent fills this in via nextDeploySeq
  });
  // Mirror to the in-memory snapshot so a reconnecting tab during a
  // destroy hydrates the same per-node overlay state the live wire would
  // have produced. Without this, the destroy snapshot persists with an
  // empty `nodeStatuses` map and a refresh mid-destroy regresses to the
  // pre-pdl-10 "panel goes dark during destroy" behavior.
  const overlayStatus = mapStatusToOverlay(payload.status);
  updateDeploySnapshotNode(cardId, payload.canvasNodeId, overlayStatus);
}

export type { DeployProgressSnapshot } from './deploy-locks.js';

/** Public re-export so routes can hit the cancel machinery directly. */
export function requestDeployCancel(cardId: string): boolean {
  return cancelLockDeploy(cardId);
}

/** Read the in-memory snapshot of an in-flight deploy for a card. */
export function getCurrentDeploySnapshot(cardId: string) {
  return getDeploySnapshot(cardId);
}

// Dynamic imports for core engine (ESM) — resolved from workspace
async function getCoreEngine(): Promise<any> {
  // @ts-ignore — resolved at runtime via pnpm workspace
  return import('@ice/core');
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
    const { translate_card_to_graph, deploy_graph, GCPDeployer } = core;

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
    let deployer: any;
    if (options.provider === 'aws') {
      const { AWSDeployer } = core;
      deployer = new AWSDeployer();
    } else if (options.provider === 'azure') {
      const { AzureDeployer } = core;
      deployer = new AzureDeployer();
    } else {
      deployer = new GCPDeployer();
    }

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

    // 5. Build current state from the last successful deployment (if any).
    // This enables update/skip semantics — without it, every deploy is "create all".
    // @ts-ignore — resolved at runtime via pnpm workspace
    const { MutableGraph } = await import('@ice/core/graph');
    const currentGraph = new MutableGraph('current');

    // Phase 1 baseline fix: include partial-success deployments and filter by
    // environment. Previously this only looked at status='success', so a single
    // resource failure poisoned the entire update path until the next fully
    // successful deploy. Also missed cross-environment isolation — a dev
    // deploy could influence a prod diff.
    // Extra guard: exclude the current in-flight deployment. The row we just
    // inserted has status='deploying' now, but if a retry or concurrent read
    // sees it flipped to 'partial' before this findFirst runs, it would
    // pick itself up as the baseline — its currentGraph only contains the
    // resources that landed so far, so the next plan would re-create the
    // missing ones and risk duplicates.
    const lastDeploy = await prisma.canvasDeployment.findFirst({
      where: {
        card_id: cardId,
        environment,
        status: { in: ['success', 'partial'] },
        id: { not: deployment.id },
      },
      orderBy: { created_at: 'desc' },
    });

    if (lastDeploy?.results) {
      const prevResults = lastDeploy.results as any;
      const prevResources = prevResults.resources || [];
      for (const res of prevResources) {
        if (res.success && res.resource_id) {
          try {
            currentGraph.add_node({
              name: res.name,
              type: res.type,
              properties: {
                ...res.outputs,
                provider_id: res.provider_id,
              },
            });
          } catch {
            // Ignore duplicate or invalid nodes
          }
        }
      }
      emitLog(
        cardId,
        `Found ${prevResources.filter((r: any) => r.success).length} existing resource(s) from previous deployment`,
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
    let completedResources = 0;

    const result = await deploy_graph(translation.graph, currentGraph, deployer, {
      provider: options.provider || 'gcp',
      project: gcpProject,
      regions: [options.region || 'us-central1'],
      continue_on_error: true,
      abort_signal: cancelSignal,
      auth_client: authClient,
      auth_key_file: (authClient as any)?._ice_key_file_path,
      auth_credentials: (authClient as any)?._ice_parsed_credentials,
      on_node_status: (event: NodeStatusEvent) => {
        // Translate the scheduler's graph node id (`${type}:${name}`) to
        // the canvas node id the wire contract requires. On miss, drop
        // the wire emit and warn — a missing-row UI cell is more visible
        // than a miscorrelated one (a status row attached to the wrong
        // block silently lies).
        const canvasId = graphIdToCanvasId.get(event.node_id);
        if (!canvasId) {
          console.warn(
            '[deploy] on_node_status: no canvas id for graph_node_id=' + event.node_id +
              ' (resource_name=' + event.resource_name + '). Dropping wire emit.',
          );
          return;
        }
        emitDeployEvent(cardId, {
          type: 'node_status',
          card_id: cardId,
          node_id: canvasId,
          resource_name: event.resource_name,
          resource_type: event.resource_type,
          action: event.action,
          status: event.status,
          error: event.error,
          duration_ms: event.duration_ms,
          at: event.at,
          seq: 0,
        });

        // Mirror to the in-memory snapshot so reconnecting tabs hydrate
        // without waiting for the next live event.
        const overlayStatus = mapStatusToOverlay(event.status);
        updateDeploySnapshotNode(cardId, canvasId, overlayStatus);
        if (
          event.status === 'succeeded' ||
          event.status === 'failed' ||
          event.status === 'skipped' ||
          event.status === 'cancelled-due-to-dep'
        ) {
          completedResources += 1;
          const overallProgress = Math.min(Math.round((completedResources / totalResources) * 100), 99);
          updateDeploySnapshot(cardId, {
            progress: overallProgress,
            currentResource: event.resource_name,
          });
        } else if (event.status === 'applying') {
          updateDeploySnapshot(cardId, { currentResource: event.resource_name });
        }
      },
      on_node_progress: (event: NodeProgressEvent) => {
        const canvasId = graphIdToCanvasId.get(event.node_id);
        if (!canvasId) {
          // `on_node_progress` fires high-frequency during slow handler
          // operations (Cloud Build polls etc.). A missing translation is
          // a real bug at the bridge boundary, but spamming a warn per
          // tick would drown the deploy log — emit one debug-tier line
          // and drop. The matching `on_node_status` warn above is the
          // primary signal; this is just a quiet sibling.
          return;
        }
        emitDeployEvent(cardId, {
          type: 'node_progress',
          card_id: cardId,
          node_id: canvasId,
          resource_name: event.resource_name,
          step: event.step,
          at: event.at,
          seq: 0,
        });
        // Mirror step to the snapshot so the canvas overlay's small
        // sub-step indicator picks it up on hydrate.
        updateDeploySnapshotNode(cardId, canvasId, 'deploying', event.step);
      },
      on_log: (message: string) => {
        emitLog(cardId, message);
      },
      on_resource_result: (resourceResult: any) => {
        // Kept for the post-deploy resource-mapping table mutation
        // (further below this scope, lines ~1130). The wire emit for
        // per-resource lifecycle is covered by `on_node_status`'s
        // terminal events; we don't add a parallel `resource_result`
        // wire event because the contract doesn't have one. We DO emit
        // a friendly log line when a compute resource lands with a URL —
        // that was previously inside the legacy `on_progress` callback,
        // and `on_node_status` doesn't carry handler outputs, so this
        // callback is the only place to surface the URL live.
        if (resourceResult?.success && resourceResult?.outputs) {
          const out = resourceResult.outputs as Record<string, unknown>;
          const url = (out.custom_domain_url || out.url || out.default_url || out.endpoint) as string | undefined;
          const domain = out.domain as string | undefined;
          const ip = (out.ip_address || out.IPAddress) as string | undefined;
          let endpoint: string | undefined;
          if (url && String(url).trim()) endpoint = String(url).trim();
          else if (domain && String(domain).trim()) endpoint = `https://${String(domain).trim()}`;
          else if (ip && String(ip).trim()) endpoint = `http://${String(ip).trim()}`;
          if (endpoint) {
            emitLog(cardId, `Deployed ${resourceResult.name} → ${endpoint}`);
          }
        }
      },
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
          const retryResult = await deploy_graph(translation.graph, currentGraph, deployer, {
            provider: options.provider || 'gcp',
            project: gcpProject,
            regions: [options.region || 'us-central1'],
            continue_on_error: true,
            auth_client: authClient,
            auth_key_file: (authClient as any)?._ice_key_file_path,
            auth_credentials: (authClient as any)?._ice_parsed_credentials,
            on_log: (message: string) => emitLog(cardId, message),
            on_node_status: (event: NodeStatusEvent) => {
              const canvasId = graphIdToCanvasId.get(event.node_id);
              if (!canvasId) return;
              emitDeployEvent(cardId, {
                type: 'node_status',
                card_id: cardId,
                node_id: canvasId,
                resource_name: event.resource_name,
                resource_type: event.resource_type,
                action: event.action,
                status: event.status,
                error: event.error,
                duration_ms: event.duration_ms,
                at: event.at,
                seq: 0,
              });
              // Mirror to the snapshot so a tab joining mid-retry sees
              // the live state. Without this, the retry's per-block
              // status flips don't survive a refresh until the retry
              // completes.
              updateDeploySnapshotNode(cardId, canvasId, mapStatusToOverlay(event.status));
            },
            on_node_progress: (event: NodeProgressEvent) => {
              const canvasId = graphIdToCanvasId.get(event.node_id);
              if (!canvasId) return;
              emitDeployEvent(cardId, {
                type: 'node_progress',
                card_id: cardId,
                node_id: canvasId,
                resource_name: event.resource_name,
                step: event.step,
                at: event.at,
                seq: 0,
              });
              updateDeploySnapshotNode(cardId, canvasId, 'deploying', event.step);
            },
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
  let releaseLock: () => void;
  try {
    releaseLock = acquireDeployLock(cardId, 'destroy').release;
  } catch (err) {
    if (err instanceof DeployLockError) throw new Error(err.message, { cause: err });
    throw err;
  }

  try {
    // Load every resource ICE has ever deployed for this card, from both
    // the stable mapping table (Phase 1) and from historical deployment
    // results (legacy pre-Phase-1 data, or rows that were never mapped).
    const mappings = await prisma.deployedResourceMapping.findMany({ where: { card_id: cardId } });
    const historicalDeploys = await prisma.canvasDeployment.findMany({
      where: {
        card_id: cardId,
        status: { in: ['success', 'partial', 'failed'] },
        results: { not: null as any },
      },
      orderBy: { created_at: 'desc' },
    });

    // Collect unique (type, name, provider_id, region, environment, nodeId) tuples.
    // pdl-10 — `nodeId` carries the canvas correlation forward from either
    // the stable mapping table (`m.node_id`) or the historical deploy row's
    // post-pdl-4 `r.source_node_id`. Pre-pdl-4 historical rows lack
    // `source_node_id`; those targets stay correlation-less and skip the
    // per-resource wire emit, falling back to the log-line surface.
    const targets = new Map<
      string,
      {
        type: string;
        name: string;
        providerId?: string;
        region?: string;
        environment?: string;
        nodeId?: string;
      }
    >();
    for (const m of mappings) {
      targets.set(`${m.resource_type}::${m.resource_name}`, {
        type: m.resource_type,
        name: m.resource_name,
        providerId: m.provider_id ?? undefined,
        environment: m.environment,
        nodeId: m.node_id, // canvas node id directly from the mapping table
      });
    }
    for (const d of historicalDeploys) {
      const results = d.results as any;
      const resources = (results?.resources || []) as any[];
      for (const r of resources) {
        if (!r?.name || !r?.type) continue;
        const key = `${r.type}::${r.name}`;
        if (targets.has(key)) continue;
        targets.set(key, {
          type: r.type,
          name: r.name,
          providerId: r.provider_id,
          region: d.region,
          environment: d.environment,
          nodeId: r.source_node_id, // pdl-10 — pdl-4 stamped this on every result
        });
      }
    }

    if (targets.size === 0) {
      releaseLock();
      return { success: true, deleted: [], failed: [], total: 0 };
    }

    const provider = historicalDeploys[0]?.provider || 'gcp';
    const credentials = await providerService.getDecryptedCredentials(orgId, provider);
    if (!credentials) {
      releaseLock();
      throw new Error('Provider not connected');
    }

    // Resolve the GCP project ID — the deployer's SDK clients need an
    // explicit project at initialize time. Priority order:
    //   1. Explicit `gcpProject` passed in the request body (frontend
    //      forwards `deploy.gcpProject` from Redux).
    //   2. `credentials.project_id` from the stored ProviderCredential row.
    //   3. Extracted from any historical resource's `provider_id` (e.g.
    //      `projects/lc-ice/global/sslCertificates/...`) — this is the
    //      fallback when neither of the above is populated.
    let gcpProject = options.gcpProject || (credentials as any).project_id || '';
    if (!gcpProject) {
      for (const t of targets.values()) {
        const match = (t.providerId || '').match(/^projects\/([^/]+)\//);
        if (match?.[1]) {
          gcpProject = match[1];
          break;
        }
      }
    }
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
        region: historicalDeploys[0]?.region || 'us-central1',
        environment: historicalDeploys[0]?.environment || 'development',
      },
    });

    // pdl-10 — open a snapshot so `nextDeploySeq` returns contiguous seqs
    // for every per-resource node_status emit + the final complete. Same
    // motivation as `destroyDeployment`: destroy is no longer a single
    // idempotent point-in-time update once we emit per-resource
    // queued/applying/succeeded.
    startDeploySnapshot(cardId, destroyRecord.id);

    emitLog(cardId, `Destroying ${targets.size} ICE-managed resources across all historical deploys for this card...`);

    const core = await getCoreEngine();
    const { GCPDeployer, AWSDeployer, AzureDeployer } = core;
    let deployer: any;
    if (provider === 'aws') deployer = new AWSDeployer();
    else if (provider === 'azure') deployer = new AzureDeployer();
    else deployer = new GCPDeployer();

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
        regions: [historicalDeploys[0]?.region || 'us-central1'],
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

      // Destroy in a dependency-aware order: dependent resources first, origins last.
      const orderPriority = (type: string): number => {
        // Lower numbers delete first.
        if (type.includes('globalForwardingRule')) return 1;
        if (type.includes('targetHttpsProxy') || type.includes('targetHttpProxy')) return 2;
        if (type.includes('urlMap')) return 3;
        if (type.includes('backendBucket')) return 4;
        if (type.includes('backendService')) return 5;
        if (type.includes('storage.bucket')) return 6;
        if (type.includes('managedSslCertificate') || type.includes('sslCertificate')) return 7;
        return 50;
      };
      const ordered = [...targets.values()].sort((a, b) => orderPriority(a.type) - orderPriority(b.type));

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
    releaseLock = acquireDeployLock(cardId, 'destroy').release;
    console.log('[destroy] lock acquired cardId=' + cardId);
  } catch (err) {
    console.warn('[destroy] LOCK FAILED cardId=' + cardId + ' err=' + (err as any)?.message);
    if (err instanceof DeployLockError) {
      throw new Error(err.message, { cause: err });
    }
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
    const core = await getCoreEngine();
    const { GCPDeployer, AWSDeployer, AzureDeployer } = core;

    let deployer: any;
    if (provider === 'aws') {
      deployer = new AWSDeployer();
    } else if (provider === 'azure') {
      deployer = new AzureDeployer();
    } else {
      deployer = new GCPDeployer();
    }

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
  let releaseLock: () => void;
  try {
    releaseLock = acquireDeployLock(cardId, 'rollback').release;
  } catch (err) {
    if (err instanceof DeployLockError) {
      throw new Error(err.message, { cause: err });
    }
    throw err;
  }
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
    const { GCPDeployer, AWSDeployer, AzureDeployer, MutableGraph } = core;

    let deployer: any;
    if (provider === 'aws') {
      deployer = new AWSDeployer();
    } else if (provider === 'azure') {
      deployer = new AzureDeployer();
    } else {
      deployer = new GCPDeployer();
    }

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

    // 4. Build current state from the latest successful deployment
    // Must be scoped to the same environment — otherwise rolling back prod
    // loads dev's latest success as the baseline and applies dev config to prod.
    const currentGraph = new MutableGraph('current');
    const latestDeploy = await prisma.canvasDeployment.findFirst({
      where: {
        card_id: cardId,
        status: 'success',
        environment: rollbackRecord.environment,
        id: { not: rollbackRecord.id },
      },
      orderBy: { created_at: 'desc' },
    });

    if (latestDeploy?.results) {
      const latestResults = latestDeploy.results as any;
      const latestResources = latestResults.resources || [];
      for (const res of latestResources) {
        if (res.success && res.resource_id) {
          try {
            currentGraph.add_node({
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
    }

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
        const core = await getCoreEngine();
        const { GCPDeployer } = core;
        deployer = new GCPDeployer();
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

// ── GCP API Auto-Enable ──────────────────────────────────────────────────────

/**
 * Map canvas iceType → required Google Cloud APIs.
 *
 * Using iceType (not the GCP resource type name) as the key because that's
 * what the canvas actually puts on node data, and because string-matching
 * on resource type names like `gcp.compute.backendBucket` against a list
 * of fragment patterns ("compute", "storage") was creating false positives
 * and missing genuine matches. An explicit map is dumb and correct.
 *
 * Every block type that hits a Google API during deploy or preflight
 * requirements MUST appear here, otherwise the user gets a cryptic
 * SERVICE_DISABLED error deep in the deploy flow.
 */
const ICE_TYPE_API_MAP: Record<string, string[]> = {
  // Compute
  // Static sites compile to Firebase Hosting on GCP. Two APIs needed:
  //   - firebase.googleapis.com — Firebase Management API for the
  //     `addFirebase` call that turns a plain GCP project into a
  //     Firebase project. Required even on projects that have used
  //     other Firebase products before.
  //   - firebasehosting.googleapis.com — the Hosting REST API itself
  //     (sites/versions/releases). The handler hits this for every
  //     deploy step.
  'Compute.StaticSite': ['firebase.googleapis.com', 'firebasehosting.googleapis.com'],
  'Compute.SSRSite': ['run.googleapis.com', 'artifactregistry.googleapis.com', 'cloudbuild.googleapis.com'],
  'Compute.Container': ['run.googleapis.com', 'artifactregistry.googleapis.com', 'cloudbuild.googleapis.com'],
  'Compute.BackendAPI': ['run.googleapis.com', 'artifactregistry.googleapis.com', 'cloudbuild.googleapis.com'],
  'Compute.Worker': ['run.googleapis.com', 'artifactregistry.googleapis.com', 'cloudbuild.googleapis.com'],
  'Compute.ServerlessFunction': [
    'cloudfunctions.googleapis.com',
    'cloudbuild.googleapis.com',
    'artifactregistry.googleapis.com',
    'run.googleapis.com', // Cloud Functions v2 runs on Cloud Run
  ],
  'Compute.CronJob': ['cloudscheduler.googleapis.com', 'run.googleapis.com'],

  // Storage
  'Storage.Bucket': ['storage.googleapis.com'],
  'Storage.ObjectStorage': ['storage.googleapis.com'],

  // Database
  'Database.PostgreSQL': ['sqladmin.googleapis.com'],
  'Database.MySQL': ['sqladmin.googleapis.com'],
  'Database.Firestore': ['firestore.googleapis.com'],
  'Database.Redis': ['redis.googleapis.com'],

  // Network
  // `Network.PublicEndpoint` compiles to the full load-balancer chain
  // plus an optional managed SSL cert. The cert flow also uses the site
  // verification API (called during Plan BEFORE autoEnableGCPApis runs,
  // so we eagerly re-enable it in google-verification on 403 as well).
  'Network.PublicEndpoint': ['compute.googleapis.com', 'siteverification.googleapis.com'],
  'Network.LoadBalancer': ['compute.googleapis.com'],
  'Network.Gateway': ['apigateway.googleapis.com', 'servicecontrol.googleapis.com', 'servicemanagement.googleapis.com'],
  'Network.VPC': ['compute.googleapis.com'],
  'Network.Subnet': ['compute.googleapis.com'],

  // Messaging
  'Messaging.CloudPubSub': ['pubsub.googleapis.com'],
  'Messaging.Queue': ['pubsub.googleapis.com'],
  'Messaging.Topic': ['pubsub.googleapis.com'],

  // Security
  'Security.Secret': ['secretmanager.googleapis.com'],
  'Security.Identity': ['identitytoolkit.googleapis.com'],

  // Monitoring
  'Monitoring.Log': ['logging.googleapis.com'],

  // AI / Analytics
  'AI.VectorDB': ['aiplatform.googleapis.com'],
  'AI.LLMGateway': ['aiplatform.googleapis.com'],
  'AI.ModelServing': ['aiplatform.googleapis.com'],
  'Analytics.DataWarehouse': ['bigquery.googleapis.com'],
  'Analytics.Search': ['discoveryengine.googleapis.com'],

  // GKE / Container orchestration
  'Compute.GKE': ['container.googleapis.com'],
};

/** Always enable these APIs for any GCP deployment */
const BASE_APIS = ['serviceusage.googleapis.com', 'cloudresourcemanager.googleapis.com'];

/**
 * Public helper so the google-verification service (which runs during the
 * requirements resolver BEFORE the deploy flow triggers autoEnableGCPApis)
 * can lazily enable the Site Verification API on first use. Idempotent —
 * Service Usage API returns an empty operation if the API is already on.
 */
export async function enableGcpApi(project: string, apiName: string, accessToken: string): Promise<boolean> {
  try {
    const res = await fetch(`https://serviceusage.googleapis.com/v1/projects/${project}/services/${apiName}:enable`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function autoEnableGCPApis(project: string, accessToken: string, canvasNodes: any[], log: (msg: string) => void) {
  // Collect required APIs from the actual canvas resource nodes. Match by
  // iceType directly (see ICE_TYPE_API_MAP above) — no more string-prefix
  // pattern matching that was both over-eager (false positives) and
  // incomplete (missed new Phase 8 types).
  console.log(
    'autoEnableGCPApis called, nodes:',
    canvasNodes.length,
    'node types:',
    canvasNodes.map((n: any) => `${n.data?.iceType}|${n.data?.resourceId}|${n.data?.blockTypeName}`),
  );
  const requiredApis = new Set<string>(BASE_APIS);

  for (const node of canvasNodes) {
    if (node.type !== 'resource') continue;
    const iceType = (node.data?.iceType as string) || '';
    const apis = ICE_TYPE_API_MAP[iceType];
    if (apis) {
      for (const api of apis) requiredApis.add(api);
    }
  }

  console.log('Required APIs:', [...requiredApis]);

  // Check which APIs are already enabled
  let enabledApis: Set<string>;
  try {
    const res = await fetch(
      `https://serviceusage.googleapis.com/v1/projects/${project}/services?filter=state:ENABLED&pageSize=200`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
      const errText = await res.text();
      console.error('Service Usage API error:', res.status, errText);
      log(`Warning: Could not check enabled APIs (${res.status}). Will try deploying anyway.`);
      return;
    }
    const data = (await res.json()) as { services?: Array<{ config?: { name: string } }> };
    enabledApis = new Set((data.services || []).map((s) => s.config?.name || '').filter(Boolean));
    console.log('Enabled APIs count:', enabledApis.size);
  } catch (err: any) {
    console.error('Service Usage API fetch error:', err.message);
    return; // Non-fatal
  }

  const toEnable = [...requiredApis].filter((api) => !enabledApis.has(api));
  console.log('APIs to enable:', toEnable);
  if (toEnable.length === 0) {
    console.log('All required APIs already enabled');
    log('All required GCP APIs are enabled');
    return;
  }

  console.log('Enabling APIs:', toEnable);
  log(`Enabling ${toEnable.length} required GCP API(s): ${toEnable.join(', ')}`);

  // Enable APIs in parallel (batch)
  const enablePromises = toEnable.map(async (api) => {
    try {
      const res = await fetch(`https://serviceusage.googleapis.com/v1/projects/${project}/services/${api}:enable`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
      const responseText = await res.text();
      console.log(`Enable ${api}: status=${res.status}`, responseText.slice(0, 200));
      if (res.ok) {
        log(`  Enabled ${api}`);
        return true;
      }
      // Detect billing errors and provide clear message
      if (responseText.includes('Billing account') || responseText.includes('billing')) {
        log(
          `  Cannot enable ${api}: Billing is not enabled for this project. Link a billing account at https://console.cloud.google.com/billing/linkedaccount?project=${project}`,
        );
      } else {
        log(`  Failed to enable ${api}: ${responseText.slice(0, 200)}`);
      }
      return false;
    } catch (err: any) {
      console.error(`Enable ${api} error:`, err.message);
      log(`  Failed to enable ${api}: ${err.message}`);
      return false;
    }
  });

  const results = await Promise.all(enablePromises);
  const succeeded = results.filter(Boolean).length;

  if (succeeded > 0 && succeeded < toEnable.length) {
    log(`Enabled ${succeeded}/${toEnable.length} APIs. Some may need manual enabling.`);
  } else if (succeeded === toEnable.length) {
    // Wait a moment for APIs to propagate
    log('All APIs enabled. Waiting for propagation...');
    await new Promise((r) => setTimeout(r, 5000));
  }
}

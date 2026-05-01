/**
 * Apply-pipeline helpers — extracted from `apply-deployment.ts` in
 * rf-deploy2-2 housekeeping. Hosts the helpers that are mechanically
 * separable from the apply pipeline body:
 *
 * - `logSourceRepoDiagnostics` — surfaces canvas-side mistakes
 *   (empty repository, dangling Source.Repository node) as deploy-log
 *   lines so users see them without opening Redux devtools.
 * - `ensureAutoDeployRules` — best-effort auto-registration of
 *   Source.Repository → Compute deploy rules + their webhooks.
 * - `logDiffForDebugging` — console.log dump of desired vs current
 *   graph nodes for post-mortem debugging.
 * - `normalizeIdempotentResultErrors` — rewrites NOT_FOUND/ALREADY_EXISTS
 *   into success cases so the user doesn't see those as failures.
 * - `persistResourceMappings` — writes the post-deploy stable
 *   (node_id → name + provider_id) mapping rows.
 *
 * The diagnostic/auto-rule sidecars catch their own throws so they
 * cannot fail the parent deploy.
 */

import { emitLog } from './deploy-event-dispatcher.js';
import { upsertResourceMapping } from './resource-mapping.service.js';

/**
 * Scan the canvas for Source.Repository nodes and emit a `[diagnostic]`
 * log line per node summarizing its connectivity. The most common
 * "github repo not deploying" cause is an empty `repository` field —
 * this log makes that immediately obvious without needing to inspect
 * Redux state. Always non-fatal — wraps the entire scan in a try/catch
 * because a malformed canvas node must never block the deploy.
 */
export function logSourceRepoDiagnostics(cardId: string, nodes: any[], edges: any[]): void {
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
}

/**
 * Auto-register deployment rules for any Source.Repository → Compute
 * edges. This is what makes "push to GitHub auto-redeploys my Firebase
 * Hosting site" work without the user manually clicking into the
 * Source.Repository properties panel. Idempotent — re-uses existing
 * rules and webhooks. Non-fatal: any throw from `ensureRulesForCanvas`
 * (or from the dynamic import) is caught and surfaced as a log line so
 * the deploy still proceeds.
 *
 * No-ops when `userId` is undefined (the rule writer needs an owner row).
 */
export async function ensureAutoDeployRules(args: {
  cardId: string;
  nodes: any[];
  edges: any[];
  orgId: string;
  userId: string | undefined;
  environment: string | undefined;
}): Promise<void> {
  const { cardId, nodes, edges, orgId, userId, environment } = args;
  if (!userId) return;
  try {
    const { ensureRulesForCanvas } = await import('./pipeline.service.js');
    const ruleResult = await ensureRulesForCanvas(
      cardId,
      nodes,
      edges,
      orgId,
      userId,
      environment || 'development',
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

/**
 * Console.log dump of the desired vs current graph node lists. Pure
 * debug output — every line is `console.log` (not `emitLog`) so it
 * stays in server-side logs without polluting the deploy panel scroll.
 */
export function logDiffForDebugging(translationGraph: any, currentGraph: any): void {
  const desiredNodes = translationGraph?.nodes?.values ? [...translationGraph.nodes.values()] : [];
  const currentNodes = currentGraph?.nodes?.values ? [...currentGraph.nodes.values()] : [];
  console.log(`Diff: desired=${desiredNodes.length} nodes, current=${currentNodes.length} nodes`);
  console.log('Desired:', desiredNodes.map((n: any) => `${n.type}::${n.name}`));
  console.log('Current:', currentNodes.map((n: any) => `${n.type}::${n.name}`));
}

/**
 * Post-process the deploy result so idempotent operations don't surface
 * as failures to the user: a `delete` returning `NOT_FOUND` means the
 * resource is already gone (the desired state), and a `create` returning
 * `ALREADY_EXISTS` means the resource is already there (also the
 * desired state). Mutates `result` in place — recalculates
 * `result.success` and `result.summary.failed` after the per-resource
 * normalization. Emits a log line for each rewritten error so the user
 * can see why the result became green.
 */
export function normalizeIdempotentResultErrors(cardId: string, result: any): void {
  if (!(result.resources?.length > 0)) return;
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

/**
 * Persist the stable name mapping for every successful resource. Phase 1:
 * each resource's (node_id → name + provider_id) becomes the source of
 * truth for future plans, surviving label changes.
 *
 * Critical side-effect: mutates `res.source_node_id` IN PLACE on the
 * result.resources array so the persisted DB row carries the correlation.
 * The live wire emit for per-resource lifecycle is covered by
 * `on_node_status`'s terminal event — there's no `resource_result` wire
 * event in the new contract, just persistence + the canvas overlay write
 * driven by `getNodeDeploymentOverlay` on next page load. Without
 * source_node_id on the persisted row, `getNodeDeploymentOverlay` would
 * filter the entry out (every overlay row requires source_node_id) and
 * the canvas block would never show any URL or status after a refresh.
 *
 * Per-row `upsertResourceMapping` failures are caught and logged but do
 * not throw — the deploy already landed cloud resources by this point,
 * so a mapping-table write failure must not flip the deploy outcome.
 */
export async function persistResourceMappings(args: {
  cardId: string;
  result: any;
  findSourceNodeId: (res: any) => string | undefined;
  nameToLabel: Map<string, string>;
  environment: string;
}): Promise<void> {
  const { cardId, result, findSourceNodeId, nameToLabel, environment } = args;
  if (!(result.resources?.length > 0)) return;
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

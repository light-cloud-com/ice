/**
 * Requirements Service — Resolves and tracks block requirements.
 *
 * The resolver walks the canvas nodes, applies the built-in requirement
 * definitions (and in the future, blueprint-provided ones), runs their
 * checks in parallel with a deadline, and persists post-deploy statuses
 * so they survive page reloads and gateway restarts.
 *
 * This service is the backend half of Phase 4. The UI reads `resolveForCard`
 * during plan/preflight and after deploys to populate the requirements
 * section in the deploy panel and per-block properties panel.
 */

import prisma from '@ice/db';
import {
  BUILT_IN_REQUIREMENTS,
  type RequirementContext,
  type RequirementDefinition,
  type ResolvedRequirement,
  type RequirementCheckResult,
} from '@ice/blocks/requirements';

import {
  checkSearchConsoleVerification,
  fetchSslCertificateStatus,
  generateVerificationToken,
} from './google-verification.service.js';
import { getResourceMap } from './resource-mapping.service.js';

// ── Resolver ─────────────────────────────────────────────────────────────────

const RESOLVE_DEADLINE_MS = 10_000;

export interface ResolveArgs {
  cardId: string;
  environment: string;
  orgId: string;
  gcpProject?: string;
  nodes: Array<{ id: string; type?: string; data: Record<string, unknown> }>;
  /** Optional list of extra definitions to consider alongside the built-ins. */
  extraDefinitions?: RequirementDefinition[];
}

export interface ResolveResult {
  requirements: ResolvedRequirement[];
  /** Convenient aggregate — true iff every blocking requirement is met/verified. */
  canDeploy: boolean;
}

/**
 * Resolve every requirement for every node in the card, running checks in
 * parallel with a shared deadline. Post-deploy requirements are also
 * persisted into `block_requirement_status` so the UI can display last-seen
 * state across reloads.
 */
export async function resolveForCard(args: ResolveArgs): Promise<ResolveResult> {
  const { cardId, environment, orgId, gcpProject, nodes } = args;
  const definitions = [...BUILT_IN_REQUIREMENTS, ...(args.extraDefinitions || [])];

  // Shared abort signal so slow checks can't hold up the whole plan.
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), RESOLVE_DEADLINE_MS);

  // Load the resource mapping once so every post-deploy check has access
  // to `providerId` for the block it applies to.
  const mapping = await getResourceMap(cardId, environment);

  // Load the latest deployed-resource outputs per source_node_id so
  // post-deploy checks (DNS A record, cert issuance, etc.) can read
  // the IP / URL / domain values that the deploy actually emitted.
  // Without this, every check sees `deployedOutputs: undefined` and
  // falls through to "deployment output not available yet" — which is
  // why the user reported "I don't see the URL" and "I don't see the
  // DNS settings I need to configure."
  //
  // Source: the most-recent success/partial CanvasDeployment row's
  // `results.resources` array, projected by source_node_id. Pulls
  // outputs from the original CREATE step (which has the IP / URL /
  // name fields), falling back to UPDATE outputs when there's no
  // CREATE row for a given block.
  const outputsByNodeId = new Map<string, Record<string, unknown>>();
  try {
    const latest = await prisma.canvasDeployment.findFirst({
      where: {
        card_id: cardId,
        environment,
        status: { in: ['success', 'partial'] },
      },
      orderBy: { created_at: 'desc' },
    });
    if (latest?.results) {
      const resources = ((latest.results as any).resources || []) as any[];
      for (const res of resources) {
        if (!res.source_node_id || !res.outputs) continue;
        // Merge in case multiple resources share a source_node_id
        // (e.g. PublicEndpoint produces both forwarding rule + cert).
        const existing = outputsByNodeId.get(res.source_node_id) || {};
        outputsByNodeId.set(res.source_node_id, { ...existing, ...res.outputs });
      }
    }
  } catch {
    // Non-fatal — checks will fall back to "deployment output not available."
  }

  // Phase 8 — pre-fetch verification tokens for every CustomDomain block
  // that applies, in parallel. The requirement definitions read these off
  // the context instead of making their own API calls, which keeps the
  // block package free of backend-only imports.
  const verificationTokens: Record<string, string> = {};
  const domainFetches = nodes
    .filter(
      (n) =>
        n.type === 'resource' &&
        (n.data?.iceType as string) === 'Network.PublicEndpoint' &&
        String(n.data?.domain || '').trim().length > 0,
    )
    .map(async (n) => {
      const domain = String(n.data.domain).trim();
      const token = await generateVerificationToken(orgId, domain).catch(() => null);
      if (token) verificationTokens[domain] = token;
    });
  await Promise.all(domainFetches);

  // Runtime capabilities threaded onto the context so block-layer
  // requirement definitions can call them without backend imports.
  const googleVerifier = {
    checkVerification: (reqOrgId: string, domain: string) =>
      checkSearchConsoleVerification(reqOrgId, domain),
  };
  const certStatusChecker = {
    fetchStatus: (reqOrgId: string, reqProject: string, certName: string) =>
      fetchSslCertificateStatus(reqOrgId, reqProject, certName),
  };

  try {
    const resolutions = await Promise.all(
      nodes.flatMap((node) => {
        if (node.type !== 'resource') return [];
        const mapped = mapping.get(node.id);
        const ctxBase = {
          block: { id: node.id, data: node.data },
          cardId,
          environment,
          gcpProject,
          org: { id: orgId },
          // Surface the deployed outputs for THIS block id so post-deploy
          // checks like dns-a-record can read `ip_address`, `url`, etc.
          deployedOutputs: outputsByNodeId.get(node.id),
          providerId: mapped?.providerId,
          signal: controller.signal,
          // Phase 8 capability injection — types cast to keep the block
          // package types clean while giving the runtime what it needs.
          googleVerifier,
          certStatusChecker,
          verificationTokens,
          certResourceName: mapped?.name,
        } as RequirementContext;
        return definitions
          .filter((d) => d.applies(ctxBase))
          .map(async (def) => {
            const result = await runCheck(def, ctxBase);
            // Persist post-deploy results so the UI can show "last verified X ago"
            // without re-checking on every panel open.
            if (def.timing === 'post-deploy') {
              await persistStatus(cardId, node.id, environment, def.id, result).catch(() => {});
            }
            return {
              definitionId: def.id,
              scope: def.scope,
              timing: def.timing,
              blocking: def.blocking,
              title: def.title(ctxBase),
              description: def.description?.(ctxBase),
              result,
              action: def.action?.(ctxBase) ?? null,
              nodeId: node.id,
            } satisfies ResolvedRequirement;
          });
      }),
    );

    const canDeploy = resolutions.every(
      (r) => !r.blocking || r.result.status === 'met' || r.result.status === 'verified',
    );
    return { requirements: resolutions, canDeploy };
  } finally {
    clearTimeout(deadline);
  }
}

async function runCheck(
  def: RequirementDefinition,
  ctx: RequirementContext,
): Promise<RequirementCheckResult> {
  try {
    return await def.check(ctx);
  } catch (err: any) {
    // Distinguish the resolver deadline from a genuine check failure.
    // The UI renders 'expired' as "timed out — will be re-checked later"
    // while 'unmet' stays red. Collapsing both into 'unmet' misled users
    // into thinking e.g. DNS was permanently wrong when in fact we just
    // didn't wait long enough for propagation.
    const isAbort =
      err?.name === 'AbortError' ||
      ctx.signal?.aborted === true ||
      /aborted|timeout/i.test(String(err?.message || ''));
    if (isAbort) {
      return {
        status: 'expired',
        message: 'Check timed out — will be re-checked on next deploy or via Check again.',
        lastCheckedAt: new Date().toISOString(),
      };
    }
    return {
      status: 'unmet',
      message: `Check failed: ${err?.message || err}`,
      lastCheckedAt: new Date().toISOString(),
    };
  }
}

async function persistStatus(
  cardId: string,
  nodeId: string,
  environment: string,
  requirementId: string,
  result: RequirementCheckResult,
): Promise<void> {
  await prisma.blockRequirementStatus.upsert({
    where: {
      card_id_node_id_environment_requirement_id: {
        card_id: cardId,
        node_id: nodeId,
        environment,
        requirement_id: requirementId,
      },
    },
    update: {
      status: result.status,
      message: result.message ?? null,
      last_checked_at: new Date(),
      verified_at: result.status === 'verified' ? new Date() : null,
      details: (result.details as any) ?? null,
    },
    create: {
      card_id: cardId,
      node_id: nodeId,
      environment,
      requirement_id: requirementId,
      status: result.status,
      message: result.message ?? null,
      verified_at: result.status === 'verified' ? new Date() : null,
      details: (result.details as any) ?? null,
    },
  });
}

/**
 * Fetch previously-persisted statuses (used for hydrating the UI on panel
 * open before any fresh check fires).
 */
export async function loadPersistedStatuses(cardId: string, environment: string) {
  return prisma.blockRequirementStatus.findMany({
    where: { card_id: cardId, environment },
  });
}

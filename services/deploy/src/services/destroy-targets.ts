/**
 * Destroy-targets helpers extracted from `deploy.service.ts` in rf-deploy-11.
 *
 * `destroyAllForCard` collects every resource ICE has ever deployed for a
 * given card from two parallel sources — the stable
 * `DeployedResourceMapping` table (Phase 1) and historical
 * `canvasDeployment.results.resources` arrays (legacy pre-Phase-1 data, or
 * rows that were never mapped). The mapping table takes precedence on a
 * `${type}::${name}` collision because its `node_id` column carries the
 * canvas correlation directly; the historical row carries a post-pdl-4
 * `source_node_id`, which only the most recent rollouts populate.
 *
 * `orderTargetsForDelete` enforces a dependency-aware destroy order so
 * dependent resources tear down before their origins (e.g. global
 * forwarding rules before SSL certificates).
 *
 * `resolveDestroyAllProject` resolves the GCP project id required to
 * initialize a deployer for the destroy run, walking three sources in
 * priority order: explicit request override → stored credential's
 * `project_id` → regex extract from any target's persisted
 * `provider_id`. The caller is expected to throw the canonical
 * "Cannot resolve GCP project id" error if this returns null — the
 * throw stays at the callsite because it has to release the deploy lock
 * first, which the helper has no visibility into.
 */

import prisma from '@ice/db';

export interface DestroyTarget {
  type: string;
  name: string;
  providerId?: string;
  region?: string;
  environment?: string;
  nodeId?: string;
}

/**
 * Most-recent qualifying historical deploy row, used by the caller to
 * default the destroy-record's `region` / `environment` columns and the
 * deployer's `regions` initialize argument. Returns null when no
 * historical deploy exists (e.g. the card was created and the only
 * resources tracked are mapping-table rows).
 */
export type LatestDeploymentRow = {
  id: string;
  region: string | null;
  environment: string;
  provider: string;
  results: any;
  created_at: Date;
};

/**
 * Walk the `DeployedResourceMapping` table + every qualifying historical
 * `canvasDeployment` row (status in success/partial/failed, results not
 * null) and return the de-duplicated target set + the most-recent
 * historical row.
 *
 * Mapping-table entries take precedence on a `${type}::${name}` collision
 * because their `node_id` column is the canonical canvas correlation. The
 * historical-row pass only fills in keys the mapping table missed —
 * legacy rows that pre-date Phase 1 still need to be torn down.
 *
 * Resources without a `name` or `type` are silently skipped (defensive
 * against malformed historical results).
 */
export async function collectDestroyAllTargets(cardId: string): Promise<{
  targets: Map<string, DestroyTarget>;
  latestRow: LatestDeploymentRow | null;
}> {
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
  const targets = new Map<string, DestroyTarget>();
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
        region: d.region ?? undefined,
        environment: d.environment,
        nodeId: r.source_node_id, // pdl-10 — pdl-4 stamped this on every result
      });
    }
  }

  return { targets, latestRow: (historicalDeploys[0] as LatestDeploymentRow | undefined) ?? null };
}

/**
 * Sort destroy targets so dependent resources tear down before their
 * origins. The numbers are arbitrary — only the relative order matters.
 *
 * Generic over any record with a `type` field so the caller can pass a
 * richer shape (e.g. `{ type, name, providerId, nodeId }`) and round-trip
 * the extra fields through unchanged.
 *
 * Pure function (no IO, no mutation of the input array). The original
 * implementation in `destroyAllForCard` used an inline `if/else if` chain
 * inside `orderPriority`; the dictionary lookup below preserves that
 * semantics because (a) `targetHttpsProxy` and `targetHttpProxy` map to
 * the same priority (2) so the order they appear in the dict is
 * irrelevant, and (b) `managedSslCertificate` and `sslCertificate`
 * likewise share priority 7. The default fall-through (50) covers any
 * type the dict doesn't list.
 */
export function orderTargetsForDelete<T extends { type: string }>(targets: T[]): T[] {
  return [...targets].sort((a, b) => priorityForType(a.type) - priorityForType(b.type));
}

/**
 * Resolve the GCP project id for a destroy-all run.
 *
 * Priority order:
 *   1. Explicit `options.gcpProject` passed by the request body (frontend
 *      forwards `deploy.gcpProject` from Redux).
 *   2. `credentials.project_id` from the stored ProviderCredential row.
 *   3. Extracted from any target's `providerId` via
 *      `/^projects\/([^/]+)\//` — first hit wins. Targets without a
 *      `providerId` are skipped during the scan.
 *
 * Returns `null` if nothing resolved. The caller is expected to throw
 * the canonical "Cannot resolve GCP project id…" error in that case;
 * the throw lives at the callsite because it has to release the deploy
 * lock first, which the helper has no visibility into.
 */
export function resolveDestroyAllProject(args: {
  options: { gcpProject?: string };
  credentials: { project_id?: string } | null | undefined;
  targets: Iterable<DestroyTarget>;
}): string | null {
  const { options, credentials, targets } = args;
  let gcpProject = options.gcpProject || (credentials as any)?.project_id || '';
  if (!gcpProject) {
    for (const t of targets) {
      const match = (t.providerId || '').match(/^projects\/([^/]+)\//);
      if (match?.[1]) {
        gcpProject = match[1];
        break;
      }
    }
  }
  return gcpProject || null;
}

/**
 * Module-private priority lookup for `orderTargetsForDelete`. Lower
 * numbers tear down first.
 */
function priorityForType(type: string): number {
  if (type.includes('globalForwardingRule')) return 1;
  if (type.includes('targetHttpsProxy') || type.includes('targetHttpProxy')) return 2;
  if (type.includes('urlMap')) return 3;
  if (type.includes('backendBucket')) return 4;
  if (type.includes('backendService')) return 5;
  if (type.includes('storage.bucket')) return 6;
  if (type.includes('managedSslCertificate') || type.includes('sslCertificate')) return 7;
  return 50;
}

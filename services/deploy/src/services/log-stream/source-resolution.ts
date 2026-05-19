/**
 * Source resolution for the Log Stream service.
 *
 * Extracted from `log-stream.service.ts` (rf-lstream-4). Resolves which
 * canvas node a Log Terminal block is wired to and produces the
 * `SourceResolution` discriminated-union the orchestrator and the
 * client both react to.
 *
 * Two input paths produce the same `supportedCandidates` shape:
 *
 *   (a) `candidateSources` from the client — derived from live Redux
 *       state, so it reflects edges/nodes the user just drew without
 *       waiting for the canvas's 2s save debounce. Skips the Prisma
 *       JSON-column read entirely.
 *
 *   (b) Fallback Prisma read — for older clients that don't ship
 *       candidates, OR for the post-deploy re-resolve where the
 *       resolution-only path is still the simplest source of truth.
 *
 * The only semantic divergence is on a bad override: the Prisma path
 * can surface `unsupported-source` by finding the override in raw
 * nodes; the client-candidates path doesn't have raw nodes, so a
 * missing override falls through to `none`.
 *
 * Steps 4–5 (mapping lookup + filter build) require the GCP credentials
 * and resolveLogFilter — kept colocated here because the resolution is
 * the only consumer; the orchestrator just awaits the answer.
 */

import prisma from '@ice/db';
import * as providerService from '@ice/service-credentials';
import { resolveLogFilter } from './filter-resolver';
import type { SourceResolution, SubscribeArgs } from './types';

export async function resolveSource(args: SubscribeArgs): Promise<SourceResolution> {
  const { cardId, environmentId, terminalNodeId, sourceNodeIdOverride, organisationId, candidateSources } = args;

  // Two paths into the candidate list:
  //
  //   (a) `candidateSources` from the client — derived from live Redux
  //       state, so it reflects edges/nodes the user just drew without
  //       waiting for the canvas's 2s save debounce. Skip the Prisma
  //       JSON-column read entirely.
  //
  //   (b) Fallback Prisma read — for older clients that don't ship
  //       candidates, OR for the post-deploy re-resolve where the
  //       resolution-only path is still the simplest source of truth.
  //
  // Both paths produce the same `supportedCandidates` shape and feed
  // into the same tiebreaker + mapping lookup downstream. The only
  // semantic divergence is on a bad override: the Prisma path can
  // surface `unsupported-source` by finding the override in raw nodes;
  // the client-candidates path doesn't have raw nodes, so a missing
  // override falls through to `none`.
  const supportedCandidates: Array<{ nodeId: string; iceType: string; label?: string }> = [];
  let rawNodesForOverrideLookup: any[] | null = null;

  if (Array.isArray(candidateSources) && candidateSources.length > 0) {
    // Client-side candidates — probe each through the same resolver
    // gate the Prisma path uses. A candidate whose iceType isn't
    // supported is silently dropped (same behavior as the Prisma walk).
    for (const candidate of candidateSources) {
      if (!candidate || typeof candidate.nodeId !== 'string' || typeof candidate.iceType !== 'string') continue;
      if (!candidate.nodeId || !candidate.iceType) continue;
      const probe = resolveLogFilter({
        iceType: candidate.iceType,
        resource: { name: '__probe__', type: 'gcp.unspecified' },
        projectId: '__probe__',
      });
      if (probe !== null) {
        supportedCandidates.push({
          nodeId: candidate.nodeId,
          iceType: candidate.iceType,
          ...(typeof candidate.label === 'string' ? { label: candidate.label } : {}),
        });
      }
    }
  } else {
    // 1. Fetch card (nodes + edges live as JSON columns).
    const card = await prisma.canvasCard.findUnique({
      where: { id: cardId },
      select: { nodes: true, edges: true, project_id: true },
    });
    if (!card) return { state: 'none' };

    const nodes = (card.nodes as any[]) ?? [];
    const edges = (card.edges as any[]) ?? [];
    rawNodesForOverrideLookup = nodes;

    // 2. Inbound edges to terminalNodeId whose source has a supported iceType.
    for (const edge of edges) {
      if (!edge || edge.target !== terminalNodeId) continue;
      const sourceNode = nodes.find((n) => n?.id === edge.source);
      if (!sourceNode) continue;
      const iceType = String(sourceNode.data?.iceType ?? '');
      if (!iceType) continue;
      // Probe the resolver — it returns null for unsupported iceTypes.
      // We use a stub resource here because we just want the supported-or-not
      // signal; the real filter is built later with the deployed resource.
      const probe = resolveLogFilter({
        iceType,
        resource: { name: '__probe__', type: 'gcp.unspecified' },
        projectId: '__probe__',
      });
      if (probe !== null) {
        supportedCandidates.push({
          nodeId: sourceNode.id,
          iceType,
          label: sourceNode.data?.label as string | undefined,
        });
      }
    }
  }

  // 3. Tiebreaker.
  let chosen: { nodeId: string; iceType: string } | undefined;
  if (sourceNodeIdOverride) {
    const overrideMatch = supportedCandidates.find((c) => c.nodeId === sourceNodeIdOverride);
    if (overrideMatch) {
      chosen = { nodeId: overrideMatch.nodeId, iceType: overrideMatch.iceType };
    } else if (rawNodesForOverrideLookup) {
      // Prisma path: override doesn't point at a supported node — find
      // it in the raw nodes list to surface a proper unsupported-source result.
      const raw = rawNodesForOverrideLookup.find((n) => n?.id === sourceNodeIdOverride);
      if (raw) {
        return {
          state: 'unsupported-source',
          sourceNodeId: raw.id,
          iceType: String(raw.data?.iceType ?? ''),
        };
      }
      return { state: 'none' };
    } else {
      // Client-candidates path: we don't have a raw nodes view to look
      // up the unsupported override against. Drop to `none` rather than
      // pretend we know the iceType.
      return { state: 'none' };
    }
  } else if (supportedCandidates.length === 0) {
    return { state: 'none' };
  } else if (supportedCandidates.length > 1) {
    return { state: 'ambiguous', candidates: supportedCandidates };
  } else {
    chosen = { nodeId: supportedCandidates[0].nodeId, iceType: supportedCandidates[0].iceType };
  }

  // 4. Look up deployed resource via the resource-mapping table. The
  // deploy service uses string `environment` (the env type, e.g.
  // 'production'). The brief calls the param `environmentId`; we look
  // up the Environment row to translate id → type.
  const env = await prisma.environment.findUnique({
    where: { id: environmentId },
    select: { type: true, region: true },
  });
  const envType = env?.type ?? 'development';

  const mapping = await prisma.deployedResourceMapping.findFirst({
    where: { card_id: cardId, node_id: chosen.nodeId, environment: envType },
    select: { resource_name: true, resource_type: true, provider_id: true },
  });
  if (!mapping) {
    return { state: 'pre-deploy', sourceNodeId: chosen.nodeId, iceType: chosen.iceType };
  }

  // 5. Build the filter via the LT-2 resolver. projectId from
  // credentials.project_id (the canonical accessor — see
  // deploy.service.ts L362). region from the Environment row.
  const credentials = await providerService.getDecryptedCredentials(organisationId, 'gcp');
  if (!credentials) {
    return {
      state: 'permission-denied',
      message: 'Cloud Logging access denied. Connect a GCP provider with roles/logging.viewer.',
    };
  }
  const projectId = credentials.project_id ?? '';
  const region = env?.region ?? undefined;

  const resolved = resolveLogFilter({
    iceType: chosen.iceType,
    resource: {
      name: mapping.resource_name,
      type: mapping.resource_type,
    },
    projectId,
    region,
  });
  if (!resolved) {
    // Defensive: the iceType passed step 2's probe but the resolver said
    // no when given the real resource. Should be impossible in v1 but
    // worth surfacing rather than silently swallowing.
    return { state: 'unsupported-source', sourceNodeId: chosen.nodeId, iceType: chosen.iceType };
  }

  return {
    state: 'resolved',
    sourceNodeId: chosen.nodeId,
    iceType: chosen.iceType,
    ...(resolved.caveats ? { caveats: resolved.caveats } : {}),
  };
}

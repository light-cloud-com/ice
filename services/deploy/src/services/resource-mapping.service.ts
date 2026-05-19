/**
 * Resource Mapping Service
 *
 * Maintains the stable `canvas node id ↔ GCP resource name` mapping that
 * survives label renames, canvas moves, and node-data refactors. This is
 * the foundation of Phase 1 — without it, renaming a block creates a new
 * resource instead of updating the existing one.
 *
 * One row per (card_id, node_id, environment). The same node can exist in
 * dev and prod simultaneously with different underlying resources.
 */

import prisma from '@ice/db';

export interface ResourceMappingEntry {
  name: string;
  type: string;
  providerId?: string;
}

/**
 * Load the full mapping for a card+environment as a `node_id → entry` map.
 * Pass the result into `translate_card_to_graph` via `existing_names`.
 */
export async function getResourceMap(cardId: string, environment: string): Promise<Map<string, ResourceMappingEntry>> {
  const rows = await prisma.deployedResourceMapping.findMany({
    where: { card_id: cardId, environment },
  });
  const map = new Map<string, ResourceMappingEntry>();
  for (const r of rows) {
    map.set(r.node_id, {
      name: r.resource_name,
      type: r.resource_type,
      providerId: r.provider_id ?? undefined,
    });
  }
  return map;
}

/**
 * Convenience: a plain `node_id → name` map for passing to the translator.
 */
export async function getExistingNameMap(cardId: string, environment: string): Promise<Map<string, string>> {
  const full = await getResourceMap(cardId, environment);
  const names = new Map<string, string>();
  for (const [nodeId, entry] of full) names.set(nodeId, entry.name);
  return names;
}

export async function upsertResourceMapping(args: {
  cardId: string;
  nodeId: string;
  environment: string;
  resourceType: string;
  resourceName: string;
  providerId?: string;
}): Promise<void> {
  await prisma.deployedResourceMapping.upsert({
    where: {
      card_id_node_id_environment: {
        card_id: args.cardId,
        node_id: args.nodeId,
        environment: args.environment,
      },
    },
    update: {
      resource_type: args.resourceType,
      resource_name: args.resourceName,
      provider_id: args.providerId ?? null,
    },
    create: {
      card_id: args.cardId,
      node_id: args.nodeId,
      environment: args.environment,
      resource_type: args.resourceType,
      resource_name: args.resourceName,
      provider_id: args.providerId ?? null,
    },
  });
}

export async function removeResourceMapping(args: {
  cardId: string;
  nodeId: string;
  environment: string;
}): Promise<void> {
  await prisma.deployedResourceMapping
    .delete({
      where: {
        card_id_node_id_environment: {
          card_id: args.cardId,
          node_id: args.nodeId,
          environment: args.environment,
        },
      },
    })
    .catch(() => {
      // Already gone — idempotent.
    });
}

export async function removeAllMappingsForCard(cardId: string, environment?: string): Promise<void> {
  await prisma.deployedResourceMapping.deleteMany({
    where: { card_id: cardId, ...(environment ? { environment } : {}) },
  });
}

/**
 * Lazy migration: on the first plan/apply for a card after Phase 1 ships,
 * if the mapping table has no entries for (card, environment) but there's a
 * prior deployment with resource results, seed the mapping from history so
 * the first post-upgrade deploy doesn't trigger a destroy-recreate cycle.
 *
 * Skips resources that lack `source_node_id` (pre-Phase-0 deploys) — those
 * will get mapped normally on the next successful deploy.
 */
export async function seedMappingsFromHistory(cardId: string, environment: string): Promise<number> {
  const existing = await prisma.deployedResourceMapping.count({
    where: { card_id: cardId, environment },
  });
  if (existing > 0) return 0;

  const lastDeploy = await prisma.canvasDeployment.findFirst({
    where: {
      card_id: cardId,
      environment,
      status: { in: ['success', 'partial'] },
    },
    orderBy: { created_at: 'desc' },
  });
  if (!lastDeploy?.results) return 0;

  const resources = ((lastDeploy.results as any).resources || []) as any[];
  let seeded = 0;
  for (const r of resources) {
    if (r.success && r.source_node_id && r.name && r.type) {
      await upsertResourceMapping({
        cardId,
        nodeId: r.source_node_id,
        environment,
        resourceType: r.type,
        resourceName: r.name,
        providerId: r.provider_id,
      });
      seeded++;
    }
  }
  return seeded;
}

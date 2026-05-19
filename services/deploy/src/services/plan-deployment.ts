/**
 * Plan-deployment orchestration — extracted from `deploy.service.ts` in
 * rf-deploy2-1 (follow-up to the 2026-04-29 rf-deploy series).
 *
 * Owns the `planDeployment` public entry point + its private `fallbackPlan`
 * fallback, which fires when the core engine's translator throws (typically
 * when `@ice/core` source/dist is out of sync). The fallback is module-private
 * by design — it's a degraded-mode duplicate of the planner that exists only
 * to keep the UI showing something rather than a 500.
 */

import prisma from '@ice/db';
import { getCoreEngine } from './deployer-factory';
import { getExistingNameMap, seedMappingsFromHistory } from './resource-mapping.service';
import { resolveProjectContext } from '../utils/project-context';

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

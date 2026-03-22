/**
 * Deploy Dry-Run Service
 *
 * Lightweight deployability check — runs translate_card_to_graph()
 * without credentials or Prisma records. No side effects.
 */

interface DryRunResult {
  success: boolean;
  translationSucceeded: boolean;
  deployableCount: number;
  skipped: Array<{ nodeId: string; label: string; reason: string }>;
  warnings: string[];
  graphSummary: { nodes: number; edges: number };
  error?: string;
}

export async function dryRunDeploy(
  nodes: any[],
  edges: any[],
  options?: { provider?: string; projectName?: string; environment?: string; region?: string },
): Promise<DryRunResult> {
  const provider = options?.provider || 'gcp';

  try {
    // @ts-ignore — resolved at runtime via pnpm workspace
    const core = await import('@ice-engine/core');
    const { translate_card_to_graph } = core;

    if (!translate_card_to_graph) {
      throw new Error('translate_card_to_graph not available in @ice-engine/core');
    }

    const translation = (translate_card_to_graph as any)({
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
      provider: provider as any,
      projectName: options?.projectName || 'dryrun',
      environment: (options?.environment || 'development') as any,
      region: options?.region || 'us-central1',
    });

    const graph = translation.graph;
    let graphNodeCount = 0;
    let graphEdgeCount = 0;
    if (graph) {
      // Graph may expose nodes/edges as Map, array, or via getter
      if (typeof graph.nodes?.size === 'number') graphNodeCount = graph.nodes.size;
      else if (Array.isArray(graph.nodes)) graphNodeCount = graph.nodes.length;
      if (typeof graph.edges?.size === 'number') graphEdgeCount = graph.edges.size;
      else if (Array.isArray(graph.edges)) graphEdgeCount = graph.edges.length;
    }

    return {
      success: true,
      translationSucceeded: true,
      deployableCount: translation.deployable_count || 0,
      skipped: (translation.skipped || []).map((s: any) => ({
        nodeId: s.nodeId || s.node_id || s.id,
        label: s.label || s.name || s.nodeId || 'unknown',
        reason: s.reason || 'Skipped during translation',
      })),
      warnings: translation.warnings || [],
      graphSummary: { nodes: graphNodeCount, edges: graphEdgeCount },
    };
  } catch (err: any) {
    // Fallback: basic analysis without core engine
    const deployableNodes = nodes.filter(
      (n: any) => n.type === 'resource' && (n.data?.provider === provider || !n.data?.provider),
    );
    const skippedNodes = nodes.filter(
      (n: any) => n.type === 'resource' && n.data?.provider && n.data.provider !== provider,
    );

    return {
      success: false,
      translationSucceeded: false,
      deployableCount: deployableNodes.length,
      skipped: skippedNodes.map((n: any) => ({
        nodeId: n.id,
        label: n.data?.label || n.id,
        reason: `Provider mismatch (${n.data?.provider} != ${provider})`,
      })),
      warnings: [`Core engine translation failed: ${err.message}. Showing basic analysis.`],
      graphSummary: { nodes: deployableNodes.length, edges: edges.length },
      error: err.message,
    };
  }
}

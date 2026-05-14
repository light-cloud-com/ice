/**
 * Tests for `passes/pass-1-4-repo-wiring.ts` — Pass 1.4 of the
 * card-to-graph translator.
 *
 * Pass 1.4 takes a list of edges and, for each edge whose source or
 * target is a `Source.Repository` UI-only block, copies five fields
 * (repository, branch, buildCommand → build_command,
 * outputDirectory → output_directory, path → source_path) onto the
 * compute node's properties on the in-progress graph.
 *
 * Coverage:
 *   - Forward direction: Source.Repository on edge.source.
 *   - Reverse direction: Source.Repository on edge.target.
 *   - Skipped: neither end is Source.Repository.
 *   - Skipped: source missing in nodes array.
 *   - Skipped: compute node missing card_id_to_name entry.
 *   - Skipped: compute node missing in graph nodes (lookup miss).
 *   - **RISK #5 pin**: target already has `repository` set; edge
 *     declares a different `repository` → unconditional overwrite,
 *     target gets the new value.
 *   - **RISK #5 complement**: empty-string source field is SKIPPED
 *     (the `value !== ''` guard) — target retains its prior value.
 *   - **RISK #5 complement**: undefined source field is SKIPPED —
 *     target retains its prior value.
 */
import { describe, it, expect } from 'vitest';
import { create_mutable_graph } from '../../../graph/mutable-graph';
import type { CardEdgeInput, CardNodeInput } from '../../card-translator';
import { wire_source_repositories } from '../pass-1-4-repo-wiring';

/**
 * Build a fresh graph with one compute node already added. Returns the
 * graph plus the bare resource name — the production shape of
 * `card_id_to_name`. Pass 1.4 now looks up via `graph.get_node_by_name`,
 * so callers map `cardId → bareName`. (Pre-bugfix-1, the fixtures here
 * mapped `cardId → ${type}:${name} NodeId` to bypass the latent
 * `graph.nodes.get(name as any)` lookup miss; see the
 * `graph-nodes-keyed-by-type-colon-name-not-bare-name` learning.)
 */
function setup_graph(
  computeName: string,
  initialProps: Record<string, unknown> = {},
): { graph: ReturnType<typeof create_mutable_graph>; nodeKey: string; nodeName: string } {
  const graph = create_mutable_graph('test-project');
  const result = graph.add_node({
    type: 'gcp.run.service',
    name: computeName,
    properties: { region: 'us-central1', ...initialProps },
  });
  if (!result.success || !result.node) {
    throw new Error(`fixture setup failed: ${result.errors?.join(', ')}`);
  }
  // `nodeKey` (the branded NodeId) is still returned for direct
  // `graph.nodes.get(nodeKey)` reads in assertions; production code
  // now reads via `get_node_by_name(bareName)`.
  return {
    graph,
    nodeKey: result.node.id as unknown as string,
    nodeName: result.node.name,
  };
}

describe('wire_source_repositories — basic propagation', () => {
  it('copies all 5 fields from Source.Repository on edge.source onto compute target', () => {
    const { graph, nodeKey, nodeName } = setup_graph('compute-1');
    const nodes: CardNodeInput[] = [
      {
        id: 'repo-card',
        type: 'block',
        data: {
          iceType: 'Source.Repository',
          repository: 'org/myapp',
          branch: 'main',
          buildCommand: 'npm run build',
          outputDirectory: 'dist',
          path: 'apps/web',
        },
      },
      {
        id: 'compute-card',
        type: 'block',
        data: { iceType: 'Compute.CloudRun' },
      },
    ];
    const edges: CardEdgeInput[] = [{ id: 'e1', source: 'repo-card', target: 'compute-card' }];
    const card_id_to_name = new Map<string, string>([['compute-card', nodeName]]);

    wire_source_repositories(edges, nodes, card_id_to_name, graph);

    const node = graph.nodes.get(nodeKey as any);
    expect(node).toBeDefined();
    const props = node!.properties as Record<string, unknown>;
    expect(props.repository).toBe('org/myapp');
    expect(props.branch).toBe('main');
    expect(props.build_command).toBe('npm run build');
    expect(props.output_directory).toBe('dist');
    expect(props.source_path).toBe('apps/web');
  });

  it('handles reverse direction: Source.Repository on edge.target', () => {
    const { graph, nodeKey, nodeName } = setup_graph('compute-2');
    const nodes: CardNodeInput[] = [
      {
        id: 'compute-card',
        type: 'block',
        data: { iceType: 'Compute.CloudRun' },
      },
      {
        id: 'repo-card',
        type: 'block',
        data: {
          iceType: 'Source.Repository',
          repository: 'org/reverse',
          branch: 'develop',
        },
      },
    ];
    const edges: CardEdgeInput[] = [{ id: 'e2', source: 'compute-card', target: 'repo-card' }];
    const card_id_to_name = new Map<string, string>([['compute-card', nodeName]]);

    wire_source_repositories(edges, nodes, card_id_to_name, graph);

    const props = graph.nodes.get(nodeKey as any)!.properties as Record<string, unknown>;
    expect(props.repository).toBe('org/reverse');
    expect(props.branch).toBe('develop');
  });
});

describe('wire_source_repositories — skip conditions', () => {
  it('skips edges where neither end is a Source.Repository', () => {
    const { graph, nodeKey, nodeName } = setup_graph('compute-3', { repository: 'untouched' });
    const nodes: CardNodeInput[] = [
      { id: 'a', type: 'block', data: { iceType: 'Compute.CloudRun' } },
      { id: 'compute-card', type: 'block', data: { iceType: 'Database.CloudSQL' } },
    ];
    const edges: CardEdgeInput[] = [{ id: 'e3', source: 'a', target: 'compute-card' }];
    const card_id_to_name = new Map<string, string>([['compute-card', nodeName]]);

    wire_source_repositories(edges, nodes, card_id_to_name, graph);

    const props = graph.nodes.get(nodeKey as any)!.properties as Record<string, unknown>;
    expect(props.repository).toBe('untouched');
  });

  it('skips edges where the source card is missing from the nodes array', () => {
    const { graph, nodeKey, nodeName } = setup_graph('compute-4', { repository: 'untouched' });
    const nodes: CardNodeInput[] = [
      { id: 'compute-card', type: 'block', data: { iceType: 'Compute.CloudRun' } },
      // no 'missing-source' entry
    ];
    const edges: CardEdgeInput[] = [{ id: 'e4', source: 'missing-source', target: 'compute-card' }];
    const card_id_to_name = new Map<string, string>([['compute-card', nodeName]]);

    wire_source_repositories(edges, nodes, card_id_to_name, graph);

    const props = graph.nodes.get(nodeKey as any)!.properties as Record<string, unknown>;
    expect(props.repository).toBe('untouched');
  });

  it('skips edges where the target card is missing from the nodes array', () => {
    const { graph, nodeKey, nodeName } = setup_graph('compute-5', { repository: 'untouched' });
    const nodes: CardNodeInput[] = [
      {
        id: 'repo-card',
        type: 'block',
        data: { iceType: 'Source.Repository', repository: 'org/should-not-apply' },
      },
      // no 'missing-target' entry
    ];
    const edges: CardEdgeInput[] = [{ id: 'e5', source: 'repo-card', target: 'missing-target' }];
    const card_id_to_name = new Map<string, string>([['compute-card', nodeName]]);

    wire_source_repositories(edges, nodes, card_id_to_name, graph);

    const props = graph.nodes.get(nodeKey as any)!.properties as Record<string, unknown>;
    expect(props.repository).toBe('untouched');
  });

  it('skips when the compute card is absent from card_id_to_name', () => {
    const { graph, nodeKey, nodeName } = setup_graph('compute-6', { repository: 'untouched' });
    const nodes: CardNodeInput[] = [
      {
        id: 'repo-card',
        type: 'block',
        data: { iceType: 'Source.Repository', repository: 'org/should-not-apply' },
      },
      { id: 'compute-card', type: 'block', data: { iceType: 'Compute.CloudRun' } },
    ];
    const edges: CardEdgeInput[] = [{ id: 'e6', source: 'repo-card', target: 'compute-card' }];
    // empty map — compute-card has no name mapping
    const card_id_to_name = new Map<string, string>();

    wire_source_repositories(edges, nodes, card_id_to_name, graph);

    // Untouched node (looked up directly via the original key)
    const props = graph.nodes.get(nodeKey as any)!.properties as Record<string, unknown>;
    expect(props.repository).toBe('untouched');
  });

  it('skips when the mapped name does not resolve to a graph node', () => {
    const { graph, nodeKey, nodeName } = setup_graph('compute-7', { repository: 'untouched' });
    const nodes: CardNodeInput[] = [
      {
        id: 'repo-card',
        type: 'block',
        data: { iceType: 'Source.Repository', repository: 'org/should-not-apply' },
      },
      { id: 'compute-card', type: 'block', data: { iceType: 'Compute.CloudRun' } },
    ];
    const edges: CardEdgeInput[] = [{ id: 'e7', source: 'repo-card', target: 'compute-card' }];
    // Map points to a non-existent graph node key
    const card_id_to_name = new Map<string, string>([
      ['compute-card', 'gcp.run.service:no-such-node'],
    ]);

    wire_source_repositories(edges, nodes, card_id_to_name, graph);

    // The actual fixture node was untouched
    const props = graph.nodes.get(nodeKey as any)!.properties as Record<string, unknown>;
    expect(props.repository).toBe('untouched');
  });
});

describe('wire_source_repositories — RISK #5: unconditional overwrite semantics', () => {
  it('overwrites an existing non-empty target value with the source value (the load-bearing fix)', () => {
    const { graph, nodeKey, nodeName } = setup_graph('compute-8', { repository: 'old-repo' });
    const nodes: CardNodeInput[] = [
      {
        id: 'repo-card',
        type: 'block',
        data: { iceType: 'Source.Repository', repository: 'new-repo' },
      },
      { id: 'compute-card', type: 'block', data: { iceType: 'Compute.CloudRun' } },
    ];
    const edges: CardEdgeInput[] = [{ id: 'e8', source: 'repo-card', target: 'compute-card' }];
    const card_id_to_name = new Map<string, string>([['compute-card', nodeName]]);

    wire_source_repositories(edges, nodes, card_id_to_name, graph);

    const props = graph.nodes.get(nodeKey as any)!.properties as Record<string, unknown>;
    // RISK #5: the wired Source.Repository ALWAYS wins. Older Pass-1.4
    // logic only overwrote `undefined`/empty fields, which silently
    // kept stale repo names from earlier deploys. Any future refactor
    // that reverts to `if (!targetProps[to])` will fail this assertion.
    expect(props.repository).toBe('new-repo');
  });

  it('skips empty-string source field — target retains its prior value', () => {
    const { graph, nodeKey, nodeName } = setup_graph('compute-9', { repository: 'kept-value' });
    const nodes: CardNodeInput[] = [
      {
        id: 'repo-card',
        type: 'block',
        data: { iceType: 'Source.Repository', repository: '' },
      },
      { id: 'compute-card', type: 'block', data: { iceType: 'Compute.CloudRun' } },
    ];
    const edges: CardEdgeInput[] = [{ id: 'e9', source: 'repo-card', target: 'compute-card' }];
    const card_id_to_name = new Map<string, string>([['compute-card', nodeName]]);

    wire_source_repositories(edges, nodes, card_id_to_name, graph);

    const props = graph.nodes.get(nodeKey as any)!.properties as Record<string, unknown>;
    // The `value !== ''` guard means an empty source field never
    // overwrites a non-empty target value. Pin alongside RISK #5.
    expect(props.repository).toBe('kept-value');
  });

  it('skips undefined source field — target retains its prior value', () => {
    const { graph, nodeKey, nodeName } = setup_graph('compute-10', { branch: 'kept-branch' });
    const nodes: CardNodeInput[] = [
      {
        id: 'repo-card',
        type: 'block',
        data: { iceType: 'Source.Repository', repository: 'org/r' /* no branch */ },
      },
      { id: 'compute-card', type: 'block', data: { iceType: 'Compute.CloudRun' } },
    ];
    const edges: CardEdgeInput[] = [{ id: 'e10', source: 'repo-card', target: 'compute-card' }];
    const card_id_to_name = new Map<string, string>([['compute-card', nodeName]]);

    wire_source_repositories(edges, nodes, card_id_to_name, graph);

    const props = graph.nodes.get(nodeKey as any)!.properties as Record<string, unknown>;
    // Undefined source field does not overwrite — the `value !== undefined` guard.
    expect(props.branch).toBe('kept-branch');
    // But the defined field still propagates.
    expect(props.repository).toBe('org/r');
  });
});

describe('wire_source_repositories — defensive null handling', () => {
  it('treats node.data as empty when missing entirely (does not throw)', () => {
    const { graph, nodeKey, nodeName } = setup_graph('compute-11');
    const nodes: CardNodeInput[] = [
      // Source.Repository with no data → treated as missing iceType (skip)
      { id: 'repo-card', type: 'block', data: undefined as unknown as Record<string, unknown> },
      { id: 'compute-card', type: 'block', data: { iceType: 'Compute.CloudRun' } },
    ];
    const edges: CardEdgeInput[] = [{ id: 'e11', source: 'repo-card', target: 'compute-card' }];
    const card_id_to_name = new Map<string, string>([['compute-card', nodeName]]);

    expect(() => wire_source_repositories(edges, nodes, card_id_to_name, graph)).not.toThrow();
  });

  it('returns void and is a no-op on empty edges array', () => {
    const { graph, nodeKey, nodeName } = setup_graph('compute-12', { repository: 'unchanged' });
    const ret = wire_source_repositories(
      [],
      [{ id: 'compute-card', type: 'block', data: { iceType: 'Compute.CloudRun' } }],
      new Map([['compute-card', nodeName]]),
      graph,
    );
    expect(ret).toBeUndefined();
    const props = graph.nodes.get(nodeKey as any)!.properties as Record<string, unknown>;
    expect(props.repository).toBe('unchanged');
  });
});

describe('wire_source_repositories — bugfix-1 regression: production-shape lookup', () => {
  // Pre-bugfix-1, Pass 1.4 used `graph.nodes.get(name as any)` against a
  // Map keyed by branded `${type}:${name}` NodeIds, so production
  // (which stores bare names in `card_id_to_name`) silently no-op'd
  // every iteration at the lookup miss. Tests bypassed the bug by
  // mapping cardId → branded NodeId. This regression test pins the
  // production-shape contract: bare-name input → mutation actually
  // fires. See `graph-nodes-keyed-by-type-colon-name-not-bare-name`
  // learning for context.
  it('uses bare resource name (production shape) for the lookup and mutates target props', () => {
    const graph = create_mutable_graph('test-project');
    const result = graph.add_node({
      type: 'gcp.run.service',
      name: 'svc-prod-shape',
      properties: { region: 'us-central1' },
    });
    if (!result.success || !result.node) {
      throw new Error('fixture setup failed');
    }
    const nodes: CardNodeInput[] = [
      {
        id: 'repo-card',
        type: 'block',
        data: {
          iceType: 'Source.Repository',
          repository: 'org/regression',
          branch: 'main',
          buildCommand: 'pnpm build',
          outputDirectory: 'dist',
          path: 'apps/api',
        },
      },
      { id: 'compute-card', type: 'block', data: { iceType: 'Compute.CloudRun' } },
    ];
    const edges: CardEdgeInput[] = [
      { id: 'e-prod', source: 'repo-card', target: 'compute-card' },
    ];
    // CRITICAL: bare resource name, not the branded NodeId.
    const card_id_to_name = new Map<string, string>([['compute-card', 'svc-prod-shape']]);

    wire_source_repositories(edges, nodes, card_id_to_name, graph);

    // The mutation path actually fires under production-shape mapping.
    const node = graph.get_node_by_name('svc-prod-shape');
    expect(node).toBeDefined();
    const props = node!.properties as Record<string, unknown>;
    expect(props.repository).toBe('org/regression');
    expect(props.branch).toBe('main');
    expect(props.build_command).toBe('pnpm build');
    expect(props.output_directory).toBe('dist');
    expect(props.source_path).toBe('apps/api');
  });
});

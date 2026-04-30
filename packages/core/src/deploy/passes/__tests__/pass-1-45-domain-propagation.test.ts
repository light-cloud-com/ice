/**
 * Tests for `passes/pass-1-45-domain-propagation.ts` — Pass 1.45 of the
 * card-to-graph translator.
 *
 * Pass 1.45 takes a list of edges and, for each edge whose source or
 * target is a `Network.CustomDomain` UI-only block, computes a
 * `<subdomain>.<rootDomain>` (or bare `<rootDomain>` when subdomain is
 * blank) and writes it onto the connected compute target's `domain`
 * property in the in-progress graph.
 *
 * Coverage:
 *   - Forward direction: CustomDomain on edge.source.
 *   - Reverse direction: CustomDomain on edge.target.
 *   - Skipped: neither end is Network.CustomDomain.
 *   - Skipped: source missing in nodes array.
 *   - Skipped: target missing in nodes array.
 *   - Skipped: target iceType not Compute.* (e.g. Storage.Bucket).
 *   - Skipped: target missing card_id_to_name entry.
 *   - Skipped: target missing in graph nodes (lookup miss).
 *   - Skipped: rootDomain blank.
 *   - Skipped: rootDomain === 'example.com' (placeholder filter).
 *   - **RISK #6 priority pin** (the load-bearing precedence):
 *     - routeId set + matching route + edge.subdomain set → uses ROUTE'S subdomain (routeId wins).
 *     - routeId set but route not found → uses empty subdomain (no fallthrough to edge.subdomain).
 *     - routeId unset, edge.subdomain set → uses edge.subdomain (legacy path).
 *     - Neither → bare rootDomain.
 *   - fullHost composition: `<subdomain>.<rootDomain>` vs bare `<rootDomain>`.
 */
import { describe, it, expect } from 'vitest';
import { create_mutable_graph } from '../../../graph/mutable-graph.js';
import type { CardEdgeInput, CardNodeInput } from '../../card-translator.js';
import { propagate_custom_domain_hosts } from '../pass-1-45-domain-propagation.js';

/**
 * Build a fresh graph with one compute node already added. Returns the
 * graph plus the bare resource name — the production shape of
 * `card_id_to_name`. Pass 1.45 now looks up via `graph.get_node_by_name`,
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

describe('propagate_custom_domain_hosts — basic propagation', () => {
  it('writes `<subdomain>.<rootDomain>` onto compute target when CustomDomain on edge.source', () => {
    const { graph, nodeKey, nodeName } = setup_graph('compute-1');
    const nodes: CardNodeInput[] = [
      {
        id: 'domain-card',
        type: 'block',
        data: { iceType: 'Network.CustomDomain', domain: 'acme.io' },
      },
      {
        id: 'compute-card',
        type: 'block',
        data: { iceType: 'Compute.CloudRun' },
      },
    ];
    const edges: CardEdgeInput[] = [
      { id: 'e1', source: 'domain-card', target: 'compute-card', data: { subdomain: 'api' } },
    ];
    const card_id_to_name = new Map<string, string>([['compute-card', nodeName]]);

    propagate_custom_domain_hosts(edges, nodes, card_id_to_name, graph);

    const props = graph.nodes.get(nodeKey as any)!.properties as Record<string, unknown>;
    expect(props.domain).toBe('api.acme.io');
  });

  it('handles reverse direction: CustomDomain on edge.target', () => {
    const { graph, nodeKey, nodeName } = setup_graph('compute-2');
    const nodes: CardNodeInput[] = [
      {
        id: 'compute-card',
        type: 'block',
        data: { iceType: 'Compute.CloudRun' },
      },
      {
        id: 'domain-card',
        type: 'block',
        data: { iceType: 'Network.CustomDomain', domain: 'reverse.dev' },
      },
    ];
    const edges: CardEdgeInput[] = [
      { id: 'e2', source: 'compute-card', target: 'domain-card', data: { subdomain: 'app' } },
    ];
    const card_id_to_name = new Map<string, string>([['compute-card', nodeName]]);

    propagate_custom_domain_hosts(edges, nodes, card_id_to_name, graph);

    const props = graph.nodes.get(nodeKey as any)!.properties as Record<string, unknown>;
    expect(props.domain).toBe('app.reverse.dev');
  });

  it('writes bare rootDomain onto target when subdomain is blank (no routeId, no edge.subdomain)', () => {
    const { graph, nodeKey, nodeName } = setup_graph('compute-bare');
    const nodes: CardNodeInput[] = [
      {
        id: 'domain-card',
        type: 'block',
        data: { iceType: 'Network.CustomDomain', domain: 'bare.io' },
      },
      { id: 'compute-card', type: 'block', data: { iceType: 'Compute.CloudRun' } },
    ];
    const edges: CardEdgeInput[] = [
      { id: 'e-bare', source: 'domain-card', target: 'compute-card' },
    ];
    const card_id_to_name = new Map<string, string>([['compute-card', nodeName]]);

    propagate_custom_domain_hosts(edges, nodes, card_id_to_name, graph);

    const props = graph.nodes.get(nodeKey as any)!.properties as Record<string, unknown>;
    expect(props.domain).toBe('bare.io');
  });

  it('writes bare rootDomain onto target when edge.subdomain is empty string (no routeId)', () => {
    const { graph, nodeKey, nodeName } = setup_graph('compute-empty-sub');
    const nodes: CardNodeInput[] = [
      {
        id: 'domain-card',
        type: 'block',
        data: { iceType: 'Network.CustomDomain', domain: 'empty.io' },
      },
      { id: 'compute-card', type: 'block', data: { iceType: 'Compute.CloudRun' } },
    ];
    const edges: CardEdgeInput[] = [
      { id: 'e-empty', source: 'domain-card', target: 'compute-card', data: { subdomain: '' } },
    ];
    const card_id_to_name = new Map<string, string>([['compute-card', nodeName]]);

    propagate_custom_domain_hosts(edges, nodes, card_id_to_name, graph);

    const props = graph.nodes.get(nodeKey as any)!.properties as Record<string, unknown>;
    expect(props.domain).toBe('empty.io');
  });

  it('trims whitespace from rootDomain and edge.subdomain', () => {
    const { graph, nodeKey, nodeName } = setup_graph('compute-trim');
    const nodes: CardNodeInput[] = [
      {
        id: 'domain-card',
        type: 'block',
        data: { iceType: 'Network.CustomDomain', domain: '  trim.dev  ' },
      },
      { id: 'compute-card', type: 'block', data: { iceType: 'Compute.CloudRun' } },
    ];
    const edges: CardEdgeInput[] = [
      { id: 'e-trim', source: 'domain-card', target: 'compute-card', data: { subdomain: '  www  ' } },
    ];
    const card_id_to_name = new Map<string, string>([['compute-card', nodeName]]);

    propagate_custom_domain_hosts(edges, nodes, card_id_to_name, graph);

    const props = graph.nodes.get(nodeKey as any)!.properties as Record<string, unknown>;
    expect(props.domain).toBe('www.trim.dev');
  });
});

describe('propagate_custom_domain_hosts — skip conditions', () => {
  it('skips edges where neither end is a Network.CustomDomain', () => {
    const { graph, nodeKey, nodeName } = setup_graph('compute-3', { domain: 'untouched.io' });
    const nodes: CardNodeInput[] = [
      { id: 'a', type: 'block', data: { iceType: 'Compute.CloudRun' } },
      { id: 'compute-card', type: 'block', data: { iceType: 'Database.CloudSQL' } },
    ];
    const edges: CardEdgeInput[] = [{ id: 'e3', source: 'a', target: 'compute-card' }];
    const card_id_to_name = new Map<string, string>([['compute-card', nodeName]]);

    propagate_custom_domain_hosts(edges, nodes, card_id_to_name, graph);

    const props = graph.nodes.get(nodeKey as any)!.properties as Record<string, unknown>;
    expect(props.domain).toBe('untouched.io');
  });

  it('skips edges where the source card is missing from the nodes array', () => {
    const { graph, nodeKey, nodeName } = setup_graph('compute-4', { domain: 'untouched.io' });
    const nodes: CardNodeInput[] = [
      { id: 'compute-card', type: 'block', data: { iceType: 'Compute.CloudRun' } },
      // no 'missing-source' entry
    ];
    const edges: CardEdgeInput[] = [
      { id: 'e4', source: 'missing-source', target: 'compute-card', data: { subdomain: 'api' } },
    ];
    const card_id_to_name = new Map<string, string>([['compute-card', nodeName]]);

    propagate_custom_domain_hosts(edges, nodes, card_id_to_name, graph);

    const props = graph.nodes.get(nodeKey as any)!.properties as Record<string, unknown>;
    expect(props.domain).toBe('untouched.io');
  });

  it('skips edges where the target card is missing from the nodes array', () => {
    const { graph, nodeKey, nodeName } = setup_graph('compute-5', { domain: 'untouched.io' });
    const nodes: CardNodeInput[] = [
      {
        id: 'domain-card',
        type: 'block',
        data: { iceType: 'Network.CustomDomain', domain: 'should-not-apply.io' },
      },
      // no 'missing-target' entry
    ];
    const edges: CardEdgeInput[] = [
      { id: 'e5', source: 'domain-card', target: 'missing-target' },
    ];
    const card_id_to_name = new Map<string, string>([['compute-card', nodeName]]);

    propagate_custom_domain_hosts(edges, nodes, card_id_to_name, graph);

    const props = graph.nodes.get(nodeKey as any)!.properties as Record<string, unknown>;
    expect(props.domain).toBe('untouched.io');
  });

  it('skips when target iceType is not Compute.* (e.g. Storage.Bucket)', () => {
    const { graph, nodeKey, nodeName } = setup_graph('compute-6', { domain: 'untouched.io' });
    const nodes: CardNodeInput[] = [
      {
        id: 'domain-card',
        type: 'block',
        data: { iceType: 'Network.CustomDomain', domain: 'should-not-apply.io' },
      },
      { id: 'storage-card', type: 'block', data: { iceType: 'Storage.Bucket' } },
    ];
    const edges: CardEdgeInput[] = [
      { id: 'e6', source: 'domain-card', target: 'storage-card', data: { subdomain: 'cdn' } },
    ];
    // Map points the storage card to the compute fixture so we can detect
    // any mutation that slipped past the iceType guard.
    const card_id_to_name = new Map<string, string>([['storage-card', nodeName]]);

    propagate_custom_domain_hosts(edges, nodes, card_id_to_name, graph);

    const props = graph.nodes.get(nodeKey as any)!.properties as Record<string, unknown>;
    expect(props.domain).toBe('untouched.io');
  });

  it('skips when the compute card is absent from card_id_to_name', () => {
    const { graph, nodeKey, nodeName } = setup_graph('compute-7', { domain: 'untouched.io' });
    const nodes: CardNodeInput[] = [
      {
        id: 'domain-card',
        type: 'block',
        data: { iceType: 'Network.CustomDomain', domain: 'should-not-apply.io' },
      },
      { id: 'compute-card', type: 'block', data: { iceType: 'Compute.CloudRun' } },
    ];
    const edges: CardEdgeInput[] = [
      { id: 'e7', source: 'domain-card', target: 'compute-card', data: { subdomain: 'api' } },
    ];
    // empty map — compute-card has no name mapping
    const card_id_to_name = new Map<string, string>();

    propagate_custom_domain_hosts(edges, nodes, card_id_to_name, graph);

    const props = graph.nodes.get(nodeKey as any)!.properties as Record<string, unknown>;
    expect(props.domain).toBe('untouched.io');
  });

  it('skips when the mapped name does not resolve to a graph node', () => {
    const { graph, nodeKey, nodeName } = setup_graph('compute-8', { domain: 'untouched.io' });
    const nodes: CardNodeInput[] = [
      {
        id: 'domain-card',
        type: 'block',
        data: { iceType: 'Network.CustomDomain', domain: 'should-not-apply.io' },
      },
      { id: 'compute-card', type: 'block', data: { iceType: 'Compute.CloudRun' } },
    ];
    const edges: CardEdgeInput[] = [
      { id: 'e8', source: 'domain-card', target: 'compute-card', data: { subdomain: 'api' } },
    ];
    // Map points to a non-existent graph node key
    const card_id_to_name = new Map<string, string>([
      ['compute-card', 'gcp.run.service:no-such-node'],
    ]);

    propagate_custom_domain_hosts(edges, nodes, card_id_to_name, graph);

    const props = graph.nodes.get(nodeKey as any)!.properties as Record<string, unknown>;
    expect(props.domain).toBe('untouched.io');
  });

  it('skips when rootDomain is blank', () => {
    const { graph, nodeKey, nodeName } = setup_graph('compute-9', { domain: 'untouched.io' });
    const nodes: CardNodeInput[] = [
      {
        id: 'domain-card',
        type: 'block',
        data: { iceType: 'Network.CustomDomain', domain: '' },
      },
      { id: 'compute-card', type: 'block', data: { iceType: 'Compute.CloudRun' } },
    ];
    const edges: CardEdgeInput[] = [
      { id: 'e9', source: 'domain-card', target: 'compute-card', data: { subdomain: 'api' } },
    ];
    const card_id_to_name = new Map<string, string>([['compute-card', nodeName]]);

    propagate_custom_domain_hosts(edges, nodes, card_id_to_name, graph);

    const props = graph.nodes.get(nodeKey as any)!.properties as Record<string, unknown>;
    expect(props.domain).toBe('untouched.io');
  });

  it('skips when rootDomain trims to blank (whitespace-only)', () => {
    const { graph, nodeKey, nodeName } = setup_graph('compute-9b', { domain: 'untouched.io' });
    const nodes: CardNodeInput[] = [
      {
        id: 'domain-card',
        type: 'block',
        data: { iceType: 'Network.CustomDomain', domain: '   ' },
      },
      { id: 'compute-card', type: 'block', data: { iceType: 'Compute.CloudRun' } },
    ];
    const edges: CardEdgeInput[] = [
      { id: 'e9b', source: 'domain-card', target: 'compute-card', data: { subdomain: 'api' } },
    ];
    const card_id_to_name = new Map<string, string>([['compute-card', nodeName]]);

    propagate_custom_domain_hosts(edges, nodes, card_id_to_name, graph);

    const props = graph.nodes.get(nodeKey as any)!.properties as Record<string, unknown>;
    expect(props.domain).toBe('untouched.io');
  });

  it('skips when rootDomain is the placeholder "example.com"', () => {
    const { graph, nodeKey, nodeName } = setup_graph('compute-10', { domain: 'untouched.io' });
    const nodes: CardNodeInput[] = [
      {
        id: 'domain-card',
        type: 'block',
        data: { iceType: 'Network.CustomDomain', domain: 'example.com' },
      },
      { id: 'compute-card', type: 'block', data: { iceType: 'Compute.CloudRun' } },
    ];
    const edges: CardEdgeInput[] = [
      { id: 'e10', source: 'domain-card', target: 'compute-card', data: { subdomain: 'api' } },
    ];
    const card_id_to_name = new Map<string, string>([['compute-card', nodeName]]);

    propagate_custom_domain_hosts(edges, nodes, card_id_to_name, graph);

    // Placeholder filter must skip — the example.com sentinel is reserved
    // for "user has not configured a real domain yet" and must not leak
    // into deployed resources.
    const props = graph.nodes.get(nodeKey as any)!.properties as Record<string, unknown>;
    expect(props.domain).toBe('untouched.io');
  });
});

describe('propagate_custom_domain_hosts — RISK #6: subdomain priority order', () => {
  it('routeId WINS over edge.data.subdomain when both are set and route is found', () => {
    const { graph, nodeKey, nodeName } = setup_graph('compute-r1');
    const nodes: CardNodeInput[] = [
      {
        id: 'domain-card',
        type: 'block',
        data: {
          iceType: 'Network.CustomDomain',
          domain: 'acme.io',
          routes: [
            { id: 'route-A', subdomain: 'route-sub' },
            { id: 'route-B', subdomain: 'other' },
          ],
        },
      },
      { id: 'compute-card', type: 'block', data: { iceType: 'Compute.CloudRun' } },
    ];
    const edges: CardEdgeInput[] = [
      {
        id: 'er1',
        source: 'domain-card',
        target: 'compute-card',
        data: { routeId: 'route-A', subdomain: 'edge-sub' },
      },
    ];
    const card_id_to_name = new Map<string, string>([['compute-card', nodeName]]);

    propagate_custom_domain_hosts(edges, nodes, card_id_to_name, graph);

    const props = graph.nodes.get(nodeKey as any)!.properties as Record<string, unknown>;
    // RISK #6: routeId is the primary path; the edge.subdomain is legacy.
    // Swapping the precedence order silently breaks edges that have both
    // fields set during the legacy → routes migration window.
    expect(props.domain).toBe('route-sub.acme.io');
  });

  it('routeId set + matching route, NO edge.subdomain → uses route subdomain', () => {
    const { graph, nodeKey, nodeName } = setup_graph('compute-r2');
    const nodes: CardNodeInput[] = [
      {
        id: 'domain-card',
        type: 'block',
        data: {
          iceType: 'Network.CustomDomain',
          domain: 'acme.io',
          routes: [{ id: 'route-X', subdomain: 'admin' }],
        },
      },
      { id: 'compute-card', type: 'block', data: { iceType: 'Compute.CloudRun' } },
    ];
    const edges: CardEdgeInput[] = [
      {
        id: 'er2',
        source: 'domain-card',
        target: 'compute-card',
        data: { routeId: 'route-X' },
      },
    ];
    const card_id_to_name = new Map<string, string>([['compute-card', nodeName]]);

    propagate_custom_domain_hosts(edges, nodes, card_id_to_name, graph);

    const props = graph.nodes.get(nodeKey as any)!.properties as Record<string, unknown>;
    expect(props.domain).toBe('admin.acme.io');
  });

  it('routeId set but route NOT FOUND → uses empty subdomain (NO fallthrough to edge.subdomain)', () => {
    const { graph, nodeKey, nodeName } = setup_graph('compute-r3');
    const nodes: CardNodeInput[] = [
      {
        id: 'domain-card',
        type: 'block',
        data: {
          iceType: 'Network.CustomDomain',
          domain: 'acme.io',
          routes: [{ id: 'route-A', subdomain: 'other' }],
        },
      },
      { id: 'compute-card', type: 'block', data: { iceType: 'Compute.CloudRun' } },
    ];
    const edges: CardEdgeInput[] = [
      {
        id: 'er3',
        source: 'domain-card',
        target: 'compute-card',
        // routeId points at a route that doesn't exist on domain-card.routes
        data: { routeId: 'route-MISSING', subdomain: 'edge-sub' },
      },
    ];
    const card_id_to_name = new Map<string, string>([['compute-card', nodeName]]);

    propagate_custom_domain_hosts(edges, nodes, card_id_to_name, graph);

    const props = graph.nodes.get(nodeKey as any)!.properties as Record<string, unknown>;
    // CRITICAL: when routeId is set, we do NOT fall through to edge.subdomain
    // even if the route lookup misses. The branch is strictly if/else on
    // routeId presence — once we entered the if-branch we use the route's
    // subdomain (or empty if missing) and never read edge.subdomain.
    // Result: bare rootDomain because subdomain ended up empty.
    expect(props.domain).toBe('acme.io');
  });

  it('routeId set, routes array missing on domainNode → uses empty subdomain', () => {
    const { graph, nodeKey, nodeName } = setup_graph('compute-r3b');
    const nodes: CardNodeInput[] = [
      {
        id: 'domain-card',
        type: 'block',
        // No `routes` field at all — covers the `|| []` fallback.
        data: { iceType: 'Network.CustomDomain', domain: 'acme.io' },
      },
      { id: 'compute-card', type: 'block', data: { iceType: 'Compute.CloudRun' } },
    ];
    const edges: CardEdgeInput[] = [
      {
        id: 'er3b',
        source: 'domain-card',
        target: 'compute-card',
        data: { routeId: 'route-anything', subdomain: 'edge-sub' },
      },
    ];
    const card_id_to_name = new Map<string, string>([['compute-card', nodeName]]);

    propagate_custom_domain_hosts(edges, nodes, card_id_to_name, graph);

    const props = graph.nodes.get(nodeKey as any)!.properties as Record<string, unknown>;
    // routeId present → enters if-branch → empty routes array → no match →
    // empty subdomain → bare rootDomain.
    expect(props.domain).toBe('acme.io');
  });

  it('routeId set + matching route with empty subdomain → bare rootDomain', () => {
    const { graph, nodeKey, nodeName } = setup_graph('compute-r3c');
    const nodes: CardNodeInput[] = [
      {
        id: 'domain-card',
        type: 'block',
        data: {
          iceType: 'Network.CustomDomain',
          domain: 'acme.io',
          routes: [{ id: 'route-empty', subdomain: '' }],
        },
      },
      { id: 'compute-card', type: 'block', data: { iceType: 'Compute.CloudRun' } },
    ];
    const edges: CardEdgeInput[] = [
      {
        id: 'er3c',
        source: 'domain-card',
        target: 'compute-card',
        data: { routeId: 'route-empty' },
      },
    ];
    const card_id_to_name = new Map<string, string>([['compute-card', nodeName]]);

    propagate_custom_domain_hosts(edges, nodes, card_id_to_name, graph);

    const props = graph.nodes.get(nodeKey as any)!.properties as Record<string, unknown>;
    expect(props.domain).toBe('acme.io');
  });

  it('NO routeId, edge.data.subdomain SET → uses edge.subdomain (legacy back-compat path)', () => {
    const { graph, nodeKey, nodeName } = setup_graph('compute-r4');
    const nodes: CardNodeInput[] = [
      {
        id: 'domain-card',
        type: 'block',
        data: {
          iceType: 'Network.CustomDomain',
          domain: 'legacy.io',
          // routes array exists but should not be consulted (no routeId on edge).
          routes: [{ id: 'r1', subdomain: 'should-not-be-used' }],
        },
      },
      { id: 'compute-card', type: 'block', data: { iceType: 'Compute.CloudRun' } },
    ];
    const edges: CardEdgeInput[] = [
      {
        id: 'er4',
        source: 'domain-card',
        target: 'compute-card',
        data: { subdomain: 'legacy-sub' },
      },
    ];
    const card_id_to_name = new Map<string, string>([['compute-card', nodeName]]);

    propagate_custom_domain_hosts(edges, nodes, card_id_to_name, graph);

    const props = graph.nodes.get(nodeKey as any)!.properties as Record<string, unknown>;
    expect(props.domain).toBe('legacy-sub.legacy.io');
  });

  it('NO routeId, NO edge.subdomain → bare rootDomain', () => {
    const { graph, nodeKey, nodeName } = setup_graph('compute-r5');
    const nodes: CardNodeInput[] = [
      {
        id: 'domain-card',
        type: 'block',
        data: { iceType: 'Network.CustomDomain', domain: 'plain.io' },
      },
      { id: 'compute-card', type: 'block', data: { iceType: 'Compute.CloudRun' } },
    ];
    const edges: CardEdgeInput[] = [
      { id: 'er5', source: 'domain-card', target: 'compute-card', data: {} },
    ];
    const card_id_to_name = new Map<string, string>([['compute-card', nodeName]]);

    propagate_custom_domain_hosts(edges, nodes, card_id_to_name, graph);

    const props = graph.nodes.get(nodeKey as any)!.properties as Record<string, unknown>;
    expect(props.domain).toBe('plain.io');
  });

  it('empty-string routeId is treated as falsy → falls through to edge.subdomain', () => {
    const { graph, nodeKey, nodeName } = setup_graph('compute-r6');
    const nodes: CardNodeInput[] = [
      {
        id: 'domain-card',
        type: 'block',
        data: { iceType: 'Network.CustomDomain', domain: 'empty-route.io' },
      },
      { id: 'compute-card', type: 'block', data: { iceType: 'Compute.CloudRun' } },
    ];
    const edges: CardEdgeInput[] = [
      {
        id: 'er6',
        source: 'domain-card',
        target: 'compute-card',
        data: { routeId: '', subdomain: 'edge-wins' },
      },
    ];
    const card_id_to_name = new Map<string, string>([['compute-card', nodeName]]);

    propagate_custom_domain_hosts(edges, nodes, card_id_to_name, graph);

    const props = graph.nodes.get(nodeKey as any)!.properties as Record<string, unknown>;
    // The `if (routeId)` predicate is truthy-checked, so empty-string
    // routeId falls through to the legacy path.
    expect(props.domain).toBe('edge-wins.empty-route.io');
  });
});

describe('propagate_custom_domain_hosts — defensive null handling', () => {
  it('treats node.data as empty when missing entirely (does not throw)', () => {
    const { graph, nodeKey, nodeName } = setup_graph('compute-d1');
    const nodes: CardNodeInput[] = [
      // domain card with no data → iceType resolves to '' → skip branch
      { id: 'domain-card', type: 'block', data: undefined as unknown as Record<string, unknown> },
      { id: 'compute-card', type: 'block', data: { iceType: 'Compute.CloudRun' } },
    ];
    const edges: CardEdgeInput[] = [
      { id: 'ed1', source: 'domain-card', target: 'compute-card', data: { subdomain: 'api' } },
    ];
    const card_id_to_name = new Map<string, string>([['compute-card', nodeName]]);

    expect(() => propagate_custom_domain_hosts(edges, nodes, card_id_to_name, graph)).not.toThrow();
  });

  it('returns void and is a no-op on empty edges array', () => {
    const { graph, nodeKey, nodeName } = setup_graph('compute-d2', { domain: 'unchanged.io' });
    const ret = propagate_custom_domain_hosts(
      [],
      [{ id: 'compute-card', type: 'block', data: { iceType: 'Compute.CloudRun' } }],
      new Map([['compute-card', nodeName]]),
      graph,
    );
    expect(ret).toBeUndefined();
    const props = graph.nodes.get(nodeKey as any)!.properties as Record<string, unknown>;
    expect(props.domain).toBe('unchanged.io');
  });

  it('falls back to empty string when dst.data.iceType is missing (CustomDomain on src branch)', () => {
    // Forces `dstIce = (dst.data?.iceType as string) || ''` to take the
    // `|| ''` fallback (line 52). Behavior: src is CustomDomain → enters
    // first branch normally; targetNode (dst) has no iceType, so the
    // Compute.* regex test fails and the edge is skipped.
    const { graph, nodeKey, nodeName } = setup_graph('compute-fallback-dst', { domain: 'untouched.io' });
    const nodes: CardNodeInput[] = [
      {
        id: 'domain-card',
        type: 'block',
        data: { iceType: 'Network.CustomDomain', domain: 'should-not-apply.io' },
      },
      // No iceType on the target — exercises both line-52 fallback AND
      // line-64 fallback (targetIce computed from dst.data which lacks iceType).
      { id: 'compute-card', type: 'block', data: {} },
    ];
    const edges: CardEdgeInput[] = [
      { id: 'ed-fb1', source: 'domain-card', target: 'compute-card', data: { subdomain: 'api' } },
    ];
    const card_id_to_name = new Map<string, string>([['compute-card', nodeName]]);

    propagate_custom_domain_hosts(edges, nodes, card_id_to_name, graph);

    const props = graph.nodes.get(nodeKey as any)!.properties as Record<string, unknown>;
    expect(props.domain).toBe('untouched.io');
  });

  it('falls back to empty string when targetNode.data.iceType is missing (CustomDomain on dst branch)', () => {
    // CustomDomain is on dst, so targetNode = src. Source has no iceType,
    // exercising the line-64 `|| ''` fallback specifically on the reverse
    // direction code path.
    const { graph, nodeKey, nodeName } = setup_graph('compute-fallback-src', { domain: 'untouched.io' });
    const nodes: CardNodeInput[] = [
      // No iceType on the compute-card source.
      { id: 'compute-card', type: 'block', data: {} },
      {
        id: 'domain-card',
        type: 'block',
        data: { iceType: 'Network.CustomDomain', domain: 'should-not-apply.io' },
      },
    ];
    const edges: CardEdgeInput[] = [
      { id: 'ed-fb2', source: 'compute-card', target: 'domain-card', data: { subdomain: 'api' } },
    ];
    const card_id_to_name = new Map<string, string>([['compute-card', nodeName]]);

    propagate_custom_domain_hosts(edges, nodes, card_id_to_name, graph);

    const props = graph.nodes.get(nodeKey as any)!.properties as Record<string, unknown>;
    expect(props.domain).toBe('untouched.io');
  });

  it('overwrites a pre-existing `domain` value on the target (CustomDomain wins)', () => {
    const { graph, nodeKey, nodeName } = setup_graph('compute-d3', { domain: 'old.io' });
    const nodes: CardNodeInput[] = [
      {
        id: 'domain-card',
        type: 'block',
        data: { iceType: 'Network.CustomDomain', domain: 'new.io' },
      },
      { id: 'compute-card', type: 'block', data: { iceType: 'Compute.CloudRun' } },
    ];
    const edges: CardEdgeInput[] = [
      { id: 'ed3', source: 'domain-card', target: 'compute-card', data: { subdomain: 'api' } },
    ];
    const card_id_to_name = new Map<string, string>([['compute-card', nodeName]]);

    propagate_custom_domain_hosts(edges, nodes, card_id_to_name, graph);

    const props = graph.nodes.get(nodeKey as any)!.properties as Record<string, unknown>;
    // CustomDomain ALWAYS wins per the docstring contract.
    expect(props.domain).toBe('api.new.io');
  });
});

describe('propagate_custom_domain_hosts — bugfix-1 regression: production-shape lookup', () => {
  // Pre-bugfix-1, Pass 1.45 used `graph.nodes.get(name as any)` against a
  // Map keyed by branded `${type}:${name}` NodeIds, so production
  // (which stores bare names in `card_id_to_name`) silently no-op'd
  // every iteration at the lookup miss. Tests bypassed the bug by
  // mapping cardId → branded NodeId. This regression test pins the
  // production-shape contract: bare-name input → mutation actually
  // fires. See `graph-nodes-keyed-by-type-colon-name-not-bare-name`
  // learning for context.
  it('uses bare resource name (production shape) for the lookup and mutates target.domain', () => {
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
        id: 'domain-card',
        type: 'block',
        data: { iceType: 'Network.CustomDomain', domain: 'prod-shape.io' },
      },
      { id: 'compute-card', type: 'block', data: { iceType: 'Compute.CloudRun' } },
    ];
    const edges: CardEdgeInput[] = [
      { id: 'e-prod', source: 'domain-card', target: 'compute-card', data: { subdomain: 'api' } },
    ];
    // CRITICAL: bare resource name, not the branded NodeId.
    const card_id_to_name = new Map<string, string>([['compute-card', 'svc-prod-shape']]);

    propagate_custom_domain_hosts(edges, nodes, card_id_to_name, graph);

    // The mutation path actually fires under production-shape mapping.
    const node = graph.get_node_by_name('svc-prod-shape');
    expect(node).toBeDefined();
    expect((node!.properties as Record<string, unknown>).domain).toBe('api.prod-shape.io');
  });
});

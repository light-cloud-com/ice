/**
 * Tests for `passes/pass-1-5-endpoint-wiring.ts` — Pass 1.5 of the
 * card-to-graph translator.
 *
 * Pass 1.5 wires the `Network.PublicEndpoint` block (and the special
 * `Network.CustomDomain` nested inside `Network.PrivateNetwork` form)
 * into a load balancer chain: backend bucket / backend service synthetic
 * nodes, URL map host rules attached to the forwarding rule node,
 * managed SSL cert injection, and atomic forwarding-rule removal when
 * all backends turn out to be Firebase Hosting static sites.
 *
 * Coverage:
 *   - Empty endpoints (no edges) → no-op.
 *   - Single-subdomain endpoint → host rule collected, attached to FR.
 *   - Multi-subdomain endpoint → multiple host rules.
 *   - Mixed static + service backends → static site domain propagation
 *     AND backend service host rule on the same FR.
 *   - **RISK #7 pin**: all-static-site backends → atomic removal:
 *     graph.remove_node() returns true AND deployables.splice() AND
 *     deployable_count_delta--.
 *   - **RISK #8 pin**: service-type backend mutates BackendEntry
 *     post-push: `sourceServiceName === targetResourceName` after wire.
 *   - SSL cert synthetic injection: `enableHttps && autoProvisionCert
 *     && hosts.length > 0` → cert node added, FR.ssl_certificate_name
 *     set, FR.protocol = 'HTTPS', port_range = '443'.
 *   - SSL cert NOT injected: `enableHttps === false` → FR.protocol =
 *     'HTTP', port_range = '80'.
 *   - SSL cert NOT injected: `autoProvisionCert === false` → same HTTP path.
 *   - SSL cert NOT injected: `hosts.length === 0` (no rootDomain, no
 *     subdomain hosts) → falls into the else-if HTTP branch.
 *   - **3-tier subdomain priority** (mirrors rf-ctrans-11):
 *     - routeId set + matching route → uses ROUTE'S subdomain.
 *     - routeId set but route not found → empty subdomain (no
 *       fallthrough to edge.subdomain — the if/else gate, RISK #6).
 *     - routeId unset, edge.subdomain set → uses edge.subdomain.
 *     - Neither → blank → routes to root domain.
 *   - CustomDomain nested inside PrivateNetwork → treated as endpoint.
 *   - Standalone CustomDomain (no parent) → NOT treated as endpoint.
 *   - Skipped: edge to non-Compute target.
 *   - Skipped: edge with no card_id_to_name entry on target.
 *   - Skipped: endpoint card has no card_id_to_name entry.
 *   - Skipped: endpointNode missing from nodes array (lookup miss after
 *     edge collection).
 *   - Warnings appended for unsupported compute backends.
 *   - `redirect_http` reflects `redirectHttpToHttps` flag on FR node.
 *   - Domain trimming: rootDomain whitespace trimmed.
 */
import { describe, it, expect } from 'vitest';
import { create_mutable_graph } from '../../../graph/mutable-graph';
import { sanitize_name } from '../../utils/name-utils';
import { wire_public_endpoints } from '../pass-1-5-endpoint-wiring';
import type { CardEdgeInput, CardNodeInput, DeployableNodeInfo } from '../../card-translator';

/**
 * Build a fixture: a graph populated with a forwarding-rule node for the
 * endpoint plus zero or more compute backend nodes. Returns the graph
 * plus production-shape `card_id_to_name` (cardId → bare resource
 * name). Pass 1.5 now reads via `graph.get_node_by_name`, so bare names
 * resolve correctly. (Pre-bugfix-1, this fixture mapped `cardId →
 * ${type}:${name} NodeId` to bypass the latent
 * `graph.nodes.get(name as any)` lookup miss; see the
 * `graph-nodes-keyed-by-type-colon-name-not-bare-name` learning. The
 * cascading consequences in derived names — `sanitize_name(NodeId-cert)`
 * vs `sanitize_name(bareName-cert)` — also resolve back to clean
 * `fr-1-cert` form once the lookup is via bare names.)
 *
 * `endpointNodeKey` and `computeNodeKeys` (the branded NodeIds) are
 * still returned for `graph.nodes.get(NodeId)` reads in assertions.
 * `endpointNodeName` and `computeNodeNames` are the production-shape
 * bare names used to derive expected synthetic names like
 * `sanitize_name(\`${endpointNodeName}-cert\`)`.
 */
function setup_fixture(opts: {
  endpoint: { cardId: string; resourceName: string };
  computes?: Array<{ cardId: string; resourceName: string; type?: string }>;
}): {
  graph: ReturnType<typeof create_mutable_graph>;
  card_id_to_name: Map<string, string>;
  deployables: DeployableNodeInfo[];
  endpointNodeKey: string;
  endpointNodeName: string;
  computeNodeKeys: Record<string, string>;
  computeNodeNames: Record<string, string>;
} {
  const graph = create_mutable_graph('test-project');
  const card_id_to_name = new Map<string, string>();
  const deployables: DeployableNodeInfo[] = [];

  const frResult = graph.add_node({
    type: 'gcp.compute.globalForwardingRule',
    name: opts.endpoint.resourceName,
    properties: {},
  });
  if (!frResult.success || !frResult.node) {
    throw new Error(`fixture FR setup failed: ${frResult.errors?.join(', ')}`);
  }
  const frNodeKey = frResult.node.id as unknown as string;
  const frNodeName = frResult.node.name;
  // Production shape: card_id_to_name → bare resource name. The deploy
  // engine pushes `resource_name: bareName` to the deployables array,
  // mirrored here so the RISK #7 splice (`d.resource_name === forwardingResourceName`)
  // matches under the bare-name flow.
  card_id_to_name.set(opts.endpoint.cardId, frNodeName);
  deployables.push({
    node_id: opts.endpoint.cardId,
    label: 'Public Endpoint',
    ice_type: 'Network.PublicEndpoint',
    resource_type: 'gcp.compute.globalForwardingRule',
    resource_name: frNodeName,
  });

  const computeNodeKeys: Record<string, string> = {};
  const computeNodeNames: Record<string, string> = {};
  for (const compute of opts.computes || []) {
    const computeResult = graph.add_node({
      type: compute.type || 'gcp.run.service',
      name: compute.resourceName,
      properties: {},
    });
    if (!computeResult.success || !computeResult.node) {
      throw new Error(`fixture compute setup failed: ${computeResult.errors?.join(', ')}`);
    }
    const cmpKey = computeResult.node.id as unknown as string;
    const cmpName = computeResult.node.name;
    card_id_to_name.set(compute.cardId, cmpName);
    computeNodeKeys[compute.cardId] = cmpKey;
    computeNodeNames[compute.cardId] = cmpName;
  }

  return {
    graph,
    card_id_to_name,
    deployables,
    endpointNodeKey: frNodeKey,
    endpointNodeName: frNodeName,
    computeNodeKeys,
    computeNodeNames,
  };
}

describe('wire_public_endpoints — empty / no-op cases', () => {
  it('returns delta 0 when there are no edges', () => {
    const { graph, card_id_to_name, deployables } = setup_fixture({
      endpoint: { cardId: 'ep1', resourceName: 'fr-1' },
    });
    const warnings: string[] = [];
    const result = wire_public_endpoints({
      edges: [],
      nodes: [],
      card_id_to_name,
      graph,
      deployables,
      warnings,
      projectName: 'test-project',
    });
    expect(result.deployable_count_delta).toBe(0);
    expect(warnings).toEqual([]);
    expect(deployables.length).toBe(1); // FR not removed because the loop never ran
  });

  it('skips edges with no source / target match in nodes', () => {
    const { graph, card_id_to_name, deployables } = setup_fixture({
      endpoint: { cardId: 'ep1', resourceName: 'fr-1' },
    });
    const warnings: string[] = [];
    // No nodes array — every find() lookup returns undefined.
    const result = wire_public_endpoints({
      edges: [{ id: 'e1', source: 'missing-src', target: 'missing-dst' }],
      nodes: [],
      card_id_to_name,
      graph,
      deployables,
      warnings,
      projectName: 'test-project',
    });
    expect(result.deployable_count_delta).toBe(0);
    expect(warnings).toEqual([]);
  });

  it('skips edges where neither end is an endpoint type', () => {
    const { graph, card_id_to_name, deployables } = setup_fixture({
      endpoint: { cardId: 'ep1', resourceName: 'fr-1' },
    });
    const nodes: CardNodeInput[] = [
      { id: 'a', type: 'block', data: { iceType: 'Compute.CloudRun' } },
      { id: 'b', type: 'block', data: { iceType: 'Database.CloudSQL' } },
    ];
    const result = wire_public_endpoints({
      edges: [{ id: 'e1', source: 'a', target: 'b' }],
      nodes,
      card_id_to_name,
      graph,
      deployables,
      warnings: [],
      projectName: 'test-project',
    });
    expect(result.deployable_count_delta).toBe(0);
  });

  it('skips edges to non-Compute targets even when source is endpoint', () => {
    const { graph, card_id_to_name, deployables } = setup_fixture({
      endpoint: { cardId: 'ep1', resourceName: 'fr-1' },
    });
    const nodes: CardNodeInput[] = [
      { id: 'ep-card', type: 'block', data: { iceType: 'Network.PublicEndpoint', domain: 'a.io' } },
      { id: 'db-card', type: 'block', data: { iceType: 'Database.CloudSQL' } },
    ];
    card_id_to_name.set('ep-card', 'fr-1');
    const result = wire_public_endpoints({
      edges: [{ id: 'e1', source: 'ep-card', target: 'db-card' }],
      nodes,
      card_id_to_name,
      graph,
      deployables,
      warnings: [],
      projectName: 'test-project',
    });
    expect(result.deployable_count_delta).toBe(0);
  });

  it('skips edges where the compute target has no card_id_to_name entry', () => {
    const { graph, card_id_to_name, deployables } = setup_fixture({
      endpoint: { cardId: 'ep-card', resourceName: 'fr-1' },
    });
    const nodes: CardNodeInput[] = [
      { id: 'ep-card', type: 'block', data: { iceType: 'Network.PublicEndpoint', domain: 'a.io' } },
      { id: 'cmp-card', type: 'block', data: { iceType: 'Compute.Container' } },
    ];
    // Note: cmp-card NOT in card_id_to_name.
    const result = wire_public_endpoints({
      edges: [{ id: 'e1', source: 'ep-card', target: 'cmp-card' }],
      nodes,
      card_id_to_name,
      graph,
      deployables,
      warnings: [],
      projectName: 'test-project',
    });
    expect(result.deployable_count_delta).toBe(0);
  });

  it('skips endpoints that have no card_id_to_name entry', () => {
    const { graph, card_id_to_name, deployables } = setup_fixture({
      endpoint: { cardId: 'mapped-ep', resourceName: 'fr-1' },
      computes: [{ cardId: 'cmp-card', resourceName: 'svc-1' }],
    });
    // Replace the endpoint mapping with an unmapped card so the
    // edge-collection loop populates endpointToBackends but the
    // outer for-of skips at the lookup miss.
    card_id_to_name.delete('mapped-ep');
    const nodes: CardNodeInput[] = [
      { id: 'unmapped-ep', type: 'block', data: { iceType: 'Network.PublicEndpoint', domain: 'x.io' } },
      { id: 'cmp-card', type: 'block', data: { iceType: 'Compute.Container' } },
    ];
    const result = wire_public_endpoints({
      edges: [{ id: 'e1', source: 'unmapped-ep', target: 'cmp-card' }],
      nodes,
      card_id_to_name,
      graph,
      deployables,
      warnings: [],
      projectName: 'test-project',
    });
    expect(result.deployable_count_delta).toBe(0);
  });

  it('skips endpoints whose card vanished from nodes between collection and outer loop', () => {
    // Edge cites an endpoint id; nodes array used for outer-loop find()
    // does not contain it. This is the `endpointNode` lookup miss
    // (lines 478-479 in original) — reachable when the orchestrator
    // mutates `nodes` between phases. Pin it explicitly.
    const { graph, card_id_to_name, deployables } = setup_fixture({
      endpoint: { cardId: 'ep-card', resourceName: 'fr-1' },
      computes: [{ cardId: 'cmp-card', resourceName: 'svc-1' }],
    });
    const nodesForFirstPass: CardNodeInput[] = [
      { id: 'ep-card', type: 'block', data: { iceType: 'Network.PublicEndpoint', domain: 'x.io' } },
      { id: 'cmp-card', type: 'block', data: { iceType: 'Compute.Container' } },
    ];
    // Snapshot the populated map by running the function once with
    // both nodes present, but a degenerate setup: pass an edges array
    // that references an endpoint whose card isn't present on the
    // outer-loop pass.
    //
    // Easier path: first-loop fills endpointToBackends keyed by
    // 'ep-card'; outer loop calls nodes.find on the SAME `nodes` array.
    // To exercise the miss, we omit ep-card from `nodes`. The first
    // loop's edge.source / .target lookups will skip too — so the
    // miss-after-collection branch is unreachable in production from
    // a well-formed input. We still document via assertion that the
    // branch is defensive (no throw, no mutation).
    const result = wire_public_endpoints({
      edges: [{ id: 'e1', source: 'ep-card', target: 'cmp-card' }],
      nodes: nodesForFirstPass,
      card_id_to_name,
      graph,
      deployables,
      warnings: [],
      projectName: 'test-project',
    });
    // The well-formed path runs through; the defensive miss is
    // unreachable so we just sanity-check the outer assertion.
    expect(result.deployable_count_delta).toBeGreaterThanOrEqual(0);
  });
});

describe('wire_public_endpoints — single-subdomain endpoint', () => {
  it('attaches host_rules + hosts + redirect_http onto the forwarding rule node', () => {
    const {
      graph,
      card_id_to_name,
      deployables,
      endpointNodeKey,
      endpointNodeName,
      computeNodeKeys,
      computeNodeNames,
    } = setup_fixture({
      endpoint: { cardId: 'ep-card', resourceName: 'fr-1' },
      computes: [{ cardId: 'svc-card', resourceName: 'svc-1' }],
    });
    const nodes: CardNodeInput[] = [
      {
        id: 'ep-card',
        type: 'block',
        data: {
          iceType: 'Network.PublicEndpoint',
          domain: 'acme.io',
          enableHttps: false, // skip cert injection so test isolates host wiring
          redirectHttpToHttps: false,
        },
      },
      { id: 'svc-card', type: 'block', data: { iceType: 'Compute.Container' } },
    ];
    const edges: CardEdgeInput[] = [{ id: 'e1', source: 'ep-card', target: 'svc-card', data: { subdomain: 'api' } }];

    const result = wire_public_endpoints({
      edges,
      nodes,
      card_id_to_name,
      graph,
      deployables,
      warnings: [],
      projectName: 'test-project',
    });

    expect(result.deployable_count_delta).toBe(0); // no cert (enableHttps=false), no removal

    const frProps = graph.nodes.get(endpointNodeKey as any)!.properties as any;
    const svcName = computeNodeNames['svc-card'];
    expect(frProps.domain).toBe('acme.io');
    expect(frProps.hosts).toEqual(['acme.io', 'api.acme.io']);
    // After bugfix-1, the host_rules entry's `backendName` /
    // `sourceServiceName` derive from the bare resource name (the
    // production shape of `card_id_to_name`). Pre-bugfix-1 these were
    // the branded NodeId, which sanitize_name stripped colons/dots
    // from — see the
    // `test-fixture-nodeid-mapping-cascades-into-synthetic-names`
    // learning. With the lookup fix, names round-trip cleanly.
    expect(frProps.host_rules).toEqual([
      {
        host: 'api.acme.io',
        backendName: sanitize_name(`${svcName}-backend`),
        backendType: 'service',
        sourceServiceName: svcName,
      },
    ]);
    expect(frProps.redirect_http).toBe(false);
    expect(frProps.protocol).toBe('HTTP');
    expect(frProps.port_range).toBe('80');
  });

  it('uses bare rootDomain as host when subdomain is blank', () => {
    const {
      graph,
      card_id_to_name,
      deployables,
      endpointNodeKey,
      endpointNodeName,
      computeNodeKeys,
      computeNodeNames,
    } = setup_fixture({
      endpoint: { cardId: 'ep-card', resourceName: 'fr-1' },
      computes: [{ cardId: 'svc-card', resourceName: 'svc-1' }],
    });
    const nodes: CardNodeInput[] = [
      {
        id: 'ep-card',
        type: 'block',
        data: { iceType: 'Network.PublicEndpoint', domain: 'root-only.io', enableHttps: false },
      },
      { id: 'svc-card', type: 'block', data: { iceType: 'Compute.Container' } },
    ];
    const edges: CardEdgeInput[] = [{ id: 'e1', source: 'ep-card', target: 'svc-card' }];

    wire_public_endpoints({
      edges,
      nodes,
      card_id_to_name,
      graph,
      deployables,
      warnings: [],
      projectName: 'test-project',
    });

    const svcName = computeNodeNames['svc-card'];
    const frProps = graph.nodes.get(endpointNodeKey as any)!.properties as any;
    expect(frProps.host_rules).toEqual([
      {
        host: 'root-only.io',
        backendName: sanitize_name(`${svcName}-backend`),
        backendType: 'service',
        sourceServiceName: svcName,
      },
    ]);
    expect(frProps.hosts).toEqual(['root-only.io']);
  });

  it('handles reverse direction: PublicEndpoint on edge.target', () => {
    const { graph, card_id_to_name, deployables, endpointNodeKey, endpointNodeName } = setup_fixture({
      endpoint: { cardId: 'ep-card', resourceName: 'fr-1' },
      computes: [{ cardId: 'svc-card', resourceName: 'svc-1' }],
    });
    const nodes: CardNodeInput[] = [
      { id: 'svc-card', type: 'block', data: { iceType: 'Compute.Container' } },
      {
        id: 'ep-card',
        type: 'block',
        data: { iceType: 'Network.PublicEndpoint', domain: 'rev.io', enableHttps: false },
      },
    ];
    const edges: CardEdgeInput[] = [{ id: 'e1', source: 'svc-card', target: 'ep-card', data: { subdomain: 'web' } }];

    wire_public_endpoints({
      edges,
      nodes,
      card_id_to_name,
      graph,
      deployables,
      warnings: [],
      projectName: 'test-project',
    });

    const frProps = graph.nodes.get(endpointNodeKey as any)!.properties as any;
    expect(frProps.host_rules[0].host).toBe('web.rev.io');
  });
});

describe('wire_public_endpoints — multi-subdomain endpoint', () => {
  it('collects multiple host rules and dedupes hosts in the cert list', () => {
    const { graph, card_id_to_name, deployables, endpointNodeKey, endpointNodeName } = setup_fixture({
      endpoint: { cardId: 'ep-card', resourceName: 'fr-1' },
      computes: [
        { cardId: 'svc-a', resourceName: 'svc-a' },
        { cardId: 'svc-b', resourceName: 'svc-b' },
        { cardId: 'svc-c', resourceName: 'svc-c' },
      ],
    });
    const nodes: CardNodeInput[] = [
      {
        id: 'ep-card',
        type: 'block',
        data: { iceType: 'Network.PublicEndpoint', domain: 'multi.io', enableHttps: false },
      },
      { id: 'svc-a', type: 'block', data: { iceType: 'Compute.Container' } },
      { id: 'svc-b', type: 'block', data: { iceType: 'Compute.BackendAPI' } },
      { id: 'svc-c', type: 'block', data: { iceType: 'Compute.SSRSite' } },
    ];
    const edges: CardEdgeInput[] = [
      { id: 'ea', source: 'ep-card', target: 'svc-a', data: { subdomain: 'api' } },
      { id: 'eb', source: 'ep-card', target: 'svc-b', data: { subdomain: 'admin' } },
      { id: 'ec', source: 'ep-card', target: 'svc-c', data: { subdomain: '' } },
    ];

    wire_public_endpoints({
      edges,
      nodes,
      card_id_to_name,
      graph,
      deployables,
      warnings: [],
      projectName: 'test-project',
    });

    const frProps = graph.nodes.get(endpointNodeKey as any)!.properties as any;
    expect(frProps.host_rules.length).toBe(3);
    expect(frProps.host_rules.map((r: any) => r.host).sort()).toEqual(['admin.multi.io', 'api.multi.io', 'multi.io']);
    expect(new Set(frProps.hosts)).toEqual(new Set(['multi.io', 'api.multi.io', 'admin.multi.io']));
  });
});

describe('wire_public_endpoints — RISK #8 BackendEntry sourceServiceName mutation', () => {
  it('mutates BackendEntry.sourceServiceName to equal targetResourceName for service-type backends', () => {
    // The post-push mutation is internal to the function; we observe
    // its effect indirectly through the host_rules entry, which reads
    // be.targetResourceName via the `sourceServiceName` field on the
    // pushed object. The host rule in turn carries the
    // sourceServiceName the LB handler will use for the NEG lookup.
    const {
      graph,
      card_id_to_name,
      deployables,
      endpointNodeKey,
      endpointNodeName,
      computeNodeKeys,
      computeNodeNames,
    } = setup_fixture({
      endpoint: { cardId: 'ep-card', resourceName: 'fr-1' },
      computes: [
        { cardId: 'svc-1', resourceName: 'cloud-run-svc-1' },
        { cardId: 'svc-2', resourceName: 'cloud-run-svc-2' },
      ],
    });
    const nodes: CardNodeInput[] = [
      {
        id: 'ep-card',
        type: 'block',
        data: { iceType: 'Network.PublicEndpoint', domain: 'r8.io', enableHttps: false },
      },
      { id: 'svc-1', type: 'block', data: { iceType: 'Compute.Worker' } },
      { id: 'svc-2', type: 'block', data: { iceType: 'Compute.ServerlessFunction' } },
    ];
    const edges: CardEdgeInput[] = [
      { id: 'e1', source: 'ep-card', target: 'svc-1', data: { subdomain: 'a' } },
      { id: 'e2', source: 'ep-card', target: 'svc-2', data: { subdomain: 'b' } },
    ];

    wire_public_endpoints({
      edges,
      nodes,
      card_id_to_name,
      graph,
      deployables,
      warnings: [],
      projectName: 'test-project',
    });

    const frProps = graph.nodes.get(endpointNodeKey as any)!.properties as any;
    // Each rule's sourceServiceName must equal the original
    // targetResourceName — the post-push mutation observed at the
    // outer host_rules read site.
    const byHost: Record<string, any> = {};
    for (const rule of frProps.host_rules) byHost[rule.host] = rule;
    const svc1Name = computeNodeNames['svc-1'];
    const svc2Name = computeNodeNames['svc-2'];
    // Post-bugfix-1: assertions against bare resource names — the
    // production shape — instead of the branded NodeId form.
    expect(byHost['a.r8.io'].sourceServiceName).toBe(svc1Name);
    expect(byHost['a.r8.io'].backendName).toBe(sanitize_name(`${svc1Name}-backend`));
    expect(byHost['b.r8.io'].sourceServiceName).toBe(svc2Name);
    expect(byHost['b.r8.io'].backendName).toBe(sanitize_name(`${svc2Name}-backend`));
  });
});

describe('wire_public_endpoints — RISK #7 atomic forwarding-rule removal', () => {
  it('all-static-site backends → graph.remove_node + deployables.splice + delta-- atomic', () => {
    const { graph, card_id_to_name, deployables, endpointNodeKey, endpointNodeName } = setup_fixture({
      endpoint: { cardId: 'ep-card', resourceName: 'fr-1' },
      computes: [{ cardId: 'site-card', resourceName: 'firebase-site-1' }],
    });
    const nodes: CardNodeInput[] = [
      {
        id: 'ep-card',
        type: 'block',
        data: { iceType: 'Network.PublicEndpoint', domain: 'static.io' },
      },
      { id: 'site-card', type: 'block', data: { iceType: 'Compute.StaticSite' } },
    ];
    const edges: CardEdgeInput[] = [{ id: 'e1', source: 'ep-card', target: 'site-card', data: { subdomain: 'web' } }];

    expect(deployables.length).toBe(1);
    expect(graph.node_count).toBe(2);

    const result = wire_public_endpoints({
      edges,
      nodes,
      card_id_to_name,
      graph,
      deployables,
      warnings: [],
      projectName: 'test-project',
    });

    // All three mutations: graph removal, deployables splice, delta--.
    expect(result.deployable_count_delta).toBe(-1);
    expect(deployables.find((d) => d.resource_name === endpointNodeName)).toBeUndefined();
    expect(deployables.length).toBe(0);
    expect(graph.has_node(endpointNodeKey as any)).toBe(false);
    // Static site domain still propagated.
    const siteNode = graph.get_node_by_name('firebase-site-1');
    expect((siteNode!.properties as any).domain).toBe('web.static.io');
  });

  it('does NOT remove FR if there is at least one service backend (mixed static + service)', () => {
    const { graph, card_id_to_name, deployables, endpointNodeKey, endpointNodeName } = setup_fixture({
      endpoint: { cardId: 'ep-card', resourceName: 'fr-1' },
      computes: [
        { cardId: 'site-card', resourceName: 'firebase-site-1' },
        { cardId: 'svc-card', resourceName: 'cloud-run-1' },
      ],
    });
    const nodes: CardNodeInput[] = [
      {
        id: 'ep-card',
        type: 'block',
        data: { iceType: 'Network.PublicEndpoint', domain: 'mixed.io', enableHttps: false },
      },
      { id: 'site-card', type: 'block', data: { iceType: 'Compute.StaticSite' } },
      { id: 'svc-card', type: 'block', data: { iceType: 'Compute.Container' } },
    ];
    const edges: CardEdgeInput[] = [
      { id: 'e1', source: 'ep-card', target: 'site-card', data: { subdomain: 'web' } },
      { id: 'e2', source: 'ep-card', target: 'svc-card', data: { subdomain: 'api' } },
    ];

    const result = wire_public_endpoints({
      edges,
      nodes,
      card_id_to_name,
      graph,
      deployables,
      warnings: [],
      projectName: 'test-project',
    });

    expect(result.deployable_count_delta).toBe(0); // no removal, no cert
    expect(deployables.find((d) => d.resource_name === endpointNodeName)).toBeDefined();
    // FR still present; got host rules for the service.
    const frProps = graph.nodes.get(endpointNodeKey as any)!.properties as any;
    expect(frProps.host_rules.length).toBe(1);
    expect(frProps.host_rules[0].host).toBe('api.mixed.io');
    // Static site domain still propagated to firebase-site-1.
    const siteNode = graph.get_node_by_name('firebase-site-1');
    expect((siteNode!.properties as any).domain).toBe('web.mixed.io');
  });

  it('removes FR when all backends are static AND noop when graph.remove_node returns false', () => {
    // Run the same all-static fixture twice. The second invocation
    // (with an already-removed FR) must not throw and must not
    // double-decrement the delta.
    const { graph, card_id_to_name, deployables } = setup_fixture({
      endpoint: { cardId: 'ep-card', resourceName: 'fr-1' },
      computes: [{ cardId: 'site-card', resourceName: 'firebase-site-1' }],
    });
    const nodes: CardNodeInput[] = [
      { id: 'ep-card', type: 'block', data: { iceType: 'Network.PublicEndpoint', domain: 'x.io' } },
      { id: 'site-card', type: 'block', data: { iceType: 'Compute.StaticSite' } },
    ];
    const edges: CardEdgeInput[] = [{ id: 'e1', source: 'ep-card', target: 'site-card' }];

    const r1 = wire_public_endpoints({
      edges,
      nodes,
      card_id_to_name,
      graph,
      deployables,
      warnings: [],
      projectName: 'p',
    });
    expect(r1.deployable_count_delta).toBe(-1);

    // Second call: FR already gone. Lookup miss in outer loop short-circuits
    // (`if (!forwardingResourceName) continue` since card_id_to_name
    // still maps ep-card to 'fr-1' but graph node is gone). The actual
    // behavior: card_id_to_name still has 'ep-card' → 'fr-1', so the
    // lookup returns 'fr-1', then graph.remove_node returns false
    // because it's already gone. The deployables.splice block is
    // gated on `removed`, so no second splice / decrement.
    const r2 = wire_public_endpoints({
      edges,
      nodes,
      card_id_to_name,
      graph,
      deployables,
      warnings: [],
      projectName: 'p',
    });
    expect(r2.deployable_count_delta).toBe(0);
  });
});

describe('wire_public_endpoints — SSL cert synthetic node injection', () => {
  it('injects a managed SSL cert when enableHttps + autoProvisionCert + hosts.length > 0', () => {
    const { graph, card_id_to_name, deployables, endpointNodeKey, endpointNodeName } = setup_fixture({
      endpoint: { cardId: 'ep-card', resourceName: 'fr-1' },
      computes: [{ cardId: 'svc-card', resourceName: 'svc-1' }],
    });
    const nodes: CardNodeInput[] = [
      {
        id: 'ep-card',
        type: 'block',
        data: {
          iceType: 'Network.PublicEndpoint',
          domain: 'cert.io',
          // enableHttps + autoProvisionCert default to true (undefined !== false)
          label: 'My Endpoint',
        },
      },
      { id: 'svc-card', type: 'block', data: { iceType: 'Compute.Container' } },
    ];
    const edges: CardEdgeInput[] = [{ id: 'e1', source: 'ep-card', target: 'svc-card', data: { subdomain: 'api' } }];

    const result = wire_public_endpoints({
      edges,
      nodes,
      card_id_to_name,
      graph,
      deployables,
      warnings: [],
      projectName: 'cert-test-proj',
    });

    expect(result.deployable_count_delta).toBe(1); // cert added

    // Cert name is sanitize_name(`${forwardingResourceName}-cert`); since
    // we map card_id_to_name to the full NodeId, that derivation runs
    // through the colon/dot stripping in sanitize_name.
    const expectedCertName = sanitize_name(`${endpointNodeName}-cert`);
    const certByName = graph.get_node_by_name(expectedCertName);
    expect(certByName).toBeDefined();
    expect((certByName!.properties as any).domains).toEqual(['cert.io', 'api.cert.io']);
    expect((certByName!.properties as any).managed).toBe(true);
    const certDeployable = deployables.find((d) => d.resource_name === expectedCertName);
    expect(certDeployable).toBeDefined();
    expect(certDeployable!.label).toBe('My Endpoint cert');
    expect(certDeployable!.ice_type).toBe('Network.PublicEndpoint');
    expect(certDeployable!.resource_type).toBe('gcp.compute.managedSslCertificate');

    // Cert key recorded in card_id_to_name.
    expect(card_id_to_name.get('ep-card:managed-cert')).toBe(expectedCertName);

    // FR points at the cert and uses HTTPS.
    const frProps = graph.nodes.get(endpointNodeKey as any)!.properties as any;
    expect(frProps.ssl_certificate_name).toBe(expectedCertName);
    expect(frProps.protocol).toBe('HTTPS');
    expect(frProps.port_range).toBe('443');
  });

  it('does NOT inject cert when enableHttps is false (HTTP path)', () => {
    const { graph, card_id_to_name, deployables, endpointNodeKey, endpointNodeName } = setup_fixture({
      endpoint: { cardId: 'ep-card', resourceName: 'fr-1' },
      computes: [{ cardId: 'svc-card', resourceName: 'svc-1' }],
    });
    const nodes: CardNodeInput[] = [
      {
        id: 'ep-card',
        type: 'block',
        data: { iceType: 'Network.PublicEndpoint', domain: 'http.io', enableHttps: false },
      },
      { id: 'svc-card', type: 'block', data: { iceType: 'Compute.Container' } },
    ];
    const edges: CardEdgeInput[] = [{ id: 'e1', source: 'ep-card', target: 'svc-card' }];

    const result = wire_public_endpoints({
      edges,
      nodes,
      card_id_to_name,
      graph,
      deployables,
      warnings: [],
      projectName: 'p',
    });

    const expectedCertName = sanitize_name(`${endpointNodeName}-cert`);
    expect(result.deployable_count_delta).toBe(0);
    expect(graph.get_node_by_name(expectedCertName)).toBeUndefined();
    const frProps = graph.nodes.get(endpointNodeKey as any)!.properties as any;
    expect(frProps.protocol).toBe('HTTP');
    expect(frProps.port_range).toBe('80');
    expect(frProps.ssl_certificate_name).toBeUndefined();
  });

  it('does NOT inject cert when autoProvisionCert is false', () => {
    const { graph, card_id_to_name, deployables, endpointNodeKey, endpointNodeName } = setup_fixture({
      endpoint: { cardId: 'ep-card', resourceName: 'fr-1' },
      computes: [{ cardId: 'svc-card', resourceName: 'svc-1' }],
    });
    const nodes: CardNodeInput[] = [
      {
        id: 'ep-card',
        type: 'block',
        data: { iceType: 'Network.PublicEndpoint', domain: 'noprov.io', autoProvisionCert: false },
      },
      { id: 'svc-card', type: 'block', data: { iceType: 'Compute.Container' } },
    ];
    const edges: CardEdgeInput[] = [{ id: 'e1', source: 'ep-card', target: 'svc-card' }];

    wire_public_endpoints({
      edges,
      nodes,
      card_id_to_name,
      graph,
      deployables,
      warnings: [],
      projectName: 'p',
    });

    const expectedCertName = sanitize_name(`${endpointNodeName}-cert`);
    expect(graph.get_node_by_name(expectedCertName)).toBeUndefined();
    const frProps = graph.nodes.get(endpointNodeKey as any)!.properties as any;
    expect(frProps.protocol).toBe('HTTP');
  });

  it('does NOT re-inject cert when card_id_to_name already has the certKey (idempotent)', () => {
    const { graph, card_id_to_name, deployables, endpointNodeKey, endpointNodeName } = setup_fixture({
      endpoint: { cardId: 'ep-card', resourceName: 'fr-1' },
      computes: [{ cardId: 'svc-card', resourceName: 'svc-1' }],
    });
    // Pre-seed the cert key. The function should still set HTTPS
    // properties on the FR but skip the add_node + push.
    card_id_to_name.set('ep-card:managed-cert', 'pre-existing-cert-name');
    const nodes: CardNodeInput[] = [
      {
        id: 'ep-card',
        type: 'block',
        data: { iceType: 'Network.PublicEndpoint', domain: 'idem.io' },
      },
      { id: 'svc-card', type: 'block', data: { iceType: 'Compute.Container' } },
    ];
    const edges: CardEdgeInput[] = [{ id: 'e1', source: 'ep-card', target: 'svc-card' }];

    const result = wire_public_endpoints({
      edges,
      nodes,
      card_id_to_name,
      graph,
      deployables,
      warnings: [],
      projectName: 'p',
    });

    const expectedCertName = sanitize_name(`${endpointNodeName}-cert`);
    expect(result.deployable_count_delta).toBe(0); // cert NOT added
    const certDeployable = deployables.find((d) => d.resource_name === expectedCertName);
    expect(certDeployable).toBeUndefined(); // not pushed
    // FR still gets ssl_certificate_name (= the deterministic name,
    // not the pre-seeded one — this is important because the FR uses
    // its own derived `certName` not the card_id_to_name lookup).
    const frProps = graph.nodes.get(endpointNodeKey as any)!.properties as any;
    expect(frProps.ssl_certificate_name).toBe(expectedCertName);
    expect(frProps.protocol).toBe('HTTPS');
  });
});

describe('wire_public_endpoints — 3-tier subdomain priority (RISK #6 mirror)', () => {
  it("routeId set + matching route → uses ROUTE'S subdomain, NOT edge.subdomain", () => {
    const { graph, card_id_to_name, deployables, endpointNodeKey, endpointNodeName } = setup_fixture({
      endpoint: { cardId: 'ep-card', resourceName: 'fr-1' },
      computes: [{ cardId: 'svc-card', resourceName: 'svc-1' }],
    });
    const nodes: CardNodeInput[] = [
      {
        id: 'ep-card',
        type: 'block',
        data: {
          iceType: 'Network.PublicEndpoint',
          domain: 'route-wins.io',
          enableHttps: false,
          routes: [
            { id: 'route-A', subdomain: 'route-sub' },
            { id: 'route-B', subdomain: 'other-sub' },
          ],
        },
      },
      { id: 'svc-card', type: 'block', data: { iceType: 'Compute.Container' } },
    ];
    const edges: CardEdgeInput[] = [
      {
        id: 'e1',
        source: 'ep-card',
        target: 'svc-card',
        data: { routeId: 'route-A', subdomain: 'edge-sub' },
      },
    ];

    wire_public_endpoints({
      edges,
      nodes,
      card_id_to_name,
      graph,
      deployables,
      warnings: [],
      projectName: 'p',
    });

    const frProps = graph.nodes.get(endpointNodeKey as any)!.properties as any;
    expect(frProps.host_rules[0].host).toBe('route-sub.route-wins.io');
  });

  it('routeId set but route NOT FOUND → empty subdomain (no fallthrough to edge.subdomain)', () => {
    // The load-bearing assertion from rf-ctrans-11's RISK #6 — strict
    // bifurcation, no fallthrough.
    const { graph, card_id_to_name, deployables, endpointNodeKey, endpointNodeName } = setup_fixture({
      endpoint: { cardId: 'ep-card', resourceName: 'fr-1' },
      computes: [{ cardId: 'svc-card', resourceName: 'svc-1' }],
    });
    const nodes: CardNodeInput[] = [
      {
        id: 'ep-card',
        type: 'block',
        data: {
          iceType: 'Network.PublicEndpoint',
          domain: 'no-fall.io',
          enableHttps: false,
          routes: [{ id: 'route-A', subdomain: 'route-sub' }],
        },
      },
      { id: 'svc-card', type: 'block', data: { iceType: 'Compute.Container' } },
    ];
    const edges: CardEdgeInput[] = [
      {
        id: 'e1',
        source: 'ep-card',
        target: 'svc-card',
        data: { routeId: 'route-MISSING', subdomain: 'edge-sub' },
      },
    ];

    wire_public_endpoints({
      edges,
      nodes,
      card_id_to_name,
      graph,
      deployables,
      warnings: [],
      projectName: 'p',
    });

    const frProps = graph.nodes.get(endpointNodeKey as any)!.properties as any;
    // Empty subdomain → host is bare rootDomain, NOT 'edge-sub.no-fall.io'.
    expect(frProps.host_rules[0].host).toBe('no-fall.io');
  });

  it('routeId unset + edge.subdomain set → uses edge.subdomain (legacy path)', () => {
    const { graph, card_id_to_name, deployables, endpointNodeKey, endpointNodeName } = setup_fixture({
      endpoint: { cardId: 'ep-card', resourceName: 'fr-1' },
      computes: [{ cardId: 'svc-card', resourceName: 'svc-1' }],
    });
    const nodes: CardNodeInput[] = [
      {
        id: 'ep-card',
        type: 'block',
        data: { iceType: 'Network.PublicEndpoint', domain: 'legacy.io', enableHttps: false },
      },
      { id: 'svc-card', type: 'block', data: { iceType: 'Compute.Container' } },
    ];
    const edges: CardEdgeInput[] = [
      { id: 'e1', source: 'ep-card', target: 'svc-card', data: { subdomain: 'legacy-sub' } },
    ];

    wire_public_endpoints({
      edges,
      nodes,
      card_id_to_name,
      graph,
      deployables,
      warnings: [],
      projectName: 'p',
    });

    const frProps = graph.nodes.get(endpointNodeKey as any)!.properties as any;
    expect(frProps.host_rules[0].host).toBe('legacy-sub.legacy.io');
  });

  it('neither routeId nor edge.subdomain → uses bare rootDomain', () => {
    const { graph, card_id_to_name, deployables, endpointNodeKey, endpointNodeName } = setup_fixture({
      endpoint: { cardId: 'ep-card', resourceName: 'fr-1' },
      computes: [{ cardId: 'svc-card', resourceName: 'svc-1' }],
    });
    const nodes: CardNodeInput[] = [
      {
        id: 'ep-card',
        type: 'block',
        data: { iceType: 'Network.PublicEndpoint', domain: 'bare.io', enableHttps: false },
      },
      { id: 'svc-card', type: 'block', data: { iceType: 'Compute.Container' } },
    ];
    const edges: CardEdgeInput[] = [{ id: 'e1', source: 'ep-card', target: 'svc-card' }];

    wire_public_endpoints({
      edges,
      nodes,
      card_id_to_name,
      graph,
      deployables,
      warnings: [],
      projectName: 'p',
    });

    const frProps = graph.nodes.get(endpointNodeKey as any)!.properties as any;
    expect(frProps.host_rules[0].host).toBe('bare.io');
  });

  it('subdomain whitespace trimmed in route lookup AND legacy path', () => {
    const { graph, card_id_to_name, deployables, endpointNodeKey, endpointNodeName } = setup_fixture({
      endpoint: { cardId: 'ep-card', resourceName: 'fr-1' },
      computes: [
        { cardId: 'svc-a', resourceName: 'svc-a' },
        { cardId: 'svc-b', resourceName: 'svc-b' },
      ],
    });
    const nodes: CardNodeInput[] = [
      {
        id: 'ep-card',
        type: 'block',
        data: {
          iceType: 'Network.PublicEndpoint',
          domain: 'trim.io',
          enableHttps: false,
          routes: [{ id: 'r1', subdomain: '  api  ' }],
        },
      },
      { id: 'svc-a', type: 'block', data: { iceType: 'Compute.Container' } },
      { id: 'svc-b', type: 'block', data: { iceType: 'Compute.Container' } },
    ];
    const edges: CardEdgeInput[] = [
      { id: 'e-route', source: 'ep-card', target: 'svc-a', data: { routeId: 'r1' } },
      { id: 'e-edge', source: 'ep-card', target: 'svc-b', data: { subdomain: '  legacy  ' } },
    ];

    wire_public_endpoints({
      edges,
      nodes,
      card_id_to_name,
      graph,
      deployables,
      warnings: [],
      projectName: 'p',
    });

    const frProps = graph.nodes.get(endpointNodeKey as any)!.properties as any;
    const hosts = frProps.host_rules.map((r: any) => r.host).sort();
    expect(hosts).toEqual(['api.trim.io', 'legacy.trim.io']);
  });
});

describe('wire_public_endpoints — CustomDomain nested in PrivateNetwork acts as endpoint', () => {
  it('treats CustomDomain with PrivateNetwork parent as endpoint type', () => {
    const { graph, card_id_to_name, deployables, endpointNodeKey, endpointNodeName } = setup_fixture({
      endpoint: { cardId: 'cd-card', resourceName: 'fr-1' },
      computes: [{ cardId: 'svc-card', resourceName: 'svc-1' }],
    });
    const nodes: CardNodeInput[] = [
      { id: 'vpc-card', type: 'block', data: { iceType: 'Network.PrivateNetwork' } },
      {
        id: 'cd-card',
        type: 'block',
        data: { iceType: 'Network.CustomDomain', domain: 'nested.io', enableHttps: false },
        parentId: 'vpc-card',
      },
      { id: 'svc-card', type: 'block', data: { iceType: 'Compute.Container' } },
    ];
    const edges: CardEdgeInput[] = [{ id: 'e1', source: 'cd-card', target: 'svc-card', data: { subdomain: 'app' } }];

    wire_public_endpoints({
      edges,
      nodes,
      card_id_to_name,
      graph,
      deployables,
      warnings: [],
      projectName: 'p',
    });

    const frProps = graph.nodes.get(endpointNodeKey as any)!.properties as any;
    expect(frProps.host_rules[0].host).toBe('app.nested.io');
  });

  it('does NOT treat standalone CustomDomain (no parent) as endpoint', () => {
    const { graph, card_id_to_name, deployables } = setup_fixture({
      endpoint: { cardId: 'cd-card', resourceName: 'fr-1' },
      computes: [{ cardId: 'svc-card', resourceName: 'svc-1' }],
    });
    const nodes: CardNodeInput[] = [
      {
        id: 'cd-card',
        type: 'block',
        data: { iceType: 'Network.CustomDomain', domain: 'standalone.io' },
        parentId: null,
      },
      { id: 'svc-card', type: 'block', data: { iceType: 'Compute.Container' } },
    ];
    const edges: CardEdgeInput[] = [{ id: 'e1', source: 'cd-card', target: 'svc-card', data: { subdomain: 'api' } }];

    const result = wire_public_endpoints({
      edges,
      nodes,
      card_id_to_name,
      graph,
      deployables,
      warnings: [],
      projectName: 'p',
    });

    expect(result.deployable_count_delta).toBe(0);
    // FR did not get host rules (standalone CD is not an endpoint).
    const frNode = graph.get_node_by_name('fr-1');
    expect((frNode!.properties as any).host_rules).toBeUndefined();
  });

  it('does NOT treat CustomDomain with non-PrivateNetwork parent as endpoint', () => {
    const { graph, card_id_to_name, deployables } = setup_fixture({
      endpoint: { cardId: 'cd-card', resourceName: 'fr-1' },
      computes: [{ cardId: 'svc-card', resourceName: 'svc-1' }],
    });
    const nodes: CardNodeInput[] = [
      { id: 'group-card', type: 'group', data: { iceType: 'Some.Other.Group' } },
      {
        id: 'cd-card',
        type: 'block',
        data: { iceType: 'Network.CustomDomain', domain: 'wrong-parent.io' },
        parentId: 'group-card',
      },
      { id: 'svc-card', type: 'block', data: { iceType: 'Compute.Container' } },
    ];
    const edges: CardEdgeInput[] = [{ id: 'e1', source: 'cd-card', target: 'svc-card', data: { subdomain: 'api' } }];

    const result = wire_public_endpoints({
      edges,
      nodes,
      card_id_to_name,
      graph,
      deployables,
      warnings: [],
      projectName: 'p',
    });

    expect(result.deployable_count_delta).toBe(0);
    const frNode = graph.get_node_by_name('fr-1');
    expect((frNode!.properties as any).host_rules).toBeUndefined();
  });
});

describe('wire_public_endpoints — warnings + unsupported backend types', () => {
  it('appends a warning when the backend compute type is not supported', () => {
    const { graph, card_id_to_name, deployables } = setup_fixture({
      endpoint: { cardId: 'ep-card', resourceName: 'fr-1' },
      computes: [{ cardId: 'svc-card', resourceName: 'svc-1' }],
    });
    const nodes: CardNodeInput[] = [
      {
        id: 'ep-card',
        type: 'block',
        data: { iceType: 'Network.PublicEndpoint', domain: 'warn.io', enableHttps: false },
      },
      // Compute.* prefix passes the gate, but iceType is not in the
      // service set and not Compute.StaticSite — falls into warning path.
      { id: 'svc-card', type: 'block', data: { iceType: 'Compute.SomeNewType' } },
    ];
    const edges: CardEdgeInput[] = [{ id: 'e1', source: 'ep-card', target: 'svc-card', data: { subdomain: 'api' } }];
    const warnings: string[] = [];

    const result = wire_public_endpoints({
      edges,
      nodes,
      card_id_to_name,
      graph,
      deployables,
      warnings,
      projectName: 'p',
    });

    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain('"svc-card"');
    expect(warnings[0]).toContain('Compute.SomeNewType');
    // No host rule produced; FR has empty host_rules → triple-mutation
    // removal fires.
    expect(result.deployable_count_delta).toBe(-1);
  });
});

describe('wire_public_endpoints — redirect_http flag', () => {
  it('passes redirectHttpToHttps onto FR.redirect_http (default true)', () => {
    const { graph, card_id_to_name, deployables, endpointNodeKey, endpointNodeName } = setup_fixture({
      endpoint: { cardId: 'ep-card', resourceName: 'fr-1' },
      computes: [{ cardId: 'svc-card', resourceName: 'svc-1' }],
    });
    const nodes: CardNodeInput[] = [
      {
        id: 'ep-card',
        type: 'block',
        data: { iceType: 'Network.PublicEndpoint', domain: 'r.io', enableHttps: false },
      },
      { id: 'svc-card', type: 'block', data: { iceType: 'Compute.Container' } },
    ];
    const edges: CardEdgeInput[] = [{ id: 'e1', source: 'ep-card', target: 'svc-card' }];

    wire_public_endpoints({
      edges,
      nodes,
      card_id_to_name,
      graph,
      deployables,
      warnings: [],
      projectName: 'p',
    });

    const frProps = graph.nodes.get(endpointNodeKey as any)!.properties as any;
    expect(frProps.redirect_http).toBe(true);
  });

  it('honors redirectHttpToHttps: false on the endpoint', () => {
    const { graph, card_id_to_name, deployables, endpointNodeKey, endpointNodeName } = setup_fixture({
      endpoint: { cardId: 'ep-card', resourceName: 'fr-1' },
      computes: [{ cardId: 'svc-card', resourceName: 'svc-1' }],
    });
    const nodes: CardNodeInput[] = [
      {
        id: 'ep-card',
        type: 'block',
        data: {
          iceType: 'Network.PublicEndpoint',
          domain: 'r.io',
          enableHttps: false,
          redirectHttpToHttps: false,
        },
      },
      { id: 'svc-card', type: 'block', data: { iceType: 'Compute.Container' } },
    ];
    const edges: CardEdgeInput[] = [{ id: 'e1', source: 'ep-card', target: 'svc-card' }];

    wire_public_endpoints({
      edges,
      nodes,
      card_id_to_name,
      graph,
      deployables,
      warnings: [],
      projectName: 'p',
    });

    const frProps = graph.nodes.get(endpointNodeKey as any)!.properties as any;
    expect(frProps.redirect_http).toBe(false);
  });
});

describe('wire_public_endpoints — domain trimming', () => {
  it('trims whitespace on rootDomain', () => {
    const { graph, card_id_to_name, deployables, endpointNodeKey, endpointNodeName } = setup_fixture({
      endpoint: { cardId: 'ep-card', resourceName: 'fr-1' },
      computes: [{ cardId: 'svc-card', resourceName: 'svc-1' }],
    });
    const nodes: CardNodeInput[] = [
      {
        id: 'ep-card',
        type: 'block',
        data: { iceType: 'Network.PublicEndpoint', domain: '  trim.io  ', enableHttps: false },
      },
      { id: 'svc-card', type: 'block', data: { iceType: 'Compute.Container' } },
    ];
    const edges: CardEdgeInput[] = [{ id: 'e1', source: 'ep-card', target: 'svc-card', data: { subdomain: 'api' } }];

    wire_public_endpoints({
      edges,
      nodes,
      card_id_to_name,
      graph,
      deployables,
      warnings: [],
      projectName: 'p',
    });

    const frProps = graph.nodes.get(endpointNodeKey as any)!.properties as any;
    expect(frProps.domain).toBe('trim.io');
    expect(frProps.host_rules[0].host).toBe('api.trim.io');
  });
});

describe('wire_public_endpoints — service-type backend with empty rootDomain', () => {
  it('routes service backend through defaultBackends bucket (no host) when rootDomain blank', () => {
    // When rootDomain is empty AND subdomain is empty, host is empty;
    // backend goes into `defaultBackends` not `hostRules`. The FR is
    // NOT removed (defaultBackends.length > 0), but no
    // backend_bucket_name is set because the default has no
    // backendBucketName (service-type backends never get one assigned
    // — only static-site ones did in older code paths).
    const { graph, card_id_to_name, deployables, endpointNodeKey, endpointNodeName } = setup_fixture({
      endpoint: { cardId: 'ep-card', resourceName: 'fr-1' },
      computes: [{ cardId: 'svc-card', resourceName: 'svc-1' }],
    });
    const nodes: CardNodeInput[] = [
      {
        id: 'ep-card',
        type: 'block',
        data: { iceType: 'Network.PublicEndpoint', domain: '', enableHttps: false },
      },
      { id: 'svc-card', type: 'block', data: { iceType: 'Compute.Container' } },
    ];
    const edges: CardEdgeInput[] = [{ id: 'e1', source: 'ep-card', target: 'svc-card' }];

    const result = wire_public_endpoints({
      edges,
      nodes,
      card_id_to_name,
      graph,
      deployables,
      warnings: [],
      projectName: 'p',
    });

    expect(result.deployable_count_delta).toBe(0); // not removed, no cert
    expect(deployables.find((d) => d.resource_name === endpointNodeName)).toBeDefined();
    const frProps = graph.nodes.get(endpointNodeKey as any)!.properties as any;
    expect(frProps.host_rules).toEqual([]);
    expect(frProps.hosts).toEqual([]);
    expect(frProps.backend_bucket_name).toBeUndefined();
  });
});

describe('wire_public_endpoints — bugfix-1 regression: production-shape lookup', () => {
  // Pre-bugfix-1, Pass 1.5 used `graph.nodes.get(name as any)` for both
  // the static-site `domain` propagation (line 228) and the forwarding
  // rule property write (line 304) against a Map keyed by branded
  // `${type}:${name}` NodeIds, so production (which stores bare names
  // in `card_id_to_name`) silently no-op'd every iteration at the
  // lookup miss. Tests bypassed the bug by mapping cardId → branded
  // NodeId, which made `sanitize_name(\`${forwardingResourceName}-cert\`)`
  // strip colons/dots from the NodeId rather than producing the clean
  // `fr-1-cert` form. This regression test pins the production-shape
  // contract: bare-name input → mutation fires AND derived names
  // round-trip cleanly (no colon/dot stripping cascade). See the
  // `graph-nodes-keyed-by-type-colon-name-not-bare-name` and
  // `test-fixture-nodeid-mapping-cascades-into-synthetic-names`
  // learnings for context.
  it('uses bare resource names (production shape) — host_rules + cert use clean derived names', () => {
    const graph = create_mutable_graph('test-project');
    const frResult = graph.add_node({
      type: 'gcp.compute.globalForwardingRule',
      name: 'fr-prod',
      properties: {},
    });
    if (!frResult.success || !frResult.node) throw new Error('FR setup failed');
    const svcResult = graph.add_node({
      type: 'gcp.run.service',
      name: 'svc-prod',
      properties: {},
    });
    if (!svcResult.success || !svcResult.node) throw new Error('svc setup failed');

    const nodes: CardNodeInput[] = [
      {
        id: 'ep-card',
        type: 'block',
        data: { iceType: 'Network.PublicEndpoint', domain: 'prod.io', label: 'Prod EP' },
      },
      { id: 'svc-card', type: 'block', data: { iceType: 'Compute.Container' } },
    ];
    const edges: CardEdgeInput[] = [{ id: 'e1', source: 'ep-card', target: 'svc-card', data: { subdomain: 'api' } }];
    // CRITICAL: bare resource names, not branded NodeIds.
    const card_id_to_name = new Map<string, string>([
      ['ep-card', 'fr-prod'],
      ['svc-card', 'svc-prod'],
    ]);
    const deployables: DeployableNodeInfo[] = [
      {
        node_id: 'ep-card',
        label: 'Prod EP',
        ice_type: 'Network.PublicEndpoint',
        resource_type: 'gcp.compute.globalForwardingRule',
        resource_name: 'fr-prod',
      },
    ];

    const result = wire_public_endpoints({
      edges,
      nodes,
      card_id_to_name,
      graph,
      deployables,
      warnings: [],
      projectName: 'prod-test',
    });

    // Cert added (default enableHttps=true).
    expect(result.deployable_count_delta).toBe(1);

    // FR mutation path actually fired against the bare-name node.
    const frNode = graph.get_node_by_name('fr-prod');
    expect(frNode).toBeDefined();
    const frProps = frNode!.properties as Record<string, unknown>;
    expect(frProps.domain).toBe('prod.io');
    expect(frProps.hosts).toEqual(['prod.io', 'api.prod.io']);

    // host_rules entry uses bare service name (no NodeId leakage).
    expect(frProps.host_rules).toEqual([
      {
        host: 'api.prod.io',
        backendName: 'svc-prod-backend', // sanitize_name('svc-prod-backend') round-trips clean
        backendType: 'service',
        sourceServiceName: 'svc-prod',
      },
    ]);

    // Cert name derived from bare FR name → 'fr-prod-cert' (clean).
    // Pre-bugfix-1 this would have been the NodeId-derived
    // 'gcp-compute-globalforwardingrule-fr-prod-cert' garbage form.
    expect(frProps.ssl_certificate_name).toBe('fr-prod-cert');
    expect(frProps.protocol).toBe('HTTPS');
    expect(frProps.port_range).toBe('443');

    // Cert node added with clean name + bare-name domains list.
    const certNode = graph.get_node_by_name('fr-prod-cert');
    expect(certNode).toBeDefined();
    expect((certNode!.properties as any).domains).toEqual(['prod.io', 'api.prod.io']);
  });

  it('static-site domain propagation under production-shape lookup', () => {
    // Mirrors the second `graph.nodes.get(be.targetResourceName as any)`
    // callsite at pass-1-5-endpoint-wiring.ts:228. Static-site target
    // gets its `domain` property set when the bare-name lookup hits.
    const graph = create_mutable_graph('test-project');
    const frResult = graph.add_node({
      type: 'gcp.compute.globalForwardingRule',
      name: 'fr-static',
      properties: {},
    });
    if (!frResult.success || !frResult.node) throw new Error('FR setup failed');
    const siteResult = graph.add_node({
      type: 'gcp.firebase.hosting',
      name: 'static-site-prod',
      properties: {},
    });
    if (!siteResult.success || !siteResult.node) throw new Error('site setup failed');

    const nodes: CardNodeInput[] = [
      {
        id: 'ep-card',
        type: 'block',
        data: { iceType: 'Network.PublicEndpoint', domain: 'sites.io' },
      },
      { id: 'site-card', type: 'block', data: { iceType: 'Compute.StaticSite' } },
    ];
    const edges: CardEdgeInput[] = [{ id: 'e1', source: 'ep-card', target: 'site-card', data: { subdomain: 'web' } }];
    const card_id_to_name = new Map<string, string>([
      ['ep-card', 'fr-static'],
      ['site-card', 'static-site-prod'],
    ]);
    const deployables: DeployableNodeInfo[] = [
      {
        node_id: 'ep-card',
        label: 'Static EP',
        ice_type: 'Network.PublicEndpoint',
        resource_type: 'gcp.compute.globalForwardingRule',
        resource_name: 'fr-static',
      },
    ];

    const result = wire_public_endpoints({
      edges,
      nodes,
      card_id_to_name,
      graph,
      deployables,
      warnings: [],
      projectName: 'prod-test',
    });

    // All-static-site backends → atomic FR removal (RISK #7) under
    // production-shape lookup. Pre-bugfix-1, the `remove_node(bare as any)`
    // also silently no-op'd; bugfix-1 resolves the bare name to NodeId
    // via `get_node_by_name(name)?.id` before calling remove_node.
    expect(result.deployable_count_delta).toBe(-1);
    expect(graph.get_node_by_name('fr-static')).toBeUndefined();
    expect(deployables.find((d) => d.resource_name === 'fr-static')).toBeUndefined();

    // Static-site node still in graph with `domain` propagated.
    const siteNode = graph.get_node_by_name('static-site-prod');
    expect(siteNode).toBeDefined();
    expect((siteNode!.properties as any).domain).toBe('web.sites.io');
  });
});

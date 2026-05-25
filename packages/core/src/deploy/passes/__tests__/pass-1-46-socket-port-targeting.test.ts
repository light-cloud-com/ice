/**
 * Tests for `passes/pass-1-46-socket-port-targeting.ts`.
 *
 * Pass 1.46 reads `edge.data.targetSocket` / `sourceSocket` and, when
 * the id matches the `port-<N>-(in|out)` shape, writes the port onto
 * the compute node's `target_port` (and `port` when not explicitly
 * set). This is what lets a typed wiring on a multi-port Container
 * actually drive what the deployer routes to.
 */

import { describe, it, expect } from 'vitest';
import { create_mutable_graph } from '../../../graph/mutable-graph';
import { propagate_socket_port_targets } from '../pass-1-46-socket-port-targeting';
import type { CardEdgeInput, CardNodeInput } from '../../card-translator';

function setup_graph(
  computeName: string,
  initialProps: Record<string, unknown> = {},
): { graph: ReturnType<typeof create_mutable_graph>; nodeName: string } {
  const graph = create_mutable_graph('test-project');
  const result = graph.add_node({
    type: 'gcp.run.service',
    name: computeName,
    properties: { region: 'us-central1', ...initialProps },
  });
  if (!result.success || !result.node) {
    throw new Error(`fixture setup failed: ${result.errors?.join(', ')}`);
  }
  return { graph, nodeName: result.node.name };
}

describe('propagate_socket_port_targets', () => {
  it('writes target_port when targetSocket is `port-<N>-in`', () => {
    const { graph, nodeName } = setup_graph('backend-1');
    const nodes: CardNodeInput[] = [
      { id: 'cd', type: 'block', data: { iceType: 'Network.CustomDomain' } },
      { id: 'backend', type: 'block', data: { iceType: 'Compute.Container' } },
    ];
    const edges: CardEdgeInput[] = [
      {
        id: 'e1',
        source: 'cd',
        target: 'backend',
        data: { sourceSocket: 'domain-out-r1', targetSocket: 'port-8080-in' },
      },
    ];
    const idMap = new Map([['backend', nodeName]]);
    propagate_socket_port_targets(edges, nodes, idMap, graph);
    const props = graph.get_node_by_name(nodeName)!.properties as Record<string, unknown>;
    expect(props.target_port).toBe(8080);
    expect(props.port).toBe(8080);
  });

  it('writes the port when sourceSocket is `port-<N>-out` (backend exposes its listener)', () => {
    const { graph, nodeName } = setup_graph('backend-2');
    const nodes: CardNodeInput[] = [
      { id: 'backend', type: 'block', data: { iceType: 'Compute.Container' } },
      { id: 'gw', type: 'block', data: { iceType: 'Network.Gateway' } },
    ];
    const edges: CardEdgeInput[] = [
      {
        id: 'e2',
        source: 'backend',
        target: 'gw',
        data: { sourceSocket: 'port-3000-out', targetSocket: 'upstream-in' },
      },
    ];
    const idMap = new Map([['backend', nodeName]]);
    propagate_socket_port_targets(edges, nodes, idMap, graph);
    const props = graph.get_node_by_name(nodeName)!.properties as Record<string, unknown>;
    expect(props.target_port).toBe(3000);
    expect(props.port).toBe(3000);
  });

  it("doesn't overwrite a user-set port (but still writes target_port)", () => {
    const { graph, nodeName } = setup_graph('backend-3', { port: 9999 });
    const nodes: CardNodeInput[] = [
      { id: 'cd', type: 'block', data: { iceType: 'Network.CustomDomain' } },
      { id: 'backend', type: 'block', data: { iceType: 'Compute.Container' } },
    ];
    const edges: CardEdgeInput[] = [
      {
        id: 'e3',
        source: 'cd',
        target: 'backend',
        data: { targetSocket: 'port-8080-in' },
      },
    ];
    const idMap = new Map([['backend', nodeName]]);
    propagate_socket_port_targets(edges, nodes, idMap, graph);
    const props = graph.get_node_by_name(nodeName)!.properties as Record<string, unknown>;
    expect(props.port).toBe(9999); // user value preserved
    expect(props.target_port).toBe(8080); // routing target still captured
  });

  it('ignores edges without typed sockets', () => {
    const { graph, nodeName } = setup_graph('backend-4');
    const nodes: CardNodeInput[] = [
      { id: 'cd', type: 'block', data: { iceType: 'Network.CustomDomain' } },
      { id: 'backend', type: 'block', data: { iceType: 'Compute.Container' } },
    ];
    const edges: CardEdgeInput[] = [
      { id: 'e4', source: 'cd', target: 'backend', data: { relationship: 'connects_to' } },
    ];
    const idMap = new Map([['backend', nodeName]]);
    propagate_socket_port_targets(edges, nodes, idMap, graph);
    const props = graph.get_node_by_name(nodeName)!.properties as Record<string, unknown>;
    expect(props.target_port).toBeUndefined();
  });

  it('ignores non-port socket ids (`domain-in`, `repository-in`, etc.)', () => {
    const { graph, nodeName } = setup_graph('backend-5');
    const nodes: CardNodeInput[] = [
      { id: 'cd', type: 'block', data: { iceType: 'Network.CustomDomain' } },
      { id: 'backend', type: 'block', data: { iceType: 'Compute.Container' } },
    ];
    const edges: CardEdgeInput[] = [
      {
        id: 'e5',
        source: 'cd',
        target: 'backend',
        data: { sourceSocket: 'domain-out-r1', targetSocket: 'domain-in' },
      },
    ];
    const idMap = new Map([['backend', nodeName]]);
    propagate_socket_port_targets(edges, nodes, idMap, graph);
    const props = graph.get_node_by_name(nodeName)!.properties as Record<string, unknown>;
    expect(props.target_port).toBeUndefined();
  });

  it('ignores malformed port socket ids (`port-abc-in`, `port--in`, ...)', () => {
    const { graph, nodeName } = setup_graph('backend-6');
    const nodes: CardNodeInput[] = [
      { id: 'cd', type: 'block', data: {} },
      { id: 'backend', type: 'block', data: {} },
    ];
    const edges: CardEdgeInput[] = [
      { id: 'e', source: 'cd', target: 'backend', data: { targetSocket: 'port-abc-in' } },
      { id: 'e2', source: 'cd', target: 'backend', data: { targetSocket: 'port--in' } },
      { id: 'e3', source: 'cd', target: 'backend', data: { targetSocket: 'port-0-in' } },
    ];
    const idMap = new Map([['backend', nodeName]]);
    propagate_socket_port_targets(edges, nodes, idMap, graph);
    const props = graph.get_node_by_name(nodeName)!.properties as Record<string, unknown>;
    expect(props.target_port).toBeUndefined();
  });

  it('skips silently when the target node was not deployed', () => {
    const { graph, nodeName } = setup_graph('backend-7');
    const nodes: CardNodeInput[] = [
      { id: 'cd', type: 'block', data: {} },
      { id: 'backend', type: 'block', data: {} },
    ];
    const edges: CardEdgeInput[] = [
      // edge.target is "ghost-node" which has no entry in idMap (was filtered out)
      { id: 'e', source: 'cd', target: 'ghost-node', data: { targetSocket: 'port-8080-in' } },
    ];
    const idMap = new Map([['backend', nodeName]]); // ghost-node intentionally missing
    expect(() => propagate_socket_port_targets(edges, nodes, idMap, graph)).not.toThrow();
  });
});

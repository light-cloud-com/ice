/**
 * Tests for `passes/pass-1-6-aws-network-wiring.ts`.
 *
 * Pass 1.6 stamps `connected_subnet_names[]` and
 * `connected_security_group_names[]` onto compute / data target blocks
 * connected to `Network.Subnet` or `Network.SecurityGroup` nodes.
 */

import { describe, expect, it } from 'vitest';
import { create_mutable_graph } from '../../../graph/mutable-graph';
import { wire_aws_network } from '../pass-1-6-aws-network-wiring';
import type { CardEdgeInput, CardNodeInput } from '../../card-translator';

function setup(targetName: string, initialProps: Record<string, unknown> = {}) {
  const graph = create_mutable_graph('test');
  const result = graph.add_node({
    type: 'aws.ecs.service',
    name: targetName,
    properties: { region: 'us-east-1', ...initialProps },
  });
  if (!result.success || !result.node) throw new Error('fixture setup failed');
  return { graph, nodeKey: result.node.id as unknown as string, nodeName: result.node.name };
}

describe('wire_aws_network — Network.Subnet → target', () => {
  it('stamps connected_subnet_names when subnet is on edge.source', () => {
    const { graph, nodeKey, nodeName } = setup('svc');
    const nodes: CardNodeInput[] = [
      { id: 'sn', type: 'block', data: { iceType: 'Network.Subnet' } },
      { id: 'svc', type: 'block', data: { iceType: 'Compute.Container' } },
    ];
    const edges: CardEdgeInput[] = [{ id: 'e1', source: 'sn', target: 'svc' }];
    const card_id_to_name = new Map<string, string>([
      ['sn', 'app-subnet'],
      ['svc', nodeName],
    ]);

    wire_aws_network(edges, nodes, card_id_to_name, graph);

    const props = graph.nodes.get(nodeKey as any)!.properties as Record<string, unknown>;
    expect(props.connected_subnet_names).toEqual(['app-subnet']);
  });

  it('also handles reverse direction (subnet on edge.target)', () => {
    const { graph, nodeKey, nodeName } = setup('svc');
    const nodes: CardNodeInput[] = [
      { id: 'svc', type: 'block', data: { iceType: 'Compute.Container' } },
      { id: 'sn', type: 'block', data: { iceType: 'Network.Subnet' } },
    ];
    const edges: CardEdgeInput[] = [{ id: 'e1', source: 'svc', target: 'sn' }];
    const card_id_to_name = new Map<string, string>([
      ['sn', 'app-subnet'],
      ['svc', nodeName],
    ]);

    wire_aws_network(edges, nodes, card_id_to_name, graph);

    const props = graph.nodes.get(nodeKey as any)!.properties as Record<string, unknown>;
    expect(props.connected_subnet_names).toEqual(['app-subnet']);
  });

  it('accumulates multiple subnets and dedupes', () => {
    const { graph, nodeKey, nodeName } = setup('svc', { connected_subnet_names: ['already-here'] });
    const nodes: CardNodeInput[] = [
      { id: 'sn1', type: 'block', data: { iceType: 'Network.Subnet' } },
      { id: 'sn2', type: 'block', data: { iceType: 'Network.Subnet' } },
      { id: 'sn3', type: 'block', data: { iceType: 'Network.Subnet' } },
      { id: 'svc', type: 'block', data: { iceType: 'Compute.Container' } },
    ];
    const edges: CardEdgeInput[] = [
      { id: 'e1', source: 'sn1', target: 'svc' },
      { id: 'e2', source: 'sn2', target: 'svc' },
      { id: 'e3', source: 'sn3', target: 'svc' },
      { id: 'e4', source: 'sn2', target: 'svc' }, // duplicate
    ];
    const card_id_to_name = new Map<string, string>([
      ['sn1', 'subnet-a'],
      ['sn2', 'subnet-b'],
      ['sn3', 'subnet-c'],
      ['svc', nodeName],
    ]);

    wire_aws_network(edges, nodes, card_id_to_name, graph);

    const props = graph.nodes.get(nodeKey as any)!.properties as Record<string, unknown>;
    expect(props.connected_subnet_names).toEqual(['already-here', 'subnet-a', 'subnet-b', 'subnet-c']);
  });
});

describe('wire_aws_network — Network.SecurityGroup → target', () => {
  it('stamps connected_security_group_names', () => {
    const { graph, nodeKey, nodeName } = setup('svc');
    const nodes: CardNodeInput[] = [
      { id: 'sg', type: 'block', data: { iceType: 'Network.SecurityGroup' } },
      { id: 'svc', type: 'block', data: { iceType: 'Compute.Container' } },
    ];
    const edges: CardEdgeInput[] = [{ id: 'e1', source: 'sg', target: 'svc' }];
    const card_id_to_name = new Map<string, string>([
      ['sg', 'web-sg'],
      ['svc', nodeName],
    ]);

    wire_aws_network(edges, nodes, card_id_to_name, graph);

    const props = graph.nodes.get(nodeKey as any)!.properties as Record<string, unknown>;
    expect(props.connected_security_group_names).toEqual(['web-sg']);
  });
});

describe('wire_aws_network — skips', () => {
  it('skips edges where neither end is a network primitive', () => {
    const { graph, nodeKey, nodeName } = setup('svc');
    const nodes: CardNodeInput[] = [
      { id: 'a', type: 'block', data: { iceType: 'Compute.Container' } },
      { id: 'b', type: 'block', data: { iceType: 'Database.PostgreSQL' } },
    ];
    const edges: CardEdgeInput[] = [{ id: 'e1', source: 'a', target: 'b' }];
    const card_id_to_name = new Map<string, string>([
      ['a', nodeName],
      ['b', 'db'],
    ]);

    wire_aws_network(edges, nodes, card_id_to_name, graph);
    const props = graph.nodes.get(nodeKey as any)!.properties as Record<string, unknown>;
    expect(props.connected_subnet_names).toBeUndefined();
    expect(props.connected_security_group_names).toBeUndefined();
  });

  it('skips subnet → VPC edges (Network.VPC is not a target for the wiring pass)', () => {
    const { graph, nodeKey, nodeName } = setup('svc');
    const nodes: CardNodeInput[] = [
      { id: 'vpc', type: 'block', data: { iceType: 'Network.VPC' } },
      { id: 'sn', type: 'block', data: { iceType: 'Network.Subnet' } },
    ];
    const edges: CardEdgeInput[] = [{ id: 'e1', source: 'sn', target: 'vpc' }];
    const card_id_to_name = new Map<string, string>([
      ['sn', 'subnet-a'],
      ['vpc', nodeName],
    ]);

    wire_aws_network(edges, nodes, card_id_to_name, graph);
    const props = graph.nodes.get(nodeKey as any)!.properties as Record<string, unknown>;
    expect(props.connected_subnet_names).toBeUndefined();
  });
});

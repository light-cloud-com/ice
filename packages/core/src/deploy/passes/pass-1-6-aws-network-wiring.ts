/**
 * Pass 1.6 — AWS Network.Subnet / Network.SecurityGroup → target block wiring.
 *
 * Canvas blocks that need an AWS subnet/SG (Compute.Container, Compute.Worker,
 * Database.{PostgreSQL,MySQL,MongoDB,Redis,DynamoDB}, Network.LoadBalancer)
 * traditionally got those IDs by the operator pasting raw `subnet-…` / `sg-…`
 * strings into a properties field. With A1 the canvas can now declare
 * Network.Subnet and Network.SecurityGroup blocks; this pass propagates the
 * block names onto target compute / data / network blocks as
 * `connected_subnet_names[]` and `connected_security_group_names[]`.
 *
 * The downstream AWS handlers (e.g. `ecs_handler`) then resolve those names
 * to the actual `subnet-…` / `sg-…` IDs at dispatch time via DescribeSubnets /
 * DescribeSecurityGroups filtered by `tag:Name`. Each ICE-deployed VPC primitive
 * carries `Name=<block-name>` in its tags (see `aws/handlers/{vpc,subnet,security-group}.ts`).
 *
 * The pass is additive — operator-supplied `subnets[]` / `security_groups[]`
 * arrays still pass through unchanged, and a handler can prefer them over the
 * canvas-driven names if both are present.
 */

import type { MutableGraph } from '../../graph/mutable-graph';
import type { CardEdgeInput, CardNodeInput } from '../card-translator';

const NETWORK_PROVIDERS = new Set(['Network.Subnet', 'Network.SecurityGroup', 'Network.VPC']);

function ice_type(node: CardNodeInput): string {
  return (node.data?.iceType as string) || '';
}

function push_unique(arr: string[], value: string): void {
  if (!arr.includes(value)) arr.push(value);
}

export function wire_aws_network(
  edges: CardEdgeInput[],
  nodes: CardNodeInput[],
  card_id_to_name: Map<string, string>,
  graph: MutableGraph,
): void {
  for (const edge of edges) {
    const src = nodes.find((n) => n.id === edge.source);
    const dst = nodes.find((n) => n.id === edge.target);
    if (!src || !dst) continue;
    const srcType = ice_type(src);
    const dstType = ice_type(dst);

    // Identify which end of the edge is the network primitive.
    let netNode: CardNodeInput;
    let target: CardNodeInput;
    if (NETWORK_PROVIDERS.has(srcType)) {
      netNode = src;
      target = dst;
    } else if (NETWORK_PROVIDERS.has(dstType)) {
      netNode = dst;
      target = src;
    } else {
      continue;
    }
    // Network primitives don't carry other network primitives.
    const targetType = ice_type(target);
    if (NETWORK_PROVIDERS.has(targetType)) continue;

    const targetName = card_id_to_name.get(target.id);
    const netName = card_id_to_name.get(netNode.id);
    if (!targetName || !netName) continue;

    const targetGraphNode = graph.get_node_by_name(targetName);
    if (!targetGraphNode) continue;

    const props = targetGraphNode.properties as Record<string, unknown>;
    const netType = ice_type(netNode);
    if (netType === 'Network.VPC') {
      // VPC is a single-value reference, not an array.
      if (!props.connected_vpc_name) props.connected_vpc_name = netName;
      continue;
    }
    const key = netType === 'Network.Subnet' ? 'connected_subnet_names' : 'connected_security_group_names';
    const current = Array.isArray(props[key]) ? (props[key] as string[]) : [];
    push_unique(current, netName);
    props[key] = current;
  }
}

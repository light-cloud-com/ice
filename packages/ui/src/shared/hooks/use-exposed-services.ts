/**
 * useExposedServices Hook
 *
 * Detects the true public entry-point node(s) in the canvas by finding
 * "source" nodes in the traffic graph — nodes that are entry-facing types
 * (WAF, LoadBalancer, CDN, APIGateway, or have a domain) but have NO
 * incoming `connects_to` edges from other nodes.
 *
 * This ensures traffic flows through the correct chain:
 *   Public Traffic → WAF → LB → CDN/Gateway → internal services
 * rather than drawing lines directly to services inside a VPC.
 *
 * Nodes can also opt-in/out explicitly via `data.exposed: true|false`.
 */

import { useMemo } from 'react';
import type { CanvasNode } from '../../features/canvas/components/svg-canvas';

interface EdgeLike {
  source: string;
  target: string;
  data?: { relationship?: string; [key: string]: unknown };
}

interface ExposedServiceInfo {
  /** IDs of all publicly-exposed entry-point nodes */
  nodeIds: string[];
  /** Position for the user silhouette icon (centered above topmost node) */
  userIconPosition: { x: number; y: number } | null;
}

/** Entry-facing iceTypes that can be public entry points */
const ENTRY_TYPES = new Set([
  'Security.WAF',
  'Network.LoadBalancer',
  'Network.CDN',
  'Network.APIGateway',
  'Network.Gateway',
  'Application.StaticSite',
  'Application.SSRSite',
  'Application.Container',
]);

/** Internal/placeholder domains that should NOT count as public */
const INTERNAL_DOMAINS = new Set(['public', 'internal', 'local', 'localhost', 'private']);

function isInternalDomain(domain: string): boolean {
  if (!domain) return true;
  const d = domain.toLowerCase().trim();
  if (INTERNAL_DOMAINS.has(d)) return true;
  if (d.endsWith('.internal') || d.endsWith('.local') || d.endsWith('.private')) return true;
  // Placeholder defaults from blueprints
  if (d === 'pg.internal' || d === 'redis.internal' || d === 'example.com') return true;
  return false;
}

/** iceTypes that are NEVER public entry points (data stores, internal services) */
const NEVER_EXPOSED_TYPES = new Set([
  'Database.PostgreSQL',
  'Database.MySQL',
  'Database.MongoDB',
  'Database.Redis',
  'Database.Firestore',
  'Database.BigTable',
  'Database.Spanner',
  'Database.DynamoDB',
  'Storage.Bucket',
  'Storage.Disk',
  'Storage.FileStore',
  'Messaging.Queue',
  'Messaging.Topic',
  'Messaging.PubSub',
  'Messaging.RabbitMQ',
  'Messaging.SQS',
  'Messaging.SNS',
  'Security.Secret',
  'Security.Key',
  'Security.IAMRole',
  'Security.Policy',
  'Monitoring.Log',
  'Monitoring.Alert',
  'Log.Terminal',
  'Config.Environment',
  'Source.Repository',
  'Application.Worker',
  'Application.CronJob',
]);

/**
 * Determine if a node is a candidate for being publicly exposed.
 * A candidate must be an entry-facing type OR have a real public domain,
 * AND must not be a data store or internal-only service.
 */
function isEntryCandidate(node: CanvasNode): boolean {
  const iceType = (node.data?.iceType as string) || '';

  // Never expose data stores, queues, secrets, workers, etc.
  if (NEVER_EXPOSED_TYPES.has(iceType)) return false;

  // Check for real public domain (not internal placeholders)
  const domain = (node.data?.domain as string) || (node.data?.subdomain as string) || (node.data?.url as string) || '';
  const hasPublicDomain = !!domain && !isInternalDomain(domain);

  return hasPublicDomain || ENTRY_TYPES.has(iceType);
}

/**
 * Determine which nodes are the true public entry points.
 *
 * A node is the public entry point if:
 *   1. data.exposed === true (explicit opt-in), OR
 *   2. It's an entry candidate (has domain / is WAF/LB/CDN/Gateway)
 *      AND has NO incoming `connects_to` edges from any other node
 *      (meaning nothing in the graph routes traffic *to* it — it's a source)
 *
 * A node is excluded if data.exposed === false (explicit opt-out).
 */
function findExposedNodes(nodes: CanvasNode[], edges: EdgeLike[]): CanvasNode[] {
  // Build set of nodes that receive incoming traffic edges
  const hasIncomingTraffic = new Set<string>();
  for (const edge of edges) {
    const rel = edge.data?.relationship;
    if (rel === 'connects_to') {
      hasIncomingTraffic.add(edge.target);
    }
  }

  // Build set of nodes inside private subnets
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const isInsidePrivateSubnet = (node: CanvasNode): boolean => {
    let current: CanvasNode | undefined = node;
    while (current?.parentId) {
      const parent = nodeMap.get(current.parentId);
      if (!parent) break;
      const parentIceType = (parent.data?.iceType as string) || '';
      const visibility = (parent.data?.visibility as string) || '';
      // Inside a private subnet → not exposed
      if (parentIceType === 'Network.Subnet' && visibility === 'private') return true;
      // Inside a public subnet → exposed (stop checking)
      if (parentIceType === 'Network.Subnet' && visibility === 'public') return false;
      current = parent;
    }
    return false;
  };

  return nodes.filter((node) => {
    // Explicit opt-in/out
    if (node.data?.exposed === true) return true;
    if (node.data?.exposed === false) return false;

    // Nodes inside private subnets are never exposed
    if (isInsidePrivateSubnet(node)) return false;

    // Must be an entry candidate
    if (!isEntryCandidate(node)) return false;

    // True entry point = no incoming connects_to edges
    return !hasIncomingTraffic.has(node.id);
  });
}

/**
 * Find first visible nodes reachable from hidden entry points via outgoing edges.
 * Used at Level 1 where networking nodes are hidden but we still want user traffic
 * connected to the first visible services in the chain.
 */
function traceToVisibleNodes(
  hiddenEntryIds: string[],
  allNodes: CanvasNode[],
  visibleNodeIds: Set<string>,
  edges: EdgeLike[],
): CanvasNode[] {
  // Build adjacency from edges (non-containment, outgoing)
  const adj = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.data?.relationship === 'contains') continue;
    const targets = adj.get(edge.source) || [];
    targets.push(edge.target);
    adj.set(edge.source, targets);
  }

  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));
  const result = new Set<string>();

  // BFS from each hidden entry point to find first visible nodes
  for (const startId of hiddenEntryIds) {
    const queue = [startId];
    const visited = new Set<string>();
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      // If this node is visible, it's a target — don't go deeper
      if (current !== startId && visibleNodeIds.has(current)) {
        result.add(current);
        continue;
      }

      // Follow outgoing edges
      for (const next of adj.get(current) || []) {
        if (!visited.has(next)) queue.push(next);
      }
    }
  }

  return Array.from(result)
    .map((id) => nodeMap.get(id)!)
    .filter(Boolean);
}

/**
 * Filter exposed nodes to frontend-only when Block.Frontend containers exist.
 * Public traffic should flow: User → Frontend → Backend (via API Gateway),
 * never directly to backend services.
 */
function filterToFrontend(exposed: CanvasNode[], allNodes: CanvasNode[], edges: EdgeLike[]): CanvasNode[] {
  // Find all Group.Frontend / Block.Frontend container IDs
  const frontendBlockIds = new Set(
    allNodes
      .filter((n) => {
        const iceType = (n.data?.iceType as string) || '';
        return iceType === 'Group.Frontend' || iceType === 'Block.Frontend';
      })
      .map((n) => n.id),
  );

  if (frontendBlockIds.size === 0) return exposed;

  // Find all children of frontend blocks via containment edges
  const frontendNodeIds = new Set<string>();
  for (const edge of edges) {
    if (edge.data?.relationship === 'contains' && frontendBlockIds.has(edge.source)) {
      frontendNodeIds.add(edge.target);
    }
  }
  // Also include the frontend blocks themselves
  for (const id of frontendBlockIds) {
    frontendNodeIds.add(id);
  }

  // Keep only exposed nodes that belong to frontend
  const frontendExposed = exposed.filter((n) => frontendNodeIds.has(n.id));

  // Fall back to all exposed if no frontend nodes found (non-SaaS architectures)
  return frontendExposed.length > 0 ? frontendExposed : exposed;
}

export function useExposedServices(
  visibleNodes: CanvasNode[],
  edges: EdgeLike[],
  allNodes?: CanvasNode[],
): ExposedServiceInfo {
  return useMemo(() => {
    // First: try finding entry points among visible nodes
    let exposed = findExposedNodes(visibleNodes, edges);

    // If no visible entry points but we have all nodes, trace through hidden ones
    if (exposed.length === 0 && allNodes && allNodes.length > visibleNodes.length) {
      const hiddenEntryPoints = findExposedNodes(allNodes, edges).filter(
        (n) => !visibleNodes.some((v) => v.id === n.id),
      );

      if (hiddenEntryPoints.length > 0) {
        const visibleIds = new Set(visibleNodes.map((n) => n.id));
        exposed = traceToVisibleNodes(
          hiddenEntryPoints.map((n) => n.id),
          allNodes,
          visibleIds,
          edges,
        );
      }
    }

    if (exposed.length === 0) {
      return { nodeIds: [], userIconPosition: null };
    }

    // Filter to frontend-only: public traffic connects via frontend, not backend
    exposed = filterToFrontend(exposed, allNodes || visibleNodes, edges);

    const nodeIds = exposed.map((n) => n.id);

    // Find the topmost boundary — check both exposed nodes and any VPC/Subnet containers
    const all = allNodes || visibleNodes;
    const nodeMap = new Map(all.map((n) => [n.id, n]));

    // Collect the top-level containers (VPCs) that contain any canvas content
    let topY = Infinity;
    // Check VPC containers — user traffic icon must be above them
    const vpcNodes = all.filter((n) => {
      const iceType = (n.data?.iceType as string) || '';
      return iceType === 'Network.VPC' || iceType === 'Network.Subnet';
    });

    for (const vpc of vpcNodes) {
      if (vpc.y < topY) topY = vpc.y;
    }

    // Also check exposed nodes themselves
    for (const node of exposed) {
      // Walk up to find root ancestor position
      let current: typeof node | undefined = node;
      while (current?.parentId) {
        const parent = nodeMap.get(current.parentId);
        if (!parent) break;
        current = parent;
      }
      if (current && current.y < topY) topY = current.y;
      if (!current) {
        if (node.y < topY) topY = node.y;
      }
    }

    // Centroid X across exposed nodes
    const centerX = exposed.reduce((sum, n) => sum + n.x + n.width / 2, 0) / exposed.length;

    // Place user icon above all containers and nodes (outside VPC)
    const userIconPosition = {
      x: centerX,
      y: topY - 100,
    };

    return { nodeIds, userIconPosition };
  }, [visibleNodes, edges, allNodes]);
}

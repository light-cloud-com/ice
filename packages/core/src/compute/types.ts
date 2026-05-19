/**
 * Computing Flows Types
 *
 * Self-contained type definitions for the propagation engine.
 * Kept local to avoid cross-package moduleResolution conflicts
 * (@ice/types uses bundler, @ice/core uses NodeNext).
 */

// ─── Minimal node/edge shapes ───────────────────────────────────────────────

export interface PropagationNode {
  id: string;
  type: 'block' | 'resource' | 'container';
  parentId?: string;
  data: Record<string, unknown>;
}

export interface PropagationEdge {
  id: string;
  source: string;
  target: string;
  data?: {
    relationship?: string;
    connectionCategory?: string;
    trafficType?: string;
    port?: number;
    envVarName?: string;
    routeId?: string;
    subdomain?: string;
    [key: string]: unknown;
  };
}

// ─── Patches ────────────────────────────────────────────────────────────────

export interface NodePatch {
  nodeId: string;
  data: Record<string, unknown>;
}

export interface EdgePatch {
  edgeId: string;
  data: Record<string, unknown>;
}

export interface EdgeDeletion {
  edgeId: string;
}

export interface PatchSet {
  nodePatches: NodePatch[];
  edgePatches: EdgePatch[];
  edgeDeletions: EdgeDeletion[];
}

// ─── Rule interfaces ────────────────────────────────────────────────────────

export type PropagationDirection = 'source→target' | 'target→source';

export interface PropagationContext {
  allNodes: PropagationNode[];
  allEdges: PropagationEdge[];
}

export interface PropagationRule {
  label: string;
  source: (iceType: string) => boolean;
  target: (iceType: string) => boolean;
  direction: PropagationDirection;
  compute: (
    sourceNode: PropagationNode,
    targetNode: PropagationNode,
    edge: PropagationEdge,
    ctx: PropagationContext,
  ) => Record<string, unknown> | null;
}

export interface AggregateRule {
  label: string;
  appliesTo: (iceType: string) => boolean;
  compute: (
    node: PropagationNode,
    inboundEdges: { edge: PropagationEdge; sourceNode: PropagationNode }[],
    outboundEdges: { edge: PropagationEdge; targetNode: PropagationNode }[],
    ctx: PropagationContext,
  ) => Record<string, unknown> | null;
}

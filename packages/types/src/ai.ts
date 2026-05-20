/**
 * AI Canvas Operations — Shared Types
 *
 * Defines the operation schema for AI-generated canvas mutations.
 * Each operation maps 1:1 to a cards-slice.ts Redux reducer.
 *
 * Used by:
 * - Backend: validates Claude API output before streaming to frontend
 * - Frontend: defense-in-depth validation + operation executor dispatch
 */

// =============================================================================
// Canvas Operations
// =============================================================================

export interface AddNodeOp {
  op: 'addNode';
  node: {
    id: string;
    type: 'block' | 'resource' | 'container';
    position: { x: number; y: number };
    width?: number;
    height?: number;
    parentId?: string;
    data: Record<string, unknown>;
  };
}

export interface AddEdgeOp {
  op: 'addEdge';
  edge: {
    id: string;
    source: string;
    target: string;
    data?: Record<string, unknown>;
  };
}

export interface UpdateNodeDataOp {
  op: 'updateNodeData';
  nodeId: string;
  data: Record<string, unknown>;
}

export interface UpdateNodePositionOp {
  op: 'updateNodePosition';
  nodeId: string;
  x: number;
  y: number;
}

export interface ResizeNodeOp {
  op: 'resizeNode';
  id: string;
  width: number;
  height: number;
}

export interface ReparentNodeOp {
  op: 'reparentNode';
  nodeId: string;
  parentId: string | null;
}

export interface DeleteNodeOp {
  op: 'deleteNode';
  nodeId: string;
}

export interface DeleteEdgeOp {
  op: 'deleteEdge';
  edgeId: string;
}

export interface UpdateEdgeDataOp {
  op: 'updateEdgeData';
  edgeId: string;
  data: Record<string, unknown>;
}

export interface AutoOrganizeOp {
  op: 'autoOrganize';
}

/**
 * High-level operation: add a resource from the blueprint registry.
 * The executor resolves this to an AddNodeOp via expandBlueprint().
 */
export interface AddBlueprintOp {
  op: 'addBlueprint';
  /** AI-assigned placeholder ID for edge references, e.g. 'ai-n-1' */
  id?: string;
  /** Canonical block type in {Category}.{Resource} format, e.g. 'Database.PostgreSQL' */
  iceType: string;
  /** Optional provider override */
  provider?: string;
  /** Optional custom label */
  label?: string;
  /** Canvas position (defaults to auto-placement if omitted) */
  position?: { x: number; y: number };
  /** Parent container ID (e.g. drop into a group) */
  parentId?: string;
  /** Extra data fields to merge into the node */
  dataOverrides?: Record<string, unknown>;
}

// Discriminated union of all operations
export type AiCanvasOp =
  | AddNodeOp
  | AddEdgeOp
  | UpdateNodeDataOp
  | UpdateNodePositionOp
  | ResizeNodeOp
  | ReparentNodeOp
  | DeleteNodeOp
  | DeleteEdgeOp
  | UpdateEdgeDataOp
  | AutoOrganizeOp
  | AddBlueprintOp;

// =============================================================================
// AI Response Envelope
// =============================================================================

export interface AiClarification {
  question: string;
  options?: string[];
}

export interface AiResponse {
  /** Human-readable explanation of what the AI did and why */
  explanation: string;
  /** Ordered list of canvas operations to execute */
  operations: AiCanvasOp[];
  /** Optional follow-up suggestions */
  suggestions?: string[];
  /** If the AI needs clarification instead of acting */
  clarification?: AiClarification;
}

// =============================================================================
// AI Request (frontend → backend)
// =============================================================================

export interface SerializedCanvasNode {
  id: string;
  type: string;
  iceType: string;
  label: string;
  provider?: string;
  parentId?: string;
  properties: Record<string, unknown>;
}

export interface SerializedCanvasEdge {
  id: string;
  source: string;
  target: string;
  relationship?: string;
}

export interface SerializedCanvas {
  nodes: SerializedCanvasNode[];
  edges: SerializedCanvasEdge[];
  selectedNodeIds: string[];
  availableBlockTypes: string[];
}

export interface AiCanvasIntentRequest {
  intent: string;
  canvasContext: SerializedCanvas;
  cardId: string;
}

// =============================================================================
// SSE Event Types (backend → frontend streaming)
// =============================================================================

export type AiStreamEvent =
  | { type: 'thinking'; status: string }
  | { type: 'operation'; operation: AiCanvasOp }
  | { type: 'explanation'; text: string }
  | { type: 'suggestions'; items: string[] }
  | { type: 'clarification'; clarification: AiClarification }
  | { type: 'error'; message: string }
  | { type: 'done' };

// =============================================================================
// Deploy Diagnosis (AI-Native #2)
// =============================================================================

export interface DiagnoseDeployResource {
  name: string;
  type: string;
  action: string;
  error?: string;
}

export interface DiagnoseDeployRequest {
  error: string;
  resourceResults: DiagnoseDeployResource[];
  canvasContext: SerializedCanvas;
  provider: string;
  region: string;
}

export interface DiagnoseDeployResponse {
  /** Plain-English explanation of what went wrong */
  diagnosis: string;
  /** Bulleted list of specific fix steps */
  suggestedFixes: string[];
  /** Optional canvas operations to apply the fix */
  operations?: AiCanvasOp[];
}

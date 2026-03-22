/**
 * Canvas Serializer for AI Context
 *
 * Converts the active card's Redux state into a compact JSON payload
 * that gets sent as context to the AI model. Strips pixel-level detail
 * (exact positions, sizes) since the AI only needs topology and properties.
 */

import type { RootState } from '../../../store';
import type { SerializedCanvas, SerializedCanvasNode, SerializedCanvasEdge } from '@ice/types';
import { BLOCK_BLUEPRINTS } from '../../../config/blocks';

/** Properties to include in the serialized node (skip noisy internal fields) */
const RELEVANT_PROPERTIES = new Set([
  'iceType',
  'label',
  'provider',
  'behavior',
  'runtime',
  'port',
  'domain',
  'replicas',
  'version',
  'size',
  'memory',
  'cidr',
  'zone',
  'region',
  'repository',
  'image',
  'protocol',
  'description',
  'status',
  'minInstances',
  'maxInstances',
  'scalingMetric',
  'scalingThreshold',
  'estimatedCost',
  'resourceId',
  'blockTypeName',
]);

/** Cached block type list (computed once) */
let _blockTypes: string[] | null = null;

function getAvailableBlockTypes(): string[] {
  if (!_blockTypes) {
    _blockTypes = BLOCK_BLUEPRINTS.map((bp) => bp.blockType);
  }
  return _blockTypes;
}

/**
 * Serialize a node's data, keeping only relevant properties.
 */
function serializeNodeData(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (RELEVANT_PROPERTIES.has(key) && value != null && value !== '') {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Serialize the current canvas state for AI context.
 *
 * @param state - Full Redux root state
 * @returns Compact canvas representation suitable for AI system prompt
 */
export function serializeCanvas(state: RootState): SerializedCanvas {
  const activeCard = state.cards.cards.find((c) => c.id === state.cards.activeCardId);
  const selectedNodeIds = state.selection.selectedNodes;

  if (!activeCard) {
    return {
      nodes: [],
      edges: [],
      selectedNodeIds: [],
      availableBlockTypes: getAvailableBlockTypes(),
    };
  }

  const nodes: SerializedCanvasNode[] = activeCard.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    iceType: (node.data?.iceType as string) || '',
    label: (node.data?.label as string) || node.id,
    ...(node.data?.provider ? { provider: node.data.provider as string } : {}),
    ...(node.parentId ? { parentId: node.parentId } : {}),
    properties: serializeNodeData(node.data || {}),
  }));

  const edges: SerializedCanvasEdge[] = activeCard.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    ...(edge.data?.relationship ? { relationship: edge.data.relationship as string } : {}),
  }));

  return {
    nodes,
    edges,
    selectedNodeIds,
    availableBlockTypes: getAvailableBlockTypes(),
  };
}

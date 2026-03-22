/**
 * Composed Template Expansion Engine
 *
 * Takes a ComposedTemplate and expands each block via expandBlueprint(),
 * then creates inter-block edges. Returns flat CardNode[] + CardEdge[]
 * ready for importToActiveCard.
 */

import type { CardNode, CardEdge, ComposedTemplate } from './types';
import type { Provider } from '@ice/blocks';
import { getBlueprint, expandBlueprint } from '@ice/blocks';

/**
 * Expand a ComposedTemplate into flat CardNode[] + CardEdge[] arrays.
 *
 * Each block in the template is expanded as a single flat resource node.
 * Groups wrap related blocks as organizational containers.
 * Inter-block connections reference the resource nodes directly.
 *
 * @param template - The composed template to expand
 * @param provider - Optional provider filter — triggers variant overrides and stamps providerUnsupported
 */
export function expandComposedTemplate(
  template: ComposedTemplate,
  provider?: Provider,
): { nodes: CardNode[]; edges: CardEdge[] } {
  // Use explicitly passed provider, fall back to the template's default provider
  const resolvedProvider: Provider | undefined = provider ?? (template.provider as Provider | undefined);

  const allNodes: CardNode[] = [];
  const allEdges: CardEdge[] = [];

  // Track node IDs for inter-block wiring
  const blockNodeIds: string[] = [];

  // Build group-to-block index map: blockIndex → groupId
  const blockToGroupId = new Map<number, string>();
  const groupIds: string[] = [];

  // Create group nodes first
  if (template.groups) {
    for (const group of template.groups) {
      const groupId = `tpl-group-${template.id}-${group.subtype.toLowerCase()}-${Date.now()}-${groupIds.length}`;
      groupIds.push(groupId);

      allNodes.push({
        id: groupId,
        type: 'container',
        position: { x: group.position.x, y: group.position.y },
        width: group.width,
        height: group.height,
        data: {
          label: group.label,
          iceType: `Group.${group.subtype}`,
          behavior: 'container',
          status: 'active',
          groupColor: group.color || '#3b82f6',
          folded: false,
        },
      });

      // Map block indices to this group
      for (const blockIdx of group.blockIndices) {
        blockToGroupId.set(blockIdx, groupId);
      }
    }
  }

  for (let blockIdx = 0; blockIdx < template.blocks.length; blockIdx++) {
    const block = template.blocks[blockIdx];
    const blueprint = getBlueprint(block.blockType, resolvedProvider);

    // Check if this block belongs to a group
    const parentGroupId = blockToGroupId.get(blockIdx);

    if (!blueprint) {
      // No blueprint found — create a minimal resource node
      const id = `tpl-${template.id}-${Date.now()}-${blockNodeIds.length}`;
      blockNodeIds.push(id);
      allNodes.push({
        id,
        type: 'resource',
        position: { x: block.position.x, y: block.position.y },
        width: 220,
        height: 56,
        ...(parentGroupId ? { parentId: parentGroupId } : {}),
        data: {
          label: block.label,
          iceType: `Resource.${block.blockType
            .split('-')
            .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
            .join('')}`,
          behavior: 'singleton',
          status: 'active',
          ...block.data,
        },
      });
      continue;
    }

    // Expand the blueprint at the specified position
    const expanded = expandBlueprint(blueprint, {
      position: block.position,
      provider: resolvedProvider,
      parentContainerId: parentGroupId,
    });

    // Override the label if the template specifies one
    const nodeData = { ...expanded.node.data };
    if (block.label) {
      nodeData.label = block.label;
    }
    // Merge any extra data from the template block definition
    if (block.data) {
      Object.assign(nodeData, block.data);
    }

    // Stamp providerUnsupported if the blueprint doesn't support the selected provider
    if (resolvedProvider && !blueprint.providers.includes(resolvedProvider)) {
      nodeData.providerUnsupported = true;
    }

    // Add resource node — parent to group if specified
    const resourceNode: CardNode = {
      id: expanded.node.id,
      type: 'resource',
      position: expanded.node.position,
      width: expanded.node.width,
      height: expanded.node.height,
      data: nodeData,
      ...(parentGroupId
        ? { parentId: parentGroupId }
        : expanded.node.parentId
          ? { parentId: expanded.node.parentId }
          : {}),
    };
    allNodes.push(resourceNode);
    blockNodeIds.push(expanded.node.id);
  }

  // Create group → block containment edges
  if (template.groups) {
    for (const group of template.groups) {
      for (const blockIdx of group.blockIndices) {
        const blockId = blockNodeIds[blockIdx];
        const groupNode = allNodes.find(
          (n) =>
            n.type === 'container' &&
            (n.data?.iceType as string) === `Group.${group.subtype}` &&
            n.data?.label === group.label,
        );
        if (blockId && groupNode) {
          allEdges.push({
            id: `tpl-contain-${template.id}-${groupNode.id}-${blockId}`,
            source: groupNode.id,
            target: blockId,
            data: { relationship: 'contains' },
          });
        }
      }
    }
  }

  // Create inter-block connection edges
  for (let i = 0; i < template.connections.length; i++) {
    const conn = template.connections[i];
    const sourceId = blockNodeIds[conn.fromBlock];
    const targetId = blockNodeIds[conn.toBlock];

    if (!sourceId || !targetId) continue;

    allEdges.push({
      id: `tpl-edge-${template.id}-${i}`,
      source: sourceId,
      target: targetId,
      data: {
        relationship: conn.relationship,
        ...(conn.protocol && { protocol: conn.protocol }),
        ...(conn.port != null && { port: conn.port }),
      },
    });
  }

  return { nodes: allNodes, edges: allEdges };
}

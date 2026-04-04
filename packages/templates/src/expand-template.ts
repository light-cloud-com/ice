/**
 * Composed Template Expansion Engine
 *
 * Takes a ComposedTemplate and expands each block via expandBlueprint(),
 * then creates inter-block edges. Returns flat CardNode[] + CardEdge[]
 * ready for importToActiveCard.
 */

import { getBlueprint, expandBlueprint } from '@ice/blocks';
import type { ComposedTemplate, CardNode, CardEdge } from './types';
import type { Provider } from '@ice/blocks';

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

  // Create group nodes first (parents must appear before children in the array)
  if (template.groups) {
    for (let gi = 0; gi < template.groups.length; gi++) {
      const group = template.groups[gi];
      const groupId = `tpl-group-${template.id}-${group.subtype.toLowerCase()}-${Date.now()}-${groupIds.length}`;
      groupIds.push(groupId);

      // Use explicit iceType if provided (e.g. 'Network.VPC', 'Network.Subnet'),
      // otherwise fall back to the default Group.{subtype} pattern.
      const containerIceType = group.iceType || `Group.${group.subtype}`;

      // If this group has a parent group (e.g. Subnet inside VPC), set parentId
      const parentId = group.parentGroupIndex != null ? groupIds[group.parentGroupIndex] : undefined;

      allNodes.push({
        id: groupId,
        type: 'container',
        position: { x: group.position.x, y: group.position.y },
        width: group.width,
        height: group.height,
        ...(parentId ? { parentId } : {}),
        data: {
          label: group.label,
          iceType: containerIceType,
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
    const blueprint = getBlueprint(block.iceType, resolvedProvider);

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
          name: block.label,
          iceType: block.iceType,
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

    // Override the name if the template specifies one
    const nodeData = { ...expanded.node.data };
    if (block.label) {
      nodeData.name = block.label;
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

  // Create containment edges (group → block AND group → child group)
  if (template.groups) {
    for (let gi = 0; gi < template.groups.length; gi++) {
      const group = template.groups[gi];
      const groupNodeId = groupIds[gi];

      // Group → block containment edges
      for (const blockIdx of group.blockIndices) {
        const blockId = blockNodeIds[blockIdx];
        if (blockId && groupNodeId) {
          allEdges.push({
            id: `tpl-contain-${template.id}-${groupNodeId}-${blockId}`,
            source: groupNodeId,
            target: blockId,
            data: { relationship: 'contains' },
          });
        }
      }

      // Group → child group containment edges (VPC → Subnet nesting)
      if (group.parentGroupIndex != null) {
        const parentGroupNodeId = groupIds[group.parentGroupIndex];
        if (parentGroupNodeId && groupNodeId) {
          allEdges.push({
            id: `tpl-contain-${template.id}-${parentGroupNodeId}-${groupNodeId}`,
            source: parentGroupNodeId,
            target: groupNodeId,
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

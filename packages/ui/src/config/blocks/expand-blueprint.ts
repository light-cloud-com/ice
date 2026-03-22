/**
 * Blueprint Expansion Engine — Flat Cards
 *
 * Pure function that takes a BlockBlueprint + drop position and returns
 * a single flat resource CardNode ready for Redux dispatch.
 */

import type { BlockBlueprint, ExpandedBlueprint, Provider } from './types';
import {
  computeCompactNodeHeight,
  computeCompactNodeWidth,
} from '@ice/ui/canvas/components/nodes/svg-compact-node';

// =============================================================================
// ID generation
// =============================================================================

let _counter = 0;

function uniqueId(): string {
  return `node-${Date.now()}-${_counter++}`;
}

// =============================================================================
// expandBlueprint
// =============================================================================

export interface ExpandBlueprintOptions {
  /** Canvas drop position */
  position: { x: number; y: number };
  /** Optional provider filter — triggers variant overrides */
  provider?: Provider | 'all';
  /** Optional parent container ID (e.g., dropping into a group) */
  parentContainerId?: string;
}

/**
 * Expand a BlockBlueprint into a single flat resource node.
 *
 * This is a **pure function** (aside from timestamp-based ID generation).
 * No Redux, no DOM — just data in, data out.
 */
export function expandBlueprint(
  blueprint: BlockBlueprint,
  options: ExpandBlueprintOptions
): ExpandedBlueprint {
  const { position, provider, parentContainerId } = options;

  // --- Resolve provider variant overrides ---
  const resolvedProvider = provider && provider !== 'all' ? provider : undefined;
  const variant = resolvedProvider
    ? blueprint.providerVariants?.find((v) => v.provider === resolvedProvider)
    : undefined;

  // --- Merge node data ---
  const nodeId = uniqueId();
  const mergedData: Record<string, unknown> = {
    ...blueprint.nodeData,
    ...(variant?.dataOverrides || {}),
    label: blueprint.name,
    blockTypeName: blueprint.name,
    resourceId: blueprint.resourceId,
    status: 'active',
  };

  // Inject provider field if a specific provider was selected
  if (resolvedProvider) {
    mergedData.provider = resolvedProvider;
  }

  // Log terminal nodes need larger dimensions for the terminal UI
  const iceType = mergedData.iceType as string | undefined;
  const isLogNode = iceType?.startsWith('Log.') || iceType === 'Observability.Logs';
  const width = isLogNode ? 400 : computeCompactNodeWidth(false);
  const height = isLogNode ? 240 : computeCompactNodeHeight(mergedData, false);

  return {
    node: {
      id: nodeId,
      type: 'resource',
      position: { x: position.x, y: position.y },
      width,
      height,
      data: mergedData,
      ...(parentContainerId ? { parentId: parentContainerId } : {}),
    },
  };
}

/**
 * Blueprint Expansion Engine — Flat Cards
 *
 * Pure function that takes a BlockBlueprint + drop position and returns
 * a single flat resource CardNode ready for Redux dispatch.
 */

import type { BlockBlueprint, ExpandedBlueprint, Provider } from './types';

// ─── Inline node dimension constants (from svg-compact-node) ────────────────
const CARD_PY = 10;
const HEADER_H = 36;
const META_LINE_H = 16;
const STATUS_LINE_H = 16;
const PAD_BOTTOM = 10;
const CARD_WIDTH = 220;
const RENAMED_SUBTITLE_H = 14;
const SCALING_ROW_H = 22;
const PIPELINE_ROW_H = 18;

function computeCompactNodeHeight(data: Record<string, unknown>, _isBlock: boolean, hasPipeline = false): number {
  const repo = data.repository || data.github || data.repo || '';
  const domain = data.domain || data.subdomain || data.url || '';
  const image = data.image || '';
  const size = data.size || '';
  const storage = data.storage || '';
  const cost = data.estimatedCost || '';
  const status = data.status || '';

  const blockTypeName = (data.blockTypeName as string) || '';
  const label = (data.label as string) || '';
  const isRenamed = blockTypeName && label && label !== blockTypeName;
  const hasScaling = data.minInstances != null || data.maxInstances != null;

  const metaCount = (repo ? 1 : 0) + (domain ? 1 : 0) + (image ? 1 : 0);
  const hasHardware = !!(size || storage);
  const hasStatusLine = !!(status || cost);
  const metaGap = metaCount > 0 || hasHardware || hasScaling || hasPipeline ? 6 : 0;

  const h =
    CARD_PY +
    HEADER_H +
    metaGap +
    (isRenamed ? RENAMED_SUBTITLE_H : 0) +
    metaCount * META_LINE_H +
    (hasHardware ? META_LINE_H : 0) +
    (hasScaling ? SCALING_ROW_H : 0) +
    (hasPipeline ? PIPELINE_ROW_H : 0) +
    (hasStatusLine ? STATUS_LINE_H : 0) +
    PAD_BOTTOM;
  return Math.max(h, 56);
}

function computeCompactNodeWidth(_isBlock: boolean): number {
  return CARD_WIDTH;
}

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

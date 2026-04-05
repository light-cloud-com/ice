/**
 * Blueprint Expansion Engine — Flat Cards
 *
 * Pure function that takes a BlockBlueprint + drop position and returns
 * a single flat resource CardNode ready for Redux dispatch.
 */

import type { BlockBlueprint, ExpandedBlueprint, Provider } from './types';
import { HIGH_LEVEL_CATEGORIES, type HighLevelProperty } from '@ice/core/resources';

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
// Schema lookup — resolve properties by resourceId
// =============================================================================

function getResourceProperties(resourceId: string): HighLevelProperty[] {
  for (const cat of HIGH_LEVEL_CATEGORIES) {
    for (const res of cat.resources) {
      if (res.id === resourceId) return res.properties;
    }
  }
  return [];
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
export function expandBlueprint(blueprint: BlockBlueprint, options: ExpandBlueprintOptions): ExpandedBlueprint {
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
    name: blueprint.name,
    blockTypeName: blueprint.name,
    resourceId: blueprint.resourceId,
    status: 'active',
  };

  // Inject provider field if a specific provider was selected
  if (resolvedProvider) {
    mergedData.provider = resolvedProvider;
  }

  // Auto-resolve defaults from schema for ALL properties.
  // For select/optionDetails: pick the first provider-matching option.
  // For select/options: pick the schema default or first option.
  // For any property with a default: fill it if missing.
  if (blueprint.resourceId) {
    const props = getResourceProperties(blueprint.resourceId);
    for (const prop of props) {
      const currentVal = mergedData[prop.name];
      const isMissing = currentVal === undefined || currentVal === null || currentVal === '';

      // Select with optionDetails (provider-filtered)
      if (prop.type === 'select' && prop.optionDetails && prop.optionDetails.length > 0) {
        const providerOptions = resolvedProvider
          ? prop.optionDetails.filter((od) => od.provider === resolvedProvider || !od.provider)
          : prop.optionDetails;

        if (providerOptions.length === 0) continue;

        if (isMissing) {
          const defaultOpt = prop.default
            ? providerOptions.find((o) => o.value === prop.default)
            : undefined;
          mergedData[prop.name] = defaultOpt?.value ?? providerOptions[0]!.value;
        } else if (resolvedProvider) {
          // Replace wrong-provider value
          const validValues = new Set(providerOptions.map((o) => o.value));
          if (!validValues.has(currentVal as string)) {
            mergedData[prop.name] = providerOptions[0]!.value;
          }
        }
        continue;
      }

      // Select with simple options array
      if (prop.type === 'select' && prop.options && prop.options.length > 0) {
        if (isMissing) {
          mergedData[prop.name] = (prop.default as string) ?? prop.options[0]!;
        }
        continue;
      }

      // Any property with a default value
      if (isMissing && prop.default !== undefined) {
        mergedData[prop.name] = prop.default;
      }
    }
  }

  // Log terminal nodes need larger dimensions for the terminal UI
  const iceType = mergedData.iceType as string | undefined;
  const isLogNode = iceType === 'Monitoring.Terminal' || iceType === 'Monitoring.Log';
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

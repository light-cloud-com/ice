/**
 * Pure size-computation helpers for the canvas's `nodes → canvasNodes` pipeline.
 *
 * `computeNodeSizes` dispatches over iceType to pick the right width/height
 * trio (compact / custom-domain / private-network), then folds in the
 * folded-state short-circuits so callers get visually-correct dimensions:
 *
 *   - Custom Domain + Private Network NEVER collapse to a 36/38px folded
 *     pill — folding them would hide the route slots which are the entire
 *     point of the block. Their `expandedHeight` and `visualHeight` both
 *     equal `defaultHeight`, so the rest of the pipeline can't observe the
 *     fold flag for these two iceTypes.
 *   - All other nodes use `Math.max(node.height, defaultHeight)` for
 *     expanded height (caller-stretched containers) and a 36/38px folded
 *     height (group=36, block/resource=38) when `node.data.folded === true`.
 *
 * `toLocalCanvasNode` then projects a Redux-shape node + the precomputed
 * sizes into the canvas's `CanvasNode` (formerly `LocalCanvasNode`) shape,
 * with the verbatim fallbacks the orchestrator's inline reducer used:
 *
 *   - `type` defaults to `'resource'` if the source is missing it.
 *   - `width` is clamped up to `defaultWidth` so the user can't manually
 *     resize a node smaller than its rendered minimum.
 *   - `label` falls back through `data.name → data.label → id`.
 *   - `data.iceType` is always present; missing iceType becomes
 *     `'Resource.Unknown'` (matches the orchestrator's pre-extraction default).
 *   - `parentId` is normalized to `null` instead of `undefined`.
 *
 * Lifted out of the `canvasNodes` useMemo at L425–474 of `svg-canvas.tsx`
 * (rf-canv-5). Pure — no React, no Redux, no module state.
 */

import {
  computeCompactNodeHeight,
  computeCompactNodeWidth,
} from '../components/nodes/compact-node';
import {
  computeCustomDomainHeight,
  computeCustomDomainWidth,
} from '../components/nodes/custom-domain';
import {
  computePrivateNetworkHeight,
  computePrivateNetworkWidth,
} from '../components/nodes/private-network';
import {
  computeCronJobHeight,
  computeCronJobWidth,
} from '../components/nodes/scheduled-task';
import type { CanvasNode } from '../components/types';
import { isGroupContainer, isPrivateNetwork as isPrivateNetworkIce } from './node-classification';

/** Minimal Redux-shape input — `nodes` from the cards slice. */
export interface SizingInputNode {
  id: string;
  type?: 'block' | 'resource' | 'container' | string;
  position?: { x: number; y: number };
  width?: number;
  height?: number;
  parentId?: string | null;
  data?: Record<string, unknown>;
}

/** The four derived size values. */
export interface NodeSizes {
  defaultWidth: number;
  defaultHeight: number;
  expandedHeight: number;
  visualHeight: number;
}

/**
 * Verbatim port of the inline `defaultWidth`/`defaultHeight`/`expandedHeight`/
 * `visualHeight` reducer (svg-canvas.tsx L437–459). `hasPipelineStatus`
 * matches `!!(pipelineNodeStatus[id] && pipelineNodeStatus[id].status !== 'idle')`
 * — the only piece of pipeline state the compact-height helper reads.
 */
export function computeNodeSizes(node: SizingInputNode, hasPipelineStatus: boolean): NodeSizes {
  const iceType = (node.data?.iceType as string) || 'Resource.Unknown';
  const isCustomDomain = iceType === 'Network.CustomDomain';
  const isPrivateNetwork = isPrivateNetworkIce(iceType);
  const isCronJob = iceType === 'Compute.CronJob';
  const isGroup = isGroupContainer(node);
  const isBlock = node.type === 'block';
  const folded = !!node.data?.folded;
  const nodeData = (node.data as Record<string, unknown>) || {};

  const defaultWidth = isCustomDomain
    ? computeCustomDomainWidth()
    : isPrivateNetwork
      ? computePrivateNetworkWidth(node.width || 0)
      : isCronJob
        ? computeCronJobWidth()
        : computeCompactNodeWidth(isBlock || isGroup);
  const defaultHeight = isCustomDomain
    ? computeCustomDomainHeight(nodeData)
    : isPrivateNetwork
      ? computePrivateNetworkHeight(node.height || 0)
      : isCronJob
        ? computeCronJobHeight(nodeData)
        : computeCompactNodeHeight(nodeData, isBlock || isGroup, hasPipelineStatus);

  // Cron, like custom-domain, has dynamic height tied to its task count.
  // We never let folding collapse it to a 38px pill — folding hides the
  // per-task port circles, which are the entire point of the block.
  const expandedHeight =
    isCustomDomain || isPrivateNetwork || isCronJob ? defaultHeight : Math.max(node.height || 0, defaultHeight);
  const visualHeight =
    folded && !isCustomDomain && !isPrivateNetwork && !isCronJob ? (isGroup ? 36 : 38) : expandedHeight;

  return { defaultWidth, defaultHeight, expandedHeight, visualHeight };
}

/**
 * Project a Redux-shape node + its precomputed sizes into the canvas's
 * `CanvasNode` shape. Verbatim port of the return-object at L461–471 of
 * the inline reducer.
 */
export function toLocalCanvasNode(
  node: SizingInputNode,
  _hasPipelineStatus: boolean,
  sizes: NodeSizes,
): CanvasNode {
  const iceType = (node.data?.iceType as string) || 'Resource.Unknown';
  return {
    id: node.id,
    type: (node.type as 'block' | 'resource' | 'container') || 'resource',
    x: node.position?.x || 0,
    y: node.position?.y || 0,
    width: Math.max(node.width || 0, sizes.defaultWidth),
    height: sizes.visualHeight,
    label: (node.data?.name as string) || (node.data?.label as string) || node.id,
    data: { ...(node.data as Record<string, unknown>), iceType },
    parentId: node.parentId || null,
  };
}

/**
 * Pure size-computation helpers for the canvas's `nodes → canvasNodes` pipeline.
 *
 * `computeNodeSizes` dispatches via the schema-shaped `BESPOKE_NODE_SIZING`
 * table to pick the right width/height pair (compact / custom-domain /
 * private-network / cron / …), then folds in the folded-state short-circuits
 * so callers get visually-correct dimensions:
 *
 *   - Bespoke entries with `alwaysExpanded: true` NEVER collapse to the
 *     36/38px folded pill — folding them would hide their dynamic content
 *     (route slots, per-task ports, ingress toggle), which is the entire
 *     point of the block. `expandedHeight` and `visualHeight` both equal
 *     `defaultHeight`, so the rest of the pipeline can't observe the fold
 *     flag for these iceTypes.
 *   - All other nodes use `Math.max(node.height, defaultHeight)` for
 *     expanded height (caller-stretched containers) and a 36/38px folded
 *     height (group=36, block/resource=38) when `node.data.folded === true`.
 *
 * Cardinal rule: dispatch reads the schema-shaped table generically — NO
 * `if (iceType === 'X')` branches in this file. New bespoke sizing is
 * added by registering a table entry.
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

import { isGroupContainer } from './node-classification';
import { computeCompactNodeHeight, computeCompactNodeWidth } from '../components/nodes/compact-node';
import { computeCustomDomainHeight, computeCustomDomainWidth } from '../components/nodes/custom-domain';
import { computePrivateNetworkHeight, computePrivateNetworkWidth } from '../components/nodes/private-network';
import { computeCronJobHeight, computeCronJobWidth } from '../components/nodes/scheduled-task';
import type { CanvasNode } from '../components/types';

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
 * Sizing contract for a bespoke block renderer. `width`/`height` close
 * over the renderer's own dynamic state (route count, task count, etc.);
 * `alwaysExpanded: true` opts out of folding so the block can't collapse
 * to a pill that hides its dynamic content.
 */
export interface BespokeSizingEntry {
  width: (node: SizingInputNode, nodeData: Record<string, unknown>) => number;
  height: (node: SizingInputNode, nodeData: Record<string, unknown>) => number;
  alwaysExpanded: boolean;
}

/**
 * Schema-shaped table of bespoke node sizing. The dispatcher iterates
 * this generically — no iceType branches. Adding a new bespoke
 * renderer's sizing rules adds an entry; this file stays unchanged.
 */
export const BESPOKE_NODE_SIZING: Record<string, BespokeSizingEntry> = {
  'Network.CustomDomain': {
    width: () => computeCustomDomainWidth(),
    height: (_node, nodeData) => computeCustomDomainHeight(nodeData),
    alwaysExpanded: true,
  },
  'Network.PrivateNetwork': {
    width: (node) => computePrivateNetworkWidth(node.width || 0),
    height: (node) => computePrivateNetworkHeight(node.height || 0),
    alwaysExpanded: true,
  },
  'Compute.CronJob': {
    width: () => computeCronJobWidth(),
    height: (_node, nodeData) => computeCronJobHeight(nodeData),
    alwaysExpanded: true,
  },
};

/**
 * Verbatim port of the inline `defaultWidth`/`defaultHeight`/`expandedHeight`/
 * `visualHeight` reducer (svg-canvas.tsx L437–459). `hasPipelineStatus`
 * matches `!!(pipelineNodeStatus[id] && pipelineNodeStatus[id].status !== 'idle')`
 * — the only piece of pipeline state the compact-height helper reads.
 */
export function computeNodeSizes(node: SizingInputNode, hasPipelineStatus: boolean): NodeSizes {
  const iceType = (node.data?.iceType as string) || 'Resource.Unknown';
  const isGroup = isGroupContainer(node);
  const isBlock = node.type === 'block';
  const folded = !!node.data?.folded;
  const nodeData = (node.data as Record<string, unknown>) || {};

  const bespoke = BESPOKE_NODE_SIZING[iceType];
  const defaultWidth = bespoke ? bespoke.width(node, nodeData) : computeCompactNodeWidth(isBlock || isGroup);
  const defaultHeight = bespoke
    ? bespoke.height(node, nodeData)
    : computeCompactNodeHeight(nodeData, isBlock || isGroup, hasPipelineStatus);

  // `alwaysExpanded` blocks ignore caller-stretched height AND folding —
  // their height is whatever the bespoke renderer says, full stop.
  const alwaysExpanded = bespoke?.alwaysExpanded ?? false;
  const expandedHeight = alwaysExpanded ? defaultHeight : Math.max(node.height || 0, defaultHeight);
  const visualHeight = folded && !alwaysExpanded ? (isGroup ? 36 : 38) : expandedHeight;

  return { defaultWidth, defaultHeight, expandedHeight, visualHeight };
}

/**
 * Project a Redux-shape node + its precomputed sizes into the canvas's
 * `CanvasNode` shape. Verbatim port of the return-object at L461–471 of
 * the inline reducer.
 */
export function toLocalCanvasNode(node: SizingInputNode, _hasPipelineStatus: boolean, sizes: NodeSizes): CanvasNode {
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

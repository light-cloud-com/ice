/**
 * rf-cmove-2 — Pure runner for `handleToggleFold`.
 *
 * On UNFOLD: expands the unfolded node itself to encompass children
 * (or recovers stored expanded height when no children), then walks
 * ancestors via `walkAncestorsAndExpand`. Returns the position+size
 * update payloads. Folding is a no-op beyond the slice toggle (handled
 * by the caller), so this returns `null` for the unfold case as well.
 *
 * Behavior is preserved verbatim from rf-canv-25b's `handleToggleFold`.
 *
 * The slice toggle (`toggleCardNodeFold(nodeId)`) is dispatched FIRST
 * by the caller, BEFORE this runner — including for missing-node ids.
 */

import {
  MIN_CONTAINER_WIDTH,
  MIN_CONTAINER_HEIGHT,
} from '../../../../config/canvas-constants';
import {
  CONTAINER_HEADER_H,
  CONTAINER_PAD,
} from '../../utils/container-bounds';
import { computeCompactNodeHeight } from '../../components/nodes/compact-node';
import { isGroupOrBlock } from '../../utils/node-classification';
import { walkAncestorsAndExpand } from './ancestor-expansion';
import type { CanvasNode } from '../../components/types';
import type { CardNode } from '../../../../store/slices/cards-slice';
import type { PositionUpdate, SizeUpdate } from './types';

/**
 * Result of an unfold pass. Empty arrays mean "nothing to dispatch."
 *
 * The orchestrator's original logic guards both dispatches behind
 * `positionUpdates.length > 0` for the position dispatch (the size
 * dispatch loops the array regardless). We mirror that contract — the
 * caller checks `result.positionUpdates.length > 0` to decide whether
 * to dispatch the position action.
 */
export interface ToggleFoldUnfoldResult {
  positionUpdates: PositionUpdate[];
  sizeUpdates: SizeUpdate[];
}

/**
 * Whether `handleToggleFold` needs to compute the unfold-time expansion.
 *
 * Returns `null` when:
 *   - The node id isn't in `visibleNodes` (caller dispatched the slice
 *     toggle, then early-returned).
 *   - The node was previously UNFOLDED (now folding) → no expansion
 *     work needed beyond the slice toggle.
 *
 * Returns the resolved node + wasFolded flag otherwise (caller will
 * dispatch the toggle and then call `runUnfoldExpansion`).
 */
export function resolveToggleFoldDecision(args: {
  nodeId: string;
  visibleNodes: CanvasNode[];
}): { node: CanvasNode; wasFolded: boolean } | null {
  const { nodeId, visibleNodes } = args;
  const node = visibleNodes.find((n) => n.id === nodeId);
  if (!node) return null;
  const wasFolded = !!node.data?.folded;
  return { node, wasFolded };
}

/**
 * Compute the unfolded-self bounds. With children, expands per-edge to
 * encompass children's bbox (using canvasNodes — NOT visibleNodes — so
 * folded ancestors don't corrupt the math). Without children, falls
 * back to `Math.max(reduxNode.height, computeCompactNodeHeight, MIN)`.
 *
 * Returns the new {x, y, width, height} for the unfolded node.
 */
function computeUnfoldedSelfBounds(args: {
  node: CanvasNode;
  canvasNodes: CanvasNode[];
  nodes: CardNode[];
}): { selfX: number; selfY: number; selfW: number; selfH: number } {
  const { node, canvasNodes, nodes } = args;
  const childrenOfNode = canvasNodes.filter((n) => n.parentId === node.id);

  let selfW = node.width;
  let selfH = node.height; // folded visual height (36px) at this point
  let selfX = node.x;
  let selfY = node.y;

  if (childrenOfNode.length > 0) {
    let cMinX = Infinity,
      cMinY = Infinity;
    let cMaxR = -Infinity,
      cMaxB = -Infinity;

    for (const child of childrenOfNode) {
      cMinX = Math.min(cMinX, child.x);
      cMinY = Math.min(cMinY, child.y);
      cMaxR = Math.max(cMaxR, child.x + child.width);
      cMaxB = Math.max(cMaxB, child.y + child.height);
    }

    const overL = selfX + CONTAINER_PAD - cMinX;
    if (overL > 0) {
      selfX -= overL;
      selfW += overL;
    }

    const overT = selfY + CONTAINER_PAD + CONTAINER_HEADER_H - cMinY;
    if (overT > 0) {
      selfY -= overT;
      selfH += overT;
    }

    const overR = cMaxR - (selfX + selfW - CONTAINER_PAD);
    if (overR > 0) {
      selfW += overR;
    }

    const overB = cMaxB - (selfY + selfH - CONTAINER_PAD);
    if (overB > 0) {
      selfH += overB;
    }

    selfW = Math.max(MIN_CONTAINER_WIDTH, selfW);
    selfH = Math.max(MIN_CONTAINER_HEIGHT, selfH);
  } else {
    // No children — recover stored expanded height from Redux.
    const reduxNode = nodes.find((n) => n.id === node.id);
    const defaultH = computeCompactNodeHeight(
      node.data as Record<string, unknown>,
      isGroupOrBlock(node),
      false,
    );
    selfH = Math.max(reduxNode?.height || 0, defaultH, MIN_CONTAINER_HEIGHT);
  }

  return { selfX, selfY, selfW, selfH };
}

/**
 * Pure runner — runs the UNFOLD-time expansion and returns the
 * position/size update payloads. Caller has already dispatched the slice
 * toggle and confirmed `wasFolded === true`.
 */
export function runUnfoldExpansion(args: {
  node: CanvasNode;
  canvasNodes: CanvasNode[];
  visibleNodes: CanvasNode[];
  nodes: CardNode[];
}): ToggleFoldUnfoldResult {
  const { node, canvasNodes, visibleNodes, nodes } = args;

  const positionUpdates: PositionUpdate[] = [];
  const sizeUpdates: SizeUpdate[] = [];

  // Step 1: resize the unfolded node itself.
  const { selfX, selfY, selfW, selfH } = computeUnfoldedSelfBounds({ node, canvasNodes, nodes });

  if (selfX !== node.x || selfY !== node.y) {
    positionUpdates.push({ id: node.id, position: { x: selfX, y: selfY } });
  }
  if (selfW !== node.width || selfH !== node.height) {
    sizeUpdates.push({ id: node.id, width: selfW, height: selfH });
  }

  // Step 2: walk ancestors and expand them to fit the resized node.
  if (node.parentId) {
    walkAncestorsAndExpand({
      node,
      visibleNodes,
      positionUpdates,
      sizeUpdates,
      // siblingPosLookup is unused for the override branch below, but
      // kept identity-stable so the helper's contract (always called
      // for the non-override path) holds. Override targets the unfolded
      // node — its visibleNodes entry still has folded height, so all
      // four bounds (x/y/w/h) need substitution.
      siblingPosLookup: (sib) => ({ x: sib.x, y: sib.y }),
      siblingBoundsOverride: {
        id: node.id,
        bounds: { x: selfX, y: selfY, width: selfW, height: selfH },
      },
    });
  }

  return { positionUpdates, sizeUpdates };
}

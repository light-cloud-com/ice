/**
 * rf-cmove-1 — Pure ancestor-expansion helper.
 *
 * Encapsulates the per-edge child-overflow → parent-grow walk-step shared
 * between `handleNodeMove` (rf-canv-25b) and `handleToggleFold` (rf-canv-25b).
 * Each handler still owns its own outer `while (current.parentId)` loop
 * and decides whether to use already-pushed positionUpdates (move) or the
 * just-computed self-bounds override (toggle-fold) — the per-step shape
 * (compute children bbox, apply overflow per-edge, mutate the
 * positionUpdates/sizeUpdates arrays) is identical.
 *
 * Behavior is preserved verbatim from rf-canv-25b. DO NOT consolidate to
 * `expandToFitChildren` from rf-canv-4 — the four ancestor-expansion sites
 * have subtly different rules per blueprint risk #2.
 */

import { MIN_CONTAINER_WIDTH, MIN_CONTAINER_HEIGHT } from '../../../../config/canvas-constants';
import { CONTAINER_HEADER_H, CONTAINER_PAD } from '../../utils/container-bounds';
import type { PositionUpdate, SizeUpdate } from './types';
import type { CanvasNode } from '../../components/types';

/**
 * Override the bounds of one sibling during the bbox computation.
 *
 * `handleToggleFold` uses this to substitute the just-computed self
 * (selfX/Y/W/H) for the unfolded node — the visibleNodes entry still
 * carries the folded 38px height, so reading `sib.x/y/width/height`
 * directly would corrupt the per-edge overflow math. `handleNodeMove`
 * doesn't need an override (it uses positionUpdates lookups instead),
 * so it passes `undefined`.
 */
export interface SiblingBoundsOverride {
  /** Sibling id whose bounds to override. */
  id: string;
  /** Override bounds. */
  bounds: { x: number; y: number; width: number; height: number };
}

/**
 * Read a sibling's effective bounds during the per-step bbox computation.
 *
 * `handleNodeMove` consults the already-pushed positionUpdates list
 * (incremental walk — siblings moved earlier in the same dispatch see
 * their new positions). `handleToggleFold` ignores positionUpdates and
 * applies the self-override unconditionally.
 *
 * Returns the (x, y) coordinates only — sibling width/height are taken
 * from the visibleNodes entry directly (children are never resized
 * during the walk, only the moving node is).
 */
export type SiblingPositionLookup = (sibling: CanvasNode) => { x: number; y: number };

/**
 * Read an ancestor's "current" position/size, accounting for any updates
 * already pushed earlier in the walk (so the second-iteration grandparent
 * sees the parent's new px/py/pw/ph instead of its stale visibleNodes
 * value).
 *
 * Both handlers use the same shape: scan positionUpdates / sizeUpdates
 * for an entry matching `parent.id` and fall back to the visibleNodes
 * coords. Lifted into a closure inside the helper to keep the call site
 * compact.
 */
function readAncestorBounds(
  parent: CanvasNode,
  positionUpdates: PositionUpdate[],
  sizeUpdates: SizeUpdate[],
): {
  px: number;
  py: number;
  pw: number;
  ph: number;
  existingPosUpdate?: PositionUpdate;
  existingSizeUpdate?: SizeUpdate;
} {
  const existingPosUpdate = positionUpdates.find((u) => u.id === parent.id);
  const existingSizeUpdate = sizeUpdates.find((u) => u.id === parent.id);
  return {
    px: existingPosUpdate?.position.x ?? parent.x,
    py: existingPosUpdate?.position.y ?? parent.y,
    pw: existingSizeUpdate?.width ?? parent.width,
    ph: existingSizeUpdate?.height ?? parent.height,
    existingPosUpdate,
    existingSizeUpdate,
  };
}

/**
 * Compute the bounding box of all children of `parent`, applying:
 *   - `siblingPosLookup(sib)` for each sibling's position (so move-time
 *     incremental updates flow through).
 *   - `siblingBoundsOverride` for one specific sibling (so unfold-time
 *     just-computed self-bounds replace the folded visibleNodes entry).
 *
 * Returns `undefined` when there are zero children (caller should break
 * the walk — the `!isFinite(childMinX)` check in the original).
 */
function computeChildrenBoundingBox(
  parent: CanvasNode,
  visibleNodes: CanvasNode[],
  siblingPosLookup: SiblingPositionLookup,
  siblingBoundsOverride?: SiblingBoundsOverride,
): { childMinX: number; childMinY: number; childMaxR: number; childMaxB: number } | undefined {
  const siblings = visibleNodes.filter((n) => n.parentId === parent.id);
  let childMinX = Infinity,
    childMinY = Infinity;
  let childMaxR = -Infinity,
    childMaxB = -Infinity;

  for (const sib of siblings) {
    let sx: number;
    let sy: number;
    let sw: number;
    let sh: number;

    if (siblingBoundsOverride && sib.id === siblingBoundsOverride.id) {
      sx = siblingBoundsOverride.bounds.x;
      sy = siblingBoundsOverride.bounds.y;
      sw = siblingBoundsOverride.bounds.width;
      sh = siblingBoundsOverride.bounds.height;
    } else {
      const pos = siblingPosLookup(sib);
      sx = pos.x;
      sy = pos.y;
      sw = sib.width;
      sh = sib.height;
    }

    childMinX = Math.min(childMinX, sx);
    childMinY = Math.min(childMinY, sy);
    childMaxR = Math.max(childMaxR, sx + sw);
    childMaxB = Math.max(childMaxB, sy + sh);
  }

  if (!isFinite(childMinX)) return undefined;
  return { childMinX, childMinY, childMaxR, childMaxB };
}

/**
 * Apply the per-edge child-overflow → parent-grow expansion for ONE
 * ancestor step.
 *
 * Mutates `positionUpdates` / `sizeUpdates` in place when an edge
 * overflows. Returns the new px/py/pw/ph (so the caller can advance
 * `current` to the parent for the next loop iteration) and a `changed`
 * flag (false → walk should NOT continue further; true → ancestor was
 * resized and the loop should advance to grandparent).
 *
 * Returns `undefined` when the parent has no children (caller breaks).
 *
 * NOTE: returning `changed: false` is NOT the same as "stop walking" —
 * the original code unconditionally advances `current = parent` after
 * the per-edge check, even when nothing changed. We mirror that: the
 * caller advances the walk regardless of `changed`.
 */
export function expandAncestorOnce(args: {
  parent: CanvasNode;
  visibleNodes: CanvasNode[];
  positionUpdates: PositionUpdate[];
  sizeUpdates: SizeUpdate[];
  siblingPosLookup: SiblingPositionLookup;
  siblingBoundsOverride?: SiblingBoundsOverride;
}): { changed: boolean; px: number; py: number; pw: number; ph: number } | undefined {
  const { parent, visibleNodes, positionUpdates, sizeUpdates, siblingPosLookup, siblingBoundsOverride } = args;

  const bounds = readAncestorBounds(parent, positionUpdates, sizeUpdates);
  let { px, py, pw, ph } = bounds;
  const { existingPosUpdate, existingSizeUpdate } = bounds;

  const bbox = computeChildrenBoundingBox(parent, visibleNodes, siblingPosLookup, siblingBoundsOverride);
  if (!bbox) return undefined;
  const { childMinX, childMinY, childMaxR, childMaxB } = bbox;

  // Per-edge padding budget. Top edge eats CONTAINER_HEADER_H to leave
  // room for the container chrome.
  const padL = CONTAINER_PAD;
  const padT = CONTAINER_PAD + CONTAINER_HEADER_H;
  const padR = CONTAINER_PAD;
  const padB = CONTAINER_PAD;

  let changed = false;

  // Left overflow: child extends past left edge.
  const overflowL = px + padL - childMinX;
  if (overflowL > 0) {
    px -= overflowL;
    pw += overflowL;
    changed = true;
  }

  // Top overflow: child extends past top edge (HEADER_H accounted for).
  const overflowT = py + padT - childMinY;
  if (overflowT > 0) {
    py -= overflowT;
    ph += overflowT;
    changed = true;
  }

  // Right overflow: child extends past right edge.
  const overflowR = childMaxR - (px + pw - padR);
  if (overflowR > 0) {
    pw += overflowR;
    changed = true;
  }

  // Bottom overflow: child extends past bottom edge.
  const overflowB = childMaxB - (py + ph - padB);
  if (overflowB > 0) {
    ph += overflowB;
    changed = true;
  }

  if (changed) {
    pw = Math.max(MIN_CONTAINER_WIDTH, pw);
    ph = Math.max(MIN_CONTAINER_HEIGHT, ph);

    if (existingPosUpdate) {
      existingPosUpdate.position.x = px;
      existingPosUpdate.position.y = py;
    } else {
      positionUpdates.push({ id: parent.id, position: { x: px, y: py } });
    }

    if (existingSizeUpdate) {
      existingSizeUpdate.width = pw;
      existingSizeUpdate.height = ph;
    } else {
      sizeUpdates.push({ id: parent.id, width: pw, height: ph });
    }
  }

  return { changed, px, py, pw, ph };
}

/**
 * Walk up the parent chain from `node`, applying `expandAncestorOnce`
 * at each step. Stops on (a) no parent, (b) folded ancestor, (c) zero
 * children for the ancestor (`expandAncestorOnce` returns undefined).
 *
 * `siblingPosLookup` and `siblingBoundsOverride` are threaded through
 * unchanged so each handler can plug in its own bbox-reading strategy.
 *
 * Mutates `positionUpdates` and `sizeUpdates` in place.
 */
export function walkAncestorsAndExpand(args: {
  node: CanvasNode;
  visibleNodes: CanvasNode[];
  positionUpdates: PositionUpdate[];
  sizeUpdates: SizeUpdate[];
  siblingPosLookup: SiblingPositionLookup;
  siblingBoundsOverride?: SiblingBoundsOverride;
}): void {
  const { node, visibleNodes, positionUpdates, sizeUpdates, siblingPosLookup, siblingBoundsOverride } = args;
  if (!node.parentId) return;

  let current: CanvasNode = node;
  while (current.parentId) {
    const parent = visibleNodes.find((n) => n.id === current.parentId);
    if (!parent || parent.data?.folded) break;

    const result = expandAncestorOnce({
      parent,
      visibleNodes,
      positionUpdates,
      sizeUpdates,
      siblingPosLookup,
      siblingBoundsOverride,
    });

    if (!result) break;

    current = parent;
  }
}

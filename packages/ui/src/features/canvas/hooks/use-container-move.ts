/**
 * useContainerMove
 *
 * Owns the **drag-time + fold-time half** (rf-canv-25b) of the
 * pre-extraction `useContainerResizing` hook the orchestrator
 * (`svg-canvas.tsx`) used to run inline:
 *
 *   1. `handleNodeMove(id, newX, newY, skipAncestorResize?)` — the
 *      drag handler. Internally:
 *      a) Finds the node, computes deltaX / deltaY from its current
 *         position.
 *      b) Translates the dragged node + ALL hidden/visible descendants
 *         (via `getAllDescendantIds`) by the same delta.
 *      c) **Ancestor-expansion walk** — when `!skipAncestorResize` and
 *         the node has a parent, walks up the parent chain. For each
 *         non-folded ancestor, computes the bounding box of all its
 *         children (using already-pending positionUpdates so the walk
 *         is incremental), then per-edge expands left/top/right/bottom
 *         on overflow. Each side uses its own `CONTAINER_PAD`/
 *         `CONTAINER_HEADER_H` budget; expanded containers are clamped
 *         to `MIN_CONTAINER_WIDTH`/`MIN_CONTAINER_HEIGHT`. Stops on
 *         folded ancestors.
 *      d) **Clamp to expanded parent bounds** (BND-1/BND-3) — after
 *         ancestor expansion, clamps the dragged node into the
 *         (possibly grown) parent's interior. Any clamp delta is
 *         propagated to descendants so their relative offsets stay
 *         intact.
 *      e) Dispatches `updateCardNodePositions` for the position list.
 *         When shift-drag (`skipAncestorResize`) OR the dragged node
 *         has descendants, wraps the payload as
 *         `{ updates, skipClamp: true }` so the slice's child-clamp
 *         second-pass is bypassed (auto-layout uses different padding
 *         than the slice clamp). Dispatches `resizeCardNode` per
 *         expanded ancestor.
 *      f) **Edge detection** — if the dragged node now sits within
 *         30px of any parent edge, calls `setExitingGroupId(parent.id)`
 *         so the orchestrator's exit-indicator overlay lights up. Far
 *         from edge / no parent → `setExitingGroupId(null)`.
 *
 *   2. `handleToggleFold(nodeId)` — the fold/unfold handler. Internally:
 *      a) Always dispatches `toggleCardNodeFold(nodeId)`. Returns early
 *         on a missing node (after the dispatch, so a stale id still
 *         flips the slice flag).
 *      b) If the node was previously folded (i.e. is now unfolding),
 *         expands the unfolded node itself to encompass its children
 *         (via the same per-edge overflow calculation), or — if no
 *         children exist — falls back to `Math.max(reduxNode.height,
 *         computeCompactNodeHeight(...), MIN_CONTAINER_HEIGHT)`. The
 *         self-expansion must use `canvasNodes` (full set), not
 *         `visibleNodes` (which carries the folded 38px height for
 *         folded ancestors), so it sees children at their real
 *         positions.
 *      c) Walks up ancestors and expands each non-folded one to fit
 *         the resized node (similar shape to handleNodeMove's walk —
 *         but uses the just-computed `selfX/Y/W/H` as the moving
 *         node's bounds inside the per-parent bbox).
 *      d) Dispatches `updateCardNodePositions` (no skipClamp wrap —
 *         fold-time updates do go through the slice clamp) +
 *         `resizeCardNode` per ancestor.
 *      e) **Folding** (was-not-folded → now-folded) is a no-op
 *         beyond the slice toggle — children stay where they are and
 *         the slice's compact-height projection at render time hides
 *         them via `hasCollapsedAncestor`.
 *
 * **Per blueprint risk #2** — `setExitingGroupId` is the rf-canv-25b/26
 * coupling point. The state itself stays in the orchestrator
 * (`svg-canvas.tsx` L883: `useState<string | null>(null)`) until rf-
 * canv-26 lifts it into `useDragTargetHighlight` alongside
 * `dragOverGroupId` + `shiftDraggingNodeIds`. This hook receives the
 * setter as a callback prop so the move-half stays loosely coupled to
 * the future highlight-ownership decision.
 *
 * The orchestrator threads in:
 *   - `visibleNodes` — the LOD-filtered, parent-promoted node list used
 *     for the find-self / find-parent / sibling-bbox walks.
 *   - `canvasNodes` — the full (unfiltered) projection used by
 *     `getAllDescendantIds` and by `handleToggleFold`'s self-expansion
 *     children scan, so hidden block children at L1 still translate
 *     and folded ancestors still see real child sizes.
 *   - `nodes` — the raw Redux node list, read by `handleToggleFold` to
 *     recover the stored expanded height when the unfolding node has
 *     no children.
 *   - `getAllDescendantIds` — the orchestrator's pure-walk wrapper that
 *     follows the parentId chain across canvasNodes (NOT visibleNodes,
 *     so hidden L1 children are reached).
 *   - `setExitingGroupId` — the React setState dispatcher for the
 *     exit-indicator overlay group id (see risk #2 above).
 *
 * Behavior is preserved verbatim from the pre-rf-canv-25b inline form.
 * The four ancestor-expansion sites in this codebase
 * (handleNodeMove walk, handleToggleFold walk, plus the two outside
 * this hook in handleDragEnd's reparent branch) have subtly different
 * rules per blueprint risk #2 — DO NOT consolidate to
 * `expandToFitChildren` from rf-canv-4.
 *
 * rf-canv-25b.
 */

import { useCallback } from 'react';
import { useDispatch } from 'react-redux';
import {
  MIN_CONTAINER_WIDTH,
  MIN_CONTAINER_HEIGHT,
} from '../../../config/canvas-constants';
import {
  CONTAINER_HEADER_H,
  CONTAINER_PAD,
} from '../utils/container-bounds';
import {
  updateCardNodePositions,
  resizeCardNode,
  toggleCardNodeFold,
  type CardNode,
} from '../../../store/slices/cards-slice';
import { computeCompactNodeHeight } from '../components/nodes/compact-node';
import { isGroupOrBlock } from '../utils/node-classification';
import type { AppDispatch } from '../../../store';
import type { CanvasNode } from '../components/types';

export interface UseContainerMoveArgs {
  /** LOD-filtered, parent-promoted canvas nodes from the orchestrator. */
  visibleNodes: CanvasNode[];
  /**
   * Full (unfiltered) canvas-shape nodes — needed so
   * `handleToggleFold`'s self-expansion can see children at their real
   * positions (visibleNodes carries the folded 38px height for any
   * folded ancestor, which would corrupt the per-edge overflow math).
   */
  canvasNodes: CanvasNode[];
  /**
   * Raw Redux nodes — read by `handleToggleFold` to recover the stored
   * expanded height of a no-children node on unfold. Typed as `CardNode[]`
   * (from `cards-slice`), the same shape `card.nodes` carries on the
   * orchestrator. The handler reads `.height` only.
   */
  nodes: CardNode[];
  /**
   * Pure-walk wrapper that follows `parentId` across `canvasNodes` —
   * NOT `visibleNodes` — so hidden L1 children translate with their
   * parent on drag.
   */
  getAllDescendantIds: (nodeId: string) => string[];
  /**
   * Setter for the exit-indicator group id. Per blueprint risk #2 the
   * state lives in the orchestrator until rf-canv-26 lifts it into
   * `useDragTargetHighlight`; this hook is intentionally agnostic to
   * who owns it.
   */
  setExitingGroupId: (id: string | null) => void;
}

export interface UseContainerMoveResult {
  /**
   * Drag handler — translates node + descendants, expands ancestors,
   * clamps to expanded parent, dispatches positions/sizes, and updates
   * the exit-indicator group id. `skipAncestorResize` (Shift+drag /
   * reparent mode) skips the ancestor walk + clamp.
   */
  handleNodeMove: (id: string, newX: number, newY: number, skipAncestorResize?: boolean) => void;
  /**
   * Fold/unfold handler — toggles the slice flag, then on UNFOLD
   * expands self to encompass children (or recovers stored expanded
   * height) and walks ancestors. Folding is a no-op beyond the toggle.
   */
  handleToggleFold: (nodeId: string) => void;
}

export function useContainerMove(args: UseContainerMoveArgs): UseContainerMoveResult {
  const { visibleNodes, canvasNodes, nodes, getAllDescendantIds, setExitingGroupId } = args;
  const dispatch = useDispatch<AppDispatch>();

  // Handle moving a node and all its children, then expand ancestor containers.
  // skipAncestorResize: when Shift is held (reparent mode), don't resize the parent container.
  // Uses getAllDescendantIds so hidden block children at L1 also move with their parent.
  const handleNodeMove = useCallback(
    (id: string, newX: number, newY: number, skipAncestorResize?: boolean) => {
      const node = visibleNodes.find((n) => n.id === id);
      if (!node) return;

      const deltaX = newX - node.x;
      const deltaY = newY - node.y;

      // Collect all position updates
      const positionUpdates: Array<{ id: string; position: { x: number; y: number } }> = [];
      const sizeUpdates: Array<{ id: string; width: number; height: number }> = [];

      // 1. Move the dragged node
      positionUpdates.push({ id, position: { x: newX, y: newY } });

      // 2. Move ALL descendants (including hidden children at L1)
      const descendantIds = getAllDescendantIds(id);
      for (const descId of descendantIds) {
        const desc = canvasNodes.find((n) => n.id === descId);
        if (desc) {
          positionUpdates.push({ id: descId, position: { x: desc.x + deltaX, y: desc.y + deltaY } });
        }
      }

      // 3. Expand ancestor containers if child overflows their bounds.
      //    Walk up the parent chain: for each ancestor, check if the moved node
      //    (or its siblings) extend beyond the container. If so, shift position
      //    and increase size directly.
      if (!skipAncestorResize && node.parentId) {
        let currentNode = node;

        while (currentNode.parentId) {
          const parent = visibleNodes.find((n) => n.id === currentNode.parentId);
          if (!parent || parent.data?.folded) break;

          // Get parent's latest state (may have been updated in a previous iteration)
          const existingPosUpdate = positionUpdates.find((u) => u.id === parent.id);
          const existingSizeUpdate = sizeUpdates.find((u) => u.id === parent.id);
          let px = existingPosUpdate?.position.x ?? parent.x;
          let py = existingPosUpdate?.position.y ?? parent.y;
          let pw = existingSizeUpdate?.width ?? parent.width;
          let ph = existingSizeUpdate?.height ?? parent.height;

          // Compute bounding box of ALL children of this parent
          const siblings = visibleNodes.filter((n) => n.parentId === parent.id);
          let childMinX = Infinity,
            childMinY = Infinity;
          let childMaxR = -Infinity,
            childMaxB = -Infinity;

          for (const sib of siblings) {
            // Use updated position if this sibling was moved
            const sibUpdate = positionUpdates.find((u) => u.id === sib.id);
            const sx = sibUpdate?.position.x ?? sib.x;
            const sy = sibUpdate?.position.y ?? sib.y;
            childMinX = Math.min(childMinX, sx);
            childMinY = Math.min(childMinY, sy);
            childMaxR = Math.max(childMaxR, sx + sib.width);
            childMaxB = Math.max(childMaxB, sy + sib.height);
          }

          if (!isFinite(childMinX)) break;

          // Check each edge and expand toward the child
          const padL = CONTAINER_PAD;
          const padT = CONTAINER_PAD + CONTAINER_HEADER_H;
          const padR = CONTAINER_PAD;
          const padB = CONTAINER_PAD;

          let changed = false;

          // Left overflow: child extends past left edge
          const overflowL = px + padL - childMinX;
          if (overflowL > 0) {
            px -= overflowL;
            pw += overflowL;
            changed = true;
          }

          // Top overflow: child extends past top edge
          const overflowT = py + padT - childMinY;
          if (overflowT > 0) {
            py -= overflowT;
            ph += overflowT;
            changed = true;
          }

          // Right overflow: child extends past right edge
          const overflowR = childMaxR - (px + pw - padR);
          if (overflowR > 0) {
            pw += overflowR;
            changed = true;
          }

          // Bottom overflow: child extends past bottom edge
          const overflowB = childMaxB - (py + ph - padB);
          if (overflowB > 0) {
            ph += overflowB;
            changed = true;
          }

          if (changed) {
            pw = Math.max(MIN_CONTAINER_WIDTH, pw);
            ph = Math.max(MIN_CONTAINER_HEIGHT, ph);

            // Update or add position entry
            if (existingPosUpdate) {
              existingPosUpdate.position.x = px;
              existingPosUpdate.position.y = py;
            } else {
              positionUpdates.push({ id: parent.id, position: { x: px, y: py } });
            }

            // Update or add size entry
            if (existingSizeUpdate) {
              existingSizeUpdate.width = pw;
              existingSizeUpdate.height = ph;
            } else {
              sizeUpdates.push({ id: parent.id, width: pw, height: ph });
            }
          }

          // Walk up to grandparent
          currentNode = parent as any;
        }
      }

      // BND-1/BND-3: After expansion, clamp the dragged node to its parent's
      // (now expanded) bounds so it never ends up outside the container.
      // This also catches snap-to-grid rounding that might push a node past the edge.
      if (node.parentId && !skipAncestorResize) {
        const parent = visibleNodes.find((n) => n.id === node.parentId);
        if (parent && !parent.data?.folded) {
          const parentPosUpdate = positionUpdates.find((u) => u.id === parent.id);
          const parentSizeUpdate = sizeUpdates.find((u) => u.id === parent.id);
          const px = parentPosUpdate?.position.x ?? parent.x;
          const py = parentPosUpdate?.position.y ?? parent.y;
          const pw = parentSizeUpdate?.width ?? parent.width;
          const ph = parentSizeUpdate?.height ?? parent.height;

          const minX = px + CONTAINER_PAD;
          const minY = py + CONTAINER_PAD + CONTAINER_HEADER_H;
          const maxX = px + pw - CONTAINER_PAD - node.width;
          const maxY = py + ph - CONTAINER_PAD - node.height;

          const nodeUpdate = positionUpdates.find((u) => u.id === id);
          if (nodeUpdate) {
            const clampedX = Math.max(minX, Math.min(maxX, nodeUpdate.position.x));
            const clampedY = Math.max(minY, Math.min(maxY, nodeUpdate.position.y));

            if (clampedX !== nodeUpdate.position.x || clampedY !== nodeUpdate.position.y) {
              const adjustX = clampedX - nodeUpdate.position.x;
              const adjustY = clampedY - nodeUpdate.position.y;
              nodeUpdate.position.x = clampedX;
              nodeUpdate.position.y = clampedY;

              // Also adjust all descendants by the same delta
              for (const descId of descendantIds) {
                const descUpdate = positionUpdates.find((u) => u.id === descId);
                if (descUpdate) {
                  descUpdate.position.x += adjustX;
                  descUpdate.position.y += adjustY;
                }
              }
            }
          }
        }
      }

      // Skip clamping when:
      // 1. Shift+drag (reparent mode) — node needs to escape its container
      // 2. Dragging a container with descendants — children are rigidly translated
      //    with the parent, so clamping would disturb their relative positions
      //    (auto-layout uses different padding than the clamp bounds)
      const hasDescendants = descendantIds.length > 0;
      const shouldSkipClamp = skipAncestorResize || hasDescendants;
      dispatch(
        updateCardNodePositions(shouldSkipClamp ? { updates: positionUpdates, skipClamp: true } : positionUpdates),
      );
      for (const su of sizeUpdates) {
        dispatch(resizeCardNode(su));
      }

      // Detect if dragged node is near its parent's edge (exit indicator)
      if (node.parentId) {
        const parent = visibleNodes.find((n) => n.id === node.parentId);
        if (parent) {
          const margin = 30;
          const isNearEdge =
            newX < parent.x + margin ||
            newY < parent.y + margin ||
            newX + node.width > parent.x + parent.width - margin ||
            newY + node.height > parent.y + parent.height - margin;
          setExitingGroupId(isNearEdge ? parent.id : null);
        }
      } else {
        setExitingGroupId(null);
      }
    },
    [visibleNodes, canvasNodes, getAllDescendantIds, dispatch, setExitingGroupId],
  );

  // Handle fold/unfold with ancestor container expansion.
  // When unfolding a node near a parent's edge, the expanded height may overflow —
  // so we expand ancestor containers to keep the unfolded node fully contained.
  const handleToggleFold = useCallback(
    (nodeId: string) => {
      const node = visibleNodes.find((n) => n.id === nodeId);
      if (!node) {
        dispatch(toggleCardNodeFold(nodeId));
        return;
      }

      const wasFolded = !!node.data?.folded;
      dispatch(toggleCardNodeFold(nodeId));

      // Only need to resize when UNFOLDING (node gets taller, must fit children)
      if (!wasFolded) return;

      const positionUpdates: Array<{ id: string; position: { x: number; y: number } }> = [];
      const sizeUpdates: Array<{ id: string; width: number; height: number }> = [];

      // Step 1: Resize the unfolded node itself to encompass its children.
      // Children may have been moved while hidden, or this is the first unfold
      // after auto-organize. Use the FULL canvas nodes (not visibleNodes which
      // has folded height) to find children positions.
      const childrenOfNode = canvasNodes.filter((n) => n.parentId === nodeId);
      let selfW = node.width;
      let selfH = node.height; // This is the folded visual height (36px)
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

        // Expand self to fit children
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
        // No children — use the stored expanded height from Redux
        const reduxNode = nodes.find((n: any) => n.id === nodeId);
        const defaultH = computeCompactNodeHeight(
          node.data as Record<string, unknown>,
          isGroupOrBlock(node),
          false,
        );
        selfH = Math.max(reduxNode?.height || 0, defaultH, MIN_CONTAINER_HEIGHT);
      }

      // Apply self resize
      if (selfX !== node.x || selfY !== node.y) {
        positionUpdates.push({ id: nodeId, position: { x: selfX, y: selfY } });
      }
      if (selfW !== node.width || selfH !== node.height) {
        sizeUpdates.push({ id: nodeId, width: selfW, height: selfH });
      }

      // Step 2: Walk up ancestors and expand them to fit the resized node
      if (node.parentId) {
        let current = node;
        while (current.parentId) {
          const parent = visibleNodes.find((n) => n.id === current.parentId);
          if (!parent || parent.data?.folded) break;

          const existingPosUpdate = positionUpdates.find((u) => u.id === parent.id);
          const existingSizeUpdate = sizeUpdates.find((u) => u.id === parent.id);
          let px = existingPosUpdate?.position.x ?? parent.x;
          let py = existingPosUpdate?.position.y ?? parent.y;
          let pw = existingSizeUpdate?.width ?? parent.width;
          let ph = existingSizeUpdate?.height ?? parent.height;

          // Compute children bounds, using the expanded size for the unfolded node
          const siblings = visibleNodes.filter((n) => n.parentId === parent.id);
          let childMinX = Infinity,
            childMinY = Infinity;
          let childMaxR = -Infinity,
            childMaxB = -Infinity;

          for (const sib of siblings) {
            // Use the computed expanded bounds for the just-unfolded node
            const sx = sib.id === nodeId ? selfX : sib.x;
            const sy = sib.id === nodeId ? selfY : sib.y;
            const sw = sib.id === nodeId ? selfW : sib.width;
            const sh = sib.id === nodeId ? selfH : sib.height;
            childMinX = Math.min(childMinX, sx);
            childMinY = Math.min(childMinY, sy);
            childMaxR = Math.max(childMaxR, sx + sw);
            childMaxB = Math.max(childMaxB, sy + sh);
          }

          if (!isFinite(childMinX)) break;

          let changed = false;

          const overflowL = px + CONTAINER_PAD - childMinX;
          if (overflowL > 0) {
            px -= overflowL;
            pw += overflowL;
            changed = true;
          }

          const overflowT = py + CONTAINER_PAD + CONTAINER_HEADER_H - childMinY;
          if (overflowT > 0) {
            py -= overflowT;
            ph += overflowT;
            changed = true;
          }

          const overflowR = childMaxR - (px + pw - CONTAINER_PAD);
          if (overflowR > 0) {
            pw += overflowR;
            changed = true;
          }

          const overflowB = childMaxB - (py + ph - CONTAINER_PAD);
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

          current = parent as any;
        }
      }

      // Dispatch all expansions
      if (positionUpdates.length > 0) {
        dispatch(updateCardNodePositions(positionUpdates));
      }
      for (const su of sizeUpdates) {
        dispatch(resizeCardNode(su));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- canvasNodes derived from visibleNodes
    [visibleNodes, dispatch],
  );

  return {
    handleNodeMove,
    handleToggleFold,
  };
}

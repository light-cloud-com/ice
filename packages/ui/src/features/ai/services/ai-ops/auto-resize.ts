/**
 * AI ops — auto-resize all container nodes after a batch of operations.
 *
 * Extracted from `operation-executor.ts` (rf-aiop-5). Single export
 * `autoResizeContainers(dispatch, card)` that walks every container node
 * deepest-first and dispatches `updateCardNodePositions` /
 * `resizeCardNode` actions to expand the container to the bounding box of
 * its children plus padding.
 *
 * Behavior preserved verbatim:
 *   - Skip when there are no containers, OR when a container has no
 *     children.
 *   - Sort containers by depth (root → leaf nesting) so that deeper
 *     containers resize FIRST. This guarantees that when a parent
 *     container later resizes around its children, the children's bbox
 *     already reflects their post-resize dimensions.
 *   - Padding: RESIZE_PAD on all sides + an extra RESIZE_HEADER on the
 *     top to leave room for the container's title bar.
 *   - "Expand only, never shrink" rule: the new x/y is `min(current,
 *     required)`, the new width/height is `max(current, required, fit)`.
 *     This means an oversized container that the user manually grew stays
 *     grown.
 *
 * NOT pure: dispatches Redux actions. The dispatch is the only side
 * effect; everything else is pure math over the card snapshot.
 */

import { RESIZE_PAD, RESIZE_HEADER } from './types';
import { updateCardNodePositions, resizeCardNode } from '../../../../store/slices/cards-slice';
import type { AppDispatch } from '../../../../store';
import type { Card, CardNode } from '../../../../store/slices/cards-slice';

/**
 * After AI operations, auto-resize all group/container nodes
 * to fit their children with padding. Processes deepest containers first
 * (bottom-up) so nested containers resize correctly.
 */
export function autoResizeContainers(dispatch: AppDispatch, card: Card): void {
  // Find all container nodes (groups)
  const containers = card.nodes.filter((n) => n.type === 'container');
  if (containers.length === 0) return;

  // Sort by depth (deepest first) — containers inside other containers resize first
  const depthOf = (node: CardNode): number => {
    let d = 0;
    let current = node;
    while (current.parentId) {
      d++;
      const parent = card.nodes.find((n) => n.id === current.parentId);
      if (!parent) break;
      current = parent;
    }
    return d;
  };

  const sorted = [...containers].sort((a, b) => depthOf(b) - depthOf(a));

  for (const container of sorted) {
    const children = card.nodes.filter((n) => n.parentId === container.id);
    if (children.length === 0) continue;

    // Find bounding box of children
    let minX = Infinity,
      minY = Infinity,
      maxR = -Infinity,
      maxB = -Infinity;
    for (const child of children) {
      minX = Math.min(minX, child.position.x);
      minY = Math.min(minY, child.position.y);
      maxR = Math.max(maxR, child.position.x + (child.width || 280));
      maxB = Math.max(maxB, child.position.y + (child.height || 160));
    }

    // Required container bounds (children bbox + padding)
    const reqX = minX - RESIZE_PAD;
    const reqY = minY - RESIZE_PAD - RESIZE_HEADER;
    const reqW = maxR + RESIZE_PAD - reqX;
    const reqH = maxB + RESIZE_PAD - reqY;

    // Expand container to fit (don't shrink below current size or required)
    const newX = Math.min(container.position.x, reqX);
    const newY = Math.min(container.position.y, reqY);
    const newW = Math.max(container.width || 280, reqW, maxR + RESIZE_PAD - newX);
    const newH = Math.max(container.height || 160, reqH, maxB + RESIZE_PAD - newY);

    if (newX !== container.position.x || newY !== container.position.y) {
      dispatch(updateCardNodePositions([{ id: container.id, position: { x: newX, y: newY } }]));
    }
    if (newW !== container.width || newH !== container.height) {
      dispatch(resizeCardNode({ id: container.id, width: newW, height: newH }));
    }
  }
}

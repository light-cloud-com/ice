/**
 * AI ops — non-overlapping position-finder for AI-placed nodes.
 *
 * Extracted from `operation-executor.ts` (rf-aiop-3). Pure functions over
 * `Card` data. Three exports:
 *
 *   - `isHelperIceType(iceType)` — pattern-match on the iceType string to
 *     decide whether a node should get the smaller helper-node default
 *     dimensions. Pattern preserved verbatim from source: any iceType whose
 *     lowercased form matches `/security\.|monitoring\.|log\.|observ|
 *     source\.repository|config\.env|envvars/` qualifies.
 *
 *   - `findRootPosition(card, nodeWidth, nodeHeight?)` — picks the first
 *     non-overlapping grid cell at the canvas root. Tries the slot directly
 *     below the lowest existing node first (keeps a top-to-bottom flow),
 *     then a row-major scan of a 15x3 grid, falling back to "below
 *     everything" if the grid is full.
 *
 *   - `findChildPosition(card, parentId, nodeWidth, nodeHeight)` — picks
 *     the first non-overlapping cell INSIDE a parent container, respecting
 *     CONTAINER_INNER_PAD / CONTAINER_HEADER_PAD. Falls back to stacking
 *     below the lowest sibling when the 10x3 grid is full.
 *
 *   - `findPosition(card, parentId?, nodeWidth?, nodeHeight?)` — dispatcher.
 *     Routes to `findChildPosition` when parentId is provided, otherwise
 *     `findRootPosition`. Defaults nodeWidth/nodeHeight to NODE_WIDTH/HEIGHT.
 *
 * The grid step (`nodeWidth + NODE_GAP_X`, `nodeHeight + NODE_GAP_Y`) and
 * overlap-with-gap rule (root: 12, child: 8) are preserved verbatim — every
 * value here shifts placement of every AI-placed node, so they're frozen.
 */

import {
  NODE_GAP_X,
  NODE_GAP_Y,
  NODE_WIDTH,
  NODE_HEIGHT,
  COLS_PER_ROW,
  CONTAINER_INNER_PAD,
  CONTAINER_HEADER_PAD,
} from './types';
import type { Card } from '../../../../store/slices/cards-slice';

/** Helper/utility nodes get a smaller default size */
export function isHelperIceType(iceType: string): boolean {
  const t = iceType.toLowerCase();
  return /security\.|monitoring\.|log\.|observ|source\.repository|config\.env|envvars/.test(t);
}

/**
 * Find a non-overlapping position for a new node.
 * If parentId is provided, positions inside the parent.
 * Uses a grid layout based on existing siblings.
 */
export function findPosition(
  card: Card,
  parentId?: string,
  nodeWidth: number = NODE_WIDTH,
  nodeHeight: number = NODE_HEIGHT,
): { x: number; y: number } {
  if (parentId) {
    return findChildPosition(card, parentId, nodeWidth, nodeHeight);
  }
  return findRootPosition(card, nodeWidth, nodeHeight);
}

export function findRootPosition(
  card: Card,
  nodeWidth: number,
  nodeHeight: number = NODE_HEIGHT,
): { x: number; y: number } {
  if (card.nodes.length === 0) return { x: 100, y: 100 };

  // Find a position that doesn't overlap ANY existing node (not just root nodes).
  // Scan grid positions and pick the first non-overlapping one.
  const allNodes = card.nodes;
  const gap = 12;

  // Start below the lowest existing node to maintain flow direction
  let maxBottom = 100;
  for (const n of allNodes) {
    maxBottom = Math.max(maxBottom, n.position.y + (n.height || NODE_HEIGHT) + NODE_GAP_Y);
  }

  // Try positions: first below existing nodes (preferred for flow), then grid scan
  const candidates = [
    // Below the lowest node, centered with the widest cluster
    { x: 100, y: maxBottom },
  ];

  // Also try grid positions starting from top
  for (let row = 0; row < 15; row++) {
    for (let col = 0; col < COLS_PER_ROW; col++) {
      candidates.push({
        x: 100 + col * (Math.max(nodeWidth, NODE_WIDTH) + NODE_GAP_X),
        y: 100 + row * (NODE_HEIGHT + NODE_GAP_Y),
      });
    }
  }

  for (const { x, y } of candidates) {
    const overlaps = allNodes.some((n) => {
      const nw = n.width || NODE_WIDTH;
      const nh = n.height || NODE_HEIGHT;
      return !(
        x + nodeWidth + gap <= n.position.x ||
        x >= n.position.x + nw + gap ||
        y + nodeHeight + gap <= n.position.y ||
        y >= n.position.y + nh + gap
      );
    });
    if (!overlaps) return { x, y };
  }

  // Fallback: place below everything
  return { x: 100, y: maxBottom };
}

export function findChildPosition(
  card: Card,
  parentId: string,
  nodeWidth: number,
  nodeHeight: number,
): { x: number; y: number } {
  const parent = card.nodes.find((n) => n.id === parentId);
  if (!parent) return { x: 100, y: 100 };

  const siblings = card.nodes.filter((n) => n.parentId === parentId);
  const startX = parent.position.x + CONTAINER_INNER_PAD;
  const startY = parent.position.y + CONTAINER_HEADER_PAD;

  if (siblings.length === 0) {
    return { x: startX, y: startY };
  }

  // Find the first position that doesn't overlap any sibling
  // Try grid positions, then fall back to stacking below
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < COLS_PER_ROW; col++) {
      const x = startX + col * (nodeWidth + NODE_GAP_X);
      const y = startY + row * (nodeHeight + NODE_GAP_Y);

      const overlaps = siblings.some((s) => {
        const sw = s.width || NODE_WIDTH;
        const sh = s.height || NODE_HEIGHT;
        // Check if candidate rect (x,y,nodeWidth,nodeHeight) overlaps sibling
        // with a small gap to prevent touching edges
        const gap = 8;
        return !(
          x + nodeWidth + gap <= s.position.x ||
          x >= s.position.x + sw + gap ||
          y + nodeHeight + gap <= s.position.y ||
          y >= s.position.y + sh + gap
        );
      });

      if (!overlaps) return { x, y };
    }
  }

  // Fallback: stack below last sibling
  let maxBottom = startY;
  for (const s of siblings) {
    maxBottom = Math.max(maxBottom, s.position.y + (s.height || NODE_HEIGHT));
  }
  return { x: startX, y: maxBottom + NODE_GAP_Y };
}

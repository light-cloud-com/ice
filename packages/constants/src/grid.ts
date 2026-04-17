/**
 * Grid & Layout Constants
 *
 * Canvas card dimensions, container padding, spacing,
 * and derived group dimension helpers.
 */

export const CARD_WIDTH = 240;
export const CARD_HEIGHT = 160;
export const HEADER_HEIGHT = 36;
export const CONTAINER_PADDING = 20;
export const CHILD_GAP = 16;
export const GROUP_GAP = 30;

// ── Auto-layout tuning (dagre + repack) ───────────────────────────────────
/** Horizontal gap between siblings on the same dagre rank. */
export const LAYOUT_NODE_SEP = 40;
/** Vertical gap between dagre ranks (layers). */
export const LAYOUT_RANK_SEP = 80;
/** marginx/marginy passed to `setGraph()`. */
export const LAYOUT_MARGIN = 40;
/** Every position + size produced by auto-layout snaps to a multiple of this. */
export const LAYOUT_GRID_STEP = 40;
/** Minimum rendered bounds of Network.PrivateNetwork (mirrored from its renderer). */
export const PRIVATE_NETWORK_MIN_WIDTH = 560;
export const PRIVATE_NETWORK_MIN_HEIGHT = 320;

export function groupWidth(cols: number): number {
  return CONTAINER_PADDING + cols * CARD_WIDTH + (cols - 1) * CHILD_GAP + CONTAINER_PADDING;
}

export function groupHeight(rows: number): number {
  return HEADER_HEIGHT + CONTAINER_PADDING + rows * CARD_HEIGHT + (rows - 1) * CHILD_GAP + CONTAINER_PADDING;
}

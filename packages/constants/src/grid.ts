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

// ── Per-block visual layout constants ─────────────────────────────────────
// Used by both the renderer files in `packages/ui/.../canvas/components/nodes/*`
// and by the auto-layout visual-size resolver. Centralised here so renderer
// and layout always agree without hand-syncing duplicate declarations.

/** Network.PrivateNetwork — minimum rendered bounds + header height. */
export const PRIVATE_NETWORK_MIN_WIDTH = 560;
export const PRIVATE_NETWORK_MIN_HEIGHT = 320;
export const PN_HEADER_HEIGHT = 56;

/** Network.CustomDomain — header, domain field, route rows, padding, add button. */
export const CD_EXTRA_WIDTH = 40;
export const CD_HEADER_HEIGHT = 48;
export const CD_DOMAIN_FIELD_HEIGHT = 38;
export const CD_ROUTE_ROW_HEIGHT = 36;
export const CD_ROUTE_ROW_GAP = 4;
export const CD_PADDING = 10;
export const CD_ADD_BUTTON_HEIGHT = 32;

/** Messaging.Queue layout. */
export const MQ_HEADER_HEIGHT = 48;
export const MQ_ROW_HEIGHT = 26;
export const MQ_ROW_GAP = 4;
export const MQ_PADDING = 12;

/** Security.Secret store layout. */
export const SS_HEADER_HEIGHT = 48;
export const SS_ROW_HEIGHT = 20;
export const SS_PADDING = 12;

/** Config.Environment layout. */
export const EC_HEADER_HEIGHT = 48;
export const EC_ROW_HEIGHT = 20;
export const EC_PADDING = 12;

/** Messaging.Email service layout. */
export const ES_HEADER_HEIGHT = 48;
export const ES_FIELD_HEIGHT = 30;
export const ES_PADDING = 12;

/** Compact-node block summary card (rendered at low LOD). */
export const BLOCK_SUMMARY_W = 260;
export const BLOCK_SUMMARY_H = 80;

/** Block sidebar — fixed-width left strip on every block card. */
export const SIDEBAR_WIDTH = 56;

/** Group node — minimum width and folded height (height-only when collapsed). */
export const GROUP_NODE_MIN_WIDTH = 276;
export const GROUP_NODE_FOLDED_HEIGHT = 36;

export function groupWidth(cols: number): number {
  return CONTAINER_PADDING + cols * CARD_WIDTH + (cols - 1) * CHILD_GAP + CONTAINER_PADDING;
}

export function groupHeight(rows: number): number {
  return HEADER_HEIGHT + CONTAINER_PADDING + rows * CARD_HEIGHT + (rows - 1) * CHILD_GAP + CONTAINER_PADDING;
}

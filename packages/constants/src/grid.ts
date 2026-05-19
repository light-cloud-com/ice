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

/** Compute.CronJob layout — clock face + cron summary body. */
export const ST_HEADER_HEIGHT = 48;
export const ST_BODY_HEIGHT = 60;
export const ST_PADDING = 12;

/**
 * Compute.CronJob multi-task layout — each task is a row with its own
 * connection port on the right edge, similar to Network.CustomDomain.
 *
 * Port-y geometry is derived from these constants + CardShell's hardcoded
 * body padding (10px top, 12px bottom). If CardShell's body padding
 * changes, `getCronTaskPortY` in the cron renderer needs to match.
 */
export const CRON_HEADER_HEIGHT = 48;
export const CRON_BODY_PADDING_TOP = 10;
export const CRON_BODY_PADDING_BOTTOM = 12;
export const CRON_TASK_ROW_HEIGHT = 28;
export const CRON_TASK_ROW_GAP = 6;
export const CRON_MIN_TASK_ROWS = 1;

/**
 * Database family layout — postgres / mysql / mongodb share the same
 * card height. The body content (relational stripes vs. document pills)
 * is what differentiates each renderer.
 */
export const DB_HEADER_HEIGHT = 48;
export const DB_BODY_HEIGHT = 60;
export const DB_PADDING = 12;

/**
 * Compute family layout — scalable-backend / ssr-site / worker /
 * serverless-function / static-site. Body content differs per block
 * (scale gauge, browser frame, cog with queue flow, bolt halo, globe
 * with CDN edges), but the outer card height is unified.
 */
export const COMPUTE_HEADER_HEIGHT = 48;
export const COMPUTE_BODY_HEIGHT = 64;
export const COMPUTE_PADDING = 12;

/** Storage.Bucket layout — bucket drawers body. */
export const BUCKET_HEADER_HEIGHT = 48;
export const BUCKET_BODY_HEIGHT = 64;
export const BUCKET_PADDING = 12;

/** Network.Gateway layout — stacked-route body. */
export const AG_HEADER_HEIGHT = 48;
export const AG_ROW_HEIGHT = 22;
export const AG_ROW_GAP = 4;
export const AG_PADDING = 12;

/**
 * Standard footer strip on every CardShell-based block — live-config text +
 * health dot. Added to every per-block `compute*Height()` so the deploy
 * status footer always has room.
 */
export const CARD_FOOTER_HEIGHT = 26;

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

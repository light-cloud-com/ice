/**
 * Canvas Design Tokens
 *
 * Shared constants for canvas geometry, dimensions, zoom, and colors.
 * Imported by svg-compact-node, svg-group-node, svg-log-node,
 * svg-canvas, use-canvas-mouse-events, and auto-layout.
 */

// ─── Shared Geometry ───────────────────────────────────────────────────────

export const CORNER_RADIUS = 8;
export const HEADER_HEIGHT = 36;
export const CONTAINER_PADDING = 20;
export const MIN_CONTAINER_WIDTH = 240;
export const MIN_CONTAINER_HEIGHT = 150;

// ─── Card Dimensions ───────────────────────────────────────────────────────

export const CARD_WIDTH = 240;
export const CARD_PX = 12;
export const CARD_PY = 10;
export const ICON_SIZE = 20;
export const ICON_GAP = 8;
export const BRAND_ICON_SIZE = 16;
export const SERVICE_LINE_H = 16;

// ─── Zoom ──────────────────────────────────────────────────────────────────

export const SCALE_MIN = 0.1;
export const SCALE_MAX = 3;
export const ZOOM_SENSITIVITY = 0.002;
/** Discrete zoom step size (0.05 = 5%). Zoom snaps to multiples of this value. */
export const ZOOM_STEP = 0.05;

// ─── Level of Detail Thresholds ────────────────────────────────────────────
// LOD 3 = full detail, LOD 2 = compact, LOD 1 = iconic

export const LOD_THRESHOLD_L3 = 0.7;
export const LOD_THRESHOLD_L2 = 0.35;

// ─── Grid ──────────────────────────────────────────────────────────────────

export const GRID_SIZE = 48;

// ─── Tree Indentation ──────────────────────────────────────────────────────

export const TREE_INDENT_PX = 16;
export const TREE_INDENT_BASE = 8;

// ─── Status Colors ─────────────────────────────────────────────────────────

export const STATUS_COLORS: Record<string, string> = {
  active: '#22c55e',
  running: '#22c55e',
  healthy: '#22c55e',
  deployed: '#22c55e',
  pending: '#f59e0b',
  warning: '#f59e0b',
  creating: '#f59e0b',
  updating: '#3b82f6',
  deploying: '#3b82f6',
  error: '#ef4444',
  failed: '#ef4444',
  deleting: '#ef4444',
  stopped: '#64748b',
  inactive: '#64748b',
};

// ─── Category Style ────────────────────────────────────────────────────────

export const CATEGORY_STYLE: Record<string, { border: string; glow: string }> = {
  Application: { border: '#1e3a5f', glow: '#3b82f6' },
  Database: { border: '#2d1f5e', glow: '#8b5cf6' },
  Storage: { border: '#1a4035', glow: '#10b981' },
  Network: { border: '#3b1e48', glow: '#ec4899' },
  Security: { border: '#3d2f1a', glow: '#f59e0b' },
  Messaging: { border: '#252660', glow: '#6366f1' },
  Monitoring: { border: '#2a3040', glow: '#64748b' },
  Block: { border: '#253548', glow: '#3b82f6' },
  default: { border: 'var(--ice-border)', glow: 'var(--ice-border-strong)' },
};

/**
 * Canvas Design Tokens
 *
 * Shared constants for canvas geometry, dimensions, zoom, and colors.
 * Imported by svg-compact-node, svg-group-node, svg-log-node,
 * svg-canvas, use-canvas-mouse-events, and auto-layout.
 */

import { CARD_WIDTH, CARD_HEIGHT, HEADER_HEIGHT, CONTAINER_PADDING } from '@ice/constants';
export { CARD_WIDTH, CARD_HEIGHT, HEADER_HEIGHT, CONTAINER_PADDING };

// ─── Shared Geometry ───────────────────────────────────────────────────────

export const CORNER_RADIUS = 8;
export const MIN_CONTAINER_WIDTH = 240;
export const MIN_CONTAINER_HEIGHT = 150;
export const CARD_PX = 12;
export const CARD_PY = 10;
export const ICON_SIZE = 20;
export const ICON_GAP = 8;
export const BRAND_ICON_SIZE = 16;
export const SERVICE_LINE_H = 16;

// ─── Zoom ──────────────────────────────────────────────────────────────────

export const SCALE_MIN = 0.1;
export const SCALE_MAX = 2;
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
  planning: '#3b82f6',
  drifted: '#f59e0b',
  error: '#ef4444',
  failed: '#ef4444',
  deleting: '#ef4444',
  destroying: '#f97316',
  stopped: '#64748b',
  inactive: '#64748b',
  idle: '#64748b',
  // pdl-7: per-node wire statuses surfaced via `mapWireStatusToOverlay`.
  // `queued` shares the pending/warning amber palette; `skipped` and
  // `cancelled` use the slate "this didn't run / didn't matter" tone.
  queued: '#f59e0b',
  skipped: '#94a3b8',
  cancelled: '#94a3b8',
};

// ─── Category Style ────────────────────────────────────────────────────────

/**
 * Category palette.
 *
 * Each entry is: a dark muted border fill (used for subtle category washes),
 * a glow color (the signature family hue, used for selection glow + top
 * accent strip + sidebar type-icon tint), and a display label.
 *
 * Desaturated/warm — never neon. One signature per family so blocks are
 * tellable apart at a glance without being loud. Kept consistent so
 * SvgCompactNode, BlockSidebar, and CardShell all speak the same color.
 */
export const CATEGORY_STYLE: Record<string, { border: string; glow: string }> = {
  // Compute family — warm amber, the "brain" of an architecture
  Compute: { border: '#3d2e1a', glow: '#f59e0b' },
  Application: { border: '#1e3a5f', glow: '#3b82f6' },
  // Data family — cool violet, databases and stateful storage
  Database: { border: '#2d1f5e', glow: '#8b5cf6' },
  Storage: { border: '#1a4035', glow: '#10b981' },
  // Edge / networking — bright rose, the "doors" of an architecture
  Network: { border: '#3b1e48', glow: '#ec4899' },
  // Security — warm yellow-amber, attention without alarm
  Security: { border: '#3d3018', glow: '#eab308' },
  // Messaging — cool indigo, pipes and fan-out
  Messaging: { border: '#252660', glow: '#6366f1' },
  // Monitoring — slate neutral, restrained
  Monitoring: { border: '#2a3040', glow: '#94a3b8' },
  // AI — rose / magenta, the differentiator
  AI: { border: '#3f1a2a', glow: '#f43f5e' },
  // Analytics — cyan, cool data-viz accent
  Analytics: { border: '#0f3a44', glow: '#06b6d4' },
  // Config / Source — muted zinc, supporting blocks
  Config: { border: '#2a2a30', glow: '#a1a1aa' },
  Source: { border: '#2a2a30', glow: '#a1a1aa' },
  Block: { border: '#253548', glow: '#3b82f6' },
  default: { border: 'var(--ice-border)', glow: 'var(--ice-border-strong)' },
};

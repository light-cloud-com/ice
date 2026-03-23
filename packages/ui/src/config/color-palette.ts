/**
 * Color Palette — Centralized Color Constants
 *
 * All shared color maps, presets, and semantic color tokens.
 * Imported by canvas nodes, wizard steps, palette, properties panel, etc.
 */

// ─── Security Levels ───────────────────────────────────────────────────────
// Used by: wizard/template-step, wizard/environment-step, wizard/review-step

export const SECURITY_LEVEL_COLORS: Record<string, string> = {
  basic: '#6b7280',
  standard: '#3b82f6',
  strict: '#f59e0b',
  compliance: '#22c55e',
};

// ─── Block & Group Colors ──────────────────────────────────────────────────
// Used by: svg-group-node

export const BLOCK_ACCENT_COLORS: Record<string, string> = {
  Frontend: '#3b82f6',
  Services: '#8b5cf6',
  Data: '#10b981',
  Messaging: '#6366f1',
  Monitoring: '#f59e0b',
  StaticSite: '#3b82f6',
  ScalableBackend: '#8b5cf6',
  Worker: '#ed7100',
  Database: '#3B48CC',
  Cache: '#3B48CC',
  Storage: '#1A9C3E',
  Gateway: '#E7157B',
  Queue: '#E7157B',
};

export const GROUP_TINT_COLORS: Record<string, string> = {
  Frontend: 'rgba(59, 130, 246, 0.04)',
  Services: 'rgba(139, 92, 246, 0.04)',
  Data: 'rgba(16, 185, 129, 0.04)',
  Messaging: 'rgba(99, 102, 241, 0.04)',
  Monitoring: 'rgba(245, 158, 11, 0.04)',
  External: 'rgba(100, 116, 139, 0.04)',
};

export const GROUP_BORDER_COLORS: Record<string, string> = {
  Frontend: '#3b82f640',
  Services: '#8b5cf640',
  Data: '#10b98140',
  Messaging: '#6366f140',
  Monitoring: '#f59e0b40',
  External: '#64748b40',
};

// ─── Group Color Presets ───────────────────────────────────────────────────
// Used by: resource-palette (auto-assign), properties-panel (color picker)

export const GROUP_COLOR_PRESETS = [
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#64748b', // slate
  '#22c55e', // green
  '#f97316', // orange
  '#6366f1', // indigo
] as const;

// ─── Edge / Connection Colors ──────────────────────────────────────────────
// Used by: svg-connection-path, svg-canvas

export const EDGE_COLORS: Record<string, string> = {
  default: '#475569',
  selected: '#3b82f6',
  hover: '#60a5fa',
  depends_on: '#f59e0b',
  connects_to: '#22c55e',
  references: '#8b5cf6',
  logs_to: '#22c55e',
  bundled: '#60a5fa',
  outgoing: '#22d3ee',
  incoming: '#f97316',
};

// ─── Region / Network Colors ───────────────────────────────────────────────
// Used by: svg-region-label

export const REGION_STYLES: Record<string, { fill: string; labelColor: string }> = {
  'Network.VPC': { fill: 'rgba(99, 102, 241, 0.04)', labelColor: '#6366f1' },
  'Network.Subnet': { fill: 'rgba(139, 92, 246, 0.03)', labelColor: '#8b5cf6' },
  default: { fill: 'rgba(100, 116, 139, 0.03)', labelColor: '#64748b' },
};

// ─── Archetype / Quick-Start Colors ────────────────────────────────────────
// Used by: empty-canvas-overlay

export const ARCHETYPE_COLORS: Record<string, string> = {
  'qs-website-db': '#3b82f6',
  'qs-webapp-api': '#22c55e',
  'qs-api-only': '#8b5cf6',
  'qs-data-pipeline': '#f59e0b',
};

// ─── Environment Type Colors ───────────────────────────────────────────────
// Used by: project-tree

export const ENV_DOT_COLORS: Record<string, string> = {
  production: 'bg-green-500',
  staging: 'bg-yellow-500',
  development: 'bg-blue-500',
  pr: 'bg-purple-500',
};

// ─── Log Level Colors ──────────────────────────────────────────────────────
// Used by: svg-log-node

export const LOG_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  info: { bg: '#1e3a5f22', text: '#3b82f6', label: 'INFO' },
  warn: { bg: '#3d2f1a22', text: '#f59e0b', label: 'WARN' },
  error: { bg: '#3d1a1a22', text: '#ef4444', label: 'ERROR' },
  debug: { bg: '#1a3d2f22', text: '#6b7280', label: 'DEBUG' },
};

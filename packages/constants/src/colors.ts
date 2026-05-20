/**
 * Color Palette
 *
 * Named hue tokens used across the ICE UI. These are the base palette
 * (Tailwind 400/500-level swatches) — semantic maps like
 * `STATUS_COLORS`, `BLOCK_ACCENT_COLORS`, `EDGE_COLORS`, etc. should
 * reference these tokens instead of inlining raw hex literals so the
 * "what color is `success` / `Frontend` / `selected`?" question has one
 * answer and we can retune the palette globally.
 *
 * Brand-specific colors (AWS orange, GCP blue, the various block-accent
 * colors that don't match a Tailwind hue) stay inline at their call site
 * — those aren't palette colors, they're brand colors.
 */

/**
 * Cloud-provider brand colors. Live in the same module as `COLORS` so the
 * "every named color is here" rule holds, but kept in a separate map
 * because they're brand identity, not palette tokens — no
 * `BRAND_COLORS.aws` should ever leak into a non-AWS context.
 */
export const BRAND_COLORS = {
  aws: '#ff9900',
  gcp: '#4285f4',
  azure: '#0078d4',
  kubernetes: '#326ce5',
  alibaba: '#ff6a00',
  oci: '#f80000',
  digitalocean: '#0080ff',
} as const;

export type BrandColorToken = keyof typeof BRAND_COLORS;

export const COLORS = {
  // Tailwind blue family
  blue: '#3b82f6',
  blueDeep: '#2563eb',
  blueLight: '#60a5fa',
  blueDark: '#1e3a5f',
  sky: '#0ea5e9',

  // Greens
  green: '#22c55e',
  emerald: '#10b981',
  lime: '#84cc16',

  // Cyans / teals
  cyan: '#06b6d4',
  cyanBright: '#22d3ee',
  teal: '#14b8a6',

  // Yellows / ambers
  amber: '#f59e0b',
  yellow: '#eab308',

  // Reds / oranges / pinks
  red: '#ef4444',
  orange: '#f97316',
  pink: '#ec4899',
  rose: '#f43f5e',

  // Violets / indigos / purples
  violet: '#8b5cf6',
  indigo: '#6366f1',
  purple: '#a855f7',

  // Neutrals
  slate400: '#94a3b8',
  slate500: '#64748b',
  slate600: '#475569',
  zinc400: '#a1a1aa',
  zinc500: '#71717a',
  gray500: '#6b7280',
  stone500: '#78716c',
} as const;

export type ColorToken = keyof typeof COLORS;

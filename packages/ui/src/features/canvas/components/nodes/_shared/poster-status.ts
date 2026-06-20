/**
 * Poster-view status glyph (CNV7 / AX5).
 *
 * The zoomed-out poster card (CardShell's `lod < 3` branch) surfaced a node's
 * deploy/runtime state as a bare coloured dot whose only label was a mouse
 * `title`. At the exact zoom where you survey the whole board to find "what
 * failed / what's still deploying", that is hue-only and mouse-only: useless to
 * colour-blind users and to keyboard/AT users, and it makes deploying vs done vs
 * failed indistinguishable without hovering each card.
 *
 * This buckets the broad node-status vocabulary (the keys of `STATUS_COLORS`)
 * into a small tone set and pairs each tone with a NON-COLOUR glyph, so terminal
 * / in-flight / failed read differently from shape alone. The colour is kept as
 * a redundant cue for those who can see it; the glyph + an `aria-label` carry
 * the meaning for everyone else.
 *
 * Distinct from the IA4 `deployStatusMeta` vocabulary, which normalises the
 * deploy-*operation* lifecycle (planning/deploying/success/error/…). Node
 * statuses are broader and include runtime/health words (active/running/healthy/
 * drifted/stopped/…), so they get their own bucketing here.
 */

export type PosterStatusTone = 'good' | 'in-flight' | 'warn' | 'error' | 'neutral';

export interface PosterStatusGlyph {
  tone: PosterStatusTone;
  /** A single shape-distinct glyph, shown *alongside* the colour (not replacing it). */
  glyph: string;
  /** Pulse while work is in flight, consistent with the LOD-3 footer dot (CNV3). */
  pulse: boolean;
}

const TONE: Record<string, PosterStatusTone> = {
  // terminal-healthy
  active: 'good',
  running: 'good',
  healthy: 'good',
  deployed: 'good',
  // work in flight (an operation is running — colour still conveys danger for
  // destroying/deleting; the glyph + pulse convey "not finished yet")
  creating: 'in-flight',
  updating: 'in-flight',
  deploying: 'in-flight',
  planning: 'in-flight',
  destroying: 'in-flight',
  deleting: 'in-flight',
  queued: 'in-flight',
  // needs-attention but not failed
  pending: 'warn',
  warning: 'warn',
  drifted: 'warn',
  // failed
  error: 'error',
  failed: 'error',
  // off / didn't-run
  stopped: 'neutral',
  inactive: 'neutral',
  idle: 'neutral',
  skipped: 'neutral',
  cancelled: 'neutral',
};

// Glyphs chosen for universal font coverage and shape-distinctness at ~12px:
// check / ellipsis (working) / bang / cross / middot.
const TONE_GLYPH: Record<PosterStatusTone, string> = {
  good: '✓',
  'in-flight': '…',
  warn: '!',
  error: '✕',
  neutral: '·',
};

export function posterStatusTone(raw: string | undefined | null): PosterStatusTone {
  return (raw && TONE[raw]) || 'neutral';
}

export function posterStatusGlyph(raw: string | undefined | null): PosterStatusGlyph {
  const tone = posterStatusTone(raw);
  return { tone, glyph: TONE_GLYPH[tone], pulse: tone === 'in-flight' };
}

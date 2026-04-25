/**
 * Concepts Palette — shared types (data only)
 *
 * Pure data types for the 26 high-level Concept blocks. NO React imports —
 * this package (@ice/blocks) is consumed by both the UI and the compiler,
 * so it must stay framework-agnostic. React-specific visual types live in
 * @ice/ui/features/concepts/types.ts.
 */

import type { BlockBlueprint, Provider } from '../../../types';

// =============================================================================
// Visual families
// =============================================================================

/**
 * The six visual families. Every concept belongs to exactly one family,
 * which determines the default chrome (silhouette, badges, layout).
 * 'canvas-only' is a seventh pseudo-family for viewer blocks (Log Terminal,
 * Public Traffic, Group) that have bespoke visuals and no infra output.
 */
export type VisualFamily = 'frontend' | 'compute' | 'data' | 'messaging' | 'edge' | 'ai' | 'canvas-only';

// =============================================================================
// Zoom states
// =============================================================================

/**
 * Visual detail level. Zoom states are cosmetic refinements (show more cost,
 * status, badges at higher zoom) — they do NOT reveal internal architecture.
 * The concept-to-raw breakdown lives in the info (i) panel's Compiles To tab.
 */
export type ZoomState = 'summary' | 'detailed';

export interface ZoomThresholds {
  /** Minimum zoom level for the detailed state (default: 1.25). Below this, the summary state renders. */
  detailed: number;
}

export const DEFAULT_ZOOM_THRESHOLDS: ZoomThresholds = { detailed: 1.25 };

// =============================================================================
// Concept blueprint
// =============================================================================

/**
 * A Concept block is a BlockBlueprint with extra metadata pinning it to a
 * visual family and marking it as a provider-agnostic concept. Per-provider
 * details are carried via `providerVariants` and resolved at render time.
 */
export interface ConceptBlueprint extends BlockBlueprint {
  /** Concept identity: 'static-site', 'postgres', 'private-network', ... */
  conceptId: string;
  /** Which visual family this concept belongs to */
  visualFamily: VisualFamily;
  /**
   * When true, placing this block on the canvas emits zero infrastructure.
   * Used by Log Terminal, Public Traffic, Group. The compiler (card-translator)
   * must skip these iceTypes.
   */
  canvasOnly?: boolean;
}

// =============================================================================
// Info content
// =============================================================================

/**
 * Supported languages for code snippets. Adding a new language here causes
 * a TS error in every concept's info.ts that doesn't yet have a snippet for
 * it — transitional rollouts use Partial<Record<SnippetLanguage, string>>.
 */
export type SnippetLanguage = 'ts' | 'py' | 'go' | 'java' | 'csharp' | 'rust';

export const SNIPPET_LANGUAGES: readonly SnippetLanguage[] = ['ts', 'py', 'go', 'java', 'csharp', 'rust'] as const;

export const SNIPPET_LANGUAGE_LABELS: Record<SnippetLanguage, string> = {
  ts: 'TypeScript',
  py: 'Python',
  go: 'Go',
  java: 'Java',
  csharp: 'C#',
  rust: 'Rust',
};

/**
 * A raw primitive the concept compiles to on a specific provider. Sourced
 * from cloud-blocks.ts expands_to or hand-curated per concept.
 */
export interface RawPrimitive {
  /** Human-readable name, e.g. 'VPC', 'Cloud Run Service' */
  name: string;
  /** Terraform/Pulumi type, e.g. 'google_compute_network' */
  type: string;
  /** Optional short description of the role it plays in the composition */
  role?: string;
  /** Whether this primitive is always emitted or depends on props */
  optional?: boolean;
}

export interface ExternalLink {
  label: string;
  url: string;
}

export interface InfoContent {
  /** Overview tab — markdown string */
  overview: {
    markdown: string;
  };
  /**
   * Compiles To tab — per-provider raw primitive breakdown.
   * Canvas-only concepts should omit this (or provide an empty object).
   */
  compilesTo?: Partial<Record<Provider, RawPrimitive[]>>;
  /**
   * Code snippets tab. Partial so concepts can ship TS+Py+Go first and
   * backfill Java/C#/Rust later without failing the type check.
   */
  snippets?: Partial<Record<SnippetLanguage, string>>;
  /** External reference links (AWS/GCP/Azure docs, etc.) */
  links?: ExternalLink[];
  /** Related concepts (iceTypes) to cross-link from the info modal */
  relatedConcepts?: string[];
}

// =============================================================================
// Family registry (data only — no React)
// =============================================================================

/**
 * Simple iceType → VisualFamily map. Populated by each concept's index.ts
 * at module load. The UI layer reads this to decide which family renderer
 * to use; override visuals (React components) live in the UI's own registry.
 */
const FAMILY_REGISTRY = new Map<string, VisualFamily>();

export function registerConceptFamily(iceType: string, family: VisualFamily): void {
  FAMILY_REGISTRY.set(iceType, family);
}

export function getConceptFamily(iceType: string): VisualFamily | undefined {
  return FAMILY_REGISTRY.get(iceType);
}

export function getAllRegisteredConceptIceTypes(): string[] {
  return Array.from(FAMILY_REGISTRY.keys());
}

/** Reset the registry (test-only). */
export function _resetConceptFamilyRegistry(): void {
  FAMILY_REGISTRY.clear();
}

/**
 * Block Blueprint Type System — Flat Cards
 *
 * Blueprints define single flat resource cards (no nesting).
 * Groups are the only container type.
 *
 * NOTE: @ice/core is authoritative for providers[], name,
 * description, and behavior via HIGH_LEVEL_CATEGORIES.
 * Use createBlueprintFromResource() to generate blueprints from schema data.
 */

// =============================================================================
// Provider type
// =============================================================================

import { type Provider } from '@ice/constants';
export type { Provider };

// =============================================================================
// Blueprint interfaces
// =============================================================================

/**
 * A BlockBlueprint defines a single flat resource card.
 * No containers, no children, no internal edges.
 */
export interface BlockBlueprint {
  /** Canonical block type in {Category}.{Resource} format, e.g. 'Database.PostgreSQL' */
  iceType: string;
  /** Maps to HIGH_LEVEL_CATEGORIES resource ID in @ice/core */
  resourceId: string;
  /** Human-readable name, e.g. 'Static Site' */
  name: string;
  /** Short description */
  description: string;
  /** Lucide icon name */
  icon: string;
  /** Category in the palette, e.g. 'frontend' */
  category: string;
  /** Supported cloud providers */
  providers: Provider[];
  /** The flat card's data fields (iceType, behavior, runtime, port, etc.) */
  nodeData: Record<string, unknown>;
  /** Provider-specific overrides */
  providerVariants?: ProviderVariant[];
}

/**
 * Provider-specific overrides. Sparse — only the fields that differ
 * from the default blueprint nodeData are specified.
 */
export interface ProviderVariant {
  /** Which provider this variant applies to */
  provider: Provider;
  /** Sparse data overrides merged into nodeData */
  dataOverrides?: Record<string, unknown>;
}

// =============================================================================
// Expansion result
// =============================================================================

/**
 * The result of expanding a blueprint at a specific canvas position.
 * A single flat resource node — no container, no children, no edges.
 */
export interface ExpandedBlueprint {
  /** The single flat resource node */
  node: {
    id: string;
    type: 'resource';
    position: { x: number; y: number };
    width: number;
    height: number;
    parentId?: string;
    data: Record<string, unknown>;
  };
}

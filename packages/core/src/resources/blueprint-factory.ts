/**
 * Blueprint Factory
 *
 * Generates BlockBlueprint objects from HIGH_LEVEL_CATEGORIES data
 * merged with UI-specific overrides. This makes the schemas layer
 * the single source of truth for providers[], name, description,
 * and behavior — while the UI controls presentation details
 * (blockType, category, iceType, nodeDataDefaults).
 */

import { getAllHighLevelResources } from './high-level-resources.js';

// =============================================================================
// Types
// =============================================================================

export type BlueprintProvider =
  | 'aws'
  | 'gcp'
  | 'azure'
  | 'kubernetes'
  | 'alibaba'
  | 'oci'
  | 'digitalocean';

export interface BlueprintProviderVariant {
  /** Which provider this variant applies to */
  provider: BlueprintProvider;
  /** Sparse data overrides merged into nodeData */
  dataOverrides?: Record<string, unknown>;
}

export interface GeneratedBlueprint {
  /** Palette block type, e.g. 'static-site' */
  blockType: string;
  /** Maps to HIGH_LEVEL_CATEGORIES resource ID */
  resourceId: string;
  /** Human-readable name */
  name: string;
  /** Short description */
  description: string;
  /** Icon name */
  icon: string;
  /** Category in the palette */
  category: string;
  /** Supported cloud providers (from schema unless overridden) */
  providers: BlueprintProvider[];
  /** The flat card's data fields */
  nodeData: Record<string, unknown>;
  /** Provider-specific overrides */
  providerVariants?: BlueprintProviderVariant[];
}

// =============================================================================
// Overrides interface
// =============================================================================

export interface BlueprintOverrides {
  /** Palette drag type (required — UI concern) */
  blockType: string;
  /** Palette category grouping (required — UI concern) */
  category: string;
  /** Override schema name (e.g., 'Service' instead of 'Container Service') */
  name?: string;
  /** Override schema description */
  description?: string;
  /** Override schema icon */
  icon?: string;
  /** Override schema providers (e.g., SQS is AWS-only) */
  providers?: BlueprintProvider[];
  /** Sensible UI defaults merged into nodeData (iceType, runtime, port, etc.) */
  nodeDataDefaults?: Record<string, unknown>;
  /** Provider-specific overrides (dataOverrides only — no cost) */
  providerVariants?: BlueprintProviderVariant[];
}

// =============================================================================
// Factory function
// =============================================================================

/**
 * Build a BlockBlueprint by merging HIGH_LEVEL_CATEGORIES data
 * with UI-specific overrides.
 *
 * From schema: name, description, behavior, providers[], icon
 * From overrides: blockType, category, nodeDataDefaults, providerVariants
 *
 * @param resourceId - ID in HIGH_LEVEL_CATEGORIES (e.g., 'postgres-db')
 * @param overrides - UI-specific configuration
 */
export function createBlueprintFromResource(
  resourceId: string,
  overrides: BlueprintOverrides
): GeneratedBlueprint {
  const resource = getAllHighLevelResources().find((r) => r.id === resourceId);
  if (!resource) {
    throw new Error(
      `[blueprint-factory] No high-level resource found for resourceId: "${resourceId}". ` +
        `Check that the ID matches an entry in HIGH_LEVEL_CATEGORIES.`
    );
  }

  // Build nodeData: behavior from schema + UI defaults
  const nodeData: Record<string, unknown> = {
    behavior: resource.behavior,
    ...overrides.nodeDataDefaults,
  };

  return {
    blockType: overrides.blockType,
    resourceId,
    name: overrides.name ?? resource.name,
    description: overrides.description ?? resource.description,
    icon: overrides.icon ?? resource.icon,
    category: overrides.category,
    providers: (overrides.providers ?? resource.providers) as BlueprintProvider[],
    nodeData,
    providerVariants: overrides.providerVariants,
  };
}

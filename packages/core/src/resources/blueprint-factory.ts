/**
 * Blueprint Factory
 *
 * Generates BlockBlueprint objects from HIGH_LEVEL_CATEGORIES data
 * merged with UI-specific overrides. This makes the schemas layer
 * the single source of truth for providers[], name, description,
 * and behavior — while the UI controls presentation details
 * (iceType, category, nodeDataDefaults).
 */

import { getAllHighLevelResources } from './high-level-resources';

// =============================================================================
// Types
// =============================================================================

export type BlueprintProvider = 'aws' | 'gcp' | 'azure' | 'kubernetes' | 'alibaba' | 'oci' | 'digitalocean';

export interface BlueprintProviderVariant {
  /** Which provider this variant applies to */
  provider: BlueprintProvider;
  /** Sparse data overrides merged into nodeData */
  dataOverrides?: Record<string, unknown>;
}

export interface GeneratedBlueprint {
  /** Canonical block type in {Category}.{Resource} format, e.g. 'Database.PostgreSQL' */
  iceType: string;
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
  /** Canonical block type in {Category}.{Resource} format, e.g. 'Database.PostgreSQL' */
  iceType: string;
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
 * From overrides: iceType, category, nodeDataDefaults, providerVariants
 *
 * @param resourceId - ID in HIGH_LEVEL_CATEGORIES (e.g., 'postgres-db')
 * @param overrides - UI-specific configuration
 */
export function createBlueprintFromResource(resourceId: string, overrides: BlueprintOverrides): GeneratedBlueprint {
  const resource = getAllHighLevelResources().find((r) => r.id === resourceId);
  if (!resource) {
    throw new Error(
      `[blueprint-factory] No high-level resource found for resourceId: "${resourceId}". ` +
        `Check that the ID matches an entry in HIGH_LEVEL_CATEGORIES.`,
    );
  }

  // Build nodeData: behavior from schema + UI defaults
  // Auto-inject iceType into nodeData so blueprints don't need to duplicate it
  const nodeData: Record<string, unknown> = {
    behavior: resource.behavior,
    iceType: overrides.iceType,
    ...overrides.nodeDataDefaults,
  };

  return {
    iceType: overrides.iceType,
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

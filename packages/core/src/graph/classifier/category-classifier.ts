/**
 * Category Classifier
 *
 * Automatically classifies infrastructure resources into categories
 * for view level filtering (L1/L2/L3).
 */

import {
  type NodeCategory,
  PREFIX_TO_CATEGORY,
  TYPE_TO_CATEGORY,
  LEVEL_VISIBLE_CATEGORIES,
  NETWORK_CONTAINER_TYPES,
  L1_VISIBLE_NETWORK_TYPES,
} from '@ice/constants';

// =============================================================================
// Classification Functions
// =============================================================================

/**
 * Classify a resource type into a category.
 *
 * @param resourceType - The ICE resource type (e.g., "Database.PostgreSQL")
 * @returns The category for the resource type
 */
export function classify_resource(resourceType: string): NodeCategory {
  // Check explicit mapping first
  if (TYPE_TO_CATEGORY[resourceType]) {
    return TYPE_TO_CATEGORY[resourceType];
  }

  // Fall back to prefix-based classification
  const prefix = resourceType.split('.')[0] ?? '';
  if (prefix && PREFIX_TO_CATEGORY[prefix]) {
    return PREFIX_TO_CATEGORY[prefix];
  }

  // Default to Compute for unknown types
  return 'Compute';
}

/**
 * Check if a category is visible at a given view level.
 *
 * @param category - The node category
 * @param level - The view level (1, 2, or 3)
 * @returns true if the category is visible at the level
 */
export function is_category_visible_at_level(category: NodeCategory, level: 1 | 2 | 3): boolean {
  return LEVEL_VISIBLE_CATEGORIES[level].includes(category);
}

/**
 * Check if a resource type is visible at a given view level.
 * Applies special rules for network types at L1.
 *
 * @param resourceType - The ICE resource type
 * @param level - The view level (1, 2, or 3)
 * @returns true if the resource type is visible at the level
 */
export function is_resource_visible_at_level(resourceType: string, level: 1 | 2 | 3): boolean {
  // L1 special handling: show certain network types (gateways, load balancers)
  if (level === 1 && (L1_VISIBLE_NETWORK_TYPES as readonly string[]).includes(resourceType)) {
    return true;
  }

  const category = classify_resource(resourceType);
  return is_category_visible_at_level(category, level);
}

/**
 * Check if a resource type is a container type (VPC, Subnet).
 * These should be rendered as containers at L2.
 *
 * @param resourceType - The ICE resource type
 * @returns true if it's a container type
 */
export function is_container_type(resourceType: string): boolean {
  return (NETWORK_CONTAINER_TYPES as readonly string[]).includes(resourceType);
}

/**
 * Get all resource types for a given category.
 *
 * @param category - The node category
 * @returns Array of resource types in that category
 */
export function get_types_by_category(category: NodeCategory): string[] {
  return Object.entries(TYPE_TO_CATEGORY)
    .filter(([_, cat]) => cat === category)
    .map(([type]) => type);
}

// =============================================================================
// Exports
// =============================================================================

export {
  TYPE_TO_CATEGORY,
  PREFIX_TO_CATEGORY,
  LEVEL_VISIBLE_CATEGORIES,
  NETWORK_CONTAINER_TYPES,
  L1_VISIBLE_NETWORK_TYPES,
};

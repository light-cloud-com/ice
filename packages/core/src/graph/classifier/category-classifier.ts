/**
 * Category Classifier
 *
 * Automatically classifies infrastructure resources into categories
 * for view level filtering (L1/L2/L3).
 */

import type { NodeCategory } from '../../types/graph.js';

// =============================================================================
// Resource Type to Category Mapping
// =============================================================================

/**
 * Mapping of resource type prefixes to categories.
 * Used for quick prefix-based classification.
 */
const PREFIX_TO_CATEGORY: Record<string, NodeCategory> = {
  Application: 'Compute',
  Database: 'Data',
  Storage: 'Data',
  Network: 'Network',
  Security: 'Security',
  Monitoring: 'Observability',
  Messaging: 'Data', // Queues and streams are data flow
};

/**
 * Explicit resource type to category mapping.
 * Takes precedence over prefix-based classification.
 */
const TYPE_TO_CATEGORY: Record<string, NodeCategory> = {
  // Compute
  'Application.Container': 'Compute',
  'Application.Function': 'Compute',
  'Application.VM': 'Compute',
  'Application.CronJob': 'Compute',
  'Application.Worker': 'Compute',

  // Data (Databases)
  'Database.PostgreSQL': 'Data',
  'Database.MySQL': 'Data',
  'Database.MongoDB': 'Data',
  'Database.Redis': 'Data',
  'Database.Firestore': 'Data',
  'Database.BigTable': 'Data',
  'Database.Spanner': 'Data',
  'Database.DynamoDB': 'Data',
  'Database.SQLServer': 'Data',

  // Data (Storage)
  'Storage.Bucket': 'Data',
  'Storage.Disk': 'Data',
  'Storage.FileStore': 'Data',

  // Data (Messaging)
  'Messaging.Queue': 'Data',
  'Messaging.Topic': 'Data',
  'Messaging.PubSub': 'Data',
  'Messaging.Kafka': 'Data',
  'Messaging.SQS': 'Data',

  // Network (Infrastructure)
  'Network.VPC': 'Network',
  'Network.Subnet': 'Network',
  'Network.RouteTable': 'Network',
  'Network.InternetGateway': 'Network',
  'Network.NATGateway': 'Network',
  'Network.Firewall': 'Network',

  // Network (Application-level)
  'Network.LoadBalancer': 'Network',
  'Network.CDN': 'Network',
  'Network.DNS': 'Network',
  'Network.Gateway': 'Network',
  'Network.APIGateway': 'Network',

  // Security
  'Security.Secret': 'Security',
  'Security.Key': 'Security',
  'Security.IAMRole': 'Security',
  'Security.Policy': 'Security',
  'Security.Identity': 'Security',
  'Security.SecurityGroup': 'Security',
  'Security.NetworkACL': 'Security',

  // Observability
  'Monitoring.Log': 'Observability',
  'Monitoring.Dashboard': 'Observability',
  'Monitoring.Alert': 'Observability',
  'Monitoring.Metric': 'Observability',
  'Monitoring.LogSink': 'Observability',
  'Monitoring.LogBucket': 'Observability',
  'Monitoring.LogGroup': 'Observability',
  'Monitoring.LogStream': 'Observability',
};

// =============================================================================
// Level Visibility Configuration
// =============================================================================

/**
 * Categories visible at each view level.
 * L1 = Data Flow (Compute + Data)
 * L2 = Network Topology (L1 + Network)
 * L3 = Full Infrastructure (Everything)
 */
export const LEVEL_VISIBLE_CATEGORIES: Record<1 | 2 | 3, NodeCategory[]> = {
  1: ['Compute', 'Data'], // Data Flow: services talking to each other
  2: ['Compute', 'Data', 'Network'], // Network Topology: + VPCs, subnets
  3: ['Compute', 'Data', 'Network', 'Security', 'Observability'], // Everything
};

/**
 * Network types that should be treated as containers at L2.
 */
export const NETWORK_CONTAINER_TYPES = ['Network.VPC', 'Network.Subnet'];

/**
 * Network types visible at L1 (gateways that represent entry points).
 */
export const L1_VISIBLE_NETWORK_TYPES = [
  'Network.LoadBalancer',
  'Network.Gateway',
  'Network.APIGateway',
  'Network.CDN',
];

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
  if (level === 1 && L1_VISIBLE_NETWORK_TYPES.includes(resourceType)) {
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
  return NETWORK_CONTAINER_TYPES.includes(resourceType);
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

export { TYPE_TO_CATEGORY, PREFIX_TO_CATEGORY };

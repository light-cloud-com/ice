/**
 * Containment Rules Configuration
 *
 * Defines parent-child relationships for infrastructure resources.
 * Based on the ICE schema database relationship types.
 *
 * Containment hierarchy:
 * - VPC → Subnet → (Instances, Databases, etc.)
 * - Groups contain related resources
 */

// =============================================================================
// Types
// =============================================================================

export type ContainerType =
  | 'Network.VPC'
  | 'Network.Subnet'
  | 'Group.Frontend'
  | 'Group.Services'
  | 'Group.Data'
  | 'Group.Messaging'
  | 'Group.Monitoring'
  | 'Group.External'
  | 'Group.Custom';

export interface ContainmentRule {
  parent: ContainerType;
  allowedChildren: string[];
  description: string;
}

// =============================================================================
// Containment Rules
// =============================================================================

/**
 * Static containment rules based on cloud infrastructure hierarchy
 */
export const CONTAINMENT_RULES: ContainmentRule[] = [
  // Infrastructure containers
  {
    parent: 'Network.VPC',
    allowedChildren: [
      'Network.Subnet',
      'Network.LoadBalancer',
      'Network.Gateway',
      'Network.Firewall',
      'Security.SecurityGroup',
    ],
    description: 'VPC can contain subnets and networking components',
  },
  {
    parent: 'Network.Subnet',
    allowedChildren: [
      'Compute.Container',
      'Compute.Function',
      'Compute.VM',
      'Database.PostgreSQL',
      'Database.MySQL',
      'Database.MongoDB',
      'Database.Redis',
      'Storage.Bucket',
      'Messaging.Queue',
    ],
    description: 'Subnet can contain compute and data resources',
  },

  // Organizational groups
  {
    parent: 'Group.Frontend',
    allowedChildren: [
      'Compute.Container',
      'Compute.StaticSite',
      'Compute.SSRSite',
      'Compute.Function',
      'Network.CDN',
      'Network.LoadBalancer',
      'Network.Gateway',
    ],
    description: 'Frontend group contains frontend services, CDN, and gateways',
  },
  {
    parent: 'Group.Services',
    allowedChildren: [
      'Compute.Container',
      'Compute.Function',
      'Compute.VM',
      'Compute.Worker',
      'Compute.ServerlessFunction',
      'Compute.CronJob',
      'Network.Gateway',
    ],
    description: 'Services group contains backend compute resources',
  },
  {
    parent: 'Group.Data',
    allowedChildren: [
      'Database.PostgreSQL',
      'Database.MySQL',
      'Database.MongoDB',
      'Database.Redis',
      'Database.Elasticsearch',
      'Database.DynamoDB',
      'Database.Aurora',
      'Storage.Bucket',
      'Storage.Disk',
    ],
    description: 'Data group contains databases and storage',
  },
  {
    parent: 'Group.Messaging',
    allowedChildren: [
      'Messaging.Queue',
      'Messaging.Topic',
      'Messaging.Kafka',
      'Messaging.PubSub',
      'Messaging.EventBridge',
      'Messaging.RabbitMQ',
    ],
    description: 'Messaging group contains messaging and event resources',
  },
  {
    parent: 'Group.Monitoring',
    allowedChildren: [
      'Monitoring.Log',
      'Monitoring.Alert',
      'Monitoring.Dashboard',
      'Monitoring.Terminal',
      'Monitoring.LogGroup',
    ],
    description: 'Monitoring group contains observability resources',
  },
  {
    parent: 'Group.External',
    allowedChildren: [
      'External.Payment',
      'External.Email',
      'External.SMS',
      'External.Analytics',
      'External.Auth',
      'External.Storage',
      'External.API',
      'Security.Secret',
      'Security.Key',
      'Security.IAMRole',
      'Security.Policy',
      'Security.Identity',
    ],
    description: 'External group contains third-party integrations and security',
  },
];

// =============================================================================
// Lookup Helpers
// =============================================================================

/**
 * Map for quick parent lookup: child type → allowed parent types
 */
const childToParentsMap = new Map<string, ContainerType[]>();

/**
 * Map for quick children lookup: parent type → allowed child types
 */
const parentToChildrenMap = new Map<ContainerType, string[]>();

// Build the lookup maps
for (const rule of CONTAINMENT_RULES) {
  parentToChildrenMap.set(rule.parent, rule.allowedChildren);

  for (const child of rule.allowedChildren) {
    const parents = childToParentsMap.get(child) || [];
    parents.push(rule.parent);
    childToParentsMap.set(child, parents);
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Check if a child type can be contained within a parent type
 */
export function canContain(parentType: string, childType: string): boolean {
  // User-created groups (Group.Custom) accept any child
  if (parentType === 'Group.Custom') return true;

  const allowedChildren = parentToChildrenMap.get(parentType as ContainerType);
  if (!allowedChildren) return false;

  // Check exact match
  if (allowedChildren.includes(childType)) return true;

  // Check category match (e.g., "Database.CustomDB" matches "Database.*")
  const childCategory = childType.split('.')[0];
  return allowedChildren.some((allowed) => allowed.startsWith(childCategory + '.'));
}

/**
 * Get allowed parent types for a given child type
 */
export function getAllowedParents(childType: string): ContainerType[] {
  const parents = childToParentsMap.get(childType);
  if (parents) return [...parents];

  // Check category match
  const childCategory = childType.split('.')[0];
  const categoryParents: ContainerType[] = [];

  for (const [child, parents] of childToParentsMap.entries()) {
    if (child.startsWith(childCategory + '.')) {
      for (const parent of parents) {
        if (!categoryParents.includes(parent)) {
          categoryParents.push(parent);
        }
      }
    }
  }

  return categoryParents;
}

/**
 * Get allowed child types for a given parent type
 */
export function getAllowedChildren(parentType: string): string[] {
  return parentToChildrenMap.get(parentType as ContainerType) || [];
}

/**
 * Check if a type is a container (can have children)
 */
export function isContainer(nodeType: string): boolean {
  if (parentToChildrenMap.has(nodeType as ContainerType)) return true;
  // VPC/Subnet are always containers
  if (nodeType === 'Network.VPC' || nodeType === 'Network.Subnet') return true;
  // Groups are always containers
  if (nodeType.startsWith('Group.')) return true;
  return false;
}

/**
 * Get all container types
 */
export function getContainerTypes(): ContainerType[] {
  return Array.from(parentToChildrenMap.keys());
}

/**
 * Validate if a node placement is valid based on containment rules
 */
export function validatePlacement(nodeType: string, parentType: string | null): { valid: boolean; reason?: string } {
  // If no parent, placement is always valid (top-level)
  if (!parentType) {
    return { valid: true };
  }

  // Check if parent can contain this child
  if (!canContain(parentType, nodeType)) {
    const allowedChildren = getAllowedChildren(parentType);
    return {
      valid: false,
      reason:
        allowedChildren.length > 0
          ? `${parentType} can only contain: ${allowedChildren.join(', ')}`
          : `${parentType} cannot contain other resources`,
    };
  }

  return { valid: true };
}

/**
 * Get containment depth for a node type
 * Level 0: Can be at root (Groups, VPCs)
 * Level 1: Must be in a container (resources in groups, subnets in VPC)
 * Level 2: Must be in subnet (instances, databases in VPC architecture)
 */
export function getContainmentDepth(nodeType: string): number {
  // Groups and VPCs are root level
  if (nodeType.startsWith('Group.') || nodeType === 'Network.VPC') {
    return 0;
  }

  // Subnets are level 1
  if (nodeType === 'Network.Subnet') {
    return 1;
  }

  // Check if can be direct child of root containers
  const parents = getAllowedParents(nodeType);
  const hasRootParent = parents.some((p) => p.startsWith('Group.') || p === 'Network.VPC');

  if (hasRootParent) {
    return 1;
  }

  // Everything else is level 2 (must be in subnet or similar)
  return 2;
}

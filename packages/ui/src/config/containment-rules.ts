/**
 * Containment Rules Configuration
 *
 * Defines parent-child relationships for infrastructure resources.
 * Based on the ICE schema database relationship types.
 *
 * Containment hierarchy:
 * - VPC → Subnet → (Instances, Databases, etc.)
 * - Blocks contain their underlying resources
 */

// =============================================================================
// Types
// =============================================================================

export type ContainerType =
  | 'Network.VPC'
  | 'Network.Subnet'
  | 'Block.StaticSite'
  | 'Block.ScalableBackend'
  | 'Block.Worker'
  | 'Block.Database'
  | 'Block.Cache'
  | 'Block.Storage'
  | 'Block.Gateway'
  | 'Block.Queue'
  | 'Block.ServerlessFunction'
  | 'Block.ScheduledTask'
  | 'Block.Auth'
  | 'Block.Secrets'
  | 'Block.CDN'
  | 'Block.EventStream'
  | 'Block.NoSQLDatabase'
  | 'Block.Logs'
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
      'Application.Container',
      'Application.Function',
      'Application.VM',
      'Database.PostgreSQL',
      'Database.MySQL',
      'Database.MongoDB',
      'Database.Redis',
      'Storage.Bucket',
      'Messaging.Queue',
    ],
    description: 'Subnet can contain compute and data resources',
  },

  // Block containers (Level 1 blocks containing Level 2 resources)
  {
    parent: 'Block.StaticSite',
    allowedChildren: ['Storage.Bucket', 'Network.CDN', 'Network.DNS', 'Security.Certificate'],
    description: 'Static site block contains storage and CDN resources',
  },
  {
    parent: 'Block.ScalableBackend',
    allowedChildren: [
      'Application.Container',
      'Application.Function',
      'Network.LoadBalancer',
      'Network.Gateway',
      'Database.PostgreSQL',
      'Database.MySQL',
      'Database.Redis',
      'Messaging.Queue',
    ],
    description: 'Scalable backend block contains compute, database, and messaging',
  },
  {
    parent: 'Block.Worker',
    allowedChildren: [
      'Application.Container',
      'Application.Function',
      'Messaging.Queue',
      'Messaging.Topic',
    ],
    description: 'Worker block contains compute and messaging',
  },
  {
    parent: 'Block.Database',
    allowedChildren: ['Database.PostgreSQL', 'Database.MySQL', 'Storage.Disk', 'Security.Secret'],
    description: 'Database block contains database instances and storage',
  },
  {
    parent: 'Block.Cache',
    allowedChildren: ['Database.Redis', 'Database.Memcached'],
    description: 'Cache block contains cache instances',
  },
  {
    parent: 'Block.Storage',
    allowedChildren: ['Storage.Bucket', 'Storage.Disk', 'Storage.FileStore'],
    description: 'Storage block contains storage resources',
  },
  {
    parent: 'Block.Gateway',
    allowedChildren: [
      'Network.Gateway',
      'Network.LoadBalancer',
      'Security.Certificate',
      'Security.WAF',
    ],
    description: 'Gateway block contains API gateway and security',
  },
  {
    parent: 'Block.Queue',
    allowedChildren: ['Messaging.Queue', 'Messaging.Topic', 'Messaging.DeadLetterQueue'],
    description: 'Queue block contains messaging resources',
  },
  {
    parent: 'Block.ServerlessFunction',
    allowedChildren: ['Application.Function', 'Security.IAMRole', 'Monitoring.Log'],
    description: 'Serverless function block contains function and IAM',
  },
  {
    parent: 'Block.ScheduledTask',
    allowedChildren: ['Application.CronJob', 'Application.Function', 'Messaging.Queue'],
    description: 'Scheduled task block contains cron jobs and functions',
  },
  {
    parent: 'Block.Auth',
    allowedChildren: [
      'Security.Identity',
      'Security.IAMRole',
      'Security.Policy',
      'Security.Certificate',
    ],
    description: 'Auth block contains identity and access management resources',
  },
  {
    parent: 'Block.Secrets',
    allowedChildren: ['Security.Secret', 'Security.Key'],
    description: 'Secrets block contains secrets and encryption keys',
  },
  {
    parent: 'Block.CDN',
    allowedChildren: ['Network.CDN', 'Network.DNS', 'Security.Certificate'],
    description: 'CDN block contains content delivery and DNS resources',
  },
  {
    parent: 'Block.EventStream',
    allowedChildren: ['Messaging.Queue', 'Messaging.Topic', 'Messaging.PubSub'],
    description: 'Event stream block contains messaging and pub/sub resources',
  },
  {
    parent: 'Block.NoSQLDatabase',
    allowedChildren: [
      'Database.MongoDB',
      'Database.Firestore',
      'Database.BigTable',
      'Database.Redis',
    ],
    description: 'NoSQL database block contains document and key-value stores',
  },
  {
    parent: 'Block.Logs',
    allowedChildren: ['Monitoring.Log', 'Monitoring.Alert', 'Monitoring.Dashboard'],
    description: 'Logs block contains logging and monitoring resources',
  },

  // Organizational groups (used by demo data and templates)
  {
    parent: 'Group.Frontend',
    allowedChildren: [
      'Application.Container',
      'Application.StaticSite',
      'Application.Function',
      'Network.CDN',
      'Network.LoadBalancer',
      'Block.StaticSite',
      'Block.CDN',
      'Block.Gateway',
    ],
    description: 'Frontend group contains frontend services, CDN, and related blocks',
  },
  {
    parent: 'Group.Services',
    allowedChildren: [
      'Application.Container',
      'Application.Function',
      'Application.VM',
      'Block.ScalableBackend',
      'Block.Worker',
      'Block.ServerlessFunction',
      'Block.ScheduledTask',
      'Block.Gateway',
    ],
    description: 'Services group contains backend compute resources and related blocks',
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
      'Block.Database',
      'Block.NoSQLDatabase',
      'Block.Cache',
      'Block.Storage',
    ],
    description: 'Data group contains databases, storage, and related blocks',
  },
  {
    parent: 'Group.Messaging',
    allowedChildren: [
      'Messaging.Queue',
      'Messaging.Topic',
      'Messaging.Kafka',
      'Messaging.PubSub',
      'Messaging.EventBridge',
      'Block.Queue',
      'Block.EventStream',
    ],
    description: 'Messaging group contains messaging, event resources, and related blocks',
  },
  {
    parent: 'Group.Monitoring',
    allowedChildren: [
      'Observability.Metrics',
      'Observability.Dashboard',
      'Observability.Tracing',
      'Observability.Logs',
      'Monitoring.Log',
      'Monitoring.Alert',
      'Monitoring.Dashboard',
      'Monitoring.LogGroup',
      'Block.Logs',
    ],
    description: 'Monitoring group contains observability resources and related blocks',
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
      'Block.Secrets',
      'Block.Auth',
      'Security.Secret',
      'Security.Key',
      'Security.IAMRole',
      'Security.Policy',
      'Security.Identity',
    ],
    description: 'External group contains third-party integrations and security blocks',
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
  // User-created groups (Group.Custom) accept any child — blocks, resources, anything
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
  // VPC/Subnet are always containers even if not explicitly listed
  if (nodeType === 'Network.VPC' || nodeType === 'Network.Subnet') return true;
  // User-created groups are always containers
  if (nodeType === 'Group.Custom') return true;
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
export function validatePlacement(
  nodeType: string,
  parentType: string | null
): { valid: boolean; reason?: string } {
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
 * Level 0: Can be at root (VPC, Blocks)
 * Level 1: Must be in VPC or Block (Subnet, resources in blocks)
 * Level 2: Must be in Subnet (instances, databases when not in blocks)
 */
export function getContainmentDepth(nodeType: string): number {
  // Groups, blocks, and VPCs are root level
  if (
    nodeType.startsWith('Group.') ||
    nodeType.startsWith('Block.') ||
    nodeType === 'Network.VPC'
  ) {
    return 0;
  }

  // Subnets are level 1
  if (nodeType === 'Network.Subnet') {
    return 1;
  }

  // Check if can be direct child of root containers
  const parents = getAllowedParents(nodeType);
  const hasRootParent = parents.some(
    (p) => p.startsWith('Group.') || p.startsWith('Block.') || p === 'Network.VPC'
  );

  if (hasRootParent) {
    return 1;
  }

  // Everything else is level 2 (must be in subnet or similar)
  return 2;
}

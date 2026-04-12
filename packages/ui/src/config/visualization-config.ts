/**
 * Visualization Configuration
 *
 * Centralized configuration for:
 * - View levels (1/2) with explicit resource definitions
 * - Node sizing and spacing
 * - Layout calculations
 *
 * Two-level view system:
 * - Level 1 "Basic": Developer-centric view. Blocks as compact cards with brand icons,
 *   children hidden, block-to-block edges inferred from child resource edges.
 * - Level 2 "Professional": DevOps/cloud-centric view. Everything visible.
 */

// =============================================================================
// View Levels - Explicit Resource Definitions
// =============================================================================

export type ViewLevel = 1 | 2;

/**
 * Resource categories for view level configuration
 * Each category can be toggled on/off per view level
 */
export const RESOURCE_CATEGORIES = {
  // ── Architecture-level (visible in Basic + Professional) ──────────────

  // Organizational groups
  groups: ['Group.Frontend', 'Group.Services', 'Group.Data', 'Group.Messaging', 'Group.Monitoring', 'Group.External'],

  // Application services — what runs your code
  compute: [
    'Compute.Container',
    'Compute.Function',
    'Compute.VM',
    'Compute.CronJob',
    'Compute.StaticSite',
    'Compute.SSRSite',
    'Compute.ServerlessFunction',
    'Compute.Worker',
  ],

  // Data stores
  databases: [
    'Database.PostgreSQL',
    'Database.MySQL',
    'Database.MongoDB',
    'Database.Redis',
    'Database.Firestore',
    'Database.BigTable',
    'Database.Spanner',
    'Database.DynamoDB',
  ],

  // File/object storage
  storage: ['Storage.Bucket', 'Storage.Disk', 'Storage.FileStore'],

  // Messaging & events
  messaging: [
    'Messaging.Queue',
    'Messaging.Topic',
    'Messaging.PubSub',
    'Messaging.RabbitMQ',
    'Messaging.SQS',
    'Messaging.SNS',
  ],

  // Architecture-level networking (how traffic flows between services)
  gateway: [
    'Network.Gateway',
    'Network.CDN',
    'Network.LoadBalancer',
    'Network.PublicEndpoint',
    'Network.CustomDomain',
    'Network.PrivateNetwork',
  ],

  // Auth & secrets (architecture-level — every app needs these)
  auth: ['Security.Identity', 'Security.Secret'],

  // Observability (architecture-level — logs, monitoring)
  observability: ['Monitoring.Log', 'Monitoring.Alert', 'Monitoring.Dashboard', 'Monitoring.Terminal'],

  // AI/ML
  ai: ['AI.LLMGateway', 'AI.VectorDB', 'AI.ModelServing'],

  // Analytics
  analytics: ['Analytics.DataWarehouse', 'Analytics.Search'],

  // Source & Config (provider-agnostic)
  source: ['Source.Repository'],
  config: ['Config.Environment'],

  // ── Infrastructure-level (Professional only) ─────────────────────────

  // Network infrastructure (VPCs, subnets, firewalls)
  infrastructure: ['Network.VPC', 'Network.Subnet', 'Network.Firewall', 'Network.DNS'],

  // IAM & policies (infrastructure-level security)
  iam: [
    'Security.Key',
    'Security.IAMRole',
    'Security.Policy',
    'Security.Certificate',
    'Security.SecurityGroup',
    'Security.WAF',
  ],
} as const;

export interface ViewLevelConfig {
  level: ViewLevel;
  name: string;
  description: string;
  tooltip: string;
  // Which resource categories are visible at this level
  visibleCategories: (keyof typeof RESOURCE_CATEGORIES)[];
  // Show empty containers
  showEmptyContainers: boolean;
}

export const VIEW_LEVELS: Record<ViewLevel, ViewLevelConfig> = {
  1: {
    level: 1,
    name: 'Basic',
    description: 'Architecture view — services, data, connections & flow',
    tooltip: 'Basic View (press 1)',
    visibleCategories: [
      'groups',
      'compute',
      'databases',
      'storage',
      'messaging',
      'gateway',
      'auth',
      'observability',
      'ai',
      'analytics',
      'source',
      'config',
    ],
    showEmptyContainers: false,
  },
  2: {
    level: 2,
    name: 'Professional',
    description: 'Infrastructure view — VPCs, networking, IAM & full detail',
    tooltip: 'Professional View (press 2)',
    visibleCategories: [
      'groups',
      'compute',
      'databases',
      'storage',
      'messaging',
      'gateway',
      'auth',
      'observability',
      'ai',
      'analytics',
      'source',
      'config',
      'infrastructure',
      'iam',
    ],
    showEmptyContainers: true,
  },
};

/**
 * Check if a node type is visible at a given view level.
 * Level 1 (Basic) hides networking, security, monitoring, and containers.
 * Level 2 (Professional) shows everything.
 */
export function isTypeVisibleAtLevel(nodeType: string, viewLevel: ViewLevel): boolean {
  // Level 2 shows everything
  if (viewLevel === 2) return true;

  // Level 1: check if nodeType belongs to a visible category
  const config = VIEW_LEVELS[viewLevel];
  if (!config) return true;

  for (const catKey of config.visibleCategories) {
    const types = RESOURCE_CATEGORIES[catKey];
    if ((types as readonly string[]).includes(nodeType)) return true;
  }

  // Allow nodes without a recognized iceType (custom nodes, etc.)
  if (!nodeType || nodeType === '') return true;

  // Check category prefix match (e.g., "Database.CustomDB" matches databases category)
  const prefix = nodeType.split('.')[0];
  for (const catKey of config.visibleCategories) {
    const types = RESOURCE_CATEGORIES[catKey];
    if ((types as readonly string[]).some((t) => t.startsWith(prefix + '.'))) return true;
  }

  return false;
}

/**
 * Check if an edge should be visible at a given view level.
 * Currently only Level 2 (all edges visible) is active.
 */
export function isEdgeVisibleAtLevel(edgeRelationship: string, _isInferred: boolean, viewLevel: ViewLevel): boolean {
  // Level 2 shows everything
  if (viewLevel === 2) return true;

  // Level 1: show data flow and service connections, hide infrastructure edges
  if (edgeRelationship === 'contains') return false; // containment edges hidden at L1
  return true; // connects_to, depends_on are always visible
}

// =============================================================================
// Empty Container Handling
// =============================================================================

export type EmptyContainerMode = 'collapse' | 'hide' | 'show';

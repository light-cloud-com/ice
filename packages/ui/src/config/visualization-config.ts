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
  groups: [
    'Group.Frontend',
    'Group.Services',
    'Group.Data',
    'Group.Messaging',
    'Group.Monitoring',
    'Group.External',
  ],

  // Cloud Blocks (high-level containers for Level 2 resources)
  blocks: [
    'Block.StaticSite',
    'Block.ScalableBackend',
    'Block.Worker',
    'Block.Database',
    'Block.NoSQLDatabase',
    'Block.Cache',
    'Block.Storage',
    'Block.Gateway',
    'Block.ScheduledTask',
    'Block.ServerlessFunction',
    'Block.Queue',
    'Block.EventStream',
    'Block.Logs',
    'Block.CDN',
    'Block.Auth',
    'Block.Secrets',
  ],

  // Application services — what runs your code
  compute: [
    'Application.Container',
    'Application.Function',
    'Application.VM',
    'Application.CronJob',
    'Application.StaticSite',
    'Application.SSRSite',
    'Application.ServerlessFunction',
    'Application.Worker',
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
    'Network.Internet',
  ],

  // Auth & secrets (architecture-level — every app needs these)
  auth: [
    'Security.Identity',
    'Security.Secret',
  ],

  // Observability (architecture-level — logs, monitoring)
  observability: [
    'Monitoring.Log',
    'Monitoring.Alert',
    'Monitoring.Dashboard',
    'Log.Terminal',
  ],

  // AI/ML
  ai: [
    'AI.LLMGateway',
    'AI.VectorDB',
    'AI.ModelServing',
  ],

  // Analytics
  analytics: [
    'Analytics.DataWarehouse',
    'Analytics.Search',
  ],

  // Source & Config (provider-agnostic)
  source: ['Source.Repository'],
  config: ['Config.Environment'],

  // ── Infrastructure-level (Professional only) ─────────────────────────

  // Network infrastructure (VPCs, subnets, firewalls)
  infrastructure: [
    'Network.VPC',
    'Network.Subnet',
    'Network.Firewall',
    'Network.DNS',
  ],

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
      'groups', 'blocks',
      'compute', 'databases', 'storage', 'messaging',
      'gateway', 'auth', 'observability',
      'ai', 'analytics',
      'source', 'config',
    ],
    showEmptyContainers: false,
  },
  2: {
    level: 2,
    name: 'Professional',
    description: 'Infrastructure view — VPCs, networking, IAM & full detail',
    tooltip: 'Professional View (press 2)',
    visibleCategories: [
      'groups', 'blocks',
      'compute', 'databases', 'storage', 'messaging',
      'gateway', 'auth', 'observability',
      'ai', 'analytics',
      'source', 'config',
      'infrastructure', 'iam',
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

// =============================================================================
// Edge Style Configuration
// =============================================================================

export type EdgeStyleType =
  | 'data_flow'
  | 'data_flow_explicit'
  | 'infrastructure'
  | 'security'
  | 'inferred';

export interface EdgeStyle {
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  animated?: boolean;
  markerEnd?: boolean;
}

/**
 * Edge styles for different relationship types.
 */
export const EDGE_STYLES: Record<EdgeStyleType, EdgeStyle> = {
  // Inferred data flow (dashed, animated)
  data_flow: {
    stroke: '#22c55e',
    strokeWidth: 1.5,
    strokeDasharray: '8 4',
    animated: true,
    markerEnd: true,
  },
  // Explicit data flow (solid)
  data_flow_explicit: {
    stroke: '#22c55e',
    strokeWidth: 2,
    markerEnd: true,
  },
  // Infrastructure relationships
  infrastructure: {
    stroke: '#3b82f6',
    strokeWidth: 2,
  },
  // Security relationships
  security: {
    stroke: '#f59e0b',
    strokeWidth: 1.5,
    strokeDasharray: '4 2',
  },
  // Generic inferred edge
  inferred: {
    stroke: '#8b5cf6',
    strokeWidth: 1.5,
    strokeDasharray: '6 3',
    animated: true,
  },
};

/**
 * Get the edge style based on relationship type and metadata.
 */
export function getEdgeStyle(
  relationship: string,
  isInferred: boolean = false,
  hasSecurityRule: boolean = false
): EdgeStyle {
  if (hasSecurityRule) {
    return EDGE_STYLES.security;
  }
  if (relationship === 'talks_to') {
    return isInferred ? EDGE_STYLES.data_flow : EDGE_STYLES.data_flow_explicit;
  }
  if (relationship === 'connects_to') {
    return EDGE_STYLES.data_flow_explicit;
  }
  if (isInferred) {
    return EDGE_STYLES.inferred;
  }
  return EDGE_STYLES.infrastructure;
}

/**
 * Check if an edge should be visible at a given view level.
 * Currently only Level 2 (all edges visible) is active.
 */
export function isEdgeVisibleAtLevel(
  edgeRelationship: string,
  _isInferred: boolean,
  viewLevel: ViewLevel
): boolean {
  // Level 2 shows everything
  if (viewLevel === 2) return true;

  // Level 1: show data flow and service connections, hide infrastructure edges
  if (edgeRelationship === 'contains') return false; // containment edges hidden at L1
  return true; // connects_to, depends_on are always visible
}

/**
 * Check if a node is a Cloud Block (Level 1 element)
 */
export function isBlockType(nodeType: string): boolean {
  return nodeType.startsWith('Block.') || nodeType === 'block';
}

/**
 * Check if a node is a container type (VPC, Subnet)
 */
export function isContainerType(nodeType: string): boolean {
  return nodeType === 'Network.VPC' || nodeType === 'Network.Subnet';
}

/**
 * Get the category a node type belongs to
 */
export function getNodeCategory(nodeType: string): keyof typeof RESOURCE_CATEGORIES | 'unknown' {
  for (const [category, types] of Object.entries(RESOURCE_CATEGORIES)) {
    if ((types as readonly string[]).includes(nodeType)) {
      return category as keyof typeof RESOURCE_CATEGORIES;
    }
    // Also check by prefix
    const prefix = nodeType.split('.')[0];
    if (types.some((t) => t.startsWith(prefix + '.'))) {
      return category as keyof typeof RESOURCE_CATEGORIES;
    }
  }
  return 'unknown';
}

// =============================================================================
// Empty Container Handling
// =============================================================================

export type EmptyContainerMode = 'collapse' | 'hide' | 'show';

export const EMPTY_CONTAINER_MODES: Record<
  EmptyContainerMode,
  { label: string; description: string }
> = {
  collapse: { label: 'Collapse', description: 'Show as collapsed pill' },
  hide: { label: 'Hide', description: 'Hide completely' },
  show: { label: 'Show', description: 'Show with empty state' },
};

// =============================================================================
// Layout and Sizing Configuration
// =============================================================================

export const LAYOUT = {
  // Spacing
  resourceGap: 24, // Gap between resources
  containerGap: 30, // Gap between containers (subnets)
  containerPadding: 30, // Padding inside containers
  headerHeight: 50, // Header height for containers

  // Resource sizes
  resourceWidth: 220,
  resourceHeight: 90,
  resourceMinWidth: 200,
  resourceMaxWidth: 350,

  // Container sizes
  containerMinWidth: 300,
  containerMinHeight: 150,
  containerMaxWidth: 2000,
  containerMaxHeight: 2000,

  // Collapsed pill size
  collapsedWidth: 180,
  collapsedHeight: 40,

  // Children per row
  subnetChildrenPerRow: 2,
  vpcChildrenPerRow: 3,
};

/**
 * Calculate container size based on visible children
 */
export function calculateContainerSize(
  nodeType: string,
  visibleChildCount: number,
  childrenAreContainers: boolean = false
): { width: number; height: number } {
  // Empty or collapsed
  if (visibleChildCount === 0) {
    return { width: LAYOUT.containerMinWidth, height: 80 };
  }

  const isVPC = nodeType === 'Network.VPC';
  const childrenPerRow = isVPC ? LAYOUT.vpcChildrenPerRow : LAYOUT.subnetChildrenPerRow;
  const gap = isVPC ? LAYOUT.containerGap : LAYOUT.resourceGap;

  // Child dimensions
  const childWidth = childrenAreContainers || isVPC ? 350 : LAYOUT.resourceWidth;
  const childHeight = childrenAreContainers || isVPC ? 200 : LAYOUT.resourceHeight;

  // Calculate grid
  const cols = Math.min(visibleChildCount, childrenPerRow);
  const rows = Math.ceil(visibleChildCount / childrenPerRow);

  // Calculate dimensions
  const contentWidth = cols * childWidth + (cols - 1) * gap;
  const contentHeight = rows * childHeight + (rows - 1) * gap;

  const width = Math.max(
    LAYOUT.containerMinWidth,
    Math.min(LAYOUT.containerMaxWidth, contentWidth + LAYOUT.containerPadding * 2)
  );
  const height = Math.max(
    LAYOUT.containerMinHeight,
    Math.min(
      LAYOUT.containerMaxHeight,
      contentHeight + LAYOUT.headerHeight + LAYOUT.containerPadding * 2
    )
  );

  return { width, height };
}

/**
 * Calculate child position within a container
 */
export function calculateChildPosition(
  parentType: string,
  childIndex: number,
  childIsContainer: boolean = false
): { x: number; y: number } {
  const isVPC = parentType === 'Network.VPC';
  const childrenPerRow = isVPC ? LAYOUT.vpcChildrenPerRow : LAYOUT.subnetChildrenPerRow;
  const gap = isVPC ? LAYOUT.containerGap : LAYOUT.resourceGap;

  const childWidth = childIsContainer || isVPC ? 350 : LAYOUT.resourceWidth;
  const childHeight = childIsContainer || isVPC ? 200 : LAYOUT.resourceHeight;

  const col = childIndex % childrenPerRow;
  const row = Math.floor(childIndex / childrenPerRow);

  return {
    x: LAYOUT.containerPadding + col * (childWidth + gap),
    y: LAYOUT.headerHeight + LAYOUT.containerPadding + row * (childHeight + gap),
  };
}

// =============================================================================
// Entity Type Helpers
// =============================================================================

/**
 * Check if a node is a Group type (organizational folder)
 */
export function isGroupType(nodeType: string): boolean {
  return nodeType.startsWith('Group.');
}

/**
 * Get the entity type for an iceType string.
 * Group.* → 'container', Block.* → 'block', everything else → 'resource'
 */
export function getEntityType(iceType: string): 'container' | 'block' | 'resource' {
  if (iceType.startsWith('Group.')) return 'container';
  return iceType.startsWith('Block.') ? 'block' : 'resource';
}

/**
 * Get the rendering mode for a node based on its iceType, entity type, and view level.
 * - 'compact': Card rendering (SvgCompactNode)
 * - 'container': Group/container rendering (SvgGroupNode)
 * - 'region': Background tint rendering (SvgRegionLabel) for VPC/Subnet
 * - 'log': Log terminal rendering (SvgLogNode)
 */
export function getRenderingMode(
  iceType: string,
  entityType: string,
  _viewLevel: number
): 'compact' | 'container' | 'region' | 'log' {
  // Log nodes always render as logs
  if (iceType.startsWith('Log.') || iceType === 'Observability.Logs') {
    return 'log';
  }
  // VPC/Subnet render as region labels
  if (iceType === 'Network.VPC' || iceType === 'Network.Subnet') {
    return 'region';
  }
  // Groups and blocks always render as containers (children visible at both levels)
  if (entityType === 'container' || entityType === 'block') {
    return 'container';
  }
  // Resources always render as compact cards
  return 'compact';
}

// =============================================================================
// Region Detection (for GCP imports)
// =============================================================================

export const REGION_DETECTION = {
  properties: ['region', 'zone', 'location', 'availabilityZone', '_gcp_location'],
  patterns: [
    /(?:regions|locations|zones)\/([^/]+)/,
    /(europe-\w+\d*|us-\w+\d*|asia-\w+\d*|australia-\w+\d*)/i,
  ],
  multiRegionMapping: {
    eu: 'europe-west1',
    us: 'us-central1',
    asia: 'asia-east1',
    EU: 'europe-west1',
    US: 'us-central1',
    ASIA: 'asia-east1',
  },
  globalTypes: ['Security.Secret', 'Security.Identity', 'Network.DNS'],
};

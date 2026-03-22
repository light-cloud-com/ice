/**
 * Cloud Blocks - Level 1 Abstractions
 *
 * Cloud Blocks are the highest-level abstractions in ICE, representing
 * logical deployment units that users think about when building applications.
 *
 * Block Hierarchy:
 *   Level 1: Cloud Blocks (StaticSite, ScalableBackend, DataStore, etc.)
 *   Level 2: High-Level Resources (Frontend App, Backend API, PostgreSQL)
 *   Level 3: Cloud Resources (S3, CloudFront, RDS, Lambda, etc.)
 *
 * Blocks contain:
 *   - Deployment metadata (URL, status, GitHub source)
 *   - Configuration (instance type, region, env vars)
 *   - Underlying resources (expandable)
 */

// =============================================================================
// Block Types
// =============================================================================

/**
 * Block type categories - what the block represents
 */
export type BlockType =
  | 'static-site' // Static website / SPA with CDN
  | 'scalable-backend' // Auto-scaling API / service
  | 'worker' // Background job processor
  | 'database' // Data store (SQL)
  | 'nosql-database' // NoSQL data store (DynamoDB, Firestore, MongoDB)
  | 'cache' // In-memory cache (Redis, Memcached)
  | 'storage' // File/object storage (S3, GCS)
  | 'gateway' // API Gateway / Load Balancer
  | 'scheduled-task' // Cron job / scheduled function
  | 'serverless-function' // Lambda / Cloud Function
  | 'queue' // Message queue (SQS, Pub/Sub)
  | 'event-stream' // Event streaming (Kafka, Kinesis)
  | 'logs' // Logging service (CloudWatch, Stackdriver)
  | 'cdn' // Content delivery network
  | 'auth' // Authentication service
  | 'secrets' // Secrets management
  | 'custom'; // User-defined block

/**
 * Block status - current deployment state
 */
export type BlockStatus =
  | 'active' // Running and healthy
  | 'deploying' // Deployment in progress
  | 'degraded' // Partially working
  | 'stopped' // Intentionally stopped
  | 'failed' // Deployment failed
  | 'unknown'; // Status cannot be determined

/**
 * Provider type
 */
export type CloudProvider = 'aws' | 'gcp' | 'azure' | 'kubernetes' | 'alibaba' | 'oci' | 'digitalocean' | 'custom';

// =============================================================================
// Block Definition
// =============================================================================

/**
 * Source code repository information
 */
export interface BlockSource {
  repository: string; // e.g., "github.com/org/repo"
  branch: string; // e.g., "main"
  path?: string; // e.g., "packages/frontend"
  commit?: string; // Current deployed commit SHA
}

/**
 * Deployment information
 */
export interface BlockDeployment {
  status: BlockStatus;
  url?: string; // Public URL if applicable
  internal_url?: string; // Internal service URL
  deployed_at?: string; // ISO timestamp
  deployed_by?: string; // User who deployed
  version?: string; // Deployment version/tag
  uptime?: string; // Human-readable uptime
}

/**
 * Environment variable
 */
export interface EnvVar {
  name: string;
  value?: string; // Only for non-sensitive
  secret_ref?: string; // Reference to secret store
  from_output?: string; // Reference to another block's output
}

/**
 * Block configuration
 */
export interface BlockConfig {
  // Compute
  instance_type?: string; // e.g., "t3.medium", "db.r5.large"
  replicas?: number; // Number of instances
  min_replicas?: number; // Auto-scaling min
  max_replicas?: number; // Auto-scaling max
  cpu?: number; // CPU units
  memory?: number; // Memory in MB

  // Network
  region?: string; // e.g., "us-east-1", "europe-west1"
  zones?: string[]; // Availability zones
  network?: string; // VPC/Network reference
  subnet?: string; // Subnet reference
  security_group?: string; // Security group reference
  public?: boolean; // Internet accessible

  // Storage
  storage_gb?: number; // Storage size
  storage_type?: string; // e.g., "ssd", "standard"
  backup_enabled?: boolean;
  backup_retention_days?: number;

  // Database specific
  engine_version?: string; // e.g., "16" for PostgreSQL 16
  multi_az?: boolean; // High availability
  read_replicas?: number;

  // Environment
  environment_variables?: EnvVar[];
  secrets?: string[]; // Secret references

  // Custom properties
  [key: string]: unknown;
}

/**
 * Cloud Block - The main block definition
 */
export interface CloudBlock {
  // Identity
  id: string; // Unique block ID
  name: string; // Display name (e.g., "light-cloud.com")
  type: BlockType; // Block type
  description?: string; // User description

  // Provider
  provider: CloudProvider;
  provider_config?: Record<string, unknown>; // Provider-specific config

  // Source & Deployment
  source?: BlockSource;
  deployment: BlockDeployment;

  // Configuration
  config: BlockConfig;

  // Tags for grouping/filtering
  tags: {
    environment?: string; // e.g., "production", "staging"
    team?: string; // e.g., "platform", "frontend"
    cost_center?: string;
    custom?: Record<string, string>;
  };

  // Relationships
  depends_on?: string[]; // Block IDs this depends on
  connects_to?: string[]; // Block IDs this connects to

  // Underlying resources (Level 2-3)
  resources?: string[]; // ICE resource node IDs

  // Metadata
  created_at: string;
  updated_at: string;
  created_by?: string;
}

// =============================================================================
// Block Templates
// =============================================================================

/**
 * Block template for creating new blocks
 */
export interface BlockTemplate {
  type: BlockType;
  name: string;
  display_name: string;
  description: string;
  icon: string;
  category: string;

  // Default configuration
  default_config: Partial<BlockConfig>;

  // What this block expands to
  expands_to: {
    provider: CloudProvider;
    resources: Array<{
      type: string; // High-level resource ID
      role: string; // Role in the block (e.g., "primary", "cdn", "cache")
      optional?: boolean;
    }>;
  }[];

  // Required inputs
  required_inputs: Array<{
    name: string;
    label: string;
    type: 'string' | 'number' | 'boolean' | 'select';
    description: string;
    options?: string[];
    default?: unknown;
  }>;

  // Optional features
  optional_features?: Array<{
    name: string;
    label: string;
    description: string;
    adds_resources: string[];
  }>;
}

// =============================================================================
// Block Templates Registry
// =============================================================================

export const BLOCK_TEMPLATES: BlockTemplate[] = [
  // -------------------------------------------------------------------------
  // Static Site Block
  // -------------------------------------------------------------------------
  {
    type: 'static-site',
    name: 'static-site',
    display_name: 'Static Site',
    description: 'Deploy a static website or SPA with global CDN distribution',
    icon: 'Globe',
    category: 'Frontend',

    default_config: {
      public: true,
    },

    expands_to: [
      {
        provider: 'aws',
        resources: [
          { type: 'object-storage', role: 'hosting' },
          { type: 'cdn', role: 'distribution', optional: true },
          { type: 'ssl-certificate', role: 'https', optional: true },
          { type: 'dns-zone', role: 'domain', optional: true },
        ],
      },
      {
        provider: 'gcp',
        resources: [
          { type: 'object-storage', role: 'hosting' },
          { type: 'cdn', role: 'distribution', optional: true },
        ],
      },
    ],

    required_inputs: [
      {
        name: 'name',
        label: 'Site Name',
        type: 'string',
        description: 'Name for your static site',
      },
      {
        name: 'framework',
        label: 'Framework',
        type: 'select',
        description: 'Frontend framework used',
        options: ['React', 'Vue', 'Next.js', 'Nuxt', 'Astro', 'Static HTML'],
        default: 'React',
      },
    ],

    optional_features: [
      {
        name: 'custom_domain',
        label: 'Custom Domain',
        description: 'Use your own domain name',
        adds_resources: ['dns-zone', 'ssl-certificate'],
      },
      {
        name: 'cdn',
        label: 'Global CDN',
        description: 'Enable CDN for faster global delivery',
        adds_resources: ['cdn'],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Scalable Backend Block
  // -------------------------------------------------------------------------
  {
    type: 'scalable-backend',
    name: 'scalable-backend',
    display_name: 'Scalable Backend',
    description: 'Auto-scaling API or backend service',
    icon: 'Server',
    category: 'Backend',

    default_config: {
      replicas: 2,
      min_replicas: 1,
      max_replicas: 10,
      cpu: 256,
      memory: 512,
    },

    expands_to: [
      {
        provider: 'aws',
        resources: [
          { type: 'container-service', role: 'compute' },
          { type: 'load-balancer', role: 'ingress' },
          { type: 'log-group', role: 'logging' },
        ],
      },
      {
        provider: 'gcp',
        resources: [
          { type: 'container-service', role: 'compute' },
          { type: 'load-balancer', role: 'ingress', optional: true },
        ],
      },
      {
        provider: 'kubernetes',
        resources: [
          { type: 'container-service', role: 'compute' },
          { type: 'load-balancer', role: 'ingress' },
        ],
      },
    ],

    required_inputs: [
      {
        name: 'name',
        label: 'Service Name',
        type: 'string',
        description: 'Name for your backend service',
      },
      {
        name: 'image',
        label: 'Docker Image',
        type: 'string',
        description: 'Container image to deploy',
      },
      {
        name: 'port',
        label: 'Port',
        type: 'number',
        description: 'Port the service listens on',
        default: 8080,
      },
    ],

    optional_features: [
      {
        name: 'api_gateway',
        label: 'API Gateway',
        description: 'Add API Gateway for rate limiting and auth',
        adds_resources: ['api-gateway'],
      },
      {
        name: 'auto_scaling',
        label: 'Auto Scaling',
        description: 'Scale based on traffic automatically',
        adds_resources: [],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Worker Block
  // -------------------------------------------------------------------------
  {
    type: 'worker',
    name: 'worker',
    display_name: 'Worker',
    description: 'Background job processor for async tasks',
    icon: 'Cog',
    category: 'Backend',

    default_config: {
      replicas: 1,
      cpu: 256,
      memory: 512,
    },

    expands_to: [
      {
        provider: 'aws',
        resources: [
          { type: 'container-service', role: 'worker' },
          { type: 'message-queue', role: 'job-queue', optional: true },
        ],
      },
      {
        provider: 'gcp',
        resources: [
          { type: 'container-service', role: 'worker' },
          { type: 'message-queue', role: 'job-queue', optional: true },
        ],
      },
    ],

    required_inputs: [
      {
        name: 'name',
        label: 'Worker Name',
        type: 'string',
        description: 'Name for your worker',
      },
      {
        name: 'image',
        label: 'Docker Image',
        type: 'string',
        description: 'Container image for the worker',
      },
    ],

    optional_features: [
      {
        name: 'job_queue',
        label: 'Job Queue',
        description: 'Add a message queue for job processing',
        adds_resources: ['message-queue'],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Database Block
  // -------------------------------------------------------------------------
  {
    type: 'database',
    name: 'database',
    display_name: 'Database',
    description: 'Managed database with automatic backups',
    icon: 'Database',
    category: 'Data',

    default_config: {
      storage_gb: 20,
      backup_enabled: true,
      backup_retention_days: 7,
      multi_az: false,
    },

    expands_to: [
      {
        provider: 'aws',
        resources: [
          { type: 'postgres-db', role: 'primary' },
          { type: 'secret-store', role: 'credentials' },
        ],
      },
      {
        provider: 'gcp',
        resources: [
          { type: 'postgres-db', role: 'primary' },
          { type: 'secret-store', role: 'credentials' },
        ],
      },
    ],

    required_inputs: [
      {
        name: 'name',
        label: 'Database Name',
        type: 'string',
        description: 'Name for your database',
      },
      {
        name: 'engine',
        label: 'Database Engine',
        type: 'select',
        description: 'Database engine type',
        options: ['PostgreSQL', 'MySQL', 'MongoDB'],
        default: 'PostgreSQL',
      },
      {
        name: 'size',
        label: 'Instance Size',
        type: 'select',
        description: 'Database instance size',
        options: ['Small (2 vCPU, 4GB)', 'Medium (4 vCPU, 8GB)', 'Large (8 vCPU, 16GB)'],
        default: 'Small (2 vCPU, 4GB)',
      },
    ],

    optional_features: [
      {
        name: 'high_availability',
        label: 'High Availability',
        description: 'Enable multi-AZ for automatic failover',
        adds_resources: [],
      },
      {
        name: 'read_replica',
        label: 'Read Replica',
        description: 'Add a read replica for scaling reads',
        adds_resources: ['postgres-db'],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Redis Cache Block
  // -------------------------------------------------------------------------
  {
    type: 'database',
    name: 'redis-cache',
    display_name: 'Redis Cache',
    description: 'In-memory cache for fast data access',
    icon: 'Zap',
    category: 'Data',

    default_config: {},

    expands_to: [
      {
        provider: 'aws',
        resources: [{ type: 'redis-cache', role: 'cache' }],
      },
      {
        provider: 'gcp',
        resources: [{ type: 'redis-cache', role: 'cache' }],
      },
    ],

    required_inputs: [
      {
        name: 'name',
        label: 'Cache Name',
        type: 'string',
        description: 'Name for your Redis cache',
      },
      {
        name: 'size',
        label: 'Cache Size',
        type: 'select',
        description: 'Memory size for the cache',
        options: ['Small (1.5GB)', 'Medium (3GB)', 'Large (6GB)'],
        default: 'Small (1.5GB)',
      },
    ],

    optional_features: [
      {
        name: 'cluster_mode',
        label: 'Cluster Mode',
        description: 'Enable cluster mode for horizontal scaling',
        adds_resources: [],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Scheduled Task Block
  // -------------------------------------------------------------------------
  {
    type: 'scheduled-task',
    name: 'scheduled-task',
    display_name: 'Scheduled Task',
    description: 'Run code on a schedule (cron jobs)',
    icon: 'Clock',
    category: 'Backend',

    default_config: {},

    expands_to: [
      {
        provider: 'aws',
        resources: [
          { type: 'serverless-function', role: 'task' },
          { type: 'scheduled-task', role: 'trigger' },
        ],
      },
      {
        provider: 'gcp',
        resources: [
          { type: 'serverless-function', role: 'task' },
          { type: 'scheduled-task', role: 'trigger' },
        ],
      },
    ],

    required_inputs: [
      {
        name: 'name',
        label: 'Task Name',
        type: 'string',
        description: 'Name for your scheduled task',
      },
      {
        name: 'schedule',
        label: 'Schedule (Cron)',
        type: 'string',
        description: 'Cron expression (e.g., "0 * * * *" for hourly)',
        default: '0 * * * *',
      },
      {
        name: 'runtime',
        label: 'Runtime',
        type: 'select',
        description: 'Programming language',
        options: ['Node.js', 'Python', 'Go'],
        default: 'Node.js',
      },
    ],

    optional_features: [],
  },

  // -------------------------------------------------------------------------
  // API Gateway Block
  // -------------------------------------------------------------------------
  {
    type: 'gateway',
    name: 'api-gateway',
    display_name: 'API Gateway',
    description: 'Managed API endpoint with routing, auth, and rate limiting',
    icon: 'GitBranch',
    category: 'Networking',

    default_config: {
      public: true,
    },

    expands_to: [
      {
        provider: 'aws',
        resources: [
          { type: 'api-gateway', role: 'gateway' },
          { type: 'ssl-certificate', role: 'https', optional: true },
        ],
      },
      {
        provider: 'gcp',
        resources: [{ type: 'api-gateway', role: 'gateway' }],
      },
    ],

    required_inputs: [
      {
        name: 'name',
        label: 'Gateway Name',
        type: 'string',
        description: 'Name for your API Gateway',
      },
      {
        name: 'protocol',
        label: 'Protocol',
        type: 'select',
        description: 'API protocol type',
        options: ['HTTP', 'WebSocket'],
        default: 'HTTP',
      },
    ],

    optional_features: [
      {
        name: 'custom_domain',
        label: 'Custom Domain',
        description: 'Use your own domain for the API',
        adds_resources: ['dns-zone', 'ssl-certificate'],
      },
      {
        name: 'auth',
        label: 'Authentication',
        description: 'Add authentication (JWT, API Key)',
        adds_resources: [],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Event Stream Block
  // -------------------------------------------------------------------------
  {
    type: 'event-stream',
    name: 'event-stream',
    display_name: 'Event Stream',
    description: 'Event streaming for real-time data pipelines (Kafka, Kinesis)',
    icon: 'Activity',
    category: 'Messaging',

    default_config: {},

    expands_to: [
      {
        provider: 'aws',
        resources: [{ type: 'kinesis-stream', role: 'stream' }],
      },
      {
        provider: 'gcp',
        resources: [{ type: 'dataflow', role: 'stream' }],
      },
    ],

    required_inputs: [
      {
        name: 'name',
        label: 'Stream Name',
        type: 'string',
        description: 'Name for your event stream',
      },
      {
        name: 'shards',
        label: 'Shards',
        type: 'number',
        description: 'Number of shards for throughput',
        default: 1,
      },
    ],

    optional_features: [],
  },

  // -------------------------------------------------------------------------
  // Queue Block
  // -------------------------------------------------------------------------
  {
    type: 'queue',
    name: 'queue',
    display_name: 'Message Queue',
    description: 'Message queue for async task processing (SQS, Pub/Sub)',
    icon: 'Inbox',
    category: 'Messaging',

    default_config: {},

    expands_to: [
      {
        provider: 'aws',
        resources: [{ type: 'sqs-queue', role: 'queue' }],
      },
      {
        provider: 'gcp',
        resources: [{ type: 'pubsub-topic', role: 'queue' }],
      },
    ],

    required_inputs: [
      {
        name: 'name',
        label: 'Queue Name',
        type: 'string',
        description: 'Name for your message queue',
      },
      {
        name: 'type',
        label: 'Queue Type',
        type: 'select',
        description: 'Type of queue',
        options: ['Standard', 'FIFO'],
        default: 'Standard',
      },
    ],

    optional_features: [
      {
        name: 'dead_letter',
        label: 'Dead Letter Queue',
        description: 'Add a dead letter queue for failed messages',
        adds_resources: ['sqs-queue'],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Serverless Function Block
  // -------------------------------------------------------------------------
  {
    type: 'serverless-function',
    name: 'serverless-function',
    display_name: 'Serverless Function',
    description: 'Event-driven serverless compute (Lambda, Cloud Functions)',
    icon: 'Zap',
    category: 'Compute',

    default_config: {
      memory: 256,
      timeout: 30,
    },

    expands_to: [
      {
        provider: 'aws',
        resources: [
          { type: 'lambda-function', role: 'function' },
          { type: 'iam-role', role: 'execution-role' },
        ],
      },
      {
        provider: 'gcp',
        resources: [{ type: 'cloud-function', role: 'function' }],
      },
    ],

    required_inputs: [
      {
        name: 'name',
        label: 'Function Name',
        type: 'string',
        description: 'Name for your function',
      },
      {
        name: 'runtime',
        label: 'Runtime',
        type: 'select',
        description: 'Programming language runtime',
        options: ['Node.js 20', 'Python 3.12', 'Go 1.21', 'Java 21'],
        default: 'Node.js 20',
      },
      {
        name: 'trigger',
        label: 'Trigger',
        type: 'select',
        description: 'What triggers this function',
        options: ['HTTP', 'Queue', 'Schedule', 'Event'],
        default: 'HTTP',
      },
    ],

    optional_features: [],
  },

  // -------------------------------------------------------------------------
  // NoSQL Database Block
  // -------------------------------------------------------------------------
  {
    type: 'nosql-database',
    name: 'nosql-database',
    display_name: 'NoSQL Database',
    description: 'Managed NoSQL database (DynamoDB, Firestore, MongoDB)',
    icon: 'Layers',
    category: 'Data',

    default_config: {
      backup_enabled: true,
    },

    expands_to: [
      {
        provider: 'aws',
        resources: [{ type: 'dynamodb-table', role: 'primary' }],
      },
      {
        provider: 'gcp',
        resources: [{ type: 'firestore', role: 'primary' }],
      },
    ],

    required_inputs: [
      {
        name: 'name',
        label: 'Database Name',
        type: 'string',
        description: 'Name for your NoSQL database',
      },
      {
        name: 'engine',
        label: 'Database Type',
        type: 'select',
        description: 'NoSQL database type',
        options: ['DynamoDB', 'Firestore', 'MongoDB Atlas', 'DocumentDB'],
        default: 'DynamoDB',
      },
    ],

    optional_features: [
      {
        name: 'global_tables',
        label: 'Global Replication',
        description: 'Enable multi-region replication',
        adds_resources: [],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // File Storage Block
  // -------------------------------------------------------------------------
  {
    type: 'storage',
    name: 'file-storage',
    display_name: 'File Storage',
    description: 'Object/file storage bucket (S3, GCS)',
    icon: 'HardDrive',
    category: 'Storage',

    default_config: {
      versioning: false,
      public: false,
    },

    expands_to: [
      {
        provider: 'aws',
        resources: [{ type: 's3-bucket', role: 'storage' }],
      },
      {
        provider: 'gcp',
        resources: [{ type: 'gcs-bucket', role: 'storage' }],
      },
    ],

    required_inputs: [
      {
        name: 'name',
        label: 'Bucket Name',
        type: 'string',
        description: 'Globally unique bucket name',
      },
      {
        name: 'access',
        label: 'Access Level',
        type: 'select',
        description: 'Who can access this bucket',
        options: ['Private', 'Public Read', 'Public Read/Write'],
        default: 'Private',
      },
    ],

    optional_features: [
      {
        name: 'cdn',
        label: 'CDN Distribution',
        description: 'Serve files via CDN for faster access',
        adds_resources: ['cdn'],
      },
      {
        name: 'versioning',
        label: 'Versioning',
        description: 'Keep history of file changes',
        adds_resources: [],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Logs Block
  // -------------------------------------------------------------------------
  {
    type: 'logs',
    name: 'logs',
    display_name: 'Logging',
    description: 'Centralized logging and monitoring (CloudWatch, Stackdriver)',
    icon: 'FileText',
    category: 'Observability',

    default_config: {
      retention_days: 30,
    },

    expands_to: [
      {
        provider: 'aws',
        resources: [{ type: 'cloudwatch-log-group', role: 'logs' }],
      },
      {
        provider: 'gcp',
        resources: [{ type: 'logging-sink', role: 'logs' }],
      },
    ],

    required_inputs: [
      {
        name: 'name',
        label: 'Log Group Name',
        type: 'string',
        description: 'Name for your log group',
      },
      {
        name: 'retention',
        label: 'Retention Period',
        type: 'select',
        description: 'How long to keep logs',
        options: ['7 days', '14 days', '30 days', '90 days', '1 year', 'Forever'],
        default: '30 days',
      },
    ],

    optional_features: [
      {
        name: 'alerts',
        label: 'Log Alerts',
        description: 'Get notified on specific log patterns',
        adds_resources: ['cloudwatch-alarm'],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // CDN Block
  // -------------------------------------------------------------------------
  {
    type: 'cdn',
    name: 'cdn',
    display_name: 'CDN',
    description: 'Content delivery network for global distribution',
    icon: 'Globe',
    category: 'Networking',

    default_config: {},

    expands_to: [
      {
        provider: 'aws',
        resources: [
          { type: 'cloudfront-distribution', role: 'cdn' },
          { type: 'ssl-certificate', role: 'https', optional: true },
        ],
      },
      {
        provider: 'gcp',
        resources: [{ type: 'cloud-cdn', role: 'cdn' }],
      },
    ],

    required_inputs: [
      {
        name: 'name',
        label: 'Distribution Name',
        type: 'string',
        description: 'Name for your CDN distribution',
      },
      {
        name: 'origin',
        label: 'Origin Type',
        type: 'select',
        description: 'What content to serve',
        options: ['S3 Bucket', 'Load Balancer', 'Custom Origin'],
        default: 'S3 Bucket',
      },
    ],

    optional_features: [
      {
        name: 'custom_domain',
        label: 'Custom Domain',
        description: 'Use your own domain',
        adds_resources: ['dns-record', 'ssl-certificate'],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Auth Block
  // -------------------------------------------------------------------------
  {
    type: 'auth',
    name: 'auth',
    display_name: 'Authentication',
    description: 'User authentication and identity management',
    icon: 'Shield',
    category: 'Security',

    default_config: {},

    expands_to: [
      {
        provider: 'aws',
        resources: [{ type: 'cognito-user-pool', role: 'auth' }],
      },
      {
        provider: 'gcp',
        resources: [{ type: 'firebase-auth', role: 'auth' }],
      },
    ],

    required_inputs: [
      {
        name: 'name',
        label: 'Auth Pool Name',
        type: 'string',
        description: 'Name for your auth service',
      },
      {
        name: 'providers',
        label: 'Sign-in Methods',
        type: 'select',
        description: 'How users can sign in',
        options: ['Email/Password', 'Google', 'GitHub', 'SAML'],
        default: 'Email/Password',
      },
    ],

    optional_features: [
      {
        name: 'mfa',
        label: 'Multi-Factor Auth',
        description: 'Require MFA for sign-in',
        adds_resources: [],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Secrets Block
  // -------------------------------------------------------------------------
  {
    type: 'secrets',
    name: 'secrets',
    display_name: 'Secrets Manager',
    description: 'Secure storage for secrets, API keys, and credentials',
    icon: 'Key',
    category: 'Security',

    default_config: {},

    expands_to: [
      {
        provider: 'aws',
        resources: [{ type: 'secrets-manager', role: 'secrets' }],
      },
      {
        provider: 'gcp',
        resources: [{ type: 'secret-manager', role: 'secrets' }],
      },
    ],

    required_inputs: [
      {
        name: 'name',
        label: 'Secret Name',
        type: 'string',
        description: 'Name for your secret',
      },
    ],

    optional_features: [
      {
        name: 'rotation',
        label: 'Auto Rotation',
        description: 'Automatically rotate secrets',
        adds_resources: ['lambda-function'],
      },
    ],
  },
];

// =============================================================================
// Block Categories for Palette
// =============================================================================

export const BLOCK_CATEGORIES = [
  {
    id: 'frontend',
    name: 'Frontend',
    description: 'Web apps and static sites',
    icon: 'Globe',
    blocks: BLOCK_TEMPLATES.filter((b) => b.category === 'Frontend'),
  },
  {
    id: 'compute',
    name: 'Compute',
    description: 'APIs, services, workers, and functions',
    icon: 'Server',
    blocks: BLOCK_TEMPLATES.filter((b) => b.category === 'Backend' || b.category === 'Compute'),
  },
  {
    id: 'data',
    name: 'Data',
    description: 'Databases and caches',
    icon: 'Database',
    blocks: BLOCK_TEMPLATES.filter((b) => b.category === 'Data'),
  },
  {
    id: 'storage',
    name: 'Storage',
    description: 'File and object storage',
    icon: 'HardDrive',
    blocks: BLOCK_TEMPLATES.filter((b) => b.category === 'Storage'),
  },
  {
    id: 'networking',
    name: 'Networking',
    description: 'Gateways, load balancers, and CDN',
    icon: 'Network',
    blocks: BLOCK_TEMPLATES.filter((b) => b.category === 'Networking'),
  },
  {
    id: 'messaging',
    name: 'Messaging',
    description: 'Queues and event streams',
    icon: 'MessageSquare',
    blocks: BLOCK_TEMPLATES.filter((b) => b.category === 'Messaging'),
  },
  {
    id: 'observability',
    name: 'Observability',
    description: 'Logging and monitoring',
    icon: 'Activity',
    blocks: BLOCK_TEMPLATES.filter((b) => b.category === 'Observability'),
  },
  {
    id: 'security',
    name: 'Security',
    description: 'Auth and secrets management',
    icon: 'Shield',
    blocks: BLOCK_TEMPLATES.filter((b) => b.category === 'Security'),
  },
];

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get block template by name
 */
export function getBlockTemplate(name: string): BlockTemplate | undefined {
  return BLOCK_TEMPLATES.find((t) => t.name === name);
}

/**
 * Create a new block from a template
 */
export function createBlockFromTemplate(
  template: BlockTemplate,
  inputs: Record<string, unknown>,
  provider: CloudProvider = 'aws',
): CloudBlock {
  const now = new Date().toISOString();
  const id = `block-${template.name}-${Date.now()}`;

  return {
    id,
    name: (inputs.name as string) || template.display_name,
    type: template.type,
    description: template.description,
    provider,
    deployment: {
      status: 'unknown',
    },
    config: {
      ...template.default_config,
      ...inputs,
    },
    tags: {},
    created_at: now,
    updated_at: now,
  };
}

/**
 * Get the display tag for a block type
 */
export function getBlockTypeTag(type: BlockType): { label: string; color: string } {
  const tags: Record<BlockType, { label: string; color: string }> = {
    'static-site': { label: 'Frontend', color: 'blue' },
    'scalable-backend': { label: 'Backend', color: 'green' },
    worker: { label: 'Worker', color: 'purple' },
    database: { label: 'Database', color: 'orange' },
    'nosql-database': { label: 'NoSQL', color: 'amber' },
    cache: { label: 'Cache', color: 'red' },
    storage: { label: 'Storage', color: 'cyan' },
    gateway: { label: 'Gateway', color: 'pink' },
    'scheduled-task': { label: 'Cron', color: 'yellow' },
    'serverless-function': { label: 'Function', color: 'lime' },
    queue: { label: 'Queue', color: 'violet' },
    'event-stream': { label: 'Stream', color: 'indigo' },
    logs: { label: 'Logs', color: 'slate' },
    cdn: { label: 'CDN', color: 'sky' },
    auth: { label: 'Auth', color: 'emerald' },
    secrets: { label: 'Secrets', color: 'rose' },
    custom: { label: 'Custom', color: 'gray' },
  };
  return tags[type] || tags.custom;
}

/**
 * Get provider icon
 */
export function getProviderIcon(provider: CloudProvider): string {
  const icons: Record<CloudProvider, string> = {
    aws: 'aws',
    gcp: 'gcp',
    azure: 'azure',
    kubernetes: 'kubernetes',
    alibaba: 'alibaba',
    oci: 'oci',
    digitalocean: 'digitalocean',
    custom: 'cloud',
  };
  return icons[provider];
}

/**
 * Format uptime from timestamp
 */
export function formatUptime(deployedAt?: string): string {
  if (!deployedAt) return 'Unknown';

  const deployed = new Date(deployedAt);
  const now = new Date();
  const diff = now.getTime() - deployed.getTime();

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days} day${days > 1 ? 's' : ''}`;
  }
  return `${hours} hour${hours !== 1 ? 's' : ''}`;
}

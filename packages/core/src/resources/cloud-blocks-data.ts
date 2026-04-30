/**
 * Cloud Blocks — Bulk template registry and category definitions.
 *
 * NOTE — file size exception:
 *   This file deliberately exceeds the 200–500 LOC ceiling because it is a
 *   pure data table (~926 LOC of block templates with default configs,
 *   provider expansions, required inputs, and optional features). The
 *   fragmentation cost (per-block-type files, per-category files, etc.) far
 *   outweighs the readability win — the registry is dense by design and is
 *   referenced as a single array by `getBlockTemplate` and as a category
 *   filter by `BLOCK_CATEGORIES`. Future audits should leave this file alone
 *   unless the data grows materially or a structural shape change is required.
 *
 *   Types live in `./cloud-blocks-types.ts`.
 *   Helpers (`getBlockTemplate`, `createBlockFromTemplate`, `getBlockTypeTag`,
 *   `getProviderIcon`, `formatUptime`) and the public re-export shim live in
 *   `./cloud-blocks.ts`.
 */

import type { BlockTemplate } from './cloud-blocks-types.js';

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

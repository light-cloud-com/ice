/**
 * Cloud Blocks — Data category templates.
 *
 * Templates: database, redis-cache, nosql-database.
 *
 * Part of the rf-cbdat split — see `../cloud-blocks-data.ts` for the
 * orchestrator and `../cloud-blocks-types.ts` for the shared types.
 */

import type { BlockTemplate } from '../cloud-blocks-types';

export const DATA_TEMPLATES: BlockTemplate[] = [
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
];

/**
 * Cloud Blocks — Type definitions and interfaces.
 *
 * Pure type surface for Level 1 cloud-block abstractions. Kept separate from
 * the bulk `BLOCK_TEMPLATES` registry so consumers that only need the type
 * surface (e.g., schema validators, palette components) don't have to pull in
 * the ~926 LOC template data.
 *
 * Module layout (rf-data-2 split):
 *   - this file                  — types + interfaces (BlockType, BlockStatus,
 *                                  CloudProvider, BlockSource, BlockDeployment,
 *                                  EnvVar, BlockConfig, CloudBlock, BlockTemplate)
 *   - `./cloud-blocks-data.ts`   — bulk BLOCK_TEMPLATES + BLOCK_CATEGORIES (size-exception)
 *   - `./cloud-blocks.ts`        — public re-export shim + 5 helpers
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
export type CloudProvider =
  | 'aws'
  | 'gcp'
  | 'azure'
  | 'kubernetes'
  | 'alibaba'
  | 'oci'
  | 'digitalocean'
  | 'ibm'
  | 'custom';

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

/**
 * Environment-Aware Deployment Configuration
 *
 * Applies dev/staging/prod sizing presets to deployment properties.
 * Production gets HA, bigger instances, more replicas.
 * Development gets minimal resources for cost savings.
 */

export type EnvironmentType = 'production' | 'staging' | 'development';

// =============================================================================
// Environment presets per GCP service type
// =============================================================================

interface ServicePreset {
  [key: string]: unknown;
}

const ENVIRONMENT_PRESETS: Record<string, Record<EnvironmentType, ServicePreset>> = {
  'gcp.sql.databaseInstance': {
    development: {
      tier: 'db-f1-micro',
      storage_size_gb: 10,
      high_availability: false,
      backup_enabled: false,
    },
    staging: {
      tier: 'db-custom-2-4096',
      storage_size_gb: 20,
      high_availability: false,
      backup_enabled: true,
    },
    production: {
      tier: 'db-custom-4-8192',
      storage_size_gb: 50,
      high_availability: true,
      backup_enabled: true,
    },
  },
  'gcp.run.service': {
    development: { min_instances: 0, max_instances: 1, cpu: '1', memory: '256Mi' },
    staging: { min_instances: 1, max_instances: 3, cpu: '1', memory: '512Mi' },
    production: { min_instances: 2, max_instances: 10, cpu: '2', memory: '1Gi' },
  },
  'gcp.run.job': {
    development: { cpu: '1', memory: '256Mi', max_retries: 1 },
    staging: { cpu: '1', memory: '512Mi', max_retries: 2 },
    production: { cpu: '2', memory: '1Gi', max_retries: 3 },
  },
  'gcp.redis.instance': {
    development: { tier: 'BASIC', memory_size_gb: 1 },
    staging: { tier: 'BASIC', memory_size_gb: 2 },
    production: { tier: 'STANDARD_HA', memory_size_gb: 5 },
  },
  'gcp.cloudfunctions.function': {
    development: { memory_mb: 128, timeout_seconds: 30 },
    staging: { memory_mb: 256, timeout_seconds: 60 },
    production: { memory_mb: 512, timeout_seconds: 120 },
  },
  'gcp.bigquery.dataset': {
    development: {},
    staging: {},
    production: {},
  },
  'gcp.pubsub.topic': {
    development: {},
    staging: {},
    production: { message_retention_duration: '604800s' },
  },
  'gcp.container.cluster': {
    development: { initial_node_count: 1, machine_type: 'e2-small' },
    staging: { initial_node_count: 2, machine_type: 'e2-standard-2' },
    production: { initial_node_count: 3, machine_type: 'e2-standard-4' },
  },
};

// =============================================================================
// Apply overrides
// =============================================================================

/**
 * Apply environment-specific overrides to deployment properties.
 * Only overrides fields that have a preset — user-specified values take priority.
 */
export function apply_environment_overrides(
  properties: Record<string, unknown>,
  gcp_type: string,
  environment: EnvironmentType,
): Record<string, unknown> {
  const presets = ENVIRONMENT_PRESETS[gcp_type];
  if (!presets) return properties;

  const env_preset = presets[environment];
  if (!env_preset) return properties;

  // Merge: preset values serve as defaults, user values take priority
  const merged = { ...env_preset };
  for (const [key, value] of Object.entries(properties)) {
    if (value !== undefined && value !== null) {
      merged[key] = value;
    }
  }

  return merged as Record<string, unknown>;
}

/**
 * Get the environment label for display purposes.
 */
export function get_environment_label(env: EnvironmentType): string {
  switch (env) {
    case 'development':
      return 'Development';
    case 'staging':
      return 'Staging';
    case 'production':
      return 'Production';
  }
}

/**
 * Get estimated monthly cost multiplier per environment.
 */
export function get_cost_multiplier(env: EnvironmentType): number {
  switch (env) {
    case 'development':
      return 0.3;
    case 'staging':
      return 0.6;
    case 'production':
      return 1.0;
  }
}

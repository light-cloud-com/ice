/**
 * Scale Presets — Bulk preset data dictionary.
 *
 * NOTE — file size exception:
 *   This file deliberately exceeds the 200–500 LOC ceiling because it is a
 *   pure data table (~1450 LOC of tier × resource × provider preset values).
 *   The fragmentation cost (per-resource files, per-category files, etc.) far
 *   outweighs the readability win — the table is dense by design and is
 *   referenced as a single dict by `getScalePreset`. Future audits should
 *   leave this file alone unless the data grows materially or a structural
 *   shape change is required.
 *
 *   Types live in `./scale-presets-types.ts`.
 *   Helpers (`getScalePreset`, `getAllPresetsForResource`) and the public
 *   re-export shim live in `./scale-presets.ts`.
 */

import type { ScaleTier, TierPreset } from './scale-presets-types.js';

// ─── Presets ───────────────────────────────────────────────────────────────
// Key = resource ID from HIGH_LEVEL_CATEGORIES
// For each tier: common props + _providers for instance-size overrides

export const SCALE_PRESETS: Record<string, Partial<Record<ScaleTier, TierPreset>>> = {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // COMPUTE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  'frontend-app': {
    dev: {
      fast_worldwide: false,
      _providers: {
        aws: { size: 'amplify-free' },
        gcp: { size: 'firebase-free' },
        azure: { size: 'azure-free' },
      },
    },
    low: {
      fast_worldwide: true,
      _providers: {
        aws: { size: 'amplify-free' },
        gcp: { size: 'firebase-free' },
        azure: { size: 'azure-free' },
      },
    },
    moderate: {
      fast_worldwide: true,
      _providers: {
        aws: { size: 'amplify-standard' },
        gcp: { size: 'firebase-blaze' },
        azure: { size: 'azure-standard' },
      },
    },
    medium: {
      fast_worldwide: true,
      _providers: {
        aws: { size: 'amplify-standard' },
        gcp: { size: 'firebase-blaze' },
        azure: { size: 'azure-standard' },
      },
    },
    high: {
      fast_worldwide: true,
      _providers: {
        aws: { size: 'amplify-standard' },
        gcp: { size: 'firebase-blaze' },
        azure: { size: 'azure-standard' },
      },
    },
    'very-high': {
      fast_worldwide: true,
      _providers: {
        aws: { size: 'amplify-standard' },
        gcp: { size: 'firebase-blaze' },
        azure: { size: 'azure-standard' },
      },
    },
  },

  'backend-api': {
    dev: {
      _providers: {
        aws: { size: '0.25-512' },
        gcp: { size: 'gcp-1-512' },
        azure: { size: 'azure-0.25-0.5' },
      },
    },
    low: {
      _providers: {
        aws: { size: '0.25-512' },
        gcp: { size: 'gcp-1-512' },
        azure: { size: 'azure-0.25-0.5' },
      },
    },
    moderate: {
      _providers: {
        aws: { size: '0.5-1024' },
        gcp: { size: 'gcp-2-1024' },
        azure: { size: 'azure-0.5-1' },
      },
    },
    medium: {
      _providers: {
        aws: { size: '1-2048' },
        gcp: { size: 'gcp-4-2048' },
        azure: { size: 'azure-1-2' },
      },
    },
    high: {
      _providers: {
        aws: { size: '2-4096' },
        gcp: { size: 'gcp-4-2048' },
        azure: { size: 'azure-1-2' },
      },
    },
    'very-high': {
      _providers: {
        aws: { size: '4-8192' },
        gcp: { size: 'gcp-4-2048' },
        azure: { size: 'azure-1-2' },
      },
    },
  },

  'serverless-function': {
    dev: {
      memory: '128',
      timeout: '3',
      _providers: {
        aws: { memory: '128' },
        gcp: { memory: '128-200mhz' },
      },
    },
    low: {
      memory: '256',
      timeout: '30',
      _providers: {
        aws: { memory: '256' },
        gcp: { memory: '256-400mhz' },
      },
    },
    moderate: {
      memory: '512',
      timeout: '60',
      _providers: {
        aws: { memory: '512' },
        gcp: { memory: '512-800mhz' },
      },
    },
    medium: {
      memory: '1024',
      timeout: '60',
      _providers: {
        aws: { memory: '1024' },
        gcp: { memory: '1024-1400mhz' },
      },
    },
    high: {
      memory: '2048',
      timeout: '300',
      _providers: {
        aws: { memory: '2048' },
        gcp: { memory: '2048-2800mhz' },
      },
    },
    'very-high': {
      memory: '4096',
      timeout: '900',
      _providers: {
        aws: { memory: '4096' },
        gcp: { memory: '4096-4800mhz' },
      },
    },
  },

  'function-compute': {
    dev: { memory: '128' },
    low: { memory: '256' },
    moderate: { memory: '512' },
    medium: { memory: '1024' },
    high: { memory: '3072' },
    'very-high': { memory: '3072' },
  },

  'oci-functions': {
    dev: { memory: '128' },
    low: { memory: '256' },
    moderate: { memory: '512' },
    medium: { memory: '1024' },
    high: { memory: '2048' },
    'very-high': { memory: '2048' },
  },

  'do-app-platform': {
    dev: { size: 'basic-xxs' },
    low: { size: 'basic-xs' },
    moderate: { size: 'basic-s' },
    medium: { size: 'pro-xs' },
    high: { size: 'pro-s' },
    'very-high': { size: 'pro-m' },
  },

  'container-service': {
    dev: {
      _providers: {
        aws: { size: '0.25-512' },
        gcp: { size: 'gcp-1-512' },
        azure: { size: 'azure-0.25-0.5' },
      },
    },
    low: {
      _providers: {
        aws: { size: '0.5-1024' },
        gcp: { size: 'gcp-1-512' },
        azure: { size: 'azure-0.5-1' },
      },
    },
    moderate: {
      _providers: {
        aws: { size: '1-2048' },
        gcp: { size: 'gcp-2-1024' },
        azure: { size: 'azure-0.5-1' },
      },
    },
    medium: {
      _providers: {
        aws: { size: '2-4096' },
        gcp: { size: 'gcp-4-2048' },
        azure: { size: 'azure-1-2' },
      },
    },
    high: {
      _providers: {
        aws: { size: '4-8192' },
        gcp: { size: 'gcp-4-2048' },
        azure: { size: 'azure-1-2' },
      },
    },
    'very-high': {
      _providers: {
        aws: { size: '4-8192' },
        gcp: { size: 'gcp-4-2048' },
        azure: { size: 'azure-1-2' },
      },
    },
  },

  worker: {
    dev: {
      _providers: {
        aws: { size: '0.25-512' },
        gcp: { size: 'gcp-1-512' },
        azure: { size: 'azure-0.5-1' },
      },
    },
    low: {
      _providers: {
        aws: { size: '0.5-1024' },
        gcp: { size: 'gcp-1-512' },
        azure: { size: 'azure-0.5-1' },
      },
    },
    moderate: {
      _providers: {
        aws: { size: '0.5-1024' },
        gcp: { size: 'gcp-2-1024' },
        azure: { size: 'azure-1-2' },
      },
    },
    medium: {
      _providers: {
        aws: { size: '1-2048' },
        gcp: { size: 'gcp-4-2048' },
        azure: { size: 'azure-1-2' },
      },
    },
    high: {
      _providers: {
        aws: { size: '2-4096' },
        gcp: { size: 'gcp-4-2048' },
        azure: { size: 'azure-2-4' },
      },
    },
    'very-high': {
      _providers: {
        aws: { size: '4-8192' },
        gcp: { size: 'gcp-4-2048' },
        azure: { size: 'azure-2-4' },
      },
    },
  },

  'ssr-site': {
    dev: {
      _providers: {
        aws: { size: 'amplify-standard' },
        gcp: { size: 'gcp-1-512' },
        azure: { size: 'azure-B1' },
      },
    },
    low: {
      _providers: {
        aws: { size: 'amplify-standard' },
        gcp: { size: 'gcp-1-512' },
        azure: { size: 'azure-B1' },
      },
    },
    moderate: {
      _providers: {
        aws: { size: '0.5-1024' },
        gcp: { size: 'gcp-2-1024' },
        azure: { size: 'azure-S1' },
      },
    },
    medium: {
      _providers: {
        aws: { size: '1-2048' },
        gcp: { size: 'gcp-2-1024' },
        azure: { size: 'azure-S1' },
      },
    },
    high: {
      _providers: {
        aws: { size: '2-4096' },
        gcp: { size: 'gcp-4-2048' },
        azure: { size: 'azure-P1v3' },
      },
    },
    'very-high': {
      _providers: {
        aws: { size: '2-4096' },
        gcp: { size: 'gcp-4-2048' },
        azure: { size: 'azure-P1v3' },
      },
    },
  },

  'scheduled-task': {
    // Scheduled tasks don't scale — same config at all tiers
    dev: { frequency: 'Every day at midnight', timezone: 'UTC' },
    low: { frequency: 'Every day at midnight', timezone: 'UTC' },
    moderate: { frequency: 'Every hour', timezone: 'UTC' },
    medium: { frequency: 'Every hour', timezone: 'UTC' },
    high: { frequency: 'Every 5 minutes', timezone: 'UTC' },
    'very-high': { frequency: 'Every minute', timezone: 'UTC' },
  },

  'llm-gateway': {
    dev: { model: 'claude-haiku', fallback: false },
    low: { model: 'claude-haiku', fallback: false },
    moderate: { model: 'claude-sonnet', fallback: true },
    medium: { model: 'claude-sonnet', fallback: true },
    high: { model: 'claude-sonnet', fallback: true },
    'very-high': { model: 'claude-opus', fallback: true },
  },

  'ml-model': {
    dev: {
      _providers: {
        aws: { size: 'ml.t3.medium' },
        gcp: { size: 'n1-standard-4-t4' },
        azure: { size: 'Standard_NC4as_T4_v3' },
      },
    },
    low: {
      _providers: {
        aws: { size: 'ml.g5.xlarge' },
        gcp: { size: 'n1-standard-4-t4' },
        azure: { size: 'Standard_NC4as_T4_v3' },
      },
    },
    moderate: {
      _providers: {
        aws: { size: 'ml.g5.xlarge' },
        gcp: { size: 'n1-standard-8-l4' },
        azure: { size: 'Standard_NC4as_T4_v3' },
      },
    },
    medium: {
      _providers: {
        aws: { size: 'ml.g5.2xlarge' },
        gcp: { size: 'n1-standard-8-l4' },
        azure: { size: 'Standard_NC24ads_A100_v4' },
      },
    },
    high: {
      _providers: {
        aws: { size: 'ml.p3.2xlarge' },
        gcp: { size: 'a2-highgpu-1g' },
        azure: { size: 'Standard_NC24ads_A100_v4' },
      },
    },
    'very-high': {
      _providers: {
        aws: { size: 'ml.p4d.24xlarge' },
        gcp: { size: 'a2-highgpu-1g' },
        azure: { size: 'Standard_NC24ads_A100_v4' },
      },
    },
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // DATABASE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  'postgres-db': {
    dev: {
      storage: '20',
      version: '17',
      production: false,
      backup_retention: '1',
      _providers: {
        aws: { size: 'db.t3.micro' },
        gcp: { size: 'db-f1-micro' },
        azure: { size: 'B_Standard_B1ms' },
        digitalocean: { size: 'db-s-1vcpu-1gb' },
      },
    },
    low: {
      storage: '20',
      version: '17',
      production: false,
      backup_retention: '7',
      _providers: {
        aws: { size: 'db.t3.small' },
        gcp: { size: 'db-g1-small' },
        azure: { size: 'B_Standard_B1ms' },
        digitalocean: { size: 'db-s-1vcpu-1gb' },
      },
    },
    moderate: {
      storage: '50',
      version: '17',
      production: true,
      backup_retention: '7',
      _providers: {
        aws: { size: 'db.t3.medium' },
        gcp: { size: 'db-custom-2-8192' },
        azure: { size: 'GP_Standard_D2s_v3' },
        digitalocean: { size: 'db-s-2vcpu-4gb' },
      },
    },
    medium: {
      storage: '100',
      version: '17',
      production: true,
      backup_retention: '14',
      _providers: {
        aws: { size: 'db.r6g.large' },
        gcp: { size: 'db-custom-4-16384' },
        azure: { size: 'GP_Standard_D4s_v3' },
        digitalocean: { size: 'db-s-4vcpu-8gb' },
      },
    },
    high: {
      storage: '500',
      version: '17',
      production: true,
      backup_retention: '30',
      _providers: {
        aws: { size: 'db.r6g.xlarge' },
        gcp: { size: 'db-custom-8-32768' },
        azure: { size: 'GP_Standard_D8s_v3' },
        digitalocean: { size: 'db-s-4vcpu-8gb' },
      },
    },
    'very-high': {
      storage: '1000',
      version: '17',
      production: true,
      backup_retention: '35',
      _providers: {
        aws: { size: 'db.r6g.2xlarge' },
        gcp: { size: 'db-custom-16-65536' },
        azure: { size: 'GP_Standard_D16s_v3' },
        digitalocean: { size: 'db-s-4vcpu-8gb' },
      },
    },
  },

  'mysql-db': {
    dev: {
      storage: '20',
      version: '8.4',
      production: false,
      backup_retention: '1',
      _providers: {
        aws: { size: 'db.t3.micro' },
        gcp: { size: 'db-f1-micro' },
        azure: { size: 'B_Standard_B1ms' },
        digitalocean: { size: 'db-s-1vcpu-1gb' },
      },
    },
    low: {
      storage: '20',
      version: '8.4',
      production: false,
      backup_retention: '7',
      _providers: {
        aws: { size: 'db.t3.small' },
        gcp: { size: 'db-g1-small' },
        azure: { size: 'B_Standard_B1ms' },
        digitalocean: { size: 'db-s-1vcpu-1gb' },
      },
    },
    moderate: {
      storage: '50',
      version: '8.4',
      production: true,
      backup_retention: '7',
      _providers: {
        aws: { size: 'db.t3.medium' },
        gcp: { size: 'db-custom-2-8192' },
        azure: { size: 'GP_Standard_D2s_v3' },
        digitalocean: { size: 'db-s-2vcpu-4gb' },
      },
    },
    medium: {
      storage: '100',
      version: '8.4',
      production: true,
      backup_retention: '14',
      _providers: {
        aws: { size: 'db.r6g.large' },
        gcp: { size: 'db-custom-4-16384' },
        azure: { size: 'GP_Standard_D4s_v3' },
        digitalocean: { size: 'db-s-4vcpu-8gb' },
      },
    },
    high: {
      storage: '500',
      version: '8.4',
      production: true,
      backup_retention: '30',
      _providers: {
        aws: { size: 'db.r6g.xlarge' },
        gcp: { size: 'db-custom-8-32768' },
        azure: { size: 'GP_Standard_D8s_v3' },
        digitalocean: { size: 'db-s-4vcpu-8gb' },
      },
    },
    'very-high': {
      storage: '1000',
      version: '8.4',
      production: true,
      backup_retention: '35',
      _providers: {
        aws: { size: 'db.r6g.2xlarge' },
        gcp: { size: 'db-custom-16-65536' },
        azure: { size: 'GP_Standard_D16s_v3' },
        digitalocean: { size: 'db-s-4vcpu-8gb' },
      },
    },
  },

  mongodb: {
    dev: {
      storage: '20',
      version: '7.0',
      production: false,
      _providers: {
        aws: { size: 'db.t3.medium' },
        azure: { size: 'cosmos-serverless' },
        digitalocean: { size: 'db-s-1vcpu-1gb' },
      },
    },
    low: {
      storage: '50',
      version: '7.0',
      production: false,
      _providers: {
        aws: { size: 'db.t3.medium' },
        azure: { size: 'cosmos-400' },
        digitalocean: { size: 'db-s-1vcpu-2gb' },
      },
    },
    moderate: {
      storage: '100',
      version: '7.0',
      production: true,
      _providers: {
        aws: { size: 'db.r6g.large' },
        azure: { size: 'cosmos-1000' },
        digitalocean: { size: 'db-s-2vcpu-4gb' },
      },
    },
    medium: {
      storage: '250',
      version: '7.0',
      production: true,
      _providers: {
        aws: { size: 'db.r6g.xlarge' },
        azure: { size: 'cosmos-autoscale' },
        digitalocean: { size: 'db-s-4vcpu-8gb' },
      },
    },
    high: {
      storage: '500',
      version: '7.0',
      production: true,
      _providers: {
        aws: { size: 'db.r6g.2xlarge' },
        azure: { size: 'cosmos-autoscale-10k' },
        digitalocean: { size: 'db-s-4vcpu-8gb' },
      },
    },
    'very-high': {
      storage: '1000',
      version: '7.0',
      production: true,
      _providers: {
        aws: { size: 'db.r6g.4xlarge' },
        azure: { size: 'cosmos-autoscale-10k' },
        digitalocean: { size: 'db-s-4vcpu-8gb' },
      },
    },
  },

  'redis-cache': {
    dev: {
      keep_data_safe: false,
      version: '7.x',
      max_memory_policy: 'allkeys-lru',
      _providers: {
        aws: { size: 'cache.t3.micro' },
        gcp: { size: 'M1' },
        azure: { size: 'C0' },
        digitalocean: { size: 'db-s-1vcpu-1gb' },
      },
    },
    low: {
      keep_data_safe: false,
      version: '7.x',
      max_memory_policy: 'allkeys-lru',
      _providers: {
        aws: { size: 'cache.t3.small' },
        gcp: { size: 'M1' },
        azure: { size: 'C1' },
        digitalocean: { size: 'db-s-1vcpu-1gb' },
      },
    },
    moderate: {
      keep_data_safe: false,
      version: '7.x',
      max_memory_policy: 'allkeys-lru',
      _providers: {
        aws: { size: 'cache.t3.medium' },
        gcp: { size: 'M2' },
        azure: { size: 'C2' },
        digitalocean: { size: 'db-s-1vcpu-2gb' },
      },
    },
    medium: {
      keep_data_safe: true,
      version: '7.x',
      max_memory_policy: 'allkeys-lru',
      _providers: {
        aws: { size: 'cache.r6g.large' },
        gcp: { size: 'M2' },
        azure: { size: 'C3' },
        digitalocean: { size: 'db-s-2vcpu-4gb' },
      },
    },
    high: {
      keep_data_safe: true,
      version: '7.x',
      max_memory_policy: 'allkeys-lru',
      _providers: {
        aws: { size: 'cache.r6g.xlarge' },
        gcp: { size: 'M3' },
        azure: { size: 'P1' },
        digitalocean: { size: 'db-s-2vcpu-4gb' },
      },
    },
    'very-high': {
      keep_data_safe: true,
      version: '7.x',
      max_memory_policy: 'allkeys-lru',
      _providers: {
        aws: { size: 'cache.r6g.2xlarge' },
        gcp: { size: 'M4' },
        azure: { size: 'P1' },
        digitalocean: { size: 'db-s-2vcpu-4gb' },
      },
    },
  },

  dynamodb: {
    dev: { capacity_mode: 'on-demand', table_class: 'standard', enable_streams: false, encryption: 'aws-owned' },
    low: { capacity_mode: 'on-demand', table_class: 'standard', enable_streams: false, encryption: 'aws-owned' },
    moderate: { capacity_mode: 'on-demand', table_class: 'standard', enable_streams: false, encryption: 'aws-owned' },
    medium: {
      capacity_mode: 'provisioned-autoscale',
      table_class: 'standard',
      enable_streams: true,
      encryption: 'aws-managed',
    },
    high: {
      capacity_mode: 'provisioned-autoscale',
      table_class: 'standard',
      enable_streams: true,
      encryption: 'aws-managed',
    },
    'very-high': {
      capacity_mode: 'provisioned-autoscale',
      table_class: 'standard',
      enable_streams: true,
      encryption: 'aws-managed',
    },
  },

  firestore: {
    dev: { size: 'spark', mode: 'native', realtime: true },
    low: { size: 'blaze', mode: 'native', realtime: true },
    moderate: { size: 'blaze', mode: 'native', realtime: true },
    medium: { size: 'blaze', mode: 'native', realtime: true },
    high: { size: 'blaze', mode: 'native', realtime: true },
    'very-high': { size: 'blaze', mode: 'datastore', realtime: false },
  },

  cosmosdb: {
    dev: { size: 'serverless', data_safety: 'session', global: false },
    low: { size: '400', data_safety: 'session', global: false },
    moderate: { size: '1000', data_safety: 'session', global: false },
    medium: { size: 'autoscale-4000', data_safety: 'session', global: false },
    high: { size: 'autoscale-10000', data_safety: 'session', global: true },
    'very-high': { size: 'autoscale-40000', data_safety: 'bounded-staleness', global: true },
  },

  tablestore: {
    dev: { size: 'on-demand' },
    low: { size: 'on-demand' },
    moderate: { size: 'reserved-50' },
    medium: { size: 'reserved-100' },
    high: { size: 'reserved-500' },
    'very-high': { size: 'reserved-1000' },
  },

  'autonomous-db': {
    dev: { purpose: 'atp', size: 'always-free' },
    low: { purpose: 'atp', size: '1-ocpu' },
    moderate: { purpose: 'atp', size: '1-ocpu' },
    medium: { purpose: 'atp', size: '2-ocpu' },
    high: { purpose: 'atp', size: '4-ocpu' },
    'very-high': { purpose: 'atp', size: '8-ocpu' },
  },

  'do-managed-db': {
    dev: { size: 'db-s-1vcpu-1gb', production: false },
    low: { size: 'db-s-1vcpu-1gb', production: false },
    moderate: { size: 'db-s-1vcpu-2gb', production: true },
    medium: { size: 'db-s-2vcpu-4gb', production: true },
    high: { size: 'db-s-4vcpu-8gb', production: true },
    'very-high': { size: 'db-s-8vcpu-16gb', production: true },
  },

  'vector-db': {
    dev: {
      _providers: {
        aws: { size: 'os-t3.small' },
        gcp: { size: 'gcp-basic' },
        azure: { size: 'azure-basic' },
      },
    },
    low: {
      _providers: {
        aws: { size: 'os-t3.small' },
        gcp: { size: 'gcp-basic' },
        azure: { size: 'azure-basic' },
      },
    },
    moderate: {
      _providers: {
        aws: { size: 'os-m6g.large' },
        gcp: { size: 'gcp-standard' },
        azure: { size: 'azure-s1' },
      },
    },
    medium: {
      _providers: {
        aws: { size: 'os-m6g.large' },
        gcp: { size: 'gcp-standard' },
        azure: { size: 'azure-s1' },
      },
    },
    high: {
      _providers: {
        aws: { size: 'os-r6g.xlarge' },
        gcp: { size: 'gcp-standard' },
        azure: { size: 'azure-s2' },
      },
    },
    'very-high': {
      _providers: {
        aws: { size: 'os-r6g.xlarge' },
        gcp: { size: 'gcp-standard' },
        azure: { size: 'azure-s2' },
      },
    },
  },

  'data-warehouse': {
    dev: {
      _providers: {
        aws: { size: 'dc2.large' },
        gcp: { size: 'bq-on-demand' },
        azure: { size: 'synapse-serverless' },
      },
    },
    low: {
      _providers: {
        aws: { size: 'dc2.large' },
        gcp: { size: 'bq-on-demand' },
        azure: { size: 'synapse-serverless' },
      },
    },
    moderate: {
      _providers: {
        aws: { size: 'dc2.large' },
        gcp: { size: 'bq-on-demand' },
        azure: { size: 'synapse-dw100' },
      },
    },
    medium: {
      _providers: {
        aws: { size: 'dc2.large-4' },
        gcp: { size: 'bq-editions' },
        azure: { size: 'synapse-dw100' },
      },
    },
    high: {
      _providers: {
        aws: { size: 'ra3.xlplus' },
        gcp: { size: 'bq-flat-100' },
        azure: { size: 'synapse-dw200' },
      },
    },
    'very-high': {
      _providers: {
        aws: { size: 'ra3.xlplus' },
        gcp: { size: 'bq-flat-100' },
        azure: { size: 'synapse-dw200' },
      },
    },
  },

  'search-engine': {
    dev: {
      _providers: {
        aws: { size: 'os-t3.small' },
        gcp: { size: 'gcp-basic' },
        azure: { size: 'azure-free' },
      },
    },
    low: {
      _providers: {
        aws: { size: 'os-t3.small' },
        gcp: { size: 'gcp-basic' },
        azure: { size: 'azure-basic' },
      },
    },
    moderate: {
      _providers: {
        aws: { size: 'os-t3.medium' },
        gcp: { size: 'gcp-enterprise' },
        azure: { size: 'azure-basic' },
      },
    },
    medium: {
      _providers: {
        aws: { size: 'os-m6g.large' },
        gcp: { size: 'gcp-enterprise' },
        azure: { size: 'azure-s1' },
      },
    },
    high: {
      _providers: {
        aws: { size: 'os-r6g.xlarge' },
        gcp: { size: 'gcp-enterprise' },
        azure: { size: 'azure-s1' },
      },
    },
    'very-high': {
      _providers: {
        aws: { size: 'os-r6g.xlarge' },
        gcp: { size: 'gcp-enterprise' },
        azure: { size: 'azure-s1' },
      },
    },
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STORAGE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  'object-storage': {
    dev: {
      public: false,
      versioning: false,
      _providers: {
        aws: { storage_class: 'standard' },
        gcp: { storage_class: 'gcp-standard' },
        azure: { storage_class: 'azure-hot' },
      },
    },
    low: {
      public: false,
      versioning: false,
      _providers: {
        aws: { storage_class: 'standard' },
        gcp: { storage_class: 'gcp-standard' },
        azure: { storage_class: 'azure-hot' },
      },
    },
    moderate: {
      public: false,
      versioning: true,
      _providers: {
        aws: { storage_class: 'standard' },
        gcp: { storage_class: 'gcp-standard' },
        azure: { storage_class: 'azure-hot' },
      },
    },
    medium: {
      public: false,
      versioning: true,
      _providers: {
        aws: { storage_class: 'standard' },
        gcp: { storage_class: 'gcp-standard' },
        azure: { storage_class: 'azure-hot' },
      },
    },
    high: {
      public: false,
      versioning: true,
      _providers: {
        aws: { storage_class: 'standard' },
        gcp: { storage_class: 'gcp-standard' },
        azure: { storage_class: 'azure-hot' },
      },
    },
    'very-high': {
      public: false,
      versioning: true,
      _providers: {
        aws: { storage_class: 'standard' },
        gcp: { storage_class: 'gcp-standard' },
        azure: { storage_class: 'azure-hot' },
      },
    },
  },

  oss: {
    dev: { storage_class: 'oss-standard', public: false },
    low: { storage_class: 'oss-standard', public: false },
    moderate: { storage_class: 'oss-standard', public: false },
    medium: { storage_class: 'oss-standard', public: false },
    high: { storage_class: 'oss-standard', public: false },
    'very-high': { storage_class: 'oss-standard', public: false },
  },

  'oci-object-storage': {
    dev: { storage_class: 'oci-standard', public: false, auto_tiering: false },
    low: { storage_class: 'oci-standard', public: false, auto_tiering: false },
    moderate: { storage_class: 'oci-standard', public: false, auto_tiering: true },
    medium: { storage_class: 'oci-standard', public: false, auto_tiering: true },
    high: { storage_class: 'oci-standard', public: false, auto_tiering: true },
    'very-high': { storage_class: 'oci-standard', public: false, auto_tiering: true },
  },

  'do-spaces': {
    dev: { location: 'nyc3' },
    low: { location: 'nyc3' },
    moderate: { location: 'nyc3' },
    medium: { location: 'nyc3' },
    high: { location: 'nyc3' },
    'very-high': { location: 'nyc3' },
  },

  'file-storage': {
    dev: {
      _providers: {
        aws: { size: 'efs-bursting' },
        gcp: { size: 'gcp-basic-hdd' },
        azure: { size: 'azure-standard' },
      },
    },
    low: {
      _providers: {
        aws: { size: 'efs-bursting' },
        gcp: { size: 'gcp-basic-hdd' },
        azure: { size: 'azure-standard' },
      },
    },
    moderate: {
      _providers: {
        aws: { size: 'efs-elastic' },
        gcp: { size: 'gcp-basic-ssd' },
        azure: { size: 'azure-standard' },
      },
    },
    medium: {
      _providers: {
        aws: { size: 'efs-elastic' },
        gcp: { size: 'gcp-basic-ssd' },
        azure: { size: 'azure-premium' },
      },
    },
    high: {
      _providers: {
        aws: { size: 'efs-provisioned' },
        gcp: { size: 'gcp-enterprise' },
        azure: { size: 'azure-premium' },
      },
    },
    'very-high': {
      _providers: {
        aws: { size: 'efs-provisioned' },
        gcp: { size: 'gcp-enterprise' },
        azure: { size: 'azure-premium' },
      },
    },
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // NETWORKING
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  'load-balancer': {
    // LBs auto-scale — tier affects type choice, not size
    dev: {
      internal_only: false,
      _providers: {
        aws: { type: 'alb' },
        gcp: { type: 'gcp-http' },
        azure: { type: 'azure-standard' },
        kubernetes: { type: 'k8s-ingress' },
      },
    },
    low: {
      internal_only: false,
      _providers: {
        aws: { type: 'alb' },
        gcp: { type: 'gcp-http' },
        azure: { type: 'azure-standard' },
        kubernetes: { type: 'k8s-ingress' },
      },
    },
    moderate: {
      internal_only: false,
      _providers: {
        aws: { type: 'alb' },
        gcp: { type: 'gcp-http' },
        azure: { type: 'azure-standard' },
        kubernetes: { type: 'k8s-ingress' },
      },
    },
    medium: {
      internal_only: false,
      _providers: {
        aws: { type: 'alb' },
        gcp: { type: 'gcp-http' },
        azure: { type: 'azure-app-gw' },
        kubernetes: { type: 'k8s-ingress' },
      },
    },
    high: {
      internal_only: false,
      _providers: {
        aws: { type: 'alb' },
        gcp: { type: 'gcp-http' },
        azure: { type: 'azure-app-gw' },
        kubernetes: { type: 'k8s-ingress' },
      },
    },
    'very-high': {
      internal_only: false,
      _providers: {
        aws: { type: 'nlb' },
        gcp: { type: 'gcp-tcp' },
        azure: { type: 'azure-app-gw' },
        kubernetes: { type: 'k8s-ingress' },
      },
    },
  },

  cdn: {
    dev: {
      _providers: {
        aws: { tier: 'cf-100' },
        gcp: { tier: 'gcp-standard' },
        azure: { tier: 'azure-standard' },
      },
    },
    low: {
      _providers: {
        aws: { tier: 'cf-100' },
        gcp: { tier: 'gcp-standard' },
        azure: { tier: 'azure-standard' },
      },
    },
    moderate: {
      _providers: {
        aws: { tier: 'cf-200' },
        gcp: { tier: 'gcp-standard' },
        azure: { tier: 'azure-standard' },
      },
    },
    medium: {
      _providers: {
        aws: { tier: 'cf-all' },
        gcp: { tier: 'gcp-premium' },
        azure: { tier: 'azure-standard' },
      },
    },
    high: {
      _providers: {
        aws: { tier: 'cf-all' },
        gcp: { tier: 'gcp-premium' },
        azure: { tier: 'azure-premium-verizon' },
      },
    },
    'very-high': {
      _providers: {
        aws: { tier: 'cf-all' },
        gcp: { tier: 'gcp-premium' },
        azure: { tier: 'azure-afd' },
      },
    },
  },

  'api-gateway': {
    dev: {
      login_required: false,
      _providers: {
        aws: { protocol: 'http' },
        gcp: { protocol: 'gcp-api-gw' },
        azure: { protocol: 'azure-consumption' },
      },
    },
    low: {
      login_required: false,
      _providers: {
        aws: { protocol: 'http' },
        gcp: { protocol: 'gcp-api-gw' },
        azure: { protocol: 'azure-consumption' },
      },
    },
    moderate: {
      login_required: false,
      _providers: {
        aws: { protocol: 'http' },
        gcp: { protocol: 'gcp-api-gw' },
        azure: { protocol: 'azure-consumption' },
      },
    },
    medium: {
      login_required: true,
      _providers: {
        aws: { protocol: 'rest' },
        gcp: { protocol: 'gcp-api-gw' },
        azure: { protocol: 'azure-consumption' },
      },
    },
    high: {
      login_required: true,
      _providers: {
        aws: { protocol: 'rest' },
        gcp: { protocol: 'gcp-api-gw' },
        azure: { protocol: 'azure-standard' },
      },
    },
    'very-high': {
      login_required: true,
      _providers: {
        aws: { protocol: 'rest' },
        gcp: { protocol: 'gcp-api-gw' },
        azure: { protocol: 'azure-standard' },
      },
    },
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // MESSAGING
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  'message-queue': {
    dev: {
      retention: '1d',
      max_message_size: '256',
      dead_letter: false,
      _providers: {
        aws: { queue_type: 'standard' },
        gcp: { queue_type: 'pull' },
        azure: { queue_type: 'basic' },
      },
    },
    low: {
      retention: '4d',
      max_message_size: '256',
      dead_letter: true,
      _providers: {
        aws: { queue_type: 'standard' },
        gcp: { queue_type: 'pull' },
        azure: { queue_type: 'basic' },
      },
    },
    moderate: {
      retention: '4d',
      max_message_size: '256',
      dead_letter: true,
      _providers: {
        aws: { queue_type: 'standard' },
        gcp: { queue_type: 'pull' },
        azure: { queue_type: 'standard-azure' },
      },
    },
    medium: {
      retention: '7d',
      max_message_size: '256',
      dead_letter: true,
      _providers: {
        aws: { queue_type: 'fifo' },
        gcp: { queue_type: 'push' },
        azure: { queue_type: 'standard-azure' },
      },
    },
    high: {
      retention: '7d',
      max_message_size: '256',
      dead_letter: true,
      _providers: {
        aws: { queue_type: 'fifo-high-throughput' },
        gcp: { queue_type: 'push' },
        azure: { queue_type: 'premium' },
      },
    },
    'very-high': {
      retention: '14d',
      max_message_size: '256',
      dead_letter: true,
      _providers: {
        aws: { queue_type: 'fifo-high-throughput' },
        gcp: { queue_type: 'push' },
        azure: { queue_type: 'premium' },
      },
    },
  },

  'event-bus': {
    dev: {
      _providers: {
        aws: { topic_type: 'standard' },
        gcp: { topic_type: 'gcp-default' },
        azure: { topic_type: 'azure-standard' },
      },
    },
    low: {
      _providers: {
        aws: { topic_type: 'standard' },
        gcp: { topic_type: 'gcp-default' },
        azure: { topic_type: 'azure-standard' },
      },
    },
    moderate: {
      _providers: {
        aws: { topic_type: 'standard' },
        gcp: { topic_type: 'gcp-default' },
        azure: { topic_type: 'azure-standard' },
      },
    },
    medium: {
      _providers: {
        aws: { topic_type: 'standard' },
        gcp: { topic_type: 'gcp-default' },
        azure: { topic_type: 'azure-standard' },
      },
    },
    high: {
      _providers: {
        aws: { topic_type: 'fifo' },
        gcp: { topic_type: 'gcp-default' },
        azure: { topic_type: 'azure-standard' },
      },
    },
    'very-high': {
      _providers: {
        aws: { topic_type: 'fifo' },
        gcp: { topic_type: 'gcp-default' },
        azure: { topic_type: 'azure-standard' },
      },
    },
  },

  rabbitmq: {
    dev: {
      version: '3.13',
      keep_messages: false,
      always_available: false,
      _providers: {
        aws: { size: 'mq.t3.micro' },
        gcp: { size: 'lemur' },
        kubernetes: { size: 'k8s-1-2' },
      },
    },
    low: {
      version: '3.13',
      keep_messages: true,
      always_available: false,
      _providers: {
        aws: { size: 'mq.t3.micro' },
        gcp: { size: 'lemur' },
        kubernetes: { size: 'k8s-1-2' },
      },
    },
    moderate: {
      version: '3.13',
      keep_messages: true,
      always_available: false,
      _providers: {
        aws: { size: 'mq.m5.large' },
        gcp: { size: 'tiger' },
        kubernetes: { size: 'k8s-2-4' },
      },
    },
    medium: {
      version: '3.13',
      keep_messages: true,
      always_available: true,
      _providers: {
        aws: { size: 'mq.m5.large' },
        gcp: { size: 'tiger' },
        kubernetes: { size: 'k8s-2-4' },
      },
    },
    high: {
      version: '3.13',
      keep_messages: true,
      always_available: true,
      _providers: {
        aws: { size: 'mq.m5.xlarge' },
        gcp: { size: 'lion' },
        kubernetes: { size: 'k8s-4-8' },
      },
    },
    'very-high': {
      version: '3.13',
      keep_messages: true,
      always_available: true,
      _providers: {
        aws: { size: 'mq.m5.2xlarge' },
        gcp: { size: 'lion' },
        kubernetes: { size: 'k8s-4-8' },
      },
    },
  },

  'cloud-pubsub': {
    dev: { order_matters: false },
    low: { order_matters: false },
    moderate: { order_matters: false },
    medium: { order_matters: false },
    high: { order_matters: false },
    'very-high': { order_matters: true },
  },

  'service-bus': {
    dev: {
      _providers: { azure: { size: 'basic' } },
    },
    low: {
      _providers: { azure: { size: 'basic' } },
    },
    moderate: {
      _providers: { azure: { size: 'standard' } },
    },
    medium: {
      _providers: { azure: { size: 'standard' } },
    },
    high: {
      _providers: { azure: { size: 'premium-1' } },
    },
    'very-high': {
      _providers: { azure: { size: 'premium-2' } },
    },
  },

  'event-stream': {
    dev: {
      retention: '24h',
      _providers: {
        aws: { size: 'on-demand' },
        gcp: { size: 'gcp-default' },
        azure: { size: 'eh-basic' },
      },
    },
    low: {
      retention: '24h',
      _providers: {
        aws: { size: '1-shard' },
        gcp: { size: 'gcp-default' },
        azure: { size: 'eh-basic' },
      },
    },
    moderate: {
      retention: '72h',
      _providers: {
        aws: { size: '2-shards' },
        gcp: { size: 'gcp-default' },
        azure: { size: 'eh-standard' },
      },
    },
    medium: {
      retention: '168h',
      _providers: {
        aws: { size: '4-shards' },
        gcp: { size: 'gcp-default' },
        azure: { size: 'eh-standard-4' },
      },
    },
    high: {
      retention: '168h',
      _providers: {
        aws: { size: '10-shards' },
        gcp: { size: 'gcp-default' },
        azure: { size: 'eh-premium' },
      },
    },
    'very-high': {
      retention: '720h',
      _providers: {
        aws: { size: 'on-demand' },
        gcp: { size: 'gcp-default' },
        azure: { size: 'eh-premium' },
      },
    },
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SECURITY
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  'secret-store': {
    dev: { auto_rotate: false },
    low: { auto_rotate: false },
    moderate: { auto_rotate: false },
    medium: { auto_rotate: true },
    high: { auto_rotate: true },
    'very-high': { auto_rotate: true },
  },

  'ssl-certificate': {
    dev: { auto_renew: true },
    low: { auto_renew: true },
    moderate: { auto_renew: true },
    medium: { auto_renew: true },
    high: { auto_renew: true },
    'very-high': { auto_renew: true },
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // MONITORING
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  'log-group': {
    dev: { keep_logs: '7 days' },
    low: { keep_logs: '14 days' },
    moderate: { keep_logs: '30 days' },
    medium: { keep_logs: '30 days' },
    high: { keep_logs: '90 days' },
    'very-high': { keep_logs: '1 year' },
  },

  alert: {
    dev: { severity: 'Low — check when convenient' },
    low: { severity: 'Medium — look into it soon' },
    moderate: { severity: 'Medium — look into it soon' },
    medium: { severity: 'Medium — look into it soon' },
    high: { severity: 'High — wake me up at 3am' },
    'very-high': { severity: 'High — wake me up at 3am' },
  },
};

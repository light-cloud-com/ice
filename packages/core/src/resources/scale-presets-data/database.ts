/**
 * Scale Presets — Database category.
 *
 * Resource keys covered: postgres-db, mysql-db, mongodb, redis-cache, dynamodb,
 * firestore, cosmosdb, tablestore, autonomous-db, do-managed-db, vector-db,
 * data-warehouse, search-engine.
 *
 * Part of the rf-spdat split — see `../scale-presets-data.ts` for the
 * orchestrator and `../scale-presets-types.ts` for the shared types.
 */

import type { ScaleTier, TierPreset } from '../scale-presets-types';

export const DATABASE_PRESETS: Record<string, Partial<Record<ScaleTier, TierPreset>>> = {
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
};

/**
 * Scale Presets — Compute category.
 *
 * Resource keys covered: frontend-app, backend-api, serverless-function,
 * function-compute, oci-functions, do-app-platform, container-service, worker,
 * ssr-site, scheduled-task, llm-gateway, ml-model.
 *
 * Part of the rf-spdat split — see `../scale-presets-data.ts` for the
 * orchestrator and `../scale-presets-types.ts` for the shared types.
 */

import type { ScaleTier, TierPreset } from '../scale-presets-types';

export const COMPUTE_PRESETS: Record<string, Partial<Record<ScaleTier, TierPreset>>> = {
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
        azure: { memory: '128', plan: 'Consumption' },
      },
    },
    low: {
      memory: '256',
      timeout: '30',
      _providers: {
        aws: { memory: '256' },
        gcp: { memory: '256-400mhz' },
        azure: { memory: '256', plan: 'Consumption' },
      },
    },
    moderate: {
      memory: '512',
      timeout: '60',
      _providers: {
        aws: { memory: '512' },
        gcp: { memory: '512-800mhz' },
        azure: { memory: '512', plan: 'Consumption' },
      },
    },
    medium: {
      memory: '1024',
      timeout: '60',
      _providers: {
        aws: { memory: '1024' },
        gcp: { memory: '1024-1400mhz' },
        azure: { memory: '1024', plan: 'EP1' },
      },
    },
    high: {
      memory: '2048',
      timeout: '300',
      _providers: {
        aws: { memory: '2048' },
        gcp: { memory: '2048-2800mhz' },
        azure: { memory: '2048', plan: 'EP2' },
      },
    },
    'very-high': {
      memory: '4096',
      timeout: '900',
      _providers: {
        aws: { memory: '4096' },
        gcp: { memory: '4096-4800mhz' },
        azure: { memory: '4096', plan: 'EP3' },
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
};

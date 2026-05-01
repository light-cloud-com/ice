/**
 * Scale Presets — Storage category.
 *
 * Resource keys covered: object-storage, oss, oci-object-storage, do-spaces,
 * file-storage.
 *
 * Part of the rf-spdat split — see `../scale-presets-data.ts` for the
 * orchestrator and `../scale-presets-types.ts` for the shared types.
 */

import type { ScaleTier, TierPreset } from '../scale-presets-types.js';

export const STORAGE_PRESETS: Record<string, Partial<Record<ScaleTier, TierPreset>>> = {
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
};

/**
 * Scale Presets — Networking category.
 *
 * Resource keys covered: load-balancer, cdn, api-gateway.
 *
 * Part of the rf-spdat split — see `../scale-presets-data.ts` for the
 * orchestrator and `../scale-presets-types.ts` for the shared types.
 */

import type { ScaleTier, TierPreset } from '../scale-presets-types.js';

export const NETWORKING_PRESETS: Record<string, Partial<Record<ScaleTier, TierPreset>>> = {
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
};

/**
 * Provider Pricing Data
 *
 * Static pricing rates for data transfer, egress, and cross-provider comparison.
 * These are approximate public list prices as of early 2026.
 */

import type { CardNode, CardEdge } from '../../../store/slices/cards-slice';
import type { ScaleTier } from '@ice/core/resources';
import { parseCostRange, type NodeCostInfo, type ResourceMap, getNodeCostInfo } from './cost-calculator';

// ─── Data transfer / egress rates (per GB) ──────────────────────────────────

export interface EgressRate {
  provider: string;
  label: string;
  freeGb: number;
  perGbRate: number;
  notes: string;
}

export const EGRESS_RATES: Record<string, EgressRate> = {
  aws: {
    provider: 'aws',
    label: 'AWS',
    freeGb: 1,
    perGbRate: 0.09,
    notes: 'First 10 TB/mo at $0.09/GB, then $0.085',
  },
  gcp: {
    provider: 'gcp',
    label: 'GCP',
    freeGb: 1,
    perGbRate: 0.12,
    notes: 'Standard tier ~$0.085/GB, Premium tier ~$0.12/GB',
  },
  azure: {
    provider: 'azure',
    label: 'Azure',
    freeGb: 5,
    perGbRate: 0.087,
    notes: 'First 5 GB free, then $0.087/GB for first 10 TB',
  },
  digitalocean: {
    provider: 'digitalocean',
    label: 'DigitalOcean',
    freeGb: 1000,
    perGbRate: 0.01,
    notes: '1 TB free transfer included, then $0.01/GB',
  },
  alibaba: {
    provider: 'alibaba',
    label: 'Alibaba Cloud',
    freeGb: 0,
    perGbRate: 0.08,
    notes: '~$0.08/GB for international traffic',
  },
  oci: {
    provider: 'oci',
    label: 'Oracle Cloud',
    freeGb: 10240,
    perGbRate: 0.0085,
    notes: '10 TB/mo free, then $0.0085/GB — best egress pricing',
  },
};

// ─── Traffic volume estimates by scale tier ─────────────────────────────────

export interface TrafficEstimate {
  tier: string;
  label: string;
  monthlyRequestsLow: number;
  monthlyRequestsHigh: number;
  avgResponseSizeKb: number;
  estimatedGbPerMonth: number;
}

export const TRAFFIC_TIERS: TrafficEstimate[] = [
  {
    tier: 'dev',
    label: 'Development',
    monthlyRequestsLow: 0,
    monthlyRequestsHigh: 10_000,
    avgResponseSizeKb: 50,
    estimatedGbPerMonth: 0.5,
  },
  {
    tier: 'low',
    label: 'Low Traffic',
    monthlyRequestsLow: 10_000,
    monthlyRequestsHigh: 100_000,
    avgResponseSizeKb: 50,
    estimatedGbPerMonth: 5,
  },
  {
    tier: 'moderate',
    label: 'Moderate',
    monthlyRequestsLow: 100_000,
    monthlyRequestsHigh: 1_000_000,
    avgResponseSizeKb: 50,
    estimatedGbPerMonth: 50,
  },
  {
    tier: 'medium',
    label: 'Medium',
    monthlyRequestsLow: 1_000_000,
    monthlyRequestsHigh: 10_000_000,
    avgResponseSizeKb: 50,
    estimatedGbPerMonth: 500,
  },
  {
    tier: 'high',
    label: 'High Traffic',
    monthlyRequestsLow: 10_000_000,
    monthlyRequestsHigh: 100_000_000,
    avgResponseSizeKb: 50,
    estimatedGbPerMonth: 5_000,
  },
  {
    tier: 'very-high',
    label: 'Very High',
    monthlyRequestsLow: 100_000_000,
    monthlyRequestsHigh: 1_000_000_000,
    avgResponseSizeKb: 50,
    estimatedGbPerMonth: 50_000,
  },
];

// ─── Data transfer cost estimation ──────────────────────────────────────────

export interface DataTransferEstimate {
  provider: string;
  trafficTier: string;
  estimatedGb: number;
  monthlyCost: number;
  freeGb: number;
  billableGb: number;
}

/** Estimate egress cost for a provider at a given traffic tier */
export function estimateDataTransferCost(
  provider: string,
  trafficTierIndex: number,
): DataTransferEstimate {
  const rate = EGRESS_RATES[provider] || EGRESS_RATES.aws;
  const tier = TRAFFIC_TIERS[trafficTierIndex] || TRAFFIC_TIERS[0];

  const billableGb = Math.max(0, tier.estimatedGbPerMonth - rate.freeGb);
  const monthlyCost = billableGb * rate.perGbRate;

  return {
    provider: rate.provider,
    trafficTier: tier.tier,
    estimatedGb: tier.estimatedGbPerMonth,
    monthlyCost,
    freeGb: rate.freeGb,
    billableGb,
  };
}

// ─── Cross-provider cost comparison ─────────────────────────────────────────

/** Build a lookup from (iceType + sizeValue) → cost per provider from HIGH_LEVEL_CATEGORIES option details */
// This is populated at runtime from the resource definitions
let _optionCostCache: Map<string, Record<string, number>> | null = null;

export function buildOptionCostCache(
  resources: Array<{
    ice_type: string;
    properties: Array<{
      name: string;
      optionDetails?: Array<{
        value: string;
        cost?: string;
        provider?: string;
      }>;
    }>;
  }>,
): Map<string, Record<string, number>> {
  const cache = new Map<string, Record<string, number>>();

  for (const resource of resources) {
    for (const prop of resource.properties) {
      if (!prop.optionDetails) continue;
      for (const opt of prop.optionDetails) {
        if (!opt.cost) continue;
        const key = `${resource.ice_type}:${prop.name}:${opt.value}`;
        const providerCosts = cache.get(key) || {};
        const provider = opt.provider || '_default';
        providerCosts[provider] = parseCostRange(opt.cost);
        cache.set(key, providerCosts);
      }
    }
  }

  _optionCostCache = cache;
  return cache;
}

export interface ProviderCostComparison {
  provider: string;
  label: string;
  totalMonthlyCost: number;
  delta: number;
  deltaPercent: number;
}

/** Compare costs of the current architecture across providers */
export function compareProviderCosts(
  nodes: CardNode[],
  currentProvider: string,
  resourceMap?: ResourceMap | null,
  scaleTier?: ScaleTier | null,
): ProviderCostComparison[] {
  const providers = ['aws', 'gcp', 'azure'];
  const infos = nodes
    .filter((n) => n.type !== 'container')
    .map((n) => getNodeCostInfo(n, resourceMap, scaleTier));
  const currentTotal = infos.reduce((sum, n) => sum + n.monthlyCost, 0);

  // For a rough comparison, use the ratio of known provider costs
  // from the option details cache. If not available, fall back to the current cost.
  return providers.map((provider) => {
    let total = 0;
    for (const info of infos) {
      if (info.provider === provider) {
        total += info.monthlyCost;
      } else {
        // Apply a rough provider ratio based on common patterns:
        // GCP is typically ~15% cheaper than AWS for compute
        // Azure is typically ~5% cheaper than AWS
        const ratios: Record<string, Record<string, number>> = {
          aws: { gcp: 0.85, azure: 0.95, aws: 1 },
          gcp: { aws: 1.18, azure: 1.12, gcp: 1 },
          azure: { aws: 1.05, gcp: 0.9, azure: 1 },
        };
        const ratio = ratios[info.provider]?.[provider] || 1;
        total += info.monthlyCost * ratio;
      }
    }
    const delta = total - currentTotal;
    return {
      provider,
      label: provider === 'aws' ? 'AWS' : provider === 'gcp' ? 'GCP' : 'Azure',
      totalMonthlyCost: total,
      delta,
      deltaPercent: currentTotal > 0 ? (delta / currentTotal) * 100 : 0,
    };
  });
}

// ─── Data transfer from edge analysis ───────────────────────────────────────

/** Count outbound traffic connections per node to estimate egress volume */
export function countTrafficConnections(
  nodes: CardNode[],
  edges: CardEdge[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const edge of edges) {
    const category = (edge.data?.category as string) || 'traffic';
    if (category !== 'traffic') continue;
    const current = counts.get(edge.source) || 0;
    counts.set(edge.source, current + 1);
  }
  return counts;
}

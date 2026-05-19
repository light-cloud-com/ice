/**
 * Tests for provider-pricing utilities.
 *
 * Pure functions over the static EGRESS_RATES + TRAFFIC_TIERS tables
 * plus the option-cost cache and cross-provider comparison helpers.
 * The cost-calculator dependency is mocked at the module boundary
 * because we're testing pricing math, not the underlying cost lookup.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../cost-calculator', () => ({
  parseCostRange: (s: string) => {
    // Simple stub: take the first number in the string.
    const m = s.match(/[\d.]+/);
    return m ? Number(m[0]) : 0;
  },
  getNodeCostInfo: (node: any, _resourceMap?: any, _scale?: any) => ({
    monthlyCost: node.data?.cost ?? 0,
    provider: node.data?.provider ?? 'aws',
  }),
}));

import {
  EGRESS_RATES,
  TRAFFIC_TIERS,
  estimateDataTransferCost,
  buildOptionCostCache,
  compareProviderCosts,
  countTrafficConnections,
} from '../provider-pricing';
import type { CardNode, CardEdge } from '../../../../store/slices/cards-slice';

const node = (id: string, overrides: Partial<CardNode> = {}): CardNode =>
  ({
    id,
    type: 'block',
    position: { x: 0, y: 0 },
    data: {},
    ...overrides,
  }) as CardNode;

describe('EGRESS_RATES + TRAFFIC_TIERS', () => {
  it('exposes one entry per supported provider', () => {
    expect(Object.keys(EGRESS_RATES).sort()).toEqual(['alibaba', 'aws', 'azure', 'digitalocean', 'gcp', 'oci']);
  });

  it('exposes 6 traffic tiers', () => {
    expect(TRAFFIC_TIERS).toHaveLength(6);
    expect(TRAFFIC_TIERS.map((t) => t.tier)).toEqual(['dev', 'low', 'moderate', 'medium', 'high', 'very-high']);
  });
});

describe('estimateDataTransferCost', () => {
  it('falls back to AWS when provider is unknown', () => {
    const out = estimateDataTransferCost('unknown-provider', 1);
    expect(out.provider).toBe('aws');
  });

  it('falls back to dev tier when index is out of range', () => {
    const out = estimateDataTransferCost('aws', 999);
    expect(out.trafficTier).toBe('dev');
  });

  it('subtracts free tier from estimated GB to get billable', () => {
    const out = estimateDataTransferCost('aws', 2); // moderate = 50 GB
    expect(out.estimatedGb).toBe(50);
    expect(out.freeGb).toBe(1);
    expect(out.billableGb).toBe(49);
    expect(out.monthlyCost).toBeCloseTo(49 * 0.09, 4);
  });

  it('floors billable at 0 when free tier exceeds usage', () => {
    // dev tier estimated 0.5 GB, AWS free 1 GB → billable 0.
    const out = estimateDataTransferCost('aws', 0);
    expect(out.billableGb).toBe(0);
    expect(out.monthlyCost).toBe(0);
  });

  it('honors per-provider rate (Oracle Cloud cheapest)', () => {
    const oci = estimateDataTransferCost('oci', 4); // high = 5000 GB, oci free = 10240
    expect(oci.billableGb).toBe(0);
    const ociHigher = estimateDataTransferCost('oci', 5); // very-high = 50000 GB, billable 39760
    expect(ociHigher.billableGb).toBe(50_000 - 10_240);
  });
});

describe('buildOptionCostCache', () => {
  it('returns an empty Map when no resources provided', () => {
    const out = buildOptionCostCache([]);
    expect(out.size).toBe(0);
  });

  it('skips properties without optionDetails', () => {
    const out = buildOptionCostCache([
      { ice_type: 'Compute.Container', properties: [{ name: 'name' /* no optionDetails */ }] },
    ]);
    expect(out.size).toBe(0);
  });

  it('skips option entries without a cost field', () => {
    const out = buildOptionCostCache([
      {
        ice_type: 'Compute.Container',
        properties: [{ name: 'size', optionDetails: [{ value: 'small' /* no cost */ }] }],
      },
    ]);
    expect(out.size).toBe(0);
  });

  it('builds keys of shape ice_type:prop:value with provider buckets', () => {
    const out = buildOptionCostCache([
      {
        ice_type: 'Compute.Container',
        properties: [
          {
            name: 'size',
            optionDetails: [
              { value: 'small', cost: '$10', provider: 'aws' },
              { value: 'small', cost: '$8', provider: 'gcp' },
              { value: 'large', cost: '$50' /* default provider */ },
            ],
          },
        ],
      },
    ]);
    expect(out.get('Compute.Container:size:small')).toEqual({ aws: 10, gcp: 8 });
    expect(out.get('Compute.Container:size:large')).toEqual({ _default: 50 });
  });
});

describe('compareProviderCosts', () => {
  it('returns one row per supported provider (aws/gcp/azure)', () => {
    const out = compareProviderCosts([node('a', { data: { cost: 100, provider: 'aws' } })], 'aws');
    expect(out.map((r) => r.provider)).toEqual(['aws', 'gcp', 'azure']);
    expect(out.map((r) => r.label)).toEqual(['AWS', 'GCP', 'Azure']);
  });

  it('returns the same total for the current provider with delta=0', () => {
    const out = compareProviderCosts([node('a', { data: { cost: 100, provider: 'aws' } })], 'aws');
    const aws = out.find((r) => r.provider === 'aws')!;
    expect(aws.totalMonthlyCost).toBe(100);
    expect(aws.delta).toBe(0);
    expect(aws.deltaPercent).toBe(0);
  });

  it('applies the GCP=0.85 ratio when comparing aws→gcp', () => {
    const out = compareProviderCosts([node('a', { data: { cost: 100, provider: 'aws' } })], 'aws');
    const gcp = out.find((r) => r.provider === 'gcp')!;
    expect(gcp.totalMonthlyCost).toBeCloseTo(85, 4);
    expect(gcp.delta).toBeCloseTo(-15, 4);
    expect(gcp.deltaPercent).toBeCloseTo(-15, 4);
  });

  it('skips containers when computing totals', () => {
    const out = compareProviderCosts(
      [node('group', { type: 'container', data: { cost: 999 } }), node('a', { data: { cost: 100, provider: 'aws' } })],
      'aws',
    );
    expect(out.find((r) => r.provider === 'aws')!.totalMonthlyCost).toBe(100);
  });

  it('keeps deltaPercent at 0 when the current total is zero', () => {
    const out = compareProviderCosts([], 'aws');
    expect(out.every((r) => r.deltaPercent === 0)).toBe(true);
  });

  it('uses ratio=1 (passthrough) when the from→to pair has no rule', () => {
    // Synthetic provider not in the ratios table → fallback to 1
    const out = compareProviderCosts([node('a', { data: { cost: 100, provider: 'unknown' } })], 'unknown');
    expect(out.find((r) => r.provider === 'aws')!.totalMonthlyCost).toBe(100);
  });
});

describe('countTrafficConnections', () => {
  it('counts outbound edges with category=traffic per source', () => {
    const counts = countTrafficConnections(
      [],
      [
        { id: 'e1', source: 'a', target: 'b', data: { category: 'traffic' } } as CardEdge,
        { id: 'e2', source: 'a', target: 'c', data: { category: 'traffic' } } as CardEdge,
        { id: 'e3', source: 'b', target: 'c', data: { category: 'traffic' } } as CardEdge,
      ],
    );
    expect(counts.get('a')).toBe(2);
    expect(counts.get('b')).toBe(1);
  });

  it('defaults missing category to traffic', () => {
    const counts = countTrafficConnections([], [{ id: 'e1', source: 'a', target: 'b', data: {} } as CardEdge]);
    expect(counts.get('a')).toBe(1);
  });

  it('ignores non-traffic categories', () => {
    const counts = countTrafficConnections(
      [],
      [{ id: 'e1', source: 'a', target: 'b', data: { category: 'auth' } } as CardEdge],
    );
    expect(counts.size).toBe(0);
  });
});

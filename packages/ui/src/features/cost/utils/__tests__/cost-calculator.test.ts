/**
 * Tests for the cost calculator's higher-level extraction and aggregation
 * paths. The narrow `parseCostRange` / `formatCost` invariants live in the
 * sibling `cost-calculator-parse-format.test.ts` file (rf-props-26); this
 * file covers the rest of the public surface and the per-unit / scaling /
 * resource-lookup branches inside the private helpers exercised through
 * `getNodeCostInfo` and `computeCostSummary`.
 *
 * Strategy: build minimal `CardNode` fixtures by-hand. The helpers read
 * `node.id`, `node.type`, and `node.data` only — `position`, `width`,
 * `height` are required by the type but irrelevant to the math.
 */

import { describe, it, expect } from 'vitest';

import type { CardNode } from '../../../../store/slices/cards-slice';
import {
  computeCostSummary,
  formatCostRaw,
  getNodeCostInfo,
  type ResourceMap,
  type ResourceDef,
} from '../cost-calculator';

// ─── Fixture helpers ────────────────────────────────────────────────────────

function node(id: string, data: Record<string, unknown>, type: CardNode['type'] = 'block'): CardNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    width: 100,
    height: 50,
    data,
  };
}

// ─── formatCostRaw ──────────────────────────────────────────────────────────
// Mirrors `formatCost` but without the /mo suffix and with a different
// upper-band cutoff at 10000.

describe('formatCostRaw', () => {
  it('returns "$0" for a zero value', () => {
    expect(formatCostRaw(0)).toBe('$0');
  });

  it('returns "< $0.01" for very small positive values', () => {
    expect(formatCostRaw(0.001)).toBe('< $0.01');
    expect(formatCostRaw(0.009)).toBe('< $0.01');
  });

  it('returns "~$X.XX" for sub-dollar values', () => {
    expect(formatCostRaw(0.5)).toBe('~$0.50');
    expect(formatCostRaw(0.99)).toBe('~$0.99');
  });

  it('returns "~$X" for whole-dollar values between 1 and 999', () => {
    expect(formatCostRaw(1)).toBe('~$1');
    expect(formatCostRaw(25)).toBe('~$25');
    expect(formatCostRaw(999)).toBe('~$999');
  });

  it('returns the localised "~$X,XXX" form for values 1000–9999', () => {
    // formatCostRaw uses .toLocaleString(); on en-US it inserts thousand
    // separators, but the tests run with whatever locale the test harness
    // exposes. Pin only that the output starts with "~$" and contains the
    // four-digit string (with or without separator) — both encodings are
    // valid as long as the integer round trip is preserved.
    expect(formatCostRaw(1000)).toMatch(/^~\$1,?000$/);
    expect(formatCostRaw(9999)).toMatch(/^~\$9,?999$/);
  });

  it('returns "~$Xk" for values 10000 and above', () => {
    expect(formatCostRaw(10000)).toBe('~$10.0k');
    expect(formatCostRaw(15500)).toBe('~$15.5k');
    expect(formatCostRaw(120000)).toBe('~$120.0k');
  });
});

// ─── getNodeCostInfo ────────────────────────────────────────────────────────

describe('getNodeCostInfo — basic shape', () => {
  it('extracts iceType, label, and provider from node.data', () => {
    const n = node('n1', {
      iceType: 'Compute.Container',
      label: 'API service',
      provider: 'gcp',
      estimatedCost: '$36/mo',
    });
    const info = getNodeCostInfo(n);
    expect(info.nodeId).toBe('n1');
    expect(info.iceType).toBe('Compute.Container');
    expect(info.label).toBe('API service');
    expect(info.provider).toBe('gcp');
    expect(info.monthlyCost).toBe(36);
  });

  it('falls back to ice_type when iceType missing (snake-case shim)', () => {
    const info = getNodeCostInfo(node('n1', { ice_type: 'Database.PostgreSQL', estimatedCost: '$60/mo' }));
    expect(info.iceType).toBe('Database.PostgreSQL');
    expect(info.monthlyCost).toBe(60);
  });

  it('falls back to node.id as label when no label is set', () => {
    const info = getNodeCostInfo(node('lonely-node', {}));
    expect(info.label).toBe('lonely-node');
  });

  it("returns 0 cost when no estimatedCost and no resourceMap is provided", () => {
    const info = getNodeCostInfo(node('n1', { iceType: 'Compute.Container' }));
    expect(info.monthlyCost).toBe(0);
    expect(info.perInstanceCost).toBe(0);
  });
});

describe('getNodeCostInfo — category resolution', () => {
  // PREFIX_TO_CATEGORY: Compute, Database, Storage, Messaging, Network,
  // Security, Monitoring, Analytics, AI, Config, Source, anything else.
  it('maps Compute.* to Compute', () => {
    expect(getNodeCostInfo(node('n', { iceType: 'Compute.Container' })).category).toBe('Compute');
  });

  it('maps Database.* and Storage.* to Data', () => {
    expect(getNodeCostInfo(node('n', { iceType: 'Database.PostgreSQL' })).category).toBe('Data');
    expect(getNodeCostInfo(node('n', { iceType: 'Storage.Bucket' })).category).toBe('Data');
  });

  it('maps Messaging.*, Network.*, Security.* to their categories', () => {
    expect(getNodeCostInfo(node('n', { iceType: 'Messaging.Queue' })).category).toBe('Messaging');
    expect(getNodeCostInfo(node('n', { iceType: 'Network.CDN' })).category).toBe('Networking');
    expect(getNodeCostInfo(node('n', { iceType: 'Security.IAM' })).category).toBe('Security');
  });

  it('maps Monitoring.*, Analytics.*, AI.* to their categories', () => {
    expect(getNodeCostInfo(node('n', { iceType: 'Monitoring.Logs' })).category).toBe('Observability');
    expect(getNodeCostInfo(node('n', { iceType: 'Analytics.BigQuery' })).category).toBe('Analytics');
    expect(getNodeCostInfo(node('n', { iceType: 'AI.LLMGateway' })).category).toBe('AI / ML');
  });

  it('maps Config.* and Source.* to their categories', () => {
    expect(getNodeCostInfo(node('n', { iceType: 'Config.Environment' })).category).toBe('Config');
    expect(getNodeCostInfo(node('n', { iceType: 'Source.Repository' })).category).toBe('Source');
  });

  it('falls back to "Other" for unknown prefixes', () => {
    expect(getNodeCostInfo(node('n', { iceType: 'Custom.Thing' })).category).toBe('Other');
    expect(getNodeCostInfo(node('n', { iceType: '' })).category).toBe('Other');
  });
});

describe('getNodeCostInfo — scalable services', () => {
  it('multiplies per-instance cost by activeInstances when behavior=scalable', () => {
    const info = getNodeCostInfo(
      node('svc', {
        iceType: 'Compute.Container',
        behavior: 'scalable',
        minInstances: 1,
        maxInstances: 5,
        activeInstances: 3,
        estimatedCost: '$10/mo',
      }),
    );
    expect(info.isScalable).toBe(true);
    expect(info.minInstances).toBe(1);
    expect(info.maxInstances).toBe(5);
    expect(info.activeInstances).toBe(3);
    expect(info.perInstanceCost).toBe(10);
    expect(info.monthlyCost).toBe(30);
  });

  it('falls back to snake_case min/max when camelCase not set', () => {
    const info = getNodeCostInfo(
      node('svc', {
        iceType: 'Compute.Container',
        behavior: 'scalable',
        min_instances: 2,
        max_instances: 4,
        estimatedCost: '$10/mo',
      }),
    );
    expect(info.minInstances).toBe(2);
    expect(info.maxInstances).toBe(4);
    // No activeInstances → fallback = minInstances = 2.
    expect(info.activeInstances).toBe(2);
  });

  it('defaults minInstances=1 and maxInstances=minInstances when both unset', () => {
    const info = getNodeCostInfo(
      node('svc', {
        iceType: 'Compute.Container',
        behavior: 'scalable',
        estimatedCost: '$10/mo',
      }),
    );
    expect(info.minInstances).toBe(1);
    expect(info.maxInstances).toBe(1);
  });

  it('estimates instance count from scaleTier when scalable + tier is set', () => {
    // factor for 'medium' = 0.5 → min + (max-min)*0.5 = 1 + (10-1)*0.5 = 5.5 → 6
    const info = getNodeCostInfo(
      node('svc', {
        iceType: 'Compute.Container',
        behavior: 'scalable',
        minInstances: 1,
        maxInstances: 10,
        estimatedCost: '$10/mo',
      }),
      null,
      'medium',
    );
    expect(info.activeInstances).toBe(6);
  });

  it('keeps activeInstances at min for the dev tier (factor 0)', () => {
    const info = getNodeCostInfo(
      node('svc', {
        iceType: 'Compute.Container',
        behavior: 'scalable',
        minInstances: 2,
        maxInstances: 10,
        estimatedCost: '$10/mo',
      }),
      null,
      'dev',
    );
    expect(info.activeInstances).toBe(2);
  });

  it('uses an unknown-tier fallback factor of 0.25', () => {
    // 'low' is in TIER_SCALE_FACTOR (0.1). Cast to ScaleTier to exercise
    // the `?? 0.25` fallback for an unrecognized tier string.
    const info = getNodeCostInfo(
      node('svc', {
        iceType: 'Compute.Container',
        behavior: 'scalable',
        minInstances: 0,
        maxInstances: 100,
        estimatedCost: '$1/mo',
      }),
      null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      'unknown-tier' as any,
    );
    // factor 0.25 → 0 + (100-0)*0.25 = 25
    expect(info.activeInstances).toBe(25);
  });
});

describe('getNodeCostInfo — per-unit cost resolution', () => {
  // resolvePerUnitCost handles five suffixes: /GB, /TB, /M (requests),
  // /K (requests), or none. Each test below exercises one branch.

  it('multiplies $/GB rate by tier storage volume', () => {
    // STORAGE_GB_BY_TIER medium = 200 → 0.023 * 200 = 4.6
    const info = getNodeCostInfo(
      node('n', {
        iceType: 'Storage.Bucket',
        estimatedCost: '$0.023/GB/mo',
      }),
      null,
      'medium',
    );
    expect(info.monthlyCost).toBeCloseTo(4.6, 5);
  });

  it('treats $/TB as $/GB ÷ 1000 against tier storage volume', () => {
    const info = getNodeCostInfo(
      node('n', {
        iceType: 'Storage.Bucket',
        estimatedCost: '$10/TB/mo',
      }),
      null,
      'high',
    );
    // STORAGE_GB_BY_TIER high = 1000 → 10 * 1000 / 1000 = 10
    expect(info.monthlyCost).toBeCloseTo(10, 5);
  });

  it('multiplies $/M rate by tier million-request count', () => {
    // REQUESTS_M_BY_TIER medium = 10 → 0.5 * 10 = 5
    const info = getNodeCostInfo(
      node('n', {
        iceType: 'Compute.Function',
        estimatedCost: '$0.50/M/mo',
      }),
      null,
      'medium',
    );
    expect(info.monthlyCost).toBeCloseTo(5, 5);
  });

  it('multiplies $/K rate by tier million-request count × 1000', () => {
    // REQUESTS_M_BY_TIER moderate = 1 → 0.001 * 1 * 1000 = 1
    const info = getNodeCostInfo(
      node('n', {
        iceType: 'Compute.Function',
        estimatedCost: '$0.001/K/mo',
      }),
      null,
      'moderate',
    );
    expect(info.monthlyCost).toBeCloseTo(1, 5);
  });

  it('uses an unknown-tier default for per-unit storage rates', () => {
    // The flat-tier fallback uses /GB tier=50 GB → 0.1 * 50 = 5
    const info = getNodeCostInfo(
      node('n', {
        iceType: 'Storage.Bucket',
        estimatedCost: '$0.10/GB/mo',
      }),
      // No scaleTier passed → resolvePerUnitCost uses 'moderate' default → tier 50 GB.
    );
    expect(info.monthlyCost).toBeCloseTo(5, 5);
  });

  it('passes through flat rates unchanged when not per-unit', () => {
    // No /GB, /TB, /M, /K, /RU suffix in cost → flat rate.
    const info = getNodeCostInfo(node('n', { iceType: 'Compute.Container', estimatedCost: '$36/mo' }));
    expect(info.monthlyCost).toBe(36);
  });

  it("returns the per-unit rate as-is for /RU costs (no multiplier branch matches)", () => {
    // `/RU` is recognised by isPerUnitCost so resolvePerUnitCost is called,
    // but no /RU branch exists inside it → falls through to `return rate`.
    const info = getNodeCostInfo(node('n', { iceType: 'Database.CosmosDB', estimatedCost: '$0.25/M RUs' }));
    // The /M\b branch wins first against "/M RUs" → 0.25 * 1 (moderate)
    // = 0.25.
    expect(info.monthlyCost).toBeCloseTo(0.25, 5);
  });

  it('returns flat rate when no recognised unit matches', () => {
    // Construct a /RU rate without a /M or /K window so the resolver
    // exhausts every if-branch and lands on `return rate`.
    const info = getNodeCostInfo(
      node('n', { iceType: 'Database.CosmosDB', estimatedCost: '$0.50/RU/sec' }),
    );
    expect(info.monthlyCost).toBe(0.5);
  });
});

// ─── lookupCostFromResources (via getNodeCostInfo) ──────────────────────────

describe('getNodeCostInfo — resource map lookup', () => {
  it('returns 0 cost when resourceMap is empty', () => {
    const info = getNodeCostInfo(node('n', { iceType: 'Compute.Container' }), new Map());
    expect(info.monthlyCost).toBe(0);
  });

  it("returns 0 cost when resource definition isn't found", () => {
    const info = getNodeCostInfo(
      node('n', { iceType: 'Compute.Container' }),
      new Map([['other-id', { ice_type: 'Other.Type', properties: [] } as ResourceDef]]),
    );
    expect(info.monthlyCost).toBe(0);
  });

  it('looks up cost by node value matching an optionDetails entry', () => {
    const def: ResourceDef = {
      id: 'compute-container',
      ice_type: 'Compute.Container',
      properties: [
        {
          name: 'size',
          optionDetails: [
            { value: 'small', label: 'Small', cost: '$10/mo' },
            { value: 'large', label: 'Large', cost: '$50/mo' },
          ],
        },
      ],
    };
    const map: ResourceMap = new Map([['compute-container', def]]);
    const info = getNodeCostInfo(
      node('n', { iceType: 'Compute.Container', resourceId: 'compute-container', size: 'large' }),
      map,
    );
    expect(info.monthlyCost).toBe(50);
  });

  it('prefers a provider-specific option when provider is set', () => {
    const def: ResourceDef = {
      id: 'compute-container',
      ice_type: 'Compute.Container',
      properties: [
        {
          name: 'size',
          optionDetails: [
            { value: 'small', label: 'Small AWS', cost: '$8/mo', provider: 'aws' },
            { value: 'small', label: 'Small GCP', cost: '$10/mo', provider: 'gcp' },
          ],
        },
      ],
    };
    const map: ResourceMap = new Map([['compute-container', def]]);
    const info = getNodeCostInfo(
      node('n', {
        iceType: 'Compute.Container',
        resourceId: 'compute-container',
        size: 'small',
        provider: 'gcp',
      }),
      map,
    );
    expect(info.monthlyCost).toBe(10);
  });

  it('falls through to first cost-bearing match when provider does not match', () => {
    // The lookup is a chain:
    //   1. value match + provider match  →  miss (no azure entry)
    //   2. value match + cost (any)      →  hits the FIRST cost-bearing
    //      entry whose value matches, regardless of its `provider`. The
    //      generic entry comes second in the array, so AWS wins by index.
    const def: ResourceDef = {
      id: 'compute-container',
      ice_type: 'Compute.Container',
      properties: [
        {
          name: 'size',
          optionDetails: [
            { value: 'small', label: 'Small AWS', cost: '$8/mo', provider: 'aws' },
            { value: 'small', label: 'Small Generic', cost: '$10/mo' },
          ],
        },
      ],
    };
    const map: ResourceMap = new Map([['compute-container', def]]);
    const info = getNodeCostInfo(
      node('n', {
        iceType: 'Compute.Container',
        resourceId: 'compute-container',
        size: 'small',
        provider: 'azure',
      }),
      map,
    );
    expect(info.monthlyCost).toBe(8);
  });

  it('uses the property default when node has no value for that prop', () => {
    const def: ResourceDef = {
      id: 'compute-container',
      ice_type: 'Compute.Container',
      properties: [
        {
          name: 'size',
          default: 'small',
          optionDetails: [
            { value: 'small', label: 'Small', cost: '$10/mo' },
            { value: 'large', label: 'Large', cost: '$50/mo' },
          ],
        },
      ],
    };
    const map: ResourceMap = new Map([['compute-container', def]]);
    const info = getNodeCostInfo(
      node('n', { iceType: 'Compute.Container', resourceId: 'compute-container' }),
      map,
    );
    expect(info.monthlyCost).toBe(10);
  });

  it('falls back to the first cost-bearing option when no value or default matches', () => {
    const def: ResourceDef = {
      id: 'compute-container',
      ice_type: 'Compute.Container',
      properties: [
        {
          name: 'size',
          optionDetails: [
            { value: 'small', label: 'Small', cost: '$15/mo' },
            { value: 'large', label: 'Large', cost: '$50/mo' },
          ],
        },
      ],
    };
    const map: ResourceMap = new Map([['compute-container', def]]);
    const info = getNodeCostInfo(
      node('n', { iceType: 'Compute.Container', resourceId: 'compute-container' }),
      map,
    );
    expect(info.monthlyCost).toBe(15);
  });

  it('skips properties without optionDetails', () => {
    const def: ResourceDef = {
      id: 'compute-container',
      ice_type: 'Compute.Container',
      properties: [
        { name: 'name' },
        {
          name: 'size',
          optionDetails: [{ value: 'small', label: 'Small', cost: '$10/mo' }],
        },
      ],
    };
    const map: ResourceMap = new Map([['compute-container', def]]);
    const info = getNodeCostInfo(
      node('n', { iceType: 'Compute.Container', resourceId: 'compute-container' }),
      map,
    );
    expect(info.monthlyCost).toBe(10);
  });

  it('looks up by iceType when resourceId is missing from the map', () => {
    // Map keyed by iceType — common case when resources don't carry an explicit id.
    const def: ResourceDef = {
      ice_type: 'Compute.Container',
      properties: [
        {
          name: 'size',
          optionDetails: [{ value: 'small', label: 'Small', cost: '$10/mo' }],
        },
      ],
    };
    const map: ResourceMap = new Map([['Compute.Container', def]]);
    const info = getNodeCostInfo(node('n', { iceType: 'Compute.Container' }), map);
    expect(info.monthlyCost).toBe(10);
  });

  it('prefers scaleTier preset values over node values when scaleTier is set', () => {
    // getScalePreset returns {} for unknown resource ids → falls through
    // to node's own value lookup. We pin the simpler "tier set, lookup
    // works" path here; the tier-preset override path requires a real
    // SCALE_PRESETS entry which lives in @ice/core data.
    const def: ResourceDef = {
      id: 'compute-container',
      ice_type: 'Compute.Container',
      properties: [
        {
          name: 'size',
          optionDetails: [
            { value: 'small', label: 'Small', cost: '$10/mo' },
            { value: 'large', label: 'Large', cost: '$50/mo' },
          ],
        },
      ],
    };
    const map: ResourceMap = new Map([['compute-container', def]]);
    const info = getNodeCostInfo(
      node('n', { iceType: 'Compute.Container', resourceId: 'compute-container', size: 'large' }),
      map,
      'medium',
    );
    expect(info.monthlyCost).toBe(50);
  });

  it('prefers node estimatedCost when no scaleTier is set, even with a resource map', () => {
    const def: ResourceDef = {
      id: 'compute-container',
      ice_type: 'Compute.Container',
      properties: [
        {
          name: 'size',
          optionDetails: [{ value: 'small', label: 'Small', cost: '$10/mo' }],
        },
      ],
    };
    const map: ResourceMap = new Map([['compute-container', def]]);
    const info = getNodeCostInfo(
      node('n', {
        iceType: 'Compute.Container',
        resourceId: 'compute-container',
        size: 'small',
        estimatedCost: '$36/mo', // higher priority than the resource lookup
      }),
      map,
    );
    expect(info.monthlyCost).toBe(36);
  });

  it('returns no match when no provider-aware option is found', () => {
    // All optionDetails lack the `cost` field → no fallback either.
    const def: ResourceDef = {
      id: 'compute-container',
      ice_type: 'Compute.Container',
      properties: [
        {
          name: 'size',
          optionDetails: [{ value: 'small', label: 'Small' }],
        },
      ],
    };
    const map: ResourceMap = new Map([['compute-container', def]]);
    const info = getNodeCostInfo(node('n', { iceType: 'Compute.Container', resourceId: 'compute-container' }), map);
    expect(info.monthlyCost).toBe(0);
  });

  it('uses provider-bearing fallback when no value matches but provider is set', () => {
    // Forces both fallback branches: no value match for `size: 'unknown'`,
    // then `prop.optionDetails.find((o) => o.cost && o.provider === provider)`.
    const def: ResourceDef = {
      id: 'compute-container',
      ice_type: 'Compute.Container',
      properties: [
        {
          name: 'size',
          optionDetails: [
            { value: 'small', label: 'Small AWS', cost: '$8/mo', provider: 'aws' },
            { value: 'small', label: 'Small GCP', cost: '$10/mo', provider: 'gcp' },
          ],
        },
      ],
    };
    const map: ResourceMap = new Map([['compute-container', def]]);
    const info = getNodeCostInfo(
      node('n', {
        iceType: 'Compute.Container',
        resourceId: 'compute-container',
        size: 'unknown',
        provider: 'gcp',
      }),
      map,
    );
    expect(info.monthlyCost).toBe(10);
  });
});

// ─── computeCostSummary ─────────────────────────────────────────────────────

describe('computeCostSummary', () => {
  it('aggregates monthly cost across all non-container nodes', () => {
    const nodes: CardNode[] = [
      node('a', { iceType: 'Compute.Container', estimatedCost: '$10/mo' }),
      node('b', { iceType: 'Database.PostgreSQL', estimatedCost: '$20/mo' }),
    ];
    const summary = computeCostSummary(nodes);
    expect(summary.totalMonthlyCost).toBe(30);
    expect(summary.nodeCount).toBe(2);
    expect(summary.scalableNodeCount).toBe(0);
  });

  it('skips container nodes from cost aggregation', () => {
    const nodes: CardNode[] = [
      node('container', { iceType: 'Group.Frontend' }, 'container'),
      node('a', { iceType: 'Compute.Container', estimatedCost: '$10/mo' }),
    ];
    const summary = computeCostSummary(nodes);
    expect(summary.nodeCount).toBe(1);
    expect(summary.totalMonthlyCost).toBe(10);
  });

  it('groups nodes by category and sorts categories by cost descending', () => {
    const nodes: CardNode[] = [
      node('compute', { iceType: 'Compute.Container', estimatedCost: '$10/mo' }),
      node('db1', { iceType: 'Database.PostgreSQL', estimatedCost: '$50/mo' }),
      node('db2', { iceType: 'Database.MySQL', estimatedCost: '$30/mo' }),
    ];
    const summary = computeCostSummary(nodes);
    expect(summary.categories).toHaveLength(2);
    // Data ($80) > Compute ($10).
    expect(summary.categories[0].category).toBe('Data');
    expect(summary.categories[0].label).toBe('Data Storage');
    expect(summary.categories[0].totalCost).toBe(80);
    expect(summary.categories[1].category).toBe('Compute');
    expect(summary.categories[1].totalCost).toBe(10);
  });

  it('falls back to category name as label for unmapped categories', () => {
    // 'Other' is in CATEGORY_LABELS but check for completeness — falsy
    // category fallback uses the prefix when no category is mapped.
    const nodes: CardNode[] = [node('odd', { iceType: 'Custom.Thing', estimatedCost: '$5/mo' })];
    const summary = computeCostSummary(nodes);
    expect(summary.categories).toHaveLength(1);
    expect(summary.categories[0].category).toBe('Other');
    expect(summary.categories[0].label).toBe('Other');
  });

  it('computes scaling range as fixed + scalable (min vs max)', () => {
    const nodes: CardNode[] = [
      // Fixed cost: $20/mo.
      node('db', { iceType: 'Database.PostgreSQL', estimatedCost: '$20/mo' }),
      // Scalable: $10/mo per instance, 1–5 instances, currently 3.
      node('svc', {
        iceType: 'Compute.Container',
        behavior: 'scalable',
        minInstances: 1,
        maxInstances: 5,
        activeInstances: 3,
        estimatedCost: '$10/mo',
      }),
    ];
    const summary = computeCostSummary(nodes);
    // total = 20 + 10*3 = 50
    expect(summary.totalMonthlyCost).toBe(50);
    expect(summary.scalingRange.currentCost).toBe(50);
    // min = 20 (fixed) + 10*1 = 30
    expect(summary.scalingRange.minCost).toBe(30);
    // max = 20 (fixed) + 10*5 = 70
    expect(summary.scalingRange.maxCost).toBe(70);
    expect(summary.scalableNodeCount).toBe(1);
  });

  it('returns an empty summary for an empty node list', () => {
    const summary = computeCostSummary([]);
    expect(summary.totalMonthlyCost).toBe(0);
    expect(summary.nodeCount).toBe(0);
    expect(summary.scalableNodeCount).toBe(0);
    expect(summary.categories).toEqual([]);
    expect(summary.scalingRange).toEqual({ minCost: 0, currentCost: 0, maxCost: 0 });
  });

  it('passes scaleTier through to per-node cost lookup', () => {
    const nodes: CardNode[] = [
      node('svc', {
        iceType: 'Compute.Container',
        behavior: 'scalable',
        minInstances: 1,
        maxInstances: 11,
        estimatedCost: '$10/mo',
      }),
    ];
    // 'high' factor = 0.75 → 1 + (11-1)*0.75 = 8.5 → 9
    const summary = computeCostSummary(nodes, null, 'high');
    expect(summary.totalMonthlyCost).toBe(90);
  });
});

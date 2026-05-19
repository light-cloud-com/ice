/**
 * rf-cost-2 — generate-suggestions.
 *
 * Each rule is exercised independently and in combination, since the function
 * does not short-circuit. Fixtures are built minimally and only carry the
 * `data` keys the rule actually inspects, mirroring how real CardNode rows
 * arrive at this function.
 */

import { describe, it, expect } from 'vitest';
import { generateSuggestions, type CostSuggestion } from '../generate-suggestions';
import type { CostSummary } from '../cost-calculator';
import type { CardNode } from '../../../../store/slices/cards-slice';
import type { Environment } from '../../../../store/slices/environments-slice';

// ─── Builders ─────────────────────────────────────────────────────────────

function buildSummary(overrides: Partial<CostSummary> = {}): CostSummary {
  return {
    totalMonthlyCost: 0,
    categories: [],
    scalingRange: { minCost: 0, currentCost: 0, maxCost: 0 },
    nodeCount: 0,
    scalableNodeCount: 0,
    ...overrides,
  };
}

function buildNode(data: Record<string, unknown>, id = 'n'): CardNode {
  return {
    id,
    type: 'resource',
    position: { x: 0, y: 0 },
    width: 200,
    height: 80,
    data,
  };
}

function buildEnv(type: Environment['type'], id = `env-${type}`): Environment {
  return {
    id,
    project_id: 'p',
    card_id: 'c',
    name: type,
    type,
    region: null,
    is_protected: false,
    pr_number: null,
    pr_branch: null,
  };
}

// ─── Empty / no-op ────────────────────────────────────────────────────────

describe('generateSuggestions — empty inputs', () => {
  it('returns an empty array when nothing fires', () => {
    const out = generateSuggestions(buildSummary(), [], []);
    expect(out).toEqual([]);
  });

  it('returns an empty array even with dev envs but $0 total cost', () => {
    // Rule 1 requires totalMonthlyCost > 50.
    const out = generateSuggestions(buildSummary(), [], [buildEnv('development')]);
    expect(out).toEqual([]);
  });
});

// ─── Rule 1: dev environments using prod-tier instances ─────────────────

describe('generateSuggestions — rule 1 (dev envs + expensive nodes)', () => {
  it('fires when a dev env exists and at least one node is > $50/mo', () => {
    const out = generateSuggestions(
      buildSummary({ totalMonthlyCost: 100 }),
      [buildNode({ estimatedCost: '$60/mo' })],
      [buildEnv('development')],
    );
    expect(out).toHaveLength(1);
    expect(out[0].message).toContain('1 resource(s) cost >$50/mo');
    expect(out[0].severity).toBe('medium');
    expect(out[0].savings).toMatch(/\/mo$/);
  });

  it('fires for `pr` env type as well', () => {
    const out = generateSuggestions(
      buildSummary({ totalMonthlyCost: 100 }),
      [buildNode({ estimatedCost: '$80/mo' })],
      [buildEnv('pr')],
    );
    expect(out).toHaveLength(1);
    expect(out[0].message).toContain('1 resource(s)');
  });

  it('does NOT fire when total is <= $50 (gating threshold)', () => {
    const out = generateSuggestions(
      buildSummary({ totalMonthlyCost: 49 }),
      [buildNode({ estimatedCost: '$60/mo' })],
      [buildEnv('development')],
    );
    expect(out).toEqual([]);
  });

  it('does NOT fire without a dev/pr env', () => {
    const out = generateSuggestions(
      buildSummary({ totalMonthlyCost: 100 }),
      [buildNode({ estimatedCost: '$60/mo' })],
      [buildEnv('production'), buildEnv('staging')],
    );
    expect(out).toEqual([]);
  });

  it('counts only nodes with estimatedCost > $50 (not exactly equal)', () => {
    const out = generateSuggestions(
      buildSummary({ totalMonthlyCost: 100 }),
      [
        buildNode({ estimatedCost: '$50/mo' }, 'eq50'),
        buildNode({ estimatedCost: '$51/mo' }, 'gt50'),
        buildNode({ estimatedCost: '$10/mo' }, 'lt50'),
      ],
      [buildEnv('development')],
    );
    expect(out).toHaveLength(1);
    expect(out[0].message).toContain('1 resource(s)');
  });

  it('handles missing estimatedCost gracefully (parsed as 0, not counted)', () => {
    const out = generateSuggestions(
      buildSummary({ totalMonthlyCost: 100 }),
      [buildNode({})],
      [buildEnv('development')],
    );
    expect(out).toEqual([]);
  });
});

// ─── Rule 2: scalable services with min == max ───────────────────────────

describe('generateSuggestions — rule 2 (scalable with fixed instances)', () => {
  it('fires when a scalable node has min == max > 1', () => {
    const out = generateSuggestions(
      buildSummary(),
      [buildNode({ behavior: 'scalable', minInstances: 3, maxInstances: 3 })],
      [],
    );
    expect(out).toHaveLength(1);
    expect(out[0].message).toContain('1 scalable service(s)');
    expect(out[0].severity).toBe('medium');
    expect(out[0].savings).toBeUndefined();
  });

  it('does NOT fire for min == max == 1 (single-instance, not scalable)', () => {
    const out = generateSuggestions(
      buildSummary(),
      [buildNode({ behavior: 'scalable', minInstances: 1, maxInstances: 1 })],
      [],
    );
    expect(out).toEqual([]);
  });

  it('does NOT fire when min < max (autoscaling already enabled)', () => {
    const out = generateSuggestions(
      buildSummary(),
      [buildNode({ behavior: 'scalable', minInstances: 1, maxInstances: 5 })],
      [],
    );
    expect(out).toEqual([]);
  });

  it('does NOT fire for non-scalable behavior', () => {
    const out = generateSuggestions(
      buildSummary(),
      [buildNode({ behavior: 'fixed', minInstances: 3, maxInstances: 3 })],
      [],
    );
    expect(out).toEqual([]);
  });

  it('uses min as a default for max when max is missing/falsy', () => {
    // min=2, max omitted → max defaults to min (2), so min==max==2>1 → fires.
    const out = generateSuggestions(
      buildSummary(),
      [buildNode({ behavior: 'scalable', minInstances: 2 })],
      [],
    );
    expect(out).toHaveLength(1);
    expect(out[0].message).toContain('1 scalable service(s)');
  });
});

// ─── Rule 3: high max instance counts ────────────────────────────────────

describe('generateSuggestions — rule 3 (high max instance counts)', () => {
  it('fires when max > 10 AND scaling delta > $100', () => {
    const out = generateSuggestions(
      buildSummary({
        scalingRange: { minCost: 0, currentCost: 100, maxCost: 250 },
      }),
      [buildNode({ maxInstances: 50 })],
      [],
    );
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe('high');
    expect(out[0].message).toContain('At maximum scale');
    expect(out[0].savings).toContain('Cap at');
    expect(out[0].savings).toContain('/mo max overage');
  });

  it('does NOT fire when max delta is at or below $100', () => {
    const out = generateSuggestions(
      buildSummary({ scalingRange: { minCost: 0, currentCost: 100, maxCost: 200 } }),
      [buildNode({ maxInstances: 50 })],
      [],
    );
    expect(out).toEqual([]);
  });

  it('does NOT fire when no node has max > 10', () => {
    const out = generateSuggestions(
      buildSummary({ scalingRange: { minCost: 0, currentCost: 0, maxCost: 1000 } }),
      [buildNode({ maxInstances: 10 })],
      [],
    );
    expect(out).toEqual([]);
  });
});

// ─── Rule 4: reserved instance hint ──────────────────────────────────────

describe('generateSuggestions — rule 4 (reserved instances)', () => {
  it('fires once total monthly is > $200', () => {
    const out = generateSuggestions(buildSummary({ totalMonthlyCost: 250 }), [], []);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe('low');
    expect(out[0].message).toContain('reserved instances');
    expect(out[0].savings).toContain('/mo');
  });

  it('does NOT fire at exactly $200', () => {
    const out = generateSuggestions(buildSummary({ totalMonthlyCost: 200 }), [], []);
    expect(out).toEqual([]);
  });
});

// ─── Rule 5: multi-AZ database warning ───────────────────────────────────

describe('generateSuggestions — rule 5 (single-AZ databases)', () => {
  it('fires when a Data.* node is missing multi_az AND total > $100', () => {
    const out = generateSuggestions(
      buildSummary({ totalMonthlyCost: 150 }),
      [buildNode({ iceType: 'Data.PostgreSQL' })],
      [],
    );
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe('medium');
    expect(out[0].message).toContain('1 database(s)');
  });

  it('does NOT fire when multi_az is true', () => {
    const out = generateSuggestions(
      buildSummary({ totalMonthlyCost: 150 }),
      [buildNode({ iceType: 'Data.PostgreSQL', multi_az: true })],
      [],
    );
    expect(out).toEqual([]);
  });

  it('does NOT fire when total cost is <= $100', () => {
    const out = generateSuggestions(
      buildSummary({ totalMonthlyCost: 100 }),
      [buildNode({ iceType: 'Data.PostgreSQL' })],
      [],
    );
    expect(out).toEqual([]);
  });

  it('does NOT fire for non-Data.* iceTypes', () => {
    const out = generateSuggestions(
      buildSummary({ totalMonthlyCost: 150 }),
      [buildNode({ iceType: 'Compute.Function' })],
      [],
    );
    expect(out).toEqual([]);
  });
});

// ─── Stacking ─────────────────────────────────────────────────────────────

describe('generateSuggestions — multi-rule stacking', () => {
  it('returns multiple suggestions when several rules fire simultaneously', () => {
    const out: CostSuggestion[] = generateSuggestions(
      buildSummary({
        totalMonthlyCost: 300, // triggers rule 4 ($200+) and rule 1 gating
        scalingRange: { minCost: 0, currentCost: 100, maxCost: 500 }, // delta 400 → rule 3
      }),
      [
        buildNode({ estimatedCost: '$100/mo', behavior: 'scalable', minInstances: 2, maxInstances: 2, maxInstances_alt: 2 }, 'a'),
        buildNode({ maxInstances: 50 }, 'b'),
        buildNode({ iceType: 'Data.PostgreSQL' }, 'c'),
      ],
      [buildEnv('development')],
    );
    // Rule 1 fires (dev env + $100 node), Rule 2 fires (scalable min==max==2),
    // Rule 3 fires (max 50 + $400 delta), Rule 4 fires ($300 > $200),
    // Rule 5 fires (Data.* + total $300 > $100). All five.
    expect(out.length).toBeGreaterThanOrEqual(4);
    const severities = out.map((s) => s.severity);
    expect(severities).toContain('high');
    expect(severities).toContain('medium');
    expect(severities).toContain('low');
  });
});

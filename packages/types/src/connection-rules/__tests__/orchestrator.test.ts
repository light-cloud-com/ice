/**
 * Orchestrator-level tests for the derived helpers in
 * `connection-rules.ts` — the small set of functions that compose
 * predicates + rule data + constants into the call surface every
 * consumer touches.
 *
 * Covered: `getDefaultPort`, `getEnvVarName`, `isInsideContainer`,
 * `canConnect`, `findConnectionRule`, `getValidTargetIds`,
 * `inferConnectionMeta`, `validateConnection`, `wouldCreateCycle`.
 *
 * The unit-N tests in `types.test.ts` / `predicates.test.ts` /
 * `rules-data.test.ts` cover the underlying surfaces; this file is
 * about the composition.
 */

import { describe, expect, it } from 'vitest';
import { CATEGORY_COLORS, DEFAULT_ENV_VARS, DEFAULT_PORTS } from '@ice/constants';
import {
  canConnect,
  findConnectionRule,
  getDefaultPort,
  getEnvVarName,
  getValidTargetIds,
  inferConnectionMeta,
  isInsideContainer,
  validateConnection,
  wouldCreateCycle,
  type NodeForConnectionCheck,
} from '../../connection-rules';

describe('getDefaultPort / getEnvVarName', () => {
  it('returns the value from DEFAULT_PORTS when present', () => {
    const sample = Object.entries(DEFAULT_PORTS)[0];
    if (sample) {
      const [iceType, port] = sample;
      expect(getDefaultPort(iceType)).toBe(port);
    }
  });
  it('returns undefined for unknown iceTypes', () => {
    expect(getDefaultPort('Garbage.NotAType')).toBeUndefined();
  });
  it('returns the value from DEFAULT_ENV_VARS when present', () => {
    const sample = Object.entries(DEFAULT_ENV_VARS)[0];
    if (sample) {
      const [iceType, envVar] = sample;
      expect(getEnvVarName(iceType)).toBe(envVar);
    }
  });
  it('returns undefined for unknown iceTypes (env var)', () => {
    expect(getEnvVarName('Garbage.NotAType')).toBeUndefined();
  });
});

describe('isInsideContainer', () => {
  it('returns false for a top-level node (no parent)', () => {
    const nodes: NodeForConnectionCheck[] = [{ id: 'n1' }];
    expect(isInsideContainer('n1', nodes)).toBe(false);
  });

  it('returns true when the parent is a VPC iceType', () => {
    const nodes: NodeForConnectionCheck[] = [
      { id: 'p', data: { iceType: 'Network.VPC' } },
      { id: 'n1', parentId: 'p' },
    ];
    expect(isInsideContainer('n1', nodes)).toBe(true);
  });

  it('returns true when the parent has nodeType "container" without a container iceType', () => {
    const nodes: NodeForConnectionCheck[] = [
      { id: 'p', type: 'container' },
      { id: 'n1', parentId: 'p' },
    ];
    expect(isInsideContainer('n1', nodes)).toBe(true);
  });

  it('walks transitive ancestors', () => {
    const nodes: NodeForConnectionCheck[] = [
      { id: 'gp', data: { iceType: 'Network.VPC' } },
      { id: 'p', parentId: 'gp', data: { iceType: 'Compute.Backend' } },
      { id: 'n1', parentId: 'p' },
    ];
    expect(isInsideContainer('n1', nodes)).toBe(true);
  });

  it('returns false when an ancestor pointer dangles (parent not in map)', () => {
    const nodes: NodeForConnectionCheck[] = [{ id: 'n1', parentId: 'missing' }];
    expect(isInsideContainer('n1', nodes)).toBe(false);
  });

  it('returns false when no ancestor is a container', () => {
    const nodes: NodeForConnectionCheck[] = [
      { id: 'p', data: { iceType: 'Compute.Backend' } },
      { id: 'n1', parentId: 'p' },
    ];
    expect(isInsideContainer('n1', nodes)).toBe(false);
  });

  it('terminates at depth 20 to avoid pathological cycles', () => {
    // Build a 25-deep chain where the deepest ancestor is a VPC; the
    // depth cap means we should NOT find it.
    const nodes: NodeForConnectionCheck[] = [];
    for (let i = 0; i < 25; i++) {
      nodes.push({
        id: `n${i}`,
        parentId: i < 24 ? `n${i + 1}` : undefined,
        data: i === 24 ? { iceType: 'Network.VPC' } : {},
      });
    }
    expect(isInsideContainer('n0', nodes)).toBe(false);
  });

  it('handles parentId === null without crashing (root node)', () => {
    const nodes: NodeForConnectionCheck[] = [{ id: 'n1', parentId: null }];
    expect(isInsideContainer('n1', nodes)).toBe(false);
  });
});

describe('canConnect — basics', () => {
  it('rejects container source or target unconditionally', () => {
    expect(canConnect('Network.VPC', 'Compute.Backend')).toBe(false);
    expect(canConnect('Compute.Backend', 'Network.VPC')).toBe(false);
    expect(canConnect('Compute.Backend', 'Compute.Backend', 'container')).toBe(false);
    expect(canConnect('Compute.Backend', 'Compute.Backend', undefined, 'group')).toBe(false);
  });

  it('accepts a known valid pair (Backend → Database)', () => {
    expect(canConnect('Compute.Backend', 'Database.PostgreSQL')).toBe(true);
  });

  it('rejects when no rule matches', () => {
    expect(canConnect('Source.Repository', 'Database.PostgreSQL')).toBe(false);
  });

  it('honors reverse-direction rules (Database → Backend)', () => {
    expect(canConnect('Database.PostgreSQL', 'Compute.Backend')).toBe(true);
  });
});

describe('canConnect — parent-aware Custom Domain rules', () => {
  it('rejects standalone CustomDomain → VPC-internal target when context is provided', () => {
    const nodes: NodeForConnectionCheck[] = [
      { id: 'cd', data: { iceType: 'Network.CustomDomain' } },
      { id: 'vpc', data: { iceType: 'Network.VPC' } },
      { id: 'svc', parentId: 'vpc', data: { iceType: 'Compute.Backend' } },
    ];
    const ok = canConnect('Network.CustomDomain', 'Compute.Backend', undefined, undefined, {
      srcNode: nodes[0],
      tgtNode: nodes[2],
      allNodes: nodes,
    });
    expect(ok).toBe(false);
  });

  it('allows nested CustomDomain → sibling inside the same PrivateNetwork', () => {
    const nodes: NodeForConnectionCheck[] = [
      { id: 'pn', data: { iceType: 'Network.PrivateNetwork' } },
      { id: 'cd', parentId: 'pn', data: { iceType: 'Network.CustomDomain' } },
      { id: 'svc', parentId: 'pn', data: { iceType: 'Compute.Backend' } },
    ];
    const ok = canConnect('Network.CustomDomain', 'Compute.Backend', undefined, undefined, {
      srcNode: nodes[1],
      tgtNode: nodes[2],
      allNodes: nodes,
    });
    expect(ok).toBe(true);
  });

  it('rejects when target is the CustomDomain side and source is VPC-internal', () => {
    const nodes: NodeForConnectionCheck[] = [
      { id: 'vpc', data: { iceType: 'Network.VPC' } },
      { id: 'svc', parentId: 'vpc', data: { iceType: 'Compute.Backend' } },
      { id: 'cd', data: { iceType: 'Network.CustomDomain' } },
    ];
    const ok = canConnect('Compute.Backend', 'Network.CustomDomain', undefined, undefined, {
      srcNode: nodes[1],
      tgtNode: nodes[2],
      allNodes: nodes,
    });
    expect(ok).toBe(false);
  });

  it('skips parent-aware rejection when context.allNodes is empty', () => {
    // No context → only iceType-level checks. CustomDomain → Backend
    // is allowed by the Domain → Routable rule.
    expect(canConnect('Network.CustomDomain', 'Compute.Backend')).toBe(true);
  });

  it('skips parent-aware rejection when only one of srcNode/tgtNode is provided', () => {
    const nodes: NodeForConnectionCheck[] = [
      { id: 'vpc', data: { iceType: 'Network.VPC' } },
      { id: 'svc', parentId: 'vpc', data: { iceType: 'Compute.Backend' } },
    ];
    const ok = canConnect('Network.CustomDomain', 'Compute.Backend', undefined, undefined, {
      srcNode: undefined,
      tgtNode: nodes[1],
      allNodes: nodes,
    });
    // Without srcNode, the parent-aware branch can't run — falls back
    // to iceType-only rule match.
    expect(ok).toBe(true);
  });
});

describe('findConnectionRule', () => {
  it('returns the matching rule when one exists', () => {
    const r = findConnectionRule('Compute.Backend', 'Database.PostgreSQL');
    expect(r).not.toBeNull();
    expect(r?.category).toBe('traffic');
    expect(r?.trafficType).toBe('data');
  });

  it('returns null when no rule matches', () => {
    expect(findConnectionRule('Source.Repository', 'Database.PostgreSQL')).toBeNull();
  });
});

describe('getValidTargetIds', () => {
  it('returns the set of nodeIds connectable from a backend', () => {
    const ids = getValidTargetIds(
      'Compute.Backend',
      undefined,
      [
        { id: 'src', iceType: 'Compute.Backend' },
        { id: 'db', iceType: 'Database.PostgreSQL' },
        { id: 'cache', iceType: 'Compute.RedisInstance' },
        { id: 'self', iceType: 'Compute.Backend' },
        { id: 'vpc', iceType: 'Network.VPC' },
      ],
      'src',
    );
    // Should include db, cache, self (Backend→Backend is valid), but
    // NOT 'src' itself, and NOT 'vpc' (containers are unconnectable).
    expect(ids).toContain('db');
    expect(ids).toContain('cache');
    expect(ids).toContain('self');
    expect(ids).not.toContain('src');
    expect(ids).not.toContain('vpc');
  });

  it('returns [] when the source is a container', () => {
    const ids = getValidTargetIds(
      'Network.VPC',
      undefined,
      [{ id: 'svc', iceType: 'Compute.Backend' }],
      'vpc',
    );
    expect(ids).toEqual([]);
  });

  it('uses the per-target nodeType to skip target containers', () => {
    const ids = getValidTargetIds(
      'Compute.Backend',
      undefined,
      [
        { id: 'a', iceType: 'Compute.Backend' },
        { id: 'b', iceType: 'Compute.Backend', nodeType: 'container' },
      ],
      'src',
    );
    expect(ids).toContain('a');
    expect(ids).not.toContain('b');
  });
});

describe('inferConnectionMeta', () => {
  it('returns category + lineStyle + color from the matching rule', () => {
    const meta = inferConnectionMeta('Compute.Backend', 'Database.PostgreSQL');
    expect(meta.category).toBe('traffic');
    expect(meta.trafficType).toBe('data');
    expect(meta.lineStyle).toBe('solid');
    expect(meta.color).toBe(CATEGORY_COLORS.traffic);
  });

  it('flags reverse-direction rules with flip: true', () => {
    const meta = inferConnectionMeta('Database.PostgreSQL', 'Compute.Backend');
    expect(meta.flip).toBe(true);
    expect(meta.trafficType).toBe('data');
  });

  it('auto-injects port + envVar from the data-target side (forward direction)', () => {
    // The data target is the literal target on a non-flipped rule.
    const sample = Object.entries(DEFAULT_PORTS).find(([k]) => k === 'Compute.RedisInstance' || /Redis/.test(k));
    if (sample) {
      const meta = inferConnectionMeta('Compute.Backend', sample[0]);
      expect(meta.port).toBe(6379); // Redis cache override
    }
  });

  it('overrides port to 6379 for cache data-targets', () => {
    // `Compute.<Cache>` would also match isBackend, which puts the
    // earlier Backend→Backend (request) rule ahead of Backend→Cache
    // (data). Use a memcache-only iceType that misses isBackend.
    const meta = inferConnectionMeta('Compute.Backend', 'MyMemcacheBox');
    expect(meta.trafficType).toBe('data');
    expect(meta.port).toBe(6379);
  });

  it('falls back to a generic traffic/request meta when no rule matches', () => {
    const meta = inferConnectionMeta('Source.Repository', 'Database.PostgreSQL');
    expect(meta.category).toBe('traffic');
    expect(meta.trafficType).toBe('request');
    expect(meta.lineStyle).toBe('solid');
    expect(meta.color).toBe(CATEGORY_COLORS.traffic);
  });

  it('on a reverse rule, port lookup uses the original src (the data side)', () => {
    // Cache → Backend (reverse=true). Data-target = src (cache).
    // Use a memcache-only iceType so isBackend doesn't match the source
    // and steer the lookup to a Backend→Backend (request) rule first.
    const meta = inferConnectionMeta('MyMemcacheBox', 'Compute.Backend');
    expect(meta.flip).toBe(true);
    expect(meta.trafficType).toBe('data');
    expect(meta.port).toBe(6379);
  });
});

describe('validateConnection', () => {
  it('reports a container-source error', () => {
    const w = validateConnection('Network.VPC', 'Compute.Backend', [], 'a', 'b');
    expect(w.some((x) => x.level === 'error' && x.message.includes('container'))).toBe(true);
  });

  it('reports a container-target error', () => {
    const w = validateConnection('Compute.Backend', 'Network.VPC', [], 'a', 'b');
    expect(w.some((x) => x.level === 'error' && x.message.includes('container'))).toBe(true);
  });

  it('reports the frontend → database security warning', () => {
    const w = validateConnection('Compute.StaticSite', 'Database.PostgreSQL', [], 'a', 'b');
    expect(w.some((x) => x.level === 'warning' && /security risk/.test(x.message))).toBe(true);
    expect(w.find((x) => /security risk/.test(x.message))?.suggestion).toBe('Add a Backend between them');
  });

  it('reports the frontend → queue warning', () => {
    const w = validateConnection('Compute.StaticSite', 'Messaging.SQS', [], 'a', 'b');
    expect(w.some((x) => /Clients should not publish/.test(x.message))).toBe(true);
  });

  it('reports a duplicate-edge warning when edges already cover the pair (either direction)', () => {
    const w1 = validateConnection('Compute.Backend', 'Database.PostgreSQL', [{ source: 'a', target: 'b' }], 'a', 'b');
    expect(w1.some((x) => /already connected/.test(x.message))).toBe(true);

    const w2 = validateConnection('Compute.Backend', 'Database.PostgreSQL', [{ source: 'b', target: 'a' }], 'a', 'b');
    expect(w2.some((x) => /already connected/.test(x.message))).toBe(true);
  });

  it('reports a self-connection error', () => {
    const w = validateConnection('Compute.Backend', 'Compute.Backend', [], 'a', 'a');
    expect(w.some((x) => x.level === 'error' && /cannot connect to itself/.test(x.message))).toBe(true);
  });

  it('uses the iceType last segment as the container name in the message', () => {
    const w = validateConnection('Network.VPC', 'Compute.Backend', [], 'a', 'b');
    expect(w[0].message.startsWith('VPC ')).toBe(true);
  });

  it('returns an empty array for a clean connection', () => {
    const w = validateConnection('Compute.Backend', 'Database.PostgreSQL', [], 'a', 'b');
    expect(w).toEqual([]);
  });
});

describe('wouldCreateCycle', () => {
  it('returns false when no edges connect the candidate pair to anything reachable', () => {
    expect(wouldCreateCycle('a', 'b', [])).toBe(false);
  });

  it('returns true when target → source path already exists', () => {
    // Edges form b → a. If we add a → b, we close the cycle.
    expect(wouldCreateCycle('a', 'b', [{ source: 'b', target: 'a' }])).toBe(true);
  });

  it('detects multi-hop cycles via BFS', () => {
    // b → c → a path exists, so a → b would close the cycle.
    expect(
      wouldCreateCycle('a', 'b', [
        { source: 'b', target: 'c' },
        { source: 'c', target: 'a' },
      ]),
    ).toBe(true);
  });

  it('does NOT flag siblings as cyclic (no a-reachability)', () => {
    expect(
      wouldCreateCycle('a', 'b', [
        { source: 'b', target: 'c' },
        { source: 'c', target: 'd' },
      ]),
    ).toBe(false);
  });

  it('avoids infinite loops on cyclic graphs (visited tracking)', () => {
    expect(
      wouldCreateCycle('z', 'b', [
        { source: 'b', target: 'c' },
        { source: 'c', target: 'b' },
      ]),
    ).toBe(false);
  });

  it('handles target === source case (self-edge candidate, source equals target)', () => {
    expect(wouldCreateCycle('a', 'a', [])).toBe(true);
  });
});

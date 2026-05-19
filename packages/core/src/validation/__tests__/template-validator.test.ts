/**
 * Template Validator Tests
 *
 * Drives validateTemplate through every issue branch:
 * unknown iceType, out-of-bounds connections, self-connections,
 * invalid pair, group block-index bounds, parent-group bounds,
 * parent-after-child ordering.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const knownIceTypes = new Set<string>();

vi.mock('../schema-bridge', () => ({
  isKnownIceType: (t: string) => knownIceTypes.has(t),
  getPropertiesForIceType: () => [],
  getResourceForIceType: () => undefined,
  getSupportedProviders: () => [],
}));

import { validateTemplate } from '../template-validator';

const blocks = (...types: string[]) =>
  types.map((iceType, i) => ({ iceType, label: `Block${i}`, position: { x: 0, y: 0 } }));

beforeEach(() => {
  vi.clearAllMocks();
  knownIceTypes.clear();
  knownIceTypes.add('Compute.Container');
  knownIceTypes.add('Compute.StaticSite');
  knownIceTypes.add('Database.PostgreSQL');
});

describe('validateTemplate', () => {
  it('returns no issues for a valid template', () => {
    const issues = validateTemplate({
      id: 't1',
      name: 'Three Tier',
      blocks: blocks('Compute.StaticSite', 'Compute.Container', 'Database.PostgreSQL'),
      connections: [
        { fromBlock: 0, toBlock: 1, relationship: 'request' },
        { fromBlock: 1, toBlock: 2, relationship: 'data' },
      ],
    });
    expect(issues).toEqual([]);
  });

  it('flags blocks with unknown iceTypes', () => {
    const issues = validateTemplate({
      id: 't1',
      name: 'T',
      blocks: blocks('Compute.Container', 'Made.Up'),
      connections: [],
    });
    const r = issues.find((i) => i.code === 'MISSING_ICE_TYPE');
    expect(r?.id).toContain('block:1');
    expect(r?.message).toContain('Made.Up');
  });

  it('flags fromBlock indices that are out of bounds (negative and too high)', () => {
    const issues = validateTemplate({
      id: 't1',
      name: 'T',
      blocks: blocks('Compute.Container'),
      connections: [
        { fromBlock: -1, toBlock: 0, relationship: 'request' },
        { fromBlock: 99, toBlock: 0, relationship: 'request' },
      ],
    });
    const r = issues.filter((i) => i.code === 'DANGLING_EDGE_SOURCE');
    expect(r).toHaveLength(2);
  });

  it('flags toBlock indices that are out of bounds', () => {
    const issues = validateTemplate({
      id: 't1',
      name: 'T',
      blocks: blocks('Compute.Container'),
      connections: [
        { fromBlock: 0, toBlock: -1, relationship: 'request' },
        { fromBlock: 0, toBlock: 99, relationship: 'request' },
      ],
    });
    const r = issues.filter((i) => i.code === 'DANGLING_EDGE_TARGET');
    expect(r).toHaveLength(2);
  });

  it('flags self-connections', () => {
    const issues = validateTemplate({
      id: 't1',
      name: 'T',
      blocks: blocks('Compute.Container'),
      connections: [{ fromBlock: 0, toBlock: 0, relationship: 'request' }],
    });
    expect(issues.find((i) => i.code === 'SELF_CONNECTION')).toBeTruthy();
  });

  it('flags invalid connection pairs (canConnect false)', () => {
    const issues = validateTemplate({
      id: 't1',
      name: 'T',
      blocks: blocks('Database.PostgreSQL', 'Database.PostgreSQL'),
      connections: [{ fromBlock: 0, toBlock: 1, relationship: 'data' }],
    });
    const r = issues.find((i) => i.code === 'INVALID_CONNECTION');
    expect(r?.severity).toBe('warning');
    expect(r?.message).toContain('Database.PostgreSQL');
  });

  it('does not run the canConnect check on out-of-bounds or self-connection rows', () => {
    const issues = validateTemplate({
      id: 't1',
      name: 'T',
      blocks: blocks('Database.PostgreSQL'),
      connections: [
        { fromBlock: 0, toBlock: 0, relationship: 'data' },
        { fromBlock: 99, toBlock: 0, relationship: 'data' },
      ],
    });
    expect(issues.find((i) => i.code === 'INVALID_CONNECTION')).toBeUndefined();
  });

  it('flags group blockIndices that are out of bounds', () => {
    const issues = validateTemplate({
      id: 't1',
      name: 'T',
      blocks: blocks('Compute.Container'),
      connections: [],
      groups: [{ subtype: 'vpc', label: 'My VPC', blockIndices: [0, 99, -1] }],
    });
    const oob = issues.filter((i) => i.code === 'INVALID_PARENT_REF' && i.id.includes('block_oob'));
    expect(oob).toHaveLength(2);
  });

  it('flags parentGroupIndex out of bounds', () => {
    const issues = validateTemplate({
      id: 't1',
      name: 'T',
      blocks: blocks('Compute.Container'),
      connections: [],
      groups: [
        { subtype: 'vpc', label: 'Outer', blockIndices: [0], parentGroupIndex: -1 },
        { subtype: 'subnet', label: 'Inner', blockIndices: [0], parentGroupIndex: 99 },
      ],
    });
    const r = issues.filter((i) => i.id.includes('parent_oob'));
    expect(r).toHaveLength(2);
  });

  it('flags parent-group ordering when parent appears after child', () => {
    const issues = validateTemplate({
      id: 't1',
      name: 'T',
      blocks: blocks('Compute.Container'),
      connections: [],
      groups: [
        // group[0] references group[1] as parent — but parent should come first
        { subtype: 'subnet', label: 'Child', blockIndices: [0], parentGroupIndex: 1 },
        { subtype: 'vpc', label: 'Parent', blockIndices: [0] },
      ],
    });
    const r = issues.find((i) => i.id.includes('parent_after_child'));
    expect(r?.message).toContain('parents must come first');
  });

  it('does not flag a parent-group when ordering is correct', () => {
    const issues = validateTemplate({
      id: 't1',
      name: 'T',
      blocks: blocks('Compute.Container'),
      connections: [],
      groups: [
        { subtype: 'vpc', label: 'Outer', blockIndices: [0] },
        { subtype: 'subnet', label: 'Inner', blockIndices: [0], parentGroupIndex: 0 },
      ],
    });
    expect(issues.find((i) => i.id.includes('parent_after_child'))).toBeUndefined();
    expect(issues.find((i) => i.id.includes('parent_oob'))).toBeUndefined();
  });

  it('handles templates with no groups field gracefully', () => {
    const issues = validateTemplate({
      id: 't1',
      name: 'T',
      blocks: blocks('Compute.Container'),
      connections: [],
    });
    expect(issues).toEqual([]);
  });
});

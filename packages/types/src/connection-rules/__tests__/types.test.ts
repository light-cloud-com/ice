/**
 * Type-shape contract tests for `connection-rules/types.ts`.
 *
 * The module is a pure type/interface declaration file — there is no
 * runtime to assert against. These tests build representative literals
 * that satisfy each declared shape and exercise the discriminants. The
 * `expectType` helper relies on TypeScript at typecheck time; vitest's
 * job is to confirm the literals construct without runtime errors.
 */

import { describe, expect, it } from 'vitest';
import type {
  TrafficType,
  LineStyle,
  ConnectionMeta,
  ConnectionWarning,
  ConnectionRule,
  NodeForConnectionCheck,
} from '../types';

describe('connection-rules/types — TrafficType', () => {
  it('admits each valid traffic discriminant', () => {
    const values: TrafficType[] = ['request', 'data', 'publish', 'subscribe', 'stream'];
    expect(values).toHaveLength(5);
  });
});

describe('connection-rules/types — LineStyle', () => {
  it('admits each valid line-style discriminant', () => {
    const values: LineStyle[] = ['solid', 'dashed', 'dotted', 'thin'];
    expect(values).toHaveLength(4);
  });
});

describe('connection-rules/types — ConnectionMeta', () => {
  it('constructs a minimal traffic-category meta', () => {
    const meta: ConnectionMeta = {
      category: 'traffic',
      lineStyle: 'solid',
      color: '#10b981',
    };
    expect(meta.category).toBe('traffic');
    expect(meta.color).toBe('#10b981');
  });

  it('admits all optional fields (trafficType, port, envVar, flip, label)', () => {
    const meta: ConnectionMeta = {
      category: 'traffic',
      trafficType: 'data',
      lineStyle: 'solid',
      color: '#10b981',
      port: 5432,
      envVarName: 'DATABASE_URL',
      flip: true,
      label: 'Database → Backend',
    };
    expect(meta.trafficType).toBe('data');
    expect(meta.port).toBe(5432);
    expect(meta.flip).toBe(true);
    expect(meta.envVarName).toBe('DATABASE_URL');
    expect(meta.label).toBe('Database → Backend');
  });

  it('admits each connection category', () => {
    const a: ConnectionMeta = { category: 'pipeline', lineStyle: 'dashed', color: '#a855f7' };
    const b: ConnectionMeta = { category: 'config', lineStyle: 'dotted', color: '#f59e0b' };
    const c: ConnectionMeta = { category: 'dns', lineStyle: 'solid', color: '#06b6d4' };
    expect([a.category, b.category, c.category]).toEqual(['pipeline', 'config', 'dns']);
  });
});

describe('connection-rules/types — ConnectionWarning', () => {
  it('admits error / warning / info levels', () => {
    const e: ConnectionWarning = { level: 'error', message: 'boom' };
    const w: ConnectionWarning = { level: 'warning', message: 'soft', suggestion: 'do X' };
    const i: ConnectionWarning = { level: 'info', message: 'fyi' };
    expect([e.level, w.level, i.level]).toEqual(['error', 'warning', 'info']);
    expect(w.suggestion).toBe('do X');
  });
});

describe('connection-rules/types — ConnectionRule', () => {
  it('admits a forward-direction rule with traffic type', () => {
    const rule: ConnectionRule = {
      label: 'Backend → Database',
      source: (t) => t.startsWith('Compute.'),
      target: (t) => t.startsWith('Database.'),
      category: 'traffic',
      trafficType: 'data',
      lineStyle: 'solid',
    };
    expect(rule.source('Compute.Backend')).toBe(true);
    expect(rule.source('Database.PostgreSQL')).toBe(false);
    expect(rule.target('Database.PostgreSQL')).toBe(true);
    expect(rule.reverse).toBeUndefined();
  });

  it('admits a reverse-direction rule', () => {
    const rule: ConnectionRule = {
      label: 'Database → Backend (flip)',
      source: (t) => t.startsWith('Database.'),
      target: (t) => t.startsWith('Compute.'),
      category: 'traffic',
      trafficType: 'data',
      lineStyle: 'solid',
      reverse: true,
    };
    expect(rule.reverse).toBe(true);
  });

  it('admits non-traffic rules without trafficType', () => {
    const rule: ConnectionRule = {
      label: 'Repo → Service',
      source: (t) => t === 'Source.Repository',
      target: (t) => t.startsWith('Compute.'),
      category: 'pipeline',
      lineStyle: 'dashed',
    };
    expect(rule.trafficType).toBeUndefined();
  });
});

describe('connection-rules/types — NodeForConnectionCheck', () => {
  it('accepts the minimal id-only shape', () => {
    const node: NodeForConnectionCheck = { id: 'n1' };
    expect(node.id).toBe('n1');
    expect(node.parentId).toBeUndefined();
  });

  it('accepts a parented + typed + data-bearing node', () => {
    const node: NodeForConnectionCheck = {
      id: 'n2',
      parentId: 'p1',
      data: { iceType: 'Compute.Backend' },
      type: 'block',
    };
    expect(node.parentId).toBe('p1');
    expect((node.data as Record<string, unknown>).iceType).toBe('Compute.Backend');
    expect(node.type).toBe('block');
  });

  it('accepts parentId === null (root-level)', () => {
    const node: NodeForConnectionCheck = { id: 'n3', parentId: null };
    expect(node.parentId).toBeNull();
  });
});

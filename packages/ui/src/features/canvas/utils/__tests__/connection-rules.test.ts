import { describe, it, expect } from 'vitest';
import { analyzeCanvasPatterns } from '../connection-rules';

const node = (id: string, iceType?: string) => (iceType === undefined ? { id, data: {} } : { id, data: { iceType } });

describe('connection-rules — re-export contract', () => {
  it('forwards classification + connection helpers from @ice/types', async () => {
    const m = await import('../connection-rules');
    for (const fn of [
      'isDatabase',
      'isCache',
      'isQueue',
      'isStorage',
      'isBackend',
      'isFrontend',
      'isGateway',
      'isAuth',
      'isSecrets',
      'isMonitoring',
      'isSearch',
      'isDataWarehouse',
      'isVectorDb',
      'isLLM',
      'isRepo',
      'isEnvConfig',
      'isDomain',
      'isContainer',
      'getDefaultPort',
      'getEnvVarName',
      'canConnect',
      'findConnectionRule',
      'getValidTargetIds',
      'inferConnectionMeta',
      'validateConnection',
      'wouldCreateCycle',
      'generateAiConnectionPrompt',
    ]) {
      expect(typeof (m as Record<string, unknown>)[fn]).toBe('function');
    }
    expect((m as any).CATEGORY_COLORS).toBeDefined();
    expect((m as any).CATEGORY_TO_RELATIONSHIP).toBeDefined();
    expect((m as any).CONNECTION_RULES).toBeDefined();
  });
});

describe('analyzeCanvasPatterns', () => {
  it('returns [] for an empty canvas', () => {
    expect(analyzeCanvasPatterns([], [])).toEqual([]);
  });

  it('skips nodes whose data has no iceType', () => {
    const nodes = [node('a'), node('b', '')];
    expect(analyzeCanvasPatterns(nodes, [])).toEqual([]);
  });

  it('emits "needs database" hint when a backend has no DB and no DB exists', () => {
    const nodes = [node('b1', 'Compute.Container')];
    const out = analyzeCanvasPatterns(nodes, []);
    expect(out.length).toBe(1);
    expect(out[0]).toMatchObject({ nodeId: 'b1', type: 'hint' });
    expect(out[0].message).toMatch(/no data store/);
  });

  it('does NOT emit "needs database" hint when backend is connected to a DB', () => {
    const nodes = [node('b1', 'Compute.Container'), node('d1', 'Database.PostgreSQL')];
    const edges = [{ source: 'b1', target: 'd1' }];
    const out = analyzeCanvasPatterns(nodes, edges);
    expect(out.find((s) => s.message.includes('no data store'))).toBeUndefined();
  });

  it('does NOT emit "needs database" hint when other DB nodes exist (even if not directly connected)', () => {
    const nodes = [node('b1', 'Compute.Container'), node('d1', 'Database.PostgreSQL')];
    const out = analyzeCanvasPatterns(nodes, []);
    expect(out.find((s) => s.message.includes('no data store'))).toBeUndefined();
  });

  it('emits "consider Redis cache" hint when ≥2 backends share a DB and no cache exists', () => {
    const nodes = [node('b1', 'Compute.Container'), node('b2', 'Compute.Container'), node('d1', 'Database.PostgreSQL')];
    const edges = [
      { source: 'b1', target: 'd1' },
      { source: 'b2', target: 'd1' },
    ];
    const out = analyzeCanvasPatterns(nodes, edges);
    expect(out.length).toBe(1);
    expect(out[0]).toMatchObject({ nodeId: 'd1', type: 'hint' });
    expect(out[0].message).toMatch(/Redis cache/);
  });

  it('does NOT emit "consider Redis cache" hint when a cache already exists', () => {
    const nodes = [
      node('b1', 'Compute.Container'),
      node('b2', 'Compute.Container'),
      node('d1', 'Database.PostgreSQL'),
      node('c1', 'Database.Redis'),
    ];
    const edges = [
      { source: 'b1', target: 'd1' },
      { source: 'b2', target: 'd1' },
    ];
    const out = analyzeCanvasPatterns(nodes, edges);
    expect(out.find((s) => s.message.includes('Redis cache'))).toBeUndefined();
  });

  it('reverse-edge case: counts backends connected source-from-db (target = backend)', () => {
    const nodes = [node('b1', 'Compute.Container'), node('b2', 'Compute.Container'), node('d1', 'Database.PostgreSQL')];
    const edges = [
      { source: 'd1', target: 'b1' },
      { source: 'd1', target: 'b2' },
    ];
    const out = analyzeCanvasPatterns(nodes, edges);
    expect(out.find((s) => s.message.includes('Redis cache'))).toBeDefined();
  });

  it('only one connected backend → does NOT trigger Redis hint', () => {
    const nodes = [node('b1', 'Compute.Container'), node('d1', 'Database.PostgreSQL')];
    const edges = [{ source: 'b1', target: 'd1' }];
    const out = analyzeCanvasPatterns(nodes, edges);
    expect(out.find((s) => s.message.includes('Redis cache'))).toBeUndefined();
  });
});

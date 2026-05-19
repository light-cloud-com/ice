import { describe, it, expect } from 'vitest';

import { generateGhostSuggestions } from '../ghost-suggestions';
import type { CardNode } from '../../../../store/slices/cards-slice';

const node = (id: string, iceType: string, x = 0, y = 0): CardNode =>
  ({
    id,
    position: { x, y },
    data: { iceType },
  }) as unknown as CardNode;

describe('generateGhostSuggestions', () => {
  it('returns [] when iceType has no rules', () => {
    const drop = node('a', 'Unknown.Type');
    expect(generateGhostSuggestions(drop, [], [])).toEqual([]);
  });

  it('returns [] when dropped node has no iceType in data', () => {
    const drop = { id: 'a', position: { x: 0, y: 0 }, data: {} } as unknown as CardNode;
    expect(generateGhostSuggestions(drop, [], [])).toEqual([]);
  });

  it('emits up to 3 ghosts for Compute.Container', () => {
    const drop = node('a', 'Compute.Container', 100, 50);
    const ghosts = generateGhostSuggestions(drop, [], []);
    expect(ghosts.length).toBe(3);
    const types = ghosts.map((g) => g.iceType);
    expect(types).toEqual(['Database.PostgreSQL', 'Security.Secret', 'Database.Redis']);
  });

  it('skips suggestions whose iceType already exists on the canvas', () => {
    const drop = node('a', 'Compute.Container', 100, 50);
    const existing = [node('e1', 'Database.PostgreSQL')];
    const ghosts = generateGhostSuggestions(drop, existing, []);
    expect(ghosts.map((g) => g.iceType)).toEqual(['Security.Secret', 'Database.Redis']);
  });

  it('skips existing nodes whose iceType is undefined or empty (filter step)', () => {
    const drop = node('a', 'Compute.Container', 100, 50);
    const existing = [
      { id: 'e1', position: { x: 0, y: 0 }, data: {} } as unknown as CardNode,
      { id: 'e2', position: { x: 0, y: 0 }, data: { iceType: '' } } as unknown as CardNode,
    ];
    const ghosts = generateGhostSuggestions(drop, existing, []);
    expect(ghosts.length).toBe(3);
  });

  it('positions ghosts at +220 X and +90 Y per index', () => {
    const drop = node('a', 'Compute.Container', 100, 50);
    const ghosts = generateGhostSuggestions(drop, [], []);
    expect(ghosts[0].position).toEqual({ x: 320, y: 50 });
    expect(ghosts[1].position).toEqual({ x: 320, y: 140 });
    expect(ghosts[2].position).toEqual({ x: 320, y: 230 });
  });

  it('caps at 3 ghosts even when rules has more eligible entries', () => {
    const drop = node('a', 'Compute.Container');
    const ghosts = generateGhostSuggestions(drop, [], []);
    expect(ghosts.length).toBeLessThanOrEqual(3);
  });

  it('writes id with sourceNodeId, relationship, direction, createdAt', () => {
    const drop = node('drop-1', 'Database.PostgreSQL');
    const ghosts = generateGhostSuggestions(drop, [], []);
    expect(ghosts.length).toBe(2);
    expect(ghosts[0].sourceNodeId).toBe('drop-1');
    expect(ghosts[0].edgeRelationship).toBe('depends_on');
    expect(ghosts[0].edgeDirection).toBe('from');
    expect(typeof ghosts[0].createdAt).toBe('number');
    expect(ghosts[0].id).toMatch(/^ghost-Security-Secret-/);
  });

  it('handles every covered iceType key without throwing', () => {
    const types = [
      'Compute.SSRSite',
      'Compute.StaticSite',
      'Compute.ServerlessFunction',
      'Compute.Worker',
      'Database.MySQL',
      'Database.Redis',
      'Network.Gateway',
      'AI.LLMGateway',
      'AI.VectorDB',
      'Storage.Bucket',
      'Messaging.RabbitMQ',
    ];
    for (const t of types) {
      const drop = node('a', t);
      const result = generateGhostSuggestions(drop, [], []);
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    }
  });
});

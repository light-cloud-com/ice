import { describe, expect, it } from 'vitest';
import { findPassthroughCategory } from '../passthrough';
import type { CanvasConnection } from '../../../types';

function edge(id: string, from: string, to: string, category?: string): CanvasConnection {
  return {
    id,
    from,
    to,
    data: category ? { connectionCategory: category } : undefined,
  };
}

describe('findPassthroughCategory', () => {
  it('returns the incoming edge category when present', () => {
    const conns = [edge('e1', 'a', 'reroute', 'traffic'), edge('e2', 'reroute', 'b', 'config')];
    expect(findPassthroughCategory('reroute', conns)).toBe('traffic');
  });

  it('falls back to outgoing edge category when no incoming edge', () => {
    const conns = [edge('e1', 'reroute', 'b', 'config')];
    expect(findPassthroughCategory('reroute', conns)).toBe('config');
  });

  it('returns null when reroute is disconnected', () => {
    expect(findPassthroughCategory('reroute', [])).toBe(null);
  });

  it('returns null when no edge carries a connectionCategory', () => {
    const conns = [edge('e1', 'a', 'reroute')];
    expect(findPassthroughCategory('reroute', conns)).toBe(null);
  });
});

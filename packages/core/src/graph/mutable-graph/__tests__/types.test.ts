/**
 * Tests for `mutable-graph/types.ts`.
 *
 * The types module exposes one helper (`create_mutable_graph_state`) and
 * three structural types. These tests assert the helper returns an empty
 * state with five live mutable Maps so helper modules can mutate them
 * directly without further setup.
 */

import { describe, expect, it } from 'vitest';

import { create_mutable_graph_state } from '../types';

describe('create_mutable_graph_state', () => {
  it('returns an object with five empty Map fields', () => {
    const state = create_mutable_graph_state();
    expect(state.nodes).toBeInstanceOf(Map);
    expect(state.edges).toBeInstanceOf(Map);
    expect(state.outgoing).toBeInstanceOf(Map);
    expect(state.incoming).toBeInstanceOf(Map);
    expect(state.node_names).toBeInstanceOf(Map);

    expect(state.nodes.size).toBe(0);
    expect(state.edges.size).toBe(0);
    expect(state.outgoing.size).toBe(0);
    expect(state.incoming.size).toBe(0);
    expect(state.node_names.size).toBe(0);
  });

  it('returns independent Map instances on each call', () => {
    const a = create_mutable_graph_state();
    const b = create_mutable_graph_state();
    expect(a.nodes).not.toBe(b.nodes);
    expect(a.edges).not.toBe(b.edges);
    expect(a.outgoing).not.toBe(b.outgoing);
    expect(a.incoming).not.toBe(b.incoming);
    expect(a.node_names).not.toBe(b.node_names);
  });

  it('returns Maps that accept mutation via .set/.delete/.clear', () => {
    const state = create_mutable_graph_state();
    state.nodes.set('a' as never, { test: true } as never);
    expect(state.nodes.size).toBe(1);
    state.nodes.delete('a' as never);
    expect(state.nodes.size).toBe(0);
    state.nodes.set('b' as never, {} as never);
    state.nodes.clear();
    expect(state.nodes.size).toBe(0);
  });
});

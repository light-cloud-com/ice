/**
 * serializeCanvas — projects RootState to the AI-context payload.
 *
 * Pure-data transform; tested with handcrafted RootState fixtures and a
 * stubbed BLOCK_BLUEPRINTS list so we don't drag in the full block registry.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../config/blocks', () => ({
  BLOCK_BLUEPRINTS: [
    { iceType: 'Compute.Function' },
    { iceType: 'Database.PostgreSQL' },
    { iceType: 'Network.VPC' },
  ],
}));

import { serializeCanvas } from '../serialize-canvas';
import type { RootState } from '../../../../store';

function makeState(partial: Partial<{
  activeCardId: string | null;
  cards: Array<any>;
  selectedNodes: string[];
}> = {}): RootState {
  return {
    cards: {
      activeCardId: partial.activeCardId ?? 'c1',
      cards: partial.cards ?? [],
    },
    selection: {
      selectedNodes: partial.selectedNodes ?? [],
    },
  } as unknown as RootState;
}

describe('serializeCanvas — empty / no active card', () => {
  it('returns empty topology with available block types when no active card', () => {
    const state = makeState({ activeCardId: null, cards: [] });
    const out = serializeCanvas(state);
    expect(out.nodes).toEqual([]);
    expect(out.edges).toEqual([]);
    expect(out.selectedNodeIds).toEqual([]);
    expect(out.availableBlockTypes).toEqual([
      'Compute.Function',
      'Database.PostgreSQL',
      'Network.VPC',
    ]);
  });

  it('returns empty topology when activeCardId does not match any card', () => {
    const state = makeState({
      activeCardId: 'missing',
      cards: [{ id: 'c1', nodes: [], edges: [] }],
    });
    const out = serializeCanvas(state);
    expect(out.nodes).toEqual([]);
    expect(out.edges).toEqual([]);
  });

  it('caches the available block types after first call (deterministic across invocations)', () => {
    const state = makeState({ activeCardId: null });
    const first = serializeCanvas(state);
    const second = serializeCanvas(state);
    // Same array values; the cached path returns identical content.
    expect(second.availableBlockTypes).toEqual(first.availableBlockTypes);
  });
});

describe('serializeCanvas — node serialization', () => {
  it('keeps only relevant properties from node.data', () => {
    const state = makeState({
      activeCardId: 'c1',
      cards: [
        {
          id: 'c1',
          nodes: [
            {
              id: 'n1',
              type: 'block',
              data: {
                iceType: 'Compute.Function',
                label: 'API',
                provider: 'aws',
                runtime: 'node20',
                someInternalField: 'should be stripped',
                anotherInternal: 99,
              },
            },
          ],
          edges: [],
        },
      ],
    });
    const out = serializeCanvas(state);
    expect(out.nodes[0].properties).toEqual({
      iceType: 'Compute.Function',
      label: 'API',
      provider: 'aws',
      runtime: 'node20',
    });
  });

  it('drops null and empty-string property values from node.data', () => {
    const state = makeState({
      activeCardId: 'c1',
      cards: [
        {
          id: 'c1',
          nodes: [
            {
              id: 'n1',
              type: 'block',
              data: { iceType: 'Compute.Function', port: '', region: null, label: 'svc' },
            },
          ],
          edges: [],
        },
      ],
    });
    const out = serializeCanvas(state);
    expect(out.nodes[0].properties).not.toHaveProperty('port');
    expect(out.nodes[0].properties).not.toHaveProperty('region');
    expect(out.nodes[0].properties.label).toBe('svc');
  });

  it('falls back to node.id when label is missing and emits empty iceType when absent', () => {
    const state = makeState({
      activeCardId: 'c1',
      cards: [
        {
          id: 'c1',
          nodes: [{ id: 'fallback-id', type: 'block', data: {} }],
          edges: [],
        },
      ],
    });
    const out = serializeCanvas(state);
    expect(out.nodes[0].label).toBe('fallback-id');
    expect(out.nodes[0].iceType).toBe('');
  });

  it('hydrates provider on the serialized node when present in data', () => {
    const state = makeState({
      activeCardId: 'c1',
      cards: [
        {
          id: 'c1',
          nodes: [
            { id: 'n1', type: 'block', data: { iceType: 'Compute.Function', provider: 'gcp' } },
          ],
          edges: [],
        },
      ],
    });
    const out = serializeCanvas(state);
    expect(out.nodes[0].provider).toBe('gcp');
  });

  it('omits provider on serialized node when absent in data', () => {
    const state = makeState({
      activeCardId: 'c1',
      cards: [
        {
          id: 'c1',
          nodes: [{ id: 'n1', type: 'block', data: { iceType: 'Compute.Function' } }],
          edges: [],
        },
      ],
    });
    const out = serializeCanvas(state);
    expect(out.nodes[0]).not.toHaveProperty('provider');
  });

  it('hydrates parentId when present', () => {
    const state = makeState({
      activeCardId: 'c1',
      cards: [
        {
          id: 'c1',
          nodes: [{ id: 'n1', type: 'block', parentId: 'p1', data: {} }],
          edges: [],
        },
      ],
    });
    const out = serializeCanvas(state);
    expect(out.nodes[0].parentId).toBe('p1');
  });

  it('omits parentId when absent', () => {
    const state = makeState({
      activeCardId: 'c1',
      cards: [
        {
          id: 'c1',
          nodes: [{ id: 'n1', type: 'block', data: {} }],
          edges: [],
        },
      ],
    });
    const out = serializeCanvas(state);
    expect(out.nodes[0]).not.toHaveProperty('parentId');
  });

  it('handles nodes with undefined data (defaults properties to empty)', () => {
    const state = makeState({
      activeCardId: 'c1',
      cards: [
        {
          id: 'c1',
          nodes: [{ id: 'n1', type: 'block', data: undefined }],
          edges: [],
        },
      ],
    });
    const out = serializeCanvas(state);
    expect(out.nodes[0].properties).toEqual({});
    expect(out.nodes[0].label).toBe('n1');
    expect(out.nodes[0].iceType).toBe('');
  });
});

describe('serializeCanvas — edge serialization', () => {
  it('hydrates source/target/id and emits relationship when present', () => {
    const state = makeState({
      activeCardId: 'c1',
      cards: [
        {
          id: 'c1',
          nodes: [],
          edges: [
            { id: 'e1', source: 'a', target: 'b', data: { relationship: 'connects_to' } },
          ],
        },
      ],
    });
    const out = serializeCanvas(state);
    expect(out.edges[0]).toMatchObject({
      id: 'e1',
      source: 'a',
      target: 'b',
      relationship: 'connects_to',
    });
  });

  it('omits relationship when absent', () => {
    const state = makeState({
      activeCardId: 'c1',
      cards: [
        {
          id: 'c1',
          nodes: [],
          edges: [{ id: 'e1', source: 'a', target: 'b', data: {} }],
        },
      ],
    });
    const out = serializeCanvas(state);
    expect(out.edges[0]).not.toHaveProperty('relationship');
  });

  it('handles edges with no data', () => {
    const state = makeState({
      activeCardId: 'c1',
      cards: [
        {
          id: 'c1',
          nodes: [],
          edges: [{ id: 'e1', source: 'a', target: 'b' }],
        },
      ],
    });
    const out = serializeCanvas(state);
    expect(out.edges[0].id).toBe('e1');
    expect(out.edges[0]).not.toHaveProperty('relationship');
  });
});

describe('serializeCanvas — selectedNodeIds passthrough', () => {
  it('forwards selectedNodes from selection slice', () => {
    const state = makeState({
      activeCardId: 'c1',
      cards: [{ id: 'c1', nodes: [], edges: [] }],
      selectedNodes: ['x', 'y'],
    });
    const out = serializeCanvas(state);
    expect(out.selectedNodeIds).toEqual(['x', 'y']);
  });
});

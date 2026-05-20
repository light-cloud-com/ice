/**
 * Tests for `cards/reducers/node-edge-add.ts` — the five reducers covering
 * node/edge ingestion (`addNodeToCard`, `addEdgeToCard`), the deploy-overlay
 * clear path (`clearCardDeployOverlay`), and edge-data mutations
 * (`updateCardEdgeData`, `reverseCardEdge`).
 *
 * Each reducer is exercised through Immer's `produce` to mirror RTK's runtime
 * behavior — the reducer body is allowed to mutate a draft, and the produced
 * result is structurally equal to the post-mutation draft. This avoids
 * dragging in `configureStore` for what is fundamentally a pure
 * `(state, action) => void` shape.
 *
 * `pushSnapshot` from `../../snapshot` is the real implementation: each test
 * starts with empty `history` and the call lands a snapshot on the active
 * card's stack. The snapshot module's `_lastSnapshotAction` coalescing state
 * is irrelevant here because none of the five reducers passes an actionType
 * (they all create their own undo step), but `beforeEach` still calls
 * `pushSnapshot` with a sentinel "reset-coalesce" action against a null-active
 * state so the module-level `let` can't leak across tests (see
 * `pushsnapshot-coalescing-needs-explicit-reset-between-tests` learning).
 *
 * Coverage targets:
 * - `addNodeToCard`: appends to active card's nodes; runs migration on the
 *   payload; no-op when no active card; no-op when activeCardId points at a
 *   missing card.
 * - `addEdgeToCard`: appends to active card's edges; no-op when no active card.
 * - `clearCardDeployOverlay`: pins all 24 deploy fields are cleared; the
 *   spread-and-delete pattern preserves other fields on `node.data`; cardId
 *   arg routes the clear to a specific card; missing cardId falls back to
 *   active card; nodes without `data` are skipped; nodes with no overlay
 *   fields are skipped (no spurious data reassignment).
 * - `updateCardEdgeData`: merges patch into `edge.data`; preserves existing
 *   fields; no-op when no active card; no-op when edge id is missing.
 * - `reverseCardEdge`: swaps source/target; no-op when no active card; no-op
 *   when edge id is missing.
 *
 * @see rf-cards-7
 */

import { produce } from 'immer';
import { beforeEach, describe, expect, it } from 'vitest';
import { pushSnapshot } from '../../snapshot';
import { nodeEdgeAddReducers } from '../node-edge-add';
import type { Card, CardEdge, CardNode, CardsState } from '../../types';
import type { PayloadAction } from '@reduxjs/toolkit';

// -----------------------------------------------------------------------------
// Fixture builders
// -----------------------------------------------------------------------------

function makeNode(id: string, overrides: Partial<CardNode> = {}): CardNode {
  return {
    id,
    type: 'block',
    position: { x: 0, y: 0 },
    width: 240,
    height: 56,
    data: {},
    ...overrides,
  };
}

function makeEdge(id: string, source: string, target: string, overrides: Partial<CardEdge> = {}): CardEdge {
  return {
    id,
    source,
    target,
    ...overrides,
  };
}

function makeCard(id: string, overrides: Partial<Card> = {}): Card {
  return {
    id,
    name: id,
    nodes: [],
    edges: [],
    viewport: { panX: 0, panY: 0, scale: 1 },
    createdAt: 0,
    ...overrides,
  };
}

function makeState(opts: { cards?: Card[]; activeCardId?: string | null } = {}): CardsState {
  return {
    cards: opts.cards ?? [makeCard('c1')],
    activeCardId: opts.activeCardId === undefined ? 'c1' : opts.activeCardId,
    history: {},
  };
}

// -----------------------------------------------------------------------------
// Coalesce-state reset
// -----------------------------------------------------------------------------
//
// `pushSnapshot` keeps `_lastSnapshotAction` at module scope. None of the five
// reducers passes an actionType, so coalescing wouldn't fire here, but a stale
// value from another test could in theory cause a false-negative when a
// reducer calls `pushSnapshot` with an unrelated actionType later. The
// "reset-coalesce" sentinel is cheap insurance — a no-op call against a null
// active card.

beforeEach(() => {
  pushSnapshot({ cards: [], activeCardId: null, history: {} } as CardsState, 'reset-coalesce');
});

// -----------------------------------------------------------------------------
// addNodeToCard
// -----------------------------------------------------------------------------

describe('addNodeToCard', () => {
  it('appends the payload node to the active card', () => {
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('existing')] })],
      activeCardId: 'c1',
    });
    const newNode = makeNode('new', { data: { iceType: 'Block.Application' } });
    const next = produce(state, (draft) => {
      nodeEdgeAddReducers.addNodeToCard(draft, {
        type: 'cards/addNodeToCard',
        payload: newNode,
      } as PayloadAction<CardNode>);
    });
    expect(next.cards[0].nodes.map((n) => n.id)).toEqual(['existing', 'new']);
  });

  it('runs the payload through migrateCardNode (Monitoring.Terminal → Monitoring.Log)', () => {
    // Legacy `Monitoring.Terminal` was consolidated into `Monitoring.Log` at
    // the v5 → v6 bump. The reducer wires the payload through
    // `migrateCardNode` before pushing — protects against AI tool-use writes
    // and clipboard imports that still carry the legacy iceType. See
    // learning `data-version-bump-migrates-not-wipes`.
    const state = makeState({
      cards: [makeCard('c1')],
      activeCardId: 'c1',
    });
    const legacyNode = makeNode('m1', {
      type: 'resource',
      data: { iceType: 'Monitoring.Terminal' },
    });
    const next = produce(state, (draft) => {
      nodeEdgeAddReducers.addNodeToCard(draft, {
        type: 'cards/addNodeToCard',
        payload: legacyNode,
      } as PayloadAction<CardNode>);
    });
    expect(next.cards[0].nodes[0].data.iceType).toBe('Monitoring.Log');
  });

  it('runs the payload through migrateCardNode (Block.Frontend → Group.Frontend, type=container)', () => {
    // The Cluster.*/Block.* → Group.* branch flips both iceType AND `type`
    // to 'container'. Covers the second migration branch so a single test
    // file pins both legs of the migration pipeline.
    const state = makeState({
      cards: [makeCard('c1')],
      activeCardId: 'c1',
    });
    const legacyNode = makeNode('g1', {
      type: 'resource',
      data: { iceType: 'Block.Frontend' },
    });
    const next = produce(state, (draft) => {
      nodeEdgeAddReducers.addNodeToCard(draft, {
        type: 'cards/addNodeToCard',
        payload: legacyNode,
      } as PayloadAction<CardNode>);
    });
    expect(next.cards[0].nodes[0].data.iceType).toBe('Group.Frontend');
    expect(next.cards[0].nodes[0].type).toBe('container');
  });

  it('is a no-op when activeCardId is null', () => {
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('existing')] })],
      activeCardId: null,
    });
    const next = produce(state, (draft) => {
      nodeEdgeAddReducers.addNodeToCard(draft, {
        type: 'cards/addNodeToCard',
        payload: makeNode('new'),
      } as PayloadAction<CardNode>);
    });
    expect(next.cards[0].nodes.map((n) => n.id)).toEqual(['existing']);
  });

  it('is a no-op when activeCardId points at a missing card', () => {
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('existing')] })],
      activeCardId: 'missing',
    });
    const next = produce(state, (draft) => {
      nodeEdgeAddReducers.addNodeToCard(draft, {
        type: 'cards/addNodeToCard',
        payload: makeNode('new'),
      } as PayloadAction<CardNode>);
    });
    expect(next.cards[0].nodes.map((n) => n.id)).toEqual(['existing']);
  });

  it('records an undo snapshot on the active card', () => {
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('seed')] })],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodeEdgeAddReducers.addNodeToCard(draft, {
        type: 'cards/addNodeToCard',
        payload: makeNode('new'),
      } as PayloadAction<CardNode>);
    });
    expect(next.history.c1).toBeDefined();
    expect(next.history.c1.past).toHaveLength(1);
    // Snapshot captures the PRE-mutation state — only the seed node.
    expect(next.history.c1.past[0].nodes.map((n) => n.id)).toEqual(['seed']);
  });
});

// -----------------------------------------------------------------------------
// addEdgeToCard
// -----------------------------------------------------------------------------

describe('addEdgeToCard', () => {
  it('appends the payload edge to the active card', () => {
    const state = makeState({
      cards: [makeCard('c1', { edges: [makeEdge('e0', 'a', 'b')] })],
      activeCardId: 'c1',
    });
    const newEdge = makeEdge('e1', 'b', 'c');
    const next = produce(state, (draft) => {
      nodeEdgeAddReducers.addEdgeToCard(draft, {
        type: 'cards/addEdgeToCard',
        payload: newEdge,
      } as PayloadAction<CardEdge>);
    });
    expect(next.cards[0].edges.map((e) => e.id)).toEqual(['e0', 'e1']);
  });

  it('is a no-op when activeCardId is null', () => {
    const state = makeState({
      cards: [makeCard('c1', { edges: [makeEdge('e0', 'a', 'b')] })],
      activeCardId: null,
    });
    const next = produce(state, (draft) => {
      nodeEdgeAddReducers.addEdgeToCard(draft, {
        type: 'cards/addEdgeToCard',
        payload: makeEdge('e1', 'b', 'c'),
      } as PayloadAction<CardEdge>);
    });
    expect(next.cards[0].edges.map((e) => e.id)).toEqual(['e0']);
  });

  it('records an undo snapshot on the active card', () => {
    const state = makeState({
      cards: [makeCard('c1', { edges: [makeEdge('e0', 'a', 'b')] })],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodeEdgeAddReducers.addEdgeToCard(draft, {
        type: 'cards/addEdgeToCard',
        payload: makeEdge('e1', 'b', 'c'),
      } as PayloadAction<CardEdge>);
    });
    expect(next.history.c1.past).toHaveLength(1);
    expect(next.history.c1.past[0].edges.map((e) => e.id)).toEqual(['e0']);
  });
});

// -----------------------------------------------------------------------------
// clearCardDeployOverlay
// -----------------------------------------------------------------------------

describe('clearCardDeployOverlay', () => {
  // Pin the exact 24-field list — RISK #7. Missing one leaves a ghost pill
  // after destroy. Any reordering / addition / removal MUST be deliberate
  // and matched by an update to the deploy hydrator + node-outputs writer.
  const ALL_DEPLOY_FIELDS = [
    'provider_id',
    'deploy_status',
    'deploy_progress',
    'deploy_error',
    'deploy_outputs',
    'last_deployed_at',
    'deployed_image',
    'url',
    'default_url',
    'firebaseapp_url',
    'console_url',
    'site_id',
    'source_repo',
    'source_branch',
    'republished_from_repo',
    'custom_domain',
    'custom_domain_url',
    'custom_domain_status',
    'custom_domain_dns_records',
    'public_grant_failed',
    'public_grant_error',
    'public_grant_strategy',
    'ip_address',
    'IPAddress',
  ];

  function nodeDataWithAllOverlayFields(): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    for (const field of ALL_DEPLOY_FIELDS) {
      data[field] = `value-of-${field}`;
    }
    return data;
  }

  it('clears every deploy-overlay field on every node of the active card', () => {
    const data = nodeDataWithAllOverlayFields();
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [
            makeNode('n1', { data: { ...data, label: 'keep me' } }),
            makeNode('n2', { data: { ...data, iceType: 'Block.Application' } }),
          ],
        }),
      ],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodeEdgeAddReducers.clearCardDeployOverlay(draft, {
        type: 'cards/clearCardDeployOverlay',
        payload: {},
      } as PayloadAction<{ cardId?: string }>);
    });

    for (const node of next.cards[0].nodes) {
      for (const field of ALL_DEPLOY_FIELDS) {
        expect(node.data, `node ${node.id} should not retain ${field}`).not.toHaveProperty(field);
      }
    }
    // Non-overlay fields preserved (spread-and-delete pattern).
    expect(next.cards[0].nodes[0].data.label).toBe('keep me');
    expect(next.cards[0].nodes[1].data.iceType).toBe('Block.Application');
  });

  it('uses payload.cardId when provided (not the active card)', () => {
    const data = nodeDataWithAllOverlayFields();
    const state = makeState({
      cards: [
        makeCard('c1', { nodes: [makeNode('n-active', { data: { ...data } })] }),
        makeCard('c2', { nodes: [makeNode('n-other', { data: { ...data } })] }),
      ],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodeEdgeAddReducers.clearCardDeployOverlay(draft, {
        type: 'cards/clearCardDeployOverlay',
        payload: { cardId: 'c2' },
      } as PayloadAction<{ cardId?: string }>);
    });
    // Active card untouched.
    expect(next.cards[0].nodes[0].data.url).toBe('value-of-url');
    // Specified card cleared.
    expect(next.cards[1].nodes[0].data).not.toHaveProperty('url');
  });

  it('falls back to active card when payload.cardId is undefined', () => {
    const data = nodeDataWithAllOverlayFields();
    const state = makeState({
      cards: [
        makeCard('c1', { nodes: [makeNode('n-active', { data: { ...data } })] }),
        makeCard('c2', { nodes: [makeNode('n-other', { data: { ...data } })] }),
      ],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodeEdgeAddReducers.clearCardDeployOverlay(draft, {
        type: 'cards/clearCardDeployOverlay',
        payload: {},
      } as PayloadAction<{ cardId?: string }>);
    });
    // Active card cleared.
    expect(next.cards[0].nodes[0].data).not.toHaveProperty('url');
    // Other card untouched.
    expect(next.cards[1].nodes[0].data.url).toBe('value-of-url');
  });

  it('is a no-op when no card matches (no active card, no payload.cardId)', () => {
    const data = nodeDataWithAllOverlayFields();
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('n', { data: { ...data } })] })],
      activeCardId: null,
    });
    const next = produce(state, (draft) => {
      nodeEdgeAddReducers.clearCardDeployOverlay(draft, {
        type: 'cards/clearCardDeployOverlay',
        payload: {},
      } as PayloadAction<{ cardId?: string }>);
    });
    expect(next.cards[0].nodes[0].data.url).toBe('value-of-url');
  });

  it('is a no-op when payload.cardId points at a missing card', () => {
    const data = nodeDataWithAllOverlayFields();
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('n', { data: { ...data } })] })],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodeEdgeAddReducers.clearCardDeployOverlay(draft, {
        type: 'cards/clearCardDeployOverlay',
        payload: { cardId: 'missing' },
      } as PayloadAction<{ cardId?: string }>);
    });
    expect(next.cards[0].nodes[0].data.url).toBe('value-of-url');
  });

  it('skips nodes whose data is null/undefined', () => {
    // The reducer's `if (!node.data) continue;` branch protects against
    // partially-constructed nodes from older payload shapes.
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [
            // A node with `data: null` (typed as Record<string, unknown> in the
            // interface but legacy localStorage payloads have produced null
            // values). Cast to bypass the type while exercising the guard.
            makeNode('n-null', { data: null as unknown as Record<string, unknown> }),
            makeNode('n-real', { data: { url: 'value-of-url' } }),
          ],
        }),
      ],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodeEdgeAddReducers.clearCardDeployOverlay(draft, {
        type: 'cards/clearCardDeployOverlay',
        payload: {},
      } as PayloadAction<{ cardId?: string }>);
    });
    // First node untouched, second node cleared.
    expect(next.cards[0].nodes[0].data).toBeNull();
    expect(next.cards[0].nodes[1].data).not.toHaveProperty('url');
  });

  it('does NOT reassign data when no overlay field was present (changed=false branch)', () => {
    // `if (changed) node.data = next;` — covers the false branch. A node with
    // only non-overlay fields should keep its identity unchanged.
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [makeNode('n', { data: { label: 'keep', iceType: 'Block.Application' } })],
        }),
      ],
      activeCardId: 'c1',
    });
    const before = state.cards[0].nodes[0].data;
    const next = produce(state, (draft) => {
      nodeEdgeAddReducers.clearCardDeployOverlay(draft, {
        type: 'cards/clearCardDeployOverlay',
        payload: {},
      } as PayloadAction<{ cardId?: string }>);
    });
    // data shape preserved.
    expect(next.cards[0].nodes[0].data).toEqual({ label: 'keep', iceType: 'Block.Application' });
    expect(before).toEqual({ label: 'keep', iceType: 'Block.Application' });
  });

  it('records an undo snapshot on the active card', () => {
    const data = nodeDataWithAllOverlayFields();
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('n', { data: { ...data } })] })],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodeEdgeAddReducers.clearCardDeployOverlay(draft, {
        type: 'cards/clearCardDeployOverlay',
        payload: {},
      } as PayloadAction<{ cardId?: string }>);
    });
    expect(next.history.c1.past).toHaveLength(1);
  });
});

// -----------------------------------------------------------------------------
// updateCardEdgeData
// -----------------------------------------------------------------------------

describe('updateCardEdgeData', () => {
  it('merges the patch into edge.data, preserving existing fields', () => {
    const state = makeState({
      cards: [
        makeCard('c1', {
          edges: [makeEdge('e1', 'a', 'b', { data: { relationship: 'http', priority: 1 } })],
        }),
      ],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodeEdgeAddReducers.updateCardEdgeData(draft, {
        type: 'cards/updateCardEdgeData',
        payload: { edgeId: 'e1', data: { priority: 2, label: 'fresh' } },
      } as PayloadAction<{ edgeId: string; data: Record<string, unknown> }>);
    });
    expect(next.cards[0].edges[0].data).toEqual({
      relationship: 'http',
      priority: 2,
      label: 'fresh',
    });
  });

  it('seeds edge.data when starting from undefined', () => {
    const state = makeState({
      cards: [makeCard('c1', { edges: [makeEdge('e1', 'a', 'b')] })],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodeEdgeAddReducers.updateCardEdgeData(draft, {
        type: 'cards/updateCardEdgeData',
        payload: { edgeId: 'e1', data: { relationship: 'http' } },
      } as PayloadAction<{ edgeId: string; data: Record<string, unknown> }>);
    });
    expect(next.cards[0].edges[0].data).toEqual({ relationship: 'http' });
  });

  it('is a no-op when activeCardId is null', () => {
    const state = makeState({
      cards: [
        makeCard('c1', {
          edges: [makeEdge('e1', 'a', 'b', { data: { relationship: 'http' } })],
        }),
      ],
      activeCardId: null,
    });
    const next = produce(state, (draft) => {
      nodeEdgeAddReducers.updateCardEdgeData(draft, {
        type: 'cards/updateCardEdgeData',
        payload: { edgeId: 'e1', data: { relationship: 'grpc' } },
      } as PayloadAction<{ edgeId: string; data: Record<string, unknown> }>);
    });
    expect(next.cards[0].edges[0].data?.relationship).toBe('http');
  });

  it('is a no-op when the edgeId does not match any edge', () => {
    const state = makeState({
      cards: [
        makeCard('c1', {
          edges: [makeEdge('e1', 'a', 'b', { data: { relationship: 'http' } })],
        }),
      ],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodeEdgeAddReducers.updateCardEdgeData(draft, {
        type: 'cards/updateCardEdgeData',
        payload: { edgeId: 'missing', data: { relationship: 'grpc' } },
      } as PayloadAction<{ edgeId: string; data: Record<string, unknown> }>);
    });
    expect(next.cards[0].edges[0].data?.relationship).toBe('http');
  });

  it('records an undo snapshot on the active card', () => {
    const state = makeState({
      cards: [
        makeCard('c1', {
          edges: [makeEdge('e1', 'a', 'b', { data: { relationship: 'http' } })],
        }),
      ],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodeEdgeAddReducers.updateCardEdgeData(draft, {
        type: 'cards/updateCardEdgeData',
        payload: { edgeId: 'e1', data: { priority: 1 } },
      } as PayloadAction<{ edgeId: string; data: Record<string, unknown> }>);
    });
    expect(next.history.c1.past).toHaveLength(1);
  });
});

// -----------------------------------------------------------------------------
// reverseCardEdge
// -----------------------------------------------------------------------------

describe('reverseCardEdge', () => {
  it('swaps source and target on the matching edge', () => {
    const state = makeState({
      cards: [
        makeCard('c1', {
          edges: [makeEdge('e1', 'a', 'b'), makeEdge('e2', 'c', 'd')],
        }),
      ],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodeEdgeAddReducers.reverseCardEdge(draft, {
        type: 'cards/reverseCardEdge',
        payload: 'e1',
      } as PayloadAction<string>);
    });
    expect(next.cards[0].edges[0]).toMatchObject({ id: 'e1', source: 'b', target: 'a' });
    // Other edge untouched.
    expect(next.cards[0].edges[1]).toMatchObject({ id: 'e2', source: 'c', target: 'd' });
  });

  it('is a no-op when activeCardId is null', () => {
    const state = makeState({
      cards: [makeCard('c1', { edges: [makeEdge('e1', 'a', 'b')] })],
      activeCardId: null,
    });
    const next = produce(state, (draft) => {
      nodeEdgeAddReducers.reverseCardEdge(draft, {
        type: 'cards/reverseCardEdge',
        payload: 'e1',
      } as PayloadAction<string>);
    });
    expect(next.cards[0].edges[0]).toMatchObject({ source: 'a', target: 'b' });
  });

  it('is a no-op when the edgeId does not match any edge', () => {
    const state = makeState({
      cards: [makeCard('c1', { edges: [makeEdge('e1', 'a', 'b')] })],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodeEdgeAddReducers.reverseCardEdge(draft, {
        type: 'cards/reverseCardEdge',
        payload: 'missing',
      } as PayloadAction<string>);
    });
    expect(next.cards[0].edges[0]).toMatchObject({ source: 'a', target: 'b' });
  });

  it('records an undo snapshot on the active card', () => {
    const state = makeState({
      cards: [makeCard('c1', { edges: [makeEdge('e1', 'a', 'b')] })],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodeEdgeAddReducers.reverseCardEdge(draft, {
        type: 'cards/reverseCardEdge',
        payload: 'e1',
      } as PayloadAction<string>);
    });
    expect(next.history.c1.past).toHaveLength(1);
    // Snapshot captures pre-reverse state.
    expect(next.history.c1.past[0].edges[0]).toMatchObject({ source: 'a', target: 'b' });
  });
});

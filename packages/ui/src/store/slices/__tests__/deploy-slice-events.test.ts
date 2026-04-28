/**
 * pdl-7 — slice-level reducers for the typed `deploy:event` wire stream.
 *
 * Tests cover:
 *   - applyNodeStatusEvent upserts on first event, dedups by seq, and
 *     preserves the `step` field on a status-only flip.
 *   - applyNodeProgressEvent updates `step` while preserving status, and
 *     defensively seeds a minimal record when no prior status exists.
 *   - applyDeployCompleteEvent maps `outcome → status` for all four
 *     outcomes (success, partial, failure, cancelled).
 *   - setActiveCard (extraReducer) clears `nodesById`.
 */

import { describe, it, expect } from 'vitest';
import type {
  DeployCompleteEvent,
  DeployNodeProgressEvent,
  DeployNodeStatusEvent,
} from '@ice/types';
import deployReducer, {
  applyDeployCompleteEvent,
  applyNodeProgressEvent,
  applyNodeStatusEvent,
} from '../deploy-slice';
import { setActiveCard } from '../cards-slice';

const CARD = 'card-1';
const N1 = 'node-1';
const N2 = 'node-2';

function statusEvent(overrides: Partial<DeployNodeStatusEvent> = {}): DeployNodeStatusEvent {
  return {
    type: 'node_status',
    card_id: CARD,
    node_id: N1,
    resource_name: 'foo-instance-abc',
    resource_type: 'gcp.sql.databaseInstance',
    action: 'create',
    status: 'applying',
    at: '2026-04-28T10:00:00.000Z',
    seq: 1,
    ...overrides,
  };
}

function progressEvent(overrides: Partial<DeployNodeProgressEvent> = {}): DeployNodeProgressEvent {
  return {
    type: 'node_progress',
    card_id: CARD,
    node_id: N1,
    resource_name: 'foo-instance-abc',
    step: { label: 'Provisioning instance', index: 1, total: 2 },
    at: '2026-04-28T10:00:01.000Z',
    seq: 2,
    ...overrides,
  };
}

function completeEvent(overrides: Partial<DeployCompleteEvent> = {}): DeployCompleteEvent {
  return {
    type: 'complete',
    card_id: CARD,
    outcome: 'success',
    totals: { queued: 0, applying: 0, succeeded: 1, failed: 0, skipped: 0, cancelled: 0 },
    at: '2026-04-28T10:05:00.000Z',
    seq: 10,
    ...overrides,
  };
}

describe('applyNodeStatusEvent', () => {
  it('upserts a record on the first event for a node', () => {
    const initial = deployReducer(undefined, { type: '@@INIT' });
    const next = deployReducer(initial, applyNodeStatusEvent(statusEvent()));
    expect(next.nodesById[N1]).toBeDefined();
    expect(next.nodesById[N1].status).toBe('applying');
    expect(next.nodesById[N1].resource_name).toBe('foo-instance-abc');
    expect(next.nodesById[N1].resource_type).toBe('gcp.sql.databaseInstance');
    expect(next.nodesById[N1].action).toBe('create');
    expect(next.nodesById[N1].last_seq).toBe(1);
    expect(next.nodesById[N1].last_at).toBe('2026-04-28T10:00:00.000Z');
  });

  it('updates fields in place on a higher-seq event', () => {
    let state = deployReducer(undefined, { type: '@@INIT' });
    state = deployReducer(state, applyNodeStatusEvent(statusEvent({ seq: 1, status: 'applying' })));
    state = deployReducer(
      state,
      applyNodeStatusEvent(
        statusEvent({
          seq: 5,
          status: 'succeeded',
          duration_ms: 12345,
          at: '2026-04-28T10:00:30.000Z',
        }),
      ),
    );
    expect(state.nodesById[N1].status).toBe('succeeded');
    expect(state.nodesById[N1].duration_ms).toBe(12345);
    expect(state.nodesById[N1].last_seq).toBe(5);
    expect(state.nodesById[N1].last_at).toBe('2026-04-28T10:00:30.000Z');
  });

  it('drops a lower-seq event for the same node (live arrived first, then replay)', () => {
    let state = deployReducer(undefined, { type: '@@INIT' });
    state = deployReducer(state, applyNodeStatusEvent(statusEvent({ seq: 5, status: 'succeeded' })));
    // Replay delivers an older event for the same node.
    state = deployReducer(state, applyNodeStatusEvent(statusEvent({ seq: 1, status: 'applying' })));
    expect(state.nodesById[N1].status).toBe('succeeded');
    expect(state.nodesById[N1].last_seq).toBe(5);
  });

  it('drops an equal-seq event (idempotency on duplicate delivery)', () => {
    let state = deployReducer(undefined, { type: '@@INIT' });
    state = deployReducer(state, applyNodeStatusEvent(statusEvent({ seq: 3, status: 'succeeded' })));
    state = deployReducer(state, applyNodeStatusEvent(statusEvent({ seq: 3, status: 'failed' })));
    expect(state.nodesById[N1].status).toBe('succeeded');
  });

  // pdl-10 critic finding B1 — cross-operation dedup
  it('does NOT dedup a destroy event against a prior apply (different action)', () => {
    let state = deployReducer(undefined, { type: '@@INIT' });
    // Apply finishes with a high seq (the apply's last terminal).
    state = deployReducer(
      state,
      applyNodeStatusEvent(statusEvent({ seq: 9, action: 'create', status: 'succeeded' })),
    );
    expect(state.nodesById[N1].status).toBe('succeeded');
    expect(state.nodesById[N1].action).toBe('create');
    // Destroy starts with seq=1 (per-deploymentId counter resets). Without the
    // cross-action exception, the existing.last_seq=9 >= e.seq=1 guard would
    // silently drop this event — the exact `ux-destroy-action-bypasses-node-
    // status-wire` regression.
    state = deployReducer(
      state,
      applyNodeStatusEvent(statusEvent({ seq: 1, action: 'delete', status: 'queued' })),
    );
    expect(state.nodesById[N1].status).toBe('queued');
    expect(state.nodesById[N1].action).toBe('delete');
    expect(state.nodesById[N1].last_seq).toBe(1);
    // And the next applying event (still seq=2 from the destroy counter)
    // continues forward cleanly.
    state = deployReducer(
      state,
      applyNodeStatusEvent(statusEvent({ seq: 2, action: 'delete', status: 'applying' })),
    );
    expect(state.nodesById[N1].status).toBe('applying');
    expect(state.nodesById[N1].last_seq).toBe(2);
  });

  it('replaces a terminal record when a fresh `queued` event arrives for the same action (re-deploy)', () => {
    let state = deployReducer(undefined, { type: '@@INIT' });
    // First apply finishes terminal.
    state = deployReducer(
      state,
      applyNodeStatusEvent(statusEvent({ seq: 5, action: 'create', status: 'succeeded' })),
    );
    expect(state.nodesById[N1].last_seq).toBe(5);
    // User clicks Deploy again. Same node, same action, but a new
    // operation — so seq resets to 1. The queued status flag is the
    // marker that this is a fresh op, not a stale replay.
    state = deployReducer(
      state,
      applyNodeStatusEvent(statusEvent({ seq: 1, action: 'create', status: 'queued' })),
    );
    expect(state.nodesById[N1].status).toBe('queued');
    expect(state.nodesById[N1].last_seq).toBe(1);
  });

  it('still dedups same-action mid-operation duplicates (replay arrives after live)', () => {
    let state = deployReducer(undefined, { type: '@@INIT' });
    state = deployReducer(
      state,
      applyNodeStatusEvent(statusEvent({ seq: 5, action: 'create', status: 'applying' })),
    );
    // Replay arrives with an older event for the SAME action and a non-queued
    // status — must drop, not replace. Otherwise the in-flight 'applying'
    // would regress to 'queued'.
    state = deployReducer(
      state,
      applyNodeStatusEvent(statusEvent({ seq: 1, action: 'create', status: 'applying' })),
    );
    expect(state.nodesById[N1].last_seq).toBe(5);
  });

  it('preserves the previous `step` field on a status-only flip', () => {
    let state = deployReducer(undefined, { type: '@@INIT' });
    state = deployReducer(state, applyNodeStatusEvent(statusEvent({ seq: 1 })));
    state = deployReducer(state, applyNodeProgressEvent(progressEvent({ seq: 2 })));
    expect(state.nodesById[N1].step).toEqual({ label: 'Provisioning instance', index: 1, total: 2 });
    state = deployReducer(state, applyNodeStatusEvent(statusEvent({ seq: 3, status: 'succeeded' })));
    // The status flip alone must not clobber the step record — only a
    // newer progress event can update it. (If we cleared step on every
    // status event, the panel would lose the last-known sub-step on the
    // terminal succeeded transition.)
    expect(state.nodesById[N1].step).toEqual({ label: 'Provisioning instance', index: 1, total: 2 });
    expect(state.nodesById[N1].status).toBe('succeeded');
  });

  it('mirrors a terminal succeeded event into state.results', () => {
    let state = deployReducer(undefined, { type: '@@INIT' });
    state = deployReducer(
      state,
      applyNodeStatusEvent(
        statusEvent({ seq: 1, status: 'succeeded', duration_ms: 1500 }),
      ),
    );
    expect(state.results).toHaveLength(1);
    expect(state.results[0]).toMatchObject({
      name: 'foo-instance-abc',
      type: 'gcp.sql.databaseInstance',
      success: true,
      duration_ms: 1500,
      source_node_id: N1,
    });
  });

  it('mirrors a terminal failed event into state.results with the error message', () => {
    let state = deployReducer(undefined, { type: '@@INIT' });
    state = deployReducer(
      state,
      applyNodeStatusEvent(
        statusEvent({
          seq: 1,
          status: 'failed',
          error: { code: 'QUOTA_EXCEEDED', message: 'Quota for SQL instances exceeded' },
        }),
      ),
    );
    expect(state.results).toHaveLength(1);
    expect(state.results[0].success).toBe(false);
    expect(state.results[0].error).toBe('Quota for SQL instances exceeded');
  });

  it('does not mirror non-terminal events into state.results', () => {
    let state = deployReducer(undefined, { type: '@@INIT' });
    state = deployReducer(state, applyNodeStatusEvent(statusEvent({ seq: 1, status: 'applying' })));
    state = deployReducer(
      state,
      applyNodeStatusEvent(statusEvent({ node_id: N2, seq: 2, status: 'queued' })),
    );
    expect(state.results).toHaveLength(0);
  });

  it('records the applying node in nodesById with the correct resource_name', () => {
    let state = deployReducer(undefined, { type: '@@INIT' });
    state = { ...state, status: 'deploying' };
    state = deployReducer(
      state,
      applyNodeStatusEvent(statusEvent({ resource_name: 'redis-instance-xyz' })),
    );
    // pdl-5 — the panel reads applying state via deriveRollup(nodesById)
    // rather than a single state.currentResource string.
    expect(state.nodesById[N1].resource_name).toBe('redis-instance-xyz');
    expect(state.nodesById[N1].status).toBe('applying');
  });

  it('keeps state.results stable on a duplicate terminal event', () => {
    let state = deployReducer(undefined, { type: '@@INIT' });
    state = deployReducer(state, applyNodeStatusEvent(statusEvent({ seq: 1, status: 'succeeded' })));
    expect(state.results).toHaveLength(1);
    // Same node, lower seq → dedup, no mirror.
    state = deployReducer(state, applyNodeStatusEvent(statusEvent({ seq: 1, status: 'failed' })));
    expect(state.results).toHaveLength(1);
    expect(state.results[0].success).toBe(true);
  });
});

describe('applyNodeProgressEvent', () => {
  it('updates step but preserves the parent record status', () => {
    let state = deployReducer(undefined, { type: '@@INIT' });
    state = deployReducer(state, applyNodeStatusEvent(statusEvent({ seq: 1, status: 'applying' })));
    state = deployReducer(
      state,
      applyNodeProgressEvent(
        progressEvent({ seq: 2, step: { label: 'Building image', index: 2, total: 4 } }),
      ),
    );
    expect(state.nodesById[N1].step).toEqual({ label: 'Building image', index: 2, total: 4 });
    expect(state.nodesById[N1].status).toBe('applying');
    expect(state.nodesById[N1].last_seq).toBe(2);
  });

  it('seeds a minimal applying record when no prior status arrived', () => {
    const initial = deployReducer(undefined, { type: '@@INIT' });
    const next = deployReducer(initial, applyNodeProgressEvent(progressEvent({ seq: 7 })));
    // Defensive seed — the next node_status event will fill in
    // resource_type / action.
    expect(next.nodesById[N1]).toBeDefined();
    expect(next.nodesById[N1].status).toBe('applying');
    expect(next.nodesById[N1].step).toEqual({ label: 'Provisioning instance', index: 1, total: 2 });
    expect(next.nodesById[N1].resource_name).toBe('foo-instance-abc');
    expect(next.nodesById[N1].last_seq).toBe(7);
  });

  it('drops a progress event with seq <= existing record', () => {
    let state = deployReducer(undefined, { type: '@@INIT' });
    state = deployReducer(state, applyNodeStatusEvent(statusEvent({ seq: 5 })));
    state = deployReducer(
      state,
      applyNodeProgressEvent(
        progressEvent({ seq: 3, step: { label: 'old step', index: 1, total: 2 } }),
      ),
    );
    expect(state.nodesById[N1].step).toBeUndefined();
    expect(state.nodesById[N1].last_seq).toBe(5);
  });
});

describe('applyDeployCompleteEvent', () => {
  it("maps outcome 'success' → status 'success'", () => {
    let state = deployReducer(undefined, { type: '@@INIT' });
    state = { ...state, status: 'deploying' };
    state = deployReducer(state, applyDeployCompleteEvent(completeEvent({ outcome: 'success' })));
    expect(state.status).toBe('success');
  });

  it("maps outcome 'partial' → status 'error' (red header + Copy errors button)", () => {
    let state = deployReducer(undefined, { type: '@@INIT' });
    state = { ...state, status: 'deploying' };
    state = deployReducer(state, applyDeployCompleteEvent(completeEvent({ outcome: 'partial' })));
    expect(state.status).toBe('error');
  });

  it("maps outcome 'failure' → status 'error'", () => {
    let state = deployReducer(undefined, { type: '@@INIT' });
    state = { ...state, status: 'deploying' };
    state = deployReducer(state, applyDeployCompleteEvent(completeEvent({ outcome: 'failure' })));
    expect(state.status).toBe('error');
  });

  it("maps outcome 'cancelled' → status 'cancelled' (zero successes per pdl-2 contract)", () => {
    let state = deployReducer(undefined, { type: '@@INIT' });
    state = { ...state, status: 'deploying' };
    state = deployReducer(state, applyDeployCompleteEvent(completeEvent({ outcome: 'cancelled' })));
    expect(state.status).toBe('cancelled');
  });

  it('clears currentDeployCardId on completion', () => {
    // pdl-5 — `currentResource` / `currentStep` are no longer slice
    // state; the panel derives them from `nodesById` instead.
    let state = deployReducer(undefined, { type: '@@INIT' });
    state = { ...state, status: 'deploying', currentDeployCardId: 'card-1' };
    state = deployReducer(state, applyDeployCompleteEvent(completeEvent()));
    expect(state.currentDeployCardId).toBeUndefined();
  });
});

describe('setActiveCard extraReducer', () => {
  it('clears nodesById when the active card changes', () => {
    let state = deployReducer(undefined, { type: '@@INIT' });
    state = deployReducer(state, applyNodeStatusEvent(statusEvent()));
    expect(Object.keys(state.nodesById)).toHaveLength(1);
    state = deployReducer(state, setActiveCard('different-card-id'));
    expect(state.nodesById).toEqual({});
  });

  it('does not clear nodesById on re-selecting the same card', () => {
    let state = deployReducer(undefined, { type: '@@INIT' });
    state = deployReducer(state, setActiveCard('card-x'));
    state = deployReducer(state, applyNodeStatusEvent(statusEvent()));
    expect(Object.keys(state.nodesById)).toHaveLength(1);
    state = deployReducer(state, setActiveCard('card-x'));
    expect(Object.keys(state.nodesById)).toHaveLength(1);
  });

  it('does not clear nodesById while a deploy is in flight', () => {
    let state = deployReducer(undefined, { type: '@@INIT' });
    state = deployReducer(state, applyNodeStatusEvent(statusEvent()));
    state = { ...state, status: 'deploying' };
    state = deployReducer(state, setActiveCard('different-card-id'));
    // The extraReducer no-ops while deploying so the panel keeps showing
    // running progress.
    expect(Object.keys(state.nodesById)).toHaveLength(1);
  });
});

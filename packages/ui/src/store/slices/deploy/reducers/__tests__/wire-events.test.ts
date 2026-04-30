/**
 * Tests for `deploy/reducers/wire-events.ts` — applyNodeStatusEvent,
 * applyNodeProgressEvent, applyDeployCompleteEvent.
 *
 * Critical preservation: the seq-based dedup, action-aware dedup, and
 * fresh-operation-start branches. The legacy slice-level test
 * `deploy-slice-events.test.ts` still exercises these reducers via the
 * slice's own action-creators, so it functions as a behavior-parity
 * harness for this extraction. The tests below exercise the reducer-group
 * directly via Immer's `produce`.
 *
 * @see rf-dslice-7
 */

import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { wireEventsReducers } from '../wire-events';
import type { DeployState } from '../../types';
import type {
  DeployCompleteEvent,
  DeployNodeProgressEvent,
  DeployNodeStatusEvent,
} from '@ice/types';
import type { PayloadAction } from '@reduxjs/toolkit';

function makeState(overrides: Partial<DeployState> = {}): DeployState {
  return {
    isOpen: false,
    provider: 'gcp',
    gcpProject: '',
    region: 'us-central1',
    environment: 'development',
    status: 'deploying',
    error: null,
    plan: null,
    logs: [],
    results: [],
    nodesById: {},
    history: [],
    deployedResources: [],
    driftByNode: {},
    driftCheckLoading: false,
    requirements: [],
    requirementsLoading: false,
    diagnosis: { status: 'idle', result: null, error: null },
    dismissedWarnings: [],
    criticalAcknowledged: false,
    ...overrides,
  };
}

function statusEvent(overrides: Partial<DeployNodeStatusEvent> = {}): DeployNodeStatusEvent {
  return {
    type: 'node_status',
    card_id: 'c1',
    seq: 1,
    at: '2026-04-30T00:00:00.000Z',
    node_id: 'n1',
    status: 'queued',
    resource_name: 'svc',
    resource_type: 'gcp.run.service',
    action: 'create',
    ...overrides,
  };
}

// -----------------------------------------------------------------------------
// applyNodeStatusEvent
// -----------------------------------------------------------------------------

describe('applyNodeStatusEvent', () => {
  it('inserts a new node record when none exists', () => {
    const next = produce(makeState(), (draft) => {
      wireEventsReducers.applyNodeStatusEvent(draft, {
        type: 'deploy/applyNodeStatusEvent',
        payload: statusEvent({ seq: 5 }),
      } as PayloadAction<DeployNodeStatusEvent>);
    });
    expect(next.nodesById.n1).toBeDefined();
    expect(next.nodesById.n1.status).toBe('queued');
    expect(next.nodesById.n1.last_seq).toBe(5);
  });

  it('dedups when same-action seq is lower-or-equal — drops the event', () => {
    const before = makeState({
      nodesById: {
        n1: { node_id: 'n1', status: 'applying', resource_name: 'svc', resource_type: 't', action: 'create', last_at: '', last_seq: 5 },
      },
    });
    const next = produce(before, (draft) => {
      wireEventsReducers.applyNodeStatusEvent(draft, {
        type: 'deploy/applyNodeStatusEvent',
        payload: statusEvent({ seq: 3, status: 'queued' }),
      } as PayloadAction<DeployNodeStatusEvent>);
    });
    // Status NOT updated — dedup fired.
    expect(next.nodesById.n1.status).toBe('applying');
    expect(next.nodesById.n1.last_seq).toBe(5);
  });

  it('bypasses dedup when action differs (destroy after apply, seq counter resets)', () => {
    // pdl-10 B1 — different actions are different operations; their
    // independent seq counters must not silently drop each other.
    const before = makeState({
      nodesById: {
        n1: { node_id: 'n1', status: 'succeeded', resource_name: 'svc', resource_type: 't', action: 'create', last_at: '', last_seq: 9 },
      },
    });
    const next = produce(before, (draft) => {
      wireEventsReducers.applyNodeStatusEvent(draft, {
        type: 'deploy/applyNodeStatusEvent',
        payload: statusEvent({ seq: 1, status: 'queued', action: 'delete' }),
      } as PayloadAction<DeployNodeStatusEvent>);
    });
    // Action differs — even though seq=1 < 9, the event applies.
    expect(next.nodesById.n1.action).toBe('delete');
    expect(next.nodesById.n1.status).toBe('queued');
    expect(next.nodesById.n1.last_seq).toBe(1);
  });

  it('bypasses dedup when a queued event arrives on a terminal record (fresh-op start)', () => {
    // Re-deploy: same action, but the existing record is terminal — a new
    // op is starting.
    const before = makeState({
      nodesById: {
        n1: { node_id: 'n1', status: 'failed', resource_name: 'svc', resource_type: 't', action: 'create', last_at: '', last_seq: 7 },
      },
    });
    const next = produce(before, (draft) => {
      wireEventsReducers.applyNodeStatusEvent(draft, {
        type: 'deploy/applyNodeStatusEvent',
        payload: statusEvent({ seq: 1, status: 'queued', action: 'create' }),
      } as PayloadAction<DeployNodeStatusEvent>);
    });
    expect(next.nodesById.n1.status).toBe('queued');
    expect(next.nodesById.n1.last_seq).toBe(1);
  });

  it('preserves existing step on a status-only flip', () => {
    const before = makeState({
      nodesById: {
        n1: {
          node_id: 'n1',
          status: 'applying',
          resource_name: 'svc',
          resource_type: 't',
          action: 'create',
          step: { label: 'creating', index: 1, total: 3 },
          last_at: '',
          last_seq: 1,
        },
      },
    });
    const next = produce(before, (draft) => {
      wireEventsReducers.applyNodeStatusEvent(draft, {
        type: 'deploy/applyNodeStatusEvent',
        payload: statusEvent({ seq: 2, status: 'succeeded' }),
      } as PayloadAction<DeployNodeStatusEvent>);
    });
    expect(next.nodesById.n1.step).toEqual({ label: 'creating', index: 1, total: 3 });
  });

  it('mirrors a terminal event into state.results when slice status is non-terminal', () => {
    const next = produce(makeState({ status: 'deploying' }), (draft) => {
      wireEventsReducers.applyNodeStatusEvent(draft, {
        type: 'deploy/applyNodeStatusEvent',
        payload: statusEvent({ seq: 1, status: 'succeeded' }),
      } as PayloadAction<DeployNodeStatusEvent>);
    });
    expect(next.results).toHaveLength(1);
    expect(next.results[0].source_node_id).toBe('n1');
    expect(next.results[0].success).toBe(true);
  });

  it('does NOT mirror to state.results once the slice status is terminal', () => {
    // deploySuccess / deployError own the results surface post-complete.
    const next = produce(makeState({ status: 'success' }), (draft) => {
      wireEventsReducers.applyNodeStatusEvent(draft, {
        type: 'deploy/applyNodeStatusEvent',
        payload: statusEvent({ seq: 1, status: 'failed' }),
      } as PayloadAction<DeployNodeStatusEvent>);
    });
    expect(next.results).toEqual([]);
    // But the node IS still upserted into nodesById.
    expect(next.nodesById.n1.status).toBe('failed');
  });

  it('does not mirror non-terminal events', () => {
    const next = produce(makeState({ status: 'deploying' }), (draft) => {
      wireEventsReducers.applyNodeStatusEvent(draft, {
        type: 'deploy/applyNodeStatusEvent',
        payload: statusEvent({ seq: 1, status: 'applying' }),
      } as PayloadAction<DeployNodeStatusEvent>);
    });
    expect(next.results).toEqual([]);
    expect(next.nodesById.n1.status).toBe('applying');
  });

  it('preserves prior outputs / provider_id on a result merge', () => {
    const before = makeState({
      status: 'deploying',
      results: [
        {
          name: 'svc',
          type: 'gcp.run.service',
          action: 'create',
          success: true,
          outputs: { url: 'https://kept' },
          provider_id: 'pid-kept',
          source_node_id: 'n1',
        },
      ],
    });
    const next = produce(before, (draft) => {
      wireEventsReducers.applyNodeStatusEvent(draft, {
        type: 'deploy/applyNodeStatusEvent',
        payload: statusEvent({ seq: 1, status: 'succeeded' }),
      } as PayloadAction<DeployNodeStatusEvent>);
    });
    expect(next.results).toHaveLength(1);
    expect(next.results[0].outputs).toEqual({ url: 'https://kept' });
    expect(next.results[0].provider_id).toBe('pid-kept');
  });
});

// -----------------------------------------------------------------------------
// applyNodeProgressEvent
// -----------------------------------------------------------------------------

function progressEvent(overrides: Partial<DeployNodeProgressEvent> = {}): DeployNodeProgressEvent {
  return {
    type: 'node_progress',
    card_id: 'c1',
    seq: 2,
    at: '2026-04-30T00:00:01.000Z',
    node_id: 'n1',
    resource_name: 'svc',
    step: { label: 'creating', index: 1, total: 3 },
    ...overrides,
  };
}

describe('applyNodeProgressEvent', () => {
  it('seeds a minimal applying record when no node exists yet', () => {
    const next = produce(makeState(), (draft) => {
      wireEventsReducers.applyNodeProgressEvent(draft, {
        type: 'deploy/applyNodeProgressEvent',
        payload: progressEvent({ seq: 1 }),
      } as PayloadAction<DeployNodeProgressEvent>);
    });
    expect(next.nodesById.n1).toBeDefined();
    expect(next.nodesById.n1.status).toBe('applying');
    expect(next.nodesById.n1.resource_type).toBe('');
    expect(next.nodesById.n1.action).toBe('create');
    expect(next.nodesById.n1.step).toEqual({ label: 'creating', index: 1, total: 3 });
  });

  it('updates step on an existing non-terminal record when seq is higher', () => {
    const before = makeState({
      nodesById: {
        n1: {
          node_id: 'n1',
          status: 'applying',
          resource_name: 'svc',
          resource_type: 'gcp.run.service',
          action: 'create',
          last_at: '',
          last_seq: 1,
        },
      },
    });
    const next = produce(before, (draft) => {
      wireEventsReducers.applyNodeProgressEvent(draft, {
        type: 'deploy/applyNodeProgressEvent',
        payload: progressEvent({ seq: 2, step: { label: 'binding-iam', index: 2, total: 3 } }),
      } as PayloadAction<DeployNodeProgressEvent>);
    });
    expect(next.nodesById.n1.step).toEqual({ label: 'binding-iam', index: 2, total: 3 });
    expect(next.nodesById.n1.last_seq).toBe(2);
  });

  it('dedups against a non-terminal record when seq is lower-or-equal', () => {
    const before = makeState({
      nodesById: {
        n1: {
          node_id: 'n1',
          status: 'applying',
          resource_name: 'svc',
          resource_type: 't',
          action: 'create',
          step: { label: 'kept', index: 0, total: 1 },
          last_at: '',
          last_seq: 5,
        },
      },
    });
    const next = produce(before, (draft) => {
      wireEventsReducers.applyNodeProgressEvent(draft, {
        type: 'deploy/applyNodeProgressEvent',
        payload: progressEvent({ seq: 3, step: { label: 'dropped', index: 9, total: 9 } }),
      } as PayloadAction<DeployNodeProgressEvent>);
    });
    // Step preserved — dedup fired.
    expect(next.nodesById.n1.step?.label).toBe('kept');
    expect(next.nodesById.n1.last_seq).toBe(5);
  });

  it('bypasses dedup against a TERMINAL record (re-deploy mid-flight, B1 medicine)', () => {
    const before = makeState({
      nodesById: {
        n1: {
          node_id: 'n1',
          status: 'succeeded',
          resource_name: 'svc',
          resource_type: 't',
          action: 'create',
          last_at: '',
          last_seq: 9,
        },
      },
    });
    const next = produce(before, (draft) => {
      wireEventsReducers.applyNodeProgressEvent(draft, {
        type: 'deploy/applyNodeProgressEvent',
        payload: progressEvent({ seq: 1, step: { label: 'rerun', index: 0, total: 2 } }),
      } as PayloadAction<DeployNodeProgressEvent>);
    });
    expect(next.nodesById.n1.step?.label).toBe('rerun');
    expect(next.nodesById.n1.last_seq).toBe(1);
  });
});

// -----------------------------------------------------------------------------
// applyDeployCompleteEvent
// -----------------------------------------------------------------------------

describe('applyDeployCompleteEvent', () => {
  function completeEvent(outcome: DeployCompleteEvent['outcome']): DeployCompleteEvent {
    return {
      type: 'complete',
      card_id: 'c1',
      outcome,
      totals: {
        queued: 0,
        applying: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
        cancelled: 0,
      },
      at: '2026-04-30T00:00:10.000Z',
      seq: 99,
    };
  }

  it("flips status to 'success' on outcome=success", () => {
    const next = produce(makeState({ status: 'deploying', currentDeployCardId: 'c1' }), (draft) => {
      wireEventsReducers.applyDeployCompleteEvent(draft, {
        type: 'deploy/applyDeployCompleteEvent',
        payload: completeEvent('success'),
      } as PayloadAction<DeployCompleteEvent>);
    });
    expect(next.status).toBe('success');
    expect(next.currentDeployCardId).toBeUndefined();
  });

  it("flips status to 'cancelled' on outcome=cancelled", () => {
    const next = produce(makeState({ status: 'deploying' }), (draft) => {
      wireEventsReducers.applyDeployCompleteEvent(draft, {
        type: 'deploy/applyDeployCompleteEvent',
        payload: completeEvent('cancelled'),
      } as PayloadAction<DeployCompleteEvent>);
    });
    expect(next.status).toBe('cancelled');
  });

  it("maps outcome=partial → status='error'", () => {
    const next = produce(makeState({ status: 'deploying' }), (draft) => {
      wireEventsReducers.applyDeployCompleteEvent(draft, {
        type: 'deploy/applyDeployCompleteEvent',
        payload: completeEvent('partial'),
      } as PayloadAction<DeployCompleteEvent>);
    });
    expect(next.status).toBe('error');
  });

  it("maps outcome=failure → status='error'", () => {
    const next = produce(makeState({ status: 'deploying' }), (draft) => {
      wireEventsReducers.applyDeployCompleteEvent(draft, {
        type: 'deploy/applyDeployCompleteEvent',
        payload: completeEvent('failure'),
      } as PayloadAction<DeployCompleteEvent>);
    });
    expect(next.status).toBe('error');
  });
});

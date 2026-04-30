/**
 * Tests for `deploy/reducers/deploy-phases.ts` — startDeploying / startDestroying.
 *
 * Critical preservation: the status-guard early returns. Both reducers
 * idempotently no-op when the slice is already in a relevant state. The
 * tests must exercise the no-op paths AND the happy-path transitions —
 * a future refactor that drops the guard would break the deploy-banner
 * (label flicker) and the smoke-test for re-dispatched deploys.
 *
 * @see rf-dslice-6
 */

import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { deployPhasesReducers } from '../deploy-phases';
import type { DeployState, DeployStatus } from '../../types';
import type { PayloadAction } from '@reduxjs/toolkit';

function makeState(overrides: Partial<DeployState> = {}): DeployState {
  return {
    isOpen: false,
    provider: 'gcp',
    gcpProject: '',
    region: 'us-central1',
    environment: 'development',
    status: 'idle',
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

describe('startDeploying', () => {
  it("flips status to 'deploying', resets results/nodesById/error", () => {
    const next = produce(
      makeState({
        status: 'planned',
        results: [
          { name: 'svc', type: 't', action: 'create', success: true },
        ],
        nodesById: { a: { node_id: 'a', status: 'queued', resource_name: 'a', resource_type: 't', action: 'create', last_at: '', last_seq: 0 } },
        error: 'stale',
        logs: ['log'],
      }),
      (draft) => {
        deployPhasesReducers.startDeploying(draft, {
          type: 'deploy/startDeploying',
          payload: { cardId: 'c1' },
        } as PayloadAction<{ cardId?: string }>);
      },
    );
    expect(next.status).toBe('deploying');
    expect(next.results).toEqual([]);
    expect(next.nodesById).toEqual({});
    expect(next.error).toBeNull();
    expect(next.currentDeployCardId).toBe('c1');
    expect(next.logs).toHaveLength(2);
  });

  it("preserves currentDeployCardId when no cardId in payload", () => {
    const next = produce(
      makeState({ status: 'idle', currentDeployCardId: 'existing' }),
      (draft) => {
        deployPhasesReducers.startDeploying(draft, {
          type: 'deploy/startDeploying',
          payload: undefined,
        } as PayloadAction<undefined>);
      },
    );
    expect(next.currentDeployCardId).toBe('existing');
  });

  it.each(['deploying', 'planning', 'destroying'] as DeployStatus[])(
    "is a no-op when status is '%s'",
    (status) => {
      const before = makeState({ status, results: [{ name: 'kept', type: 't', action: 'create', success: true }] });
      const next = produce(before, (draft) => {
        deployPhasesReducers.startDeploying(draft, {
          type: 'deploy/startDeploying',
          payload: { cardId: 'c1' },
        } as PayloadAction<{ cardId?: string }>);
      });
      // Status unchanged; results not wiped — proves the early return fired.
      expect(next.status).toBe(status);
      expect(next.results).toHaveLength(1);
    },
  );

  it("transitions from 'idle' (not in the guard set) — happy path", () => {
    const next = produce(makeState({ status: 'idle' }), (draft) => {
      deployPhasesReducers.startDeploying(draft, {
        type: 'deploy/startDeploying',
        payload: undefined,
      } as PayloadAction<undefined>);
    });
    expect(next.status).toBe('deploying');
  });

  it("transitions from 'success' (not in the guard set) — re-deploy after success", () => {
    const next = produce(makeState({ status: 'success' }), (draft) => {
      deployPhasesReducers.startDeploying(draft, {
        type: 'deploy/startDeploying',
        payload: undefined,
      } as PayloadAction<undefined>);
    });
    expect(next.status).toBe('deploying');
  });
});

describe('startDestroying', () => {
  it("flips status to 'destroying' and resets results/nodesById/error", () => {
    const next = produce(
      makeState({
        status: 'success',
        results: [{ name: 'kept-by-stale-state', type: 't', action: 'create', success: true }],
        nodesById: { a: { node_id: 'a', status: 'succeeded', resource_name: 'a', resource_type: 't', action: 'create', last_at: '', last_seq: 0 } },
        error: 'stale',
      }),
      (draft) => {
        deployPhasesReducers.startDestroying(draft, {
          type: 'deploy/startDestroying',
          payload: { cardId: 'c2' },
        } as PayloadAction<{ cardId?: string }>);
      },
    );
    expect(next.status).toBe('destroying');
    expect(next.results).toEqual([]);
    expect(next.nodesById).toEqual({});
    expect(next.error).toBeNull();
    expect(next.currentDeployCardId).toBe('c2');
    // Hard-coded log string preserved (no i18n).
    expect(next.logs[next.logs.length - 1]).toBe('Destroying deployment...');
  });

  it("is a no-op when status is already 'destroying' (and ONLY that status)", () => {
    const before = makeState({
      status: 'destroying',
      results: [{ name: 'kept', type: 't', action: 'create', success: true }],
    });
    const next = produce(before, (draft) => {
      deployPhasesReducers.startDestroying(draft, {
        type: 'deploy/startDestroying',
        payload: { cardId: 'c1' },
      } as PayloadAction<{ cardId?: string }>);
    });
    expect(next.status).toBe('destroying');
    expect(next.results).toHaveLength(1);
  });

  it("transitions from 'deploying' (NOT in the destroying guard) — destroy interrupts deploy", () => {
    // Asymmetric guard: startDeploying treats 'destroying' as no-op,
    // but startDestroying does NOT treat 'deploying' as no-op. The user
    // should be able to interrupt a stuck deploy by calling destroy.
    const next = produce(makeState({ status: 'deploying' }), (draft) => {
      deployPhasesReducers.startDestroying(draft, {
        type: 'deploy/startDestroying',
        payload: undefined,
      } as PayloadAction<undefined>);
    });
    expect(next.status).toBe('destroying');
  });
});

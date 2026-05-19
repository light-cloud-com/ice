/**
 * Tests for `deploy/reducers/outcome.ts` — deploySuccess, deployError,
 * resetDeploy.
 *
 * Critical preservation: `resetDeploy` field reset list. The naive
 * "post-reset, status is idle" assertion is silently OK with a future
 * refactor that drops a field from the reset list. To pin the list
 * (status, error, plan, currentDeployCardId, logs, results, nodesById),
 * each test asserts that ALL of those fields return to their initial
 * shape — and that fields NOT in the list are preserved.
 *
 * @see rf-dslice-8
 */

import { produce } from 'immer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { outcomeReducers } from '../outcome';
import type { DeployResourceResult, DeployState } from '../../types';
import type { PayloadAction } from '@reduxjs/toolkit';

function makeState(overrides: Partial<DeployState> = {}): DeployState {
  return {
    isOpen: false,
    provider: 'gcp',
    gcpProject: 'p',
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

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-04-30T00:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

// -----------------------------------------------------------------------------
// deploySuccess
// -----------------------------------------------------------------------------

describe('deploySuccess', () => {
  it("flips status to 'success' and clears currentDeployCardId", () => {
    const next = produce(makeState({ currentDeployCardId: 'c1' }), (draft) => {
      outcomeReducers.deploySuccess(draft, {
        type: 'deploy/deploySuccess',
        payload: { duration_ms: 5000 },
      } as PayloadAction<{ duration_ms: number }>);
    });
    expect(next.status).toBe('success');
    expect(next.currentDeployCardId).toBeUndefined();
  });

  it('replaces results with the API payload when provided', () => {
    const stale: DeployResourceResult[] = [{ name: 'stale', type: 't', action: 'create', success: false }];
    const fresh: DeployResourceResult[] = [
      { name: 'fresh', type: 't', action: 'create', success: true, outputs: { url: 'https://x' } },
    ];
    const next = produce(makeState({ results: stale }), (draft) => {
      outcomeReducers.deploySuccess(draft, {
        type: 'deploy/deploySuccess',
        payload: { duration_ms: 1000, results: fresh },
      } as PayloadAction<{ duration_ms: number; results?: DeployResourceResult[] }>);
    });
    expect(next.results).toEqual(fresh);
  });

  it('preserves results when payload.results is empty/undefined', () => {
    const stale: DeployResourceResult[] = [{ name: 'kept', type: 't', action: 'create', success: true }];
    const next = produce(makeState({ results: stale }), (draft) => {
      outcomeReducers.deploySuccess(draft, {
        type: 'deploy/deploySuccess',
        payload: { duration_ms: 1000 },
      } as PayloadAction<{ duration_ms: number }>);
    });
    expect(next.results).toEqual(stale);
  });

  it('pushes a new history entry with success=true when all results succeed', () => {
    const next = produce(makeState({ history: [] }), (draft) => {
      outcomeReducers.deploySuccess(draft, {
        type: 'deploy/deploySuccess',
        payload: {
          duration_ms: 1000,
          results: [{ name: 'a', type: 't', action: 'create', success: true }],
        },
      } as PayloadAction<{ duration_ms: number; results?: DeployResourceResult[] }>);
    });
    expect(next.history).toHaveLength(1);
    expect(next.history[0].success).toBe(true);
    expect(next.history[0].duration_ms).toBe(1000);
  });

  it('caps history at 50 entries', () => {
    const past = Array.from({ length: 60 }, (_, i) => ({
      id: `old-${i}`,
      timestamp: i,
      environment: 'development',
      provider: 'gcp',
      project: 'p',
      region: 'r',
      results: [],
      success: true,
      duration_ms: 0,
    }));
    const next = produce(makeState({ history: past }), (draft) => {
      outcomeReducers.deploySuccess(draft, {
        type: 'deploy/deploySuccess',
        payload: { duration_ms: 1000 },
      } as PayloadAction<{ duration_ms: number }>);
    });
    expect(next.history).toHaveLength(50);
  });
});

// -----------------------------------------------------------------------------
// deployError
// -----------------------------------------------------------------------------

describe('deployError', () => {
  it('accepts a bare string as the payload', () => {
    const next = produce(makeState(), (draft) => {
      outcomeReducers.deployError(draft, {
        type: 'deploy/deployError',
        payload: 'oops',
      } as PayloadAction<string>);
    });
    expect(next.status).toBe('error');
    expect(next.error).toBe('oops');
    expect(next.history).toHaveLength(1);
    expect(next.history[0].success).toBe(false);
  });

  it('accepts { error, results } as the payload', () => {
    const results: DeployResourceResult[] = [
      { name: 'a', type: 't', action: 'create', success: false, duration_ms: 200 },
      { name: 'b', type: 't', action: 'create', success: true, duration_ms: 300 },
    ];
    const next = produce(makeState(), (draft) => {
      outcomeReducers.deployError(draft, {
        type: 'deploy/deployError',
        payload: { error: 'partial', results },
      } as PayloadAction<{ error: string; results?: DeployResourceResult[] }>);
    });
    expect(next.error).toBe('partial');
    expect(next.results).toEqual(results);
    // duration_ms is the SUM of result durations.
    expect(next.history[0].duration_ms).toBe(500);
  });
});

// -----------------------------------------------------------------------------
// resetDeploy
// -----------------------------------------------------------------------------

describe('resetDeploy', () => {
  it('resets exactly seven per-deploy fields to their idle shape', () => {
    const before = makeState({
      status: 'success',
      error: 'old',
      plan: { creates: [], updates: [], deletes: [], skipped: [], warnings: [] },
      currentDeployCardId: 'c1',
      logs: ['log'],
      results: [{ name: 'a', type: 't', action: 'create', success: true }],
      nodesById: {
        n1: {
          node_id: 'n1',
          status: 'succeeded',
          resource_name: 'a',
          resource_type: 't',
          action: 'create',
          last_at: '',
          last_seq: 1,
        },
      },
    });
    const next = produce(before, (draft) => {
      outcomeReducers.resetDeploy(draft);
    });
    expect(next.status).toBe('idle');
    expect(next.error).toBeNull();
    expect(next.plan).toBeNull();
    expect(next.currentDeployCardId).toBeUndefined();
    expect(next.logs).toEqual([]);
    expect(next.results).toEqual([]);
    expect(next.nodesById).toEqual({});
  });

  it('preserves fields NOT in the reset list (history, environment, provider, requirements)', () => {
    const before = makeState({
      status: 'success',
      history: [
        {
          id: 'kept',
          timestamp: 1,
          environment: 'development',
          provider: 'gcp',
          project: 'p',
          region: 'r',
          results: [],
          success: true,
          duration_ms: 0,
        },
      ],
      provider: 'aws',
      gcpProject: 'kept-project',
      region: 'kept-region',
      environment: 'production',
      requirements: [],
      dismissedWarnings: ['kept'],
      criticalAcknowledged: true,
      driftByNode: { n1: { nodeId: 'n1', status: 'in_sync', changes: [] } },
      deployedResources: [{ node_id: 'n1', name: 'a', type: 't', provider_id: 'p', status: 's', deployed_at: '' }],
    });
    const next = produce(before, (draft) => {
      outcomeReducers.resetDeploy(draft);
    });
    // Preserved.
    expect(next.history).toHaveLength(1);
    expect(next.history[0].id).toBe('kept');
    expect(next.provider).toBe('aws');
    expect(next.gcpProject).toBe('kept-project');
    expect(next.region).toBe('kept-region');
    expect(next.environment).toBe('production');
    expect(next.dismissedWarnings).toEqual(['kept']);
    expect(next.criticalAcknowledged).toBe(true);
    expect(next.driftByNode.n1).toBeDefined();
    expect(next.deployedResources).toHaveLength(1);
  });
});

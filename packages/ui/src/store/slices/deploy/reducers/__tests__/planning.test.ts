/**
 * Tests for `deploy/reducers/planning.ts` — startPlanning + setPlan.
 *
 * Critical preservation: setPlan's 5-field array coercion. The naive
 * "happy path" assertion `next.plan?.creates.length === 1` is silently
 * OK with both the coercion present and absent (the backend's well-formed
 * payload arrives as an array either way). To pin the coercion behavior,
 * the test passes a payload where one or more fields are NOT arrays
 * (undefined, null, or numbers) and asserts the normalized shape is
 * `[]`. Same shape as `delete-vs-undefined-test-must-use-in-operator-not-strict-equality`:
 * the assertion has to actually distinguish the two implementations.
 *
 * @see rf-dslice-5
 */

import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { planningReducers } from '../planning';
import type { DeployPlan, DeployState } from '../../types';
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
    driftMeta: { checkedAt: null, unsupported: false },
    driftCheckLoading: false,
    requirements: [],
    requirementsLoading: false,
    diagnosis: { status: 'idle', result: null, error: null },
    dismissedWarnings: [],
    criticalAcknowledged: false,
    ...overrides,
  };
}

describe('startPlanning', () => {
  it("flips status to 'planning', clears error and plan, resets per-plan flags", () => {
    const next = produce(
      makeState({
        status: 'idle',
        error: 'old',
        plan: { creates: [], updates: [], deletes: [], skipped: [], warnings: [] },
        dismissedWarnings: ['warn-1'],
        criticalAcknowledged: true,
        logs: ['stale'],
      }),
      (draft) => {
        planningReducers.startPlanning(draft);
      },
    );
    expect(next.status).toBe('planning');
    expect(next.error).toBeNull();
    expect(next.plan).toBeNull();
    expect(next.dismissedWarnings).toEqual([]);
    expect(next.criticalAcknowledged).toBe(false);
    expect(next.logs).toHaveLength(1);
  });
});

describe('setPlan', () => {
  it('flips status to planned and stores the normalized plan', () => {
    const plan: DeployPlan = {
      creates: [{ name: 'svc', type: 'gcp.run.service', action: 'create' }],
      updates: [],
      deletes: [],
      skipped: [],
      warnings: [],
    };
    const next = produce(makeState({ status: 'planning' }), (draft) => {
      planningReducers.setPlan(draft, {
        type: 'deploy/setPlan',
        payload: plan,
      } as PayloadAction<DeployPlan>);
    });
    expect(next.status).toBe('planned');
    expect(next.plan?.creates).toHaveLength(1);
    expect(next.plan?.creates[0].name).toBe('svc');
  });

  it('coerces missing creates to []', () => {
    const next = produce(makeState({ status: 'planning' }), (draft) => {
      planningReducers.setPlan(draft, {
        type: 'deploy/setPlan',
        payload: {
          updates: [],
          deletes: [],
          skipped: [],
          warnings: [],
        } as unknown as DeployPlan,
      } as PayloadAction<DeployPlan>);
    });
    expect(next.plan?.creates).toEqual([]);
    expect(Array.isArray(next.plan?.creates)).toBe(true);
  });

  it('coerces missing updates to []', () => {
    const next = produce(makeState({ status: 'planning' }), (draft) => {
      planningReducers.setPlan(draft, {
        type: 'deploy/setPlan',
        payload: { creates: [], deletes: [], skipped: [], warnings: [] } as unknown as DeployPlan,
      } as PayloadAction<DeployPlan>);
    });
    expect(next.plan?.updates).toEqual([]);
  });

  it('coerces missing deletes to []', () => {
    const next = produce(makeState({ status: 'planning' }), (draft) => {
      planningReducers.setPlan(draft, {
        type: 'deploy/setPlan',
        payload: { creates: [], updates: [], skipped: [], warnings: [] } as unknown as DeployPlan,
      } as PayloadAction<DeployPlan>);
    });
    expect(next.plan?.deletes).toEqual([]);
  });

  it('coerces missing skipped to []', () => {
    const next = produce(makeState({ status: 'planning' }), (draft) => {
      planningReducers.setPlan(draft, {
        type: 'deploy/setPlan',
        payload: { creates: [], updates: [], deletes: [], warnings: [] } as unknown as DeployPlan,
      } as PayloadAction<DeployPlan>);
    });
    expect(next.plan?.skipped).toEqual([]);
  });

  it('coerces missing warnings to []', () => {
    const next = produce(makeState({ status: 'planning' }), (draft) => {
      planningReducers.setPlan(draft, {
        type: 'deploy/setPlan',
        payload: { creates: [], updates: [], deletes: [], skipped: [] } as unknown as DeployPlan,
      } as PayloadAction<DeployPlan>);
    });
    expect(next.plan?.warnings).toEqual([]);
  });

  it('coerces a non-array (e.g. number) to []', () => {
    const next = produce(makeState({ status: 'planning' }), (draft) => {
      planningReducers.setPlan(draft, {
        type: 'deploy/setPlan',
        payload: {
          // Older backend responses sent counts as numbers — must not crash.
          creates: 3 as unknown as DeployPlan['creates'],
          updates: [],
          deletes: [],
          skipped: [],
          warnings: [],
        },
      } as PayloadAction<DeployPlan>);
    });
    expect(next.plan?.creates).toEqual([]);
  });

  it('handles a fully empty/null payload — null-safe via `(action.payload || {})`', () => {
    const next = produce(makeState({ status: 'planning' }), (draft) => {
      planningReducers.setPlan(draft, {
        type: 'deploy/setPlan',
        payload: null as unknown as DeployPlan,
      } as PayloadAction<DeployPlan>);
    });
    expect(next.plan).toEqual({
      creates: [],
      updates: [],
      deletes: [],
      skipped: [],
      warnings: [],
    });
  });
});

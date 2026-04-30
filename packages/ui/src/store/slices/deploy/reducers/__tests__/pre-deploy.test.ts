/**
 * Tests for `deploy/reducers/pre-deploy.ts` — three pre-deploy warning reducers.
 *
 * @see rf-dslice-12
 */

import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { preDeployReducers } from '../pre-deploy';
import type { DeployState } from '../../types';
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

describe('dismissPreDeployWarning', () => {
  it('appends the id when not already present', () => {
    const next = produce(makeState({ dismissedWarnings: [] }), (draft) => {
      preDeployReducers.dismissPreDeployWarning(draft, {
        type: 'deploy/dismissPreDeployWarning',
        payload: 'open-port-22',
      } as PayloadAction<string>);
    });
    expect(next.dismissedWarnings).toEqual(['open-port-22']);
  });

  it('is a no-op (idempotent) when id is already present', () => {
    const next = produce(makeState({ dismissedWarnings: ['x', 'y'] }), (draft) => {
      preDeployReducers.dismissPreDeployWarning(draft, {
        type: 'deploy/dismissPreDeployWarning',
        payload: 'x',
      } as PayloadAction<string>);
    });
    expect(next.dismissedWarnings).toEqual(['x', 'y']);
  });
});

describe('acknowledgeCritical', () => {
  it('writes the boolean payload', () => {
    const next = produce(makeState({ criticalAcknowledged: false }), (draft) => {
      preDeployReducers.acknowledgeCritical(draft, {
        type: 'deploy/acknowledgeCritical',
        payload: true,
      } as PayloadAction<boolean>);
    });
    expect(next.criticalAcknowledged).toBe(true);
  });

  it('flips back to false', () => {
    const next = produce(makeState({ criticalAcknowledged: true }), (draft) => {
      preDeployReducers.acknowledgeCritical(draft, {
        type: 'deploy/acknowledgeCritical',
        payload: false,
      } as PayloadAction<boolean>);
    });
    expect(next.criticalAcknowledged).toBe(false);
  });
});

describe('resetPreDeployWarnings', () => {
  it('clears both dismissedWarnings and criticalAcknowledged', () => {
    const next = produce(
      makeState({ dismissedWarnings: ['a', 'b'], criticalAcknowledged: true }),
      (draft) => {
        preDeployReducers.resetPreDeployWarnings(draft);
      },
    );
    expect(next.dismissedWarnings).toEqual([]);
    expect(next.criticalAcknowledged).toBe(false);
  });
});

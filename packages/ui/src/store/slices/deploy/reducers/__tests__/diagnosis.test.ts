/**
 * Tests for `deploy/reducers/diagnosis.ts` — four diagnosis lifecycle reducers.
 *
 * @see rf-dslice-11
 */

import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { diagnosisReducers } from '../diagnosis';
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

describe('startDiagnosis', () => {
  it('sets the loading state with null result and error', () => {
    const next = produce(makeState({ diagnosis: { status: 'error', result: null, error: 'old' } }), (draft) => {
      diagnosisReducers.startDiagnosis(draft);
    });
    expect(next.diagnosis).toEqual({ status: 'loading', result: null, error: null });
  });
});

describe('setDiagnosis', () => {
  it('sets the loaded state and stores the payload as result', () => {
    const payload = { diagnosis: 'cold-cold start', suggestedFixes: ['warm it up'] };
    const next = produce(makeState({ diagnosis: { status: 'loading', result: null, error: null } }), (draft) => {
      diagnosisReducers.setDiagnosis(draft, {
        type: 'deploy/setDiagnosis',
        payload,
      } as PayloadAction<typeof payload>);
    });
    expect(next.diagnosis).toEqual({ status: 'loaded', result: payload, error: null });
  });
});

describe('diagnosisError', () => {
  it('sets the error state with payload as message', () => {
    const next = produce(makeState(), (draft) => {
      diagnosisReducers.diagnosisError(draft, {
        type: 'deploy/diagnosisError',
        payload: 'rate-limited',
      } as PayloadAction<string>);
    });
    expect(next.diagnosis).toEqual({ status: 'error', result: null, error: 'rate-limited' });
  });
});

describe('clearDiagnosis', () => {
  it('resets to idle with null result and error', () => {
    const next = produce(
      makeState({
        diagnosis: { status: 'loaded', result: { diagnosis: 'x', suggestedFixes: [] }, error: null },
      }),
      (draft) => {
        diagnosisReducers.clearDiagnosis(draft);
      },
    );
    expect(next.diagnosis).toEqual({ status: 'idle', result: null, error: null });
  });
});

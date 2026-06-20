/**
 * Tests for `deploy/reducers/auth.ts` — three auth-phase reducers.
 *
 * @see rf-dslice-4
 */

import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { authReducers } from '../auth';
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

describe('startAuthenticating', () => {
  it("flips status to 'authenticating' and resets logs to a single connecting entry", () => {
    const next = produce(makeState({ status: 'idle', logs: ['old'], error: 'stale' }), (draft) => {
      authReducers.startAuthenticating(draft);
    });
    expect(next.status).toBe('authenticating');
    expect(next.error).toBeNull();
    // Logs reset (not appended) — exactly one entry from i18n.
    expect(next.logs).toHaveLength(1);
  });
});

describe('authSuccess', () => {
  it("flips status back to 'idle' and appends a log entry", () => {
    const next = produce(makeState({ status: 'authenticating', logs: ['connecting...'] }), (draft) => {
      authReducers.authSuccess(draft);
    });
    expect(next.status).toBe('idle');
    expect(next.logs).toHaveLength(2);
  });
});

describe('authFailed', () => {
  it("flips status to 'error', stores message, appends log", () => {
    const next = produce(makeState({ status: 'authenticating', logs: ['connecting'] }), (draft) => {
      authReducers.authFailed(draft, {
        type: 'deploy/authFailed',
        payload: 'invalid token',
      } as PayloadAction<string>);
    });
    expect(next.status).toBe('error');
    expect(next.error).toBe('invalid token');
    expect(next.logs).toHaveLength(2);
  });
});

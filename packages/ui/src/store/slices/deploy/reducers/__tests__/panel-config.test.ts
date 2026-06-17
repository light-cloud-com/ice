/**
 * Tests for `deploy/reducers/panel-config.ts` — six trivial flag-flip
 * reducers. Each test exercises the reducer through Immer's `produce`
 * to mirror RTK's runtime behavior.
 *
 * @see rf-dslice-3
 */

import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { panelConfigReducers } from '../panel-config';
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

describe('openDeployPanel', () => {
  it('flips isOpen to true', () => {
    const next = produce(makeState({ isOpen: false }), (draft) => {
      panelConfigReducers.openDeployPanel(draft);
    });
    expect(next.isOpen).toBe(true);
  });
});

describe('closeDeployPanel', () => {
  it('flips isOpen to false', () => {
    const next = produce(makeState({ isOpen: true }), (draft) => {
      panelConfigReducers.closeDeployPanel(draft);
    });
    expect(next.isOpen).toBe(false);
  });
});

describe('setProvider', () => {
  it('writes the payload onto state.provider', () => {
    const next = produce(makeState({ provider: 'gcp' }), (draft) => {
      panelConfigReducers.setProvider(draft, {
        type: 'deploy/setProvider',
        payload: 'aws',
      } as PayloadAction<string>);
    });
    expect(next.provider).toBe('aws');
  });
});

describe('setGcpProject', () => {
  it('writes the payload onto state.gcpProject', () => {
    const next = produce(makeState(), (draft) => {
      panelConfigReducers.setGcpProject(draft, {
        type: 'deploy/setGcpProject',
        payload: 'my-project-123',
      } as PayloadAction<string>);
    });
    expect(next.gcpProject).toBe('my-project-123');
  });
});

describe('setRegion', () => {
  it('writes the payload onto state.region', () => {
    const next = produce(makeState({ region: 'us-central1' }), (draft) => {
      panelConfigReducers.setRegion(draft, {
        type: 'deploy/setRegion',
        payload: 'europe-west1',
      } as PayloadAction<string>);
    });
    expect(next.region).toBe('europe-west1');
  });
});

describe('setEnvironment', () => {
  it("accepts 'production'", () => {
    const next = produce(makeState({ environment: 'development' }), (draft) => {
      panelConfigReducers.setEnvironment(draft, {
        type: 'deploy/setEnvironment',
        payload: 'production',
      } as PayloadAction<'development' | 'staging' | 'production'>);
    });
    expect(next.environment).toBe('production');
  });

  it("accepts 'staging'", () => {
    const next = produce(makeState(), (draft) => {
      panelConfigReducers.setEnvironment(draft, {
        type: 'deploy/setEnvironment',
        payload: 'staging',
      } as PayloadAction<'development' | 'staging' | 'production'>);
    });
    expect(next.environment).toBe('staging');
  });
});

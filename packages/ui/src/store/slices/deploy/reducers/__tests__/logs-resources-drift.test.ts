/**
 * Tests for `deploy/reducers/logs-resources-drift.ts` — five small reducers.
 *
 * @see rf-dslice-9
 */

import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { logsResourcesDriftReducers } from '../logs-resources-drift';
import type { DeployState, DeployedResource, NodeDriftInfo } from '../../types';
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

describe('appendLog', () => {
  it('pushes the payload onto state.logs', () => {
    const next = produce(makeState({ logs: ['a'] }), (draft) => {
      logsResourcesDriftReducers.appendLog(draft, {
        type: 'deploy/appendLog',
        payload: 'b',
      } as PayloadAction<string>);
    });
    expect(next.logs).toEqual(['a', 'b']);
  });
});

describe('setDeployedResources', () => {
  it('replaces state.deployedResources with the payload', () => {
    const r: DeployedResource[] = [
      { node_id: 'n1', name: 'svc', type: 't', provider_id: 'p', status: 'ACTIVE', deployed_at: '' },
    ];
    const next = produce(makeState(), (draft) => {
      logsResourcesDriftReducers.setDeployedResources(draft, {
        type: 'deploy/setDeployedResources',
        payload: r,
      } as PayloadAction<DeployedResource[]>);
    });
    expect(next.deployedResources).toEqual(r);
  });
});

describe('setDriftCheckLoading', () => {
  it('writes the boolean payload to driftCheckLoading', () => {
    const next = produce(makeState({ driftCheckLoading: false }), (draft) => {
      logsResourcesDriftReducers.setDriftCheckLoading(draft, {
        type: 'deploy/setDriftCheckLoading',
        payload: true,
      } as PayloadAction<boolean>);
    });
    expect(next.driftCheckLoading).toBe(true);
  });
});

describe('setDriftResults', () => {
  it('replaces driftByNode keyed by nodeId and turns off loading', () => {
    const drift: NodeDriftInfo[] = [
      { nodeId: 'n1', status: 'drifted', changes: [{ path: 'x', desired: 1, actual: 2 }] },
      { nodeId: 'n2', status: 'in_sync', changes: [] },
    ];
    const next = produce(
      makeState({
        driftByNode: { stale: { nodeId: 'stale', status: 'unknown', changes: [] } },
        driftCheckLoading: true,
      }),
      (draft) => {
        logsResourcesDriftReducers.setDriftResults(draft, {
          type: 'deploy/setDriftResults',
          payload: drift,
        } as PayloadAction<NodeDriftInfo[]>);
      },
    );
    expect(Object.keys(next.driftByNode).sort()).toEqual(['n1', 'n2']);
    expect(next.driftByNode.n1.status).toBe('drifted');
    expect(next.driftCheckLoading).toBe(false);
  });
});

describe('clearDrift', () => {
  it('resets driftByNode to {} and driftCheckLoading to false', () => {
    const next = produce(
      makeState({
        driftByNode: { n1: { nodeId: 'n1', status: 'drifted', changes: [] } },
        driftCheckLoading: true,
      }),
      (draft) => {
        logsResourcesDriftReducers.clearDrift(draft);
      },
    );
    expect(next.driftByNode).toEqual({});
    expect(next.driftCheckLoading).toBe(false);
  });
});

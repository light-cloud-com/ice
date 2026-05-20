/**
 * Tests for FEAT-12: Drift detection state management
 */

import { describe, it, expect } from 'vitest';
import deployReducer, { setDriftCheckLoading, setDriftResults, clearDrift, type NodeDriftInfo } from '../deploy-slice';

describe('Drift detection reducers', () => {
  it('should set driftCheckLoading', () => {
    const state = deployReducer(undefined, { type: '@@INIT' });
    const result = deployReducer(state, setDriftCheckLoading(true));
    expect(result.driftCheckLoading).toBe(true);
  });

  it('should store drift results keyed by nodeId', () => {
    const state = deployReducer(undefined, { type: '@@INIT' });
    const driftResults: NodeDriftInfo[] = [
      { nodeId: 'n1', status: 'in_sync', changes: [] },
      {
        nodeId: 'n2',
        status: 'drifted',
        changes: [{ path: 'region', desired: 'us-central1', actual: 'europe-west1' }],
      },
      { nodeId: 'n3', status: 'missing', changes: [] },
    ];

    const result = deployReducer(state, setDriftResults(driftResults));

    expect(result.driftByNode['n1'].status).toBe('in_sync');
    expect(result.driftByNode['n2'].status).toBe('drifted');
    expect(result.driftByNode['n2'].changes).toHaveLength(1);
    expect(result.driftByNode['n2'].changes[0].path).toBe('region');
    expect(result.driftByNode['n3'].status).toBe('missing');
    expect(result.driftCheckLoading).toBe(false);
  });

  it('should clear previous drift results when new results arrive', () => {
    let state = deployReducer(undefined, { type: '@@INIT' });
    state = deployReducer(state, setDriftResults([{ nodeId: 'old-node', status: 'drifted', changes: [] }]));
    expect(state.driftByNode['old-node']).toBeDefined();

    state = deployReducer(state, setDriftResults([{ nodeId: 'new-node', status: 'in_sync', changes: [] }]));
    expect(state.driftByNode['old-node']).toBeUndefined();
    expect(state.driftByNode['new-node']).toBeDefined();
  });

  it('should clear all drift state', () => {
    let state = deployReducer(undefined, { type: '@@INIT' });
    state = deployReducer(state, setDriftCheckLoading(true));
    state = deployReducer(state, setDriftResults([{ nodeId: 'n1', status: 'drifted', changes: [] }]));

    const result = deployReducer(state, clearDrift());
    expect(result.driftByNode).toEqual({});
    expect(result.driftCheckLoading).toBe(false);
  });
});

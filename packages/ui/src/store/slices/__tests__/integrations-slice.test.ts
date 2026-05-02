/**
 * Reducer + extraReducer tests for integrations-slice.
 *
 * Covers the in-slice reducer (`setDeviceFlow`) plus every thunk's
 * pending/fulfilled/rejected matcher by dispatching the auto-generated
 * action types directly. No mocking of `getApi()` — we test the reducer
 * behaviour, not the network calls.
 */

import { describe, it, expect } from 'vitest';
import integrationsReducer, {
  setDeviceFlow,
  checkGitHubConnection,
  connectGitHubPAT,
  startGitHubDeviceFlow,
  disconnectGitHub,
  fetchGitHubRepos,
  fetchGitHubBranches,
  type IntegrationsState,
  type DeviceFlowState,
} from '../integrations-slice';

function init(): IntegrationsState {
  return integrationsReducer(undefined, { type: '@@INIT' });
}

describe('integrations-slice', () => {
  describe('initial state', () => {
    it('seeds disconnected status for all known providers and an empty github cache', () => {
      const state = init();
      expect(state.integrations).toEqual({
        github: { status: 'disconnected' },
        gcp: { status: 'disconnected' },
        aws: { status: 'disconnected' },
        azure: { status: 'disconnected' },
      });
      expect(state.github).toEqual({
        repos: [],
        branches: {},
        deviceFlow: null,
        loading: false,
      });
    });
  });

  describe('setDeviceFlow', () => {
    it('stores a payload object', () => {
      const flow: DeviceFlowState = {
        userCode: 'ABCD-1234',
        verificationUri: 'https://github.com/login/device',
        deviceCode: 'dev-1',
        interval: 5,
      };
      const state = integrationsReducer(init(), setDeviceFlow(flow));
      expect(state.github.deviceFlow).toEqual(flow);
    });

    it('clears via null', () => {
      let state = integrationsReducer(
        init(),
        setDeviceFlow({ userCode: 'X', verificationUri: 'u', deviceCode: 'd', interval: 5 }),
      );
      state = integrationsReducer(state, setDeviceFlow(null));
      expect(state.github.deviceFlow).toBeNull();
    });
  });

  describe('checkGitHubConnection', () => {
    it('marks github connected when payload is a user', () => {
      const state = integrationsReducer(
        init(),
        checkGitHubConnection.fulfilled({ username: 'octocat', avatarUrl: 'http://av' }, 'req-1'),
      );
      expect(state.integrations.github).toEqual({
        status: 'connected',
        username: 'octocat',
        avatarUrl: 'http://av',
      });
    });

    it('marks github disconnected when payload is null', () => {
      const state = integrationsReducer(init(), checkGitHubConnection.fulfilled(null, 'req-1'));
      expect(state.integrations.github).toEqual({ status: 'disconnected' });
    });
  });

  describe('connectGitHubPAT', () => {
    it('flips to connecting on pending', () => {
      const state = integrationsReducer(init(), connectGitHubPAT.pending('req-1', 'tok'));
      expect(state.integrations.github).toEqual({ status: 'connecting' });
    });

    it('flips to connected with login + avatar on fulfilled', () => {
      const state = integrationsReducer(
        init(),
        connectGitHubPAT.fulfilled({ login: 'octo', avatar_url: 'http://a' }, 'req-1', 'tok'),
      );
      expect(state.integrations.github).toEqual({
        status: 'connected',
        username: 'octo',
        avatarUrl: 'http://a',
      });
    });

    it('flips to error with the rejected payload', () => {
      const state = integrationsReducer(init(), connectGitHubPAT.rejected(null, 'req-1', 'tok', 'bad token'));
      expect(state.integrations.github).toEqual({ status: 'error', error: 'bad token' });
    });
  });

  describe('startGitHubDeviceFlow', () => {
    it('flips to connecting on pending', () => {
      const state = integrationsReducer(init(), startGitHubDeviceFlow.pending('req-1', undefined));
      expect(state.integrations.github).toEqual({ status: 'connecting' });
    });

    it('flips to error and clears the device flow on rejected', () => {
      let state = integrationsReducer(
        init(),
        setDeviceFlow({ userCode: 'X', verificationUri: 'u', deviceCode: 'd', interval: 5 }),
      );
      state = integrationsReducer(state, startGitHubDeviceFlow.rejected(null, 'req-1', undefined, 'denied'));
      expect(state.integrations.github).toEqual({ status: 'error', error: 'denied' });
      expect(state.github.deviceFlow).toBeNull();
    });
  });

  describe('pollGitHubDeviceFlow (private thunk dispatched via action type strings)', () => {
    // The poll thunk is internal — we don't import it. Use the action type
    // string that the slice's extraReducer matcher subscribes to.
    it('flips to connected and clears device flow on fulfilled', () => {
      let state = integrationsReducer(
        init(),
        setDeviceFlow({ userCode: 'X', verificationUri: 'u', deviceCode: 'd', interval: 5 }),
      );
      state = integrationsReducer(state, {
        type: 'integrations/pollGitHubDeviceFlow/fulfilled',
        payload: { login: 'octo', avatar_url: 'http://a' },
      });
      expect(state.integrations.github).toEqual({
        status: 'connected',
        username: 'octo',
        avatarUrl: 'http://a',
      });
      expect(state.github.deviceFlow).toBeNull();
    });

    it('flips to error and clears device flow on rejected', () => {
      let state = integrationsReducer(
        init(),
        setDeviceFlow({ userCode: 'X', verificationUri: 'u', deviceCode: 'd', interval: 5 }),
      );
      state = integrationsReducer(state, {
        type: 'integrations/pollGitHubDeviceFlow/rejected',
        payload: 'access_denied',
      });
      expect(state.integrations.github).toEqual({ status: 'error', error: 'access_denied' });
      expect(state.github.deviceFlow).toBeNull();
    });
  });

  describe('disconnectGitHub', () => {
    it('resets github connection + caches on fulfilled', () => {
      let state = init();
      state = integrationsReducer(
        state,
        connectGitHubPAT.fulfilled({ login: 'octo', avatar_url: 'http://a' }, 'req-1', 'tok'),
      );
      // Pre-seed some cached repos/branches/device-flow.
      state = integrationsReducer(state, fetchGitHubRepos.fulfilled([{ id: 1 } as any], 'req-2', undefined));
      state = integrationsReducer(
        state,
        fetchGitHubBranches.fulfilled({ repository: 'o/r', branches: [{ name: 'main' } as any] }, 'req-3', 'o/r'),
      );
      state = integrationsReducer(
        state,
        setDeviceFlow({ userCode: 'X', verificationUri: 'u', deviceCode: 'd', interval: 5 }),
      );

      state = integrationsReducer(state, disconnectGitHub.fulfilled(undefined, 'req-4'));
      expect(state.integrations.github).toEqual({ status: 'disconnected' });
      expect(state.github.repos).toEqual([]);
      expect(state.github.branches).toEqual({});
      expect(state.github.deviceFlow).toBeNull();
    });
  });

  describe('fetchGitHubRepos', () => {
    it('starts loading and clears any prior error on pending', () => {
      let state = init();
      state = integrationsReducer(
        state,
        fetchGitHubRepos.rejected(null, 'req-prev', undefined, 'previous error'),
      );
      expect(state.github.reposError).toBe('previous error');

      state = integrationsReducer(state, fetchGitHubRepos.pending('req-1', undefined));
      expect(state.github.loading).toBe(true);
      expect(state.github.reposError).toBeUndefined();
    });

    it('stores repos, stamps fetchedAt and stops loading on fulfilled', () => {
      const repos = [{ id: 7, name: 'r' } as any];
      let state = integrationsReducer(init(), fetchGitHubRepos.pending('req-1', undefined));
      state = integrationsReducer(state, fetchGitHubRepos.fulfilled(repos, 'req-1', undefined));
      expect(state.github.repos).toBe(repos);
      expect(state.github.loading).toBe(false);
      expect(state.github.reposError).toBeUndefined();
      expect(typeof state.github.reposFetchedAt).toBe('string');
    });

    it('stores the rejected payload as reposError', () => {
      const state = integrationsReducer(
        init(),
        fetchGitHubRepos.rejected(null, 'req-1', undefined, 'bad pat'),
      );
      expect(state.github.loading).toBe(false);
      expect(state.github.reposError).toBe('bad pat');
    });

    it('falls back to action.error.message when no rejected payload', () => {
      // rejectWithValue path uses .payload; a thrown error path leaves
      // payload undefined and surfaces .error.message instead.
      const state = integrationsReducer(init(), {
        type: fetchGitHubRepos.rejected.type,
        payload: undefined,
        error: { message: 'network down' },
        meta: { arg: undefined, requestId: 'r', requestStatus: 'rejected' },
      } as any);
      expect(state.github.reposError).toBe('network down');
    });

    it('falls back to a generic message when neither payload nor error.message is set', () => {
      const state = integrationsReducer(init(), {
        type: fetchGitHubRepos.rejected.type,
        payload: undefined,
        error: {},
        meta: { arg: undefined, requestId: 'r', requestStatus: 'rejected' },
      } as any);
      expect(state.github.reposError).toBe('Failed to load repositories.');
    });
  });

  describe('fetchGitHubBranches', () => {
    it('keys branches by repository on fulfilled', () => {
      const branches = [{ name: 'main' } as any, { name: 'dev' } as any];
      const state = integrationsReducer(
        init(),
        fetchGitHubBranches.fulfilled({ repository: 'o/r', branches }, 'req-1', 'o/r'),
      );
      expect(state.github.branches['o/r']).toBe(branches);
    });
  });
});

/**
 * Thunk-body coverage for integrations-slice.
 *
 * Each thunk's payload creator runs only when dispatched against a real
 * store. We stand up a minimal store + mocked `getApi()` and exercise
 * happy + sad paths so the success/error branches inside each thunk
 * body get measured.
 */

import { configureStore } from '@reduxjs/toolkit';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setApiAdapter } from '../../../shared/api/api-adapter';
import integrationsReducer, {
  checkGitHubConnection,
  connectGitHubPAT,
  startGitHubDeviceFlow,
  disconnectGitHub,
  fetchGitHubRepos,
  fetchGitHubBranches,
} from '../integrations-slice';

interface GhStub {
  isConnected: ReturnType<typeof vi.fn>;
  getUser: ReturnType<typeof vi.fn>;
  connectPAT: ReturnType<typeof vi.fn>;
  startDeviceFlow: ReturnType<typeof vi.fn>;
  pollDeviceFlow: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  listRepos: ReturnType<typeof vi.fn>;
  listBranches: ReturnType<typeof vi.fn>;
}

let gh: GhStub;

function makeStore() {
  return configureStore({
    reducer: { integrations: integrationsReducer },
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
}

beforeEach(() => {
  gh = {
    isConnected: vi.fn(),
    getUser: vi.fn(),
    connectPAT: vi.fn(),
    startDeviceFlow: vi.fn(),
    pollDeviceFlow: vi.fn(),
    disconnect: vi.fn(),
    listRepos: vi.fn(),
    listBranches: vi.fn(),
  };
  setApiAdapter({ github: gh } as any);
});

describe('integrations-slice thunks', () => {
  describe('checkGitHubConnection', () => {
    it('returns the user when connected', async () => {
      gh.isConnected.mockResolvedValue(true);
      gh.getUser.mockResolvedValue({ username: 'octo', avatarUrl: 'http://a' });
      const store = makeStore();
      const action = await store.dispatch(checkGitHubConnection());
      expect(action.type).toBe(checkGitHubConnection.fulfilled.type);
      expect(action.payload).toEqual({ username: 'octo', avatarUrl: 'http://a' });
      expect(store.getState().integrations.integrations.github.status).toBe('connected');
    });

    it('returns null when not connected', async () => {
      gh.isConnected.mockResolvedValue(false);
      const store = makeStore();
      const action = await store.dispatch(checkGitHubConnection());
      expect(action.type).toBe(checkGitHubConnection.fulfilled.type);
      expect(action.payload).toBeNull();
      expect(store.getState().integrations.integrations.github.status).toBe('disconnected');
    });
  });

  describe('connectGitHubPAT', () => {
    it('rejects with the api error message on result.success=false', async () => {
      gh.connectPAT.mockResolvedValue({ success: false, error: 'invalid token' });
      const store = makeStore();
      const action = await store.dispatch(connectGitHubPAT('bad'));
      expect(action.type).toBe(connectGitHubPAT.rejected.type);
      expect(action.payload).toBe('invalid token');
    });

    it('fulfils with the user object on success', async () => {
      gh.connectPAT.mockResolvedValue({ success: true, user: { login: 'octo', avatar_url: 'http://a' } });
      const store = makeStore();
      const action = await store.dispatch(connectGitHubPAT('good'));
      expect(action.type).toBe(connectGitHubPAT.fulfilled.type);
      expect(action.payload).toEqual({ login: 'octo', avatar_url: 'http://a' });
    });

    it('rejects with err.response.data.error when present', async () => {
      gh.connectPAT.mockRejectedValue({ response: { data: { error: 'server-msg' } } });
      const store = makeStore();
      const action = await store.dispatch(connectGitHubPAT('x'));
      expect(action.payload).toBe('server-msg');
    });

    it('rejects with err.message when only message is present', async () => {
      gh.connectPAT.mockRejectedValue(new Error('plain'));
      const store = makeStore();
      const action = await store.dispatch(connectGitHubPAT('x'));
      expect(action.payload).toBe('plain');
    });

    it('rejects with default message when err has neither response.data.error nor message', async () => {
      gh.connectPAT.mockRejectedValue({});
      const store = makeStore();
      const action = await store.dispatch(connectGitHubPAT('x'));
      expect(action.payload).toBe('Failed to connect');
    });
  });

  describe('startGitHubDeviceFlow', () => {
    it('rejects when api throws', async () => {
      gh.startDeviceFlow.mockRejectedValue(new Error('start-err'));
      const store = makeStore();
      const action = await store.dispatch(startGitHubDeviceFlow());
      expect(action.type).toBe(startGitHubDeviceFlow.rejected.type);
      expect(action.payload).toBe('start-err');
    });

    it('rejects when api throws with response.data.error', async () => {
      gh.startDeviceFlow.mockRejectedValue({ response: { data: { error: 'server' } } });
      const store = makeStore();
      const action = await store.dispatch(startGitHubDeviceFlow());
      expect(action.payload).toBe('server');
    });

    it('rejects when api throws with neither message nor response (default fallback)', async () => {
      gh.startDeviceFlow.mockRejectedValue({});
      const store = makeStore();
      const action = await store.dispatch(startGitHubDeviceFlow());
      expect(action.payload).toBe('Device flow failed');
    });

    it('rejects with result.error when result.success is false', async () => {
      gh.startDeviceFlow.mockResolvedValue({ success: false, error: 'denied' });
      const store = makeStore();
      const action = await store.dispatch(startGitHubDeviceFlow());
      expect(action.type).toBe(startGitHubDeviceFlow.rejected.type);
      expect(action.payload).toBe('denied');
    });

    it('on happy path fulfils, dispatches setDeviceFlow, then dispatches the poll thunk (which then resolves successfully)', async () => {
      gh.startDeviceFlow.mockResolvedValue({
        success: true,
        user_code: 'AB-1234',
        verification_uri: 'https://github.com/login/device',
        device_code: 'dev-1',
        interval: 1,
      });
      gh.pollDeviceFlow.mockResolvedValue({ success: true, user: { login: 'octo', avatar_url: 'http://a' } });
      const store = makeStore();
      const action = await store.dispatch(startGitHubDeviceFlow());
      expect(action.type).toBe(startGitHubDeviceFlow.fulfilled.type);
      // Wait for the in-flight poll to settle.
      await new Promise<void>((r) => setTimeout(r, 10));
      const state = store.getState().integrations;
      expect(state.integrations.github.status).toBe('connected');
      expect(state.github.deviceFlow).toBeNull();
    });

    it('poll path rejects with result.error', async () => {
      gh.startDeviceFlow.mockResolvedValue({
        success: true,
        user_code: 'X',
        verification_uri: 'u',
        device_code: 'd',
        interval: 1,
      });
      gh.pollDeviceFlow.mockResolvedValue({ success: false, error: 'access_denied' });
      const store = makeStore();
      await store.dispatch(startGitHubDeviceFlow());
      await new Promise<void>((r) => setTimeout(r, 10));
      const state = store.getState().integrations;
      expect(state.integrations.github.status).toBe('error');
      expect(state.integrations.github.error).toBe('access_denied');
    });

    it('poll path rejects when api throws (neither response.data.error nor message)', async () => {
      gh.startDeviceFlow.mockResolvedValue({
        success: true,
        user_code: 'X',
        verification_uri: 'u',
        device_code: 'd',
        interval: 1,
      });
      gh.pollDeviceFlow.mockRejectedValue({});
      const store = makeStore();
      await store.dispatch(startGitHubDeviceFlow());
      await new Promise<void>((r) => setTimeout(r, 10));
      const state = store.getState().integrations;
      expect(state.integrations.github.error).toBe('Device flow failed');
    });

    it('poll path rejects with err.response.data.error when present', async () => {
      gh.startDeviceFlow.mockResolvedValue({
        success: true,
        user_code: 'X',
        verification_uri: 'u',
        device_code: 'd',
        interval: 1,
      });
      gh.pollDeviceFlow.mockRejectedValue({ response: { data: { error: 'srv' } } });
      const store = makeStore();
      await store.dispatch(startGitHubDeviceFlow());
      await new Promise<void>((r) => setTimeout(r, 10));
      const state = store.getState().integrations;
      expect(state.integrations.github.error).toBe('srv');
    });

    it('poll path rejects with err.message when only message is present', async () => {
      gh.startDeviceFlow.mockResolvedValue({
        success: true,
        user_code: 'X',
        verification_uri: 'u',
        device_code: 'd',
        interval: 1,
      });
      gh.pollDeviceFlow.mockRejectedValue(new Error('socket fail'));
      const store = makeStore();
      await store.dispatch(startGitHubDeviceFlow());
      await new Promise<void>((r) => setTimeout(r, 10));
      const state = store.getState().integrations;
      expect(state.integrations.github.error).toBe('socket fail');
    });
  });

  describe('disconnectGitHub', () => {
    it('fulfils after calling api.github.disconnect', async () => {
      gh.disconnect.mockResolvedValue(undefined);
      const store = makeStore();
      const action = await store.dispatch(disconnectGitHub());
      expect(action.type).toBe(disconnectGitHub.fulfilled.type);
      expect(gh.disconnect).toHaveBeenCalled();
    });
  });

  describe('fetchGitHubRepos', () => {
    it('fulfils with repos on success', async () => {
      gh.listRepos.mockResolvedValue({ success: true, repos: [{ id: 1 }] });
      const store = makeStore();
      const action = await store.dispatch(fetchGitHubRepos(1));
      expect(action.type).toBe(fetchGitHubRepos.fulfilled.type);
      expect(action.payload).toEqual([{ id: 1 }]);
    });

    it('rejects with result.error on success=false', async () => {
      gh.listRepos.mockResolvedValue({ success: false, error: 'rate-limited' });
      const store = makeStore();
      const action = await store.dispatch(fetchGitHubRepos(undefined));
      expect(action.type).toBe(fetchGitHubRepos.rejected.type);
      expect(action.payload).toBe('rate-limited');
    });

    it('rejects with err.response.data.error when api throws with that shape', async () => {
      gh.listRepos.mockRejectedValue({ response: { data: { error: 'srv' } } });
      const store = makeStore();
      const action = await store.dispatch(fetchGitHubRepos(undefined));
      expect(action.payload).toBe('srv');
    });

    it('rejects with err.message when only message is present', async () => {
      gh.listRepos.mockRejectedValue(new Error('net down'));
      const store = makeStore();
      const action = await store.dispatch(fetchGitHubRepos(undefined));
      expect(action.payload).toBe('net down');
    });

    it('rejects with default message when err has neither response.data.error nor message', async () => {
      gh.listRepos.mockRejectedValue({});
      const store = makeStore();
      const action = await store.dispatch(fetchGitHubRepos(undefined));
      expect(action.payload).toBe('Failed to fetch repos');
    });
  });

  describe('fetchGitHubBranches', () => {
    it('rejects when repository missing owner or repo', async () => {
      const store = makeStore();
      const action = await store.dispatch(fetchGitHubBranches('no-slash'));
      expect(action.type).toBe(fetchGitHubBranches.rejected.type);
      expect(action.payload).toBe('Invalid repository format');
    });

    it('fulfils with the api branches', async () => {
      gh.listBranches.mockResolvedValue({ success: true, branches: [{ name: 'main' }] });
      const store = makeStore();
      const action = await store.dispatch(fetchGitHubBranches('o/r'));
      expect(action.type).toBe(fetchGitHubBranches.fulfilled.type);
      expect(action.payload).toEqual({ repository: 'o/r', branches: [{ name: 'main' }] });
    });

    it('rejects with api error on success=false', async () => {
      gh.listBranches.mockResolvedValue({ success: false, error: 'not found' });
      const store = makeStore();
      const action = await store.dispatch(fetchGitHubBranches('o/r'));
      expect(action.type).toBe(fetchGitHubBranches.rejected.type);
      expect(action.payload).toBe('not found');
    });

    it('rejects with err.response.data.error when api throws with that shape', async () => {
      gh.listBranches.mockRejectedValue({ response: { data: { error: 'srv' } } });
      const store = makeStore();
      const action = await store.dispatch(fetchGitHubBranches('o/r'));
      expect(action.payload).toBe('srv');
    });

    it('rejects with err.message when only message is present', async () => {
      gh.listBranches.mockRejectedValue(new Error('boom'));
      const store = makeStore();
      const action = await store.dispatch(fetchGitHubBranches('o/r'));
      expect(action.payload).toBe('boom');
    });

    it('rejects with default message when err has neither response.data.error nor message', async () => {
      gh.listBranches.mockRejectedValue({});
      const store = makeStore();
      const action = await store.dispatch(fetchGitHubBranches('o/r'));
      expect(action.payload).toBe('Failed to fetch branches');
    });
  });
});

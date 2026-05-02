/**
 * Thunk-body coverage for environments-slice.
 *
 * Each thunk wraps `getApi().environments.<method>` in a try/catch +
 * `success`/`error` shape. We mock the api-adapter so each method returns
 * controllable promises (success, business-failure, throw).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

const apiSpy = {
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  compare: vi.fn(),
  promote: vi.fn(),
};

vi.mock('../../../shared/api/api-adapter', () => ({
  getApi: () => ({ environments: apiSpy }),
}));

import environmentsReducer, {
  fetchEnvironments,
  createEnvironment,
  deleteEnvironment,
  renameEnvironment,
  compareEnvironments,
  promoteEnvironment,
} from '../environments-slice';

function makeStore() {
  return configureStore({
    reducer: { environments: environmentsReducer },
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
}

beforeEach(() => {
  for (const fn of Object.values(apiSpy)) fn.mockReset();
});

describe('environments-slice thunks', () => {
  describe('fetchEnvironments', () => {
    it('fulfills when api returns success', async () => {
      apiSpy.list.mockResolvedValue({ success: true, environments: [{ id: 'e-1', type: 'production' }] });
      const store = makeStore();
      const action = await store.dispatch(fetchEnvironments('p-1'));
      expect(action.type).toBe(fetchEnvironments.fulfilled.type);
      expect(store.getState().environments.byProject['p-1']).toHaveLength(1);
    });

    it('rejects with the api-supplied error string when success is false', async () => {
      apiSpy.list.mockResolvedValue({ success: false, error: 'forbidden' });
      const store = makeStore();
      const action = await store.dispatch(fetchEnvironments('p-1'));
      expect(action.type).toBe(fetchEnvironments.rejected.type);
      expect((action as { payload: unknown }).payload).toBe('forbidden');
    });

    it('rejects with the thrown error message when api throws', async () => {
      apiSpy.list.mockRejectedValue(new Error('network down'));
      const store = makeStore();
      const action = await store.dispatch(fetchEnvironments('p-1'));
      expect(action.type).toBe(fetchEnvironments.rejected.type);
      expect((action as { payload: unknown }).payload).toBe('network down');
    });
  });

  describe('createEnvironment', () => {
    it('fulfills with the created environment', async () => {
      apiSpy.create.mockResolvedValue({
        success: true,
        environment: { id: 'env-new', project_id: 'p-1', card_id: 'c-1', name: 'staging', type: 'staging' },
      });
      const store = makeStore();
      const action = await store.dispatch(
        createEnvironment({ projectId: 'p-1', name: 'staging', type: 'staging' }),
      );
      expect(action.type).toBe(createEnvironment.fulfilled.type);
      expect(store.getState().environments.byProject['p-1']).toHaveLength(1);
    });

    it('rejects on success: false', async () => {
      apiSpy.create.mockResolvedValue({ success: false, error: 'name-taken' });
      const store = makeStore();
      const action = await store.dispatch(
        createEnvironment({ projectId: 'p-1', name: 'staging', type: 'staging' }),
      );
      expect(action.type).toBe(createEnvironment.rejected.type);
      expect((action as { payload: unknown }).payload).toBe('name-taken');
    });

    it('rejects when api throws', async () => {
      apiSpy.create.mockRejectedValue(new Error('boom'));
      const store = makeStore();
      const action = await store.dispatch(
        createEnvironment({ projectId: 'p-1', name: 'staging', type: 'staging' }),
      );
      expect(action.type).toBe(createEnvironment.rejected.type);
      expect((action as { payload: unknown }).payload).toBe('boom');
    });
  });

  describe('deleteEnvironment', () => {
    it('fulfills', async () => {
      apiSpy.delete.mockResolvedValue({ success: true });
      const store = makeStore();
      const action = await store.dispatch(deleteEnvironment({ envId: 'env-1', projectId: 'p-1' }));
      expect(action.type).toBe(deleteEnvironment.fulfilled.type);
    });

    it('rejects on success: false', async () => {
      apiSpy.delete.mockResolvedValue({ success: false, error: 'protected' });
      const store = makeStore();
      const action = await store.dispatch(deleteEnvironment({ envId: 'env-1', projectId: 'p-1' }));
      expect(action.type).toBe(deleteEnvironment.rejected.type);
      expect((action as { payload: unknown }).payload).toBe('protected');
    });

    it('rejects when api throws', async () => {
      apiSpy.delete.mockRejectedValue(new Error('kaboom'));
      const store = makeStore();
      const action = await store.dispatch(deleteEnvironment({ envId: 'env-1', projectId: 'p-1' }));
      expect(action.type).toBe(deleteEnvironment.rejected.type);
      expect((action as { payload: unknown }).payload).toBe('kaboom');
    });
  });

  describe('renameEnvironment', () => {
    it('fulfills', async () => {
      apiSpy.update.mockResolvedValue({ success: true });
      const store = makeStore();
      const action = await store.dispatch(
        renameEnvironment({ envId: 'env-1', projectId: 'p-1', name: 'new-name' }),
      );
      expect(action.type).toBe(renameEnvironment.fulfilled.type);
    });

    it('rejects on success: false', async () => {
      apiSpy.update.mockResolvedValue({ success: false, error: 'invalid' });
      const store = makeStore();
      const action = await store.dispatch(
        renameEnvironment({ envId: 'env-1', projectId: 'p-1', name: 'x' }),
      );
      expect(action.type).toBe(renameEnvironment.rejected.type);
      expect((action as { payload: unknown }).payload).toBe('invalid');
    });

    it('rejects when api throws', async () => {
      apiSpy.update.mockRejectedValue(new Error('throw'));
      const store = makeStore();
      const action = await store.dispatch(
        renameEnvironment({ envId: 'env-1', projectId: 'p-1', name: 'x' }),
      );
      expect(action.type).toBe(renameEnvironment.rejected.type);
      expect((action as { payload: unknown }).payload).toBe('throw');
    });
  });

  describe('compareEnvironments', () => {
    it('fulfills with diff', async () => {
      apiSpy.compare.mockResolvedValue({
        success: true,
        diff: { added: [], removed: [], modified: [], unchangedCount: 0 },
      });
      const store = makeStore();
      const action = await store.dispatch(
        compareEnvironments({ sourceEnvId: 'a', targetEnvId: 'b' }),
      );
      expect(action.type).toBe(compareEnvironments.fulfilled.type);
      expect(store.getState().environments.pendingDiff).not.toBeNull();
    });

    it('rejects on success: false', async () => {
      apiSpy.compare.mockResolvedValue({ success: false, error: 'mismatched-projects' });
      const store = makeStore();
      const action = await store.dispatch(
        compareEnvironments({ sourceEnvId: 'a', targetEnvId: 'b' }),
      );
      expect(action.type).toBe(compareEnvironments.rejected.type);
      expect((action as { payload: unknown }).payload).toBe('mismatched-projects');
    });

    it('rejects when api throws', async () => {
      apiSpy.compare.mockRejectedValue(new Error('net'));
      const store = makeStore();
      const action = await store.dispatch(
        compareEnvironments({ sourceEnvId: 'a', targetEnvId: 'b' }),
      );
      expect(action.type).toBe(compareEnvironments.rejected.type);
      expect((action as { payload: unknown }).payload).toBe('net');
    });
  });

  describe('promoteEnvironment', () => {
    it('fulfills', async () => {
      apiSpy.promote.mockResolvedValue({ success: true });
      const store = makeStore();
      const action = await store.dispatch(
        promoteEnvironment({ sourceEnvId: 'a', targetEnvId: 'b' }),
      );
      expect(action.type).toBe(promoteEnvironment.fulfilled.type);
      expect(store.getState().environments.promoting).toBe(false);
    });

    it('rejects on success: false', async () => {
      apiSpy.promote.mockResolvedValue({ success: false, error: 'lockout' });
      const store = makeStore();
      const action = await store.dispatch(
        promoteEnvironment({ sourceEnvId: 'a', targetEnvId: 'b' }),
      );
      expect(action.type).toBe(promoteEnvironment.rejected.type);
      expect((action as { payload: unknown }).payload).toBe('lockout');
    });

    it('rejects when api throws', async () => {
      apiSpy.promote.mockRejectedValue(new Error('explode'));
      const store = makeStore();
      const action = await store.dispatch(
        promoteEnvironment({ sourceEnvId: 'a', targetEnvId: 'b' }),
      );
      expect(action.type).toBe(promoteEnvironment.rejected.type);
      expect((action as { payload: unknown }).payload).toBe('explode');
    });
  });
});

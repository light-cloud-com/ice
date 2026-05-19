/**
 * Thunk-body coverage for pipeline-slice.
 *
 * Each thunk's payload creator runs only when dispatched against a real
 * store. We stand up a minimal store + mocked `getApi()` and exercise
 * happy + sad paths.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import pipelineReducer, {
  fetchRulesForNode,
  createPipelineRule,
  updatePipelineRule,
  deletePipelineRule,
  fetchEventsForNode,
  detectFramework,
  triggerManualDeploy,
} from '../pipeline-slice';
import { setApiAdapter } from '../../../shared/api/api-adapter';

interface PipeStub {
  getRules: ReturnType<typeof vi.fn>;
  createRule: ReturnType<typeof vi.fn>;
  updateRule: ReturnType<typeof vi.fn>;
  deleteRule: ReturnType<typeof vi.fn>;
  getEvents: ReturnType<typeof vi.fn>;
  detectFramework: ReturnType<typeof vi.fn>;
  triggerDeploy: ReturnType<typeof vi.fn>;
}

let pipe: PipeStub;

function makeStore() {
  return configureStore({
    reducer: { pipeline: pipelineReducer },
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
}

beforeEach(() => {
  pipe = {
    getRules: vi.fn(),
    createRule: vi.fn(),
    updateRule: vi.fn(),
    deleteRule: vi.fn(),
    getEvents: vi.fn(),
    detectFramework: vi.fn(),
    triggerDeploy: vi.fn(),
  };
  setApiAdapter({ pipeline: pipe } as any);
});

describe('pipeline-slice thunks', () => {
  describe('fetchRulesForNode', () => {
    it('fulfils with the cardId:nodeId key + rules array on success', async () => {
      pipe.getRules.mockResolvedValue({ success: true, rules: [{ id: 'r-1' }] });
      const store = makeStore();
      const action = await store.dispatch(fetchRulesForNode({ cardId: 'c-1', nodeId: 'n-1' }));
      expect(action.type).toBe(fetchRulesForNode.fulfilled.type);
      expect(action.payload).toEqual({ key: 'c-1:n-1', rules: [{ id: 'r-1' }] });
    });

    it('rejects with the api error on success=false', async () => {
      pipe.getRules.mockResolvedValue({ success: false, error: 'no auth' });
      const store = makeStore();
      const action = await store.dispatch(fetchRulesForNode({ cardId: 'c-1', nodeId: 'n-1' }));
      expect(action.type).toBe(fetchRulesForNode.rejected.type);
      expect(action.payload).toBe('no auth');
    });

    it('rejects with err.message when api throws', async () => {
      pipe.getRules.mockRejectedValue(new Error('net down'));
      const store = makeStore();
      const action = await store.dispatch(fetchRulesForNode({ cardId: 'c-1', nodeId: 'n-1' }));
      expect(action.payload).toBe('net down');
    });
  });

  describe('createPipelineRule', () => {
    it('fulfils with the cardId:nodeId key + new rule on success', async () => {
      pipe.createRule.mockResolvedValue({ success: true, rule: { id: 'new', card_id: 'c-1', node_id: 'n-1' } });
      const store = makeStore();
      const action = await store.dispatch(
        createPipelineRule({ cardId: 'c-1', nodeId: 'n-1', repository: 'o/r' }),
      );
      expect(action.type).toBe(createPipelineRule.fulfilled.type);
      expect(action.payload).toEqual({
        key: 'c-1:n-1',
        rule: { id: 'new', card_id: 'c-1', node_id: 'n-1' },
      });
    });

    it('rejects with api error on success=false', async () => {
      pipe.createRule.mockResolvedValue({ success: false, error: 'duplicate' });
      const store = makeStore();
      const action = await store.dispatch(
        createPipelineRule({ cardId: 'c-1', nodeId: 'n-1', repository: 'o/r' }),
      );
      expect(action.payload).toBe('duplicate');
    });

    it('rejects with err.message when api throws', async () => {
      pipe.createRule.mockRejectedValue(new Error('net'));
      const store = makeStore();
      const action = await store.dispatch(
        createPipelineRule({ cardId: 'c-1', nodeId: 'n-1', repository: 'o/r' }),
      );
      expect(action.payload).toBe('net');
    });
  });

  describe('updatePipelineRule', () => {
    it('fulfils with the api rule on success', async () => {
      pipe.updateRule.mockResolvedValue({ success: true, rule: { id: 'r-1' } });
      const store = makeStore();
      const action = await store.dispatch(updatePipelineRule({ ruleId: 'r-1', updates: {} }));
      expect(action.type).toBe(updatePipelineRule.fulfilled.type);
      expect(action.payload).toEqual({ id: 'r-1' });
    });

    it('rejects with api error on success=false', async () => {
      pipe.updateRule.mockResolvedValue({ success: false, error: 'denied' });
      const store = makeStore();
      const action = await store.dispatch(updatePipelineRule({ ruleId: 'r-1', updates: {} }));
      expect(action.payload).toBe('denied');
    });

    it('rejects with err.message when api throws', async () => {
      pipe.updateRule.mockRejectedValue(new Error('net'));
      const store = makeStore();
      const action = await store.dispatch(updatePipelineRule({ ruleId: 'r-1', updates: {} }));
      expect(action.payload).toBe('net');
    });
  });

  describe('deletePipelineRule', () => {
    it('fulfils with the cardId:nodeId key + ruleId on success', async () => {
      pipe.deleteRule.mockResolvedValue({ success: true });
      const store = makeStore();
      const action = await store.dispatch(deletePipelineRule({ ruleId: 'r-1', cardId: 'c-1', nodeId: 'n-1' }));
      expect(action.payload).toEqual({ key: 'c-1:n-1', ruleId: 'r-1' });
    });

    it('rejects with api error on success=false', async () => {
      pipe.deleteRule.mockResolvedValue({ success: false, error: 'not-found' });
      const store = makeStore();
      const action = await store.dispatch(deletePipelineRule({ ruleId: 'r-1', cardId: 'c-1', nodeId: 'n-1' }));
      expect(action.payload).toBe('not-found');
    });

    it('rejects with err.message when api throws', async () => {
      pipe.deleteRule.mockRejectedValue(new Error('net'));
      const store = makeStore();
      const action = await store.dispatch(deletePipelineRule({ ruleId: 'r-1', cardId: 'c-1', nodeId: 'n-1' }));
      expect(action.payload).toBe('net');
    });
  });

  describe('fetchEventsForNode', () => {
    it('fulfils with the cardId:nodeId key + events on success', async () => {
      pipe.getEvents.mockResolvedValue({ success: true, events: [{ id: 'e-1' }] });
      const store = makeStore();
      const action = await store.dispatch(fetchEventsForNode({ cardId: 'c-1', nodeId: 'n-1' }));
      expect(action.payload).toEqual({ key: 'c-1:n-1', events: [{ id: 'e-1' }] });
    });

    it('rejects with api error on success=false', async () => {
      pipe.getEvents.mockResolvedValue({ success: false, error: 'denied' });
      const store = makeStore();
      const action = await store.dispatch(fetchEventsForNode({ cardId: 'c-1', nodeId: 'n-1' }));
      expect(action.payload).toBe('denied');
    });

    it('rejects with err.message when api throws', async () => {
      pipe.getEvents.mockRejectedValue(new Error('net'));
      const store = makeStore();
      const action = await store.dispatch(fetchEventsForNode({ cardId: 'c-1', nodeId: 'n-1' }));
      expect(action.payload).toBe('net');
    });
  });

  describe('detectFramework', () => {
    it('fulfils with the repository + detection on success', async () => {
      pipe.detectFramework.mockResolvedValue({ success: true, detection: { framework: 'next' } });
      const store = makeStore();
      const action = await store.dispatch(detectFramework({ repository: 'o/r', branch: 'main' }));
      expect(action.payload).toEqual({ repository: 'o/r', detection: { framework: 'next' } });
    });

    it('rejects with api error on success=false', async () => {
      pipe.detectFramework.mockResolvedValue({ success: false, error: 'no-pkg' });
      const store = makeStore();
      const action = await store.dispatch(detectFramework({ repository: 'o/r' }));
      expect(action.payload).toBe('no-pkg');
    });

    it('rejects with err.message when api throws', async () => {
      pipe.detectFramework.mockRejectedValue(new Error('net'));
      const store = makeStore();
      const action = await store.dispatch(detectFramework({ repository: 'o/r' }));
      expect(action.payload).toBe('net');
    });
  });

  describe('triggerManualDeploy', () => {
    it('fulfils with the api event on success', async () => {
      pipe.triggerDeploy.mockResolvedValue({ success: true, event: { id: 'event-1' } });
      const store = makeStore();
      const action = await store.dispatch(triggerManualDeploy({ ruleId: 'r-1', branch: 'main' }));
      expect(action.payload).toEqual({ id: 'event-1' });
    });

    it('rejects with api error on success=false', async () => {
      pipe.triggerDeploy.mockResolvedValue({ success: false, error: 'busy' });
      const store = makeStore();
      const action = await store.dispatch(triggerManualDeploy({ ruleId: 'r-1' }));
      expect(action.payload).toBe('busy');
    });

    it('rejects with err.message when api throws', async () => {
      pipe.triggerDeploy.mockRejectedValue(new Error('net'));
      const store = makeStore();
      const action = await store.dispatch(triggerManualDeploy({ ruleId: 'r-1' }));
      expect(action.payload).toBe('net');
    });
  });
});

/**
 * Reducer + extraReducer tests for pipeline-slice.
 *
 * Covers the in-slice reducers (panel open/close, status updates, clear)
 * and every thunk's pending/fulfilled/rejected matcher by dispatching
 * the auto-generated action types directly.
 */

import { describe, it, expect } from 'vitest';
import pipelineReducer, {
  openPipelinePanel,
  closePipelinePanel,
  receivePipelineUpdate,
  receiveCardPipelineUpdate,
  clearNodeStatus,
  fetchRulesForNode,
  createPipelineRule,
  updatePipelineRule,
  deletePipelineRule,
  fetchEventsForNode,
  detectFramework,
  type PipelineState,
  type DeploymentRule,
  type DeploymentEvent,
  type FrameworkDetection,
  type DeployStep,
} from '../pipeline-slice';

function init(): PipelineState {
  return pipelineReducer(undefined, { type: '@@INIT' });
}

function rule(overrides: Partial<DeploymentRule> = {}): DeploymentRule {
  return {
    id: 'rule-1',
    card_id: 'card-1',
    node_id: 'node-1',
    repository: 'o/r',
    trigger_type: 'push',
    branch_pattern: 'main',
    environment: 'prod',
    build_command: null,
    install_command: null,
    output_dir: null,
    framework: null,
    enabled: true,
    webhook_id: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function event(overrides: Partial<DeploymentEvent> = {}): DeploymentEvent {
  return {
    id: 'event-1',
    rule_id: 'rule-1',
    trigger: 'push',
    commit_sha: 'abc',
    commit_message: null,
    commit_author: null,
    branch: 'main',
    status: 'success',
    deployment_stage: null,
    deployment_logs: [],
    deployed_url: null,
    started_at: '2026-01-01T00:00:00Z',
    completed_at: null,
    duration_seconds: null,
    error: null,
    ...overrides,
  };
}

describe('pipeline-slice', () => {
  it('seeds the initial state', () => {
    const s = init();
    expect(s.nodeStatus).toEqual({});
    expect(s.activePanelNodeId).toBeNull();
    expect(s.activePanelCardId).toBeNull();
    expect(s.isPanelOpen).toBe(false);
    expect(s.rules).toEqual({});
    expect(s.history).toEqual({});
    expect(s.activeLogs).toEqual([]);
    expect(s.detectedFrameworks).toEqual({});
    expect(s.rulesLoading).toBe(false);
    expect(s.historyLoading).toBe(false);
    expect(s.detectingFramework).toBe(false);
  });

  describe('panel open/close', () => {
    it('openPipelinePanel sets active ids, opens, and resets activeLogs', () => {
      // Seed activeLogs by opening the panel for a node and pushing a
      // pipeline update that targets it.
      let s = pipelineReducer(init(), openPipelinePanel({ nodeId: 'n-pre', cardId: 'c-pre' }));
      s = pipelineReducer(
        s,
        receivePipelineUpdate({
          nodeId: 'n-pre',
          cardId: 'c-pre',
          status: 'building',
          deployment_logs: [{ step: 'old', status: 'completed', message: 'x', timestamp: 't' } as DeployStep],
        }),
      );
      expect(s.activeLogs.length).toBeGreaterThan(0);
      // Now opening for a different node clears the logs.
      s = pipelineReducer(s, openPipelinePanel({ nodeId: 'n-1', cardId: 'c-1' }));
      expect(s.isPanelOpen).toBe(true);
      expect(s.activePanelNodeId).toBe('n-1');
      expect(s.activePanelCardId).toBe('c-1');
      expect(s.activeLogs).toEqual([]);
    });

    it('closePipelinePanel resets ids and logs', () => {
      let s = pipelineReducer(init(), openPipelinePanel({ nodeId: 'n-1', cardId: 'c-1' }));
      s = pipelineReducer(s, closePipelinePanel());
      expect(s.isPanelOpen).toBe(false);
      expect(s.activePanelNodeId).toBeNull();
      expect(s.activePanelCardId).toBeNull();
      expect(s.activeLogs).toEqual([]);
    });
  });

  describe('receivePipelineUpdate', () => {
    it('writes a full status entry with all optional fields', () => {
      const s = pipelineReducer(
        init(),
        receivePipelineUpdate({
          nodeId: 'n-1',
          cardId: 'c-1',
          status: 'building',
          deployment_stage: 'install',
          deployment_logs: [{ step: 's1', status: 'started', message: 'go', timestamp: 't' }],
          commit_sha: 'sha-1',
          commit_message: 'msg',
          commit_author: 'a',
          branch: 'main',
          progress: 25,
          error: 'oops',
          started_at: 't0',
          duration_seconds: 12,
        }),
      );
      expect(s.nodeStatus['n-1']).toEqual({
        status: 'building',
        stage: 'install',
        commitSha: 'sha-1',
        commitMessage: 'msg',
        commitAuthor: 'a',
        branch: 'main',
        progress: 25,
        startedAt: 't0',
        durationSeconds: 12,
        error: 'oops',
      });
    });

    it('coerces falsy stage / error / commitMessage to undefined', () => {
      const s = pipelineReducer(
        init(),
        receivePipelineUpdate({
          nodeId: 'n-2',
          cardId: 'c-1',
          status: 'idle',
          deployment_stage: '',
          commit_message: '',
          error: '',
          duration_seconds: 0,
        }),
      );
      const st = s.nodeStatus['n-2']!;
      expect(st.stage).toBeUndefined();
      expect(st.commitMessage).toBeUndefined();
      expect(st.error).toBeUndefined();
      expect(st.durationSeconds).toBeUndefined();
    });

    it('writes activeLogs only when the panel is open for that node', () => {
      let s = init();
      // Panel closed → activeLogs stays empty even when logs are present.
      s = pipelineReducer(
        s,
        receivePipelineUpdate({
          nodeId: 'n-1',
          cardId: 'c-1',
          status: 'building',
          deployment_logs: [{ step: 's', status: 'started', message: 'x', timestamp: 't' }],
        }),
      );
      expect(s.activeLogs).toEqual([]);
      // Open panel for n-1 then publish — activeLogs picks up.
      s = pipelineReducer(s, openPipelinePanel({ nodeId: 'n-1', cardId: 'c-1' }));
      s = pipelineReducer(
        s,
        receivePipelineUpdate({
          nodeId: 'n-1',
          cardId: 'c-1',
          status: 'building',
          deployment_logs: [{ step: 's', status: 'started', message: 'go', timestamp: 't' }],
        }),
      );
      expect(s.activeLogs).toHaveLength(1);
    });

    it('does not overwrite activeLogs when an update arrives for a different node', () => {
      let s = pipelineReducer(init(), openPipelinePanel({ nodeId: 'n-1', cardId: 'c-1' }));
      s = pipelineReducer(
        s,
        receivePipelineUpdate({
          nodeId: 'n-2',
          cardId: 'c-1',
          status: 'building',
          deployment_logs: [{ step: 's', status: 'started', message: 'go', timestamp: 't' }],
        }),
      );
      expect(s.activeLogs).toEqual([]);
    });
  });

  describe('receiveCardPipelineUpdate', () => {
    it('merges into existing status without losing prior fields', () => {
      let s = pipelineReducer(
        init(),
        receivePipelineUpdate({
          nodeId: 'n-1',
          cardId: 'c-1',
          status: 'idle',
          deployment_stage: 'init',
          commit_sha: 'first',
          commit_message: 'first-msg',
          progress: 5,
        }),
      );
      s = pipelineReducer(
        s,
        receiveCardPipelineUpdate({
          nodeId: 'n-1',
          status: 'building',
          // stage omitted → preserved
          // commit_sha empty → preserved
          progress: 50,
        }),
      );
      expect(s.nodeStatus['n-1']).toMatchObject({
        status: 'building',
        stage: 'init',
        commitSha: 'first',
        commitMessage: 'first-msg',
        progress: 50,
      });
    });

    it('seeds an idle entry for an unknown node', () => {
      const s = pipelineReducer(
        init(),
        receiveCardPipelineUpdate({ nodeId: 'fresh', status: 'queued' }),
      );
      expect(s.nodeStatus['fresh'].status).toBe('queued');
    });

    it('preserves prior progress when the new update omits it (?? operator)', () => {
      let s = pipelineReducer(
        init(),
        receiveCardPipelineUpdate({ nodeId: 'n-1', status: 'idle', progress: 80 }),
      );
      s = pipelineReducer(
        s,
        receiveCardPipelineUpdate({ nodeId: 'n-1', status: 'building' }),
      );
      expect(s.nodeStatus['n-1'].progress).toBe(80);
    });
  });

  describe('clearNodeStatus', () => {
    it('removes the entry for a node', () => {
      let s = pipelineReducer(
        init(),
        receiveCardPipelineUpdate({ nodeId: 'n-1', status: 'idle' }),
      );
      expect(s.nodeStatus['n-1']).toBeDefined();
      s = pipelineReducer(s, clearNodeStatus('n-1'));
      expect(s.nodeStatus['n-1']).toBeUndefined();
    });
  });

  describe('fetchRulesForNode extraReducer', () => {
    it('flips loading on pending', () => {
      const s = pipelineReducer(init(), fetchRulesForNode.pending('req-1', { cardId: 'c', nodeId: 'n' }));
      expect(s.rulesLoading).toBe(true);
    });

    it('writes rules under the cardId:nodeId key on fulfilled', () => {
      const r = rule();
      const s = pipelineReducer(
        init(),
        fetchRulesForNode.fulfilled({ key: 'c-1:n-1', rules: [r] }, 'req-1', { cardId: 'c-1', nodeId: 'n-1' }),
      );
      expect(s.rulesLoading).toBe(false);
      expect(s.rules['c-1:n-1']).toEqual([r]);
    });

    it('seeds an empty array on rejected so loadedOnce can flip true', () => {
      const s = pipelineReducer(
        init(),
        fetchRulesForNode.rejected(null, 'req-1', { cardId: 'c-1', nodeId: 'n-1' }, 'boom'),
      );
      expect(s.rulesLoading).toBe(false);
      expect(s.rules['c-1:n-1']).toEqual([]);
    });

    it('does not overwrite an existing key with [] on rejected', () => {
      const r = rule({ id: 'pre-existing' });
      let s = pipelineReducer(
        init(),
        fetchRulesForNode.fulfilled({ key: 'c-1:n-1', rules: [r] }, 'req-1', { cardId: 'c-1', nodeId: 'n-1' }),
      );
      s = pipelineReducer(
        s,
        fetchRulesForNode.rejected(null, 'req-2', { cardId: 'c-1', nodeId: 'n-1' }, 'fail'),
      );
      expect(s.rules['c-1:n-1']).toEqual([r]);
    });

    it('skips writing on rejected when meta arg is missing cardId/nodeId', () => {
      const before = init();
      // Synthesize a rejected action with meta that doesn't carry the
      // arg shape. The slice's rejected handler must not crash.
      const s = pipelineReducer(before, {
        type: fetchRulesForNode.rejected.type,
        payload: 'err',
        error: { message: 'err' },
        meta: { arg: {}, requestId: 'r', requestStatus: 'rejected', aborted: false, condition: false },
      } as any);
      expect(s.rules).toEqual({});
      expect(s.rulesLoading).toBe(false);
    });
  });

  describe('createPipelineRule extraReducer', () => {
    it('appends a new rule under the key', () => {
      const r = rule();
      const s = pipelineReducer(
        init(),
        createPipelineRule.fulfilled({ key: 'c-1:n-1', rule: r }, 'req-1', {
          cardId: 'c-1',
          nodeId: 'n-1',
          repository: 'o/r',
        }),
      );
      expect(s.rules['c-1:n-1']).toEqual([r]);
    });

    it('initialises a missing array bucket when the key is new', () => {
      const r = rule();
      const s = pipelineReducer(
        init(),
        createPipelineRule.fulfilled({ key: 'fresh:key', rule: r }, 'req-1', {
          cardId: 'fresh',
          nodeId: 'key',
          repository: 'o/r',
        }),
      );
      expect(s.rules['fresh:key']).toHaveLength(1);
    });

    it('replaces an existing rule by id (idempotent re-create)', () => {
      const r1 = rule({ branch_pattern: 'main' });
      const r1updated = rule({ branch_pattern: 'develop' });
      let s = pipelineReducer(
        init(),
        createPipelineRule.fulfilled({ key: 'c-1:n-1', rule: r1 }, 'req-1', {
          cardId: 'c-1',
          nodeId: 'n-1',
          repository: 'o/r',
        }),
      );
      s = pipelineReducer(
        s,
        createPipelineRule.fulfilled({ key: 'c-1:n-1', rule: r1updated }, 'req-2', {
          cardId: 'c-1',
          nodeId: 'n-1',
          repository: 'o/r',
        }),
      );
      expect(s.rules['c-1:n-1']).toHaveLength(1);
      expect(s.rules['c-1:n-1'][0].branch_pattern).toBe('develop');
    });
  });

  describe('updatePipelineRule extraReducer', () => {
    it('replaces the matching rule by id when the key exists (key derived from rule.card_id:rule.node_id)', () => {
      const r = rule({ id: 'r-1', card_id: 'c-1', node_id: 'n-1', branch_pattern: 'main' });
      let s = pipelineReducer(
        init(),
        fetchRulesForNode.fulfilled({ key: 'c-1:n-1', rules: [r] }, 'req-1', { cardId: 'c-1', nodeId: 'n-1' }),
      );
      const updated = rule({ id: 'r-1', card_id: 'c-1', node_id: 'n-1', branch_pattern: 'develop' });
      s = pipelineReducer(s, updatePipelineRule.fulfilled(updated, 'req-2', { ruleId: 'r-1', updates: {} }));
      expect(s.rules['c-1:n-1'][0].branch_pattern).toBe('develop');
    });

    it('is a no-op when the key has not been seeded', () => {
      const updated = rule({ id: 'r-99', card_id: 'cc', node_id: 'nn' });
      const s = pipelineReducer(init(), updatePipelineRule.fulfilled(updated, 'req-1', { ruleId: 'r-99', updates: {} }));
      expect(s.rules).toEqual({});
    });

    it('leaves sibling rules untouched when updating one of many', () => {
      const r1 = rule({ id: 'r-1', card_id: 'c-1', node_id: 'n-1', branch_pattern: 'main' });
      const r2 = rule({ id: 'r-2', card_id: 'c-1', node_id: 'n-1', branch_pattern: 'develop' });
      let s = pipelineReducer(
        init(),
        fetchRulesForNode.fulfilled({ key: 'c-1:n-1', rules: [r1, r2] }, 'req-1', { cardId: 'c-1', nodeId: 'n-1' }),
      );
      const updated = rule({ id: 'r-1', card_id: 'c-1', node_id: 'n-1', branch_pattern: 'release' });
      s = pipelineReducer(s, updatePipelineRule.fulfilled(updated, 'req-2', { ruleId: 'r-1', updates: {} }));
      expect(s.rules['c-1:n-1']).toHaveLength(2);
      expect(s.rules['c-1:n-1'].find((r) => r.id === 'r-1')!.branch_pattern).toBe('release');
      expect(s.rules['c-1:n-1'].find((r) => r.id === 'r-2')!.branch_pattern).toBe('develop');
    });
  });

  describe('deletePipelineRule extraReducer', () => {
    it('drops the rule by id when the key exists', () => {
      const r1 = rule({ id: 'r-1' });
      const r2 = rule({ id: 'r-2' });
      let s = pipelineReducer(
        init(),
        fetchRulesForNode.fulfilled({ key: 'c-1:n-1', rules: [r1, r2] }, 'req-1', {
          cardId: 'c-1',
          nodeId: 'n-1',
        }),
      );
      s = pipelineReducer(
        s,
        deletePipelineRule.fulfilled({ key: 'c-1:n-1', ruleId: 'r-1' }, 'req-2', {
          ruleId: 'r-1',
          cardId: 'c-1',
          nodeId: 'n-1',
        }),
      );
      expect(s.rules['c-1:n-1']).toEqual([r2]);
    });

    it('is a no-op when the key has not been seeded', () => {
      const s = pipelineReducer(
        init(),
        deletePipelineRule.fulfilled({ key: 'unknown:key', ruleId: 'r-1' }, 'req-1', {
          ruleId: 'r-1',
          cardId: 'unknown',
          nodeId: 'key',
        }),
      );
      expect(s.rules).toEqual({});
    });
  });

  describe('fetchEventsForNode extraReducer', () => {
    it('flips historyLoading on pending', () => {
      const s = pipelineReducer(init(), fetchEventsForNode.pending('req-1', { cardId: 'c-1', nodeId: 'n-1' }));
      expect(s.historyLoading).toBe(true);
    });

    it('writes events under the key on fulfilled', () => {
      const e = event();
      const s = pipelineReducer(
        init(),
        fetchEventsForNode.fulfilled({ key: 'c-1:n-1', events: [e] }, 'req-1', { cardId: 'c-1', nodeId: 'n-1' }),
      );
      expect(s.historyLoading).toBe(false);
      expect(s.history['c-1:n-1']).toEqual([e]);
    });

    it('clears historyLoading on rejected', () => {
      let s = pipelineReducer(init(), fetchEventsForNode.pending('req-1', { cardId: 'c-1', nodeId: 'n-1' }));
      s = pipelineReducer(s, fetchEventsForNode.rejected(null, 'req-1', { cardId: 'c-1', nodeId: 'n-1' }, 'err'));
      expect(s.historyLoading).toBe(false);
    });
  });

  describe('detectFramework extraReducer', () => {
    const detection: FrameworkDetection = {
      framework: 'next',
      runtime: 'node',
      buildCommand: 'next build',
      installCommand: 'npm i',
      outputDirectory: '.next',
      packageManager: 'npm',
      confidence: 'high',
      detectedFiles: ['package.json'],
    };

    it('flips detectingFramework on pending', () => {
      const s = pipelineReducer(init(), detectFramework.pending('req-1', { repository: 'o/r' }));
      expect(s.detectingFramework).toBe(true);
    });

    it('caches detection by repository on fulfilled', () => {
      const s = pipelineReducer(
        init(),
        detectFramework.fulfilled({ repository: 'o/r', detection }, 'req-1', { repository: 'o/r' }),
      );
      expect(s.detectingFramework).toBe(false);
      expect(s.detectedFrameworks['o/r']).toEqual(detection);
    });

    it('clears detectingFramework on rejected', () => {
      let s = pipelineReducer(init(), detectFramework.pending('req-1', { repository: 'o/r' }));
      s = pipelineReducer(s, detectFramework.rejected(null, 'req-1', { repository: 'o/r' }, 'err'));
      expect(s.detectingFramework).toBe(false);
    });
  });
});

/**
 * LT-5 reducer tests for logs-slice.
 *
 * Covers the source→status mapping (one case per SourceResolution
 * variant), the 200-entry cap, and the insertId dedupe path. Hook
 * tests need a real socket harness and live in LT-7 / LT-9.
 */

import { describe, it, expect } from 'vitest';
import logsReducer, {
  appendEntry,
  setError,
  setSource,
  setStatus,
  setSubscription,
  teardown,
  type LogEntry,
  type LogsState,
  type SourceResolution,
} from '../logs-slice';

const TID = 'log-node-1';

function entry(insertId: string, overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    ts: '2026-04-27T12:00:00.000Z',
    level: 'info',
    message: 'hello',
    resource: { type: 'cloud_run_revision', labels: {} },
    insertId,
    ...overrides,
  };
}

function init(): LogsState {
  return logsReducer(undefined, { type: '@@INIT' });
}

describe('logs-slice', () => {
  describe('source → status mapping', () => {
    const cases: Array<[SourceResolution['state'], SourceResolution, string]> = [
      ['resolved', { state: 'resolved', sourceNodeId: 'n1', iceType: 'Compute.Container' }, 'streaming'],
      ['pre-deploy', { state: 'pre-deploy', sourceNodeId: 'n1', iceType: 'Compute.Container' }, 'pre-deploy'],
      ['ambiguous', { state: 'ambiguous', candidates: [] }, 'ambiguous'],
      [
        'unsupported-source',
        { state: 'unsupported-source', sourceNodeId: 'n1', iceType: 'Network.LoadBalancer' },
        'unsupported',
      ],
      ['permission-denied', { state: 'permission-denied', message: 'denied' }, 'permission-denied'],
      ['none', { state: 'none' }, 'no-source'],
    ];

    for (const [name, source, expectedStatus] of cases) {
      it(`maps ${name} → ${expectedStatus}`, () => {
        let state = init();
        state = logsReducer(state, setSource({ terminalNodeId: TID, source }));
        expect(state.byTerminalNodeId[TID]?.status).toBe(expectedStatus);
        expect(state.byTerminalNodeId[TID]?.source).toEqual(source);
      });
    }

    it('permission-denied populates lastError with the message', () => {
      let state = init();
      state = logsReducer(
        state,
        setSource({ terminalNodeId: TID, source: { state: 'permission-denied', message: 'roles/logging.viewer required' } }),
      );
      expect(state.byTerminalNodeId[TID]?.lastError).toBe('roles/logging.viewer required');
    });

    it('clears stale lastError when transitioning to resolved', () => {
      let state = init();
      state = logsReducer(state, setError({ terminalNodeId: TID, message: 'old error' }));
      state = logsReducer(
        state,
        setSource({
          terminalNodeId: TID,
          source: { state: 'resolved', sourceNodeId: 'n1', iceType: 'Compute.Container' },
        }),
      );
      expect(state.byTerminalNodeId[TID]?.lastError).toBeNull();
      expect(state.byTerminalNodeId[TID]?.status).toBe('streaming');
    });
  });

  describe('appendEntry — 200-entry cap', () => {
    it('caps at 200 and drops oldest first', () => {
      let state = init();
      state = logsReducer(state, setSubscription({ terminalNodeId: TID, subscriptionId: 'sub-1', mode: 'polling' }));
      for (let i = 0; i < 250; i++) {
        state = logsReducer(state, appendEntry({ terminalNodeId: TID, entry: entry(`id-${i}`, { message: `msg-${i}` }) }));
      }
      const entries = state.byTerminalNodeId[TID]!.entries;
      expect(entries.length).toBe(200);
      // Oldest dropped: ids 0..49 should be gone, ids 50..249 kept.
      expect(entries[0].insertId).toBe('id-50');
      expect(entries[entries.length - 1].insertId).toBe('id-249');
    });
  });

  describe('appendEntry — dedupe by insertId', () => {
    it('drops a duplicate insertId within the tail window', () => {
      let state = init();
      state = logsReducer(state, setSubscription({ terminalNodeId: TID, subscriptionId: 'sub-1', mode: 'polling' }));
      state = logsReducer(state, appendEntry({ terminalNodeId: TID, entry: entry('dup-1') }));
      state = logsReducer(state, appendEntry({ terminalNodeId: TID, entry: entry('dup-1', { message: 'second' }) }));
      const entries = state.byTerminalNodeId[TID]!.entries;
      expect(entries.length).toBe(1);
      expect(entries[0].message).toBe('hello');
    });
  });

  describe('teardown', () => {
    it('removes the slot entirely', () => {
      let state = init();
      state = logsReducer(state, setStatus({ terminalNodeId: TID, status: 'connecting' }));
      expect(state.byTerminalNodeId[TID]).toBeDefined();
      state = logsReducer(state, teardown({ terminalNodeId: TID }));
      expect(state.byTerminalNodeId[TID]).toBeUndefined();
    });
  });
});

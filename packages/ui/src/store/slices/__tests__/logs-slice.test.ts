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
  resumed,
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
    // `resolved` maps to `connecting`, NOT `streaming`. The promotion to
    // `streaming` happens on the first `appendEntry` (see the "appendEntry
    // promotes connecting → streaming" suite below). This avoids a brief
    // green-then-red flicker when the IAM probe / first poll fails.
    const cases: Array<[SourceResolution['state'], SourceResolution, string]> = [
      ['resolved', { state: 'resolved', sourceNodeId: 'n1', iceType: 'Compute.Container' }, 'connecting'],
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
        setSource({
          terminalNodeId: TID,
          source: { state: 'permission-denied', message: 'roles/logging.viewer required' },
        }),
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
      // Resolved sets status to `connecting`; the first entry promotes to
      // `streaming` (covered in the next describe block).
      expect(state.byTerminalNodeId[TID]?.status).toBe('connecting');
    });
  });

  describe('appendEntry — connecting → streaming promotion', () => {
    it('promotes status from connecting to streaming on the first entry, and stays streaming on subsequent entries', () => {
      let state = init();
      state = logsReducer(
        state,
        setSource({
          terminalNodeId: TID,
          source: { state: 'resolved', sourceNodeId: 'n1', iceType: 'Compute.Container' },
        }),
      );
      expect(state.byTerminalNodeId[TID]?.status).toBe('connecting');

      state = logsReducer(state, appendEntry({ terminalNodeId: TID, entry: entry('e-1') }));
      expect(state.byTerminalNodeId[TID]?.status).toBe('streaming');

      state = logsReducer(state, appendEntry({ terminalNodeId: TID, entry: entry('e-2') }));
      expect(state.byTerminalNodeId[TID]?.status).toBe('streaming');
    });
  });

  describe('appendEntry — 200-entry cap', () => {
    it('caps at 200 and drops oldest first', () => {
      let state = init();
      state = logsReducer(state, setSubscription({ terminalNodeId: TID, subscriptionId: 'sub-1', mode: 'polling' }));
      for (let i = 0; i < 250; i++) {
        state = logsReducer(
          state,
          appendEntry({ terminalNodeId: TID, entry: entry(`id-${i}`, { message: `msg-${i}` }) }),
        );
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

  describe('resumed — gated promotion to streaming', () => {
    // The `resumed` reducer mirrors `appendEntry`'s precondition: only
    // promote the slot to `'streaming'` when there's evidence the stream
    // was previously live. The backend `logs:resumed` event also fires
    // after a tail-reconnect retry — without the gate it would force a
    // pre-deploy block to "Live" via a side channel.
    // See learning `ux-log-resumed-event-overrides-pre-deploy`.

    it('does not promote a connecting slot with no entries', () => {
      let state = init();
      state = logsReducer(state, setStatus({ terminalNodeId: TID, status: 'connecting' }));
      // No setSource → slot.source is null. resumed must NOT flip status.
      state = logsReducer(state, resumed({ terminalNodeId: TID }));
      expect(state.byTerminalNodeId[TID]?.status).toBe('connecting');
    });

    it('does not promote a pre-deploy slot even after a transient error', () => {
      let state = init();
      state = logsReducer(
        state,
        setSource({
          terminalNodeId: TID,
          source: { state: 'pre-deploy', sourceNodeId: 'n1', iceType: 'Compute.Container' },
        }),
      );
      state = logsReducer(state, setError({ terminalNodeId: TID, message: 'tail error' }));
      // No entries ever flowed; resumed must keep status as `'error'`.
      state = logsReducer(state, resumed({ terminalNodeId: TID }));
      expect(state.byTerminalNodeId[TID]?.status).toBe('error');
      expect(state.byTerminalNodeId[TID]?.entries.length).toBe(0);
    });

    it('keeps a streaming slot streaming on a no-op resumed', () => {
      let state = init();
      state = logsReducer(
        state,
        setSource({
          terminalNodeId: TID,
          source: { state: 'resolved', sourceNodeId: 'n1', iceType: 'Compute.Container' },
        }),
      );
      state = logsReducer(state, appendEntry({ terminalNodeId: TID, entry: entry('e-1') }));
      expect(state.byTerminalNodeId[TID]?.status).toBe('streaming');
      state = logsReducer(state, resumed({ terminalNodeId: TID }));
      expect(state.byTerminalNodeId[TID]?.status).toBe('streaming');
    });

    it('flips an error slot back to streaming when entries already flowed and source resolved', () => {
      let state = init();
      state = logsReducer(
        state,
        setSource({
          terminalNodeId: TID,
          source: { state: 'resolved', sourceNodeId: 'n1', iceType: 'Compute.Container' },
        }),
      );
      // Entry flowed → promotion to streaming.
      state = logsReducer(state, appendEntry({ terminalNodeId: TID, entry: entry('e-1') }));
      expect(state.byTerminalNodeId[TID]?.status).toBe('streaming');
      // Transient error mid-stream.
      state = logsReducer(state, setError({ terminalNodeId: TID, message: 'transient drop' }));
      expect(state.byTerminalNodeId[TID]?.status).toBe('error');
      expect(state.byTerminalNodeId[TID]?.lastError).toBe('transient drop');
      // resumed → recovery is legitimate; flip back to streaming and clear the error.
      state = logsReducer(state, resumed({ terminalNodeId: TID }));
      expect(state.byTerminalNodeId[TID]?.status).toBe('streaming');
      expect(state.byTerminalNodeId[TID]?.lastError).toBeNull();
    });

    it('no-ops on a missing slot', () => {
      const state = init();
      const next = logsReducer(state, resumed({ terminalNodeId: 'never-existed' }));
      expect(next.byTerminalNodeId['never-existed']).toBeUndefined();
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

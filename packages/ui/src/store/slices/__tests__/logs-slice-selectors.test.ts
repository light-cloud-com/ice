/**
 * Selector tests for logs-slice — fills the coverage gap on
 * selectLogStream / selectLogEntries / selectLogStatus, which the
 * main logs-slice.test.ts intentionally doesn't touch.
 */

import { describe, it, expect } from 'vitest';
import logsReducer, {
  appendEntry,
  setError,
  setSource,
  selectLogStream,
  selectLogEntries,
  selectLogStatus,
  type LogEntry,
} from '../logs-slice';

function makeRoot() {
  let state = logsReducer(undefined, { type: '@@INIT' });
  state = logsReducer(
    state,
    setSource({
      terminalNodeId: 't-1',
      source: { state: 'resolved', sourceNodeId: 'n1', iceType: 'Compute.Container' },
    }),
  );
  const e: LogEntry = {
    ts: 'now',
    level: 'info',
    message: 'hi',
    resource: { type: 'cloud_run_revision', labels: {} },
    insertId: 'a',
  };
  state = logsReducer(state, appendEntry({ terminalNodeId: 't-1', entry: e }));
  return { logs: state };
}

describe('selectLogStream', () => {
  it('returns the stream slot when the terminal id exists', () => {
    const root = makeRoot();
    const slot = selectLogStream(root, 't-1');
    expect(slot).toBeDefined();
    expect(slot?.status).toBe('streaming');
  });

  it('returns undefined for an unknown terminal id', () => {
    const root = makeRoot();
    expect(selectLogStream(root, 'unknown')).toBeUndefined();
  });
});

describe('selectLogEntries', () => {
  it('returns the entries array when the terminal exists', () => {
    const root = makeRoot();
    expect(selectLogEntries(root, 't-1')).toHaveLength(1);
  });

  it('returns the shared EMPTY_ENTRIES sentinel for an unknown id', () => {
    const root = makeRoot();
    const a = selectLogEntries(root, 'missing');
    const b = selectLogEntries(root, 'also-missing');
    // Same referential object → cheap re-render skip in connected components.
    expect(a).toEqual([]);
    expect(a).toBe(b);
  });
});

describe('selectLogStatus', () => {
  it('returns the slot status when the terminal exists', () => {
    const root = makeRoot();
    expect(selectLogStatus(root, 't-1')).toBe('streaming');
  });

  it('returns "idle" for an unknown terminal id', () => {
    const root = makeRoot();
    expect(selectLogStatus(root, 'missing')).toBe('idle');
  });

  it('returns "error" after setError', () => {
    let state = logsReducer(undefined, { type: '@@INIT' });
    state = logsReducer(state, setError({ terminalNodeId: 't-1', message: 'boom' }));
    expect(selectLogStatus({ logs: state }, 't-1')).toBe('error');
  });
});

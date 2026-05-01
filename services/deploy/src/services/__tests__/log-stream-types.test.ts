/**
 * Sanity tests for log-stream type/constant exports.
 *
 * These pin: (a) the constants are exported with the expected values
 * (the rest of the rf-lstream series imports them by name; a typo in
 * one place is caught here) and (b) the discriminant values of the
 * `SourceResolution` union are stable — every consumer that switches
 * on `state` would silently break if a literal flipped.
 */

import { describe, it, expect } from 'vitest';

import type {
  ActiveStream,
  LogEntry,
  SourceResolution,
  StreamingMode,
  SubscribeArgs,
  SubscribeResult,
  SubscriberRef,
} from '../log-stream/types.js';
import {
  IDLE_TEARDOWN_MS,
  MAX_CONSECUTIVE_ERRORS_POLLING,
  POLL_INTERVAL_MS,
  POLL_PAGE_SIZE,
  RECONNECT_BASE_MS,
  RECONNECT_MAX_MS,
  SEEN_INSERT_ID_CAP,
} from '../log-stream/types.js';

describe('log-stream/types — constants', () => {
  it('exports the polling + reconnect tuning numbers as documented', () => {
    expect(POLL_INTERVAL_MS).toBe(2000);
    expect(POLL_PAGE_SIZE).toBe(100);
    expect(IDLE_TEARDOWN_MS).toBe(60_000);
    expect(RECONNECT_BASE_MS).toBe(1500);
    expect(RECONNECT_MAX_MS).toBe(30_000);
    expect(MAX_CONSECUTIVE_ERRORS_POLLING).toBe(3);
    expect(SEEN_INSERT_ID_CAP).toBe(500);
  });
});

describe('log-stream/types — types compile-time fixtures', () => {
  it('SubscribeArgs accepts the canonical shape', () => {
    const args: SubscribeArgs = {
      cardId: 'c',
      environmentId: 'e',
      terminalNodeId: 't',
      mode: 'polling',
      organisationId: 'o',
      candidateSources: [{ nodeId: 'n', iceType: 'Compute.Container', label: 'l' }],
    };
    expect(args.mode).toBe('polling');
  });

  it('SourceResolution discriminants are the documented strings', () => {
    const states: SourceResolution['state'][] = [
      'resolved',
      'pre-deploy',
      'ambiguous',
      'unsupported-source',
      'permission-denied',
      'none',
    ];
    expect(states).toHaveLength(6);
  });

  it('LogEntry levels match the documented union', () => {
    const e: LogEntry = {
      ts: '2026-04-30T00:00:00.000Z',
      level: 'info',
      message: '',
      resource: { type: '', labels: {} },
      insertId: 'i',
    };
    expect(e.level).toBe('info');
  });

  it('StreamingMode is "polling" | "tail"', () => {
    const a: StreamingMode = 'polling';
    const b: StreamingMode = 'tail';
    expect([a, b]).toEqual(['polling', 'tail']);
  });

  it('ActiveStream + SubscriberRef + SubscribeResult shapes are constructable', () => {
    const ref: SubscriberRef = {
      subscriptionId: 's',
      args: {
        cardId: 'c',
        environmentId: 'e',
        terminalNodeId: 't',
        mode: 'polling',
        organisationId: 'o',
      },
    };
    const stream: ActiveStream = {
      terminalNodeId: 't',
      mode: 'polling',
      filter: '',
      projectId: '',
      resolution: { state: 'none' },
      subscribers: new Map([[ref.subscriptionId, ref]]),
      seenInsertIds: new Set(),
      insertIdOrder: [],
      consecutiveErrors: 0,
      stopped: false,
      loggingClient: null,
    };
    const result: SubscribeResult = {
      subscriptionId: 's',
      resolution: { state: 'none' },
    };
    expect(stream.subscribers.size).toBe(1);
    expect(result.resolution.state).toBe('none');
  });
});

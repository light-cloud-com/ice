/**
 * Unit tests for `services/deploy/src/services/deploy-event-dispatcher.ts` —
 * the typed wire dispatcher + persistent event-log mirror extracted in
 * rf-deploy-9 from the deploy.service.ts orchestrator.
 *
 * Per the `deploy-service-tests-must-import-vitest-explicitly` learning,
 * vitest globals are imported explicitly so the deploy package's
 * typecheck pass stays green.
 *
 * Per `vi-spyon-accumulates-across-it-blocks-without-explicit-reset`,
 * console spies are torn down via `vi.restoreAllMocks()` in `afterEach`
 * — re-spying alone in `beforeEach` would carry call counts across `it`
 * blocks and break `toHaveBeenCalledTimes(N)` assertions.
 *
 * The pure formatter helpers (`describeEventForLog`, `mapStatusToOverlay`)
 * are NOT mocked — they're already covered by rf-deploy-1's tests and
 * the dispatcher's contract leans on the real overlay-mapping behavior
 * for the destroy-snapshot mirror assertion.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DeployEvent } from '@ice/types';

vi.mock('@ice/shared', () => ({
  emitDeployNodeStatus: vi.fn(),
  emitDeployNodeProgress: vi.fn(),
  emitDeployLog: vi.fn(),
  emitDeployComplete: vi.fn(),
  emitDeployRequirementVerified: vi.fn(),
}));

vi.mock('../deploy-event-log', () => ({
  nextDeploySeq: vi.fn(),
  recordDeployEvent: vi.fn(),
}));

vi.mock('../deploy-locks', () => ({
  updateDeploySnapshotNode: vi.fn(),
}));

// @ts-ignore — resolved at runtime via pnpm workspace; mocked above
import * as iceShared from '@ice/shared';
import { emitDeployEvent, emitLog, emitDestroyNodeStatus } from '../deploy-event-dispatcher';
import * as deployEventLog from '../deploy-event-log';
import * as deployLocks from '../deploy-locks';

const emitDeployNodeStatusMock = (iceShared as any).emitDeployNodeStatus as ReturnType<typeof vi.fn>;
const emitDeployNodeProgressMock = (iceShared as any).emitDeployNodeProgress as ReturnType<typeof vi.fn>;
const emitDeployLogMock = (iceShared as any).emitDeployLog as ReturnType<typeof vi.fn>;
const emitDeployCompleteMock = (iceShared as any).emitDeployComplete as ReturnType<typeof vi.fn>;
const emitDeployRequirementVerifiedMock = (iceShared as any).emitDeployRequirementVerified as ReturnType<typeof vi.fn>;
const nextDeploySeqMock = (deployEventLog as any).nextDeploySeq as ReturnType<typeof vi.fn>;
const recordDeployEventMock = (deployEventLog as any).recordDeployEvent as ReturnType<typeof vi.fn>;
const updateDeploySnapshotNodeMock = (deployLocks as any).updateDeploySnapshotNode as ReturnType<typeof vi.fn>;

describe('deploy-event-dispatcher', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Default: nextDeploySeq returns a known number so individual tests
    // don't have to wire the seq plumbing themselves.
    nextDeploySeqMock.mockReturnValue(42);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('emitDeployEvent', () => {
    it('allocates seq from nextDeploySeq and mutates event.seq in place', () => {
      const event: DeployEvent = {
        type: 'log',
        card_id: 'card-1',
        level: 'info',
        message: 'hello',
        at: '2026-04-29T00:00:00.000Z',
        seq: 0,
      };
      nextDeploySeqMock.mockReturnValue(7);

      emitDeployEvent('card-1', event);

      expect(nextDeploySeqMock).toHaveBeenCalledTimes(1);
      expect(nextDeploySeqMock).toHaveBeenCalledWith('card-1');
      expect(event.seq).toBe(7);
    });

    it('falls back to Date.now() when nextDeploySeq returns null', () => {
      const event: DeployEvent = {
        type: 'log',
        card_id: 'card-fallback',
        level: 'info',
        message: 'orphan',
        at: '2026-04-29T00:00:00.000Z',
        seq: 0,
      };
      nextDeploySeqMock.mockReturnValue(null);
      const before = Date.now();

      emitDeployEvent('card-fallback', event);

      const after = Date.now();
      expect(event.seq).toBeGreaterThanOrEqual(before);
      expect(event.seq).toBeLessThanOrEqual(after);
    });

    it('routes a node_status event to emitDeployNodeStatus', () => {
      const event: DeployEvent = {
        type: 'node_status',
        card_id: 'card-1',
        node_id: 'n1',
        resource_name: 'web',
        resource_type: 'cloudrun',
        action: 'create',
        status: 'queued',
        at: '2026-04-29T00:00:00.000Z',
        seq: 0,
      };

      emitDeployEvent('card-1', event);

      expect(emitDeployNodeStatusMock).toHaveBeenCalledTimes(1);
      expect(emitDeployNodeStatusMock).toHaveBeenCalledWith('card-1', event);
      expect(emitDeployNodeProgressMock).not.toHaveBeenCalled();
      expect(emitDeployLogMock).not.toHaveBeenCalled();
      expect(emitDeployCompleteMock).not.toHaveBeenCalled();
      expect(emitDeployRequirementVerifiedMock).not.toHaveBeenCalled();
    });

    it('routes a node_progress event to emitDeployNodeProgress', () => {
      const event: DeployEvent = {
        type: 'node_progress',
        card_id: 'card-1',
        node_id: 'n1',
        resource_name: 'web',
        step: { label: 'creating', index: 1, total: 3 },
        at: '2026-04-29T00:00:00.000Z',
        seq: 0,
      };

      emitDeployEvent('card-1', event);

      expect(emitDeployNodeProgressMock).toHaveBeenCalledTimes(1);
      expect(emitDeployNodeProgressMock).toHaveBeenCalledWith('card-1', event);
      expect(emitDeployNodeStatusMock).not.toHaveBeenCalled();
    });

    it('routes a log event to emitDeployLog', () => {
      const event: DeployEvent = {
        type: 'log',
        card_id: 'card-1',
        level: 'info',
        message: 'starting',
        at: '2026-04-29T00:00:00.000Z',
        seq: 0,
      };

      emitDeployEvent('card-1', event);

      expect(emitDeployLogMock).toHaveBeenCalledTimes(1);
      expect(emitDeployLogMock).toHaveBeenCalledWith('card-1', event);
      expect(emitDeployNodeStatusMock).not.toHaveBeenCalled();
    });

    it('routes a complete event to emitDeployComplete', () => {
      const event: DeployEvent = {
        type: 'complete',
        card_id: 'card-1',
        outcome: 'success',
        totals: {
          queued: 0,
          applying: 0,
          succeeded: 3,
          failed: 0,
          skipped: 0,
          cancelled: 0,
        },
        at: '2026-04-29T00:00:00.000Z',
        seq: 0,
      };

      emitDeployEvent('card-1', event);

      expect(emitDeployCompleteMock).toHaveBeenCalledTimes(1);
      expect(emitDeployCompleteMock).toHaveBeenCalledWith('card-1', event);
    });

    it('routes a requirement_verified event to emitDeployRequirementVerified', () => {
      const event: DeployEvent = {
        type: 'requirement_verified',
        card_id: 'card-1',
        node_id: 'n1',
        environment: 'staging',
        requirement: 'managed-cert-issuance',
        status: 'satisfied',
        at: '2026-04-29T00:00:00.000Z',
        seq: 0,
      };

      emitDeployEvent('card-1', event);

      expect(emitDeployRequirementVerifiedMock).toHaveBeenCalledTimes(1);
      expect(emitDeployRequirementVerifiedMock).toHaveBeenCalledWith('card-1', event);
    });

    it('records a row to the event log via recordDeployEvent', () => {
      const event: DeployEvent = {
        type: 'log',
        card_id: 'card-2',
        level: 'info',
        message: 'log line',
        at: '2026-04-29T00:00:00.000Z',
        seq: 0,
      };
      nextDeploySeqMock.mockReturnValue(99);

      emitDeployEvent('card-2', event);

      expect(recordDeployEventMock).toHaveBeenCalledTimes(1);
      expect(recordDeployEventMock).toHaveBeenCalledWith('card-2', 99, 'log', event);
    });

    it('catches wire-emit failure and console.warns without breaking the log mirror', () => {
      const event: DeployEvent = {
        type: 'node_status',
        card_id: 'card-1',
        node_id: 'n1',
        resource_name: 'web',
        resource_type: 'cloudrun',
        action: 'create',
        status: 'queued',
        at: '2026-04-29T00:00:00.000Z',
        seq: 0,
      };
      emitDeployNodeStatusMock.mockImplementationOnce(() => {
        throw new Error('socket gone');
      });

      // Must not throw — wire failures never break the live emit.
      expect(() => emitDeployEvent('card-1', event)).not.toThrow();

      expect(warnSpy).toHaveBeenCalledWith('[deploy] wire emit failed: socket gone');
      // Log mirror still runs even though the wire blew up.
      expect(recordDeployEventMock).toHaveBeenCalledTimes(1);
    });

    it('catches recordDeployEvent failure and console.warns without throwing', () => {
      const event: DeployEvent = {
        type: 'log',
        card_id: 'card-1',
        level: 'info',
        message: 'persistent failure',
        at: '2026-04-29T00:00:00.000Z',
        seq: 0,
      };
      recordDeployEventMock.mockImplementationOnce(() => {
        throw new Error('db down');
      });

      expect(() => emitDeployEvent('card-1', event)).not.toThrow();

      expect(warnSpy).toHaveBeenCalledWith('[deploy] recordDeployEvent failed: db down');
      // Wire still emits even though the log-mirror blew up.
      expect(emitDeployLogMock).toHaveBeenCalledTimes(1);
    });

    it('console.logs once per emit with the expected text shape', () => {
      const event: DeployEvent = {
        type: 'node_status',
        card_id: 'card-z',
        node_id: 'n2',
        resource_name: 'api',
        resource_type: 'cloudrun',
        action: 'create',
        status: 'applying',
        at: '2026-04-29T00:00:00.000Z',
        seq: 0,
      };
      nextDeploySeqMock.mockReturnValue(11);

      emitDeployEvent('card-z', event);

      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith('[deploy] emit cardId=card-z type=node_status seq=11 detail=api → applying');
    });
  });

  describe('emitLog', () => {
    it('builds a log event with default level "info" and forwards to the dispatcher', () => {
      emitLog('card-1', 'hello world');

      expect(emitDeployLogMock).toHaveBeenCalledTimes(1);
      const [forwardedCardId, forwardedEvent] = emitDeployLogMock.mock.calls[0] as [string, any];
      expect(forwardedCardId).toBe('card-1');
      expect(forwardedEvent).toMatchObject({
        type: 'log',
        card_id: 'card-1',
        level: 'info',
        message: 'hello world',
      });
    });

    it('honors a custom level argument', () => {
      emitLog('card-1', 'something exploded', 'error');

      expect(emitDeployLogMock).toHaveBeenCalledTimes(1);
      const [, forwardedEvent] = emitDeployLogMock.mock.calls[0] as [string, any];
      expect(forwardedEvent.level).toBe('error');
      expect(forwardedEvent.message).toBe('something exploded');
    });

    it('sets `at` to a fresh ISO timestamp parseable as a Date close to now', () => {
      const before = Date.now();
      emitLog('card-1', 'check timestamp');
      const after = Date.now();

      const [, forwardedEvent] = emitDeployLogMock.mock.calls[0] as [string, any];
      const parsed = Date.parse(forwardedEvent.at);
      expect(Number.isNaN(parsed)).toBe(false);
      expect(parsed).toBeGreaterThanOrEqual(before);
      expect(parsed).toBeLessThanOrEqual(after);
    });

    it('routes through emitDeployEvent so seq is allocated', () => {
      nextDeploySeqMock.mockReturnValue(123);

      emitLog('card-1', 'seq check');

      expect(nextDeploySeqMock).toHaveBeenCalledWith('card-1');
      const [, forwardedEvent] = emitDeployLogMock.mock.calls[0] as [string, any];
      expect(forwardedEvent.seq).toBe(123);
      expect(recordDeployEventMock).toHaveBeenCalledWith('card-1', 123, 'log', forwardedEvent);
    });
  });

  describe('emitDestroyNodeStatus', () => {
    it('builds a node_status event with action: "delete" and forwards through the wire', () => {
      emitDestroyNodeStatus('card-1', {
        canvasNodeId: 'canvas-7',
        resourceName: 'old-bucket',
        resourceType: 'storage_bucket',
        status: 'applying',
      });

      expect(emitDeployNodeStatusMock).toHaveBeenCalledTimes(1);
      const [forwardedCardId, forwardedEvent] = emitDeployNodeStatusMock.mock.calls[0] as [string, any];
      expect(forwardedCardId).toBe('card-1');
      expect(forwardedEvent).toMatchObject({
        type: 'node_status',
        card_id: 'card-1',
        node_id: 'canvas-7',
        resource_name: 'old-bucket',
        resource_type: 'storage_bucket',
        action: 'delete',
        status: 'applying',
      });
    });

    it('passes through optional error and duration_ms fields', () => {
      const errorPayload = { code: 'EPERM', message: 'forbidden', recoverable: false };
      emitDestroyNodeStatus('card-1', {
        canvasNodeId: 'canvas-7',
        resourceName: 'old-bucket',
        resourceType: 'storage_bucket',
        status: 'failed',
        error: errorPayload,
        duration_ms: 1234,
      });

      const [, forwardedEvent] = emitDeployNodeStatusMock.mock.calls[0] as [string, any];
      expect(forwardedEvent.error).toEqual(errorPayload);
      expect(forwardedEvent.duration_ms).toBe(1234);
    });

    it('mirrors the overlay status into updateDeploySnapshotNode for each terminal status', () => {
      const cases: Array<['queued' | 'applying' | 'succeeded' | 'failed', string]> = [
        ['queued', 'queued'],
        ['applying', 'deploying'],
        ['succeeded', 'active'],
        ['failed', 'error'],
      ];

      for (const [wireStatus, overlayStatus] of cases) {
        updateDeploySnapshotNodeMock.mockClear();
        emitDestroyNodeStatus('card-1', {
          canvasNodeId: 'canvas-7',
          resourceName: 'old-bucket',
          resourceType: 'storage_bucket',
          status: wireStatus,
        });

        expect(updateDeploySnapshotNodeMock).toHaveBeenCalledTimes(1);
        expect(updateDeploySnapshotNodeMock).toHaveBeenCalledWith('card-1', 'canvas-7', overlayStatus);
      }
    });

    it('forwards through the dispatcher so seq is allocated and the log mirror records', () => {
      nextDeploySeqMock.mockReturnValue(55);

      emitDestroyNodeStatus('card-1', {
        canvasNodeId: 'canvas-7',
        resourceName: 'old-bucket',
        resourceType: 'storage_bucket',
        status: 'succeeded',
      });

      expect(nextDeploySeqMock).toHaveBeenCalledWith('card-1');
      const [, forwardedEvent] = emitDeployNodeStatusMock.mock.calls[0] as [string, any];
      expect(forwardedEvent.seq).toBe(55);
      expect(recordDeployEventMock).toHaveBeenCalledWith('card-1', 55, 'node_status', forwardedEvent);
    });
  });
});

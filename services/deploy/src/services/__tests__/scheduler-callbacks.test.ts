/**
 * Unit tests for `services/deploy/src/services/scheduler-callbacks.ts` —
 * the factory that builds the `on_node_status` / `on_node_progress` /
 * `on_log` / `on_resource_result` callback quartet for the parallel
 * scheduler. Extracted from the apply path + auto-cleanup retry in
 * deploy.service.ts (rf-deploy-12).
 *
 * Per the `vi-spyon-accumulates-across-it-blocks-without-explicit-reset`
 * learning, console spies are torn down via `vi.restoreAllMocks()` in
 * `afterEach` — re-spying alone in `beforeEach` would carry call counts
 * across `it` blocks and break `toHaveBeenCalledTimes(N)` assertions.
 *
 * The pure formatter helper (`mapStatusToOverlay`) is NOT mocked — it's
 * already covered by rf-deploy-1's tests and the contract here leans on
 * the real overlay-mapping behavior.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NodeStatusEvent, NodeProgressEvent } from '@ice/core';

vi.mock('../deploy-event-dispatcher', () => ({
  emitDeployEvent: vi.fn(),
  emitLog: vi.fn(),
}));

vi.mock('../deploy-locks', () => ({
  updateDeploySnapshotNode: vi.fn(),
}));

import { makeSchedulerCallbacks } from '../scheduler-callbacks';
import * as dispatcher from '../deploy-event-dispatcher';
import * as deployLocks from '../deploy-locks';

const emitDeployEventMock = (dispatcher as any).emitDeployEvent as ReturnType<typeof vi.fn>;
const emitLogMock = (dispatcher as any).emitLog as ReturnType<typeof vi.fn>;
const updateDeploySnapshotNodeMock = (deployLocks as any).updateDeploySnapshotNode as ReturnType<typeof vi.fn>;

function makeStatusEvent(overrides: Partial<NodeStatusEvent> = {}): NodeStatusEvent {
  return {
    node_id: 'gcp.run.service:web',
    resource_name: 'ice-web-abc',
    resource_type: 'gcp.run.service',
    action: 'create',
    status: 'queued',
    at: '2026-04-29T00:00:00.000Z',
    ...overrides,
  };
}

function makeProgressEvent(overrides: Partial<NodeProgressEvent> = {}): NodeProgressEvent {
  return {
    node_id: 'gcp.run.service:web',
    resource_name: 'ice-web-abc',
    step: { label: 'building', index: 1, total: 3 },
    at: '2026-04-29T00:00:00.000Z',
    ...overrides,
  };
}

describe('scheduler-callbacks', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('on_node_status', () => {
    it('translates graph node id to canvas id and emits node_status', () => {
      const map = new Map([['gcp.run.service:web', 'canvas-1']]);
      const callbacks = makeSchedulerCallbacks({ cardId: 'card-A', graphIdToCanvasId: map });

      callbacks.on_node_status(
        makeStatusEvent({
          node_id: 'gcp.run.service:web',
          resource_name: 'ice-web-abc',
          resource_type: 'gcp.run.service',
          action: 'create',
          status: 'applying',
          at: '2026-04-29T01:02:03.000Z',
        }),
      );

      expect(emitDeployEventMock).toHaveBeenCalledTimes(1);
      expect(emitDeployEventMock).toHaveBeenCalledWith('card-A', {
        type: 'node_status',
        card_id: 'card-A',
        node_id: 'canvas-1',
        resource_name: 'ice-web-abc',
        resource_type: 'gcp.run.service',
        action: 'create',
        status: 'applying',
        error: undefined,
        duration_ms: undefined,
        at: '2026-04-29T01:02:03.000Z',
        seq: 0,
      });
      // mapStatusToOverlay('applying') → 'deploying'
      expect(updateDeploySnapshotNodeMock).toHaveBeenCalledWith('card-A', 'canvas-1', 'deploying');
    });

    it('warns and drops emit when canvas id is missing and warnOnMiss is true (default)', () => {
      const map = new Map<string, string>();
      const callbacks = makeSchedulerCallbacks({ cardId: 'card-A', graphIdToCanvasId: map });

      callbacks.on_node_status(
        makeStatusEvent({ node_id: 'gcp.run.service:missing', resource_name: 'ice-x' }),
      );

      expect(warnSpy).toHaveBeenCalledTimes(1);
      const warnArg = String(warnSpy.mock.calls[0][0]);
      expect(warnArg).toContain('[deploy] on_node_status: no canvas id for graph_node_id=gcp.run.service:missing');
      expect(warnArg).toContain('(resource_name=ice-x)');
      expect(warnArg).toContain('Dropping wire emit.');
      expect(emitDeployEventMock).not.toHaveBeenCalled();
      expect(updateDeploySnapshotNodeMock).not.toHaveBeenCalled();
    });

    it('stays silent on canvas-id miss when warnOnMiss is false (retry path)', () => {
      const map = new Map<string, string>();
      const callbacks = makeSchedulerCallbacks({
        cardId: 'card-A',
        graphIdToCanvasId: map,
        warnOnMiss: false,
      });

      callbacks.on_node_status(makeStatusEvent({ node_id: 'gcp.run.service:gone' }));

      expect(warnSpy).not.toHaveBeenCalled();
      expect(emitDeployEventMock).not.toHaveBeenCalled();
      expect(updateDeploySnapshotNodeMock).not.toHaveBeenCalled();
    });

    it('bumps completed.count on terminal succeeded when totals is provided', () => {
      const map = new Map([['gcp.run.service:web', 'canvas-1']]);
      const completed = { count: 0 };
      const callbacks = makeSchedulerCallbacks({
        cardId: 'card-A',
        graphIdToCanvasId: map,
        totals: { total: 4, completed },
        warnOnMiss: true,
      });

      callbacks.on_node_status(
        makeStatusEvent({ status: 'succeeded', resource_name: 'ice-web-abc' }),
      );

      expect(completed.count).toBe(1);
      // Per-node mirror still happens.
      expect(updateDeploySnapshotNodeMock).toHaveBeenCalledWith('card-A', 'canvas-1', 'active');
    });

    it('does not bump completed.count on applying status', () => {
      const map = new Map([['gcp.run.service:web', 'canvas-1']]);
      const completed = { count: 0 };
      const callbacks = makeSchedulerCallbacks({
        cardId: 'card-A',
        graphIdToCanvasId: map,
        totals: { total: 2, completed },
      });

      callbacks.on_node_status(
        makeStatusEvent({ status: 'applying', resource_name: 'ice-applying' }),
      );

      expect(completed.count).toBe(0);
      // Per-node mirror still happens.
      expect(updateDeploySnapshotNodeMock).toHaveBeenCalledWith('card-A', 'canvas-1', 'deploying');
    });

    it('does not bump completed.count when totals is undefined (retry path)', () => {
      const map = new Map([['gcp.run.service:web', 'canvas-1']]);
      const callbacks = makeSchedulerCallbacks({
        cardId: 'card-A',
        graphIdToCanvasId: map,
        warnOnMiss: false,
        // No totals — retry path
      });

      callbacks.on_node_status(makeStatusEvent({ status: 'succeeded' }));

      // Per-node mirror still happens.
      expect(updateDeploySnapshotNodeMock).toHaveBeenCalledWith('card-A', 'canvas-1', 'active');
    });

    it('bumps completed.count for all four terminal statuses', () => {
      const map = new Map([['gcp.run.service:web', 'canvas-1']]);
      const completed = { count: 0 };
      const callbacks = makeSchedulerCallbacks({
        cardId: 'card-A',
        graphIdToCanvasId: map,
        totals: { total: 10, completed },
      });

      callbacks.on_node_status(makeStatusEvent({ status: 'succeeded' }));
      callbacks.on_node_status(makeStatusEvent({ status: 'failed' }));
      callbacks.on_node_status(makeStatusEvent({ status: 'skipped' }));
      callbacks.on_node_status(makeStatusEvent({ status: 'cancelled-due-to-dep' }));

      expect(completed.count).toBe(4);
    });

    it('does not bump completed.count for non-terminal statuses (queued, applying)', () => {
      const map = new Map([['gcp.run.service:web', 'canvas-1']]);
      const completed = { count: 0 };
      const callbacks = makeSchedulerCallbacks({
        cardId: 'card-A',
        graphIdToCanvasId: map,
        totals: { total: 4, completed },
      });

      callbacks.on_node_status(makeStatusEvent({ status: 'queued' }));
      callbacks.on_node_status(makeStatusEvent({ status: 'applying' }));

      expect(completed.count).toBe(0);
    });

    it('forwards error and duration_ms in the wire event when present', () => {
      const map = new Map([['gcp.run.service:web', 'canvas-1']]);
      const callbacks = makeSchedulerCallbacks({ cardId: 'card-A', graphIdToCanvasId: map });

      callbacks.on_node_status(
        makeStatusEvent({
          status: 'failed',
          error: { code: 'BOOM', message: 'oops', recoverable: false },
          duration_ms: 1234,
        }),
      );

      expect(emitDeployEventMock).toHaveBeenCalledWith(
        'card-A',
        expect.objectContaining({
          status: 'failed',
          error: { code: 'BOOM', message: 'oops', recoverable: false },
          duration_ms: 1234,
        }),
      );
    });
  });

  describe('on_node_progress', () => {
    it('translates node id, emits node_progress, and mirrors step to snapshot', () => {
      const map = new Map([['gcp.run.service:web', 'canvas-1']]);
      const callbacks = makeSchedulerCallbacks({ cardId: 'card-A', graphIdToCanvasId: map });

      callbacks.on_node_progress(
        makeProgressEvent({
          step: { label: 'pushing image', index: 2, total: 5 },
          at: '2026-04-29T02:00:00.000Z',
        }),
      );

      expect(emitDeployEventMock).toHaveBeenCalledTimes(1);
      expect(emitDeployEventMock).toHaveBeenCalledWith('card-A', {
        type: 'node_progress',
        card_id: 'card-A',
        node_id: 'canvas-1',
        resource_name: 'ice-web-abc',
        step: { label: 'pushing image', index: 2, total: 5 },
        at: '2026-04-29T02:00:00.000Z',
        seq: 0,
      });
      expect(updateDeploySnapshotNodeMock).toHaveBeenCalledWith('card-A', 'canvas-1', 'deploying', {
        label: 'pushing image',
        index: 2,
        total: 5,
      });
    });

    it('silently early-returns on canvas-id miss regardless of warnOnMiss (apply path)', () => {
      const map = new Map<string, string>();
      const callbacks = makeSchedulerCallbacks({
        cardId: 'card-A',
        graphIdToCanvasId: map,
        warnOnMiss: true, // even with primary's settings, progress stays silent
      });

      callbacks.on_node_progress(makeProgressEvent({ node_id: 'gcp.run.service:gone' }));

      expect(warnSpy).not.toHaveBeenCalled();
      expect(emitDeployEventMock).not.toHaveBeenCalled();
      expect(updateDeploySnapshotNodeMock).not.toHaveBeenCalled();
    });

    it('silently early-returns on canvas-id miss with warnOnMiss false (retry path)', () => {
      const map = new Map<string, string>();
      const callbacks = makeSchedulerCallbacks({
        cardId: 'card-A',
        graphIdToCanvasId: map,
        warnOnMiss: false,
      });

      callbacks.on_node_progress(makeProgressEvent({ node_id: 'gcp.run.service:gone' }));

      expect(warnSpy).not.toHaveBeenCalled();
      expect(emitDeployEventMock).not.toHaveBeenCalled();
      expect(updateDeploySnapshotNodeMock).not.toHaveBeenCalled();
    });
  });

  describe('on_log', () => {
    it('forwards the message to emitLog with the bound cardId', () => {
      const callbacks = makeSchedulerCallbacks({
        cardId: 'card-Z',
        graphIdToCanvasId: new Map(),
      });

      callbacks.on_log('hello world');

      expect(emitLogMock).toHaveBeenCalledTimes(1);
      expect(emitLogMock).toHaveBeenCalledWith('card-Z', 'hello world');
    });
  });

  describe('on_resource_result', () => {
    let callbacks: ReturnType<typeof makeSchedulerCallbacks>;

    beforeEach(() => {
      callbacks = makeSchedulerCallbacks({
        cardId: 'card-A',
        graphIdToCanvasId: new Map(),
      });
    });

    it('skips when success is false', () => {
      callbacks.on_resource_result({
        success: false,
        name: 'web',
        outputs: { url: 'https://example.com' },
      });
      expect(emitLogMock).not.toHaveBeenCalled();
    });

    it('skips when outputs is missing', () => {
      callbacks.on_resource_result({ success: true, name: 'web' });
      expect(emitLogMock).not.toHaveBeenCalled();
    });

    it('skips when outputs is empty (no recognizable URL/domain/IP)', () => {
      callbacks.on_resource_result({ success: true, name: 'web', outputs: {} });
      expect(emitLogMock).not.toHaveBeenCalled();
    });

    it('prefers custom_domain_url over url over default_url over endpoint', () => {
      callbacks.on_resource_result({
        success: true,
        name: 'web',
        outputs: {
          custom_domain_url: 'https://custom.example.com',
          url: 'https://run.example.com',
          default_url: 'https://default.example.com',
          endpoint: 'https://endpoint.example.com',
        },
      });
      expect(emitLogMock).toHaveBeenCalledWith('card-A', 'Deployed web → https://custom.example.com');
    });

    it('falls back from url to default_url when url is missing', () => {
      callbacks.on_resource_result({
        success: true,
        name: 'web',
        outputs: {
          default_url: 'https://default.example.com',
          endpoint: 'https://endpoint.example.com',
        },
      });
      expect(emitLogMock).toHaveBeenCalledWith('card-A', 'Deployed web → https://default.example.com');
    });

    it('falls back to endpoint when no url variant present', () => {
      callbacks.on_resource_result({
        success: true,
        name: 'svc',
        outputs: { endpoint: 'https://endpoint.example.com' },
      });
      expect(emitLogMock).toHaveBeenCalledWith('card-A', 'Deployed svc → https://endpoint.example.com');
    });

    it('prepends https:// to a domain when no URL variant present', () => {
      callbacks.on_resource_result({
        success: true,
        name: 'web',
        outputs: { domain: 'mydomain.example' },
      });
      expect(emitLogMock).toHaveBeenCalledWith('card-A', 'Deployed web → https://mydomain.example');
    });

    it('prepends http:// to ip_address when no URL or domain present', () => {
      callbacks.on_resource_result({
        success: true,
        name: 'svc',
        outputs: { ip_address: '203.0.113.10' },
      });
      expect(emitLogMock).toHaveBeenCalledWith('card-A', 'Deployed svc → http://203.0.113.10');
    });

    it('also accepts IPAddress as the IP fallback key', () => {
      callbacks.on_resource_result({
        success: true,
        name: 'svc',
        outputs: { IPAddress: '198.51.100.5' },
      });
      expect(emitLogMock).toHaveBeenCalledWith('card-A', 'Deployed svc → http://198.51.100.5');
    });

    it('does not emit when url is empty/whitespace-only', () => {
      callbacks.on_resource_result({
        success: true,
        name: 'svc',
        outputs: { url: '   ' },
      });
      expect(emitLogMock).not.toHaveBeenCalled();
    });

    it('does not emit when domain is whitespace-only', () => {
      callbacks.on_resource_result({
        success: true,
        name: 'svc',
        outputs: { domain: '   ' },
      });
      expect(emitLogMock).not.toHaveBeenCalled();
    });

    it('does not emit when ip is whitespace-only', () => {
      callbacks.on_resource_result({
        success: true,
        name: 'svc',
        outputs: { ip_address: '   ' },
      });
      expect(emitLogMock).not.toHaveBeenCalled();
    });

    it('trims surrounding whitespace from a URL', () => {
      callbacks.on_resource_result({
        success: true,
        name: 'web',
        outputs: { url: '  https://trim.example.com  ' },
      });
      expect(emitLogMock).toHaveBeenCalledWith('card-A', 'Deployed web → https://trim.example.com');
    });

    it('trims whitespace from a domain', () => {
      callbacks.on_resource_result({
        success: true,
        name: 'web',
        outputs: { domain: '  trimdomain.example  ' },
      });
      expect(emitLogMock).toHaveBeenCalledWith('card-A', 'Deployed web → https://trimdomain.example');
    });

    it('trims whitespace from an IP', () => {
      callbacks.on_resource_result({
        success: true,
        name: 'svc',
        outputs: { ip_address: '  203.0.113.10  ' },
      });
      expect(emitLogMock).toHaveBeenCalledWith('card-A', 'Deployed svc → http://203.0.113.10');
    });

    it('handles null resourceResult without throwing', () => {
      expect(() => callbacks.on_resource_result(null)).not.toThrow();
      expect(emitLogMock).not.toHaveBeenCalled();
    });

    it('handles undefined resourceResult without throwing', () => {
      expect(() => callbacks.on_resource_result(undefined)).not.toThrow();
      expect(emitLogMock).not.toHaveBeenCalled();
    });
  });
});

/**
 * pdl-7 — `applyDeployEvent` is the route-by-discriminator function used
 * by both the live socket listener and the deploy-tape replay loop.
 * Centralising this means replay reproduces live state byte-for-byte.
 *
 * Tests assert that for each `event.type`:
 *   - the right slice action(s) are dispatched
 *   - the canvas overlay (`updateCardNodeData`) is dispatched with the
 *     right `deploy_status` / `deploy_progress` / `deploy_error` fields
 *   - the requirement_verified branch only mirrors managed-cert state
 */

import { describe, it, expect, vi } from 'vitest';
import type {
  DeployCompleteEvent,
  DeployLogEvent,
  DeployNodeProgressEvent,
  DeployNodeStatusEvent,
  DeployRequirementVerifiedEvent,
} from '@ice/types';
import { applyDeployEvent, mapWireStatusToOverlay, overlayToWireStatus } from '../use-deploy-subscription';

const CARD = 'card-1';
const N1 = 'node-1';

type DispatchedAction = { type: string; payload?: any };

function makeDispatch(): { dispatch: (action: any) => any; calls: DispatchedAction[] } {
  const calls: DispatchedAction[] = [];
  const dispatch = vi.fn((action: any) => {
    calls.push(action);
    return action;
  });
  return { dispatch: dispatch as any, calls };
}

function findActions(calls: DispatchedAction[], typeSuffix: string): DispatchedAction[] {
  return calls.filter((a) => a.type === typeSuffix);
}

describe('mapWireStatusToOverlay', () => {
  it('maps every DeployNodeStatus to the canvas overlay string', () => {
    expect(mapWireStatusToOverlay('queued')).toBe('queued');
    expect(mapWireStatusToOverlay('applying')).toBe('deploying');
    expect(mapWireStatusToOverlay('succeeded')).toBe('active');
    expect(mapWireStatusToOverlay('failed')).toBe('error');
    expect(mapWireStatusToOverlay('skipped')).toBe('skipped');
    expect(mapWireStatusToOverlay('cancelled-due-to-dep')).toBe('cancelled');
  });
});

describe('overlayToWireStatus', () => {
  it('inverts every overlay back to the wire DeployNodeStatus', () => {
    expect(overlayToWireStatus('queued')).toBe('queued');
    expect(overlayToWireStatus('deploying')).toBe('applying');
    expect(overlayToWireStatus('active')).toBe('succeeded');
    expect(overlayToWireStatus('error')).toBe('failed');
    expect(overlayToWireStatus('skipped')).toBe('skipped');
    expect(overlayToWireStatus('cancelled')).toBe('cancelled-due-to-dep');
  });

  it('returns null for overlay strings that do not correspond to a wire status', () => {
    // pre-pdl-10 destroy paths wrote 'destroying' / 'gone' overlays that
    // never existed on the wire — the warm-seed must skip them rather
    // than guess. Phase 2.5 replay fills them in from the event tape.
    expect(overlayToWireStatus('destroying')).toBeNull();
    expect(overlayToWireStatus('gone')).toBeNull();
    expect(overlayToWireStatus('')).toBeNull();
    expect(overlayToWireStatus('whatever')).toBeNull();
  });

  it('round-trips through mapWireStatusToOverlay', () => {
    const all = ['queued', 'applying', 'succeeded', 'failed', 'skipped', 'cancelled-due-to-dep'] as const;
    for (const w of all) {
      expect(overlayToWireStatus(mapWireStatusToOverlay(w))).toBe(w);
    }
  });
});

describe('applyDeployEvent — node_status', () => {
  it('dispatches startDeploying, applyNodeStatusEvent, and updateCardNodeData', () => {
    const { dispatch, calls } = makeDispatch();
    const event: DeployNodeStatusEvent = {
      type: 'node_status',
      card_id: CARD,
      node_id: N1,
      resource_name: 'foo-redis-1',
      resource_type: 'gcp.redis.instance',
      action: 'create',
      status: 'applying',
      at: '2026-04-28T10:00:00.000Z',
      seq: 1,
    };
    applyDeployEvent(dispatch, event, CARD);

    expect(findActions(calls, 'deploy/startDeploying').length).toBe(1);
    expect(findActions(calls, 'deploy/applyNodeStatusEvent').length).toBe(1);

    const overlayCalls = findActions(calls, 'cards/updateCardNodeData');
    expect(overlayCalls).toHaveLength(1);
    expect(overlayCalls[0].payload).toEqual({
      nodeId: N1,
      data: { deploy_status: 'deploying' },
    });
  });

  it('passes a failed-event error through to deploy_error on the canvas', () => {
    const { dispatch, calls } = makeDispatch();
    const event: DeployNodeStatusEvent = {
      type: 'node_status',
      card_id: CARD,
      node_id: N1,
      resource_name: 'foo-redis-1',
      resource_type: 'gcp.redis.instance',
      action: 'create',
      status: 'failed',
      error: { code: 'QUOTA', message: 'Quota exceeded' },
      at: '2026-04-28T10:00:00.000Z',
      seq: 5,
    };
    applyDeployEvent(dispatch, event, CARD);

    const overlay = findActions(calls, 'cards/updateCardNodeData')[0];
    expect(overlay.payload).toEqual({
      nodeId: N1,
      data: {
        deploy_status: 'error',
        deploy_error: 'Quota exceeded',
        deploy_progress: undefined,
      },
    });
  });

  it('clears deploy_progress on a terminal succeeded event and stamps last_deployed_at', () => {
    const { dispatch, calls } = makeDispatch();
    const event: DeployNodeStatusEvent = {
      type: 'node_status',
      card_id: CARD,
      node_id: N1,
      resource_name: 'foo-redis-1',
      resource_type: 'gcp.redis.instance',
      action: 'create',
      status: 'succeeded',
      duration_ms: 12345,
      at: '2026-04-28T10:00:00.000Z',
      seq: 5,
    };
    applyDeployEvent(dispatch, event, CARD);

    const overlay = findActions(calls, 'cards/updateCardNodeData')[0];
    expect(overlay.payload.data).toMatchObject({
      deploy_status: 'active',
      deploy_progress: undefined,
      deploy_error: undefined,
      last_deployed_at: '2026-04-28T10:00:00.000Z',
    });
  });

  it('does not overwrite deploy_progress on a non-terminal status flip', () => {
    const { dispatch, calls } = makeDispatch();
    const event: DeployNodeStatusEvent = {
      type: 'node_status',
      card_id: CARD,
      node_id: N1,
      resource_name: 'foo-redis-1',
      resource_type: 'gcp.redis.instance',
      action: 'create',
      status: 'queued',
      at: '2026-04-28T10:00:00.000Z',
      seq: 1,
    };
    applyDeployEvent(dispatch, event, CARD);

    const overlay = findActions(calls, 'cards/updateCardNodeData')[0];
    expect(overlay.payload.data).toEqual({ deploy_status: 'queued' });
    expect(overlay.payload.data).not.toHaveProperty('deploy_progress');
  });
});

describe('applyDeployEvent — node_progress', () => {
  it('dispatches applyNodeProgressEvent and mirrors deploy_progress to the canvas', () => {
    const { dispatch, calls } = makeDispatch();
    const event: DeployNodeProgressEvent = {
      type: 'node_progress',
      card_id: CARD,
      node_id: N1,
      resource_name: 'foo-redis-1',
      step: { label: 'Provisioning instance', index: 1, total: 4 },
      at: '2026-04-28T10:00:00.000Z',
      seq: 2,
    };
    applyDeployEvent(dispatch, event, CARD);

    expect(findActions(calls, 'deploy/applyNodeProgressEvent').length).toBe(1);
    const overlay = findActions(calls, 'cards/updateCardNodeData')[0];
    expect(overlay.payload).toEqual({
      nodeId: N1,
      data: {
        deploy_progress: {
          step_label: 'Provisioning instance',
          step_index: 1,
          step_total: 4,
        },
      },
    });
  });
});

describe('applyDeployEvent — log', () => {
  it('appends the message to deploy.logs', () => {
    const { dispatch, calls } = makeDispatch();
    const event: DeployLogEvent = {
      type: 'log',
      card_id: CARD,
      level: 'info',
      message: 'Configuring backend service…',
      at: '2026-04-28T10:00:00.000Z',
      seq: 3,
    };
    applyDeployEvent(dispatch, event, CARD);

    const appendLogs = findActions(calls, 'deploy/appendLog');
    expect(appendLogs).toHaveLength(1);
    expect(appendLogs[0].payload).toBe('Configuring backend service…');
  });
});

describe('applyDeployEvent — complete', () => {
  it('dispatches applyDeployCompleteEvent (success outcome)', () => {
    const { dispatch, calls } = makeDispatch();
    const event: DeployCompleteEvent = {
      type: 'complete',
      card_id: CARD,
      outcome: 'success',
      totals: { queued: 0, applying: 0, succeeded: 5, failed: 0, skipped: 0, cancelled: 0 },
      at: '2026-04-28T10:05:00.000Z',
      seq: 99,
    };
    applyDeployEvent(dispatch, event, CARD);

    expect(findActions(calls, 'deploy/applyDeployCompleteEvent').length).toBe(1);
  });

  it('dispatches applyDeployCompleteEvent (partial outcome → status error)', () => {
    const { dispatch, calls } = makeDispatch();
    const event: DeployCompleteEvent = {
      type: 'complete',
      card_id: CARD,
      outcome: 'partial',
      totals: { queued: 0, applying: 0, succeeded: 3, failed: 2, skipped: 0, cancelled: 0 },
      at: '2026-04-28T10:05:00.000Z',
      seq: 99,
    };
    applyDeployEvent(dispatch, event, CARD);

    const dispatched = findActions(calls, 'deploy/applyDeployCompleteEvent');
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].payload.outcome).toBe('partial');
  });
});

describe('applyDeployEvent — requirement_verified', () => {
  it('mirrors managed-cert ACTIVE status onto the canvas when satisfied', () => {
    const { dispatch, calls } = makeDispatch();
    const event: DeployRequirementVerifiedEvent = {
      type: 'requirement_verified',
      card_id: CARD,
      node_id: N1,
      environment: 'production',
      requirement: 'managed-cert-issuance',
      status: 'satisfied',
      details: { managed_status: 'ACTIVE', domain_statuses: { 'foo.example.com': 'OK' } },
      at: '2026-04-28T11:00:00.000Z',
      seq: 1700000000000,
    };
    applyDeployEvent(dispatch, event, CARD);

    const overlay = findActions(calls, 'cards/updateCardNodeData')[0];
    expect(overlay).toBeDefined();
    expect(overlay.payload).toEqual({
      nodeId: N1,
      data: {
        cert_status: 'ACTIVE',
        cert_domain_statuses: { 'foo.example.com': 'OK' },
      },
    });
  });

  it("falls back to details.managed_status when status='unsatisfied'", () => {
    const { dispatch, calls } = makeDispatch();
    const event: DeployRequirementVerifiedEvent = {
      type: 'requirement_verified',
      card_id: CARD,
      node_id: N1,
      environment: 'staging',
      requirement: 'managed-cert-issuance',
      status: 'unsatisfied',
      details: { managed_status: 'PROVISIONING' },
      at: '2026-04-28T11:00:00.000Z',
      seq: 1700000000001,
    };
    applyDeployEvent(dispatch, event, CARD);

    const overlay = findActions(calls, 'cards/updateCardNodeData')[0];
    expect(overlay.payload.data.cert_status).toBe('PROVISIONING');
  });

  it('uses PROVISIONING fallback when details is missing', () => {
    const { dispatch, calls } = makeDispatch();
    const event: DeployRequirementVerifiedEvent = {
      type: 'requirement_verified',
      card_id: CARD,
      node_id: N1,
      environment: 'staging',
      requirement: 'managed-cert-issuance',
      status: 'unsatisfied',
      at: '2026-04-28T11:00:00.000Z',
      seq: 1700000000002,
    };
    applyDeployEvent(dispatch, event, CARD);

    const overlay = findActions(calls, 'cards/updateCardNodeData')[0];
    expect(overlay.payload.data.cert_status).toBe('PROVISIONING');
  });

  it('does not dispatch for other requirement ids', () => {
    const { dispatch, calls } = makeDispatch();
    const event: DeployRequirementVerifiedEvent = {
      type: 'requirement_verified',
      card_id: CARD,
      node_id: N1,
      environment: 'staging',
      requirement: 'dns-verification',
      status: 'satisfied',
      at: '2026-04-28T11:00:00.000Z',
      seq: 1700000000003,
    };
    applyDeployEvent(dispatch, event, CARD);

    expect(findActions(calls, 'cards/updateCardNodeData')).toHaveLength(0);
  });
});

describe('applyDeployEvent — defensive', () => {
  it('returns silently for null / undefined event', () => {
    const { dispatch, calls } = makeDispatch();
    applyDeployEvent(dispatch, null);
    applyDeployEvent(dispatch, undefined);
    expect(calls).toHaveLength(0);
  });
});

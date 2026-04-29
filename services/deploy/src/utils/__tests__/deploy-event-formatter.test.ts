import { describe, it, expect } from 'vitest';
import type {
  DeployCompleteEvent,
  DeployLogEvent,
  DeployNodeProgressEvent,
  DeployNodeStatusEvent,
  DeployRequirementVerifiedEvent,
} from '@ice/types';
import { describeEventForLog, mapStatusToOverlay } from '../deploy-event-formatter.js';

describe('mapStatusToOverlay', () => {
  // Mapping aligned with the frontend's `mapWireStatusToOverlay` in
  // `packages/ui/src/features/deploy/hooks/use-deploy-subscription.ts`.
  // Both sides must produce the same overlay string for the same wire
  // status — divergence means the snapshot path and the live-event path
  // disagree on color for the same node.
  it('returns "queued" for the queued status', () => {
    expect(mapStatusToOverlay('queued')).toBe('queued');
  });

  it('returns "deploying" for the applying status', () => {
    expect(mapStatusToOverlay('applying')).toBe('deploying');
  });

  it('returns "active" for the succeeded status', () => {
    expect(mapStatusToOverlay('succeeded')).toBe('active');
  });

  it('returns "error" for the failed status', () => {
    expect(mapStatusToOverlay('failed')).toBe('error');
  });

  it('returns "cancelled" for the cancelled-due-to-dep status', () => {
    expect(mapStatusToOverlay('cancelled-due-to-dep')).toBe('cancelled');
  });

  it('returns "skipped" for the skipped status (default fallback)', () => {
    expect(mapStatusToOverlay('skipped')).toBe('skipped');
  });
});

describe('describeEventForLog', () => {
  it('returns the message truncated to 80 chars for log events', () => {
    const longMessage = 'x'.repeat(100);
    const event: DeployLogEvent = {
      type: 'log',
      card_id: 'card-1',
      level: 'info',
      message: longMessage,
      at: '2026-04-29T00:00:00.000Z',
      seq: 1,
    };
    const result = describeEventForLog(event);
    expect(result).toHaveLength(80);
    expect(result).toBe('x'.repeat(80));
  });

  it('returns an empty string for a log event with no message', () => {
    const event = {
      type: 'log',
      card_id: 'card-1',
      level: 'info',
      // The branch `(event.message || '').slice(0, 80)` exercises the
      // empty-string fallback when `message` is missing/falsy on the wire.
      message: '',
      at: '2026-04-29T00:00:00.000Z',
      seq: 1,
    } as DeployLogEvent;
    expect(describeEventForLog(event)).toBe('');
  });

  it('formats a node_status event with resource_name and status', () => {
    const event: DeployNodeStatusEvent = {
      type: 'node_status',
      card_id: 'card-1',
      node_id: 'canvas-1',
      resource_name: 'my-bucket',
      resource_type: 'gcp.storage.bucket',
      action: 'create',
      status: 'applying',
      at: '2026-04-29T00:00:00.000Z',
      seq: 2,
    };
    expect(describeEventForLog(event)).toBe('my-bucket → applying');
  });

  it('formats a node_progress event with resource_name and step label', () => {
    const event: DeployNodeProgressEvent = {
      type: 'node_progress',
      card_id: 'card-1',
      node_id: 'canvas-1',
      resource_name: 'my-instance',
      step: { label: 'creating', index: 1, total: 3 },
      at: '2026-04-29T00:00:00.000Z',
      seq: 3,
    };
    expect(describeEventForLog(event)).toBe('my-instance step=creating');
  });

  it('formats a complete event with the outcome', () => {
    const event: DeployCompleteEvent = {
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
      seq: 4,
    };
    expect(describeEventForLog(event)).toBe('outcome=success');
  });

  it('formats a requirement_verified event with requirement and status', () => {
    const event: DeployRequirementVerifiedEvent = {
      type: 'requirement_verified',
      card_id: 'card-1',
      node_id: 'canvas-1',
      environment: 'staging',
      requirement: 'managed-cert-issuance',
      status: 'satisfied',
      at: '2026-04-29T00:00:00.000Z',
      seq: 5,
    };
    expect(describeEventForLog(event)).toBe('managed-cert-issuance=satisfied');
  });

  it('returns an empty string for an unknown event type (default fallback)', () => {
    // Cast through `unknown` to bypass the discriminated-union exhaustiveness
    // check — the `default` branch in `describeEventForLog` is the runtime
    // safety net for a type that's added to the wire but not yet to the
    // formatter, so the test must pass a shape the type system rejects.
    const event = {
      type: 'unknown_event_type',
      card_id: 'card-1',
      at: '2026-04-29T00:00:00.000Z',
      seq: 6,
    } as unknown as Parameters<typeof describeEventForLog>[0];
    expect(describeEventForLog(event)).toBe('');
  });
});

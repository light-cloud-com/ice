import { describe, expect, it } from 'vitest';
import {
  DEPLOY_EVENT_CHANNEL,
  TERMINAL_NODE_STATUSES,
  isDeployCompleteEvent,
  isDeployLogEvent,
  isNodeProgressEvent,
  isNodeStatusEvent,
  isRequirementVerifiedEvent,
  isTerminalNodeStatus,
  mapStatusToOverlay,
  overlayToWireStatus,
  type DeployCompleteEvent,
  type DeployEvent,
  type DeployLogEvent,
  type DeployNodeProgressEvent,
  type DeployNodeStatus,
  type DeployNodeStatusEvent,
  type DeployRequirementVerifiedEvent,
} from '../deploy-events';

// ── Fixtures ────────────────────────────────────────────────────────────

const baseStatus: DeployNodeStatusEvent = {
  type: 'node_status',
  card_id: 'card-1',
  node_id: 'cmoh24gso000b7oay4cwn584j',
  resource_name: 'web-vm-3f4a',
  resource_type: 'gcp.compute.instance',
  action: 'create',
  status: 'queued',
  at: '2026-05-02T12:00:00.000Z',
  seq: 1,
};

const baseProgress: DeployNodeProgressEvent = {
  type: 'node_progress',
  card_id: 'card-1',
  node_id: 'cmoh24gso000b7oay4cwn584j',
  resource_name: 'web-vm-3f4a',
  step: { label: 'creating instance', index: 1, total: 3 },
  at: '2026-05-02T12:00:01.000Z',
  seq: 2,
};

const baseLog: DeployLogEvent = {
  type: 'log',
  card_id: 'card-1',
  level: 'info',
  message: 'starting',
  at: '2026-05-02T12:00:02.000Z',
  seq: 3,
};

const baseComplete: DeployCompleteEvent = {
  type: 'complete',
  card_id: 'card-1',
  outcome: 'success',
  totals: { queued: 0, applying: 0, succeeded: 5, failed: 0, skipped: 0, cancelled: 0 },
  at: '2026-05-02T12:01:00.000Z',
  seq: 99,
};

const baseRequirement: DeployRequirementVerifiedEvent = {
  type: 'requirement_verified',
  card_id: 'card-1',
  node_id: 'cmoh24gso000b7oay4cwn584j',
  environment: 'staging',
  requirement: 'managed-cert-issuance',
  status: 'satisfied',
  at: '2026-05-02T12:02:00.000Z',
  seq: 1735776000000,
};

// ── Type guards ─────────────────────────────────────────────────────────

describe('isNodeStatusEvent', () => {
  it('returns true for a node_status event', () => {
    expect(isNodeStatusEvent(baseStatus)).toBe(true);
  });

  it('returns false for non-node_status events', () => {
    const others: DeployEvent[] = [baseProgress, baseLog, baseComplete, baseRequirement];
    for (const e of others) {
      expect(isNodeStatusEvent(e)).toBe(false);
    }
  });
});

describe('isNodeProgressEvent', () => {
  it('returns true for a node_progress event', () => {
    expect(isNodeProgressEvent(baseProgress)).toBe(true);
  });

  it('returns false for non-node_progress events', () => {
    const others: DeployEvent[] = [baseStatus, baseLog, baseComplete, baseRequirement];
    for (const e of others) {
      expect(isNodeProgressEvent(e)).toBe(false);
    }
  });
});

describe('isDeployLogEvent', () => {
  it('returns true for a log event', () => {
    expect(isDeployLogEvent(baseLog)).toBe(true);
  });

  it('returns false for non-log events', () => {
    const others: DeployEvent[] = [baseStatus, baseProgress, baseComplete, baseRequirement];
    for (const e of others) {
      expect(isDeployLogEvent(e)).toBe(false);
    }
  });
});

describe('isDeployCompleteEvent', () => {
  it('returns true for a complete event', () => {
    expect(isDeployCompleteEvent(baseComplete)).toBe(true);
  });

  it('returns false for non-complete events', () => {
    const others: DeployEvent[] = [baseStatus, baseProgress, baseLog, baseRequirement];
    for (const e of others) {
      expect(isDeployCompleteEvent(e)).toBe(false);
    }
  });
});

describe('isRequirementVerifiedEvent', () => {
  it('returns true for a requirement_verified event', () => {
    expect(isRequirementVerifiedEvent(baseRequirement)).toBe(true);
  });

  it('returns false for non-requirement_verified events', () => {
    const others: DeployEvent[] = [baseStatus, baseProgress, baseLog, baseComplete];
    for (const e of others) {
      expect(isRequirementVerifiedEvent(e)).toBe(false);
    }
  });
});

// ── Wire-status / overlay mapping ──────────────────────────────────────

describe('mapStatusToOverlay', () => {
  it('maps queued to queued', () => {
    expect(mapStatusToOverlay('queued')).toBe('queued');
  });

  it('maps applying to deploying', () => {
    expect(mapStatusToOverlay('applying')).toBe('deploying');
  });

  it('maps succeeded to active', () => {
    expect(mapStatusToOverlay('succeeded')).toBe('active');
  });

  it('maps failed to error', () => {
    expect(mapStatusToOverlay('failed')).toBe('error');
  });

  it('maps skipped to skipped', () => {
    expect(mapStatusToOverlay('skipped')).toBe('skipped');
  });

  it('maps cancelled-due-to-dep to cancelled', () => {
    expect(mapStatusToOverlay('cancelled-due-to-dep')).toBe('cancelled');
  });
});

describe('overlayToWireStatus', () => {
  it('inverts queued to queued', () => {
    expect(overlayToWireStatus('queued')).toBe('queued');
  });

  it('inverts deploying to applying', () => {
    expect(overlayToWireStatus('deploying')).toBe('applying');
  });

  it('inverts active to succeeded', () => {
    expect(overlayToWireStatus('active')).toBe('succeeded');
  });

  it('inverts error to failed', () => {
    expect(overlayToWireStatus('error')).toBe('failed');
  });

  it('inverts skipped to skipped', () => {
    expect(overlayToWireStatus('skipped')).toBe('skipped');
  });

  it('inverts cancelled to cancelled-due-to-dep', () => {
    expect(overlayToWireStatus('cancelled')).toBe('cancelled-due-to-dep');
  });

  it('returns null for unrecognized overlays such as legacy destroying', () => {
    expect(overlayToWireStatus('destroying')).toBeNull();
  });

  it('returns null for the empty string', () => {
    expect(overlayToWireStatus('')).toBeNull();
  });

  it('round-trips every wire status through map then unmap', () => {
    const wireStatuses: DeployNodeStatus[] = [
      'queued',
      'applying',
      'succeeded',
      'failed',
      'skipped',
      'cancelled-due-to-dep',
    ];
    for (const s of wireStatuses) {
      expect(overlayToWireStatus(mapStatusToOverlay(s))).toBe(s);
    }
  });
});

// ── Terminal-status helper ────────────────────────────────────────────

describe('isTerminalNodeStatus', () => {
  it('returns true for succeeded', () => {
    expect(isTerminalNodeStatus('succeeded')).toBe(true);
  });

  it('returns true for failed', () => {
    expect(isTerminalNodeStatus('failed')).toBe(true);
  });

  it('returns true for skipped', () => {
    expect(isTerminalNodeStatus('skipped')).toBe(true);
  });

  it('returns true for cancelled-due-to-dep', () => {
    expect(isTerminalNodeStatus('cancelled-due-to-dep')).toBe(true);
  });

  it('returns false for queued', () => {
    expect(isTerminalNodeStatus('queued')).toBe(false);
  });

  it('returns false for applying', () => {
    expect(isTerminalNodeStatus('applying')).toBe(false);
  });
});

// ── Constants ─────────────────────────────────────────────────────────

describe('TERMINAL_NODE_STATUSES', () => {
  it('lists the four terminal statuses in the documented order', () => {
    expect(TERMINAL_NODE_STATUSES).toEqual(['succeeded', 'failed', 'skipped', 'cancelled-due-to-dep']);
  });
});

describe('DEPLOY_EVENT_CHANNEL', () => {
  it('is the literal channel name used by emitters and listeners', () => {
    expect(DEPLOY_EVENT_CHANNEL).toBe('deploy:event');
  });
});

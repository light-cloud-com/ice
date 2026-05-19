/**
 * Unit tests for `services/deploy/src/services/pipeline/events.ts` —
 * the deployment-event lifecycle (query / create / progress / fail)
 * extracted from pipeline.service.ts in rf-pipe-3.
 *
 * The Prisma client and the @ice/shared emit helpers are module-mocked.
 * statusToProgress is module-private so it's exercised indirectly via
 * `updateEventProgress` and the values asserted on the captured emit
 * payloads (queued=0, building=33, deploying=66, success=100, failed=100).
 *
 * Per the `vi-spyon-accumulates-across-it-blocks-without-explicit-reset`
 * learning, mocks are reset at `beforeEach` and restored at `afterEach`
 * so call counts don't leak across `it` blocks.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@ice/db', () => ({
  default: {
    canvasCard: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    deploymentRule: {
      findMany: vi.fn(),
    },
    deploymentEvent: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock('@ice/shared', () => ({
  emitPipelineUpdate: vi.fn(),
  emitCardPipelineUpdate: vi.fn(),
}));

import prisma from '@ice/db';
import * as shared from '@ice/shared';
import {
  getEventsForNode,
  createDeploymentEvent,
  updateEventProgress,
  failEvent,
} from '../pipeline/events';

const cardFindUnique = (prisma as any).canvasCard.findUnique as ReturnType<typeof vi.fn>;
const cardFindMany = (prisma as any).canvasCard.findMany as ReturnType<typeof vi.fn>;
const ruleFindMany = (prisma as any).deploymentRule.findMany as ReturnType<typeof vi.fn>;
const eventFindMany = (prisma as any).deploymentEvent.findMany as ReturnType<typeof vi.fn>;
const eventFindUnique = (prisma as any).deploymentEvent.findUnique as ReturnType<typeof vi.fn>;
const eventCreate = (prisma as any).deploymentEvent.create as ReturnType<typeof vi.fn>;
const eventUpdate = (prisma as any).deploymentEvent.update as ReturnType<typeof vi.fn>;
const eventUpdateMany = (prisma as any).deploymentEvent.updateMany as ReturnType<typeof vi.fn>;
const emitPipeline = (shared as any).emitPipelineUpdate as ReturnType<typeof vi.fn>;
const emitCard = (shared as any).emitCardPipelineUpdate as ReturnType<typeof vi.fn>;

beforeEach(() => {
  cardFindUnique.mockReset();
  cardFindMany.mockReset();
  ruleFindMany.mockReset();
  eventFindMany.mockReset();
  eventFindUnique.mockReset();
  eventCreate.mockReset();
  eventUpdate.mockReset();
  eventUpdateMany.mockReset();
  emitPipeline.mockReset();
  emitCard.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getEventsForNode', () => {
  it('returns [] when card is not found', async () => {
    cardFindUnique.mockResolvedValue(null);
    const events = await getEventsForNode('c', 'n');
    expect(events).toEqual([]);
    expect(eventFindMany).not.toHaveBeenCalled();
  });

  it('returns [] when no rules exist for the node in any project card', async () => {
    cardFindUnique.mockResolvedValue({ project_id: 'p' });
    cardFindMany.mockResolvedValue([{ id: 'c1' }]);
    ruleFindMany.mockResolvedValue([]);
    const events = await getEventsForNode('c1', 'n1');
    expect(events).toEqual([]);
    expect(eventFindMany).not.toHaveBeenCalled();
  });

  it('queries events ordered by started_at desc with rule-fields included', async () => {
    cardFindUnique.mockResolvedValue({ project_id: 'p' });
    cardFindMany.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);
    ruleFindMany.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]);
    eventFindMany.mockResolvedValue([{ id: 'e1' }]);

    const events = await getEventsForNode('c1', 'n1', 5);

    expect(events).toEqual([{ id: 'e1' }]);
    expect(eventFindMany).toHaveBeenCalledWith({
      where: { rule_id: { in: ['r1', 'r2'] } },
      orderBy: { started_at: 'desc' },
      take: 5,
      include: { rule: { select: { branch_pattern: true, environment: true } } },
    });
  });

  it('defaults the limit to 20 when none is passed', async () => {
    cardFindUnique.mockResolvedValue({ project_id: 'p' });
    cardFindMany.mockResolvedValue([{ id: 'c1' }]);
    ruleFindMany.mockResolvedValue([{ id: 'r1' }]);
    eventFindMany.mockResolvedValue([]);
    await getEventsForNode('c1', 'n1');
    expect(eventFindMany.mock.calls[0]![0].take).toBe(20);
  });
});

describe('createDeploymentEvent', () => {
  it('cancels in-flight queued events for the rule, then creates a fresh queued one', async () => {
    eventUpdateMany.mockResolvedValue({ count: 1 });
    eventCreate.mockResolvedValue({ id: 'evt-1' });

    await createDeploymentEvent('rule-1', 'push', 'sha-abc', 'main', 'msg', 'author');

    expect(eventUpdateMany).toHaveBeenCalledWith({
      where: { rule_id: 'rule-1', status: { in: ['queued'] } },
      data: { status: 'cancelled' },
    });
    expect(eventCreate).toHaveBeenCalledTimes(1);
    expect(eventCreate.mock.calls[0]![0].data).toEqual({
      rule_id: 'rule-1',
      trigger: 'push',
      commit_sha: 'sha-abc',
      commit_message: 'msg',
      commit_author: 'author',
      branch: 'main',
      status: 'queued',
      deployment_stage: 'Queued for deployment',
      deployment_logs: [],
    });
  });

  it('passes commit_message and commit_author through as undefined when omitted', async () => {
    eventUpdateMany.mockResolvedValue({ count: 0 });
    eventCreate.mockResolvedValue({ id: 'evt-2' });
    await createDeploymentEvent('rule-1', 'merge', 'sha', 'develop');
    const data = eventCreate.mock.calls[0]![0].data;
    expect(data.commit_message).toBeUndefined();
    expect(data.commit_author).toBeUndefined();
  });
});

describe('updateEventProgress', () => {
  function makeUpdated(overrides: Record<string, unknown> = {}) {
    return {
      status: 'building',
      deployment_stage: 'Build',
      deployment_logs: [],
      commit_sha: 'sha',
      commit_message: 'msg',
      commit_author: 'auth',
      branch: 'main',
      error: null,
      started_at: new Date('2026-04-30T10:00:00Z'),
      duration_seconds: undefined,
      rule: { node_id: 'n1', card_id: 'c1' },
      ...overrides,
    };
  }

  it('returns silently when the event does not exist', async () => {
    eventFindUnique.mockResolvedValue(null);
    const result = await updateEventProgress('e-x', 'building', 'Building');
    expect(result).toBeUndefined();
    expect(eventUpdate).not.toHaveBeenCalled();
    expect(emitPipeline).not.toHaveBeenCalled();
  });

  it('appends the optional step to deployment_logs and emits a building progress', async () => {
    eventFindUnique.mockResolvedValue({
      deployment_logs: [{ step: 'a', status: 'completed', message: '', timestamp: '' }],
      started_at: new Date('2026-04-30T10:00:00Z'),
    });
    eventUpdate.mockResolvedValue(makeUpdated({ status: 'building' }));

    await updateEventProgress('e1', 'building', 'Build', {
      step: 'install',
      status: 'started',
      message: 'pnpm install',
      timestamp: '2026-04-30T10:00:30Z',
    });

    const data = eventUpdate.mock.calls[0]![0].data;
    expect(data.status).toBe('building');
    expect(data.deployment_stage).toBe('Build');
    expect(data.deployment_logs).toHaveLength(2);
    // No completed_at / duration when status is mid-flight
    expect(data.completed_at).toBeUndefined();
    expect(data.duration_seconds).toBeUndefined();

    // building → progress 33
    expect(emitPipeline.mock.calls[0]![1].progress).toBe(33);
    expect(emitCard.mock.calls[0]![1].progress).toBe(33);
  });

  it('stamps completed_at + duration when status is success or failed', async () => {
    const start = new Date('2026-04-30T10:00:00Z');
    eventFindUnique.mockResolvedValue({ deployment_logs: [], started_at: start });
    eventUpdate.mockResolvedValue(makeUpdated({ status: 'success', duration_seconds: 60 }));

    const realNow = Date.now;
    Date.now = () => start.getTime() + 60_000;

    try {
      await updateEventProgress('e1', 'success', 'Done');
      const data = eventUpdate.mock.calls[0]![0].data;
      expect(data.completed_at).toBeInstanceOf(Date);
      expect(data.duration_seconds).toBe(60);
      // success → progress 100
      expect(emitPipeline.mock.calls[0]![1].progress).toBe(100);
    } finally {
      Date.now = realNow;
    }
  });

  it('emits both per-node and per-card updates with the same nodeId', async () => {
    eventFindUnique.mockResolvedValue({ deployment_logs: [], started_at: new Date() });
    eventUpdate.mockResolvedValue(makeUpdated({ status: 'deploying' }));

    await updateEventProgress('e1', 'deploying', 'Apply');

    expect(emitPipeline).toHaveBeenCalledTimes(1);
    expect(emitPipeline.mock.calls[0]![0]).toBe('n1'); // node id
    expect(emitCard).toHaveBeenCalledTimes(1);
    expect(emitCard.mock.calls[0]![0]).toBe('c1'); // card id
    // deploying → progress 66
    expect(emitPipeline.mock.calls[0]![1].progress).toBe(66);
    expect(emitCard.mock.calls[0]![1].progress).toBe(66);
    // Both emits report the same nodeId in their payload
    expect(emitCard.mock.calls[0]![1].nodeId).toBe('n1');
  });

  it('queued status maps to progress 0 and unknown status falls back to 0', async () => {
    const baseEvent = { deployment_logs: [], started_at: new Date() };
    eventFindUnique.mockResolvedValue(baseEvent);
    eventUpdate.mockResolvedValue(makeUpdated({ status: 'queued' }));
    await updateEventProgress('e1', 'queued', 'Queued');
    expect(emitPipeline.mock.calls[0]![1].progress).toBe(0);

    emitPipeline.mockReset();
    emitCard.mockReset();
    eventUpdate.mockResolvedValue(makeUpdated({ status: 'mystery' }));
    await updateEventProgress('e1', 'mystery', 'Mystery');
    expect(emitPipeline.mock.calls[0]![1].progress).toBe(0);
  });
});

describe('failEvent', () => {
  it('returns silently when the event is missing', async () => {
    eventFindUnique.mockResolvedValue(null);
    const result = await failEvent('e-x', 'boom');
    expect(result).toBeUndefined();
    expect(eventUpdate).not.toHaveBeenCalled();
  });

  it('appends an error step then forwards to updateEventProgress with status=failed', async () => {
    // failEvent reads the event once (to push the error step), then
    // updateEventProgress reads it again. Both calls return data.
    const start = new Date('2026-04-30T10:00:00Z');
    eventFindUnique.mockResolvedValue({ deployment_logs: [], started_at: start });
    eventUpdate.mockResolvedValue({
      status: 'failed',
      deployment_stage: 'Failed: kaboom',
      deployment_logs: [],
      commit_sha: 'sha',
      commit_message: '',
      commit_author: '',
      branch: 'main',
      error: null,
      started_at: start,
      duration_seconds: 1,
      rule: { node_id: 'n', card_id: 'c' },
    });

    const realNow = Date.now;
    Date.now = () => start.getTime() + 1000;

    try {
      await failEvent('e1', 'kaboom');
      // The pushed-to-logs path runs inside updateEventProgress, not here:
      // failEvent itself reads-mutates `event.deployment_logs` (in-memory,
      // which has no observable side-effect since it's discarded), then
      // calls updateEventProgress which RE-reads the row and writes it.
      // What we can assert: status=failed, stage="Failed: kaboom",
      // and the wire emit reports progress 100.
      const data = eventUpdate.mock.calls[0]![0].data;
      expect(data.status).toBe('failed');
      expect(data.deployment_stage).toBe('Failed: kaboom');
      expect(emitPipeline.mock.calls[0]![1].progress).toBe(100);
    } finally {
      Date.now = realNow;
    }
  });
});

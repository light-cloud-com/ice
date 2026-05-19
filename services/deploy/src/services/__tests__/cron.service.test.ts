/**
 * Unit tests for `services/deploy/src/services/cron.service.ts` —
 * `startCronJobs()` registers six maintenance schedules against
 * `node-cron` and the captured handlers exercise prisma queries with
 * try/catch logging. The mock harness captures `cron.schedule(expr, fn)`
 * calls so each handler can be invoked directly without real timers.
 *
 * Per `deploy-service-tests-must-import-vitest-explicitly`, vitest
 * globals are imported explicitly. Per `vi-spyon-accumulates-across-it-
 * blocks-without-explicit-reset`, console spies are torn down via
 * `vi.restoreAllMocks()` in `afterEach`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface ScheduledJob {
  expr: string;
  fn: () => Promise<void>;
}

const scheduled: ScheduledJob[] = [];

vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn((expr: string, fn: () => Promise<void>) => {
      scheduled.push({ expr, fn });
      return { stop: vi.fn() };
    }),
  },
}));

vi.mock('@ice/db', () => ({
  default: {
    refreshToken: {
      deleteMany: vi.fn(),
    },
    canvasDeployment: {
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
      update: vi.fn(),
    },
    deployJob: {
      updateMany: vi.fn(),
    },
    deployEvent: {
      deleteMany: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    webhookDelivery: {
      deleteMany: vi.fn(),
    },
    $executeRaw: vi.fn(),
  },
}));

import { startCronJobs } from '../cron.service';
import prisma from '@ice/db';

const refreshTokenDeleteMany = prisma.refreshToken.deleteMany as unknown as ReturnType<typeof vi.fn>;
const canvasDeploymentDeleteMany = prisma.canvasDeployment.deleteMany as unknown as ReturnType<typeof vi.fn>;
const canvasDeploymentFindMany = prisma.canvasDeployment.findMany as unknown as ReturnType<typeof vi.fn>;
const canvasDeploymentGroupBy = (prisma.canvasDeployment as any).groupBy as ReturnType<typeof vi.fn>;
const canvasDeploymentUpdate = prisma.canvasDeployment.update as unknown as ReturnType<typeof vi.fn>;
const deployJobUpdateMany = prisma.deployJob.updateMany as unknown as ReturnType<typeof vi.fn>;
const deployEventDeleteMany = prisma.deployEvent.deleteMany as unknown as ReturnType<typeof vi.fn>;
const deployEventFindFirst = prisma.deployEvent.findFirst as unknown as ReturnType<typeof vi.fn>;
const deployEventFindMany = prisma.deployEvent.findMany as unknown as ReturnType<typeof vi.fn>;
const webhookDeliveryDeleteMany = prisma.webhookDelivery.deleteMany as unknown as ReturnType<typeof vi.fn>;
const executeRawMock = (prisma as any).$executeRaw as ReturnType<typeof vi.fn>;

describe('startCronJobs', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    scheduled.length = 0;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('registration', () => {
    it('registers all five maintenance schedules', () => {
      startCronJobs();

      expect(scheduled).toHaveLength(5);
      expect(scheduled.map((s) => s.expr)).toEqual([
        '0 * * * *', // hourly token cleanup
        '0 3 * * *', // daily 3am deployment prune
        '*/5 * * * *', // 5-min stuck deploy job detection
        '*/5 * * * *', // 5-min stalled canvas deployment watchdog
        '0 4 * * *', // daily 4am webhook delivery prune
      ]);
      expect(logSpy).toHaveBeenCalledWith('Cron jobs started');
    });
  });

  describe('hourly refresh token cleanup', () => {
    function getHandler() {
      startCronJobs();
      return scheduled[0].fn;
    }

    it('logs the count when expired tokens were deleted', async () => {
      refreshTokenDeleteMany.mockResolvedValueOnce({ count: 3 });
      const handler = getHandler();

      await handler();

      expect(refreshTokenDeleteMany).toHaveBeenCalledWith({
        where: { expires_at: { lt: expect.any(Date) } },
      });
      expect(logSpy).toHaveBeenCalledWith('Cleaned 3 expired refresh tokens');
    });

    it('does not log when no tokens were expired', async () => {
      refreshTokenDeleteMany.mockResolvedValueOnce({ count: 0 });
      const handler = getHandler();

      await handler();

      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('expired refresh tokens'));
    });

    it('logs error and does not throw when prisma rejects', async () => {
      refreshTokenDeleteMany.mockRejectedValueOnce(new Error('db down'));
      const handler = getHandler();

      await expect(handler()).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalledWith('Cron: token cleanup error:', 'db down');
    });
  });

  describe('daily deployment prune (3am)', () => {
    function getHandler() {
      startCronJobs();
      return scheduled[1].fn;
    }

    function setHappyPathDefaults() {
      // Rule 4 — old failed/cancelled
      canvasDeploymentDeleteMany.mockResolvedValueOnce({ count: 0 });
      // Rule 5 — stale plan-only rows
      canvasDeploymentDeleteMany.mockResolvedValueOnce({ count: 0 });
      // Rule 1-3 — bucket query
      canvasDeploymentGroupBy.mockResolvedValueOnce([]);
      // DR-O1 — deployEvent prune
      deployEventDeleteMany.mockResolvedValueOnce({ count: 0 });
      // DR-O2 — deployed_resource_mapping prune
      executeRawMock.mockResolvedValueOnce(0);
    }

    it('logs the prune count for old failed/cancelled deploys', async () => {
      canvasDeploymentDeleteMany.mockResolvedValueOnce({ count: 7 }); // rule 4
      canvasDeploymentDeleteMany.mockResolvedValueOnce({ count: 0 }); // rule 5
      canvasDeploymentGroupBy.mockResolvedValueOnce([]);
      deployEventDeleteMany.mockResolvedValueOnce({ count: 0 });
      executeRawMock.mockResolvedValueOnce(0);

      await getHandler()();

      expect(logSpy).toHaveBeenCalledWith('Pruned 7 old failed/cancelled deployments');
    });

    it('logs the prune count for stale plan-only rows', async () => {
      canvasDeploymentDeleteMany.mockResolvedValueOnce({ count: 0 });
      canvasDeploymentDeleteMany.mockResolvedValueOnce({ count: 4 }); // rule 5
      canvasDeploymentGroupBy.mockResolvedValueOnce([]);
      deployEventDeleteMany.mockResolvedValueOnce({ count: 0 });
      executeRawMock.mockResolvedValueOnce(0);

      await getHandler()();

      expect(logSpy).toHaveBeenCalledWith('Pruned 4 stale plan-only rows');
    });

    it('iterates buckets, keeps top 50 ids, and logs per-bucket prune count', async () => {
      canvasDeploymentDeleteMany.mockResolvedValueOnce({ count: 0 }); // rule 4
      canvasDeploymentDeleteMany.mockResolvedValueOnce({ count: 0 }); // rule 5
      canvasDeploymentGroupBy.mockResolvedValueOnce([{ card_id: 'card-1', environment: 'prod', _count: 60 }]);
      // findMany returns the 50 keep candidates
      canvasDeploymentFindMany.mockResolvedValueOnce(Array.from({ length: 50 }, (_, i) => ({ id: `keep-${i}` })));
      // deleteMany for the bucket
      canvasDeploymentDeleteMany.mockResolvedValueOnce({ count: 12 });
      deployEventDeleteMany.mockResolvedValueOnce({ count: 0 });
      executeRawMock.mockResolvedValueOnce(0);

      await getHandler()();

      expect(canvasDeploymentFindMany).toHaveBeenCalledWith({
        where: {
          card_id: 'card-1',
          environment: 'prod',
          status: { in: ['success', 'partial'] },
        },
        orderBy: { created_at: 'desc' },
        take: 50,
        select: { id: true },
      });
      expect(canvasDeploymentDeleteMany).toHaveBeenLastCalledWith({
        where: {
          card_id: 'card-1',
          environment: 'prod',
          status: { in: ['success', 'partial'] },
          pinned: false,
          id: { notIn: expect.any(Array) },
        },
      });
      expect(logSpy).toHaveBeenCalledWith('Pruned 12 successful deployments for card card-1 env prod');
    });

    it('does not log per-bucket count when bucket prune count is zero', async () => {
      canvasDeploymentDeleteMany.mockResolvedValueOnce({ count: 0 });
      canvasDeploymentDeleteMany.mockResolvedValueOnce({ count: 0 });
      canvasDeploymentGroupBy.mockResolvedValueOnce([{ card_id: 'card-2', environment: 'staging', _count: 51 }]);
      canvasDeploymentFindMany.mockResolvedValueOnce([{ id: 'keep-1' }]);
      canvasDeploymentDeleteMany.mockResolvedValueOnce({ count: 0 });
      deployEventDeleteMany.mockResolvedValueOnce({ count: 0 });
      executeRawMock.mockResolvedValueOnce(0);

      await getHandler()();

      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('successful deployments for card'));
    });

    it('logs error from the deployment prune block when prisma rejects', async () => {
      canvasDeploymentDeleteMany.mockRejectedValueOnce(new Error('rule 4 failure'));
      // DR-O1 still runs
      deployEventDeleteMany.mockResolvedValueOnce({ count: 0 });
      // DR-O2 still runs
      executeRawMock.mockResolvedValueOnce(0);

      await expect(getHandler()()).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalledWith('Cron: deployment prune error:', 'rule 4 failure');
    });

    it('logs DR-O1 deploy_event prune count when > 0', async () => {
      setHappyPathDefaults();
      // re-prime deployEventDeleteMany since setHappyPathDefaults consumed the slot
      deployEventDeleteMany.mockReset();
      deployEventDeleteMany.mockResolvedValueOnce({ count: 25 });

      await getHandler()();

      expect(logSpy).toHaveBeenCalledWith('Pruned 25 deploy_event rows older than 180 days');
    });

    it('does not log DR-O1 message when deploy_event prune count is zero', async () => {
      setHappyPathDefaults();

      await getHandler()();

      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('deploy_event rows older than 180 days'));
    });

    it('logs error when DR-O1 deploy_event prune fails', async () => {
      canvasDeploymentDeleteMany.mockResolvedValueOnce({ count: 0 });
      canvasDeploymentDeleteMany.mockResolvedValueOnce({ count: 0 });
      canvasDeploymentGroupBy.mockResolvedValueOnce([]);
      deployEventDeleteMany.mockRejectedValueOnce(new Error('event prune failed'));
      executeRawMock.mockResolvedValueOnce(0);

      await expect(getHandler()()).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalledWith('Cron: deploy_event prune error:', 'event prune failed');
    });

    it('logs DR-O2 deployed_resource_mapping prune count when > 0', async () => {
      canvasDeploymentDeleteMany.mockResolvedValueOnce({ count: 0 });
      canvasDeploymentDeleteMany.mockResolvedValueOnce({ count: 0 });
      canvasDeploymentGroupBy.mockResolvedValueOnce([]);
      deployEventDeleteMany.mockResolvedValueOnce({ count: 0 });
      executeRawMock.mockResolvedValueOnce(9);

      await getHandler()();

      expect(logSpy).toHaveBeenCalledWith('Pruned 9 deployed_resource_mapping rows for deleted cards');
    });

    it('does not log DR-O2 message when raw delete returns 0', async () => {
      setHappyPathDefaults();

      await getHandler()();

      expect(logSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('deployed_resource_mapping rows for deleted cards'),
      );
    });

    it('logs error when DR-O2 raw delete fails', async () => {
      canvasDeploymentDeleteMany.mockResolvedValueOnce({ count: 0 });
      canvasDeploymentDeleteMany.mockResolvedValueOnce({ count: 0 });
      canvasDeploymentGroupBy.mockResolvedValueOnce([]);
      deployEventDeleteMany.mockResolvedValueOnce({ count: 0 });
      executeRawMock.mockRejectedValueOnce(new Error('raw failed'));

      await expect(getHandler()()).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalledWith('Cron: deployed_resource_mapping prune error:', 'raw failed');
    });
  });

  describe('5-min stuck deploy job watchdog', () => {
    function getHandler() {
      startCronJobs();
      return scheduled[2].fn;
    }

    it('logs the count when stuck jobs were auto-failed', async () => {
      deployJobUpdateMany.mockResolvedValueOnce({ count: 2 });

      await getHandler()();

      expect(deployJobUpdateMany).toHaveBeenCalledWith({
        where: {
          status: 'processing',
          started_at: { lt: expect.any(Date) },
        },
        data: { status: 'failed', error: 'Job timed out after 30 minutes' },
      });
      expect(logSpy).toHaveBeenCalledWith('Auto-failed 2 stuck deploy jobs');
    });

    it('does not log when no stuck jobs were found', async () => {
      deployJobUpdateMany.mockResolvedValueOnce({ count: 0 });

      await getHandler()();

      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('stuck deploy jobs'));
    });

    it('logs error and does not throw when prisma rejects', async () => {
      deployJobUpdateMany.mockRejectedValueOnce(new Error('boom'));

      await expect(getHandler()()).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalledWith('Cron: stuck job detection error:', 'boom');
    });
  });

  describe('5-min canvas deployment stalled watchdog', () => {
    function getHandler() {
      startCronJobs();
      return scheduled[3].fn;
    }

    it('does nothing and emits no warn when no candidates are found', async () => {
      canvasDeploymentFindMany.mockResolvedValueOnce([]);

      await getHandler()();

      expect(canvasDeploymentUpdate).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('skips candidates whose last event is within IDLE_THRESHOLD_MS (still alive)', async () => {
      const now = Date.now();
      canvasDeploymentFindMany.mockResolvedValueOnce([
        {
          id: 'dep-alive',
          created_at: new Date(now - 60 * 60 * 1000), // 60m ago
          card_id: 'card-1',
          environment: 'prod',
        },
      ]);
      // Last event was 1 minute ago — under IDLE_THRESHOLD_MS (5m)
      deployEventFindFirst.mockResolvedValueOnce({
        created_at: new Date(now - 60 * 1000),
        type: 'log',
        payload: {},
      });

      await getHandler()();

      expect(canvasDeploymentUpdate).not.toHaveBeenCalled();
      expect(deployEventFindMany).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('falls back to created_at when no event exists, then marks deploy failed', async () => {
      const now = Date.now();
      canvasDeploymentFindMany.mockResolvedValueOnce([
        {
          id: 'dep-orphan',
          created_at: new Date(now - 60 * 60 * 1000), // 60m ago — exceeds idle threshold
          card_id: 'card-1',
          environment: 'prod',
        },
      ]);
      deployEventFindFirst.mockResolvedValueOnce(null);
      deployEventFindMany.mockResolvedValueOnce([]);
      canvasDeploymentUpdate.mockResolvedValueOnce({});

      await getHandler()();

      expect(canvasDeploymentUpdate).toHaveBeenCalledWith({
        where: { id: 'dep-orphan' },
        data: {
          status: 'failed',
          error: expect.stringContaining('Deploy stopped emitting events'),
        },
      });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[watchdog] marked 1/1 stalled deployments as failed'),
      );
    });

    it('appends tail body when there are tail events with message payloads', async () => {
      const now = Date.now();
      canvasDeploymentFindMany.mockResolvedValueOnce([
        {
          id: 'dep-stalled',
          created_at: new Date(now - 60 * 60 * 1000),
          card_id: 'card-1',
          environment: 'prod',
        },
      ]);
      deployEventFindFirst.mockResolvedValueOnce({
        created_at: new Date(now - 30 * 60 * 1000), // 30m ago — past idle threshold
        type: 'log',
        payload: {},
      });
      // Mix of payload shapes: message, resource+status, result.error, empty (filtered out)
      deployEventFindMany.mockResolvedValueOnce([
        { type: 'log', payload: { message: 'Building image' }, created_at: new Date(now - 30 * 60 * 1000) },
        {
          type: 'progress',
          payload: { resource: 'gcp.run.service:web', status: 'started' },
          created_at: new Date(now - 31 * 60 * 1000),
        },
        {
          type: 'resource_result',
          payload: { result: { error: 'image build failed' } },
          created_at: new Date(now - 32 * 60 * 1000),
        },
        { type: 'log', payload: null, created_at: new Date(now - 33 * 60 * 1000) }, // filtered
      ]);
      canvasDeploymentUpdate.mockResolvedValueOnce({});

      await getHandler()();

      const updateCall = canvasDeploymentUpdate.mock.calls[0][0];
      expect(updateCall.data.error).toContain('Last activity (3 events)');
      expect(updateCall.data.error).toContain('[log] Building image');
      expect(updateCall.data.error).toContain('[progress] started: gcp.run.service:web');
      expect(updateCall.data.error).toContain('[resource_result] image build failed');
    });

    it('skips one candidate and kills another in the same pass', async () => {
      const now = Date.now();
      canvasDeploymentFindMany.mockResolvedValueOnce([
        {
          id: 'dep-alive',
          created_at: new Date(now - 60 * 60 * 1000),
          card_id: 'card-1',
          environment: 'prod',
        },
        {
          id: 'dep-dead',
          created_at: new Date(now - 60 * 60 * 1000),
          card_id: 'card-2',
          environment: 'staging',
        },
      ]);
      // First: recent event — skip
      deployEventFindFirst.mockResolvedValueOnce({
        created_at: new Date(now - 30 * 1000),
        type: 'log',
        payload: {},
      });
      // Second: stale event — kill
      deployEventFindFirst.mockResolvedValueOnce({
        created_at: new Date(now - 30 * 60 * 1000),
        type: 'log',
        payload: {},
      });
      deployEventFindMany.mockResolvedValueOnce([]);
      canvasDeploymentUpdate.mockResolvedValueOnce({});

      await getHandler()();

      expect(canvasDeploymentUpdate).toHaveBeenCalledTimes(1);
      expect(canvasDeploymentUpdate).toHaveBeenCalledWith({
        where: { id: 'dep-dead' },
        data: { status: 'failed', error: expect.any(String) },
      });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[watchdog] marked 1/2 stalled deployments as failed'),
      );
    });

    it('logs error and does not throw when prisma findMany rejects', async () => {
      canvasDeploymentFindMany.mockRejectedValueOnce(new Error('canvas down'));

      await expect(getHandler()()).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalledWith('Cron: stuck canvas deployment detection error:', 'canvas down');
    });
  });

  describe('daily webhook delivery prune (4am)', () => {
    function getHandler() {
      startCronJobs();
      return scheduled[4].fn;
    }

    it('logs the count when old webhook deliveries were pruned', async () => {
      webhookDeliveryDeleteMany.mockResolvedValueOnce({ count: 11 });

      await getHandler()();

      expect(webhookDeliveryDeleteMany).toHaveBeenCalledWith({
        where: { created_at: { lt: expect.any(Date) } },
      });
      expect(logSpy).toHaveBeenCalledWith('Pruned 11 old webhook delivery records');
    });

    it('does not log when no webhook deliveries were old enough', async () => {
      webhookDeliveryDeleteMany.mockResolvedValueOnce({ count: 0 });

      await getHandler()();

      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('old webhook delivery records'));
    });

    it('logs error and does not throw when prisma rejects', async () => {
      webhookDeliveryDeleteMany.mockRejectedValueOnce(new Error('webhook down'));

      await expect(getHandler()()).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalledWith('Cron: webhook delivery prune error:', 'webhook down');
    });
  });
});

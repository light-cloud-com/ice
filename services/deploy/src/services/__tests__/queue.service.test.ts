/**
 * Unit tests for `services/deploy/src/services/queue.service.ts` —
 * the BullMQ-backed async deploy queue with InMemoryQueue/InMemoryWorker
 * fallback for desktop / no-Redis environments.
 *
 * Per the `deploy-service-tests-must-import-vitest-explicitly` learning,
 * vitest globals are imported explicitly. Per
 * `vi-hoisted-required-for-shared-mock-identities-across-many-vi-mock-calls`,
 * shared mock state lives in a `vi.hoisted` block so each `vi.mock` factory
 * sees the same identity.
 *
 * Module-init branching (Redis vs in-memory) is decided at module load by
 * `process.env.REDIS_URL` / `ICE_DESKTOP`. Tests that exercise the Redis
 * path call `vi.resetModules()` then re-`import` after setting the env so
 * the SUT's module-scoped `USE_MEMORY_QUEUE` constant is recomputed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => {
  // BullMQ Queue mock — captures construction args so tests can assert
  // the SUT picked Redis when expected.
  const QueueAddMock = vi.fn(async () => ({ id: 'bull-job-1' }));
  const QueueCtorMock = vi.fn();
  class MockQueue {
    name: string;
    opts: any;
    add = QueueAddMock;
    constructor(name: string, opts: any) {
      this.name = name;
      this.opts = opts;
      QueueCtorMock(name, opts);
    }
  }

  // BullMQ Worker mock — captures the processor + lets tests register
  // event handlers.
  const WorkerCtorMock = vi.fn();
  const WorkerHandlers: { completed: any[]; failed: any[] } = { completed: [], failed: [] };
  class MockWorker {
    name: string;
    processor: any;
    opts: any;
    constructor(name: string, processor: any, opts: any) {
      this.name = name;
      this.processor = processor;
      this.opts = opts;
      WorkerCtorMock(name, processor, opts);
    }
    on(event: 'completed' | 'failed', handler: any): void {
      WorkerHandlers[event].push(handler);
    }
  }

  // ioredis mock — captures the ctor args + retryStrategy so the
  // back-off branch is testable.
  const IORedisCtorMock = vi.fn();
  class MockIORedis {
    handlers: Record<string, any> = {};
    opts: any;
    url: string;
    constructor(url: string, opts: any) {
      this.url = url;
      this.opts = opts;
      IORedisCtorMock(url, opts);
    }
    on(event: string, handler: any): void {
      this.handlers[event] = handler;
    }
  }

  // memory-queue mock — same shape as the real classes but trivial; we
  // only need identity + processor capture so the test can drive the
  // worker lifecycle.
  class MockInMemoryQueue {
    name = 'memory';
    add = vi.fn(async () => ({ id: 'mem-job-1' }));
  }
  const InMemQueueCtorMock = vi.fn();
  class MockInMemoryQueueWrap {
    add: any;
    constructor() {
      InMemQueueCtorMock();
      this.add = (...a: any[]) => {
        InMemQueueAddMock(...a);
        return Promise.resolve({ id: 'mem-job-1' });
      };
    }
  }
  const InMemQueueAddMock = vi.fn();
  class MockInMemoryWorker {
    static instances: any[] = [];
    name: string;
    processor: any;
    handlers: Record<string, any> = {};
    bound: any = null;
    constructor(name: string, processor: any) {
      this.name = name;
      this.processor = processor;
      MockInMemoryWorker.instances.push(this);
    }
    on(event: 'completed' | 'failed', handler: any): void {
      this.handlers[event] = handler;
    }
    _bind(queue: any): void {
      this.bound = queue;
    }
  }

  // Prisma mock — DeployJob + canvasDeployment + canvasProject + canvasCard.
  const prismaMock = {
    canvasDeployment: { create: vi.fn(), update: vi.fn() },
    deployJob: { create: vi.fn(), update: vi.fn() },
    canvasProject: { findFirst: vi.fn() },
    canvasCard: { findFirst: vi.fn() },
  };

  return {
    QueueAddMock,
    QueueCtorMock,
    MockQueue,
    WorkerCtorMock,
    WorkerHandlers,
    MockWorker,
    IORedisCtorMock,
    MockIORedis,
    MockInMemoryQueueWrap,
    InMemQueueCtorMock,
    InMemQueueAddMock,
    MockInMemoryWorker,
    prismaMock,
    emitDeployLogMock: vi.fn(),
    emitPipelineUpdateMock: vi.fn(),
    buildFromSourceMock: vi.fn(),
    cleanupBuildMock: vi.fn(),
    applyDeploymentMock: vi.fn(),
    updateEventProgressMock: vi.fn(),
    failEventMock: vi.fn(),
    resolveEnvironmentCardIdMock: vi.fn(),
  };
});

vi.mock('bullmq', () => ({
  Queue: mocks.MockQueue,
  Worker: mocks.MockWorker,
}));

vi.mock('ioredis', () => ({
  default: mocks.MockIORedis,
}));

vi.mock('@ice/db', () => ({
  default: mocks.prismaMock,
}));

vi.mock('@ice/shared', () => ({
  emitDeployLog: mocks.emitDeployLogMock,
  emitPipelineUpdate: mocks.emitPipelineUpdateMock,
}));

vi.mock('../build.service', () => ({
  buildFromSource: mocks.buildFromSourceMock,
  cleanupBuild: mocks.cleanupBuildMock,
}));

vi.mock('../deploy.service', () => ({
  applyDeployment: mocks.applyDeploymentMock,
}));

vi.mock('../memory-queue', () => ({
  InMemoryQueue: mocks.MockInMemoryQueueWrap,
  InMemoryWorker: mocks.MockInMemoryWorker,
}));

vi.mock('../pipeline.service', () => ({
  updateEventProgress: mocks.updateEventProgressMock,
  failEvent: mocks.failEventMock,
  resolveEnvironmentCardId: mocks.resolveEnvironmentCardIdMock,
}));

const ORIGINAL_ENV = { ...process.env };

async function loadModule(env: Record<string, string | undefined>) {
  // Reset module registry so the SUT recomputes its `USE_MEMORY_QUEUE`
  // constant against the new env. Without this every test would see
  // whichever branch the FIRST import happened to lock in.
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV, ...env };
  // `delete` keys explicitly set to undefined so the SUT's `!REDIS_URL`
  // check actually sees absence rather than the string 'undefined'.
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete (process.env as any)[k];
  }
  return await import('../queue.service');
}

describe('queue.service', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.MockInMemoryWorker.instances.length = 0;
    mocks.WorkerHandlers.completed.length = 0;
    mocks.WorkerHandlers.failed.length = 0;
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Default mocks must return promises — the SUT chains `.catch(() => {})`
    // on the mid-batch updateEventProgress call to keep streaming tolerant
    // of transient DB hiccups; an undefined return throws TypeError.
    mocks.updateEventProgressMock.mockResolvedValue(undefined);
    mocks.failEventMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  // ─── emitBuildPhaseLog helper (indirectly via processor) ────────────────
  // The helper is module-private. The pipeline-job processor calls it on
  // each build-stage transition, so emitDeployLog is the observable.

  describe('module init / queue selection', () => {
    it('uses InMemoryQueue when REDIS_URL is unset', async () => {
      const mod = await loadModule({ REDIS_URL: undefined, ICE_DESKTOP: undefined });
      const q = mod.getDeployQueue();
      expect(q).toBeDefined();
      expect(mocks.InMemQueueCtorMock).toHaveBeenCalledTimes(1);
      expect(mocks.QueueCtorMock).not.toHaveBeenCalled();
      // Console log announces in-memory mode.
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Using in-memory deploy queue'),
      );
    });

    it('uses InMemoryQueue when ICE_DESKTOP=true even if REDIS_URL is set', async () => {
      const mod = await loadModule({ REDIS_URL: 'redis://localhost:6379', ICE_DESKTOP: 'true' });
      mod.getDeployQueue();
      expect(mocks.InMemQueueCtorMock).toHaveBeenCalledTimes(1);
      expect(mocks.QueueCtorMock).not.toHaveBeenCalled();
    });

    it('constructs BullMQ Queue + IORedis when REDIS_URL is set and not desktop', async () => {
      const mod = await loadModule({ REDIS_URL: 'redis://prod:6379', ICE_DESKTOP: undefined });
      mod.getDeployQueue();
      expect(mocks.QueueCtorMock).toHaveBeenCalledTimes(1);
      expect(mocks.QueueCtorMock).toHaveBeenCalledWith(
        'deploy',
        expect.objectContaining({ connection: expect.any(Object) }),
      );
      expect(mocks.IORedisCtorMock).toHaveBeenCalledTimes(1);
      expect(mocks.IORedisCtorMock).toHaveBeenCalledWith(
        'redis://prod:6379',
        expect.objectContaining({ maxRetriesPerRequest: null }),
      );
    });

    it('returns the same queue instance on repeated getDeployQueue calls', async () => {
      const mod = await loadModule({ REDIS_URL: undefined });
      const q1 = mod.getDeployQueue();
      const q2 = mod.getDeployQueue();
      expect(q1).toBe(q2);
      expect(mocks.InMemQueueCtorMock).toHaveBeenCalledTimes(1);
    });

    it('reuses the IORedis connection across getDeployQueue + worker', async () => {
      const mod = await loadModule({ REDIS_URL: 'redis://prod:6379' });
      mod.getDeployQueue();
      mod.startDeployWorker();
      // First IORedis ctor call from queue, second NOT triggered — connection cached.
      expect(mocks.IORedisCtorMock).toHaveBeenCalledTimes(1);
    });

    it('retryStrategy returns null after 3 attempts and warns', async () => {
      await loadModule({ REDIS_URL: 'redis://prod:6379' });
      const { default: _Module } = await import('../queue.service').then((m) => ({
        default: m,
      }));
      _Module.getDeployQueue();
      const opts = mocks.IORedisCtorMock.mock.calls[0][1];
      expect(opts.retryStrategy(4)).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Redis not available'),
      );
    });

    it('retryStrategy backs off with capped delay below the threshold', async () => {
      await loadModule({ REDIS_URL: 'redis://prod:6379' });
      const mod = await import('../queue.service');
      mod.getDeployQueue();
      const opts = mocks.IORedisCtorMock.mock.calls[0][1];
      expect(opts.retryStrategy(1)).toBe(500);
      expect(opts.retryStrategy(3)).toBe(1500);
      // The cap is 3000 — a high `times` would exceed it but the SUT short-circuits
      // first via the >3 branch, so we test the cap by computing manually.
      // (`Math.min(7 * 500, 3000) = 3000`, but >3 returns null first.)
    });
  });

  describe('queueDeployment', () => {
    it('creates deployment + DeployJob rows and enqueues with attempts=3', async () => {
      const mod = await loadModule({ REDIS_URL: undefined });
      mocks.prismaMock.canvasDeployment.create.mockResolvedValue({ id: 'dep-1' });
      mocks.prismaMock.deployJob.create.mockResolvedValue({ id: 'job-1' });

      const result = await mod.queueDeployment(
        'card-A',
        [{ id: 'n1' }],
        [{ id: 'e1' }],
        { provider: 'gcp', region: 'us-east1', environment: 'production' },
        'org-1',
        'user-1',
      );

      expect(result).toEqual({ success: true, deploymentId: 'dep-1', jobId: 'job-1' });

      expect(mocks.prismaMock.canvasDeployment.create).toHaveBeenCalledWith({
        data: {
          card_id: 'card-A',
          user_id: 'user-1',
          status: 'queued',
          provider: 'gcp',
          region: 'us-east1',
          environment: 'production',
        },
      });

      expect(mocks.prismaMock.deployJob.create).toHaveBeenCalledWith({
        data: { deployment_id: 'dep-1', status: 'queued' },
      });

      expect(mocks.InMemQueueAddMock).toHaveBeenCalledWith(
        'deploy',
        expect.objectContaining({
          cardId: 'card-A',
          jobId: 'job-1',
          deploymentId: 'dep-1',
          orgId: 'org-1',
          userId: 'user-1',
        }),
        expect.objectContaining({
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        }),
      );
    });

    it('falls back to gcp/us-central1/development defaults when options are empty', async () => {
      const mod = await loadModule({ REDIS_URL: undefined });
      mocks.prismaMock.canvasDeployment.create.mockResolvedValue({ id: 'dep-2' });
      mocks.prismaMock.deployJob.create.mockResolvedValue({ id: 'job-2' });

      await mod.queueDeployment('card-B', [], [], {}, 'org-2');

      expect(mocks.prismaMock.canvasDeployment.create).toHaveBeenCalledWith({
        data: {
          card_id: 'card-B',
          user_id: undefined,
          status: 'queued',
          provider: 'gcp',
          region: 'us-central1',
          environment: 'development',
        },
      });
    });
  });

  describe('startDeployWorker — in-memory branch', () => {
    it('binds an InMemoryWorker to the queue and registers completed/failed handlers', async () => {
      const mod = await loadModule({ REDIS_URL: undefined });
      const queue = mod.getDeployQueue();
      const worker = mod.startDeployWorker();

      expect(worker).not.toBeNull();
      expect(mocks.MockInMemoryWorker.instances).toHaveLength(1);
      expect(mocks.MockInMemoryWorker.instances[0].bound).toBe(queue);
      expect(mocks.MockInMemoryWorker.instances[0].handlers.completed).toBeTypeOf('function');
      expect(mocks.MockInMemoryWorker.instances[0].handlers.failed).toBeTypeOf('function');
    });
  });

  describe('startDeployWorker — bullmq branch', () => {
    it('constructs a BullMQ Worker with concurrency 3 when Redis is configured', async () => {
      const mod = await loadModule({ REDIS_URL: 'redis://prod:6379' });
      mod.startDeployWorker();
      expect(mocks.WorkerCtorMock).toHaveBeenCalledTimes(1);
      const [name, _processor, opts] = mocks.WorkerCtorMock.mock.calls[0];
      expect(name).toBe('deploy');
      expect(opts).toMatchObject({ concurrency: 3 });
    });

    it('returns null and warns when Worker construction throws', async () => {
      const mod = await loadModule({ REDIS_URL: 'redis://prod:6379' });
      // Force the next Worker construction to blow up.
      mocks.WorkerCtorMock.mockImplementationOnce(() => {
        throw new Error('redis offline');
      });
      const worker = mod.startDeployWorker();
      expect(worker).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Deploy worker not started'),
        'redis offline',
      );
    });
  });

  describe('worker processor — deploy job (non-pipeline)', () => {
    it('walks build → deploy lifecycle, marks DeployJob processing, then calls applyDeployment', async () => {
      const mod = await loadModule({ REDIS_URL: undefined });
      mod.startDeployWorker();
      const worker = mocks.MockInMemoryWorker.instances[0];

      mocks.applyDeploymentMock.mockResolvedValue({ success: true });

      const job = {
        attemptsMade: 0,
        data: {
          cardId: 'card-A',
          nodes: [{ id: 'n1' }],
          edges: [{ id: 'e1' }],
          options: { provider: 'gcp' },
          orgId: 'org-1',
          userId: 'user-1',
          jobId: 'job-1',
          deploymentId: 'dep-1',
        },
      };

      await worker.processor(job);

      expect(mocks.prismaMock.deployJob.update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: expect.objectContaining({ status: 'processing', attempts: 1 }),
      });
      expect(mocks.prismaMock.canvasDeployment.update).toHaveBeenCalledWith({
        where: { id: 'dep-1' },
        data: { status: 'deploying' },
      });
      // executeAsync forced to false so the processor blocks until apply finishes.
      expect(mocks.applyDeploymentMock).toHaveBeenCalledWith(
        'card-A',
        [{ id: 'n1' }],
        [{ id: 'e1' }],
        expect.objectContaining({ provider: 'gcp', executeAsync: false }),
        'org-1',
        'user-1',
      );
    });

    it('completed handler marks the DeployJob completed', async () => {
      const mod = await loadModule({ REDIS_URL: undefined });
      mod.startDeployWorker();
      const worker = mocks.MockInMemoryWorker.instances[0];
      mocks.prismaMock.deployJob.update.mockResolvedValue({});

      await worker.handlers.completed({ data: { jobId: 'job-1' } } as any);

      expect(mocks.prismaMock.deployJob.update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: expect.objectContaining({ status: 'completed' }),
      });
    });

    it('completed handler swallows DB errors so unrelated job processing continues', async () => {
      const mod = await loadModule({ REDIS_URL: undefined });
      mod.startDeployWorker();
      const worker = mocks.MockInMemoryWorker.instances[0];
      mocks.prismaMock.deployJob.update.mockRejectedValueOnce(new Error('db gone'));

      await expect(
        worker.handlers.completed({ data: { jobId: 'job-1' } } as any),
      ).resolves.toBeUndefined();
    });

    it('completed handler skips DB write for pipeline jobs', async () => {
      const mod = await loadModule({ REDIS_URL: undefined });
      mod.startDeployWorker();
      const worker = mocks.MockInMemoryWorker.instances[0];

      await worker.handlers.completed({ data: { type: 'pipeline', eventId: 'evt-1' } } as any);

      expect(mocks.prismaMock.deployJob.update).not.toHaveBeenCalled();
    });

    it('failed handler marks DeployJob failed with the error message', async () => {
      const mod = await loadModule({ REDIS_URL: undefined });
      mod.startDeployWorker();
      const worker = mocks.MockInMemoryWorker.instances[0];
      mocks.prismaMock.deployJob.update.mockResolvedValue({});

      await worker.handlers.failed(
        { data: { jobId: 'job-1' } } as any,
        new Error('boom'),
      );

      expect(mocks.prismaMock.deployJob.update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: { status: 'failed', error: 'boom' },
      });
    });

    it('failed handler is a no-op when job is undefined', async () => {
      const mod = await loadModule({ REDIS_URL: undefined });
      mod.startDeployWorker();
      const worker = mocks.MockInMemoryWorker.instances[0];

      await worker.handlers.failed(undefined, new Error('boom'));

      expect(mocks.prismaMock.deployJob.update).not.toHaveBeenCalled();
      expect(mocks.failEventMock).not.toHaveBeenCalled();
    });

    it('failed handler routes pipeline jobs to failEvent and skips DB update', async () => {
      const mod = await loadModule({ REDIS_URL: undefined });
      mod.startDeployWorker();
      const worker = mocks.MockInMemoryWorker.instances[0];
      mocks.failEventMock.mockResolvedValue(undefined);

      await worker.handlers.failed(
        { data: { type: 'pipeline', eventId: 'evt-9' } } as any,
        new Error('build broke'),
      );

      expect(mocks.failEventMock).toHaveBeenCalledWith('evt-9', 'build broke');
      expect(mocks.prismaMock.deployJob.update).not.toHaveBeenCalled();
    });

    it('failed handler swallows DB errors on the deploy-job path', async () => {
      const mod = await loadModule({ REDIS_URL: undefined });
      mod.startDeployWorker();
      const worker = mocks.MockInMemoryWorker.instances[0];
      mocks.prismaMock.deployJob.update.mockRejectedValueOnce(new Error('db gone'));

      await expect(
        worker.handlers.failed({ data: { jobId: 'job-x' } } as any, new Error('boom')),
      ).resolves.toBeUndefined();
    });

    it('failed handler swallows failEvent rejections on the pipeline path', async () => {
      const mod = await loadModule({ REDIS_URL: undefined });
      mod.startDeployWorker();
      const worker = mocks.MockInMemoryWorker.instances[0];
      mocks.failEventMock.mockRejectedValueOnce(new Error('event-store gone'));

      await expect(
        worker.handlers.failed(
          { data: { type: 'pipeline', eventId: 'evt-z' } } as any,
          new Error('boom'),
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe('worker processor — pipeline job', () => {
    function basePipelineData() {
      return {
        type: 'pipeline',
        eventId: 'evt-1',
        cardId: 'card-A',
        nodeId: 'node-1',
        repository: 'org/repo',
        branch: 'main',
        commitSha: 'abc',
        environment: 'production',
        buildCommand: 'npm run build',
        installCommand: 'npm i',
        outputDir: 'dist',
        framework: 'next',
      };
    }

    function setupHappyPipeline() {
      mocks.prismaMock.canvasProject.findFirst.mockResolvedValue({
        organisation_id: 'org-1',
        created_by: 'user-1',
      });
      mocks.resolveEnvironmentCardIdMock.mockResolvedValue('card-A-prod');
      mocks.prismaMock.canvasCard.findFirst.mockResolvedValue({
        nodes: [
          {
            id: 'node-1',
            data: { provider: 'gcp', region: 'us-east1' },
          },
          {
            id: 'env-1',
            data: {
              iceType: 'Config.Environment',
              variables: [
                { name: 'API_KEY', value: 'secret' },
                { name: '', value: 'skip' },
              ],
            },
          },
          {
            id: 'dom-1',
            data: { iceType: 'Network.PublicEndpoint', hostname: 'app.example.com' },
          },
        ],
        edges: [
          { source: 'node-1', target: 'env-1' },
          { source: 'dom-1', target: 'node-1' },
        ],
      });
      mocks.applyDeploymentMock.mockResolvedValue({ success: true });
    }

    it('walks clone → install → build via the stage callback, mirroring each transition into the deploy feed', async () => {
      const mod = await loadModule({ REDIS_URL: undefined });
      mod.startDeployWorker();
      const worker = mocks.MockInMemoryWorker.instances[0];

      setupHappyPipeline();
      mocks.buildFromSourceMock.mockImplementation(async (_input, _by, onStage, _onLine) => {
        await onStage('clone', 'started', 'Cloning org/repo');
        await onStage('install', 'completed', 'deps installed');
        await onStage('build', 'started', 'Building');
        await onStage('other', 'completed', 'something else');
        return { success: true, buildDir: '/tmp/b', duration_ms: 12_000 };
      });

      await worker.processor({ attemptsMade: 0, data: basePipelineData() });

      // Each stage transition produces an updateEventProgress call AND a
      // build-phase log on the deploy feed.
      const stageLabels = mocks.updateEventProgressMock.mock.calls.map((c: any) => c[2]);
      expect(stageLabels).toContain('Downloading source...');
      expect(stageLabels).toContain('Installing dependencies...');
      expect(stageLabels).toContain('Building application...');
      expect(stageLabels).toContain('Building...');

      // emitDeployLog fires with a synthetic `DeployLogEvent` whose seq is
      // a Date.now() fallback (positive number).
      expect(mocks.emitDeployLogMock).toHaveBeenCalled();
      const logEvent = mocks.emitDeployLogMock.mock.calls[0][1];
      expect(logEvent).toMatchObject({
        type: 'log',
        card_id: 'card-A',
        level: 'info',
      });
      expect(logEvent.seq).toBeTypeOf('number');
      expect(logEvent.seq).toBeGreaterThan(0);
      expect(logEvent.message).toContain('[build:clone:started]');
    });

    it('streams individual build lines, batches every 10 into updateEventProgress, and flushes the tail', async () => {
      const mod = await loadModule({ REDIS_URL: undefined });
      mod.startDeployWorker();
      const worker = mocks.MockInMemoryWorker.instances[0];

      setupHappyPipeline();
      mocks.buildFromSourceMock.mockImplementation(async (_i, _b, _onStage, onLine) => {
        // 12 lines → batch of 10 + tail of 2 (flushed after build returns).
        for (let i = 0; i < 12; i++) await onLine(`line-${i}`);
        return { success: true, buildDir: '/tmp/b', duration_ms: 5000 };
      });

      await worker.processor({ attemptsMade: 0, data: basePipelineData() });

      // Per-line socket emit + per-line build-phase log.
      expect(mocks.emitPipelineUpdateMock).toHaveBeenCalledTimes(12);
      const buildLineLogs = mocks.emitDeployLogMock.mock.calls.filter((c: any) =>
        c[1].message.startsWith('[build] '),
      );
      expect(buildLineLogs).toHaveLength(12);

      // Output batches: one mid-build (10-line batch) + one tail flush (2 lines).
      const outputCalls = mocks.updateEventProgressMock.mock.calls.filter(
        (c: any) => c[3]?.step === 'output',
      );
      expect(outputCalls).toHaveLength(2);
      // Mid-batch is in 'started' state.
      expect(outputCalls[0][3].status).toBe('started');
      // Tail flush is 'completed'.
      expect(outputCalls[1][3].status).toBe('completed');
    });

    it('skips the tail flush when the build emitted no log lines', async () => {
      const mod = await loadModule({ REDIS_URL: undefined });
      mod.startDeployWorker();
      const worker = mocks.MockInMemoryWorker.instances[0];

      setupHappyPipeline();
      mocks.buildFromSourceMock.mockResolvedValue({
        success: true,
        buildDir: '/tmp/b',
        duration_ms: 1000,
      });

      await worker.processor({ attemptsMade: 0, data: basePipelineData() });

      const outputCalls = mocks.updateEventProgressMock.mock.calls.filter(
        (c: any) => c[3]?.step === 'output',
      );
      expect(outputCalls).toHaveLength(0);
    });

    it('survives emitDeployLog throwing inside the stage callback (non-fatal UX nicety)', async () => {
      const mod = await loadModule({ REDIS_URL: undefined });
      mod.startDeployWorker();
      const worker = mocks.MockInMemoryWorker.instances[0];

      setupHappyPipeline();
      mocks.emitDeployLogMock.mockImplementationOnce(() => {
        throw new Error('socket gone');
      });
      mocks.buildFromSourceMock.mockImplementation(async (_i, _b, onStage) => {
        await onStage('clone', 'started', 'Cloning');
        return { success: true, buildDir: '/tmp/b', duration_ms: 1000 };
      });

      await expect(
        worker.processor({ attemptsMade: 0, data: basePipelineData() }),
      ).resolves.toBeUndefined();
    });

    it('runs applyDeployment with envVars + customDomain harvested from connected blocks', async () => {
      const mod = await loadModule({ REDIS_URL: undefined });
      mod.startDeployWorker();
      const worker = mocks.MockInMemoryWorker.instances[0];

      setupHappyPipeline();
      mocks.buildFromSourceMock.mockResolvedValue({
        success: true,
        buildDir: '/tmp/b',
        duration_ms: 12_000,
      });

      await worker.processor({ attemptsMade: 0, data: basePipelineData() });

      expect(mocks.applyDeploymentMock).toHaveBeenCalledWith(
        'card-A-prod',
        expect.any(Array),
        expect.any(Array),
        expect.objectContaining({
          provider: 'gcp',
          region: 'us-east1',
          environment: 'production',
          envVars: { API_KEY: 'secret' },
          customDomain: 'app.example.com',
          executeAsync: false,
        }),
        'org-1',
        'user-1',
      );
    });

    it('omits envVars when no Config.Environment block is connected', async () => {
      const mod = await loadModule({ REDIS_URL: undefined });
      mod.startDeployWorker();
      const worker = mocks.MockInMemoryWorker.instances[0];

      mocks.prismaMock.canvasProject.findFirst.mockResolvedValue({
        organisation_id: 'org-1',
        created_by: 'user-1',
      });
      mocks.resolveEnvironmentCardIdMock.mockResolvedValue('card-A');
      mocks.prismaMock.canvasCard.findFirst.mockResolvedValue({
        nodes: [{ id: 'node-1', data: {} }],
        edges: [],
      });
      mocks.buildFromSourceMock.mockResolvedValue({
        success: true,
        buildDir: '/tmp/b',
        duration_ms: 1000,
      });
      mocks.applyDeploymentMock.mockResolvedValue({ success: true });

      await worker.processor({ attemptsMade: 0, data: basePipelineData() });

      const opts = mocks.applyDeploymentMock.mock.calls[0][3];
      expect(opts.envVars).toBeUndefined();
      expect(opts.customDomain).toBeUndefined();
      // Default region falls back to us-central1 when targetNode lacks one.
      expect(opts.region).toBe('us-central1');
      expect(opts.provider).toBe('gcp');
    });

    it('supports the subdomain fallback on Network.PublicEndpoint when hostname is absent', async () => {
      const mod = await loadModule({ REDIS_URL: undefined });
      mod.startDeployWorker();
      const worker = mocks.MockInMemoryWorker.instances[0];

      mocks.prismaMock.canvasProject.findFirst.mockResolvedValue({
        organisation_id: 'org-1',
        created_by: 'user-1',
      });
      mocks.resolveEnvironmentCardIdMock.mockResolvedValue('card-A');
      mocks.prismaMock.canvasCard.findFirst.mockResolvedValue({
        nodes: [
          { id: 'node-1', data: {} },
          {
            id: 'dom-1',
            data: { iceType: 'Network.PublicEndpoint', subdomain: 'sub' },
          },
        ],
        edges: [{ target: 'node-1', source: 'dom-1' }],
      });
      mocks.buildFromSourceMock.mockResolvedValue({
        success: true,
        buildDir: '/tmp/b',
        duration_ms: 1000,
      });
      mocks.applyDeploymentMock.mockResolvedValue({ success: true });

      await worker.processor({ attemptsMade: 0, data: basePipelineData() });

      expect(mocks.applyDeploymentMock.mock.calls[0][3].customDomain).toBe('sub');
    });

    it('records success then runs cleanupBuild in finally on the happy path', async () => {
      const mod = await loadModule({ REDIS_URL: undefined });
      mod.startDeployWorker();
      const worker = mocks.MockInMemoryWorker.instances[0];

      setupHappyPipeline();
      mocks.buildFromSourceMock.mockResolvedValue({
        success: true,
        buildDir: '/tmp/build-A',
        duration_ms: 12_000,
      });

      await worker.processor({ attemptsMade: 0, data: basePipelineData() });

      expect(mocks.cleanupBuildMock).toHaveBeenCalledWith('/tmp/build-A');
      // Final updateEventProgress call should be the success row.
      const lastCall =
        mocks.updateEventProgressMock.mock.calls[
          mocks.updateEventProgressMock.mock.calls.length - 1
        ];
      expect(lastCall[1]).toBe('success');
      expect(lastCall[2]).toBe('Deployment complete');
    });

    it('throws when no project is found for the card', async () => {
      const mod = await loadModule({ REDIS_URL: undefined });
      mod.startDeployWorker();
      const worker = mocks.MockInMemoryWorker.instances[0];

      mocks.prismaMock.canvasProject.findFirst.mockResolvedValue(null);

      await expect(
        worker.processor({ attemptsMade: 0, data: basePipelineData() }),
      ).rejects.toThrow(/Project not found/);
      // No build was attempted, so cleanup should not have run.
      expect(mocks.cleanupBuildMock).not.toHaveBeenCalled();
    });

    it('throws when buildFromSource reports success=false, surfaces the build error, still cleans up', async () => {
      const mod = await loadModule({ REDIS_URL: undefined });
      mod.startDeployWorker();
      const worker = mocks.MockInMemoryWorker.instances[0];

      setupHappyPipeline();
      mocks.buildFromSourceMock.mockResolvedValue({
        success: false,
        buildDir: '/tmp/failed',
        duration_ms: 1000,
        error: 'install failed',
      });

      await expect(
        worker.processor({ attemptsMade: 0, data: basePipelineData() }),
      ).rejects.toThrow('install failed');
      expect(mocks.cleanupBuildMock).toHaveBeenCalledWith('/tmp/failed');
      // updateEventProgress called with 'failed' phase before the rethrow.
      const failed = mocks.updateEventProgressMock.mock.calls.find(
        (c: any) => c[1] === 'failed',
      );
      expect(failed).toBeDefined();
      expect(String(failed?.[2])).toContain('install failed');
    });

    it("falls back to 'Build failed' when buildResult.error is empty", async () => {
      const mod = await loadModule({ REDIS_URL: undefined });
      mod.startDeployWorker();
      const worker = mocks.MockInMemoryWorker.instances[0];

      setupHappyPipeline();
      mocks.buildFromSourceMock.mockResolvedValue({
        success: false,
        buildDir: null,
        duration_ms: 1000,
      });

      await expect(
        worker.processor({ attemptsMade: 0, data: basePipelineData() }),
      ).rejects.toThrow('Build failed');
      // buildDir is null so cleanup is skipped.
      expect(mocks.cleanupBuildMock).not.toHaveBeenCalled();
    });

    it('throws when the resolved card cannot be loaded', async () => {
      const mod = await loadModule({ REDIS_URL: undefined });
      mod.startDeployWorker();
      const worker = mocks.MockInMemoryWorker.instances[0];

      mocks.prismaMock.canvasProject.findFirst.mockResolvedValue({
        organisation_id: 'org-1',
        created_by: 'user-1',
      });
      mocks.resolveEnvironmentCardIdMock.mockResolvedValue('card-missing');
      mocks.prismaMock.canvasCard.findFirst.mockResolvedValue(null);
      mocks.buildFromSourceMock.mockResolvedValue({
        success: true,
        buildDir: '/tmp/b',
        duration_ms: 1000,
      });

      await expect(
        worker.processor({ attemptsMade: 0, data: basePipelineData() }),
      ).rejects.toThrow(/not found/);
      expect(mocks.cleanupBuildMock).toHaveBeenCalledWith('/tmp/b');
    });

    it('rethrows applyDeployment failures and still cleans up the build directory', async () => {
      const mod = await loadModule({ REDIS_URL: undefined });
      mod.startDeployWorker();
      const worker = mocks.MockInMemoryWorker.instances[0];

      setupHappyPipeline();
      mocks.buildFromSourceMock.mockResolvedValue({
        success: true,
        buildDir: '/tmp/b',
        duration_ms: 1000,
      });
      mocks.applyDeploymentMock.mockRejectedValue(new Error('apply blew up'));

      await expect(
        worker.processor({ attemptsMade: 0, data: basePipelineData() }),
      ).rejects.toThrow('apply blew up');
      expect(mocks.cleanupBuildMock).toHaveBeenCalledWith('/tmp/b');
      const failed = mocks.updateEventProgressMock.mock.calls.find(
        (c: any) => c[1] === 'failed',
      );
      expect(failed).toBeDefined();
    });

    it('handles default commit/install/build/output when omitted from job data', async () => {
      const mod = await loadModule({ REDIS_URL: undefined });
      mod.startDeployWorker();
      const worker = mocks.MockInMemoryWorker.instances[0];

      setupHappyPipeline();
      mocks.buildFromSourceMock.mockResolvedValue({
        success: true,
        buildDir: '/tmp/b',
        duration_ms: 1000,
      });

      const data = {
        type: 'pipeline',
        eventId: 'evt-2',
        cardId: 'card-A',
        nodeId: 'node-1',
        repository: 'org/repo',
        branch: 'main',
        environment: 'production',
        // commitSha, installCommand, buildCommand, outputDir, framework all omitted
      };

      await worker.processor({ attemptsMade: 0, data });

      // buildFromSource receives null for the missing optional knobs and
      // 'HEAD' as the commit fallback.
      const buildInput = mocks.buildFromSourceMock.mock.calls[0][0];
      expect(buildInput).toMatchObject({
        commitSha: 'HEAD',
        installCommand: null,
        buildCommand: null,
        outputDir: null,
        framework: null,
      });
    });
  });
});

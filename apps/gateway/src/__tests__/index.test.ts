/**
 * Tests for `apps/gateway/src/index.ts` — the gateway service entrypoint.
 *
 * The module is a "side-effect bootstrap": every import statement runs
 * top-level code that wires middleware, mounts service routers, registers
 * signal handlers, schedules a `setInterval` CPU sampler, opens a Socket.IO
 * server, and calls `httpServer.listen(...)`.
 *
 * Strategy: mock every workspace package and every node-builtin/third-party
 * dep that performs I/O. Capture the express app via the `http.createServer`
 * mock — `createServer(listener)` is invoked with the express app, so the
 * listener IS our handle to run requests through (express apps are valid
 * `(req, res) => void` request listeners). Capture `httpServer.listen`,
 * `setInterval`, `process.on` callbacks via hoisted spies and invoke them
 * manually. Drive the auto-seed branches via the prisma mock; toggle
 * `existsSync` to flip between web-dist-serve / dev-skip / no-dist paths.
 *
 * The module's top-level `await` block (`await import('@ice/db')`, etc.)
 * runs before module-import resolves, so each `bootGateway()` call awaits
 * a fully-bootstrapped module. Per-test `vi.resetModules()` lets each
 * scenario flip mocks (NODE_ENV, prisma findFirst result, fs.existsSync)
 * before re-importing.
 *
 * Untestable surface: nothing material — the only paths we deliberately
 * skip are `process.exit(1)` from the uncaughtException handler (would
 * terminate vitest) and the inner `setTimeout(30_000).unref()` in the
 * `shutdown` flow (we assert the timer fires, not that it actually exits).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server as HttpServerType, IncomingMessage, ServerResponse } from 'http';

// ─── Hoisted bag of captured state ──────────────────────────────────────

const h = vi.hoisted(() => {
  type Listener = (...args: any[]) => any;

  /**
   * The fake http server returned by `createServer(listener)`. We capture
   * the listener (the express app) so tests can drive requests through it.
   */
  function makeFakeHttpServer(): {
    listenCalls: Array<{ port: number; cb?: () => void }>;
    closeCalls: Array<(cb?: () => void) => void>;
    listen: (port: number, cb?: () => void) => any;
    close: (cb?: () => void) => any;
    on: (...args: any[]) => any;
    address: () => any;
  } {
    const listenCalls: Array<{ port: number; cb?: () => void }> = [];
    const closeCalls: Array<(cb?: () => void) => void> = [];
    return {
      listenCalls,
      closeCalls,
      listen: vi.fn((port: number, cb?: () => void) => {
        listenCalls.push({ port, cb });
        // Don't fire cb synchronously here — tests drive it manually so
        // they can spy on console.log first.
        return undefined;
      }),
      close: vi.fn((cb?: () => void) => {
        closeCalls.push(cb ?? (() => {}));
        cb?.();
      }),
      on: vi.fn(),
      address: vi.fn(() => ({ port: 5001 })),
    };
  }

  const bag = {
    capturedAppListener: null as null | ((req: any, res: any) => void),
    fakeHttpServer: null as null | ReturnType<typeof makeFakeHttpServer>,
    socketIoListeners: {} as Record<string, Listener[]>,
    socketIoCloseCb: null as null | (() => void),
    socketIoConstructorArgs: [] as any[],
    setupSocketServiceCalls: [] as any[],
    setDesktopUserCalls: [] as Array<{ userId: string; orgId: string }>,
    intervalCallbacks: [] as Array<() => void>,
    intervalDurations: [] as number[],
    timeoutCallbacks: [] as Array<{ cb: () => void; ms: number; unref: any }>,
    processListeners: {} as Record<string, Listener[]>,
    /* the prisma findFirst response — null forces the create branch. */
    findFirstResult: null as null | { id: string; organisation_id: string },
    /* throw from prisma operations — drives the catch arm. */
    seedThrow: null as null | Error,
    organisationCreateResult: { id: 'org-1' },
    userCreateResult: { id: 'user-1', organisation_id: 'org-1' },
    /* execSync output toggles for getTreePids / getRss / getCpu. */
    psTreeThrows: false,
    psTreeOutput: '100 1\n101 100\n102 100\n', // root=100, no children of others
    psRssOutput: '4096\n2048\n',
    psCpuOutput: '50.0\n25.5\n',
    /* fs.existsSync return for webDistPath. */
    webDistExists: false,
    /* Local AI server methods. */
    startLocalAiResolves: true,
    stopLocalAiResolves: true,
    /* cleanupAllTempDirs throws? */
    cleanupThrows: false,
    /* startLocalAiServer error to surface from rejection. */
    startLocalAiError: null as null | Error,
    /* Captured setHeaders callback passed to express.static. */
    expressStaticSetHeaders: null as null | ((res: any, path: string) => void),
    expressStaticPath: null as null | string,
  };

  // ── Mocks defined inline so we can mutate `bag` per-test. ────────────

  const httpModule = {
    createServer: vi.fn((listener: any) => {
      bag.capturedAppListener = listener;
      bag.fakeHttpServer = makeFakeHttpServer();
      return bag.fakeHttpServer as unknown as HttpServerType;
    }),
    Server: class FakeHttpServer {},
  };

  class FakeSocketServer {
    constructor(...args: any[]) {
      bag.socketIoConstructorArgs = args;
    }
    on(channel: string, listener: Listener) {
      (bag.socketIoListeners[channel] ??= []).push(listener);
      return this;
    }
    close(cb?: () => void) {
      bag.socketIoCloseCb = cb ?? null;
      cb?.();
    }
  }

  const socketIoMod = {
    Server: FakeSocketServer,
  };

  const childProcessMod = {
    execSync: vi.fn((cmd: string) => {
      if (bag.psTreeThrows && cmd.includes('-e')) throw new Error('ps -e fail');
      if (cmd.startsWith('ps -e -o pid=,ppid=')) return bag.psTreeOutput;
      if (cmd.startsWith('ps -o rss=')) return bag.psRssOutput;
      if (cmd.startsWith('ps -o %cpu=')) return bag.psCpuOutput;
      return '';
    }),
  };

  const osMod = {
    cpus: vi.fn(() => [{}, {}, {}, {}]), // 4 cpus
  };

  const prismaMock = {
    user: {
      findFirst: vi.fn(async () => bag.findFirstResult),
      create: vi.fn(async () => bag.userCreateResult),
    },
    organisation: {
      create: vi.fn(async () => bag.organisationCreateResult),
    },
    organisationMember: {
      create: vi.fn(async () => ({})),
    },
  };

  const dbModule = {
    default: prismaMock,
  };

  // The middleware factories all return real express middleware but keep
  // a no-op shape — they need to be `(req, res, next) => next()` so the
  // express app can chain through them without external network calls.
  const noopMiddleware = (_req: any, _res: any, next: any) => next();
  const helmetMod = {
    default: vi.fn(() => noopMiddleware),
  };
  const corsMod = {
    default: vi.fn(() => noopMiddleware),
  };
  const cookieParserMod = {
    default: vi.fn(() => noopMiddleware),
  };
  const expressRateLimitMod = {
    rateLimit: vi.fn((opts: any) => {
      // Capture the keyGenerator so tests can probe the userId/ip/'unknown' branches.
      bag.rateLimitOpts = opts;
      return noopMiddleware;
    }),
  };

  // Each service router is a thin no-op; we DON'T use real express.Router
  // here because that pulls in the real express module again. A function
  // with `use` and `handle` properties (express duck-types middleware as
  // a function with `length === 3` for error vs. 2 for normal) works.
  function makeNoopRouter(): any {
    const fn: any = (req: any, res: any, next: any) => next();
    fn.use = vi.fn();
    fn.handle = (req: any, res: any, next: any) => next();
    return fn;
  }

  const serviceAiMod = { createAiRouter: vi.fn(() => makeNoopRouter()) };
  const serviceCanvasMod = { createCanvasRouter: vi.fn(() => makeNoopRouter()) };
  const serviceCredentialsMod = { createCredentialsRouter: vi.fn(() => makeNoopRouter()) };
  const serviceDeployMod = {
    createDeployRouter: vi.fn(() => makeNoopRouter()),
    startDeployWorker: vi.fn(),
    startCronJobs: vi.fn(),
    startRequirementPoller: vi.fn(),
    cleanupAllTempDirs: vi.fn(() => {
      if (bag.cleanupThrows) throw new Error('cleanup boom');
    }),
  };
  const serviceEngineMod = { createEngineRouter: vi.fn(() => makeNoopRouter()) };
  const serviceIamMod = { createIamRouter: vi.fn(() => makeNoopRouter()) };
  const sharedMod = {
    setupSocketService: vi.fn((io: any) => bag.setupSocketServiceCalls.push(io)),
    setDesktopUser: vi.fn((userId: string, orgId: string) =>
      bag.setDesktopUserCalls.push({ userId, orgId }),
    ),
  };
  const aiMod = {
    startLocalAiServer: vi.fn(() => {
      if (bag.startLocalAiError) return Promise.reject(bag.startLocalAiError);
      return bag.startLocalAiResolves ? Promise.resolve(undefined) : Promise.reject(new Error('start fail'));
    }),
    stopLocalAiServer: vi.fn(() => {
      return bag.stopLocalAiResolves ? Promise.resolve(undefined) : Promise.reject(new Error('stop fail'));
    }),
  };

  return {
    bag: bag as typeof bag & { rateLimitOpts?: any },
    httpModule,
    socketIoMod,
    FakeSocketServer,
    childProcessMod,
    osMod,
    prismaMock,
    dbModule,
    helmetMod,
    corsMod,
    cookieParserMod,
    expressRateLimitMod,
    serviceAiMod,
    serviceCanvasMod,
    serviceCredentialsMod,
    serviceDeployMod,
    serviceEngineMod,
    serviceIamMod,
    sharedMod,
    aiMod,
  };
});

// ── Module mocks ───────────────────────────────────────────────────────

/**
 * Wrap `express.static` to capture the `setHeaders` callback the SUT
 * passes. The callback is otherwise unreachable from outside express,
 * because express.static stores it inside a closure. We need to invoke
 * it directly to assert the `if (filePath.endsWith('index.html'))` branch.
 */
vi.mock('express', async () => {
  const actual = await vi.importActual<typeof import('express')>('express');
  const wrappedStatic = ((path: string, options?: any) => {
    h.bag.expressStaticPath = path;
    h.bag.expressStaticSetHeaders = options?.setHeaders ?? null;
    return actual.default.static(path, options);
  }) as unknown as typeof actual.default.static;
  // Reattach static-method properties so callers see the same shape.
  Object.assign(wrappedStatic, actual.default.static);

  // Re-export so the SUT's `import express from 'express'` keeps working.
  // express's default IS callable — wrap it to forward to actual but
  // patch `static` on the result.
  const wrappedDefault = Object.assign(
    function (this: unknown, ...args: any[]) {
      return (actual.default as any).apply(this, args);
    },
    actual.default,
    { static: wrappedStatic },
  ) as unknown as typeof actual.default;

  return {
    ...actual,
    default: wrappedDefault,
  };
});

vi.mock('http', () => h.httpModule);
vi.mock('socket.io', () => h.socketIoMod);
vi.mock('child_process', () => h.childProcessMod);
vi.mock('os', () => h.osMod);
vi.mock('helmet', () => h.helmetMod);
vi.mock('cors', () => h.corsMod);
vi.mock('cookie-parser', () => h.cookieParserMod);
vi.mock('express-rate-limit', () => h.expressRateLimitMod);
vi.mock('@ice/db', () => h.dbModule);
vi.mock('@ice/ai', () => h.aiMod);
vi.mock('@ice/shared', () => h.sharedMod);
vi.mock('@ice/service-ai', () => h.serviceAiMod);
vi.mock('@ice/service-canvas', () => h.serviceCanvasMod);
vi.mock('@ice/service-credentials', () => h.serviceCredentialsMod);
vi.mock('@ice/service-deploy', () => h.serviceDeployMod);
vi.mock('@ice/service-engine', () => h.serviceEngineMod);
vi.mock('@ice/service-iam', () => h.serviceIamMod);

// `dotenv/config` runs `dotenv.config()` as a side effect during import.
// It harmlessly tries to read `.env`. Stub to a no-op.
vi.mock('dotenv/config', () => ({}));

// ── Helpers ────────────────────────────────────────────────────────────

function resetBag(): void {
  h.bag.capturedAppListener = null;
  h.bag.fakeHttpServer = null;
  h.bag.socketIoListeners = {};
  h.bag.socketIoCloseCb = null;
  h.bag.socketIoConstructorArgs = [];
  h.bag.setupSocketServiceCalls = [];
  h.bag.setDesktopUserCalls = [];
  h.bag.intervalCallbacks = [];
  h.bag.intervalDurations = [];
  h.bag.timeoutCallbacks = [];
  h.bag.processListeners = {};
  h.bag.findFirstResult = null;
  h.bag.seedThrow = null;
  h.bag.organisationCreateResult = { id: 'org-1' };
  h.bag.userCreateResult = { id: 'user-1', organisation_id: 'org-1' };
  h.bag.psTreeThrows = false;
  h.bag.psTreeOutput = '100 1\n101 100\n102 100\n';
  h.bag.psRssOutput = '4096\n2048\n';
  h.bag.psCpuOutput = '50.0\n25.5\n';
  h.bag.webDistExists = false;
  h.bag.startLocalAiResolves = true;
  h.bag.stopLocalAiResolves = true;
  h.bag.cleanupThrows = false;
  h.bag.startLocalAiError = null;
  h.bag.rateLimitOpts = undefined;
  h.bag.expressStaticSetHeaders = null;
  h.bag.expressStaticPath = null;

  h.httpModule.createServer.mockClear();
  h.childProcessMod.execSync.mockClear();
  h.osMod.cpus.mockClear();
  h.helmetMod.default.mockClear();
  h.corsMod.default.mockClear();
  h.cookieParserMod.default.mockClear();
  h.expressRateLimitMod.rateLimit.mockClear();
  h.serviceAiMod.createAiRouter.mockClear();
  h.serviceCanvasMod.createCanvasRouter.mockClear();
  h.serviceCredentialsMod.createCredentialsRouter.mockClear();
  h.serviceDeployMod.createDeployRouter.mockClear();
  h.serviceDeployMod.startDeployWorker.mockClear();
  h.serviceDeployMod.startCronJobs.mockClear();
  h.serviceDeployMod.startRequirementPoller.mockClear();
  h.serviceDeployMod.cleanupAllTempDirs.mockClear();
  h.serviceEngineMod.createEngineRouter.mockClear();
  h.serviceIamMod.createIamRouter.mockClear();
  h.sharedMod.setupSocketService.mockClear();
  h.sharedMod.setDesktopUser.mockClear();
  h.aiMod.startLocalAiServer.mockClear();
  h.aiMod.stopLocalAiServer.mockClear();
  h.prismaMock.user.findFirst.mockClear();
  h.prismaMock.user.create.mockClear();
  h.prismaMock.organisation.create.mockClear();
  h.prismaMock.organisationMember.create.mockClear();

  // Re-prime findFirst / create mocks because mockClear nukes their impl.
  h.prismaMock.user.findFirst.mockImplementation(async () => {
    if (h.bag.seedThrow) throw h.bag.seedThrow;
    return h.bag.findFirstResult;
  });
  h.prismaMock.user.create.mockImplementation(async () => h.bag.userCreateResult);
  h.prismaMock.organisation.create.mockImplementation(async () => h.bag.organisationCreateResult);
  h.prismaMock.organisationMember.create.mockImplementation(async () => ({}));
}

/**
 * `process.on` registrations from the SUT (SIGTERM, SIGINT, uncaughtException)
 * would pile up on the real test-runner process. Capture them in `bag.processListeners`
 * so they're invocable but don't escape the test.
 */
function patchProcessOn(): () => void {
  const orig = process.on.bind(process);
  const spy = vi.spyOn(process, 'on').mockImplementation((channel: any, listener: any) => {
    (h.bag.processListeners[channel as string] ??= []).push(listener);
    return process;
  });
  return () => {
    spy.mockRestore();
    void orig;
  };
}

/**
 * Capture `setInterval` callbacks without scheduling them. The SUT registers
 * a 5s CPU sampler at module load; we want the callback reference, not the
 * timer.
 */
function patchSetInterval(): () => void {
  const orig = globalThis.setInterval;
  (globalThis as any).setInterval = (cb: () => void, ms: number) => {
    h.bag.intervalCallbacks.push(cb);
    h.bag.intervalDurations.push(ms);
    return { unref: () => undefined };
  };
  return () => {
    globalThis.setInterval = orig;
  };
}

/**
 * Capture `setTimeout` calls inside `shutdown(...)` so we can verify the
 * 30s force-exit timer fires `process.exit(1)` without actually killing
 * vitest.
 */
function patchSetTimeout(): () => void {
  const orig = globalThis.setTimeout;
  (globalThis as any).setTimeout = (cb: () => void, ms?: number) => {
    const handle = { unref: vi.fn() };
    h.bag.timeoutCallbacks.push({ cb, ms: ms ?? 0, unref: handle.unref });
    return handle as any;
  };
  return () => {
    globalThis.setTimeout = orig;
  };
}

/**
 * `import('fs')` happens lazily inside the SUT's seed block. We need to
 * mock it BEFORE the dynamic import resolves. `vi.doMock` per-test — the
 * SUT does `await import('fs')` so the mock must be in the registry by
 * the time the SUT's top-level await runs.
 */
function mockFs(): void {
  vi.doMock('fs', () => ({
    existsSync: vi.fn((_p: string) => h.bag.webDistExists),
    default: { existsSync: vi.fn((_p: string) => h.bag.webDistExists) },
  }));
}

/**
 * Boot the SUT. Must run AFTER `mockFs()` so the dynamic `await import('fs')`
 * picks up the per-test toggle. Returns the freshly imported module namespace.
 */
async function bootGateway(): Promise<{ io: unknown }> {
  vi.resetModules();
  mockFs();
  // String-variable import dodges TypeScript's noUncheckedIndexedAccess
  // and lets vitest treat the path as a module specifier.
  const sutPath = '../index.ts';
  return (await import(/* @vite-ignore */ sutPath)) as { io: unknown };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('apps/gateway/src/index.ts', () => {
  const origEnv = { ...process.env };
  let restoreProcessOn: () => void = () => {};
  let restoreSetInterval: () => void = () => {};
  let restoreSetTimeout: () => void = () => {};

  beforeEach(() => {
    resetBag();
    process.env = { ...origEnv };
    delete process.env.PORT;
    delete process.env.FRONTEND_URL;
    delete process.env.ICE_WEB_DIST_PATH;
    process.env.NODE_ENV = 'test';
    restoreProcessOn = patchProcessOn();
    restoreSetInterval = patchSetInterval();
    restoreSetTimeout = patchSetTimeout();
  });

  afterEach(() => {
    restoreProcessOn();
    restoreSetInterval();
    restoreSetTimeout();
    process.env = { ...origEnv };
    vi.useRealTimers();
  });

  // ── Module shape & exports ───────────────────────────────────────────

  describe('module shape', () => {
    it('exports `io` (the Socket.IO server instance) at the top level', async () => {
      const mod = await bootGateway();
      expect(mod.io).toBeDefined();
      // Our FakeSocketServer instance — exposes `on` / `close`.
      expect(typeof (mod.io as any).on).toBe('function');
      expect(typeof (mod.io as any).close).toBe('function');
    });

    it('passes the http server and CORS config to the Socket.IO Server constructor', async () => {
      process.env.FRONTEND_URL = 'http://example.test, http://other.test';
      await bootGateway();
      const args = h.bag.socketIoConstructorArgs;
      expect(args[0]).toBe(h.bag.fakeHttpServer);
      expect(args[1]).toEqual({
        cors: {
          origin: ['http://example.test', 'http://other.test'],
          credentials: true,
        },
      });
    });

    it('passes the Socket.IO server to setupSocketService', async () => {
      const mod = await bootGateway();
      expect(h.bag.setupSocketServiceCalls.length).toBe(1);
      expect(h.bag.setupSocketServiceCalls[0]).toBe(mod.io);
    });
  });

  // ── PORT and ALLOWED_ORIGINS parsing ────────────────────────────────

  describe('environment parsing', () => {
    it('defaults PORT to 5001 when env.PORT is absent', async () => {
      await bootGateway();
      const listenCall = h.bag.fakeHttpServer!.listenCalls[0];
      expect(listenCall?.port).toBe(5001);
    });

    it('parses env.PORT as base-10 integer', async () => {
      process.env.PORT = '8080';
      await bootGateway();
      const listenCall = h.bag.fakeHttpServer!.listenCalls[0];
      expect(listenCall?.port).toBe(8080);
    });

    it('defaults ALLOWED_ORIGINS to localhost:5173 when FRONTEND_URL is unset', async () => {
      await bootGateway();
      // The CORS config inside Socket.IO mirrors the same parse.
      const corsConfig = h.bag.socketIoConstructorArgs[1]?.cors;
      expect(corsConfig.origin).toEqual(['http://localhost:5173']);
    });

    it('splits FRONTEND_URL on comma, trims, and filters empties', async () => {
      process.env.FRONTEND_URL = 'http://a.test,  http://b.test ,,, http://c.test';
      await bootGateway();
      const corsConfig = h.bag.socketIoConstructorArgs[1]?.cors;
      expect(corsConfig.origin).toEqual([
        'http://a.test',
        'http://b.test',
        'http://c.test',
      ]);
    });
  });

  // ── Rate limiter ─────────────────────────────────────────────────────

  describe('rate limiter', () => {
    it('registers with max=1000 in test env', async () => {
      process.env.NODE_ENV = 'test';
      await bootGateway();
      expect(h.bag.rateLimitOpts.max).toBe(1000);
    });

    it('registers with max=1000 in development env', async () => {
      process.env.NODE_ENV = 'development';
      await bootGateway();
      expect(h.bag.rateLimitOpts.max).toBe(1000);
    });

    it('registers with max=200 in production env', async () => {
      process.env.NODE_ENV = 'production';
      await bootGateway();
      expect(h.bag.rateLimitOpts.max).toBe(200);
    });

    it('keyGenerator returns the userId attached to the request when present', async () => {
      await bootGateway();
      const keyGen = h.bag.rateLimitOpts.keyGenerator as (req: any) => string;
      expect(keyGen({ userId: 'user-99', ip: '1.2.3.4' })).toBe('user-99');
    });

    it('keyGenerator falls back to req.ip when no userId is set', async () => {
      await bootGateway();
      const keyGen = h.bag.rateLimitOpts.keyGenerator as (req: any) => string;
      expect(keyGen({ ip: '1.2.3.4' })).toBe('1.2.3.4');
    });

    it('keyGenerator falls back to "unknown" when neither userId nor ip is set', async () => {
      await bootGateway();
      const keyGen = h.bag.rateLimitOpts.keyGenerator as (req: any) => string;
      expect(keyGen({})).toBe('unknown');
    });

    it('uses standardHeaders + legacyHeaders=false', async () => {
      await bootGateway();
      expect(h.bag.rateLimitOpts.standardHeaders).toBe(true);
      expect(h.bag.rateLimitOpts.legacyHeaders).toBe(false);
      expect(h.bag.rateLimitOpts.windowMs).toBe(60_000);
    });
  });

  // ── Service router mounting ──────────────────────────────────────────

  describe('service router mounting', () => {
    it('invokes all six router factories during boot', async () => {
      await bootGateway();
      expect(h.serviceIamMod.createIamRouter).toHaveBeenCalledTimes(1);
      expect(h.serviceCanvasMod.createCanvasRouter).toHaveBeenCalledTimes(1);
      expect(h.serviceDeployMod.createDeployRouter).toHaveBeenCalledTimes(1);
      expect(h.serviceAiMod.createAiRouter).toHaveBeenCalledTimes(1);
      expect(h.serviceEngineMod.createEngineRouter).toHaveBeenCalledTimes(1);
      expect(h.serviceCredentialsMod.createCredentialsRouter).toHaveBeenCalledTimes(1);
    });
  });

  // ── /api/health and /api/system/stats ───────────────────────────────

  /**
   * Drive a request through the captured express app. The SUT registered
   * `/api/health` and `/api/system/stats` handlers; we exercise them by
   * sending the express app a minimal `(req, res)` pair.
   */
  function makeFakeRes(): {
    statusCalls: number[];
    jsonCalls: any[];
    sendFileCalls: string[];
    setHeaderCalls: Array<{ name: string; value: string }>;
    json: (body: any) => any;
    status: (code: number) => any;
    sendFile: (path: string) => any;
    setHeader: (name: string, value: string) => any;
  } {
    const statusCalls: number[] = [];
    const jsonCalls: any[] = [];
    const sendFileCalls: string[] = [];
    const setHeaderCalls: Array<{ name: string; value: string }> = [];
    const res: any = {
      statusCalls,
      jsonCalls,
      sendFileCalls,
      setHeaderCalls,
      status(code: number) {
        statusCalls.push(code);
        return res;
      },
      json(body: any) {
        jsonCalls.push(body);
        return res;
      },
      sendFile(p: string) {
        sendFileCalls.push(p);
        return res;
      },
      setHeader(name: string, value: string) {
        setHeaderCalls.push({ name, value });
        return res;
      },
      // Express checks for these in some paths.
      end: vi.fn(),
      writeHead: vi.fn(),
      getHeader: vi.fn(),
      removeHeader: vi.fn(),
    };
    return res;
  }

  function dispatch(method: string, path: string, headers: Record<string, string> = {}): any {
    const res = makeFakeRes();
    const req: any = {
      method,
      url: path,
      originalUrl: path,
      path,
      headers: {
        host: '127.0.0.1:5001',
        ...headers,
      },
      get: (name: string) => req.headers[name.toLowerCase()],
    };
    h.bag.capturedAppListener!(req, res);
    return res;
  }

  describe('/api/health', () => {
    it('responds with status:ok and an ISO timestamp', async () => {
      await bootGateway();
      const res = dispatch('GET', '/api/health');
      // Express dispatch is synchronous for synchronous handlers.
      expect(res.jsonCalls.length).toBe(1);
      expect(res.jsonCalls[0].status).toBe('ok');
      expect(typeof res.jsonCalls[0].timestamp).toBe('string');
      // Timestamp parses as a valid Date.
      expect(Number.isFinite(Date.parse(res.jsonCalls[0].timestamp))).toBe(true);
    });
  });

  describe('/api/system/stats', () => {
    it('responds with rounded ram (KB→MB) and cpu', async () => {
      await bootGateway();
      const res = dispatch('GET', '/api/system/stats');
      expect(res.jsonCalls.length).toBe(1);
      expect(typeof res.jsonCalls[0].ram).toBe('number');
      expect(typeof res.jsonCalls[0].cpu).toBe('number');
      // psRssOutput = 4096 + 2048 = 6144 KB; / 1024 = 6.
      expect(res.jsonCalls[0].ram).toBe(6);
      // cpuPercent starts at 0 and the interval hasn't fired.
      expect(res.jsonCalls[0].cpu).toBe(0);
    });

    it('coalesces NaN parseInt results to 0 in the rss reducer (handles header lines like "RSS")', async () => {
      // ps may emit a header row when the format string is unusual. The
      // reducer's `parseInt(l.trim()) || 0` short-circuit must coalesce
      // NaN to 0 so the sum stays numeric.
      h.bag.psRssOutput = 'RSS\n4096\nbogus\n2048\n';
      await bootGateway();
      const res = dispatch('GET', '/api/system/stats');
      // 0 (header) + 4096 + 0 (bogus) + 2048 = 6144 KB → 6 MB.
      expect(res.jsonCalls[0].ram).toBe(6);
    });

    it('returns ram=0 when execSync for rss throws', async () => {
      h.bag.psRssOutput = '';
      h.childProcessMod.execSync.mockImplementationOnce(() => {
        throw new Error('rss boom');
      });
      // Re-stub for subsequent calls back to baseline output.
      h.childProcessMod.execSync.mockImplementation((cmd: string) => {
        if (cmd.startsWith('ps -e -o pid=,ppid=')) return h.bag.psTreeOutput;
        if (cmd.startsWith('ps -o rss=')) {
          throw new Error('rss boom');
        }
        if (cmd.startsWith('ps -o %cpu=')) return h.bag.psCpuOutput;
        return '';
      });
      await bootGateway();
      const res = dispatch('GET', '/api/system/stats');
      expect(res.jsonCalls[0].ram).toBe(0);
    });
  });

  // ── getTreePids / getRssForPids / getCpuForPids ──────────────────────

  describe('CPU sampler interval', () => {
    it('registers a 5-second setInterval at module load', async () => {
      await bootGateway();
      expect(h.bag.intervalDurations).toContain(5000);
    });

    it('first interval invocation seeds cpuPercent from the raw sample (cpuPercent === 0 branch)', async () => {
      // psCpuOutput sums to 75.5 across the tree; / 4 cpus = 18.875.
      h.bag.psCpuOutput = '50.0\n25.5\n';
      await bootGateway();
      const cpuCb = h.bag.intervalCallbacks[0]!;
      cpuCb();
      // Now /api/system/stats should reflect the seeded value (18.875 → rounded 18.9).
      const res = dispatch('GET', '/api/system/stats');
      expect(res.jsonCalls[0].cpu).toBe(18.9);
    });

    it('subsequent interval invocations smooth via EMA (raw*0.4 + cpuPercent*0.6 branch)', async () => {
      h.bag.psCpuOutput = '50.0\n25.5\n';
      await bootGateway();
      const cpuCb = h.bag.intervalCallbacks[0]!;
      cpuCb(); // seeds at 18.875
      cpuCb(); // EMA: 18.875*0.4 + 18.875*0.6 = 18.875 → no change
      // Now change the raw sample.
      h.bag.psCpuOutput = '0\n0\n';
      cpuCb(); // 0 * 0.4 + 18.875 * 0.6 = 11.325 → rounded 11.3
      const res = dispatch('GET', '/api/system/stats');
      expect(res.jsonCalls[0].cpu).toBe(11.3);
    });

    it('returns 0 cpu when execSync for cpu sample throws', async () => {
      // First interval call triggers tree pids + getCpuForPids; force the cpu call to throw.
      h.childProcessMod.execSync.mockImplementation((cmd: string) => {
        if (cmd.startsWith('ps -e -o pid=,ppid=')) return h.bag.psTreeOutput;
        if (cmd.startsWith('ps -o %cpu=')) throw new Error('cpu boom');
        if (cmd.startsWith('ps -o rss=')) return h.bag.psRssOutput;
        return '';
      });
      await bootGateway();
      const cpuCb = h.bag.intervalCallbacks[0]!;
      cpuCb();
      const res = dispatch('GET', '/api/system/stats');
      // raw=0 from the catch branch, cpuPercent stays 0, EMA still 0.
      expect(res.jsonCalls[0].cpu).toBe(0);
    });

    it('falls back to [rootPid] when getTreePids ps -e command throws', async () => {
      h.bag.psTreeThrows = true;
      h.childProcessMod.execSync.mockImplementation((cmd: string) => {
        if (cmd.startsWith('ps -e -o pid=,ppid=')) throw new Error('tree boom');
        if (cmd.startsWith('ps -o rss=')) return h.bag.psRssOutput;
        if (cmd.startsWith('ps -o %cpu=')) return h.bag.psCpuOutput;
        return '';
      });
      await bootGateway();
      const res = dispatch('GET', '/api/system/stats');
      // The single-PID fallback still flows through getRssForPids, which
      // uses our mocked psRssOutput (sum 6144 KB → 6 MB).
      expect(res.jsonCalls[0].ram).toBe(6);
    });

    it('walks the descendant pid tree (children added via the BFS-with-stack)', async () => {
      // Tree: 100 (root, current pid placeholder), 200 child of root, 300 child of 200.
      // The SUT uses process.pid as root — stub it.
      const realPid = process.pid;
      Object.defineProperty(process, 'pid', { value: 100, configurable: true });
      try {
        h.bag.psTreeOutput = '100 1\n200 100\n300 200\n400 999\n'; // 400 is unrelated
        h.bag.psRssOutput = '1024\n2048\n3072\n'; // 6144 KB total → 6 MB
        await bootGateway();
        const res = dispatch('GET', '/api/system/stats');
        expect(res.jsonCalls[0].ram).toBe(6);
      } finally {
        Object.defineProperty(process, 'pid', { value: realPid, configurable: true });
      }
    });
  });

  describe('os.cpus() fallback', () => {
    it('uses 1 as denominator when os.cpus() returns an empty array', async () => {
      h.osMod.cpus.mockReturnValueOnce([]);
      await bootGateway();
      const cpuCb = h.bag.intervalCallbacks[0]!;
      // psCpuOutput sums 75.5; / 1 cpu = 75.5.
      cpuCb();
      const res = dispatch('GET', '/api/system/stats');
      expect(res.jsonCalls[0].cpu).toBe(75.5);
    });
  });

  // ── Auto-seed local user ─────────────────────────────────────────────

  describe('auto-seed local user', () => {
    it('creates a user, organisation, and member when no user exists', async () => {
      h.bag.findFirstResult = null;
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await bootGateway();
      expect(h.prismaMock.user.findFirst).toHaveBeenCalled();
      expect(h.prismaMock.organisation.create).toHaveBeenCalledWith({
        data: { name: 'Local' },
      });
      expect(h.prismaMock.user.create).toHaveBeenCalled();
      expect(h.prismaMock.organisationMember.create).toHaveBeenCalled();
      expect(h.bag.setDesktopUserCalls[0]).toEqual({
        userId: 'user-1',
        orgId: 'org-1',
      });
      expect(logSpy).toHaveBeenCalledWith('[gateway] Created local user:', 'user-1');
      logSpy.mockRestore();
    });

    it('reuses an existing user without creating', async () => {
      h.bag.findFirstResult = { id: 'existing-1', organisation_id: 'org-2' };
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await bootGateway();
      expect(h.prismaMock.user.create).not.toHaveBeenCalled();
      expect(h.prismaMock.organisation.create).not.toHaveBeenCalled();
      expect(h.bag.setDesktopUserCalls[0]).toEqual({
        userId: 'existing-1',
        orgId: 'org-2',
      });
      expect(logSpy).toHaveBeenCalledWith('[gateway] Existing user:', 'existing-1');
      logSpy.mockRestore();
    });

    it('falls back to empty string for orgId when existing user has no organisation_id', async () => {
      h.bag.findFirstResult = { id: 'existing-2', organisation_id: '' };
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await bootGateway();
      expect(h.bag.setDesktopUserCalls[0]).toEqual({
        userId: 'existing-2',
        orgId: '',
      });
      logSpy.mockRestore();
    });

    it('logs the seed error and continues when prisma operations throw', async () => {
      h.bag.seedThrow = new Error('prisma down');
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const mod = await bootGateway();
      // Boot still completed — io export is present.
      expect(mod.io).toBeDefined();
      expect(errSpy).toHaveBeenCalledWith('[gateway] User seed error:', 'prisma down');
      // setDesktopUser is NOT called when seed throws.
      expect(h.bag.setDesktopUserCalls.length).toBe(0);
      errSpy.mockRestore();
    });
  });

  // ── Web dist serving ─────────────────────────────────────────────────

  /**
   * Find a route layer in the captured express app's stack that matches
   * the given method + path-regex. Returns the layer's bound handler
   * (req, res, next) so tests can drive it directly. We use this instead
   * of `app(req, res)` for paths that flow through `express.static` —
   * static would try to actually open files on disk, hit our fake `res`,
   * and crash.
   */
  function findRouteLayer(
    method: string,
    pathPredicate: (path: string) => boolean,
  ): null | ((req: any, res: any, next: any) => void) {
    const app: any = h.bag.capturedAppListener;
    const stack: any[] = (app._router?.stack ?? app.router?.stack) ?? [];
    for (const layer of stack) {
      if (!layer.route) continue;
      const path = layer.route.path;
      if (typeof path !== 'string') continue;
      if (!pathPredicate(path)) continue;
      const methods = layer.route.methods ?? {};
      if (!methods[method.toLowerCase()]) continue;
      // Each route has its own internal stack of handlers; for our cases
      // there's exactly one.
      const handler = layer.route.stack[0]?.handle;
      if (typeof handler === 'function') return handler;
    }
    return null;
  }

  describe('web/dist serving', () => {
    it('logs the production serve notice when web/dist exists and NODE_ENV is not development', async () => {
      h.bag.webDistExists = true;
      process.env.NODE_ENV = 'production';
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await bootGateway();
      const log = logSpy.mock.calls.map((c) => c.join(' ')).join(' | ');
      expect(log).toContain('Serving compiled web app');
      logSpy.mockRestore();
    });

    it('SPA fallback handler returns index.html with no-store cache header for non-API paths', async () => {
      h.bag.webDistExists = true;
      process.env.NODE_ENV = 'production';
      await bootGateway();
      const handler = findRouteLayer('GET', (p) => p === '*');
      expect(handler).not.toBeNull();
      const res = makeFakeRes();
      const next = vi.fn();
      handler!(
        { method: 'GET', path: '/dashboard', url: '/dashboard' } as any,
        res as any,
        next,
      );
      // sendFile('index.html') and Cache-Control header.
      expect(res.sendFileCalls.length).toBe(1);
      expect(res.sendFileCalls[0]).toMatch(/index\.html$/);
      expect(
        res.setHeaderCalls.some(
          (h) => h.name === 'Cache-Control' && h.value === 'no-store, must-revalidate',
        ),
      ).toBe(true);
      expect(next).not.toHaveBeenCalled();
    });

    it('SPA fallback delegates via next() for /api paths', async () => {
      h.bag.webDistExists = true;
      process.env.NODE_ENV = 'production';
      await bootGateway();
      const handler = findRouteLayer('GET', (p) => p === '*');
      expect(handler).not.toBeNull();
      const res = makeFakeRes();
      const next = vi.fn();
      handler!(
        { method: 'GET', path: '/api/health', url: '/api/health' } as any,
        res as any,
        next,
      );
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.sendFileCalls.length).toBe(0);
    });

    it('SPA fallback delegates via next() for /socket.io paths', async () => {
      h.bag.webDistExists = true;
      process.env.NODE_ENV = 'production';
      await bootGateway();
      const handler = findRouteLayer('GET', (p) => p === '*');
      expect(handler).not.toBeNull();
      const res = makeFakeRes();
      const next = vi.fn();
      handler!(
        { method: 'GET', path: '/socket.io/whatever', url: '/socket.io/whatever' } as any,
        res as any,
        next,
      );
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.sendFileCalls.length).toBe(0);
    });

    it('logs the dev-mode skip notice when NODE_ENV=development and web/dist exists', async () => {
      h.bag.webDistExists = true;
      process.env.NODE_ENV = 'development';
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await bootGateway();
      const log = logSpy.mock.calls.map((c) => c.join(' ')).join(' | ');
      expect(log).toContain('NODE_ENV=development — skipping web/dist serving');
      logSpy.mockRestore();
    });

    it('does NOT register the SPA fallback when web/dist does not exist', async () => {
      h.bag.webDistExists = false;
      process.env.NODE_ENV = 'production';
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await bootGateway();
      const handler = findRouteLayer('GET', (p) => p === '*');
      expect(handler).toBeNull();
      const log = logSpy.mock.calls.map((c) => c.join(' ')).join(' | ');
      expect(log).not.toContain('Serving compiled web app');
      logSpy.mockRestore();
    });

    it('honours ICE_WEB_DIST_PATH when set', async () => {
      h.bag.webDistExists = true;
      process.env.ICE_WEB_DIST_PATH = '/custom/web/dist';
      process.env.NODE_ENV = 'production';
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await bootGateway();
      const log = logSpy.mock.calls.map((c) => c.join(' ')).join(' | ');
      expect(log).toContain('/custom/web/dist');
      logSpy.mockRestore();
    });

    it('passes a setHeaders callback to express.static', async () => {
      h.bag.webDistExists = true;
      process.env.NODE_ENV = 'production';
      await bootGateway();
      expect(h.bag.expressStaticSetHeaders).toBeInstanceOf(Function);
      expect(typeof h.bag.expressStaticPath).toBe('string');
    });

    it('static-serve setHeaders attaches Cache-Control to files that end in index.html', async () => {
      h.bag.webDistExists = true;
      process.env.NODE_ENV = 'production';
      await bootGateway();
      const setHeaders = h.bag.expressStaticSetHeaders!;
      const res = makeFakeRes();
      setHeaders(res as any, '/some/dist/path/index.html');
      expect(res.setHeaderCalls).toEqual([
        { name: 'Cache-Control', value: 'no-store, must-revalidate' },
      ]);
    });

    it('static-serve setHeaders does NOT set Cache-Control for non-index files', async () => {
      h.bag.webDistExists = true;
      process.env.NODE_ENV = 'production';
      await bootGateway();
      const setHeaders = h.bag.expressStaticSetHeaders!;
      const res = makeFakeRes();
      setHeaders(res as any, '/some/dist/path/bundle.js');
      expect(res.setHeaderCalls).toEqual([]);
    });
  });

  // ── Error handler ────────────────────────────────────────────────────

  describe('error handler', () => {
    it('responds 500 with the generic message when err.status is unset', async () => {
      await bootGateway();
      // Trigger the error handler by dispatching a request that hits a
      // pre-registered handler that throws. Easier: synthesise one by
      // registering a router whose handler throws. But the SUT's routes
      // are already wired. Instead, capture the error handler by walking
      // the express app stack.
      // Easiest: post directly to the error middleware by sending an
      // unhandled error through `app(req, res, next)` — no test handle.
      //
      // Alternative: drive the captured app's error stack via app.handle().
      // Express exposes `app.handle(req, res, next)`. We can craft a
      // request that throws in a handler by using a route that doesn't
      // exist AND triggering the error path by calling next(err) ourselves.
      //
      // The cleanest path: invoke the app with a deliberate throwing
      // path. We piggyback on the SPA-fallback when webDist is missing —
      // the SUT registers no fallback then, so `app.handle(req, res)`
      // bottoms out at the express default 404, NOT the error handler.
      //
      // Final approach: route through the error middleware directly via
      // app.handle with a synthetic `err` injection. Express's app stack
      // has a layer for our error handler; we use the documented call
      // shape `app.handle(req, res, done, err)` is undocumented. Use
      // the public route: register an after-route via app.use? Not from
      // outside. Instead, reach into app._router.handle with options.
      //
      // Conclusion: invoke the error handler via the public path that
      // express exposes — call `app(req, res)` passing a request that
      // triggers it through the JSON body parse. The SUT pipes
      // `express.json({ limit: '10mb' })` BEFORE its handlers; sending
      // an oversized body via the express raw layer is hard from
      // outside. Skip — the error handler's branch coverage is achieved
      // by inspecting it via reflection across the app's stack.

      // Reflect into app stack via the captured listener.
      // Express assigns `app.handle = appHandle` and the stack is on
      // `app._router.stack`. The captured listener IS the express app.
      const app: any = h.bag.capturedAppListener;
      const stack = (app._router?.stack ?? app.router?.stack) as any[];
      // Find the error-handling middleware — express recognizes it by
      // function arity 4.
      const errLayer = stack.find((l) => l.handle && (l.handle as Function).length === 4);
      expect(errLayer).toBeDefined();
      const errHandler = errLayer!.handle as (
        err: any,
        req: any,
        res: any,
        next: any,
      ) => void;
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const res = makeFakeRes();
      errHandler(new Error('boom'), {} as any, res as any, vi.fn());
      expect(res.statusCalls).toEqual([500]);
      expect(res.jsonCalls[0]).toEqual({ message: 'boom' });
      expect(errSpy).toHaveBeenCalledWith('Unhandled error:', expect.any(Error));
      errSpy.mockRestore();
    });

    it('honours err.status when set on the error', async () => {
      await bootGateway();
      const app: any = h.bag.capturedAppListener;
      const stack = (app._router?.stack ?? app.router?.stack) as any[];
      const errLayer = stack.find((l) => l.handle && (l.handle as Function).length === 4);
      const errHandler = errLayer!.handle as (
        err: any,
        req: any,
        res: any,
        next: any,
      ) => void;
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const res = makeFakeRes();
      errHandler({ status: 418, message: "I'm a teapot" }, {} as any, res as any, vi.fn());
      expect(res.statusCalls).toEqual([418]);
      expect(res.jsonCalls[0]).toEqual({ message: "I'm a teapot" });
      errSpy.mockRestore();
    });

    it('falls back to "Internal server error" when err.message is missing', async () => {
      await bootGateway();
      const app: any = h.bag.capturedAppListener;
      const stack = (app._router?.stack ?? app.router?.stack) as any[];
      const errLayer = stack.find((l) => l.handle && (l.handle as Function).length === 4);
      const errHandler = errLayer!.handle as (
        err: any,
        req: any,
        res: any,
        next: any,
      ) => void;
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const res = makeFakeRes();
      errHandler({}, {} as any, res as any, vi.fn());
      expect(res.statusCalls).toEqual([500]);
      expect(res.jsonCalls[0]).toEqual({ message: 'Internal server error' });
      errSpy.mockRestore();
    });
  });

  // ── httpServer.listen callback ──────────────────────────────────────

  describe('httpServer.listen callback', () => {
    it('logs the running port + NODE_ENV and starts background services', async () => {
      process.env.NODE_ENV = 'production';
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await bootGateway();
      // Drive the listen callback.
      const listenCall = h.bag.fakeHttpServer!.listenCalls[0];
      listenCall?.cb?.();
      const log = logSpy.mock.calls.map((c) => c.join(' ')).join(' | ');
      expect(log).toContain('ICE Community gateway running on port 5001');
      expect(log).toContain('NODE_ENV=production');
      expect(h.serviceDeployMod.startDeployWorker).toHaveBeenCalled();
      expect(h.serviceDeployMod.startCronJobs).toHaveBeenCalled();
      expect(h.serviceDeployMod.startRequirementPoller).toHaveBeenCalled();
      expect(h.aiMod.startLocalAiServer).toHaveBeenCalled();
      logSpy.mockRestore();
    });

    it('logs the dev-mode notice when NODE_ENV=development', async () => {
      process.env.NODE_ENV = 'development';
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await bootGateway();
      h.bag.fakeHttpServer!.listenCalls[0]?.cb?.();
      const log = logSpy.mock.calls.map((c) => c.join(' ')).join(' | ');
      expect(log).toContain('Open vite dev server');
      expect(log).toContain('serves API + socket.io only in dev mode');
      logSpy.mockRestore();
    });

    it('logs NODE_ENV=unset when NODE_ENV is missing', async () => {
      delete process.env.NODE_ENV;
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await bootGateway();
      h.bag.fakeHttpServer!.listenCalls[0]?.cb?.();
      const log = logSpy.mock.calls.map((c) => c.join(' ')).join(' | ');
      expect(log).toContain('NODE_ENV=unset');
      logSpy.mockRestore();
    });

    it('warns when startLocalAiServer rejects', async () => {
      h.bag.startLocalAiError = new Error('ai server boom');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await bootGateway();
      h.bag.fakeHttpServer!.listenCalls[0]?.cb?.();
      // Drain the rejection's microtask.
      await Promise.resolve();
      await Promise.resolve();
      expect(warnSpy).toHaveBeenCalledWith('[ICE AI] Auto-start failed:', 'ai server boom');
      warnSpy.mockRestore();
    });

    it('warns when startLocalAiServer rejects with a non-Error', async () => {
      // Prepare an object without a message.
      h.aiMod.startLocalAiServer.mockImplementationOnce(() => Promise.reject('plain string'));
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await bootGateway();
      h.bag.fakeHttpServer!.listenCalls[0]?.cb?.();
      await Promise.resolve();
      await Promise.resolve();
      // Falls back to the rejection value when message is absent.
      expect(warnSpy).toHaveBeenCalledWith('[ICE AI] Auto-start failed:', 'plain string');
      warnSpy.mockRestore();
    });
  });

  // ── Signal handlers + shutdown ──────────────────────────────────────

  describe('shutdown', () => {
    it('registers SIGTERM, SIGINT, and uncaughtException listeners on process', async () => {
      await bootGateway();
      expect(h.bag.processListeners.SIGTERM?.length).toBeGreaterThan(0);
      expect(h.bag.processListeners.SIGINT?.length).toBeGreaterThan(0);
      expect(h.bag.processListeners.uncaughtException?.length).toBeGreaterThan(0);
    });

    it('runs cleanup and closes http + socket.io on SIGTERM', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await bootGateway();
      const sigterm = h.bag.processListeners.SIGTERM![0]!;
      sigterm();
      // Drain microtasks for stopLocalAiServer's promise.
      await Promise.resolve();
      expect(h.serviceDeployMod.cleanupAllTempDirs).toHaveBeenCalled();
      expect(h.aiMod.stopLocalAiServer).toHaveBeenCalled();
      expect(h.bag.fakeHttpServer!.close).toHaveBeenCalled();
      // io.close was driven via our FakeSocketServer.close.
      const log = logSpy.mock.calls.map((c) => c.join(' ')).join(' | ');
      expect(log).toContain('SIGTERM received');
      expect(log).toContain('HTTP server closed');
      expect(log).toContain('Socket.IO closed');
      logSpy.mockRestore();
    });

    it('runs cleanup on SIGINT just like SIGTERM', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await bootGateway();
      const sigint = h.bag.processListeners.SIGINT![0]!;
      sigint();
      const log = logSpy.mock.calls.map((c) => c.join(' ')).join(' | ');
      expect(log).toContain('SIGINT received');
      logSpy.mockRestore();
    });

    it('logs the cleanup error when cleanupAllTempDirs throws on shutdown', async () => {
      h.bag.cleanupThrows = true;
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await bootGateway();
      const sigterm = h.bag.processListeners.SIGTERM![0]!;
      sigterm();
      expect(errSpy).toHaveBeenCalledWith('Temp credential cleanup failed:', expect.any(Error));
      logSpy.mockRestore();
      errSpy.mockRestore();
    });

    it('swallows stopLocalAiServer rejection silently', async () => {
      h.aiMod.stopLocalAiServer.mockImplementationOnce(() => Promise.reject(new Error('stop boom')));
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await bootGateway();
      const sigterm = h.bag.processListeners.SIGTERM![0]!;
      sigterm();
      // Drain the silent .catch(() => {}).
      await Promise.resolve();
      await Promise.resolve();
      // No console.error from the stopLocalAiServer rejection — it has
      // a no-op catch. The cleanup-temp-dirs error path doesn't fire.
      const errMessages = errSpy.mock.calls.map((c) => c[0]);
      expect(errMessages.every((m) => m !== 'stop boom')).toBe(true);
      logSpy.mockRestore();
      errSpy.mockRestore();
    });

    it('schedules a 30s force-exit timer that calls process.exit(1)', async () => {
      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation(((_code?: number) => undefined) as any);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await bootGateway();
      const sigterm = h.bag.processListeners.SIGTERM![0]!;
      sigterm();
      // The setTimeout was captured in our patched setTimeout.
      const forceExitTimer = h.bag.timeoutCallbacks.find((t) => t.ms === 30_000);
      expect(forceExitTimer).toBeDefined();
      expect(forceExitTimer!.unref).toHaveBeenCalled();
      // Drive the callback.
      forceExitTimer!.cb();
      const log = logSpy.mock.calls.map((c) => c.join(' ')).join(' | ');
      expect(log).toContain('Shutdown timeout — forcing exit');
      expect(exitSpy).toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
      logSpy.mockRestore();
    });
  });

  describe('uncaughtException', () => {
    it('logs the error, runs cleanup, and exits the process', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation(((_code?: number) => undefined) as any);
      await bootGateway();
      const handler = h.bag.processListeners.uncaughtException![0]!;
      handler(new Error('uncaught boom'));
      expect(errSpy).toHaveBeenCalledWith('Uncaught exception:', expect.any(Error));
      expect(h.serviceDeployMod.cleanupAllTempDirs).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(1);
      errSpy.mockRestore();
      exitSpy.mockRestore();
    });

    it('still exits when cleanupAllTempDirs throws inside the uncaughtException handler', async () => {
      h.bag.cleanupThrows = true;
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation(((_code?: number) => undefined) as any);
      await bootGateway();
      const handler = h.bag.processListeners.uncaughtException![0]!;
      handler(new Error('uncaught with cleanup-boom'));
      // process.exit was still called even though cleanup threw.
      expect(exitSpy).toHaveBeenCalledWith(1);
      errSpy.mockRestore();
      exitSpy.mockRestore();
    });
  });
});

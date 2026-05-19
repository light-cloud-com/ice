/**
 * Unit tests for `services/deploy/src/services/log-stream/stream-open.ts`.
 *
 * Cover the openStreamForResolved + restartStreamWithMode helpers in
 * isolation. Mock Prisma + credentials + @ice/core's load_sdk; verify
 * each early-return branch returns null without registering an
 * ActiveStream, and the happy path constructs the SDK client, runs the
 * IAM probe, and starts the requested loop.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    canvasCard: { findUnique: vi.fn() },
    environment: { findUnique: vi.fn() },
    deployedResourceMapping: { findFirst: vi.fn() },
  },
  credentials: { getDecryptedCredentials: vi.fn() },
  ioEmits: [] as Array<{ room: string; event: string; payload: any }>,
  loadSdk: vi.fn(),
}));

vi.mock('@ice/db', () => ({ default: mocks.prisma }));
vi.mock('@ice/service-credentials', () => mocks.credentials);
vi.mock('@ice/shared', () => ({
  getSocketServer: () => ({
    to(room: string) {
      return {
        emit(event: string, payload: any) {
          mocks.ioEmits.push({ room, event, payload });
        },
      };
    },
  }),
}));
vi.mock('@ice/core', () => ({
  load_sdk: mocks.loadSdk,
}));

import { resetRegistry, streams, subscriptionIndex } from '../log-stream/registry';
import {
  openStreamForResolved,
  registerPlaceholderStream,
  restartStreamWithMode,
} from '../log-stream/stream-open';
import type { ActiveStream } from '../log-stream/types';

const baseArgs = {
  cardId: 'card-1',
  environmentId: 'env-1',
  terminalNodeId: 'log-1',
  mode: 'polling' as const,
  organisationId: 'org-1',
};

const resolvedResolution = {
  state: 'resolved' as const,
  sourceNodeId: 'src-1',
  iceType: 'Compute.Container',
};

function makeFakeLogging(opts: { getEntries?: (...a: any[]) => any; tailEntries?: (...a: any[]) => any } = {}) {
  return {
    Logging: class {
      constructor(public _opts: any) {}
      getEntries = opts.getEntries ?? vi.fn(async () => [[]]);
      tailEntries = opts.tailEntries ?? vi.fn(() => ({ on: () => undefined, destroy: vi.fn(), cancel: vi.fn() }));
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ioEmits.length = 0;
  resetRegistry();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('openStreamForResolved — null branches', () => {
  it('returns null when card is missing', async () => {
    mocks.prisma.canvasCard.findUnique.mockResolvedValue(null);
    const result = await openStreamForResolved(baseArgs, resolvedResolution);
    expect(result).toBeNull();
    expect(streams.size).toBe(0);
  });

  it('returns null when mapping is missing', async () => {
    mocks.prisma.canvasCard.findUnique.mockResolvedValue({ project_id: 'p1' });
    mocks.prisma.environment.findUnique.mockResolvedValue({ type: 'production', region: 'us-central1' });
    mocks.prisma.deployedResourceMapping.findFirst.mockResolvedValue(null);
    const result = await openStreamForResolved(baseArgs, resolvedResolution);
    expect(result).toBeNull();
  });

  it('returns null when credentials are missing', async () => {
    mocks.prisma.canvasCard.findUnique.mockResolvedValue({ project_id: 'p1' });
    mocks.prisma.environment.findUnique.mockResolvedValue({ type: 'production', region: 'us-central1' });
    mocks.prisma.deployedResourceMapping.findFirst.mockResolvedValue({
      resource_name: 'api-server',
      resource_type: 'gcp.run.service',
    });
    mocks.credentials.getDecryptedCredentials.mockResolvedValue(null);
    const result = await openStreamForResolved(baseArgs, resolvedResolution);
    expect(result).toBeNull();
  });

  it('emits SDK-missing error and returns null when load_sdk returns null', async () => {
    mocks.prisma.canvasCard.findUnique.mockResolvedValue({ project_id: 'p1' });
    mocks.prisma.environment.findUnique.mockResolvedValue({ type: 'production', region: 'us-central1' });
    mocks.prisma.deployedResourceMapping.findFirst.mockResolvedValue({
      resource_name: 'api-server',
      resource_type: 'gcp.run.service',
    });
    mocks.credentials.getDecryptedCredentials.mockResolvedValue({
      project_id: 'proj-1',
      client_email: 'sa@x',
      private_key: '-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----\n',
    });
    mocks.loadSdk.mockResolvedValue(null);
    const result = await openStreamForResolved(baseArgs, resolvedResolution);
    expect(result).toBeNull();
    const errors = mocks.ioEmits.filter((e) => e.event === 'logs:error');
    expect(errors[0].payload.message).toContain('@google-cloud/logging SDK is not available');
  });

  it('returns null + emits source-resolved=denied when IAM probe is permission-denied', async () => {
    mocks.prisma.canvasCard.findUnique.mockResolvedValue({ project_id: 'p1' });
    mocks.prisma.environment.findUnique.mockResolvedValue({ type: 'production', region: 'us-central1' });
    mocks.prisma.deployedResourceMapping.findFirst.mockResolvedValue({
      resource_name: 'api-server',
      resource_type: 'gcp.run.service',
    });
    mocks.credentials.getDecryptedCredentials.mockResolvedValue({
      project_id: 'proj-1',
      client_email: 'sa@x',
      private_key: '-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----\n',
    });
    mocks.loadSdk.mockResolvedValue(
      makeFakeLogging({
        getEntries: vi.fn(async () => {
          throw Object.assign(new Error('denied'), { code: 7 });
        }),
      }),
    );
    const result = await openStreamForResolved(baseArgs, resolvedResolution);
    expect(result).toBeNull();
    const events = mocks.ioEmits.map((e) => e.event);
    expect(events).toContain('logs:source-resolved');
    const errors = mocks.ioEmits.filter((e) => e.event === 'logs:error');
    expect(errors[0].payload.recoverable).toBe(false);
  });
});

describe('openStreamForResolved — happy path', () => {
  it('registers the ActiveStream and starts polling for mode=polling', async () => {
    vi.useFakeTimers();
    mocks.prisma.canvasCard.findUnique.mockResolvedValue({ project_id: 'p1' });
    mocks.prisma.environment.findUnique.mockResolvedValue({ type: 'production', region: 'us-central1' });
    mocks.prisma.deployedResourceMapping.findFirst.mockResolvedValue({
      resource_name: 'api-server',
      resource_type: 'gcp.run.service',
    });
    mocks.credentials.getDecryptedCredentials.mockResolvedValue({
      project_id: 'proj-1',
      client_email: 'sa@x',
      private_key: '-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----\n',
    });
    mocks.loadSdk.mockResolvedValue(makeFakeLogging());
    const result = await openStreamForResolved(baseArgs, resolvedResolution);
    expect(result).not.toBeNull();
    expect(streams.size).toBe(1);
    expect(streams.get('log-1')?.mode).toBe('polling');
    expect(streams.get('log-1')?.pollTimer).toBeDefined();
  });

  it('starts tail loop for mode=tail', async () => {
    mocks.prisma.canvasCard.findUnique.mockResolvedValue({ project_id: 'p1' });
    mocks.prisma.environment.findUnique.mockResolvedValue({ type: 'production', region: 'us-central1' });
    mocks.prisma.deployedResourceMapping.findFirst.mockResolvedValue({
      resource_name: 'api-server',
      resource_type: 'gcp.run.service',
    });
    mocks.credentials.getDecryptedCredentials.mockResolvedValue({
      project_id: 'proj-1',
      client_email: 'sa@x',
      private_key: '-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----\n',
    });
    const tailFake = { on: () => undefined, destroy: vi.fn(), cancel: vi.fn() };
    mocks.loadSdk.mockResolvedValue(
      makeFakeLogging({
        tailEntries: vi.fn(() => tailFake),
      }),
    );
    const result = await openStreamForResolved({ ...baseArgs, mode: 'tail' }, resolvedResolution);
    expect(result).not.toBeNull();
    expect(streams.size).toBe(1);
    expect(streams.get('log-1')?.tailStream).toBe(tailFake);
  });
});

describe('registerPlaceholderStream', () => {
  it('registers a holding-state ActiveStream with empty filter and null SDK client', () => {
    const stream = registerPlaceholderStream(
      baseArgs,
      'sub-1',
      { state: 'pre-deploy', sourceNodeId: 'src-1', iceType: 'Compute.Container' },
    );
    expect(stream.terminalNodeId).toBe('log-1');
    expect(stream.filter).toBe('');
    expect(stream.projectId).toBe('');
    expect(stream.loggingClient).toBeNull();
    expect(stream.subscribers.size).toBe(1);
    expect(stream.subscribers.get('sub-1')?.subscriptionId).toBe('sub-1');
    expect(streams.get('log-1')).toBe(stream);
    expect(subscriptionIndex.get('sub-1')).toBe('log-1');
  });

  it('replaces an existing registry entry under the same terminalNodeId', () => {
    registerPlaceholderStream(baseArgs, 'sub-1', { state: 'none' });
    const replacement = registerPlaceholderStream(
      baseArgs,
      'sub-2',
      { state: 'permission-denied', message: 'no creds' },
    );
    expect(streams.get('log-1')).toBe(replacement);
    expect(replacement.resolution.state).toBe('permission-denied');
  });
});

describe('restartStreamWithMode', () => {
  it('switches polling → tail by stopping the old loop and starting tail', () => {
    const stream: ActiveStream = {
      terminalNodeId: 'log-1',
      mode: 'polling',
      filter: 'r',
      projectId: 'p',
      resolution: resolvedResolution,
      subscribers: new Map(),
      seenInsertIds: new Set(),
      insertIdOrder: [],
      consecutiveErrors: 0,
      stopped: false,
      loggingClient: {
        tailEntries: vi.fn(() => ({ on: () => undefined, destroy: vi.fn(), cancel: vi.fn() })),
      },
    };
    stream.pollTimer = setInterval(() => {}, 60_000);
    void restartStreamWithMode(stream, 'tail');
    expect(stream.mode).toBe('tail');
    expect(stream.pollTimer).toBeUndefined();
    expect(stream.tailStream).toBeDefined();
  });
});

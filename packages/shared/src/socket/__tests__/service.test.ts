/**
 * Socket service coverage — gaps not covered by existing
 * `__tests__/socket-deploy-events.test.ts` and `socket-logs.test.ts`.
 *
 * Covers:
 * - `getSocketServer()` returns null pre-init and the registered server post-init.
 * - The auth `io.use` middleware:
 *   - Community-edition desktop bypass.
 *   - Missing token reject.
 *   - JWT_SECRET unset (non-test NODE_ENV) reject.
 *   - JWT verify success.
 *   - JWT verify failure.
 * - Connection handlers: `subscribe:deploy` / `unsubscribe:deploy`,
 *   `subscribe:canvas` / `unsubscribe:canvas`,
 *   `subscribe:pipeline` / `unsubscribe:pipeline`,
 *   `subscribe:card-pipeline` / `unsubscribe:card-pipeline`,
 *   `disconnect`.
 * - `emitCanvasUpdate`, `emitPipelineUpdate`, `emitCardPipelineUpdate`:
 *   gated on `_io` truthy, emit to expected room name, bail when null.
 *
 * Module is stateful (`let _io`) — every `it` calls `freshSocketService` to
 * `vi.resetModules()` and re-import, mirroring the convention from
 * `socket-deploy-events.test.ts`.
 */

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-for-socket-service';
});

interface FakeSocket {
  id: string;
  data: Record<string, unknown>;
  handshake: { auth: Record<string, unknown> };
  handlers: Map<string, (...args: unknown[]) => void>;
  joined: string[];
  left: string[];
  on(event: string, handler: (...args: unknown[]) => void): void;
  join(room: string): void;
  leave(room: string): void;
}

function makeFakeSocket(auth: Record<string, unknown> = {}): FakeSocket {
  const socket: FakeSocket = {
    id: 'fake-1',
    data: {},
    handshake: { auth },
    handlers: new Map(),
    joined: [],
    left: [],
    on(event, handler) {
      this.handlers.set(event, handler);
    },
    join(room) {
      this.joined.push(room);
    },
    leave(room) {
      this.left.push(room);
    },
  };
  return socket;
}

interface FakeIo {
  use: (mw: any) => void;
  on: (event: string, handler: any) => void;
  authMw?: any;
  connectionHandler?: any;
  sockets: { adapter: { rooms: Map<string, Set<string>> } };
  to: ReturnType<typeof vi.fn>;
}

function makeFakeIo(rooms: Map<string, Set<string>> = new Map()): {
  io: FakeIo;
  emit: ReturnType<typeof vi.fn>;
} {
  const emit = vi.fn();
  const io: FakeIo = {
    use(mw) {
      io.authMw = mw;
    },
    on(event, handler) {
      if (event === 'connection') io.connectionHandler = handler;
    },
    sockets: { adapter: { rooms } },
    to: vi.fn(() => ({ emit })),
  };
  return { io, emit };
}

async function freshSocketService() {
  vi.resetModules();
  return import('../service');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getSocketServer', () => {
  it('returns null when setupSocketService has not run', async () => {
    const { getSocketServer } = await freshSocketService();
    expect(getSocketServer()).toBeNull();
  });

  it('returns the registered server after setupSocketService', async () => {
    const { getSocketServer, setupSocketService } = await freshSocketService();
    const { io } = makeFakeIo();
    setupSocketService(io as any);
    expect(getSocketServer()).toBe(io);
  });
});

describe('setupSocketService — auth middleware', () => {
  it('community-edition (desktop) bypass: writes desktop user/org to socket.data and admits', async () => {
    const mod = await freshSocketService();
    // Reach into the auth/middleware module via the same fresh-modules cache.
    const auth = await import('../../auth/middleware');
    auth.setDesktopUser('desktop-u', 'desktop-o');

    const { io } = makeFakeIo();
    mod.setupSocketService(io as any);

    const socket = makeFakeSocket();
    const next = vi.fn();
    io.authMw(socket, next);

    expect(socket.data.userId).toBe('desktop-u');
    expect(socket.data.organisationId).toBe('desktop-o');
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0]).toEqual([]);
  });

  it('rejects connections without a JWT and not in desktop mode', async () => {
    const mod = await freshSocketService();
    const { io } = makeFakeIo();
    mod.setupSocketService(io as any);

    const socket = makeFakeSocket(); // no token
    const next = vi.fn();
    io.authMw(socket, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    expect((next.mock.calls[0]?.[0] as Error).message).toBe('Authentication required');
  });

  it('admits a valid JWT and writes payload onto socket.data', async () => {
    const mod = await freshSocketService();
    const { io } = makeFakeIo();
    mod.setupSocketService(io as any);

    const token = jwt.sign({ userId: 'u', organisationId: 'o' }, 'test-secret-for-socket-service');
    const socket = makeFakeSocket({ token });
    const next = vi.fn();
    io.authMw(socket, next);

    expect(socket.data.userId).toBe('u');
    expect(socket.data.organisationId).toBe('o');
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0]).toEqual([]);
  });

  it('rejects when the JWT signature is wrong', async () => {
    const mod = await freshSocketService();
    const { io } = makeFakeIo();
    mod.setupSocketService(io as any);

    const token = jwt.sign({ userId: 'u', organisationId: 'o' }, 'WRONG');
    const socket = makeFakeSocket({ token });
    const next = vi.fn();
    io.authMw(socket, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0]?.[0] as Error;
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Invalid or expired token');
  });

  it('falls back to "test-secret" when JWT_SECRET is empty and NODE_ENV is test', async () => {
    // The auth/middleware module loads cleanly when NODE_ENV='test' even with
    // empty JWT_SECRET. The socket auth middleware mirrors that fallback at
    // handshake time: `secret || "test-secret"` is what jwt.verify is called
    // with — exercising the right side of the `||` branch on line 94.
    const originalSecret = process.env.JWT_SECRET;
    try {
      const mod = await freshSocketService();
      const { io } = makeFakeIo();
      mod.setupSocketService(io as any);

      process.env.JWT_SECRET = '';
      // process.env.NODE_ENV stays 'test' from beforeAll.

      const token = jwt.sign({ userId: 'u', organisationId: 'o' }, 'test-secret');
      const socket = makeFakeSocket({ token });
      const next = vi.fn();
      io.authMw(socket, next);

      expect(socket.data.userId).toBe('u');
      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0]).toEqual([]);
    } finally {
      process.env.JWT_SECRET = originalSecret;
    }
  });

  it('rejects when JWT_SECRET is unset and NODE_ENV is not test', async () => {
    // The auth/middleware module checks JWT_SECRET at module-load time and
    // throws when NODE_ENV !== 'test'. We need that module to load, so we
    // import the socket service while NODE_ENV='test', THEN flip env to
    // production and clear JWT_SECRET — the socket auth middleware reads
    // both at handshake-time, so the misconfigured branch fires.
    const originalSecret = process.env.JWT_SECRET;
    const originalEnv = process.env.NODE_ENV;
    try {
      const mod = await freshSocketService();
      const { io } = makeFakeIo();
      mod.setupSocketService(io as any);

      // Now flip env to expose the misconfigured branch.
      process.env.JWT_SECRET = '';
      process.env.NODE_ENV = 'production';

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const socket = makeFakeSocket({ token: 'whatever' });
      const next = vi.fn();
      io.authMw(socket, next);

      expect(next).toHaveBeenCalledTimes(1);
      const err = next.mock.calls[0]?.[0] as Error;
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('Server misconfigured');
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      process.env.JWT_SECRET = originalSecret;
      process.env.NODE_ENV = originalEnv;
    }
  });
});

describe('setupSocketService — connection room handlers', () => {
  async function bootAndConnect() {
    const mod = await freshSocketService();
    const { io, emit } = makeFakeIo();
    mod.setupSocketService(io as any);
    expect(io.connectionHandler).toBeTypeOf('function');
    const socket = makeFakeSocket();
    socket.data = { userId: 'u', organisationId: 'o' };
    io.connectionHandler(socket);
    return { mod, io, emit, socket };
  }

  it('subscribe:deploy joins room "deploy:<cardId>" for a non-empty string', async () => {
    const { socket } = await bootAndConnect();
    socket.handlers.get('subscribe:deploy')!('card-1');
    expect(socket.joined).toEqual(['deploy:card-1']);
  });

  it('subscribe:deploy ignores empty / non-string cardId', async () => {
    const { socket } = await bootAndConnect();
    socket.handlers.get('subscribe:deploy')!('');
    socket.handlers.get('subscribe:deploy')!(null as any);
    socket.handlers.get('subscribe:deploy')!(123 as any);
    expect(socket.joined).toEqual([]);
  });

  it('unsubscribe:deploy leaves the deploy room (no string-validation gate)', async () => {
    const { socket } = await bootAndConnect();
    socket.handlers.get('unsubscribe:deploy')!('card-1');
    expect(socket.left).toEqual(['deploy:card-1']);
  });

  it('subscribe:canvas joins "canvas:<projectId>"', async () => {
    const { socket } = await bootAndConnect();
    socket.handlers.get('subscribe:canvas')!('proj-1');
    expect(socket.joined).toEqual(['canvas:proj-1']);
  });

  it('subscribe:canvas ignores empty input', async () => {
    const { socket } = await bootAndConnect();
    socket.handlers.get('subscribe:canvas')!('');
    socket.handlers.get('subscribe:canvas')!(null as any);
    expect(socket.joined).toEqual([]);
  });

  it('unsubscribe:canvas leaves the canvas room', async () => {
    const { socket } = await bootAndConnect();
    socket.handlers.get('unsubscribe:canvas')!('proj-1');
    expect(socket.left).toEqual(['canvas:proj-1']);
  });

  it('subscribe:pipeline joins "pipeline:<nodeId>" for non-empty strings', async () => {
    const { socket } = await bootAndConnect();
    socket.handlers.get('subscribe:pipeline')!('node-1');
    expect(socket.joined).toEqual(['pipeline:node-1']);
  });

  it('subscribe:pipeline ignores empty/non-string ids', async () => {
    const { socket } = await bootAndConnect();
    socket.handlers.get('subscribe:pipeline')!('');
    socket.handlers.get('subscribe:pipeline')!(undefined as any);
    expect(socket.joined).toEqual([]);
  });

  it('unsubscribe:pipeline leaves the pipeline room', async () => {
    const { socket } = await bootAndConnect();
    socket.handlers.get('unsubscribe:pipeline')!('node-1');
    expect(socket.left).toEqual(['pipeline:node-1']);
  });

  it('subscribe:card-pipeline joins "card-pipeline:<cardId>"', async () => {
    const { socket } = await bootAndConnect();
    socket.handlers.get('subscribe:card-pipeline')!('card-7');
    expect(socket.joined).toEqual(['card-pipeline:card-7']);
  });

  it('subscribe:card-pipeline ignores empty input', async () => {
    const { socket } = await bootAndConnect();
    socket.handlers.get('subscribe:card-pipeline')!('');
    expect(socket.joined).toEqual([]);
  });

  it('unsubscribe:card-pipeline leaves the room', async () => {
    const { socket } = await bootAndConnect();
    socket.handlers.get('unsubscribe:card-pipeline')!('card-7');
    expect(socket.left).toEqual(['card-pipeline:card-7']);
  });

  it('disconnect handler is registered and runs without throwing', async () => {
    const { socket } = await bootAndConnect();
    expect(() => socket.handlers.get('disconnect')!()).not.toThrow();
  });
});

describe('emitCanvasUpdate / emitPipelineUpdate / emitCardPipelineUpdate', () => {
  it('emitCanvasUpdate emits to "canvas:<projectId>" with the event payload', async () => {
    const mod = await freshSocketService();
    const { io, emit } = makeFakeIo();
    mod.setupSocketService(io as any);

    mod.emitCanvasUpdate('proj-1', { kind: 'card_added', id: 'c1' });

    expect(io.to).toHaveBeenCalledWith('canvas:proj-1');
    expect(emit).toHaveBeenCalledWith('canvas:update', { kind: 'card_added', id: 'c1' });
  });

  it('emitCanvasUpdate is a no-op when _io is null (pre-init)', async () => {
    const mod = await freshSocketService();
    expect(() => mod.emitCanvasUpdate('proj-1', { x: 1 })).not.toThrow();
  });

  it('emitPipelineUpdate emits to "pipeline:<nodeId>"', async () => {
    const mod = await freshSocketService();
    const { io, emit } = makeFakeIo();
    mod.setupSocketService(io as any);

    const update = {
      nodeId: 'node-1',
      cardId: 'card-1',
      status: 'deploying',
      progress: 42,
    };
    mod.emitPipelineUpdate('node-1', update);

    expect(io.to).toHaveBeenCalledWith('pipeline:node-1');
    expect(emit).toHaveBeenCalledWith('pipeline:update', update);
  });

  it('emitPipelineUpdate is a no-op when _io is null', async () => {
    const mod = await freshSocketService();
    expect(() => mod.emitPipelineUpdate('n', { nodeId: 'n', cardId: 'c', status: 's' })).not.toThrow();
  });

  it('emitCardPipelineUpdate emits to "card-pipeline:<cardId>"', async () => {
    const mod = await freshSocketService();
    const { io, emit } = makeFakeIo();
    mod.setupSocketService(io as any);

    const update = { nodeId: 'n', status: 'deploying' };
    mod.emitCardPipelineUpdate('card-1', update);

    expect(io.to).toHaveBeenCalledWith('card-pipeline:card-1');
    expect(emit).toHaveBeenCalledWith('card-pipeline:update', update);
  });

  it('emitCardPipelineUpdate is a no-op when _io is null', async () => {
    const mod = await freshSocketService();
    expect(() => mod.emitCardPipelineUpdate('c', { nodeId: 'n', status: 's' })).not.toThrow();
  });
});

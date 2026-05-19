/**
 * Socket.IO room-join contract for the Log Terminal block.
 *
 * The deploy service's log-stream module emits `logs:entry` to a room
 * named `logs:<terminalNodeId>`. This test exists to lock that exact
 * room name on the consumer side: if either side drifts, log lines reach
 * a phantom room and the UI silently shows nothing. Cheap to assert,
 * impossible to debug at runtime when wrong.
 *
 * We don't spin up an HTTP server — we drive the handler chain directly
 * with a fake io and a fake socket, the same shape Socket.IO would pass.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-for-socket-logs';
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

function makeFakeSocket(): FakeSocket {
  const socket: FakeSocket = {
    id: 'fake-socket-1',
    data: {},
    handshake: { auth: {} },
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

describe('socket service — subscribe:logs / unsubscribe:logs', () => {
  it('joins the room "logs:<terminalNodeId>" matching the LT-3 emit prefix', async () => {
    const { setupSocketService } = await import('../socket/service');

    // Capture the connection callback so we can fire it ourselves with a
    // fake socket — no real Socket.IO server needed.
    let connectionHandler: ((socket: FakeSocket) => void) | null = null;
    const fakeIo = {
      use: vi.fn(),
      on: (event: string, handler: (socket: FakeSocket) => void) => {
        if (event === 'connection') connectionHandler = handler;
      },
      sockets: { adapter: { rooms: new Map() } },
      to: vi.fn(),
    };

    setupSocketService(fakeIo as unknown as Parameters<typeof setupSocketService>[0]);
    expect(connectionHandler).not.toBeNull();

    const socket = makeFakeSocket();
    socket.data = { userId: 'u', organisationId: 'o' };
    connectionHandler!(socket);

    // Verify the handler got registered.
    const subscribeHandler = socket.handlers.get('subscribe:logs');
    const unsubscribeHandler = socket.handlers.get('unsubscribe:logs');
    expect(subscribeHandler).toBeDefined();
    expect(unsubscribeHandler).toBeDefined();

    // Drive subscribe — must produce the exact room name the deploy
    // service's log-stream module emits to.
    subscribeHandler!('terminal-node-42');
    expect(socket.joined).toContain('logs:terminal-node-42');
    expect(socket.joined).toHaveLength(1);

    // Drive unsubscribe — leaves the same room.
    unsubscribeHandler!('terminal-node-42');
    expect(socket.left).toContain('logs:terminal-node-42');
    expect(socket.left).toHaveLength(1);

    // Defensive: empty / non-string ids are ignored, mirroring the
    // existing subscribe:pipeline handler's defensive check. Without it,
    // a bug-mode client sending `null` would join `logs:null`.
    socket.joined.length = 0;
    socket.left.length = 0;
    subscribeHandler!('');
    subscribeHandler!(null as unknown as string);
    subscribeHandler!(undefined as unknown as string);
    expect(socket.joined).toEqual([]);

    unsubscribeHandler!('');
    unsubscribeHandler!(null as unknown as string);
    expect(socket.left).toEqual([]);
  });
});

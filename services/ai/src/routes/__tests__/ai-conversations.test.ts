/**
 * HTTP tests for the AI Conversations router.
 *
 * No supertest in the workspace — boot a tiny Express app on an ephemeral
 * port and hit it with `fetch`. The Prisma client (`@ice/db`) is mocked
 * at the module boundary; the auth middleware is replaced with a shim
 * each test can dial in.
 */

import http from 'node:http';
import express from 'express';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AddressInfo } from 'node:net';

// ── Prisma mock ───────────────────────────────────────────────────────

const findManyMock = vi.fn();
const findFirstMock = vi.fn();
const createMock = vi.fn();
const createManyMock = vi.fn();
const updateMock = vi.fn();
const deleteMock = vi.fn();

vi.mock('@ice/db', () => ({
  default: {
    aiConversation: {
      findMany: (...a: unknown[]) => findManyMock(...a),
      findFirst: (...a: unknown[]) => findFirstMock(...a),
      create: (...a: unknown[]) => createMock(...a),
      update: (...a: unknown[]) => updateMock(...a),
      delete: (...a: unknown[]) => deleteMock(...a),
    },
    aiMessage: {
      createMany: (...a: unknown[]) => createManyMock(...a),
    },
  },
}));

// ── Auth middleware shim ──────────────────────────────────────────────

type AuthMode = 'allow' | 'no-auth';
let currentAuth: AuthMode = 'allow';
let currentUserId: string | undefined = 'user-1';
let currentOrgId: string | undefined = 'org-1';

vi.mock('@ice/shared', () => ({
  requireAuth: (req: any, res: any, next: any) => {
    if (currentAuth === 'no-auth') {
      return res.status(401).json({ message: 'Missing authorization token' });
    }
    req.userId = currentUserId;
    req.organisationId = currentOrgId;
    next();
  },
}));

// ── Test harness ──────────────────────────────────────────────────────

let server: http.Server;
let baseUrl: string;

beforeEach(async () => {
  vi.clearAllMocks();
  currentAuth = 'allow';
  currentUserId = 'user-1';
  currentOrgId = 'org-1';
  vi.spyOn(console, 'error').mockImplementation(() => {});

  const { default: convoRouter } = await import('../ai-conversations');
  const app = express();
  app.use(express.json());
  app.use('/api/ai', convoRouter);

  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  vi.restoreAllMocks();
});

async function request(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: any; raw: string }> {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(`${baseUrl}${path}`, init);
  const raw = await res.text();
  let parsed: any;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = raw;
  }
  return { status: res.status, body: parsed, raw };
}

// ─────────────────────────────────────────────────────────────────────
// GET /conversations
// ─────────────────────────────────────────────────────────────────────

describe('GET /api/ai/conversations', () => {
  it('returns 200 with the conversation list scoped by user + org', async () => {
    const rows = [{ id: 'c1', title: 'one' }];
    findManyMock.mockResolvedValue(rows);

    const res = await request('GET', '/api/ai/conversations?projectId=proj-1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(rows);
    expect(findManyMock).toHaveBeenCalledTimes(1);
    const arg = findManyMock.mock.calls[0][0];
    expect(arg.where).toEqual({
      project_id: 'proj-1',
      user_id: 'user-1',
      organisation_id: 'org-1',
    });
    expect(arg.orderBy).toEqual({ updated_at: 'desc' });
  });

  it('returns 400 when projectId query param is missing', async () => {
    const res = await request('GET', '/api/ai/conversations');
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('projectId');
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it('returns 400 when projectId is provided as a duplicated array (non-string)', async () => {
    // Express parses `?projectId=a&projectId=b` as ['a','b'].
    const res = await request('GET', '/api/ai/conversations?projectId=a&projectId=b');
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('projectId');
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it('returns 401 when auth middleware rejects', async () => {
    currentAuth = 'no-auth';
    const res = await request('GET', '/api/ai/conversations?projectId=proj-1');
    expect(res.status).toBe(401);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it('returns 500 when the prisma query throws', async () => {
    findManyMock.mockRejectedValue(new Error('db fire'));
    const res = await request('GET', '/api/ai/conversations?projectId=proj-1');
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Failed to list conversations');
  });
});

// ─────────────────────────────────────────────────────────────────────
// POST /conversations
// ─────────────────────────────────────────────────────────────────────

describe('POST /api/ai/conversations', () => {
  it('returns 200 with the created row and persists auth-derived user + org', async () => {
    const created = { id: 'new-id', title: 'A title' };
    createMock.mockResolvedValue(created);

    const res = await request('POST', '/api/ai/conversations', {
      projectId: 'proj-1',
      cardId: 'card-1',
      title: 'A title',
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(created);
    const arg = createMock.mock.calls[0][0];
    expect(arg.data).toEqual({
      project_id: 'proj-1',
      card_id: 'card-1',
      user_id: 'user-1',
      organisation_id: 'org-1',
      title: 'A title',
    });
  });

  it('persists null cardId/title when not supplied (defaults branch)', async () => {
    createMock.mockResolvedValue({ id: 'x' });
    const res = await request('POST', '/api/ai/conversations', { projectId: 'proj-1' });
    expect(res.status).toBe(200);
    const data = createMock.mock.calls[0][0].data;
    expect(data.card_id).toBeNull();
    expect(data.title).toBeNull();
  });

  it('returns 400 when projectId is missing', async () => {
    const res = await request('POST', '/api/ai/conversations', { cardId: 'card-1' });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('projectId');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('uses the auth-derived organisation_id even if the body tries to spoof one', async () => {
    createMock.mockResolvedValue({ id: 'a' });
    await request('POST', '/api/ai/conversations', {
      projectId: 'proj-1',
      organisation_id: 'evil-org', // body field name; ignored by the handler
    });
    const data = createMock.mock.calls[0][0].data;
    expect(data.organisation_id).toBe('org-1');
  });

  it('returns 500 when prisma.create throws', async () => {
    createMock.mockRejectedValue(new Error('boom'));
    const res = await request('POST', '/api/ai/conversations', { projectId: 'proj-1' });
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Failed to create conversation');
  });
});

// ─────────────────────────────────────────────────────────────────────
// GET /conversations/:id
// ─────────────────────────────────────────────────────────────────────

describe('GET /api/ai/conversations/:id', () => {
  it('returns 200 with the conversation when found and owned by the user', async () => {
    const row = { id: 'c1', title: 't', messages: [{ id: 'm1' }] };
    findFirstMock.mockResolvedValue(row);

    const res = await request('GET', '/api/ai/conversations/c1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(row);
    const arg = findFirstMock.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'c1', user_id: 'user-1' });
    expect(arg.include.messages.orderBy).toEqual({ created_at: 'asc' });
  });

  it('returns 404 when the conversation does not exist or belongs to another user', async () => {
    findFirstMock.mockResolvedValue(null);
    const res = await request('GET', '/api/ai/conversations/missing');
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Conversation not found');
  });

  it('returns 500 when prisma throws', async () => {
    findFirstMock.mockRejectedValue(new Error('db down'));
    const res = await request('GET', '/api/ai/conversations/c1');
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Failed to get conversation');
  });
});

// ─────────────────────────────────────────────────────────────────────
// POST /conversations/:id/messages
// ─────────────────────────────────────────────────────────────────────

describe('POST /api/ai/conversations/:id/messages', () => {
  const baseMessages = [
    { role: 'user', content: 'Hello there' },
    { role: 'assistant', content: 'Hi!' },
  ];

  it('returns 200 with { count } and creates messages with conversation_id from the URL', async () => {
    findFirstMock.mockResolvedValue({ id: 'c1', title: 'existing-title' });
    createManyMock.mockResolvedValue({ count: 2 });
    updateMock.mockResolvedValue({});

    const res = await request('POST', '/api/ai/conversations/c1/messages', {
      messages: baseMessages,
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ count: 2 });
    const data = createManyMock.mock.calls[0][0].data as any[];
    expect(data).toHaveLength(2);
    for (const row of data) expect(row.conversation_id).toBe('c1');
    // Title already set → must NOT be re-written.
    const updateData = updateMock.mock.calls[0][0].data;
    expect('title' in updateData).toBe(false);
  });

  it('auto-derives the title from the first user message when conversation has no title yet', async () => {
    findFirstMock.mockResolvedValue({ id: 'c1', title: null });
    createManyMock.mockResolvedValue({ count: 2 });
    updateMock.mockResolvedValue({});

    const longContent = 'a'.repeat(200);
    await request('POST', '/api/ai/conversations/c1/messages', {
      messages: [
        { role: 'assistant', content: 'leading non-user msg' },
        { role: 'user', content: longContent },
      ],
    });

    const updateData = updateMock.mock.calls[0][0].data;
    expect(updateData.title).toBe('a'.repeat(80));
  });

  it('does not derive a title when no user messages are present', async () => {
    findFirstMock.mockResolvedValue({ id: 'c1', title: null });
    createManyMock.mockResolvedValue({ count: 1 });
    updateMock.mockResolvedValue({});

    await request('POST', '/api/ai/conversations/c1/messages', {
      messages: [{ role: 'assistant', content: 'assistant only' }],
    });

    const updateData = updateMock.mock.calls[0][0].data;
    expect('title' in updateData).toBe(false);
  });

  it('maps optional message fields to defaults: operations=null, operation_count=0, suggestions=null', async () => {
    findFirstMock.mockResolvedValue({ id: 'c1', title: 'x' });
    createManyMock.mockResolvedValue({ count: 1 });
    updateMock.mockResolvedValue({});

    await request('POST', '/api/ai/conversations/c1/messages', {
      messages: [{ role: 'user', content: 'minimal' }],
    });
    const row = createManyMock.mock.calls[0][0].data[0];
    expect(row.operations).toBeNull();
    expect(row.operation_count).toBe(0);
    expect(row.suggestions).toBeNull();
  });

  it('preserves provided optional message fields verbatim', async () => {
    findFirstMock.mockResolvedValue({ id: 'c1', title: 'x' });
    createManyMock.mockResolvedValue({ count: 1 });
    updateMock.mockResolvedValue({});

    const ops = [{ op: 'addNode', node: { id: 'n1' } }];
    const suggestions = ['next-step-a'];
    await request('POST', '/api/ai/conversations/c1/messages', {
      messages: [
        {
          role: 'assistant',
          content: 'done',
          operations: ops,
          operationCount: 5,
          suggestions,
        },
      ],
    });
    const row = createManyMock.mock.calls[0][0].data[0];
    expect(row.operations).toEqual(ops);
    expect(row.operation_count).toBe(5);
    expect(row.suggestions).toEqual(suggestions);
  });

  it('returns 400 when messages is missing', async () => {
    const res = await request('POST', '/api/ai/conversations/c1/messages', {});
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('messages');
    expect(findFirstMock).not.toHaveBeenCalled();
  });

  it('returns 400 when messages is an empty array', async () => {
    const res = await request('POST', '/api/ai/conversations/c1/messages', { messages: [] });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('messages');
  });

  it('returns 400 when messages is not an array (object payload)', async () => {
    const res = await request('POST', '/api/ai/conversations/c1/messages', { messages: { role: 'user' } });
    expect(res.status).toBe(400);
  });

  it('returns 404 when the conversation does not belong to the user', async () => {
    findFirstMock.mockResolvedValue(null);
    const res = await request('POST', '/api/ai/conversations/c1/messages', {
      messages: baseMessages,
    });
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Conversation not found');
    expect(createManyMock).not.toHaveBeenCalled();
  });

  it('returns 500 when prisma.aiMessage.createMany throws', async () => {
    findFirstMock.mockResolvedValue({ id: 'c1', title: 'x' });
    createManyMock.mockRejectedValue(new Error('insert blew up'));
    const res = await request('POST', '/api/ai/conversations/c1/messages', {
      messages: baseMessages,
    });
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Failed to append messages');
  });
});

// ─────────────────────────────────────────────────────────────────────
// DELETE /conversations/:id
// ─────────────────────────────────────────────────────────────────────

describe('DELETE /api/ai/conversations/:id', () => {
  it('returns 200 with success after verifying ownership and calling delete', async () => {
    findFirstMock.mockResolvedValue({ id: 'c1' });
    deleteMock.mockResolvedValue({});
    const res = await request('DELETE', '/api/ai/conversations/c1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(findFirstMock).toHaveBeenCalledWith({ where: { id: 'c1', user_id: 'user-1' } });
    expect(deleteMock).toHaveBeenCalledWith({ where: { id: 'c1' } });
  });

  it('returns 404 when the conversation does not belong to the user (no delete fired)', async () => {
    findFirstMock.mockResolvedValue(null);
    const res = await request('DELETE', '/api/ai/conversations/c1');
    expect(res.status).toBe(404);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('returns 500 when prisma.delete throws after a successful ownership check', async () => {
    findFirstMock.mockResolvedValue({ id: 'c1' });
    deleteMock.mockRejectedValue(new Error('delete failed'));
    const res = await request('DELETE', '/api/ai/conversations/c1');
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Failed to delete conversation');
  });
});

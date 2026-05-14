/**
 * HTTP tests for the AI generation/validation/diagnose/dryrun router.
 *
 * No supertest in the workspace — boot a tiny in-process Express app on
 * an ephemeral port and hit it with `fetch`. Every leaf service module
 * (`ai.service`, `ai-audit.service`, `canvas-validation.service`,
 * `deploy-dryrun.service`, `diagnose-deploy.service`) is mocked at the
 * module boundary; the auth middleware is replaced with a shim that each
 * test can dial in.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

// ── Service / Prisma mocks ────────────────────────────────────────────

const processCanvasIntentMock = vi.fn();
const streamCanvasIntentMock = vi.fn();
const getAiProviderMock = vi.fn();

vi.mock('../../services/ai.service', () => ({
  processCanvasIntent: (...a: unknown[]) => processCanvasIntentMock(...a),
  streamCanvasIntent: (...a: unknown[]) => streamCanvasIntentMock(...a),
  getAiProvider: (...a: unknown[]) => getAiProviderMock(...a),
}));

const listAuditEntriesMock = vi.fn();
const getAuditEntryMock = vi.fn();

vi.mock('../../services/ai-audit.service', () => ({
  listAuditEntries: (...a: unknown[]) => listAuditEntriesMock(...a),
  getAuditEntry: (...a: unknown[]) => getAuditEntryMock(...a),
}));

const validateCanvasMock = vi.fn();
vi.mock('../../services/canvas-validation.service', () => ({
  validateCanvas: (...a: unknown[]) => validateCanvasMock(...a),
}));

const dryRunDeployMock = vi.fn();
vi.mock('../../services/deploy-dryrun.service', () => ({
  dryRunDeploy: (...a: unknown[]) => dryRunDeployMock(...a),
}));

const diagnoseDeployMock = vi.fn();
vi.mock('../../services/diagnose-deploy.service', () => ({
  diagnoseDeploy: (...a: unknown[]) => diagnoseDeployMock(...a),
}));

const aiAuditFindUniqueMock = vi.fn();
const canvasCardFindUniqueMock = vi.fn();

vi.mock('@ice/db', () => ({
  default: {
    aiAuditLog: {
      findUnique: (...a: unknown[]) => aiAuditFindUniqueMock(...a),
    },
    canvasCard: {
      findUnique: (...a: unknown[]) => canvasCardFindUniqueMock(...a),
    },
  },
}));

// ── Auth middleware shim ──────────────────────────────────────────────

type AuthMode = 'allow' | 'no-auth' | 'no-org' | 'no-project-access';
let currentAuth: AuthMode = 'allow';
let currentUserId: string | undefined = 'user-1';
let currentOrgId: string | undefined = 'org-1';

vi.mock('@ice/shared', () => ({
  requireAuth: (req: any, res: any, next: any) => {
    if (currentAuth === 'no-auth') {
      return res.status(401).json({ message: 'Missing authorization token' });
    }
    req.userId = currentUserId;
    req.organisationId = currentAuth === 'no-org' ? undefined : currentOrgId;
    next();
  },
  requireProjectAccess:
    (_role: string) =>
    (_req: any, res: any, next: any) => {
      if (currentAuth === 'no-project-access') {
        return res.status(403).json({ message: 'Insufficient project permissions' });
      }
      next();
    },
}));

// `express-rate-limit` defaults to an in-memory store keyed off req.ip.
// In tests every request comes from 127.0.0.1, so a real limiter would
// trip after 30 calls and skew results. The mock returns a passthrough
// middleware AND captures the `keyGenerator` so we can assert each
// branch of `req.userId || req.ip || 'unknown'`.
const capturedRateLimitOptions: { keyGenerator?: (req: any) => string } = {};
vi.mock('express-rate-limit', () => ({
  rateLimit: (opts: any) => {
    capturedRateLimitOptions.keyGenerator = opts?.keyGenerator;
    return (_req: any, _res: any, next: any) => next();
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

  const { default: aiRouter } = await import('../ai');
  const app = express();
  app.use(express.json());
  app.use('/api/ai', aiRouter);

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
  headers: Record<string, string> = {},
): Promise<{ status: number; body: any; raw: string; contentType: string | null }> {
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(`${baseUrl}${path}`, init);
  const raw = await res.text();
  let parsed: any = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = raw;
  }
  return { status: res.status, body: parsed, raw, contentType: res.headers.get('content-type') };
}

const baseCanvasContext = { nodes: [], edges: [], selectedNodeIds: [], availableBlockTypes: [] };

// ─────────────────────────────────────────────────────────────────────
// Auth (router-level requireAuth)
// ─────────────────────────────────────────────────────────────────────

describe('requireAuth (router-level)', () => {
  it('returns 401 for any endpoint when auth is missing', async () => {
    currentAuth = 'no-auth';
    const res = await request('GET', '/api/ai/health');
    expect(res.status).toBe(401);
    expect(getAiProviderMock).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────
// Rate-limit keyGenerator: req.userId || req.ip || 'unknown'
// ─────────────────────────────────────────────────────────────────────

describe('aiLimiter.keyGenerator', () => {
  it('returns req.userId when set (first branch)', () => {
    const fn = capturedRateLimitOptions.keyGenerator!;
    expect(fn({ userId: 'user-42', ip: '1.2.3.4' })).toBe('user-42');
  });

  it('falls back to req.ip when userId is absent', () => {
    const fn = capturedRateLimitOptions.keyGenerator!;
    expect(fn({ ip: '1.2.3.4' })).toBe('1.2.3.4');
  });

  it("falls back to 'unknown' when neither userId nor ip is present", () => {
    const fn = capturedRateLimitOptions.keyGenerator!;
    expect(fn({})).toBe('unknown');
  });
});

// ─────────────────────────────────────────────────────────────────────
// GET /health
// ─────────────────────────────────────────────────────────────────────

describe('GET /api/ai/health', () => {
  it('returns provider health JSON on success', async () => {
    const healthCheck = vi.fn().mockResolvedValue({ ok: true, provider: 'anthropic' });
    getAiProviderMock.mockResolvedValue({ healthCheck });
    const res = await request('GET', '/api/ai/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, provider: 'anthropic' });
  });

  it('returns 200 with { ok: false } when getAiProvider throws (degraded fallback)', async () => {
    getAiProviderMock.mockRejectedValue(new Error('no key'));
    const res = await request('GET', '/api/ai/health');
    // Note: handler returns the error envelope with res.json (200) — a
    // healthcheck not returning HTTP 5xx is intentional.
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: false, provider: 'unknown', error: 'no key' });
  });
});

// ─────────────────────────────────────────────────────────────────────
// POST /canvas-intent
// ─────────────────────────────────────────────────────────────────────

describe('POST /api/ai/canvas-intent', () => {
  it('returns 200 with the service result for a JSON request', async () => {
    const result = { explanation: 'ok', operations: [] };
    processCanvasIntentMock.mockResolvedValue(result);

    const res = await request('POST', '/api/ai/canvas-intent', {
      intent: 'add a redis',
      canvasContext: baseCanvasContext,
      cardId: 'card-1',
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(result);
    expect(processCanvasIntentMock).toHaveBeenCalledWith('add a redis', baseCanvasContext, 'card-1', expect.any(String));
    expect(streamCanvasIntentMock).not.toHaveBeenCalled();
  });

  it('routes to streamCanvasIntent when the Accept header asks for SSE', async () => {
    streamCanvasIntentMock.mockImplementation(async (_intent, _canvas, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('event: done\ndata: {}\n\n');
      res.end();
    });

    const res = await request(
      'POST',
      '/api/ai/canvas-intent',
      { intent: 'hi', canvasContext: baseCanvasContext, cardId: 'card-1' },
      { Accept: 'text/event-stream' },
    );

    expect(streamCanvasIntentMock).toHaveBeenCalledTimes(1);
    expect(streamCanvasIntentMock.mock.calls[0][0]).toBe('hi');
    expect(streamCanvasIntentMock.mock.calls[0][1]).toEqual(baseCanvasContext);
    expect(streamCanvasIntentMock.mock.calls[0][3]).toBe('card-1');
    expect(processCanvasIntentMock).not.toHaveBeenCalled();
    expect(res.contentType).toContain('text/event-stream');
    expect(res.raw).toContain('event: done');
  });

  it('returns 400 when intent is missing', async () => {
    const res = await request('POST', '/api/ai/canvas-intent', {
      canvasContext: baseCanvasContext,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('intent');
    expect(processCanvasIntentMock).not.toHaveBeenCalled();
  });

  it('returns 400 when intent is the wrong type', async () => {
    const res = await request('POST', '/api/ai/canvas-intent', {
      intent: 42,
      canvasContext: baseCanvasContext,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('intent');
  });

  it('returns 400 when canvasContext is missing', async () => {
    const res = await request('POST', '/api/ai/canvas-intent', { intent: 'hi' });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('canvas context');
  });

  it('returns 500 with the service error message when processCanvasIntent throws', async () => {
    processCanvasIntentMock.mockRejectedValue(new Error('upstream timeout'));
    const res = await request('POST', '/api/ai/canvas-intent', {
      intent: 'hi',
      canvasContext: baseCanvasContext,
    });
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('upstream timeout');
  });

  it('returns 500 with a fallback message when the thrown error has no message', async () => {
    processCanvasIntentMock.mockRejectedValue({});
    const res = await request('POST', '/api/ai/canvas-intent', {
      intent: 'hi',
      canvasContext: baseCanvasContext,
    });
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('AI processing failed');
  });

  it('emits an SSE error frame when stream errors AFTER headers were flushed (findings #22)', async () => {
    // The previous handler called res.status(500).json(...) inside
    // the catch — once SSE headers were already on the wire that
    // throws ERR_HTTP_HEADERS_SENT and crashes the request handler.
    // The fix detects res.headersSent and ships one last
    // `event: error` frame instead.
    streamCanvasIntentMock.mockImplementation(async (_intent, _canvas, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('event: thinking\ndata: {}\n\n');
      throw new Error('upstream rugpull');
    });

    const res = await request(
      'POST',
      '/api/ai/canvas-intent',
      { intent: 'hi', canvasContext: baseCanvasContext, cardId: 'card-1' },
      { Accept: 'text/event-stream' },
    );

    expect(res.contentType).toContain('text/event-stream');
    expect(res.raw).toContain('event: error');
    expect(res.raw).toContain('upstream rugpull');
  });
});

// ─────────────────────────────────────────────────────────────────────
// POST /diagnose-deploy
// ─────────────────────────────────────────────────────────────────────

describe('POST /api/ai/diagnose-deploy', () => {
  const validBody = {
    error: 'permission denied',
    canvasContext: baseCanvasContext,
    resourceResults: [],
    provider: 'gcp',
    region: 'us-central1',
  };

  it('returns 200 with the service result on success', async () => {
    const result = { diagnosis: 'no IAM', suggestedFixes: ['grant role'] };
    diagnoseDeployMock.mockResolvedValue(result);
    const res = await request('POST', '/api/ai/diagnose-deploy', validBody);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(result);
    expect(diagnoseDeployMock).toHaveBeenCalledWith(validBody, expect.any(String));
  });

  it('returns 400 when error is missing', async () => {
    const { error: _omit, ...rest } = validBody;
    const res = await request('POST', '/api/ai/diagnose-deploy', rest);
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('error');
    expect(diagnoseDeployMock).not.toHaveBeenCalled();
  });

  it('returns 400 when canvasContext is missing', async () => {
    const { canvasContext: _omit, ...rest } = validBody;
    const res = await request('POST', '/api/ai/diagnose-deploy', rest);
    expect(res.status).toBe(400);
  });

  it('returns 400 when the body is empty', async () => {
    const res = await request('POST', '/api/ai/diagnose-deploy', {});
    expect(res.status).toBe(400);
  });

  it('returns 500 with the service error message', async () => {
    diagnoseDeployMock.mockRejectedValue(new Error('llm offline'));
    const res = await request('POST', '/api/ai/diagnose-deploy', validBody);
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('llm offline');
  });

  it('returns 500 with a fallback message when the thrown error has no message', async () => {
    diagnoseDeployMock.mockRejectedValue({});
    const res = await request('POST', '/api/ai/diagnose-deploy', validBody);
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Diagnosis failed');
  });
});

// ─────────────────────────────────────────────────────────────────────
// POST /validate
// ─────────────────────────────────────────────────────────────────────

describe('POST /api/ai/validate', () => {
  it('returns 200 with the validation result; defaults edges to []', async () => {
    const result = { ok: true, errors: [] };
    validateCanvasMock.mockResolvedValue(result);
    const res = await request('POST', '/api/ai/validate', { nodes: [{ id: 'n1' }] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(result);
    expect(validateCanvasMock).toHaveBeenCalledWith([{ id: 'n1' }], []);
  });

  it('forwards explicit edges when provided', async () => {
    validateCanvasMock.mockResolvedValue({ ok: true, errors: [] });
    const edges = [{ source: 'a', target: 'b' }];
    await request('POST', '/api/ai/validate', { nodes: [], edges });
    expect(validateCanvasMock).toHaveBeenCalledWith([], edges);
  });

  it('returns 400 when nodes is missing', async () => {
    const res = await request('POST', '/api/ai/validate', {});
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('nodes');
    expect(validateCanvasMock).not.toHaveBeenCalled();
  });

  it('returns 400 when nodes is not an array', async () => {
    const res = await request('POST', '/api/ai/validate', { nodes: { id: 'n1' } });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('nodes');
  });

  it('returns 500 with the service error message', async () => {
    validateCanvasMock.mockRejectedValue(new Error('schema fetch failed'));
    const res = await request('POST', '/api/ai/validate', { nodes: [] });
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('schema fetch failed');
  });

  it('returns 500 with a fallback message when error has none', async () => {
    validateCanvasMock.mockRejectedValue({});
    const res = await request('POST', '/api/ai/validate', { nodes: [] });
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Validation failed');
  });
});

// ─────────────────────────────────────────────────────────────────────
// POST /dryrun
// ─────────────────────────────────────────────────────────────────────

describe('POST /api/ai/dryrun', () => {
  it('returns 200 with the dry-run result; forwards options', async () => {
    const result = { plan: [] };
    dryRunDeployMock.mockResolvedValue(result);
    await request('POST', '/api/ai/dryrun', {
      nodes: [{ id: 'n1' }],
      edges: [{ source: 'a', target: 'b' }],
      options: { region: 'us-central1' },
    });
    expect(dryRunDeployMock).toHaveBeenCalledWith(
      [{ id: 'n1' }],
      [{ source: 'a', target: 'b' }],
      { region: 'us-central1' },
    );
  });

  it('defaults edges to [] when omitted', async () => {
    dryRunDeployMock.mockResolvedValue({ plan: [] });
    await request('POST', '/api/ai/dryrun', { nodes: [] });
    expect(dryRunDeployMock).toHaveBeenCalledWith([], [], undefined);
  });

  it('returns 400 when nodes is missing', async () => {
    const res = await request('POST', '/api/ai/dryrun', {});
    expect(res.status).toBe(400);
    expect(dryRunDeployMock).not.toHaveBeenCalled();
  });

  it('returns 400 when nodes is not an array', async () => {
    const res = await request('POST', '/api/ai/dryrun', { nodes: 'not an array' });
    expect(res.status).toBe(400);
  });

  it('returns 500 with the service error message', async () => {
    dryRunDeployMock.mockRejectedValue(new Error('dry-run blew up'));
    const res = await request('POST', '/api/ai/dryrun', { nodes: [] });
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('dry-run blew up');
  });

  it('returns 500 with a fallback message when the error has no message', async () => {
    dryRunDeployMock.mockRejectedValue({});
    const res = await request('POST', '/api/ai/dryrun', { nodes: [] });
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Dry-run failed');
  });
});

// ─────────────────────────────────────────────────────────────────────
// GET /audit/list
// ─────────────────────────────────────────────────────────────────────

describe('GET /api/ai/audit/list', () => {
  it('returns 200 with { entries } scoped by org', async () => {
    const entries = [{ id: 'a1', timestamp: 't', intent: 'i' }];
    listAuditEntriesMock.mockResolvedValue(entries);
    const res = await request('GET', '/api/ai/audit/list');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ entries });
    expect(listAuditEntriesMock).toHaveBeenCalledWith(50, 'org-1');
  });

  it('returns 400 when org context is missing', async () => {
    currentAuth = 'no-org';
    const res = await request('GET', '/api/ai/audit/list');
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Organisation');
    expect(listAuditEntriesMock).not.toHaveBeenCalled();
  });

  it('returns 500 with the service error message', async () => {
    listAuditEntriesMock.mockRejectedValue(new Error('db gone'));
    const res = await request('GET', '/api/ai/audit/list');
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('db gone');
  });

  it('returns 500 with a fallback when the error has no message', async () => {
    listAuditEntriesMock.mockRejectedValue({});
    const res = await request('GET', '/api/ai/audit/list');
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Failed to list audit entries');
  });
});

// ─────────────────────────────────────────────────────────────────────
// GET /audit/:id
// ─────────────────────────────────────────────────────────────────────

describe('GET /api/ai/audit/:id', () => {
  it('returns 200 with the audit entry when org matches', async () => {
    const entry = { id: 'a1', timestamp: 't', intent: 'i' };
    getAuditEntryMock.mockResolvedValue(entry);
    aiAuditFindUniqueMock.mockResolvedValue({ organisation_id: 'org-1' });
    const res = await request('GET', '/api/ai/audit/a1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(entry);
  });

  it('returns 200 when the row has no organisation_id (older row, allowed)', async () => {
    const entry = { id: 'a1', timestamp: 't', intent: 'i' };
    getAuditEntryMock.mockResolvedValue(entry);
    aiAuditFindUniqueMock.mockResolvedValue({ organisation_id: null });
    const res = await request('GET', '/api/ai/audit/a1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(entry);
  });

  it('returns 200 when the row lookup itself returns null (defensive fallback)', async () => {
    const entry = { id: 'a1', timestamp: 't', intent: 'i' };
    getAuditEntryMock.mockResolvedValue(entry);
    aiAuditFindUniqueMock.mockResolvedValue(null);
    const res = await request('GET', '/api/ai/audit/a1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(entry);
  });

  it('returns 400 when org context is missing', async () => {
    currentAuth = 'no-org';
    const res = await request('GET', '/api/ai/audit/a1');
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Organisation');
    expect(getAuditEntryMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the entry does not exist', async () => {
    getAuditEntryMock.mockResolvedValue(null);
    const res = await request('GET', '/api/ai/audit/missing');
    expect(res.status).toBe(404);
    expect(res.body.message).toContain('not found');
  });

  it('returns 404 when the entry exists but belongs to a different org (cross-tenant guard)', async () => {
    getAuditEntryMock.mockResolvedValue({ id: 'a1', timestamp: 't', intent: 'i' });
    aiAuditFindUniqueMock.mockResolvedValue({ organisation_id: 'other-org' });
    const res = await request('GET', '/api/ai/audit/a1');
    expect(res.status).toBe(404);
    expect(res.body.message).toContain('not found');
  });

  it('returns 500 with the service error message', async () => {
    getAuditEntryMock.mockRejectedValue(new Error('audit db down'));
    const res = await request('GET', '/api/ai/audit/a1');
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('audit db down');
  });

  it('returns 500 with a fallback when the error has no message', async () => {
    getAuditEntryMock.mockRejectedValue({});
    const res = await request('GET', '/api/ai/audit/a1');
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Failed to get audit entry');
  });
});

// ─────────────────────────────────────────────────────────────────────
// GET /inspect/:cardId/summary
// ─────────────────────────────────────────────────────────────────────

describe('GET /api/ai/inspect/:cardId/summary', () => {
  it('returns 200 text/plain with a formatted node + edge listing using node.data fields', async () => {
    canvasCardFindUniqueMock.mockResolvedValue({
      id: 'card-1',
      name: 'My Canvas',
      nodes: [
        {
          id: 'n1',
          data: { label: 'API', iceType: 'Compute.Container', provider: 'gcp' },
        },
      ],
      edges: [
        { source: 'n1', target: 'n2', data: { relationship: 'reads' } },
      ],
    });

    const res = await request('GET', '/api/ai/inspect/card-1/summary');

    expect(res.status).toBe(200);
    expect(res.contentType).toContain('text/plain');
    expect(res.raw).toContain('Canvas: "My Canvas"');
    expect(res.raw).toContain('Nodes (1):');
    expect(res.raw).toContain('"API"');
    expect(res.raw).toContain('[Compute.Container]');
    expect(res.raw).toContain('(gcp)');
    expect(res.raw).toContain('Connections (1):');
    expect(res.raw).toContain('n1 → n2');
    expect(res.raw).toContain('(reads)');
  });

  it('falls back to top-level node fields when node.data is absent', async () => {
    canvasCardFindUniqueMock.mockResolvedValue({
      id: 'card-1',
      name: 'flat',
      nodes: [{ id: 'n1', label: 'TopLabel', iceType: 'Network.VPC', provider: 'aws' }],
      edges: [{ source: 'n1', target: 'n2', relationship: 'links' }],
    });

    const res = await request('GET', '/api/ai/inspect/card-1/summary');
    expect(res.status).toBe(200);
    expect(res.raw).toContain('"TopLabel"');
    expect(res.raw).toContain('[Network.VPC]');
    expect(res.raw).toContain('(aws)');
    expect(res.raw).toContain('(links)');
  });

  it('falls back to "Untitled" / "unknown" / "?" when fields are absent (default branches)', async () => {
    canvasCardFindUniqueMock.mockResolvedValue({
      id: 'card-1',
      name: 'sparse',
      nodes: [{ id: 'n1' }],
      edges: [{ source: 'a', target: 'b' }],
    });
    const res = await request('GET', '/api/ai/inspect/card-1/summary');
    expect(res.status).toBe(200);
    expect(res.raw).toContain('"Untitled"');
    expect(res.raw).toContain('[unknown]');
    expect(res.raw).toContain('(?)');
  });

  it('renders "(none)" placeholders when nodes and edges arrays are empty', async () => {
    canvasCardFindUniqueMock.mockResolvedValue({
      id: 'card-1',
      name: 'empty',
      nodes: [],
      edges: [],
    });
    const res = await request('GET', '/api/ai/inspect/card-1/summary');
    expect(res.status).toBe(200);
    expect(res.raw).toContain('Nodes (0):\n  (none)');
    expect(res.raw).toContain('Connections (0):\n  (none)');
  });

  it('treats non-array nodes/edges as empty (defensive default)', async () => {
    canvasCardFindUniqueMock.mockResolvedValue({
      id: 'card-1',
      name: 'broken',
      nodes: null,
      edges: null,
    });
    const res = await request('GET', '/api/ai/inspect/card-1/summary');
    expect(res.status).toBe(200);
    expect(res.raw).toContain('Nodes (0):\n  (none)');
  });

  it('returns 404 when the card is not found', async () => {
    canvasCardFindUniqueMock.mockResolvedValue(null);
    const res = await request('GET', '/api/ai/inspect/missing/summary');
    expect(res.status).toBe(404);
    expect(res.body.message).toContain('not found');
  });

  it('returns 403 when requireProjectAccess rejects', async () => {
    currentAuth = 'no-project-access';
    const res = await request('GET', '/api/ai/inspect/card-1/summary');
    expect(res.status).toBe(403);
    expect(canvasCardFindUniqueMock).not.toHaveBeenCalled();
  });

  it('returns 500 with the prisma error message', async () => {
    canvasCardFindUniqueMock.mockRejectedValue(new Error('cards.findUnique blew up'));
    const res = await request('GET', '/api/ai/inspect/card-1/summary');
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('cards.findUnique blew up');
  });

  it('returns 500 with a fallback message when the thrown error has none', async () => {
    canvasCardFindUniqueMock.mockRejectedValue({});
    const res = await request('GET', '/api/ai/inspect/card-1/summary');
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Failed to inspect card');
  });
});

// ─────────────────────────────────────────────────────────────────────
// GET /inspect/:cardId/state
// ─────────────────────────────────────────────────────────────────────

describe('GET /api/ai/inspect/:cardId/state', () => {
  it('returns 200 with the raw card JSON shape', async () => {
    const card = {
      id: 'card-1',
      name: 'thing',
      nodes: [{ id: 'n1' }],
      edges: [{ source: 'a', target: 'b' }],
      viewport: { x: 0, y: 0, zoom: 1 },
      // Extra fields that must be filtered out:
      project_id: 'proj-1',
      created_at: 'now',
    };
    canvasCardFindUniqueMock.mockResolvedValue(card);
    const res = await request('GET', '/api/ai/inspect/card-1/state');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 'card-1',
      name: 'thing',
      nodes: [{ id: 'n1' }],
      edges: [{ source: 'a', target: 'b' }],
      viewport: { x: 0, y: 0, zoom: 1 },
    });
    expect(res.body.project_id).toBeUndefined();
  });

  it('returns 404 when the card is not found', async () => {
    canvasCardFindUniqueMock.mockResolvedValue(null);
    const res = await request('GET', '/api/ai/inspect/missing/state');
    expect(res.status).toBe(404);
  });

  it('returns 403 when requireProjectAccess rejects', async () => {
    currentAuth = 'no-project-access';
    const res = await request('GET', '/api/ai/inspect/card-1/state');
    expect(res.status).toBe(403);
  });

  it('returns 500 with the prisma error message', async () => {
    canvasCardFindUniqueMock.mockRejectedValue(new Error('boom'));
    const res = await request('GET', '/api/ai/inspect/card-1/state');
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('boom');
  });

  it('returns 500 with a fallback message when the error has none', async () => {
    canvasCardFindUniqueMock.mockRejectedValue({});
    const res = await request('GET', '/api/ai/inspect/card-1/state');
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Failed to get card state');
  });
});

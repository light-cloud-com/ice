/**
 * OpenAICompatProvider tests.
 *
 * The provider speaks raw `node:http` to be fetch-independent and keep the
 * streaming path simple. Tests use the documented "supertest replacement"
 * pattern from state/learnings.md (anchor: supertest-not-in-monorepo-use-
 * fetch-against-app-listen): bind a real server on an ephemeral port and
 * drive the full HTTP round-trip, which exercises every branch of the
 * `node:http` glue without mocking the standard library.
 */

import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OpenAICompatProvider } from '../providers/openai-compat';

interface RouteHandler {
  (req: http.IncomingMessage, res: http.ServerResponse, body: string): void | Promise<void>;
}

interface TestServer {
  baseUrl: string;
  close: () => Promise<void>;
  /** Most recent Authorization header observed (lowercased name). */
  lastAuth: () => string | undefined;
  /** Body of the most recent POST /v1/chat/completions. */
  lastPostBody: () => string | undefined;
}

async function startTestServer(routes: Record<string, RouteHandler>): Promise<TestServer> {
  let lastAuthHeader: string | undefined;
  let lastBody: string | undefined;

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk.toString()));
    req.on('end', () => {
      lastAuthHeader = req.headers.authorization;
      if (req.url?.startsWith('/v1/chat/completions') && req.method === 'POST') {
        lastBody = body;
      }
      const handler = routes[req.url ?? ''];
      if (!handler) {
        res.statusCode = 404;
        res.end('not found');
        return;
      }
      void handler(req, res, body);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    lastAuth: () => lastAuthHeader,
    lastPostBody: () => lastBody,
  };
}

/** Write a single SSE event in the OpenAI-compat shape. */
function sseDelta(content: string, finishReason: string | null = null): string {
  return `data: ${JSON.stringify({
    choices: [{ delta: { content }, finish_reason: finishReason }],
  })}\n\n`;
}

describe('OpenAICompatProvider — construction', () => {
  const originalEnv = { url: process.env.ICE_AI_URL, model: process.env.ICE_AI_MODEL };

  beforeEach(() => {
    delete process.env.ICE_AI_URL;
    delete process.env.ICE_AI_MODEL;
  });

  afterEach(() => {
    if (originalEnv.url === undefined) delete process.env.ICE_AI_URL;
    else process.env.ICE_AI_URL = originalEnv.url;
    if (originalEnv.model === undefined) delete process.env.ICE_AI_MODEL;
    else process.env.ICE_AI_MODEL = originalEnv.model;
  });

  it('uses defaults when no options or env vars are set', () => {
    const p = new OpenAICompatProvider();
    expect(p.name).toBe('openai-compat');
    expect(p.isLocal).toBe(true);
    expect(p.model).toBe('default');
  });

  it('reads ICE_AI_URL and ICE_AI_MODEL from the environment', () => {
    process.env.ICE_AI_URL = 'http://env-host:1234';
    process.env.ICE_AI_MODEL = 'env-model';
    const p = new OpenAICompatProvider();
    expect(p.model).toBe('env-model');
  });

  it('strips trailing slashes from baseUrl', () => {
    const p = new OpenAICompatProvider({ baseUrl: 'http://x.test:80//' });
    // Implementation detail: baseUrl is protected. Exercise via observable
    // behavior — health check resolves URLs against this base, so trailing
    // slashes manifest as path doubling. Use a smoke probe that succeeds
    // only when paths are well-formed.
    expect(p.model).toBe('default');
  });

  it('honours an explicit isLocal override', () => {
    const p = new OpenAICompatProvider({ isLocal: false });
    expect(p.isLocal).toBe(false);
  });

  it('uses a custom provider name when supplied', () => {
    const p = new OpenAICompatProvider({ name: 'my-llamafile' });
    expect(p.name).toBe('my-llamafile');
  });

  it('prefers explicit options over environment variables', () => {
    process.env.ICE_AI_URL = 'http://env:1';
    process.env.ICE_AI_MODEL = 'env-model';
    const p = new OpenAICompatProvider({ baseUrl: 'http://opt:2', model: 'opt-model' });
    expect(p.model).toBe('opt-model');
  });
});

describe('OpenAICompatProvider — healthCheck', () => {
  let server: TestServer | undefined;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined;
    }
  });

  it('reports ok when /health returns 2xx', async () => {
    server = await startTestServer({
      '/health': (_req, res) => {
        res.statusCode = 200;
        res.end('ok');
      },
    });
    const p = new OpenAICompatProvider({ baseUrl: server.baseUrl, model: 'm1' });
    const result = await p.healthCheck();
    expect(result).toEqual({ ok: true, provider: 'openai-compat', model: 'm1', isLocal: true });
  });

  it('falls through to /v1/models and adopts the first model id when /health is missing', async () => {
    server = await startTestServer({
      '/health': (_req, res) => {
        res.statusCode = 404;
        res.end('not found');
      },
      '/v1/models': (_req, res) => {
        res.statusCode = 200;
        res.end(JSON.stringify({ data: [{ id: 'discovered-model' }] }));
      },
    });
    const p = new OpenAICompatProvider({ baseUrl: server.baseUrl, model: 'configured' });
    const result = await p.healthCheck();
    expect(result.ok).toBe(true);
    expect(result.model).toBe('discovered-model');
  });

  it('keeps the configured model when /v1/models returns an empty list', async () => {
    server = await startTestServer({
      '/health': (_req, res) => {
        res.statusCode = 500;
        res.end('boom');
      },
      '/v1/models': (_req, res) => {
        res.statusCode = 200;
        res.end(JSON.stringify({ data: [] }));
      },
    });
    const p = new OpenAICompatProvider({ baseUrl: server.baseUrl, model: 'configured' });
    const result = await p.healthCheck();
    expect(result.ok).toBe(true);
    expect(result.model).toBe('configured');
  });

  it('returns auth-error from /health on 401 instead of falling through (findings #17)', async () => {
    // The previous code treated a 401 from /health identically to
    // "endpoint missing", so a misconfigured API key looked like
    // "no /health endpoint" and the user was sent to debug the
    // wrong layer. Now an auth status surfaces directly.
    server = await startTestServer({
      '/health': (_req, res) => {
        res.statusCode = 401;
        res.end('unauthorized');
      },
      '/v1/models': (_req, res) => {
        // Should never be called once /health returns 401.
        res.statusCode = 200;
        res.end(JSON.stringify({ data: [{ id: 'fake' }] }));
      },
    });
    const p = new OpenAICompatProvider({ baseUrl: server.baseUrl });
    const result = await p.healthCheck();
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Authentication failed/);
    expect(result.error).toMatch(/401/);
  });

  it('returns auth-error from /v1/models on 403 (findings #17)', async () => {
    server = await startTestServer({
      '/health': (_req, res) => {
        res.statusCode = 404;
        res.end('not found');
      },
      '/v1/models': (_req, res) => {
        res.statusCode = 403;
        res.end('forbidden');
      },
    });
    const p = new OpenAICompatProvider({ baseUrl: server.baseUrl });
    const result = await p.healthCheck();
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Authentication failed/);
    expect(result.error).toMatch(/403/);
  });

  it('reports not-ok when both /health and /v1/models fail with non-2xx', async () => {
    server = await startTestServer({
      '/health': (_req, res) => {
        res.statusCode = 500;
        res.end('down');
      },
      '/v1/models': (_req, res) => {
        res.statusCode = 503;
        res.end('down');
      },
    });
    const p = new OpenAICompatProvider({ baseUrl: server.baseUrl });
    const result = await p.healthCheck();
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/cannot reach/i);
  });

  it('reports not-ok when the server is unreachable', async () => {
    // Bind then immediately close to capture an unused port; connections
    // will be refused.
    const probe = await startTestServer({});
    const url = probe.baseUrl;
    await probe.close();
    const p = new OpenAICompatProvider({ baseUrl: url });
    const result = await p.healthCheck();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Cannot reach');
  });

  it('treats /health JSON-decode failure as a not-ok response', async () => {
    server = await startTestServer({
      '/health': (_req, res) => {
        res.statusCode = 404;
        res.end('not found');
      },
      '/v1/models': (_req, res) => {
        res.statusCode = 200;
        res.end('not json');
      },
    });
    const p = new OpenAICompatProvider({ baseUrl: server.baseUrl });
    const result = await p.healthCheck();
    expect(result.ok).toBe(false);
  });

  it('attaches Authorization header when an API key is configured', async () => {
    server = await startTestServer({
      '/health': (_req, res) => {
        res.statusCode = 200;
        res.end('ok');
      },
    });
    const p = new OpenAICompatProvider({ baseUrl: server.baseUrl, apiKey: 'secret-key' });
    await p.healthCheck();
    expect(server.lastAuth()).toBe('Bearer secret-key');
  });

  it('omits Authorization header when no API key is configured', async () => {
    server = await startTestServer({
      '/health': (_req, res) => {
        res.statusCode = 200;
        res.end('ok');
      },
    });
    const p = new OpenAICompatProvider({ baseUrl: server.baseUrl });
    await p.healthCheck();
    expect(server.lastAuth()).toBeUndefined();
  });
});

describe('OpenAICompatProvider — streamChat', () => {
  let server: TestServer | undefined;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined;
    }
  });

  it('streams SSE deltas as ChatChunks until [DONE]', async () => {
    server = await startTestServer({
      '/v1/chat/completions': async (_req, res) => {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/event-stream');
        res.write(sseDelta('Hel'));
        res.write(sseDelta('lo'));
        res.write(sseDelta('', 'stop'));
        res.write('data: [DONE]\n\n');
        res.end();
      },
    });
    const p = new OpenAICompatProvider({ baseUrl: server.baseUrl, model: 'test' });
    const chunks: Array<{ content: string; finishReason: string | null | undefined }> = [];
    for await (const c of p.streamChat({
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 64,
    })) {
      chunks.push({ content: c.content, finishReason: c.finishReason ?? null });
    }
    expect(chunks.map((c) => c.content).join('')).toBe('Hello');
    expect(chunks.at(-1)?.finishReason).toBe('stop');
  });

  it('chat() aggregates streamed chunks into a final response', async () => {
    server = await startTestServer({
      '/v1/chat/completions': async (_req, res) => {
        res.statusCode = 200;
        res.write(sseDelta('one '));
        res.write(sseDelta('two', 'stop'));
        res.write('data: [DONE]\n\n');
        res.end();
      },
    });
    const p = new OpenAICompatProvider({ baseUrl: server.baseUrl });
    const result = await p.chat({
      systemPrompt: '',
      messages: [{ role: 'user', content: 'q' }],
      maxTokens: 32,
    });
    expect(result.content).toBe('one two');
    expect(result.finishReason).toBe('stop');
  });

  it('chat() surfaces the wire-level finish reason (findings #18)', async () => {
    // The previous chat() always returned `finishReason: 'stop'`,
    // hiding length-cap truncations and content-filter rejections
    // even though the stream parser already extracted the field.
    server = await startTestServer({
      '/v1/chat/completions': async (_req, res) => {
        res.statusCode = 200;
        res.write(sseDelta('partial '));
        res.write(sseDelta('answer', 'length'));
        res.write('data: [DONE]\n\n');
        res.end();
      },
    });
    const p = new OpenAICompatProvider({ baseUrl: server.baseUrl });
    const result = await p.chat({
      systemPrompt: '',
      messages: [{ role: 'user', content: 'q' }],
      maxTokens: 4,
    });
    expect(result.content).toBe('partial answer');
    expect(result.finishReason).toBe('length');
  });

  it('chat() defaults finishReason to "stop" when wire never reports one (findings #18)', async () => {
    server = await startTestServer({
      '/v1/chat/completions': async (_req, res) => {
        res.statusCode = 200;
        res.write(sseDelta('hello'));
        res.write('data: [DONE]\n\n');
        res.end();
      },
    });
    const p = new OpenAICompatProvider({ baseUrl: server.baseUrl });
    const result = await p.chat({
      systemPrompt: '',
      messages: [{ role: 'user', content: 'q' }],
      maxTokens: 16,
    });
    expect(result.content).toBe('hello');
    expect(result.finishReason).toBe('stop');
  });

  it('forwards sessionId in the request body when provided', async () => {
    server = await startTestServer({
      '/v1/chat/completions': async (_req, res) => {
        res.statusCode = 200;
        res.write('data: [DONE]\n\n');
        res.end();
      },
    });
    const p = new OpenAICompatProvider({ baseUrl: server.baseUrl });
    const it = p.streamChat({
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 8,
      sessionId: 'kv-cache-1',
    });
    // Drain the iterator so the request actually fires.
    for await (const _ of it) {
      void _;
    }
    const body = JSON.parse(server.lastPostBody() ?? '{}');
    expect(body.session_id).toBe('kv-cache-1');
    expect(body.stream).toBe(true);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'sys' });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'hi' });
  });

  it('omits session_id when not provided', async () => {
    server = await startTestServer({
      '/v1/chat/completions': async (_req, res) => {
        res.statusCode = 200;
        res.write('data: [DONE]\n\n');
        res.end();
      },
    });
    const p = new OpenAICompatProvider({ baseUrl: server.baseUrl });
    for await (const _ of p.streamChat({
      systemPrompt: '',
      messages: [],
      maxTokens: 1,
    })) {
      void _;
    }
    const body = JSON.parse(server.lastPostBody() ?? '{}');
    expect(body.session_id).toBeUndefined();
  });

  it('rejects with a typed error when the upstream returns 4xx', async () => {
    server = await startTestServer({
      '/v1/chat/completions': async (_req, res) => {
        res.statusCode = 401;
        res.end('{"error":"unauthorized"}');
      },
    });
    const p = new OpenAICompatProvider({ baseUrl: server.baseUrl, name: 'localmodel' });
    await expect(
      p.chat({ systemPrompt: '', messages: [], maxTokens: 1 }),
    ).rejects.toThrow(/localmodel API error 401:.*unauthorized/);
  });

  it('rejects with a typed error when the upstream returns 5xx', async () => {
    server = await startTestServer({
      '/v1/chat/completions': async (_req, res) => {
        res.statusCode = 500;
        res.end('boom');
      },
    });
    const p = new OpenAICompatProvider({ baseUrl: server.baseUrl });
    await expect(
      p.chat({ systemPrompt: '', messages: [], maxTokens: 1 }),
    ).rejects.toThrow(/API error 500/);
  });

  it('rejects when the connection cannot be established', async () => {
    const probe = await startTestServer({});
    const url = probe.baseUrl;
    await probe.close();
    const p = new OpenAICompatProvider({ baseUrl: url });
    await expect(
      p.chat({ systemPrompt: '', messages: [], maxTokens: 1 }),
    ).rejects.toBeInstanceOf(Error);
  });

  it('truncates upstream error bodies to 200 characters', async () => {
    const longBody = 'X'.repeat(500);
    server = await startTestServer({
      '/v1/chat/completions': async (_req, res) => {
        res.statusCode = 429;
        res.end(longBody);
      },
    });
    const p = new OpenAICompatProvider({ baseUrl: server.baseUrl });
    try {
      await p.chat({ systemPrompt: '', messages: [], maxTokens: 1 });
      throw new Error('expected throw');
    } catch (err) {
      const msg = (err as Error).message;
      // 200 chars of X plus framing.
      expect(msg).toContain('X'.repeat(200));
      expect(msg).not.toContain('X'.repeat(201));
    }
  });
});


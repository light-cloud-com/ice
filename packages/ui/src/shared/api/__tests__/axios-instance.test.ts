/**
 * Tests for `axios-instance.ts` — the shared axios client used by every
 * HTTP-API adapter module.
 *
 * Behaviour covered:
 *   - The instance is created via `axios.create` with a `/api` (or
 *     `VITE_API_URL`) base URL, JSON content-type, and `withCredentials`.
 *   - The request interceptor logs the call, stamps `_startTime`, and
 *     forwards the config; its error path rejects.
 *   - The response interceptor logs the response and forwards the
 *     response object on the success branch.
 *   - The response interceptor's error branch enriches `error.message`
 *     with `METHOD path -> status: server-message` and stashes the
 *     server message on `error.response.extractedMessage` for the UI.
 *     We exercise the four "what does the server message look like"
 *     branches: object-with-`error`, object-with-`message`,
 *     object-with-neither (JSON.stringify fallback), raw-string body,
 *     and missing body.
 *   - The catch arm in the message-rewrite block — when `error.message`
 *     is read-only — leaves the error untouched but still rejects.
 *   - The compatibility token getters/setters resolve to null / no-op.
 *
 * `axios.create` is mocked at the module boundary so we can reach in to
 * the registered interceptor handlers and call them directly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── axios mock — capture interceptor handlers as the module installs them ─

interface Interceptor<S, E> {
  success: S | null;
  error: E | null;
}

const reqInterceptor: Interceptor<(c: any) => any, (e: any) => any> = { success: null, error: null };
const resInterceptor: Interceptor<(r: any) => any, (e: any) => any> = { success: null, error: null };

const mockInstance = {
  interceptors: {
    request: {
      use: vi.fn((s: any, e: any) => {
        reqInterceptor.success = s;
        reqInterceptor.error = e;
      }),
    },
    response: {
      use: vi.fn((s: any, e: any) => {
        resInterceptor.success = s;
        resInterceptor.error = e;
      }),
    },
  },
};

const createSpy = vi.fn((..._args: unknown[]) => mockInstance);

vi.mock('axios', () => ({
  default: { create: (...a: unknown[]) => createSpy(...(a as [])) },
}));

// ─── action-logger mock — assert our interceptors fire it ──────────────────

const logApiCall = vi.fn();
const logApiResponse = vi.fn();

vi.mock('../../utils/action-logger', () => ({
  logApiCall: (...a: unknown[]) => logApiCall(...(a as [])),
  logApiResponse: (...a: unknown[]) => logApiResponse(...(a as [])),
}));

// ─── helpers ────────────────────────────────────────────────────────────────

async function importFresh() {
  vi.resetModules();
  reqInterceptor.success = null;
  reqInterceptor.error = null;
  resInterceptor.success = null;
  resInterceptor.error = null;
  mockInstance.interceptors.request.use.mockClear();
  mockInstance.interceptors.response.use.mockClear();
  createSpy.mockClear();
  logApiCall.mockClear();
  logApiResponse.mockClear();
  return await import('../axios-instance');
}

describe('axios-instance — module-load configuration', () => {
  it('creates an axios instance with the expected base URL, headers, and credentials', async () => {
    await importFresh();
    expect(createSpy).toHaveBeenCalledTimes(1);
    const opts = createSpy.mock.calls[0]![0] as any;
    // Resolve to either VITE_API_URL (set in CI env) or the `/api` fallback.
    // The branch we care about is "uses VITE_API_URL when present, else /api"
    // — both shapes are valid; lock the contract that the call wires through
    // an absolute or rooted path that ends with `/api`.
    expect(opts.baseURL).toMatch(/\/api$/);
    expect(opts.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(opts.withCredentials).toBe(true);
  });

  it('exposes the instance as the default export AND BASE_URL as a named export', async () => {
    const mod = await importFresh();
    expect(mod.default).toBe(mockInstance);
    expect(mod.BASE_URL).toMatch(/\/api$/);
  });

  it('uses VITE_API_URL when present (truthy `||` left arm)', async () => {
    vi.stubEnv('VITE_API_URL', 'http://example.test/api');
    const mod = await importFresh();
    expect(mod.BASE_URL).toBe('http://example.test/api');
    vi.unstubAllEnvs();
  });

  it('falls back to "/api" when VITE_API_URL is empty (`||` right arm)', async () => {
    vi.stubEnv('VITE_API_URL', '');
    const mod = await importFresh();
    expect(mod.BASE_URL).toBe('/api');
    vi.unstubAllEnvs();
  });

  it('registers exactly one request and one response interceptor', async () => {
    await importFresh();
    expect(mockInstance.interceptors.request.use).toHaveBeenCalledTimes(1);
    expect(mockInstance.interceptors.response.use).toHaveBeenCalledTimes(1);
    expect(reqInterceptor.success).toBeTypeOf('function');
    expect(reqInterceptor.error).toBeTypeOf('function');
    expect(resInterceptor.success).toBeTypeOf('function');
    expect(resInterceptor.error).toBeTypeOf('function');
  });
});

describe('axios-instance — request interceptor', () => {
  it('logs the call, stamps _startTime, and returns the (mutated) config', async () => {
    await importFresh();
    const config = { method: 'POST', url: '/foo', data: { a: 1 } };
    const result = reqInterceptor.success!(config);
    expect(logApiCall).toHaveBeenCalledWith('POST', '/foo', { a: 1 });
    expect((result as any)._startTime).toBeTypeOf('number');
    expect(result).toBe(config);
  });

  it('falls back to "GET" / "" when method/url are missing', async () => {
    await importFresh();
    const config = {};
    reqInterceptor.success!(config);
    expect(logApiCall).toHaveBeenCalledWith('GET', '', undefined);
  });

  it('rejects with the original error in the error path', async () => {
    await importFresh();
    const err = new Error('bad request setup');
    await expect(reqInterceptor.error!(err)).rejects.toBe(err);
  });
});

describe('axios-instance — response interceptor success branch', () => {
  it('logs the response with computed duration and returns it untouched', async () => {
    await importFresh();
    const start = Date.now() - 50;
    const response = {
      status: 200,
      data: { ok: true },
      config: { method: 'GET', url: '/x', _startTime: start },
    };
    const out = resInterceptor.success!(response);
    expect(out).toBe(response);
    expect(logApiResponse).toHaveBeenCalledTimes(1);
    const [method, path, status, data, duration] = logApiResponse.mock.calls[0] as any[];
    expect(method).toBe('GET');
    expect(path).toBe('/x');
    expect(status).toBe(200);
    expect(data).toEqual({ ok: true });
    expect(duration).toBeGreaterThanOrEqual(0);
  });

  it('falls back to "GET" / "" / now() when method/url/_startTime are missing', async () => {
    await importFresh();
    const response = { status: 204, data: {}, config: {} };
    resInterceptor.success!(response);
    const [method, path, , , duration] = logApiResponse.mock.calls[0] as any[];
    expect(method).toBe('GET');
    expect(path).toBe('');
    expect(duration).toBe(0);
  });
});

describe('axios-instance — response interceptor error branch', () => {
  // Suppress the deliberate console.error noise from the error interceptor.
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  function makeErr(over: any = {}): any {
    return {
      message: 'orig',
      config: { method: 'post', url: '/p', data: 'reqbody' },
      response: { status: 500, data: { error: 'boom' } },
      ...over,
    };
  }

  it('builds the prefix "METHOD path -> status: server-message" when response.data has `error`', async () => {
    await importFresh();
    const err = makeErr();
    await expect(resInterceptor.error!(err)).rejects.toBe(err);
    expect(err.message).toBe('POST /p → 500: boom');
    expect(err.response.extractedMessage).toBe('boom');
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('uses response.data.message when `error` is absent', async () => {
    await importFresh();
    const err = makeErr({ response: { status: 400, data: { message: 'bad input' } } });
    await expect(resInterceptor.error!(err)).rejects.toBe(err);
    expect(err.message).toBe('POST /p → 400: bad input');
    expect(err.response.extractedMessage).toBe('bad input');
  });

  it('falls back to JSON.stringify(data).slice(0, 400) when neither `error` nor `message` is present', async () => {
    await importFresh();
    const err = makeErr({ response: { status: 422, data: { foo: 'bar', n: 1 } } });
    await expect(resInterceptor.error!(err)).rejects.toBe(err);
    expect(err.message).toBe('POST /p → 422: {"foo":"bar","n":1}');
    expect(err.response.extractedMessage).toBe('{"foo":"bar","n":1}');
  });

  it('uses the response body verbatim (truncated to 400 chars) when data is a non-empty string', async () => {
    await importFresh();
    const longBody = 'x'.repeat(500);
    const err = makeErr({ response: { status: 502, data: longBody } });
    await expect(resInterceptor.error!(err)).rejects.toBe(err);
    expect(err.message).toBe(`POST /p → 502: ${longBody.slice(0, 400)}`);
    expect(err.response.extractedMessage).toBe(longBody.slice(0, 400));
  });

  it('emits the bare prefix without server-message when data is an empty string', async () => {
    await importFresh();
    const err = makeErr({ response: { status: 404, data: '' } });
    await expect(resInterceptor.error!(err)).rejects.toBe(err);
    expect(err.message).toBe('POST /p → 404');
    expect(err.response.extractedMessage).toBe('POST /p → 404');
  });

  it('uses just "METHOD path" when response is missing entirely (network error)', async () => {
    await importFresh();
    const err = { message: 'orig', config: { method: 'get', url: '/q' } } as any;
    await expect(resInterceptor.error!(err)).rejects.toBe(err);
    expect(err.message).toBe('GET /q');
  });

  it('falls back to "REQUEST" method / "" path when config is missing', async () => {
    await importFresh();
    const err = { message: 'orig' } as any;
    await expect(resInterceptor.error!(err)).rejects.toBe(err);
    expect(err.message).toBe('REQUEST ');
  });

  it('does not throw when error.message is read-only (frozen error object)', async () => {
    await importFresh();
    const err: any = Object.freeze({
      message: 'orig',
      config: { method: 'GET', url: '/x' },
      response: undefined,
    });
    // Ensure assignment to `err.message` would normally throw in strict mode
    await expect(resInterceptor.error!(err)).rejects.toBe(err);
    // The message stays as-is (frozen) — but the catch arm absorbed the error.
    expect(err.message).toBe('orig');
  });

  it('logs the full error context to the console', async () => {
    await importFresh();
    const err = makeErr();
    await expect(resInterceptor.error!(err)).rejects.toBe(err);
    expect(consoleErrorSpy).toHaveBeenCalled();
    const [, ctx] = consoleErrorSpy.mock.calls[0] as any[];
    expect(ctx).toMatchObject({
      status: 500,
      path: '/p',
      method: 'POST',
      data: { error: 'boom' },
      requestBody: 'reqbody',
    });
  });
});

describe('axios-instance — backwards-compat token shims', () => {
  it('setAccessToken() / getAccessToken() are no-op / null', async () => {
    const mod = await importFresh();
    expect(mod.setAccessToken('x')).toBeUndefined();
    expect(mod.setAccessToken(null)).toBeUndefined();
    expect(mod.getAccessToken()).toBeNull();
  });
});

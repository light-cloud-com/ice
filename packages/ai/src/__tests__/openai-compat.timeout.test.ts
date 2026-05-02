/**
 * OpenAICompatProvider — request timeouts.
 *
 * The provider configures a 3s timeout on health GET and 5min on POST
 * stream. Real network can't trigger those reliably without slow tests,
 * so we mock `node:http` and emit the `timeout` event ourselves to drive
 * the timeout-handler branches.
 *
 * Lives in a dedicated file because `vi.mock` is hoisted file-wide.
 */

import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

interface FakeRequest extends EventEmitter {
  destroy: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
}

function makeRequest(): FakeRequest {
  const req = new EventEmitter() as FakeRequest;
  req.destroy = vi.fn();
  req.write = vi.fn();
  req.end = vi.fn();
  return req;
}

const httpGet = vi.fn();
const httpRequest = vi.fn();

vi.mock('node:http', () => ({
  default: {
    get: (...args: unknown[]) => httpGet(...args),
    request: (...args: unknown[]) => httpRequest(...args),
  },
  get: (...args: unknown[]) => httpGet(...args),
  request: (...args: unknown[]) => httpRequest(...args),
}));

describe('OpenAICompatProvider — timeout handling', () => {
  it('rejects health GET with a Timeout error and destroys the socket', async () => {
    const req = makeRequest();
    httpGet.mockImplementation(() => req);

    const { OpenAICompatProvider } = await import('../providers/openai-compat');
    const p = new OpenAICompatProvider({ baseUrl: 'http://slow.example' });

    // Kick off the health check, then synchronously fire 'timeout'.
    const promise = p.healthCheck();
    // /health probe: emit timeout on the first request.
    req.emit('timeout');
    // Internal try/catch swallows /health failure, so a SECOND attempt is
    // made against /v1/models. We need to fail that one too.
    await new Promise<void>((r) => setImmediate(r));

    // The second attempt creates a fresh request — replay the same timeout.
    if (httpGet.mock.calls.length > 1) {
      const secondReq = httpGet.mock.results[1].value as FakeRequest;
      secondReq.emit('timeout');
    }

    const result = await promise;
    expect(result.ok).toBe(false);
    expect(req.destroy).toHaveBeenCalled();
  });

  it('rejects streamChat with a Timeout error and destroys the request', async () => {
    const req = makeRequest();
    httpRequest.mockImplementation(() => req);

    const { OpenAICompatProvider } = await import('../providers/openai-compat');
    const p = new OpenAICompatProvider({ baseUrl: 'http://slow.example' });

    const iterator = p.streamChat({ systemPrompt: '', messages: [], maxTokens: 1 });
    const drained = (async () => {
      const errs: unknown[] = [];
      try {
        for await (const _ of iterator) {
          void _;
        }
      } catch (e) {
        errs.push(e);
      }
      return errs;
    })();

    // Allow the request to be issued, then emit timeout.
    await new Promise<void>((r) => setImmediate(r));
    req.emit('timeout');

    const errs = await drained;
    expect(errs).toHaveLength(1);
    expect((errs[0] as Error).message).toMatch(/timeout/i);
    expect(req.destroy).toHaveBeenCalled();
  });

  it('rejects streamChat with the upstream error event', async () => {
    const req = makeRequest();
    httpRequest.mockImplementation(() => req);

    const { OpenAICompatProvider } = await import('../providers/openai-compat');
    const p = new OpenAICompatProvider({ baseUrl: 'http://example' });

    const iterator = p.streamChat({ systemPrompt: '', messages: [], maxTokens: 1 });
    const drained = (async () => {
      try {
        for await (const _ of iterator) {
          void _;
        }
        return null;
      } catch (e) {
        return e as Error;
      }
    })();

    await new Promise<void>((r) => setImmediate(r));
    req.emit('error', new Error('ECONNRESET'));

    const err = await drained;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('ECONNRESET');
  });
});

/**
 * OpenAICompatProvider — https transport selection.
 *
 * The provider chooses between `node:http` and `node:https` based on the
 * baseUrl protocol. We can't trivially stand up a TLS server in unit
 * tests, so we mock `node:https` module-wide and assert the selection.
 *
 * Lives in a dedicated file because `vi.mock` is hoisted file-wide and we
 * don't want to break the http-server-based tests in openai-compat.test.ts.
 */

import { describe, expect, it, vi } from 'vitest';

const httpsRequest = vi.fn();
const httpsGet = vi.fn();

vi.mock('node:https', () => ({
  default: {
    request: (...args: unknown[]) => httpsRequest(...args),
    get: (...args: unknown[]) => httpsGet(...args),
  },
  request: (...args: unknown[]) => httpsRequest(...args),
  get: (...args: unknown[]) => httpsGet(...args),
}));

describe('OpenAICompatProvider — https transport selection', () => {
  it('routes streamChat through node:https when baseUrl is https://', async () => {
    httpsRequest.mockImplementation(() => ({
      on: vi.fn().mockReturnThis(),
      write: vi.fn(),
      end: vi.fn(),
      destroy: vi.fn(),
    }));
    const { OpenAICompatProvider } = await import('../providers/openai-compat');
    const p = new OpenAICompatProvider({ baseUrl: 'https://secure.example' });
    // Fire and forget — the mocked request never invokes a response handler.
    const stream = p.streamChat({ systemPrompt: '', messages: [], maxTokens: 1 });
    stream[Symbol.asyncIterator]()
      .next()
      .catch(() => {});

    // Allow the microtask that triggers the request to flush.
    await new Promise<void>((r) => setImmediate(r));
    expect(httpsRequest).toHaveBeenCalledTimes(1);
  });

  it('routes healthCheck through node:https when baseUrl is https://', async () => {
    httpsGet.mockImplementation(() => ({
      on: vi.fn().mockReturnThis(),
      destroy: vi.fn(),
    }));
    const { OpenAICompatProvider } = await import('../providers/openai-compat');
    const p = new OpenAICompatProvider({ baseUrl: 'https://secure.example' });
    p.healthCheck().catch(() => {});

    await new Promise<void>((r) => setImmediate(r));
    expect(httpsGet).toHaveBeenCalled();
  });
});

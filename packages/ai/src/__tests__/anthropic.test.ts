/**
 * AnthropicProvider tests.
 *
 * The provider wraps the @anthropic-ai/sdk client. We mock the SDK to
 * pin both shape and side-effects without making real API calls.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const messagesCreate = vi.fn();
const messagesStream = vi.fn();

class MockAnthropic {
  messages = {
    create: (...args: unknown[]) => messagesCreate(...args),
    stream: (...args: unknown[]) => messagesStream(...args),
  };
  constructor(public options: unknown) {}
}

vi.mock('@anthropic-ai/sdk', () => ({
  default: MockAnthropic,
}));

describe('AnthropicProvider', () => {
  let originalKey: string | undefined;
  let originalModel: string | undefined;

  beforeEach(() => {
    originalKey = process.env.ANTHROPIC_API_KEY;
    originalModel = process.env.ICE_AI_MODEL;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ICE_AI_MODEL;
    messagesCreate.mockReset();
    messagesStream.mockReset();
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.ICE_AI_MODEL;
    else process.env.ICE_AI_MODEL = originalModel;
  });

  it('throws when constructed without an API key in options or env', async () => {
    const { AnthropicProvider } = await import('../providers/anthropic');
    expect(() => new AnthropicProvider()).toThrow(/anthropic api key/i);
  });

  it('reads ANTHROPIC_API_KEY from the environment when no option is supplied', async () => {
    process.env.ANTHROPIC_API_KEY = 'env-key';
    const { AnthropicProvider } = await import('../providers/anthropic');
    expect(() => new AnthropicProvider()).not.toThrow();
  });

  it('reports its identity', async () => {
    const { AnthropicProvider } = await import('../providers/anthropic');
    const p = new AnthropicProvider({ apiKey: 'k' });
    expect(p.name).toBe('anthropic');
    expect(p.isLocal).toBe(false);
  });

  it('uses the default model when no model option or env is set', async () => {
    const { AnthropicProvider } = await import('../providers/anthropic');
    const p = new AnthropicProvider({ apiKey: 'k' });
    expect(p.model).toBe('claude-sonnet-4-20250514');
  });

  it('reads ICE_AI_MODEL from the environment when no option is supplied', async () => {
    process.env.ICE_AI_MODEL = 'env-model';
    const { AnthropicProvider } = await import('../providers/anthropic');
    const p = new AnthropicProvider({ apiKey: 'k' });
    expect(p.model).toBe('env-model');
  });

  it('prefers an explicit model option over environment defaults', async () => {
    process.env.ICE_AI_MODEL = 'env-model';
    const { AnthropicProvider } = await import('../providers/anthropic');
    const p = new AnthropicProvider({ apiKey: 'k', model: 'explicit' });
    expect(p.model).toBe('explicit');
  });

  it('healthCheck returns ok when an API key is present', async () => {
    const { AnthropicProvider } = await import('../providers/anthropic');
    const p = new AnthropicProvider({ apiKey: 'k', model: 'm' });
    const result = await p.healthCheck();
    expect(result).toEqual({ ok: true, provider: 'anthropic', model: 'm', isLocal: false });
  });

  it('chat() forwards messages and returns the first text content block', async () => {
    messagesCreate.mockResolvedValueOnce({
      content: [
        { type: 'text', text: 'hello world' },
        { type: 'tool_use', id: 'x' },
      ],
    });
    const { AnthropicProvider } = await import('../providers/anthropic');
    const p = new AnthropicProvider({ apiKey: 'k', model: 'claude-test' });
    const result = await p.chat({
      systemPrompt: 'be brief',
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 32,
    });
    expect(result).toEqual({ content: 'hello world', finishReason: 'stop' });
    expect(messagesCreate).toHaveBeenCalledWith({
      model: 'claude-test',
      max_tokens: 32,
      system: 'be brief',
      messages: [{ role: 'user', content: 'hi' }],
    });
  });

  it('chat() returns an empty string when no text content block is present', async () => {
    messagesCreate.mockResolvedValueOnce({
      content: [{ type: 'tool_use', id: 'x' }],
    });
    const { AnthropicProvider } = await import('../providers/anthropic');
    const p = new AnthropicProvider({ apiKey: 'k' });
    const result = await p.chat({ systemPrompt: '', messages: [], maxTokens: 1 });
    expect(result.content).toBe('');
    expect(result.finishReason).toBe('stop');
  });

  it('streamChat yields text deltas and a terminal stop chunk', async () => {
    async function* fakeStream() {
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'foo' } };
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: ' bar' } };
      // Non-text delta is filtered out.
      yield { type: 'content_block_delta', delta: { type: 'input_json_delta' } };
      // Non-delta event is filtered out.
      yield { type: 'message_stop' };
    }
    messagesStream.mockReturnValueOnce(fakeStream());
    const { AnthropicProvider } = await import('../providers/anthropic');
    const p = new AnthropicProvider({ apiKey: 'k' });
    const chunks = [];
    for await (const c of p.streamChat({
      systemPrompt: 's',
      messages: [{ role: 'user', content: 'q' }],
      maxTokens: 16,
    })) {
      chunks.push(c);
    }
    expect(chunks).toEqual([
      { content: 'foo', finishReason: null },
      { content: ' bar', finishReason: null },
      { content: '', finishReason: 'stop' },
    ]);
    expect(messagesStream).toHaveBeenCalledWith({
      model: expect.any(String),
      max_tokens: 16,
      system: 's',
      messages: [{ role: 'user', content: 'q' }],
    });
  });
});

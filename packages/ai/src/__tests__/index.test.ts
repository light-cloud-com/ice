/**
 * Barrel export and local-server stub tests.
 *
 * `startLocalAiServer` / `stopLocalAiServer` are no-op stubs preserved so
 * the desktop wiring keeps a stable surface even when an external server
 * runs the actual model. The branches still need coverage.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as ai from '..';

describe('@ice/ai barrel exports', () => {
  it('re-exports the provider factory functions', () => {
    expect(typeof ai.createProvider).toBe('function');
    expect(typeof ai.createProviderAsync).toBe('function');
    expect(typeof ai.resetProvider).toBe('function');
    expect(typeof ai.getProvider).toBe('function');
  });

  it('re-exports the concrete provider classes', () => {
    expect(typeof ai.AnthropicProvider).toBe('function');
    expect(typeof ai.OpenAICompatProvider).toBe('function');
    expect(typeof ai.NullProvider).toBe('function');
  });

  it('re-exports the SSE stream parsers', () => {
    expect(typeof ai.parseOpenAIStream).toBe('function');
    expect(typeof ai.parseNodeStream).toBe('function');
  });
});

describe('startLocalAiServer / stopLocalAiServer', () => {
  let originalProvider: string | undefined;
  let originalUrl: string | undefined;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalProvider = process.env.ICE_AI_PROVIDER;
    originalUrl = process.env.ICE_AI_URL;
    delete process.env.ICE_AI_PROVIDER;
    delete process.env.ICE_AI_URL;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalProvider === undefined) delete process.env.ICE_AI_PROVIDER;
    else process.env.ICE_AI_PROVIDER = originalProvider;
    if (originalUrl === undefined) delete process.env.ICE_AI_URL;
    else process.env.ICE_AI_URL = originalUrl;
    logSpy.mockRestore();
  });

  it('returns null with no provider configured (anthropic default path)', async () => {
    expect(await ai.startLocalAiServer()).toBeNull();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('returns null when ICE_AI_PROVIDER=anthropic', async () => {
    process.env.ICE_AI_PROVIDER = 'anthropic';
    expect(await ai.startLocalAiServer()).toBeNull();
  });

  it('returns the configured ICE_AI_URL when openai-compat is selected', async () => {
    process.env.ICE_AI_PROVIDER = 'openai-compat';
    process.env.ICE_AI_URL = 'http://example.com:9999';
    expect(await ai.startLocalAiServer()).toBe('http://example.com:9999');
    expect(logSpy).toHaveBeenCalledWith('[ICE AI] Using external AI server at', 'http://example.com:9999');
  });

  it('falls back to null url but still logs default fallback for openai-compat without ICE_AI_URL', async () => {
    process.env.ICE_AI_PROVIDER = 'openai-compat';
    expect(await ai.startLocalAiServer()).toBeNull();
    expect(logSpy).toHaveBeenCalledWith('[ICE AI] Using external AI server at', 'http://localhost:8000');
  });

  it('stopLocalAiServer is a resolved no-op', async () => {
    await expect(ai.stopLocalAiServer()).resolves.toBeUndefined();
  });
});

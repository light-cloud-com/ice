/**
 * Provider factory tests.
 *
 * `createProvider` (sync) and `createProviderAsync` resolve a config +
 * environment into one of {AnthropicProvider, OpenAICompatProvider,
 * NullProvider}. Tests pin the env between cases and reset the factory
 * cache to keep cases isolated.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProvider, createProviderAsync, getProvider, resetProvider } from '../create-provider';
import { AnthropicProvider } from '../providers/anthropic';
import { OpenAICompatProvider } from '../providers/openai-compat';
import { NullProvider } from '../types';

interface SavedEnv {
  ICE_AI_PROVIDER?: string;
  ICE_AI_URL?: string;
  ANTHROPIC_API_KEY?: string;
  ICE_AI_MODEL?: string;
}

function snapshotEnv(): SavedEnv {
  return {
    ICE_AI_PROVIDER: process.env.ICE_AI_PROVIDER,
    ICE_AI_URL: process.env.ICE_AI_URL,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ICE_AI_MODEL: process.env.ICE_AI_MODEL,
  };
}

function restoreEnv(saved: SavedEnv): void {
  for (const k of Object.keys(saved) as (keyof SavedEnv)[]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k]!;
  }
}

function clearEnv(): void {
  delete process.env.ICE_AI_PROVIDER;
  delete process.env.ICE_AI_URL;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ICE_AI_MODEL;
}

describe('createProvider (sync)', () => {
  let saved: SavedEnv;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    saved = snapshotEnv();
    clearEnv();
    resetProvider();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    resetProvider();
    restoreEnv(saved);
    warnSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('returns NullProvider when no env vars and no config are set', () => {
    const p = createProvider();
    expect(p).toBeInstanceOf(NullProvider);
  });

  it('reuses the cached provider on subsequent no-arg calls', () => {
    const first = createProvider();
    const second = createProvider();
    expect(second).toBe(first);
  });

  it('rebuilds and caches the provider when called with explicit config', () => {
    const first = createProvider();
    const second = createProvider({ provider: 'openai-compat', baseUrl: 'http://x:1' });
    expect(second).not.toBe(first);
    expect(second).toBeInstanceOf(OpenAICompatProvider);
    expect(getProvider()).toBe(second);
  });

  it('returns AnthropicProvider when provider=anthropic and API key is set in config', () => {
    const p = createProvider({ provider: 'anthropic', anthropicApiKey: 'sk-test' });
    expect(p).toBeInstanceOf(AnthropicProvider);
  });

  it('falls back to ANTHROPIC_API_KEY env var when config is missing the key', () => {
    process.env.ANTHROPIC_API_KEY = 'env-key';
    const p = createProvider({ provider: 'anthropic' });
    expect(p).toBeInstanceOf(AnthropicProvider);
  });

  it('returns NullProvider and warns when provider=anthropic but no API key is available', () => {
    const p = createProvider({ provider: 'anthropic' });
    expect(p).toBeInstanceOf(NullProvider);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('ANTHROPIC_API_KEY not set'));
  });

  it('threads anthropicModel through to the AnthropicProvider', () => {
    const p = createProvider({
      provider: 'anthropic',
      anthropicApiKey: 'sk',
      anthropicModel: 'claude-test',
    });
    expect(p.model).toBe('claude-test');
  });

  it('returns OpenAICompatProvider for provider=openai-compat', () => {
    const p = createProvider({
      provider: 'openai-compat',
      baseUrl: 'http://local:1',
      model: 'm',
      apiKey: 'k',
    });
    expect(p).toBeInstanceOf(OpenAICompatProvider);
    expect(p.model).toBe('m');
  });

  it('auto-selects AnthropicProvider when ANTHROPIC_API_KEY is set', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-auto';
    const p = createProvider({ provider: 'auto' });
    expect(p).toBeInstanceOf(AnthropicProvider);
  });

  it('auto-selects OpenAICompatProvider when only ICE_AI_URL is set', () => {
    process.env.ICE_AI_URL = 'http://auto:1';
    const p = createProvider({ provider: 'auto' });
    expect(p).toBeInstanceOf(OpenAICompatProvider);
  });

  it('auto-selects NullProvider when neither key nor URL is available', () => {
    const p = createProvider({ provider: 'auto' });
    expect(p).toBeInstanceOf(NullProvider);
  });

  it('reads ICE_AI_PROVIDER from the environment when config has no provider', () => {
    process.env.ICE_AI_PROVIDER = 'anthropic';
    process.env.ANTHROPIC_API_KEY = 'sk-env';
    const p = createProvider({});
    expect(p).toBeInstanceOf(AnthropicProvider);
  });

  it('treats unknown provider strings as the auto branch (default fall-through)', () => {
    // The switch default-cases through the auto branch.
    const p = createProvider({ provider: 'mystery' as never });
    expect(p).toBeInstanceOf(NullProvider);
  });
});

describe('resetProvider / getProvider', () => {
  let saved: SavedEnv;

  beforeEach(() => {
    saved = snapshotEnv();
    clearEnv();
    resetProvider();
  });

  afterEach(() => {
    resetProvider();
    restoreEnv(saved);
  });

  it('returns null before any provider is created', () => {
    expect(getProvider()).toBeNull();
  });

  it('clears the cache so the next createProvider rebuilds', () => {
    const first = createProvider();
    resetProvider();
    expect(getProvider()).toBeNull();
    const second = createProvider();
    expect(second).not.toBe(first);
  });
});

describe('createProviderAsync', () => {
  let saved: SavedEnv;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    saved = snapshotEnv();
    clearEnv();
    resetProvider();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    resetProvider();
    restoreEnv(saved);
    warnSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('honours an explicit non-auto provider without probing', async () => {
    const p = await createProviderAsync({
      provider: 'anthropic',
      anthropicApiKey: 'sk-explicit',
    });
    expect(p).toBeInstanceOf(AnthropicProvider);
  });

  it('reads ICE_AI_PROVIDER as the explicit provider', async () => {
    process.env.ICE_AI_PROVIDER = 'openai-compat';
    process.env.ICE_AI_URL = 'http://explicit:1';
    const p = await createProviderAsync();
    expect(p).toBeInstanceOf(OpenAICompatProvider);
  });

  it('treats provider=auto as ambient detection (no probe shortcut)', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-auto';
    const p = await createProviderAsync({ provider: 'auto' });
    expect(p).toBeInstanceOf(AnthropicProvider);
    expect(logSpy).toHaveBeenCalledWith('[AI] Using Anthropic Claude');
  });

  it('prefers Anthropic when both ANTHROPIC_API_KEY and ICE_AI_URL are set', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-pref';
    process.env.ICE_AI_URL = 'http://shouldnt-probe:1';
    const probeSpy = vi.spyOn(OpenAICompatProvider.prototype, 'healthCheck');
    const p = await createProviderAsync();
    expect(p).toBeInstanceOf(AnthropicProvider);
    expect(probeSpy).not.toHaveBeenCalled();
    probeSpy.mockRestore();
  });

  it('probes openai-compat health when only ICE_AI_URL is configured', async () => {
    const healthSpy = vi
      .spyOn(OpenAICompatProvider.prototype, 'healthCheck')
      .mockResolvedValue({ ok: true, provider: 'openai-compat', model: 'discovered' });
    process.env.ICE_AI_URL = 'http://auto-probe:1';
    const p = await createProviderAsync();
    expect(p).toBeInstanceOf(OpenAICompatProvider);
    expect(healthSpy).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Auto-detected OpenAI-compatible server'));
    healthSpy.mockRestore();
  });

  it('falls through to NullProvider when the openai-compat health probe fails', async () => {
    const healthSpy = vi
      .spyOn(OpenAICompatProvider.prototype, 'healthCheck')
      .mockResolvedValue({ ok: false, provider: 'openai-compat', error: 'down' });
    process.env.ICE_AI_URL = 'http://auto-probe-bad:1';
    const p = await createProviderAsync();
    expect(p).toBeInstanceOf(NullProvider);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('No AI provider available'));
    healthSpy.mockRestore();
  });

  it('returns NullProvider when neither key nor URL is configured', async () => {
    const p = await createProviderAsync();
    expect(p).toBeInstanceOf(NullProvider);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('caches the resolved provider on the module', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk';
    const first = await createProviderAsync();
    expect(getProvider()).toBe(first);
  });
});

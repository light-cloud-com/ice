/**
 * Provider Factory
 *
 * Creates the appropriate AI provider based on configuration and environment.
 *
 * Resolution order:
 *   1. Explicit config.provider
 *   2. ICE_AI_PROVIDER env var
 *   3. Auto-detect: anthropic (API key) → openai-compat (ICE_AI_URL) → null
 */

import { AnthropicProvider } from './providers/anthropic';
import { OpenAICompatProvider } from './providers/openai-compat';
import { NullProvider } from './types';
import type { AiProvider, ProviderConfig } from './types';

let _cachedProvider: AiProvider | null = null;

/**
 * Create an AI provider. Caches the result for subsequent calls.
 * Pass `config` to override auto-detection (resets the cache).
 */
export function createProvider(config?: Partial<ProviderConfig>): AiProvider {
  if (config) {
    _cachedProvider = buildProvider(config);
    return _cachedProvider;
  }

  if (_cachedProvider) return _cachedProvider;

  _cachedProvider = buildProvider({});
  return _cachedProvider;
}

/**
 * Create a provider with async auto-detection.
 * Probes OpenAI-compat health before falling back.
 */
export async function createProviderAsync(config?: Partial<ProviderConfig>): Promise<AiProvider> {
  const envProvider = config?.provider || process.env.ICE_AI_PROVIDER;

  // Explicit provider — no detection needed
  if (envProvider && envProvider !== 'auto') {
    const provider = buildProvider({ ...config, provider: envProvider as ProviderConfig['provider'] });
    _cachedProvider = provider;
    return provider;
  }

  // Auto-detect: try Anthropic first (preferred)
  const anthropicKey = config?.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    console.log('[AI] Using Anthropic Claude');
    const anthropic = new AnthropicProvider({
      apiKey: anthropicKey,
      model: config?.anthropicModel,
    });
    _cachedProvider = anthropic;
    return anthropic;
  }

  // Try OpenAI-compatible endpoint if URL is configured
  const aiUrl = config?.baseUrl || process.env.ICE_AI_URL;
  if (aiUrl) {
    const compat = new OpenAICompatProvider({
      baseUrl: aiUrl,
      model: config?.model,
      apiKey: config?.apiKey,
    });
    const health = await compat.healthCheck();
    if (health.ok) {
      console.log(`[AI] Auto-detected OpenAI-compatible server at ${aiUrl} (model: ${health.model})`);
      _cachedProvider = compat;
      return compat;
    }
  }

  // No provider available
  console.warn('[AI] No AI provider available. Set ANTHROPIC_API_KEY or ICE_AI_URL.');
  const nullProvider = new NullProvider();
  _cachedProvider = nullProvider;
  return nullProvider;
}

/** Reset cached provider (useful for testing or config changes) */
export function resetProvider(): void {
  _cachedProvider = null;
}

/** Get the current cached provider without creating one */
export function getProvider(): AiProvider | null {
  return _cachedProvider;
}

// =============================================================================
// Internal
// =============================================================================

function buildProvider(config: Partial<ProviderConfig>): AiProvider {
  const providerType = config.provider || process.env.ICE_AI_PROVIDER || 'auto';

  switch (providerType) {
    case 'anthropic': {
      const apiKey = config.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        console.warn('[AI] Anthropic provider selected but ANTHROPIC_API_KEY not set');
        return new NullProvider();
      }
      return new AnthropicProvider({
        apiKey,
        model: config.anthropicModel,
      });
    }

    case 'openai-compat':
      return new OpenAICompatProvider({
        baseUrl: config.baseUrl,
        model: config.model,
        apiKey: config.apiKey,
      });

    case 'auto':
    default: {
      // Synchronous auto-detect: check env vars only (no network calls)
      const anthropicKey = config.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
      if (anthropicKey) {
        return new AnthropicProvider({ apiKey: anthropicKey, model: config.anthropicModel });
      }
      // Fall back to OpenAI-compat if URL is set
      const aiUrl = config.baseUrl || process.env.ICE_AI_URL;
      if (aiUrl) {
        return new OpenAICompatProvider({ baseUrl: aiUrl, model: config.model });
      }
      // No provider
      return new NullProvider();
    }
  }
}

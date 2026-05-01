/**
 * AI Provider — lazy auto-detected singleton.
 *
 * Tries Anthropic first, falls back to OpenAI-compat (ICE_AI_URL), then null.
 * The first call to `getAiProvider()` triggers detection; subsequent calls
 * return the same cached promise so `createProviderAsync` only runs once.
 */

import { createProviderAsync, getProvider, type AiProvider } from '@ice/ai';

let _providerReady: Promise<AiProvider> | null = null;

/**
 * Get the AI provider (auto-detects on first call).
 * Tries Anthropic first, falls back to OpenAI-compat (ICE_AI_URL), then null.
 */
export async function getAiProvider(): Promise<AiProvider> {
  if (!_providerReady) {
    _providerReady = createProviderAsync();
  }
  return _providerReady;
}

/** Get provider synchronously (null if not yet initialized) */
export function getAiProviderSync(): AiProvider | null {
  return getProvider();
}

/**
 * Reset the cached provider promise. Test-only — production code never
 * needs this because the cache is the whole point of the module.
 */
export function _resetProviderCacheForTests(): void {
  _providerReady = null;
}

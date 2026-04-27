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
import type { AiProvider, ProviderConfig } from './types';
/**
 * Create an AI provider. Caches the result for subsequent calls.
 * Pass `config` to override auto-detection (resets the cache).
 */
export declare function createProvider(config?: Partial<ProviderConfig>): AiProvider;
/**
 * Create a provider with async auto-detection.
 * Probes OpenAI-compat health before falling back.
 */
export declare function createProviderAsync(config?: Partial<ProviderConfig>): Promise<AiProvider>;
/** Reset cached provider (useful for testing or config changes) */
export declare function resetProvider(): void;
/** Get the current cached provider without creating one */
export declare function getProvider(): AiProvider | null;

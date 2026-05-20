/**
 * @ice/ai — AI Provider Abstraction Layer
 *
 * Unified interface for AI providers in ICE:
 *   - Anthropic (cloud, default) — Claude via API
 *   - OpenAI-compat (generic)    — any OpenAI-compatible server (Ollama, LM Studio, vLLM, etc.)
 *
 * Usage:
 *   import { createProviderAsync } from '@ice/ai';
 *   const provider = await createProviderAsync();
 *   const response = await provider.chat({ systemPrompt, messages, maxTokens });
 */

// Provider factory
export { createProvider, createProviderAsync, resetProvider, getProvider } from './create-provider';

// Provider implementations
export { AnthropicProvider } from './providers/anthropic';
export { OpenAICompatProvider } from './providers/openai-compat';

// Types
export type {
  AiProvider,
  ChatParams,
  ChatMessage,
  ChatChunk,
  ChatResponse,
  HealthCheckResult,
  ProviderConfig,
  ProviderType,
} from './types';
export { NullProvider } from './types';

// Stream utilities
export { parseOpenAIStream, parseNodeStream } from './stream-parser';

// Local AI server management (no-op stubs — local server is managed externally)
export async function startLocalAiServer(): Promise<string | null> {
  const provider = process.env.ICE_AI_PROVIDER;
  if (provider === 'anthropic' || !provider) {
    // Anthropic is the default — no local server needed
    return null;
  }
  // For openai-compat, the server is managed externally
  console.log('[ICE AI] Using external AI server at', process.env.ICE_AI_URL || 'http://localhost:8000');
  return process.env.ICE_AI_URL || null;
}

export async function stopLocalAiServer(): Promise<void> {
  // No-op — local servers are managed externally
}

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
export { createProvider, createProviderAsync, resetProvider, getProvider } from './create-provider';
export { AnthropicProvider } from './providers/anthropic';
export { OpenAICompatProvider } from './providers/openai-compat';
export type { AiProvider, ChatParams, ChatMessage, ChatChunk, ChatResponse, HealthCheckResult, ProviderConfig, ProviderType, } from './types';
export { NullProvider } from './types';
export { parseOpenAIStream, parseNodeStream } from './stream-parser';
export declare function startLocalAiServer(): Promise<string | null>;
export declare function stopLocalAiServer(): Promise<void>;

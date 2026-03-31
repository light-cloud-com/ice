/**
 * @ice/ai — Provider abstraction types
 *
 * Unified interface for AI providers: Anthropic (cloud, default)
 * and any OpenAI-compatible endpoint (Ollama, LM Studio, vLLM, etc.).
 */

// =============================================================================
// Provider Interface
// =============================================================================

export interface AiProvider {
  /** Provider identifier */
  readonly name: string;

  /** Whether this provider runs locally (no network calls to external APIs) */
  readonly isLocal: boolean;

  /** Model currently in use */
  readonly model: string;

  /** Check if the provider is available and ready */
  healthCheck(): Promise<HealthCheckResult>;

  /** Generate a chat completion (non-streaming) */
  chat(params: ChatParams): Promise<ChatResponse>;

  /** Generate a chat completion with streaming */
  streamChat(params: ChatParams): AsyncIterable<ChatChunk>;
}

// =============================================================================
// Chat Types
// =============================================================================

export interface ChatParams {
  systemPrompt: string;
  messages: ChatMessage[];
  maxTokens: number;
  /** Session ID for KV cache continuity across turns (supported by some local servers) */
  sessionId?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatChunk {
  /** Token text (may be empty on final chunk) */
  content: string;
  /** Set to 'stop' on the final chunk */
  finishReason?: 'stop' | null;
}

export interface ChatResponse {
  /** Full response text */
  content: string;
  finishReason: 'stop';
}

// =============================================================================
// Health Check
// =============================================================================

export interface HealthCheckResult {
  ok: boolean;
  provider: string;
  model?: string;
  isLocal?: boolean;
  error?: string;
}

// =============================================================================
// Provider Configuration
// =============================================================================

export type ProviderType = 'anthropic' | 'openai-compat' | 'auto';

export interface ProviderConfig {
  provider: ProviderType;

  // OpenAI-compat
  baseUrl?: string;
  model?: string;
  apiKey?: string;

  // Anthropic-specific
  anthropicApiKey?: string;
  anthropicModel?: string;
}

// =============================================================================
// Null Provider (AI disabled)
// =============================================================================

export class NullProvider implements AiProvider {
  readonly name = 'none';
  readonly isLocal = true;
  readonly model = 'none';

  async healthCheck(): Promise<HealthCheckResult> {
    return { ok: false, provider: 'none', error: 'No AI provider configured' };
  }

  async chat(): Promise<ChatResponse> {
    throw new Error('No AI provider configured. Set ANTHROPIC_API_KEY or ICE_AI_URL.');
  }

  async *streamChat(): AsyncIterable<ChatChunk> {
    throw new Error('No AI provider configured. Set ANTHROPIC_API_KEY or ICE_AI_URL.');
  }
}

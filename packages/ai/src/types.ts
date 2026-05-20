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

/**
 * Wire-level finish reasons reported by OpenAI-compatible providers.
 * findings.md #18 — the previous types pinned this to 'stop' and the
 * provider implementations unconditionally returned 'stop', hiding
 * length-cap truncations, content filtering, and tool-call boundaries.
 */
export type ChatFinishReason = 'stop' | 'length' | 'content_filter' | 'tool_calls' | 'function_call' | string;

export interface ChatChunk {
  /** Token text (may be empty on final chunk) */
  content: string;
  /** Set on the final chunk; null/undefined while tokens are still streaming. */
  finishReason?: ChatFinishReason | null;
}

export interface ChatResponse {
  /** Full response text */
  content: string;
  /** The wire-level finish reason; defaults to 'stop' when the wire didn't supply one. */
  finishReason: ChatFinishReason;
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

  // findings.md #54 — the previous body did `yield undefined as ChatChunk`
  // before throwing to satisfy eslint's require-yield. That made
  // `for await (const c of provider.streamChat())` deliver an
  // undefined chunk to consumers that didn't check `c.content`,
  // which silently corrupted partial outputs. The eslint rule is
  // suppressed for this single function so the generator can throw
  // on first iteration without an observable undefined first.
  // eslint-disable-next-line require-yield
  async *streamChat(): AsyncIterable<ChatChunk> {
    throw new Error('No AI provider configured. Set ANTHROPIC_API_KEY or ICE_AI_URL.');
  }
}

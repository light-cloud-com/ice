/**
 * @ice/ai — Provider abstraction types
 *
 * Unified interface for AI providers: Anthropic (cloud, default)
 * and any OpenAI-compatible endpoint (Ollama, LM Studio, vLLM, etc.).
 */
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
export interface HealthCheckResult {
    ok: boolean;
    provider: string;
    model?: string;
    isLocal?: boolean;
    error?: string;
}
export type ProviderType = 'anthropic' | 'openai-compat' | 'auto';
export interface ProviderConfig {
    provider: ProviderType;
    baseUrl?: string;
    model?: string;
    apiKey?: string;
    anthropicApiKey?: string;
    anthropicModel?: string;
}
export declare class NullProvider implements AiProvider {
    readonly name = "none";
    readonly isLocal = true;
    readonly model = "none";
    healthCheck(): Promise<HealthCheckResult>;
    chat(): Promise<ChatResponse>;
    streamChat(): AsyncIterable<ChatChunk>;
}

/**
 * Anthropic Provider
 *
 * Cloud AI via the Anthropic Claude API.
 * Uses @anthropic-ai/sdk for streaming and non-streaming chat.
 */
import type { AiProvider, ChatChunk, ChatParams, ChatResponse, HealthCheckResult } from '../types';
export declare class AnthropicProvider implements AiProvider {
    readonly name = "anthropic";
    readonly isLocal = false;
    readonly model: string;
    private client;
    constructor(options?: {
        apiKey?: string;
        model?: string;
    });
    healthCheck(): Promise<HealthCheckResult>;
    chat(params: ChatParams): Promise<ChatResponse>;
    streamChat(params: ChatParams): AsyncIterable<ChatChunk>;
}

/**
 * OpenAI-Compatible Provider
 *
 * Base provider for any server exposing the OpenAI chat completions API.
 * Works with: Ollama, LM Studio, vLLM, llama.cpp, text-generation-webui, etc.
 *
 * Endpoints used:
 *   POST /v1/chat/completions  — streaming and non-streaming chat
 *   GET  /health               — health check (optional, falls back to /v1/models)
 *   GET  /v1/models            — model list
 */
import type { AiProvider, ChatChunk, ChatParams, ChatResponse, HealthCheckResult } from '../types';
export declare class OpenAICompatProvider implements AiProvider {
    readonly name: string;
    readonly isLocal: boolean;
    readonly model: string;
    protected readonly baseUrl: string;
    protected readonly apiKey: string | undefined;
    constructor(options?: {
        baseUrl?: string;
        model?: string;
        apiKey?: string;
        name?: string;
        isLocal?: boolean;
    });
    healthCheck(): Promise<HealthCheckResult>;
    chat(params: ChatParams): Promise<ChatResponse>;
    streamChat(params: ChatParams): AsyncIterable<ChatChunk>;
    protected httpGet(path: string): Promise<{
        ok: boolean;
        status: number;
        body: string;
    }>;
    protected httpPostStream(path: string, body: Record<string, unknown>): Promise<NodeJS.ReadableStream>;
    private buildHeaders;
}

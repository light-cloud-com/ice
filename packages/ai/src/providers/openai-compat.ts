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

import http from 'node:http';
import https from 'node:https';
import { parseNodeStream } from '../stream-parser';
import type { AiProvider, ChatChunk, ChatParams, ChatResponse, HealthCheckResult } from '../types';

export class OpenAICompatProvider implements AiProvider {
  readonly name: string;
  readonly isLocal: boolean;
  readonly model: string;
  protected readonly baseUrl: string;
  protected readonly apiKey: string | undefined;

  constructor(options?: { baseUrl?: string; model?: string; apiKey?: string; name?: string; isLocal?: boolean }) {
    this.baseUrl = (options?.baseUrl || process.env.ICE_AI_URL || 'http://localhost:8000').replace(/\/+$/, '');
    this.model = options?.model || process.env.ICE_AI_MODEL || 'default';
    this.apiKey = options?.apiKey;
    this.name = options?.name || 'openai-compat';
    this.isLocal = options?.isLocal ?? true;
  }

  async healthCheck(): Promise<HealthCheckResult> {
    try {
      // Try /health first
      const healthRes = await this.httpGet('/health');
      if (healthRes.ok) {
        return { ok: true, provider: this.name, model: this.model, isLocal: this.isLocal };
      }
    } catch {
      // /health not available, try /v1/models
    }

    try {
      const modelsRes = await this.httpGet('/v1/models');
      if (modelsRes.ok) {
        const body = JSON.parse(modelsRes.body);
        const firstModel = body.data?.[0]?.id;
        return {
          ok: true,
          provider: this.name,
          model: firstModel || this.model,
          isLocal: this.isLocal,
        };
      }
    } catch {
      // Server not reachable
    }

    return { ok: false, provider: this.name, error: `Cannot reach ${this.baseUrl}` };
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    let content = '';
    for await (const chunk of this.streamChat(params)) {
      content += chunk.content;
    }
    return { content, finishReason: 'stop' };
  }

  async *streamChat(params: ChatParams): AsyncIterable<ChatChunk> {
    const messages = [{ role: 'system' as const, content: params.systemPrompt }, ...params.messages];

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      max_tokens: params.maxTokens,
      stream: true,
    };

    if (params.sessionId) {
      body.session_id = params.sessionId;
    }

    const stream = await this.httpPostStream('/v1/chat/completions', body);
    yield* parseNodeStream(stream);
  }

  // ===========================================================================
  // HTTP helpers (Node.js native — no fetch dependency for streaming)
  // ===========================================================================

  protected httpGet(path: string): Promise<{ ok: boolean; status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const transport = url.protocol === 'https:' ? https : http;

      const req = transport.get(url, { timeout: 3000, headers: this.buildHeaders() }, (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => (body += chunk.toString()));
        res.on('end', () =>
          resolve({ ok: res.statusCode! >= 200 && res.statusCode! < 300, status: res.statusCode!, body }),
        );
      });
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Timeout connecting to ${url}`));
      });
    });
  }

  protected httpPostStream(path: string, body: Record<string, unknown>): Promise<NodeJS.ReadableStream> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const transport = url.protocol === 'https:' ? https : http;
      const payload = JSON.stringify(body);

      const req = transport.request(
        url,
        {
          method: 'POST',
          headers: {
            ...this.buildHeaders(),
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            Accept: 'text/event-stream',
          },
          timeout: 300_000, // 5 min for long generations
        },
        (res) => {
          if (res.statusCode && res.statusCode >= 400) {
            let body = '';
            res.on('data', (chunk: Buffer) => (body += chunk.toString()));
            res.on('end', () => reject(new Error(`${this.name} API error ${res.statusCode}: ${body.slice(0, 200)}`)));
            return;
          }
          resolve(res);
        },
      );

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Timeout connecting to ${url}`));
      });

      req.write(payload);
      req.end();
    });
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }
}

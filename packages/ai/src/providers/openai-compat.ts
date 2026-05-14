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
    const explicitUrl = options?.baseUrl || process.env.ICE_AI_URL;
    if (!explicitUrl && process.env.NODE_ENV === 'production') {
      throw new Error(
        'OpenAICompatProvider requires ICE_AI_URL (or an explicit baseUrl) in production. ' +
          'Localhost defaults are only allowed in development.',
      );
    }
    this.baseUrl = (explicitUrl || 'http://localhost:8000').replace(/\/+$/, '');
    this.model = options?.model || process.env.ICE_AI_MODEL || 'default';
    this.apiKey = options?.apiKey;
    this.name = options?.name || 'openai-compat';
    this.isLocal = options?.isLocal ?? true;
  }

  async healthCheck(): Promise<HealthCheckResult> {
    // findings.md #17 — distinguish "endpoint missing" (404 / network)
    // from "endpoint there but rejected our auth" (401 / 403). The
    // previous catch-all fell through to /v1/models on every non-OK
    // response, so a misconfigured API key looked identical to "no
    // /health endpoint" and the user was sent to debug the wrong layer.
    try {
      const healthRes = await this.httpGet('/health');
      if (healthRes.ok) {
        return { ok: true, provider: this.name, model: this.model, isLocal: this.isLocal };
      }
      if (healthRes.status === 401 || healthRes.status === 403) {
        return {
          ok: false,
          provider: this.name,
          error: `Authentication failed against ${this.baseUrl}/health (status ${healthRes.status}). Check ICE_AI_API_KEY / Authorization header.`,
        };
      }
      // Other non-OK statuses (404 → endpoint missing, 5xx → server
      // bug) are treated the same as the previous fall-through:
      // /health is optional; try /v1/models next.
    } catch {
      // /health not reachable (network / timeout) — try /v1/models.
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
      if (modelsRes.status === 401 || modelsRes.status === 403) {
        return {
          ok: false,
          provider: this.name,
          error: `Authentication failed against ${this.baseUrl}/v1/models (status ${modelsRes.status}).`,
        };
      }
    } catch {
      // Server not reachable
    }

    return { ok: false, provider: this.name, error: `Cannot reach ${this.baseUrl}` };
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    // findings.md #18 — surface the wire-level finish reason. The
    // stream parser already extracts it from the SSE payload; the
    // previous version threw it away and returned 'stop' even when
    // the model actually hit a length cap or content filter.
    let content = '';
    let finishReason: ChatResponse['finishReason'] = 'stop';
    for await (const chunk of this.streamChat(params)) {
      content += chunk.content;
      if (chunk.finishReason) {
        finishReason = chunk.finishReason as ChatResponse['finishReason'];
      }
    }
    return { content, finishReason };
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

/**
 * Anthropic Provider
 *
 * Cloud AI via the Anthropic Claude API.
 * Uses @anthropic-ai/sdk for streaming and non-streaming chat.
 */
import Anthropic from '@anthropic-ai/sdk';
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
export class AnthropicProvider {
    name = 'anthropic';
    isLocal = false;
    model;
    client;
    constructor(options) {
        const apiKey = options?.apiKey || process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            throw new Error('Anthropic API key required. Set ANTHROPIC_API_KEY or pass apiKey option.');
        }
        this.client = new Anthropic({ apiKey });
        this.model = options?.model || process.env.ICE_AI_MODEL || DEFAULT_MODEL;
    }
    async healthCheck() {
        // Anthropic doesn't have a health endpoint — if we have a key, assume ok
        return { ok: true, provider: 'anthropic', model: this.model, isLocal: false };
    }
    async chat(params) {
        const message = await this.client.messages.create({
            model: this.model,
            max_tokens: params.maxTokens,
            system: params.systemPrompt,
            messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
        });
        const textContent = message.content.find((c) => c.type === 'text');
        const content = textContent && textContent.type === 'text' ? textContent.text : '';
        return { content, finishReason: 'stop' };
    }
    async *streamChat(params) {
        const stream = this.client.messages.stream({
            model: this.model,
            max_tokens: params.maxTokens,
            system: params.systemPrompt,
            messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
        });
        for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                yield { content: event.delta.text, finishReason: null };
            }
        }
        yield { content: '', finishReason: 'stop' };
    }
}

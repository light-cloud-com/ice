/**
 * @ice/ai — Provider abstraction types
 *
 * Unified interface for AI providers: Anthropic (cloud, default)
 * and any OpenAI-compatible endpoint (Ollama, LM Studio, vLLM, etc.).
 */
// =============================================================================
// Null Provider (AI disabled)
// =============================================================================
export class NullProvider {
    name = 'none';
    isLocal = true;
    model = 'none';
    async healthCheck() {
        return { ok: false, provider: 'none', error: 'No AI provider configured' };
    }
    async chat() {
        throw new Error('No AI provider configured. Set ANTHROPIC_API_KEY or ICE_AI_URL.');
    }
    async *streamChat() {
        // Generator throws before yielding; explicit empty yield satisfies
        // eslint's require-yield and doesn't change observed behaviour.
        yield undefined;
        throw new Error('No AI provider configured. Set ANTHROPIC_API_KEY or ICE_AI_URL.');
    }
}

# @ice/ai

Provider-agnostic AI client used by the in-app chat. Wraps Anthropic Claude as the default and any OpenAI-compatible backend (Ollama, LM Studio, vLLM, llama.cpp, etc.) as an alternative.

Where to start reading:

- `src/create-provider.ts` — entry point. Picks Anthropic or OpenAI-compat based on user settings.
- `src/providers/anthropic.ts` — Claude integration via the official SDK.
- `src/providers/openai-compat.ts` — speaks `/v1/chat/completions`. Refuses to start in production without `ICE_AI_URL` to prevent silent localhost fallback.
- `src/stream-parser.ts` — SSE → `ChatChunk` parser used by both providers.
- `src/types.ts` — `AiProvider`, `ChatParams`, `ChatChunk`, `ChatResponse`, `HealthCheckResult`.

The API key flows in via user settings (stored encrypted in the DB), not env vars — see [docs/architecture/ai-assistant.md](../../docs/architecture/ai-assistant.md).

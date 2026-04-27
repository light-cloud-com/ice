/**
 * SSE Stream Parser for OpenAI-compatible chat completion responses.
 *
 * Parses `text/event-stream` format:
 *   data: {"choices":[{"delta":{"content":"token"},"finish_reason":null}]}
 *   data: [DONE]
 */
/**
 * Parse a Node.js readable stream (from fetch/http) of OpenAI SSE events
 * into an async iterable of ChatChunk objects.
 */
export async function* parseOpenAIStream(response) {
    const reader = response.body?.getReader();
    if (!reader)
        throw new Error('Response body is not readable');
    const decoder = new TextDecoder();
    let buffer = '';
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            // Process complete lines
            const lines = buffer.split('\n');
            // Keep the last (potentially incomplete) line in the buffer
            buffer = lines.pop() || '';
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith(':'))
                    continue;
                if (!trimmed.startsWith('data: '))
                    continue;
                const data = trimmed.slice(6);
                if (data === '[DONE]')
                    return;
                try {
                    const parsed = JSON.parse(data);
                    const choice = parsed.choices?.[0];
                    if (!choice)
                        continue;
                    const content = choice.delta?.content ?? '';
                    const finishReason = choice.finish_reason ?? null;
                    yield { content, finishReason };
                }
                catch {
                    // Skip malformed JSON lines
                }
            }
        }
    }
    finally {
        reader.releaseLock();
    }
}
/**
 * Parse a Node.js IncomingMessage (http.request response) of OpenAI SSE events.
 * Used in Node.js environments where fetch may not be available.
 */
export async function* parseNodeStream(stream) {
    let buffer = '';
    for await (const rawChunk of stream) {
        buffer += typeof rawChunk === 'string' ? rawChunk : rawChunk.toString('utf-8');
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':'))
                continue;
            if (!trimmed.startsWith('data: '))
                continue;
            const data = trimmed.slice(6);
            if (data === '[DONE]')
                return;
            try {
                const parsed = JSON.parse(data);
                const choice = parsed.choices?.[0];
                if (!choice)
                    continue;
                const content = choice.delta?.content ?? '';
                const finishReason = choice.finish_reason ?? null;
                yield { content, finishReason };
            }
            catch {
                // Skip malformed JSON lines
            }
        }
    }
}

/**
 * SSE Stream Parser for OpenAI-compatible chat completion responses.
 *
 * Parses `text/event-stream` format:
 *   data: {"choices":[{"delta":{"content":"token"},"finish_reason":null}]}
 *   data: [DONE]
 */
import type { ChatChunk } from './types';
/**
 * Parse a Node.js readable stream (from fetch/http) of OpenAI SSE events
 * into an async iterable of ChatChunk objects.
 */
export declare function parseOpenAIStream(response: Response): AsyncIterable<ChatChunk>;
/**
 * Parse a Node.js IncomingMessage (http.request response) of OpenAI SSE events.
 * Used in Node.js environments where fetch may not be available.
 */
export declare function parseNodeStream(stream: NodeJS.ReadableStream): AsyncIterable<ChatChunk>;

/**
 * SSE stream parser tests.
 *
 * Two parsers cover two transports: `parseOpenAIStream` consumes a
 * Web-streams `Response`, `parseNodeStream` consumes a Node readable.
 * Both share the same SSE shape rules.
 */

import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { parseNodeStream, parseOpenAIStream } from '../stream-parser';

function makeWebResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Response(stream);
}

function delta(content: string, finishReason: string | null = null): string {
  return `data: ${JSON.stringify({
    choices: [{ delta: { content }, finish_reason: finishReason }],
  })}\n\n`;
}

describe('parseOpenAIStream', () => {
  it('yields content from each delta until [DONE]', async () => {
    const res = makeWebResponse([delta('Hel'), delta('lo'), delta('', 'stop'), 'data: [DONE]\n\n']);
    const chunks = [];
    for await (const chunk of parseOpenAIStream(res)) chunks.push(chunk);
    expect(chunks.map((c) => c.content).join('')).toBe('Hello');
    expect(chunks.at(-1)?.finishReason).toBe('stop');
  });

  it('throws when the response has no readable body', async () => {
    const res = { body: null } as unknown as Response;
    const it = parseOpenAIStream(res)[Symbol.asyncIterator]();
    await expect(it.next()).rejects.toThrow(/not readable/i);
  });

  it('skips comment lines beginning with ":"', async () => {
    const res = makeWebResponse([': keep-alive\n\n', delta('ok'), 'data: [DONE]\n\n']);
    const chunks = [];
    for await (const chunk of parseOpenAIStream(res)) chunks.push(chunk);
    expect(chunks.map((c) => c.content).join('')).toBe('ok');
  });

  it('skips lines without the "data: " prefix', async () => {
    const res = makeWebResponse(['event: ping\n\n', delta('x'), 'data: [DONE]\n\n']);
    const chunks = [];
    for await (const chunk of parseOpenAIStream(res)) chunks.push(chunk);
    expect(chunks.map((c) => c.content).join('')).toBe('x');
  });

  it('drops malformed JSON payloads instead of throwing', async () => {
    const res = makeWebResponse(['data: not-json\n\n', delta('ok'), 'data: [DONE]\n\n']);
    const chunks = [];
    for await (const chunk of parseOpenAIStream(res)) chunks.push(chunk);
    expect(chunks.map((c) => c.content).join('')).toBe('ok');
  });

  it('drops events without a choice array entry', async () => {
    const res = makeWebResponse(['data: {"choices": []}\n\n', delta('ok'), 'data: [DONE]\n\n']);
    const chunks = [];
    for await (const chunk of parseOpenAIStream(res)) chunks.push(chunk);
    expect(chunks.map((c) => c.content).join('')).toBe('ok');
  });

  it('treats missing delta.content as empty string', async () => {
    const res = makeWebResponse([
      'data: {"choices":[{"delta":{},"finish_reason":null}]}\n\n',
      'data: [DONE]\n\n',
    ]);
    const chunks = [];
    for await (const chunk of parseOpenAIStream(res)) chunks.push(chunk);
    expect(chunks).toEqual([{ content: '', finishReason: null }]);
  });

  it('handles chunked deliveries that split a single SSE line', async () => {
    // First push the start of a delta, then complete it on the next chunk.
    const partial = delta('Hello world');
    const head = partial.slice(0, 20);
    const tail = partial.slice(20);
    const res = makeWebResponse([head, tail, 'data: [DONE]\n\n']);
    const chunks = [];
    for await (const chunk of parseOpenAIStream(res)) chunks.push(chunk);
    expect(chunks.map((c) => c.content).join('')).toBe('Hello world');
  });
});

describe('parseNodeStream', () => {
  function nodeStreamFrom(chunks: string[]): NodeJS.ReadableStream {
    return Readable.from(chunks);
  }

  it('yields chunks until [DONE]', async () => {
    const chunks = [];
    for await (const c of parseNodeStream(nodeStreamFrom([delta('a'), delta('b'), 'data: [DONE]\n\n']))) {
      chunks.push(c);
    }
    expect(chunks.map((c) => c.content).join('')).toBe('ab');
  });

  it('skips comment and non-data lines', async () => {
    const chunks = [];
    for await (const c of parseNodeStream(
      nodeStreamFrom([': ping\n\n', 'event: status\n\n', delta('z'), 'data: [DONE]\n\n']),
    )) {
      chunks.push(c);
    }
    expect(chunks.map((c) => c.content).join('')).toBe('z');
  });

  it('drops malformed JSON payloads silently', async () => {
    const chunks = [];
    for await (const c of parseNodeStream(
      nodeStreamFrom(['data: junk\n\n', delta('ok'), 'data: [DONE]\n\n']),
    )) {
      chunks.push(c);
    }
    expect(chunks.map((c) => c.content).join('')).toBe('ok');
  });

  it('drops events missing a choice', async () => {
    const chunks = [];
    for await (const c of parseNodeStream(
      nodeStreamFrom(['data: {"choices":[]}\n\n', delta('y'), 'data: [DONE]\n\n']),
    )) {
      chunks.push(c);
    }
    expect(chunks.map((c) => c.content).join('')).toBe('y');
  });

  it('treats Buffer chunks the same as string chunks', async () => {
    const chunks = [];
    const stream = Readable.from([Buffer.from(delta('hi')), Buffer.from('data: [DONE]\n\n')]);
    for await (const c of parseNodeStream(stream)) chunks.push(c);
    expect(chunks.map((c) => c.content).join('')).toBe('hi');
  });

  it('terminates without yielding when [DONE] arrives before any data', async () => {
    const chunks = [];
    for await (const c of parseNodeStream(nodeStreamFrom(['data: [DONE]\n\n']))) chunks.push(c);
    expect(chunks).toHaveLength(0);
  });
});

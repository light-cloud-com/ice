/**
 * Smoke tests for `services/ai/src/services/ai.service.ts` — the
 * thin orchestrator shim that remains after rf-aisvc-1..6.
 *
 * Each leaf module (provider / skill-detection / deployment-context /
 * system-prompt / response-parsing / post-processing /
 * operation-validation) has its own deep coverage; this file just
 * verifies the shim wires them together correctly:
 *  - processCanvasIntent: chat → parse → fire post-processing → return
 *  - streamCanvasIntent: SSE headers → thinking → operations →
 *    explanation → suggestions → clarification → done
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAiProvider: vi.fn(),
  buildSystemPrompt: vi.fn(),
  detectSkill: vi.fn(),
  parseAiResponse: vi.fn(),
  runPostProcessing: vi.fn(),
  createAuditEntry: vi.fn(),
  finalizeAuditEntry: vi.fn(),
  writeAuditEntry: vi.fn(),
  providerChat: vi.fn(),
  providerStreamChat: vi.fn(),
}));

vi.mock('../ai/provider', () => ({
  getAiProvider: mocks.getAiProvider,
  getAiProviderSync: vi.fn(),
}));

vi.mock('../ai/system-prompt', () => ({
  buildSystemPrompt: mocks.buildSystemPrompt,
}));

vi.mock('../ai/skill-detection', () => ({
  detectSkill: mocks.detectSkill,
}));

vi.mock('../ai/response-parsing', () => ({
  parseAiResponse: mocks.parseAiResponse,
}));

vi.mock('../ai/post-processing', () => ({
  runPostProcessing: mocks.runPostProcessing,
}));

vi.mock('../ai-audit.service', () => ({
  createAuditEntry: mocks.createAuditEntry,
  finalizeAuditEntry: mocks.finalizeAuditEntry,
  writeAuditEntry: mocks.writeAuditEntry,
}));

import { processCanvasIntent, streamCanvasIntent } from '../ai.service';
import type { Response } from 'express';
import type { SerializedCanvas } from '@ice/types';

const baseCanvas: SerializedCanvas = {
  nodes: [],
  edges: [],
  selectedNodeIds: [],
  availableBlockTypes: ['Database.PostgreSQL'],
} as SerializedCanvas;

describe('processCanvasIntent', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.values(mocks).forEach((m) => m.mockReset?.());
    mocks.createAuditEntry.mockReturnValue({ id: 'audit-1' });
    mocks.buildSystemPrompt.mockResolvedValue('SYSTEM');
    mocks.detectSkill.mockReturnValue('default');
    mocks.providerChat.mockResolvedValue({ content: '{"explanation":"ok","operations":[]}' });
    mocks.parseAiResponse.mockReturnValue({ explanation: 'ok', operations: [] });
    mocks.getAiProvider.mockResolvedValue({
      chat: mocks.providerChat,
      streamChat: mocks.providerStreamChat,
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('runs the standard happy path: provider.chat → parse → post-processing → return', async () => {
    const out = await processCanvasIntent('add a redis cache', baseCanvas);

    expect(mocks.buildSystemPrompt).toHaveBeenCalledWith(baseCanvas, 'add a redis cache', undefined);
    expect(mocks.providerChat).toHaveBeenCalledWith({
      systemPrompt: 'SYSTEM',
      messages: [{ role: 'user', content: 'add a redis cache' }],
      maxTokens: 4096,
    });
    expect(mocks.parseAiResponse).toHaveBeenCalledWith(
      '{"explanation":"ok","operations":[]}',
      expect.any(Set),
    );
    expect(mocks.runPostProcessing).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ explanation: 'ok', operations: [] });
  });

  it('uses 8192 maxTokens in cloud-architect mode', async () => {
    mocks.detectSkill.mockReturnValue('cloud-architect');

    await processCanvasIntent('I want to build a SaaS', baseCanvas);

    expect(mocks.providerChat).toHaveBeenCalledWith(
      expect.objectContaining({ maxTokens: 8192 }),
    );
  });

  it('returns "No response generated" when provider returns empty content', async () => {
    mocks.providerChat.mockResolvedValue({ content: '' });

    const out = await processCanvasIntent('hi', baseCanvas);

    expect(out).toEqual({ explanation: 'No response generated', operations: [] });
    expect(mocks.parseAiResponse).not.toHaveBeenCalled();
    expect(mocks.runPostProcessing).not.toHaveBeenCalled();
    expect(mocks.finalizeAuditEntry).toHaveBeenCalledWith(
      { id: 'audit-1' },
      expect.objectContaining({ parseSuccess: false, error: 'No text content in response' }),
    );
    expect(mocks.writeAuditEntry).toHaveBeenCalledWith({ id: 'audit-1' });
  });

  it('writes audit + rethrows on provider.chat failure', async () => {
    mocks.providerChat.mockRejectedValue(new Error('upstream'));

    await expect(processCanvasIntent('hi', baseCanvas)).rejects.toThrow('upstream');

    expect(mocks.finalizeAuditEntry).toHaveBeenCalledWith(
      { id: 'audit-1' },
      expect.objectContaining({ error: 'upstream' }),
    );
    expect(mocks.writeAuditEntry).toHaveBeenCalledWith({ id: 'audit-1' });
  });

  it('forwards the cardId to buildSystemPrompt for question intents', async () => {
    await processCanvasIntent('what is deployed', baseCanvas, 'card-99');

    expect(mocks.buildSystemPrompt).toHaveBeenCalledWith(baseCanvas, 'what is deployed', 'card-99');
  });

  it('passes a Set of canvas.availableBlockTypes to parseAiResponse', async () => {
    await processCanvasIntent('hi', {
      ...baseCanvas,
      availableBlockTypes: ['A', 'B', 'C'],
    });

    const allowedSet = mocks.parseAiResponse.mock.calls[0][1] as Set<string>;
    expect(allowedSet).toBeInstanceOf(Set);
    expect([...allowedSet]).toEqual(['A', 'B', 'C']);
  });
});

// Test double for express Response (just the methods streamCanvasIntent uses)
function makeMockResponse() {
  const writes: string[] = [];
  let writeHeadCalled = false;
  let endCalled = false;
  const res = {
    writeHead(_status: number, _headers: Record<string, string>) {
      writeHeadCalled = true;
    },
    write(chunk: string) {
      writes.push(chunk);
    },
    end() {
      endCalled = true;
    },
  } as unknown as Response;
  return {
    res,
    writes,
    get writeHeadCalled() {
      return writeHeadCalled;
    },
    get endCalled() {
      return endCalled;
    },
  };
}

async function* asyncChunks(parts: string[]): AsyncIterable<{ content: string }> {
  for (const p of parts) yield { content: p };
}

describe('streamCanvasIntent', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.values(mocks).forEach((m) => m.mockReset?.());
    mocks.createAuditEntry.mockReturnValue({ id: 'audit-1' });
    mocks.buildSystemPrompt.mockResolvedValue('SYSTEM');
    mocks.detectSkill.mockReturnValue('default');
    mocks.parseAiResponse.mockReturnValue({
      explanation: 'ok',
      operations: [{ op: 'autoOrganize' }] as any,
    });
    mocks.getAiProvider.mockResolvedValue({
      chat: mocks.providerChat,
      streamChat: mocks.providerStreamChat,
    });
  });

  it('writes SSE headers and emits thinking/operation/explanation/done events', async () => {
    mocks.providerStreamChat.mockReturnValue(asyncChunks(['{"explan', 'ation":"ok","operations":[]}']));

    const ctx = makeMockResponse();
    await streamCanvasIntent('add a redis', baseCanvas, ctx.res);

    expect(ctx.writeHeadCalled).toBe(true);
    expect(ctx.endCalled).toBe(true);
    const joined = ctx.writes.join('');
    expect(joined).toContain('event: thinking');
    expect(joined).toContain('Analyzing your canvas');
    expect(joined).toContain('event: operation');
    expect(joined).toContain('event: explanation');
    expect(joined).toContain('event: done');
  });

  it('uses architect-mode thinking message and 8192 maxTokens for cloud-architect intents', async () => {
    mocks.detectSkill.mockReturnValue('cloud-architect');
    mocks.providerStreamChat.mockReturnValue(asyncChunks(['{"explanation":"ok","operations":[]}']));

    const ctx = makeMockResponse();
    await streamCanvasIntent('I want to build a SaaS', baseCanvas, ctx.res);

    expect(mocks.providerStreamChat).toHaveBeenCalledWith(
      expect.objectContaining({ maxTokens: 8192 }),
    );
    const joined = ctx.writes.join('');
    expect(joined).toContain('Designing your cloud architecture');
  });

  it('emits suggestions when present', async () => {
    mocks.parseAiResponse.mockReturnValue({
      explanation: 'ok',
      operations: [],
      suggestions: ['add a cache', 'add monitoring'],
    });
    mocks.providerStreamChat.mockReturnValue(asyncChunks(['{"explanation":"ok","operations":[]}']));

    const ctx = makeMockResponse();
    await streamCanvasIntent('hi', baseCanvas, ctx.res);

    const joined = ctx.writes.join('');
    expect(joined).toContain('event: suggestions');
    expect(joined).toContain('add a cache');
  });

  it('emits clarification when present', async () => {
    mocks.parseAiResponse.mockReturnValue({
      explanation: 'ok',
      operations: [],
      clarification: { question: 'Which provider?', options: ['AWS', 'GCP'] },
    });
    mocks.providerStreamChat.mockReturnValue(asyncChunks(['{"explanation":"ok","operations":[]}']));

    const ctx = makeMockResponse();
    await streamCanvasIntent('hi', baseCanvas, ctx.res);

    const joined = ctx.writes.join('');
    expect(joined).toContain('event: clarification');
    expect(joined).toContain('Which provider?');
  });

  it('emits an error event and writes audit on stream failure', async () => {
    mocks.providerStreamChat.mockImplementation(() => {
      // Use the `for await` to throw inside the loop on the first read.
      return (async function* () {
        yield { content: 'partial' };
        throw new Error('stream failure');
      })();
    });

    const ctx = makeMockResponse();
    await streamCanvasIntent('hi', baseCanvas, ctx.res);

    const joined = ctx.writes.join('');
    expect(joined).toContain('event: error');
    expect(joined).toContain('stream failure');
    expect(mocks.finalizeAuditEntry).toHaveBeenCalledWith(
      { id: 'audit-1' },
      expect.objectContaining({ error: 'stream failure' }),
    );
    expect(mocks.writeAuditEntry).toHaveBeenCalledWith({ id: 'audit-1' });
    expect(ctx.endCalled).toBe(true);
  });

  it('does NOT emit explanation event when explanation is empty', async () => {
    mocks.parseAiResponse.mockReturnValue({ explanation: '', operations: [] });
    mocks.providerStreamChat.mockReturnValue(asyncChunks(['{"explanation":"","operations":[]}']));

    const ctx = makeMockResponse();
    await streamCanvasIntent('hi', baseCanvas, ctx.res);

    const joined = ctx.writes.join('');
    expect(joined).not.toContain('event: explanation');
  });

  it('does NOT emit suggestions event when suggestions is empty/missing', async () => {
    mocks.parseAiResponse.mockReturnValue({
      explanation: 'ok',
      operations: [],
      suggestions: [],
    });
    mocks.providerStreamChat.mockReturnValue(asyncChunks(['{"explanation":"ok","operations":[]}']));

    const ctx = makeMockResponse();
    await streamCanvasIntent('hi', baseCanvas, ctx.res);

    const joined = ctx.writes.join('');
    expect(joined).not.toContain('event: suggestions');
  });

  it('runs post-processing after the stream completes', async () => {
    mocks.providerStreamChat.mockReturnValue(asyncChunks(['{"explanation":"ok","operations":[]}']));

    const ctx = makeMockResponse();
    await streamCanvasIntent('hi', baseCanvas, ctx.res);

    expect(mocks.runPostProcessing).toHaveBeenCalledTimes(1);
  });
});

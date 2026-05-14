/**
 * Unit tests for `services/ai/src/services/diagnose-deploy.service.ts`.
 *
 * The SUT imports `getAiProvider` from the sibling `./ai.service` shim
 * (which itself re-exports the orchestrator-managed provider). We mock
 * `../ai.service` so each test can shape the provider's chat response
 * deterministically and so failure-prompt branches are reachable.
 *
 * Vitest globals are imported explicitly per
 * `deploy-service-tests-must-import-vitest-explicitly`, mocks reset in
 * `beforeEach` per
 * `vi-spyon-accumulates-across-it-blocks-without-explicit-reset`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAiProvider: vi.fn(),
  providerChat: vi.fn(),
}));

vi.mock('../ai.service', () => ({
  getAiProvider: mocks.getAiProvider,
  getAiProviderSync: vi.fn(),
}));

import { diagnoseDeploy } from '../diagnose-deploy.service';
import type { DiagnoseDeployRequest } from '@ice/types';

const baseRequest: DiagnoseDeployRequest = {
  error: 'permission denied on bucket "logs"',
  resourceResults: [],
  canvasContext: {
    nodes: [],
    edges: [],
    selectedNodeIds: [],
    availableBlockTypes: [],
  } as any,
  provider: 'gcp',
  region: 'us-central1',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAiProvider.mockResolvedValue({ chat: mocks.providerChat });
  mocks.providerChat.mockResolvedValue({
    content: JSON.stringify({
      diagnosis: 'You lack permission on the bucket.',
      suggestedFixes: ['grant roles/storage.admin to the SA'],
      operations: [],
    }),
  });
});

describe('diagnoseDeploy', () => {
  it('parses a clean JSON provider response into the structured diagnosis', async () => {
    const result = await diagnoseDeploy(baseRequest);

    expect(result.diagnosis).toBe('You lack permission on the bucket.');
    expect(result.suggestedFixes).toEqual(['grant roles/storage.admin to the SA']);
    expect(result.operations).toEqual([]);
  });

  it('passes the system prompt and a maxTokens=2048 cap to provider.chat', async () => {
    await diagnoseDeploy(baseRequest);

    expect(mocks.providerChat).toHaveBeenCalledTimes(1);
    const arg = mocks.providerChat.mock.calls[0]![0];
    expect(arg.maxTokens).toBe(2048);
    expect(arg.systemPrompt).toContain('senior cloud deployment engineer');
    expect(arg.systemPrompt).toContain('JSON object');
    expect(arg.messages[0]?.role).toBe('user');
  });

  it('builds a user prompt that includes the error, provider, and region', async () => {
    await diagnoseDeploy(baseRequest);

    const userPrompt = mocks.providerChat.mock.calls[0]![0].messages[0].content as string;
    expect(userPrompt).toContain('## Error');
    expect(userPrompt).toContain('permission denied on bucket "logs"');
    expect(userPrompt).toContain('Provider: gcp');
    expect(userPrompt).toContain('Region: us-central1');
  });

  it('falls back to "(no top-level error message)" when the request error is empty', async () => {
    await diagnoseDeploy({ ...baseRequest, error: '   ' });

    const userPrompt = mocks.providerChat.mock.calls[0]![0].messages[0].content as string;
    expect(userPrompt).toContain('(no top-level error message)');
  });

  it('falls back to "unknown" provider/region in the prompt when both are empty strings', async () => {
    await diagnoseDeploy({ ...baseRequest, provider: '', region: '' });

    const userPrompt = mocks.providerChat.mock.calls[0]![0].messages[0].content as string;
    expect(userPrompt).toContain('Provider: unknown');
    expect(userPrompt).toContain('Region: unknown');
  });

  it('renders the failed-resources section when resourceResults is non-empty', async () => {
    await diagnoseDeploy({
      ...baseRequest,
      resourceResults: [
        { name: 'db', type: 'sql', action: 'create', error: 'quota exceeded' },
        { name: 'svc', type: 'cloudrun', action: 'update' }, // no error
      ],
    });

    const userPrompt = mocks.providerChat.mock.calls[0]![0].messages[0].content as string;
    expect(userPrompt).toContain('## Failed Resources');
    expect(userPrompt).toContain('"db" (sql, action: create) — quota exceeded');
    expect(userPrompt).toContain('"svc" (cloudrun, action: update)');
    // The "no error" branch must not append a dash-separated suffix
    expect(userPrompt).not.toContain('"svc" (cloudrun, action: update) —');
  });

  it('omits the failed-resources section when resourceResults is empty', async () => {
    await diagnoseDeploy(baseRequest);

    const userPrompt = mocks.providerChat.mock.calls[0]![0].messages[0].content as string;
    expect(userPrompt).not.toContain('## Failed Resources');
  });

  it('renders the canvas-architecture section with nodes and edges when canvasContext has both', async () => {
    await diagnoseDeploy({
      ...baseRequest,
      canvasContext: {
        nodes: [
          { id: 'n1', iceType: 'database', label: 'Postgres' },
          { id: 'n2', iceType: 'service', label: '' },
          { id: 'n3' }, // no iceType, no label — both fall back
        ],
        edges: [
          { source: 'n1', target: 'n2', relationship: 'connects' },
          { source: 'n2', target: 'n3' }, // no relationship
        ],
      } as any,
    });

    const userPrompt = mocks.providerChat.mock.calls[0]![0].messages[0].content as string;
    expect(userPrompt).toContain('## Canvas Architecture');
    expect(userPrompt).toContain('- n1 [database] Postgres');
    expect(userPrompt).toContain('- n2 [service]');
    expect(userPrompt).toContain('- n3 [unknown]');
    expect(userPrompt).toContain('Edges:');
    expect(userPrompt).toContain('- n1 → n2 (connects)');
    expect(userPrompt).toContain('- n2 → n3');
    // edge with no relationship should not have parentheses suffix
    expect(userPrompt).not.toContain('- n2 → n3 (');
  });

  it('omits the canvas-architecture section when canvasContext has no nodes', async () => {
    await diagnoseDeploy({
      ...baseRequest,
      canvasContext: { nodes: [], edges: [] } as any,
    });

    const userPrompt = mocks.providerChat.mock.calls[0]![0].messages[0].content as string;
    expect(userPrompt).not.toContain('## Canvas Architecture');
  });

  it('skips the edges sub-section when canvasContext has nodes but no edges', async () => {
    await diagnoseDeploy({
      ...baseRequest,
      canvasContext: {
        nodes: [{ id: 'n1', iceType: 'service', label: 'Web' }],
        edges: [],
      } as any,
    });

    const userPrompt = mocks.providerChat.mock.calls[0]![0].messages[0].content as string;
    expect(userPrompt).toContain('## Canvas Architecture');
    expect(userPrompt).toContain('- n1 [service] Web');
    expect(userPrompt).not.toContain('Edges:');
  });

  it('extracts and parses a JSON object embedded in trailing prose', async () => {
    mocks.providerChat.mockResolvedValue({
      content:
        'Here is my analysis:\n{"diagnosis":"x","suggestedFixes":["a","b"],"operations":[]}\nHope that helps!',
    });

    const result = await diagnoseDeploy(baseRequest);

    expect(result.diagnosis).toBe('x');
    expect(result.suggestedFixes).toEqual(['a', 'b']);
  });

  it('returns a truncated raw fallback when JSON parse fails', async () => {
    mocks.providerChat.mockResolvedValue({
      content: 'this is not even close to JSON, just a sentence.',
    });

    const result = await diagnoseDeploy(baseRequest);

    expect(result.diagnosis).toBe('this is not even close to JSON, just a sentence.');
    expect(result.suggestedFixes).toEqual([]);
  });

  it('returns the unparseable-fallback string when raw response is empty', async () => {
    mocks.providerChat.mockResolvedValue({ content: '' });

    const result = await diagnoseDeploy(baseRequest);

    expect(result.diagnosis).toBe('AI returned an unparseable response.');
    expect(result.suggestedFixes).toEqual([]);
  });

  it('returns the unparseable-fallback when JSON match exists but JSON.parse throws', async () => {
    mocks.providerChat.mockResolvedValue({
      content: 'lead {not actually json} trail',
    });

    const result = await diagnoseDeploy(baseRequest);

    // The regex matches `{not actually json}`, parse fails, fallback returns
    // a slice of the raw content (not the matched JSON-only portion).
    expect(result.diagnosis).toBe('lead {not actually json} trail');
    expect(result.suggestedFixes).toEqual([]);
  });

  it('falls back to "No diagnosis provided." when parsed JSON has no string diagnosis field', async () => {
    mocks.providerChat.mockResolvedValue({
      content: JSON.stringify({ diagnosis: 42, suggestedFixes: ['a'] }),
    });

    const result = await diagnoseDeploy(baseRequest);

    expect(result.diagnosis).toBe('No diagnosis provided.');
    expect(result.suggestedFixes).toEqual(['a']);
  });

  it('filters out non-string entries in suggestedFixes', async () => {
    mocks.providerChat.mockResolvedValue({
      content: JSON.stringify({
        diagnosis: 'x',
        suggestedFixes: ['ok', 42, null, 'also ok'],
        operations: [],
      }),
    });

    const result = await diagnoseDeploy(baseRequest);

    expect(result.suggestedFixes).toEqual(['ok', 'also ok']);
  });

  it('coerces missing suggestedFixes to an empty array', async () => {
    mocks.providerChat.mockResolvedValue({
      content: JSON.stringify({ diagnosis: 'x' }),
    });

    const result = await diagnoseDeploy(baseRequest);

    expect(result.suggestedFixes).toEqual([]);
  });

  it('passes through operations when the provider returns a non-empty operations array', async () => {
    const ops = [{ op: 'addNode', node: { id: 'n1' } }];
    mocks.providerChat.mockResolvedValue({
      content: JSON.stringify({
        diagnosis: 'x',
        suggestedFixes: [],
        operations: ops,
      }),
    });

    const result = await diagnoseDeploy(baseRequest);

    expect(result.operations).toEqual(ops);
  });

  it('coerces missing operations to an empty array', async () => {
    mocks.providerChat.mockResolvedValue({
      content: JSON.stringify({ diagnosis: 'x', suggestedFixes: [] }),
    });

    const result = await diagnoseDeploy(baseRequest);

    expect(result.operations).toEqual([]);
  });

  it('truncates long unparseable raw responses to 400 characters', async () => {
    const longRaw = 'a'.repeat(600);
    mocks.providerChat.mockResolvedValue({ content: longRaw });

    const result = await diagnoseDeploy(baseRequest);

    expect(result.diagnosis.length).toBe(400);
    expect(result.diagnosis).toBe('a'.repeat(400));
  });

  it('treats a missing content field as an empty raw response', async () => {
    mocks.providerChat.mockResolvedValue({ content: undefined });

    const result = await diagnoseDeploy(baseRequest);

    expect(result.diagnosis).toBe('AI returned an unparseable response.');
  });
});

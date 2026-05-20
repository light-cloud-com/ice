/**
 * rf-spr2-1 — byte-identical snapshot test for the system prompt.
 *
 * Captures the full prompt output for a stable canvas fixture and
 * compares it against an in-source string snapshot. Any drift in the
 * prompt body (whitespace, character count, etc.) fails the test.
 *
 * The fixtures stub `buildSchemaContext`, `buildDeploymentContext`,
 * and `generateAiConnectionPrompt` so the snapshot doesn't drift when
 * those upstream modules change.
 */

import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildSchemaContext: vi.fn(),
  buildDeploymentContext: vi.fn(),
}));

vi.mock('../../ai-schema-context.service', () => ({
  buildSchemaContext: mocks.buildSchemaContext,
}));

vi.mock('../deployment-context', () => ({
  buildDeploymentContext: mocks.buildDeploymentContext,
}));

vi.mock('@ice/types', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ice/types')>();
  return {
    ...actual,
    generateAiConnectionPrompt: () => '<<CONNECTION_PROMPT_FIXTURE>>',
  };
});

import { buildSystemPrompt } from '../system-prompt';
import type { SerializedCanvas } from '@ice/types';

describe('buildSystemPrompt — byte-identical snapshot', () => {
  it('produces a stable string for a fixed canvas + no intent', async () => {
    mocks.buildSchemaContext.mockResolvedValue('<<SCHEMA_CTX_FIXTURE>>');
    const canvas: SerializedCanvas = {
      nodes: [
        {
          id: 'n1',
          iceType: 'Database.PostgreSQL',
          label: 'orders',
          provider: 'aws',
        } as never,
      ],
      edges: [{ source: 'n1', target: 'n2', relationship: 'depends_on' } as never],
      selectedNodeIds: ['n1'],
      availableBlockTypes: ['Compute.Container', 'Database.PostgreSQL'],
    } as SerializedCanvas;

    const out = await buildSystemPrompt(canvas);

    // Asserts stable byte-length AND stable structure.
    expect(out).toMatchSnapshot();
  });

  it('produces a stable string when cloud-architect skill is detected', async () => {
    mocks.buildSchemaContext.mockResolvedValue('<<SCHEMA_CTX_FIXTURE>>');
    const canvas: SerializedCanvas = {
      nodes: [],
      edges: [],
      selectedNodeIds: [],
      availableBlockTypes: ['Compute.Container', 'Database.PostgreSQL'],
    } as SerializedCanvas;

    const out = await buildSystemPrompt(canvas, 'design a saas platform for me');
    expect(out).toMatchSnapshot();
  });

  it('produces a stable string when question intent injects deployment context', async () => {
    mocks.buildSchemaContext.mockResolvedValue('<<SCHEMA_CTX_FIXTURE>>');
    mocks.buildDeploymentContext.mockResolvedValue('<<DEPLOYMENT_CTX_FIXTURE>>');
    const canvas: SerializedCanvas = {
      nodes: [],
      edges: [],
      selectedNodeIds: [],
      availableBlockTypes: ['Compute.Container'],
    } as SerializedCanvas;

    const out = await buildSystemPrompt(canvas, 'is the saas platform live', 'card-1');
    expect(out).toMatchSnapshot();
  });
});

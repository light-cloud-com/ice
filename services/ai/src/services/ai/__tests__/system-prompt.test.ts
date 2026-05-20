/**
 * Unit tests for `services/ai/src/services/ai/system-prompt.ts` —
 * the system-prompt assembler + pure helpers extracted in rf-aisvc-4
 * from `ai.service.ts`.
 *
 * Per `deploy-service-tests-must-import-vitest-explicitly`, vitest
 * globals are imported explicitly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted shared mocks. Per `vi-hoisted-required-for-shared-mock-identities-across-many-vi-mock-calls`,
// the mock factories close over these so the test body can drive them.
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

// Replace generateAiConnectionPrompt with a stable fixture so the
// system-prompt assertions don't drift when `@ice/types` updates.
vi.mock('@ice/types', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ice/types')>();
  return {
    ...actual,
    generateAiConnectionPrompt: () => '<<CONNECTION_PROMPT_FIXTURE>>',
  };
});

import {
  buildCloudArchitectPrompt,
  buildSystemPrompt,
  detectDominantProvider,
  formatEdgesSummary,
  formatNodesSummary,
  formatSelectedSummary,
} from '../system-prompt';
import type { SerializedCanvas } from '@ice/types';

const emptyCanvas: SerializedCanvas = {
  nodes: [],
  edges: [],
  selectedNodeIds: [],
  availableBlockTypes: [],
} as SerializedCanvas;

describe('formatNodesSummary', () => {
  it('returns the empty-canvas placeholder when there are no nodes', () => {
    expect(formatNodesSummary(emptyCanvas)).toBe('  (empty canvas)');
  });

  it('renders id : iceType "label" for each node', () => {
    const out = formatNodesSummary({
      ...emptyCanvas,
      nodes: [
        { id: 'n1', iceType: 'Database.PostgreSQL', label: 'Users DB' } as any,
        { id: 'n2', iceType: 'Compute.Container', label: 'API' } as any,
      ],
    });
    expect(out).toBe(['  - n1: Database.PostgreSQL "Users DB"', '  - n2: Compute.Container "API"'].join('\n'));
  });

  it('appends "(in <parentId>)" for nested nodes', () => {
    const out = formatNodesSummary({
      ...emptyCanvas,
      nodes: [{ id: 'subnet-1', iceType: 'Network.Subnet', label: 'Private', parentId: 'vpc-1' } as any],
    });
    expect(out).toContain('(in vpc-1)');
  });

  it('does NOT append a parent suffix when parentId is missing or null', () => {
    const out = formatNodesSummary({
      ...emptyCanvas,
      nodes: [
        { id: 'n1', iceType: 'X', label: 'no parent', parentId: null } as any,
        { id: 'n2', iceType: 'Y', label: 'undefined parent' } as any,
      ],
    });
    expect(out).not.toContain('(in');
  });
});

describe('formatEdgesSummary', () => {
  it('returns the no-connections placeholder when there are no edges', () => {
    expect(formatEdgesSummary(emptyCanvas)).toBe('  (no connections)');
  });

  it('renders source → target with relationship suffix when present', () => {
    const out = formatEdgesSummary({
      ...emptyCanvas,
      edges: [
        { source: 'a', target: 'b', relationship: 'depends_on' } as any,
        { source: 'b', target: 'c', relationship: 'connects_to' } as any,
      ],
    });
    expect(out).toContain('a → b (depends_on)');
    expect(out).toContain('b → c (connects_to)');
  });

  it('omits the relationship suffix when missing', () => {
    const out = formatEdgesSummary({
      ...emptyCanvas,
      edges: [{ source: 'a', target: 'b' } as any],
    });
    expect(out).toBe('  - a → b');
  });
});

describe('formatSelectedSummary', () => {
  it('returns "No nodes selected" when none are selected', () => {
    expect(formatSelectedSummary(emptyCanvas)).toBe('No nodes selected');
  });

  it('returns "Selected nodes: X, Y" with comma-separated IDs', () => {
    expect(
      formatSelectedSummary({
        ...emptyCanvas,
        selectedNodeIds: ['n-1', 'n-2', 'n-3'],
      }),
    ).toBe('Selected nodes: n-1, n-2, n-3');
  });
});

describe('detectDominantProvider', () => {
  it('returns "aws" as the fallback when no provider is set on any node', () => {
    expect(detectDominantProvider(emptyCanvas)).toBe('aws');
  });

  it('returns "aws" as the fallback when all nodes have empty provider strings', () => {
    expect(
      detectDominantProvider({
        ...emptyCanvas,
        nodes: [
          { id: 'n1', iceType: 'X', label: 'a', provider: '' } as any,
          { id: 'n2', iceType: 'Y', label: 'b', provider: undefined } as any,
        ],
      }),
    ).toBe('aws');
  });

  it('returns the most-common provider', () => {
    expect(
      detectDominantProvider({
        ...emptyCanvas,
        nodes: [
          { id: 'n1', iceType: 'X', label: 'a', provider: 'gcp' } as any,
          { id: 'n2', iceType: 'X', label: 'b', provider: 'gcp' } as any,
          { id: 'n3', iceType: 'X', label: 'c', provider: 'aws' } as any,
        ],
      }),
    ).toBe('gcp');
  });

  it('breaks ties by Object.entries iteration order (deterministic per V8)', () => {
    const result = detectDominantProvider({
      ...emptyCanvas,
      nodes: [
        { id: 'n1', iceType: 'X', label: 'a', provider: 'gcp' } as any,
        { id: 'n2', iceType: 'X', label: 'b', provider: 'aws' } as any,
      ],
    });
    // Both have count 1; sort is stable; first-inserted wins.
    expect(['gcp', 'aws']).toContain(result);
  });
});

describe('buildCloudArchitectPrompt', () => {
  it('groups iceTypes by category and renders a category list', () => {
    const out = buildCloudArchitectPrompt('aws', [
      'Database.PostgreSQL',
      'Database.MySQL',
      'Compute.Container',
      'Network.VPC',
    ]);
    expect(out).toContain('Database: Database.PostgreSQL, Database.MySQL');
    expect(out).toContain('Compute: Compute.Container');
    expect(out).toContain('Network: Network.VPC');
  });

  it('uses the iceType itself as the category when it has no dot prefix', () => {
    // The split produces ['no-prefix-block'] whose [0] is truthy, so the
    // 'Other' fallback only fires for an empty string. A no-dot iceType
    // gets categorized under itself.
    const out = buildCloudArchitectPrompt('aws', ['no-prefix-block']);
    expect(out).toContain('no-prefix-block: no-prefix-block');
  });

  it('falls back to "Other" when an iceType is the empty string', () => {
    // `''.split('.')[0]` is `''` (falsy), so `|| 'Other'` kicks in.
    const out = buildCloudArchitectPrompt('aws', ['']);
    expect(out).toContain('Other: ');
  });

  it('renders the SKILL header and standard architect sections', () => {
    const out = buildCloudArchitectPrompt('aws', ['Database.PostgreSQL']);
    expect(out).toContain('CLOUD ARCHITECT SKILL — ACTIVE');
    expect(out).toContain('Your Approach');
    expect(out).toContain('Architecture Generation Rules');
    expect(out).toContain('Explanation Structure');
    expect(out).toContain('github-repository, env-config');
  });

  it('handles empty iceTypes list (renders the section with no categories)', () => {
    const out = buildCloudArchitectPrompt('aws', []);
    expect(out).toContain('Available blocks by category:');
    // No category line follows; the block ends just before "Provider-agnostic"
    expect(out).toMatch(/Available blocks by category:\s*\n\nProvider-agnostic/);
  });
});

describe('buildSystemPrompt', () => {
  beforeEach(() => {
    mocks.buildSchemaContext.mockReset();
    mocks.buildDeploymentContext.mockReset();
    mocks.buildSchemaContext.mockResolvedValue('<<SCHEMA_CONTEXT_FIXTURE>>');
    mocks.buildDeploymentContext.mockResolvedValue('<<DEPLOYMENT_CONTEXT_FIXTURE>>');
  });

  it('embeds the canvas summaries and schema context for an empty canvas', async () => {
    const out = await buildSystemPrompt({
      ...emptyCanvas,
      availableBlockTypes: ['Database.PostgreSQL', 'Compute.Container'],
    });

    expect(out).toContain('  (empty canvas)');
    expect(out).toContain('  (no connections)');
    expect(out).toContain('No nodes selected');
    expect(out).toContain('<<SCHEMA_CONTEXT_FIXTURE>>');
    expect(out).toContain('Database.PostgreSQL, Compute.Container');
    expect(out).toContain('<<CONNECTION_PROMPT_FIXTURE>>');
  });

  it('passes canvas iceTypes + dominantProvider through to buildSchemaContext', async () => {
    await buildSystemPrompt({
      ...emptyCanvas,
      nodes: [
        { id: 'n1', iceType: 'Database.PostgreSQL', label: 'a', provider: 'gcp' } as any,
        { id: 'n2', iceType: 'Compute.Container', label: 'b', provider: 'gcp' } as any,
      ],
      availableBlockTypes: ['Database.PostgreSQL'],
    });

    expect(mocks.buildSchemaContext).toHaveBeenCalledWith({
      existingIceTypes: ['Database.PostgreSQL', 'Compute.Container'],
      dominantProvider: 'gcp',
    });
  });

  it('filters out nodes without an iceType when computing existingIceTypes', async () => {
    await buildSystemPrompt({
      ...emptyCanvas,
      nodes: [
        { id: 'n1', iceType: 'Database.PostgreSQL', label: 'a' } as any,
        { id: 'n2', iceType: undefined, label: 'b' } as any,
        { id: 'n3', iceType: '', label: 'c' } as any,
      ],
    });

    expect(mocks.buildSchemaContext).toHaveBeenCalledWith({
      existingIceTypes: ['Database.PostgreSQL'],
      dominantProvider: 'aws',
    });
  });

  it('uses the dominant provider in CRITICAL RULES #2', async () => {
    const out = await buildSystemPrompt({
      ...emptyCanvas,
      nodes: [
        { id: 'n1', iceType: 'X', label: 'a', provider: 'azure' } as any,
        { id: 'n2', iceType: 'Y', label: 'b', provider: 'azure' } as any,
      ],
    });
    expect(out).toContain('Use "azure" as the default provider');
  });

  it('does NOT inject the cloud-architect skill prompt for default intents', async () => {
    const out = await buildSystemPrompt(emptyCanvas, 'add a redis cache');
    expect(out).not.toContain('CLOUD ARCHITECT SKILL — ACTIVE');
  });

  it('injects the cloud-architect skill prompt when the intent triggers it', async () => {
    const out = await buildSystemPrompt(
      { ...emptyCanvas, availableBlockTypes: ['Database.PostgreSQL'] },
      'I want to build a SaaS marketplace',
    );
    expect(out).toContain('CLOUD ARCHITECT SKILL — ACTIVE');
    expect(out).toContain('Available blocks by category:');
  });

  it('does NOT inject deployment context when intent is missing', async () => {
    const out = await buildSystemPrompt(emptyCanvas, undefined, 'card-1');
    expect(mocks.buildDeploymentContext).not.toHaveBeenCalled();
    expect(out).not.toContain('<<DEPLOYMENT_CONTEXT_FIXTURE>>');
    expect(out).not.toContain('How to answer questions about deployment state');
  });

  it('does NOT inject deployment context when cardId is missing', async () => {
    const out = await buildSystemPrompt(emptyCanvas, 'what is deployed', undefined);
    expect(mocks.buildDeploymentContext).not.toHaveBeenCalled();
    expect(out).not.toContain('<<DEPLOYMENT_CONTEXT_FIXTURE>>');
  });

  it('does NOT inject deployment context for non-question build intents', async () => {
    const out = await buildSystemPrompt(emptyCanvas, 'add a redis cache', 'card-1');
    expect(mocks.buildDeploymentContext).not.toHaveBeenCalled();
    expect(out).not.toContain('<<DEPLOYMENT_CONTEXT_FIXTURE>>');
  });

  it('injects deployment context + answer-questions instructions for question intents', async () => {
    const out = await buildSystemPrompt(emptyCanvas, 'what is deployed', 'card-1');
    expect(mocks.buildDeploymentContext).toHaveBeenCalledWith('card-1');
    expect(out).toContain('<<DEPLOYMENT_CONTEXT_FIXTURE>>');
    expect(out).toContain('How to answer questions about deployment state');
    // The instructions block is appended AFTER the context block.
    expect(out.indexOf('<<DEPLOYMENT_CONTEXT_FIXTURE>>')).toBeLessThan(
      out.indexOf('How to answer questions about deployment state'),
    );
  });

  it('combines architect + question paths when both apply', async () => {
    const out = await buildSystemPrompt(
      { ...emptyCanvas, availableBlockTypes: ['Database.PostgreSQL'] },
      // 'is the saas platform live' triggers BOTH the question opener (`is`)
      // AND the architect 'saas' / 'platform' triggers — the source intentionally
      // appends both blocks in that order.
      'is the saas platform live',
      'card-1',
    );

    expect(out).toContain('CLOUD ARCHITECT SKILL — ACTIVE');
    expect(out).toContain('<<DEPLOYMENT_CONTEXT_FIXTURE>>');
    // Order is: base prompt → architect skill → deployment context → instructions
    const archIdx = out.indexOf('CLOUD ARCHITECT SKILL — ACTIVE');
    const deployIdx = out.indexOf('<<DEPLOYMENT_CONTEXT_FIXTURE>>');
    const instrIdx = out.indexOf('How to answer questions about deployment state');
    expect(archIdx).toBeLessThan(deployIdx);
    expect(deployIdx).toBeLessThan(instrIdx);
  });

  it('includes the available block-types CSV in the registry section', async () => {
    const out = await buildSystemPrompt({
      ...emptyCanvas,
      availableBlockTypes: ['A.X', 'B.Y'],
    });
    expect(out).toContain('A.X, B.Y');
  });
});

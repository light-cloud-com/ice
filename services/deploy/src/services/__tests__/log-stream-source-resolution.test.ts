/**
 * Unit tests for `services/deploy/src/services/log-stream/source-resolution.ts`.
 *
 * Scope: only the resolveSource function. The orchestrator-level
 * subscribe()/unsubscribe() integration that ties source resolution
 * to stream open/teardown lives in log-stream.service.test.ts; the
 * cases here pin the pure resolver-level branches:
 *   - candidateSources path (skips the Prisma nodes/edges read)
 *   - Prisma fallback path (reads card.nodes / card.edges)
 *   - tiebreaker (override / single / multi / none)
 *   - mapping lookup → pre-deploy vs resolved
 *   - credential-missing → permission-denied
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    canvasCard: { findUnique: vi.fn() },
    environment: { findUnique: vi.fn() },
    deployedResourceMapping: { findFirst: vi.fn() },
  },
  credentials: { getDecryptedCredentials: vi.fn() },
}));

vi.mock('@ice/db', () => ({ default: mocks.prisma }));
vi.mock('@ice/service-credentials', () => mocks.credentials);

const prismaMock = mocks.prisma;
const credentialsMock = mocks.credentials;

import { resolveSource } from '../log-stream/source-resolution.js';

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.canvasCard.findUnique.mockResolvedValue(null);
  prismaMock.environment.findUnique.mockResolvedValue(null);
  prismaMock.deployedResourceMapping.findFirst.mockResolvedValue(null);
  credentialsMock.getDecryptedCredentials.mockResolvedValue(null);
});

const baseArgs = {
  cardId: 'card-1',
  environmentId: 'env-1',
  terminalNodeId: 'log-1',
  mode: 'polling' as const,
  organisationId: 'org-1',
};

describe('resolveSource — candidateSources path', () => {
  it('returns pre-deploy from candidates when no mapping row exists', async () => {
    prismaMock.environment.findUnique.mockResolvedValue({ type: 'production', region: 'us-central1' });
    const result = await resolveSource({
      ...baseArgs,
      candidateSources: [{ nodeId: 'src-1', iceType: 'Compute.Container', label: 'API' }],
    });
    expect(result.state).toBe('pre-deploy');
    if (result.state === 'pre-deploy') {
      expect(result.sourceNodeId).toBe('src-1');
      expect(result.iceType).toBe('Compute.Container');
    }
    // No nodes/edges read because the candidates path skips it.
    expect(prismaMock.canvasCard.findUnique).not.toHaveBeenCalled();
  });

  it('drops candidates with unsupported iceTypes silently', async () => {
    const result = await resolveSource({
      ...baseArgs,
      candidateSources: [
        { nodeId: 'bad', iceType: 'Notion.Page' }, // not a supported source
      ],
    });
    expect(result.state).toBe('none');
  });

  it('returns ambiguous when multiple candidates pass the probe', async () => {
    const result = await resolveSource({
      ...baseArgs,
      candidateSources: [
        { nodeId: 'a', iceType: 'Compute.Container' },
        { nodeId: 'b', iceType: 'Compute.Container' },
      ],
    });
    expect(result.state).toBe('ambiguous');
    if (result.state === 'ambiguous') expect(result.candidates).toHaveLength(2);
  });

  it('returns none when override is set but missing in candidates and no raw nodes', async () => {
    const result = await resolveSource({
      ...baseArgs,
      sourceNodeIdOverride: 'gone',
      candidateSources: [{ nodeId: 'src-1', iceType: 'Compute.Container' }],
    });
    expect(result.state).toBe('none');
  });

  it('returns resolved with caveats when mapping + credentials are present', async () => {
    prismaMock.environment.findUnique.mockResolvedValue({ type: 'production', region: 'us-central1' });
    prismaMock.deployedResourceMapping.findFirst.mockResolvedValue({
      resource_name: 'api-server',
      resource_type: 'gcp.run.service',
      provider_id: 'p1',
    });
    credentialsMock.getDecryptedCredentials.mockResolvedValue({
      project_id: 'proj-1',
      client_email: 'sa@x',
      private_key: '-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----\n',
    });
    const result = await resolveSource({
      ...baseArgs,
      candidateSources: [{ nodeId: 'src-1', iceType: 'Compute.Container' }],
    });
    expect(result.state).toBe('resolved');
    if (result.state === 'resolved') {
      expect(result.sourceNodeId).toBe('src-1');
      expect(result.iceType).toBe('Compute.Container');
    }
  });

  it('returns permission-denied when no credentials are available', async () => {
    prismaMock.environment.findUnique.mockResolvedValue({ type: 'production', region: 'us-central1' });
    prismaMock.deployedResourceMapping.findFirst.mockResolvedValue({
      resource_name: 'api-server',
      resource_type: 'gcp.run.service',
      provider_id: 'p1',
    });
    credentialsMock.getDecryptedCredentials.mockResolvedValue(null);
    const result = await resolveSource({
      ...baseArgs,
      candidateSources: [{ nodeId: 'src-1', iceType: 'Compute.Container' }],
    });
    expect(result.state).toBe('permission-denied');
  });
});

describe('resolveSource — Prisma fallback path', () => {
  it('returns none when the card row is missing', async () => {
    prismaMock.canvasCard.findUnique.mockResolvedValue(null);
    const result = await resolveSource(baseArgs);
    expect(result.state).toBe('none');
  });

  it('returns unsupported-source when override points at a non-supported node', async () => {
    prismaMock.canvasCard.findUnique.mockResolvedValue({
      nodes: [
        { id: 'log-1', type: 'resource', data: { iceType: 'Monitoring.Log' } },
        { id: 'bad', type: 'resource', data: { iceType: 'Unknown.Thing' } },
      ],
      edges: [],
      project_id: 'p1',
    });
    const result = await resolveSource({
      ...baseArgs,
      sourceNodeIdOverride: 'bad',
    });
    expect(result.state).toBe('unsupported-source');
    if (result.state === 'unsupported-source') {
      expect(result.sourceNodeId).toBe('bad');
      expect(result.iceType).toBe('Unknown.Thing');
    }
  });

  it('returns none when zero supported inbound edges and no override', async () => {
    prismaMock.canvasCard.findUnique.mockResolvedValue({
      nodes: [{ id: 'log-1', type: 'resource', data: { iceType: 'Monitoring.Log' } }],
      edges: [],
      project_id: 'p1',
    });
    const result = await resolveSource(baseArgs);
    expect(result.state).toBe('none');
  });

  it('returns none when override is set but the node is missing from the card', async () => {
    prismaMock.canvasCard.findUnique.mockResolvedValue({
      nodes: [{ id: 'log-1', type: 'resource', data: { iceType: 'Monitoring.Log' } }],
      edges: [],
      project_id: 'p1',
    });
    const result = await resolveSource({
      ...baseArgs,
      sourceNodeIdOverride: 'never-existed',
    });
    expect(result.state).toBe('none');
  });

  it('skips the Prisma read when candidateSources is empty array (still uses fallback)', async () => {
    // candidateSources: [] should fall through to the Prisma read,
    // matching the older-clients behavior in the inline source comment.
    prismaMock.canvasCard.findUnique.mockResolvedValue({
      nodes: [
        { id: 'log-1', type: 'resource', data: { iceType: 'Monitoring.Log' } },
        { id: 'src-1', type: 'resource', data: { iceType: 'Compute.Container' } },
      ],
      edges: [{ source: 'src-1', target: 'log-1' }],
      project_id: 'p1',
    });
    prismaMock.environment.findUnique.mockResolvedValue({ type: 'production', region: 'us-central1' });
    prismaMock.deployedResourceMapping.findFirst.mockResolvedValue(null);
    const result = await resolveSource({ ...baseArgs, candidateSources: [] });
    expect(result.state).toBe('pre-deploy');
    expect(prismaMock.canvasCard.findUnique).toHaveBeenCalled();
  });
});

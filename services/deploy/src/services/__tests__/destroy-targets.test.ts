/**
 * Unit tests for `services/deploy/src/services/destroy-targets.ts` —
 * the destroy-all helpers extracted in rf-deploy-11.
 *
 * Per the `deploy-service-tests-must-import-vitest-explicitly` learning,
 * vitest globals are imported explicitly so the deploy package's
 * typecheck pass stays green.
 *
 * The behavior contracts being asserted (no behavior change vs.
 * pre-extraction in `destroyAllForCard`):
 *   1. Mapping-table precedence on `${type}::${name}` collision —
 *      mapping-table `node_id` survives, historical `source_node_id` is
 *      ignored on the duplicate key.
 *   2. The status filter is `['success', 'partial', 'failed']` and
 *      `results: { not: null }` and `orderBy: { created_at: 'desc' }`.
 *   3. The order priority numbers (1–7, default 50) and their
 *      includes-substring matches stay verbatim.
 *   4. The 3-tier GCP project priority (options → credentials.project_id
 *      → first-target's `providerId` regex extract) returns `null` only
 *      when nothing matches.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@ice/db', () => ({
  default: {
    deployedResourceMapping: {
      findMany: vi.fn(),
    },
    canvasDeployment: {
      findMany: vi.fn(),
    },
  },
}));

import {
  collectDestroyAllTargets,
  orderTargetsForDelete,
  resolveDestroyAllProject,
  type DestroyTarget,
} from '../destroy-targets.js';
// @ts-ignore — resolved at runtime via pnpm workspace; mocked above
import prismaModule from '@ice/db';

const mappingFindMany = (prismaModule as any).deployedResourceMapping.findMany as ReturnType<
  typeof vi.fn
>;
const deploymentFindMany = (prismaModule as any).canvasDeployment.findMany as ReturnType<
  typeof vi.fn
>;

describe('collectDestroyAllTargets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an empty Map + null latestRow when both queries return empty', async () => {
    mappingFindMany.mockResolvedValueOnce([]);
    deploymentFindMany.mockResolvedValueOnce([]);

    const { targets, latestRow } = await collectDestroyAllTargets('card-1');

    expect(targets.size).toBe(0);
    expect(latestRow).toBeNull();
  });

  it('builds the Map keyed by ${type}::${name} from the mapping table when historical is empty', async () => {
    mappingFindMany.mockResolvedValueOnce([
      {
        resource_type: 'gcp.storage.bucket',
        resource_name: 'ice-foo-prod-bucket-aaa',
        provider_id: 'gs://ice-foo-prod-bucket-aaa',
        environment: 'production',
        node_id: 'canvas-node-bucket-1',
      },
    ]);
    deploymentFindMany.mockResolvedValueOnce([]);

    const { targets, latestRow } = await collectDestroyAllTargets('card-1');

    expect(targets.size).toBe(1);
    expect(targets.get('gcp.storage.bucket::ice-foo-prod-bucket-aaa')).toEqual({
      type: 'gcp.storage.bucket',
      name: 'ice-foo-prod-bucket-aaa',
      providerId: 'gs://ice-foo-prod-bucket-aaa',
      environment: 'production',
      nodeId: 'canvas-node-bucket-1',
    });
    expect(latestRow).toBeNull();
  });

  it('handles mapping rows whose provider_id is null (becomes undefined on the target)', async () => {
    mappingFindMany.mockResolvedValueOnce([
      {
        resource_type: 'gcp.compute.url-map',
        resource_name: 'ice-foo-prod-um-aaa',
        provider_id: null,
        environment: 'production',
        node_id: 'canvas-node-um-1',
      },
    ]);
    deploymentFindMany.mockResolvedValueOnce([]);

    const { targets } = await collectDestroyAllTargets('card-1');

    const t = targets.get('gcp.compute.url-map::ice-foo-prod-um-aaa');
    expect(t?.providerId).toBeUndefined();
  });

  it('builds the Map from historical deploys when the mapping table is empty + latestRow is the most-recent row', async () => {
    mappingFindMany.mockResolvedValueOnce([]);
    const newest = {
      id: 'd-newest',
      region: 'us-central1',
      environment: 'production',
      provider: 'gcp',
      created_at: new Date('2026-04-29T12:00:00Z'),
      results: {
        resources: [
          {
            type: 'gcp.compute.backend-service',
            name: 'ice-foo-prod-bs-aaa',
            provider_id: 'projects/lc-ice/global/backendServices/ice-foo-prod-bs-aaa',
            source_node_id: 'canvas-node-bs-1',
          },
        ],
      },
    };
    const older = {
      id: 'd-older',
      region: 'us-east1',
      environment: 'production',
      provider: 'gcp',
      created_at: new Date('2026-04-28T12:00:00Z'),
      results: {
        resources: [
          {
            type: 'gcp.compute.url-map',
            name: 'ice-foo-prod-um-aaa',
            provider_id: 'projects/lc-ice/global/urlMaps/ice-foo-prod-um-aaa',
            source_node_id: 'canvas-node-um-1',
          },
        ],
      },
    };
    deploymentFindMany.mockResolvedValueOnce([newest, older]); // most-recent-first per orderBy

    const { targets, latestRow } = await collectDestroyAllTargets('card-1');

    expect(targets.size).toBe(2);
    expect(targets.get('gcp.compute.backend-service::ice-foo-prod-bs-aaa')).toEqual({
      type: 'gcp.compute.backend-service',
      name: 'ice-foo-prod-bs-aaa',
      providerId: 'projects/lc-ice/global/backendServices/ice-foo-prod-bs-aaa',
      region: 'us-central1',
      environment: 'production',
      nodeId: 'canvas-node-bs-1',
    });
    expect(latestRow).toEqual(newest);
  });

  it('mapping-table entries take precedence over historical on the same ${type}::${name} key', async () => {
    // Both sources have the SAME (type, name) pair. Mapping-table wins.
    mappingFindMany.mockResolvedValueOnce([
      {
        resource_type: 'gcp.compute.backend-service',
        resource_name: 'shared-bs',
        provider_id: 'projects/proj-mapping/global/backendServices/shared-bs',
        environment: 'production',
        node_id: 'canvas-node-FROM-MAPPING',
      },
    ]);
    deploymentFindMany.mockResolvedValueOnce([
      {
        id: 'd-1',
        region: 'us-central1',
        environment: 'staging', // different env — would lose if we picked historical
        provider: 'gcp',
        created_at: new Date('2026-04-29T12:00:00Z'),
        results: {
          resources: [
            {
              type: 'gcp.compute.backend-service',
              name: 'shared-bs',
              provider_id: 'projects/proj-historical/global/backendServices/shared-bs',
              source_node_id: 'canvas-node-FROM-HISTORICAL',
            },
          ],
        },
      },
    ]);

    const { targets } = await collectDestroyAllTargets('card-1');

    const t = targets.get('gcp.compute.backend-service::shared-bs');
    expect(t?.nodeId).toBe('canvas-node-FROM-MAPPING');
    expect(t?.providerId).toBe('projects/proj-mapping/global/backendServices/shared-bs');
    // The mapping-table row's `environment` survives, NOT the historical row's.
    expect(t?.environment).toBe('production');
  });

  it('skips historical resources that lack a `name` or `type`', async () => {
    mappingFindMany.mockResolvedValueOnce([]);
    deploymentFindMany.mockResolvedValueOnce([
      {
        id: 'd-1',
        region: 'us-central1',
        environment: 'production',
        provider: 'gcp',
        created_at: new Date('2026-04-29T12:00:00Z'),
        results: {
          resources: [
            { type: 'gcp.storage.bucket' /* no name */ },
            { name: 'orphaned' /* no type */ },
            null, // pathological row
            undefined, // pathological row
            {
              type: 'gcp.storage.bucket',
              name: 'valid',
              provider_id: 'gs://valid',
              source_node_id: 'canvas-node-valid',
            },
          ],
        },
      },
    ]);

    const { targets } = await collectDestroyAllTargets('card-1');

    expect(targets.size).toBe(1);
    expect(targets.get('gcp.storage.bucket::valid')).toBeDefined();
  });

  it('handles historical rows with missing `results.resources` and missing `results` arrays gracefully', async () => {
    mappingFindMany.mockResolvedValueOnce([]);
    deploymentFindMany.mockResolvedValueOnce([
      {
        id: 'd-1',
        region: 'us-central1',
        environment: 'production',
        provider: 'gcp',
        created_at: new Date('2026-04-29T12:00:00Z'),
        results: {}, // results envelope but no resources field
      },
      {
        id: 'd-2',
        region: 'us-central1',
        environment: 'production',
        provider: 'gcp',
        created_at: new Date('2026-04-28T12:00:00Z'),
        results: { resources: null }, // explicit null
      },
    ]);

    const { targets, latestRow } = await collectDestroyAllTargets('card-1');

    expect(targets.size).toBe(0);
    // latestRow is still the most-recent qualifying row regardless of empty resources.
    expect(latestRow?.id).toBe('d-1');
  });

  it('forwards the where clause + orderBy + status/results filters verbatim to prisma', async () => {
    mappingFindMany.mockResolvedValueOnce([]);
    deploymentFindMany.mockResolvedValueOnce([]);

    await collectDestroyAllTargets('card-xyz');

    expect(mappingFindMany).toHaveBeenCalledTimes(1);
    expect(mappingFindMany).toHaveBeenCalledWith({ where: { card_id: 'card-xyz' } });

    expect(deploymentFindMany).toHaveBeenCalledTimes(1);
    expect(deploymentFindMany).toHaveBeenCalledWith({
      where: {
        card_id: 'card-xyz',
        status: { in: ['success', 'partial', 'failed'] },
        results: { not: null },
      },
      orderBy: { created_at: 'desc' },
    });
  });

  it('latestRow is the FIRST historical row (most-recent per orderBy desc), proving the orderBy works', async () => {
    mappingFindMany.mockResolvedValueOnce([]);
    const newest = {
      id: 'd-newest',
      region: 'us-central1',
      environment: 'production',
      provider: 'gcp',
      created_at: new Date('2026-04-29T12:00:00Z'),
      results: { resources: [] },
    };
    const older1 = {
      id: 'd-older1',
      region: 'us-east1',
      environment: 'production',
      provider: 'aws',
      created_at: new Date('2026-04-28T12:00:00Z'),
      results: { resources: [] },
    };
    const older2 = {
      id: 'd-older2',
      region: 'eu-west1',
      environment: 'production',
      provider: 'azure',
      created_at: new Date('2026-04-27T12:00:00Z'),
      results: { resources: [] },
    };
    deploymentFindMany.mockResolvedValueOnce([newest, older1, older2]);

    const { latestRow } = await collectDestroyAllTargets('card-1');

    expect(latestRow?.id).toBe('d-newest');
    expect(latestRow?.provider).toBe('gcp');
  });

  it('coerces a historical row with `region: null` into target `region: undefined`', async () => {
    mappingFindMany.mockResolvedValueOnce([]);
    deploymentFindMany.mockResolvedValueOnce([
      {
        id: 'd-1',
        region: null,
        environment: 'production',
        provider: 'gcp',
        created_at: new Date('2026-04-29T12:00:00Z'),
        results: {
          resources: [
            {
              type: 'gcp.storage.bucket',
              name: 'b1',
              provider_id: 'gs://b1',
              source_node_id: 'canvas-node-b1',
            },
          ],
        },
      },
    ]);

    const { targets } = await collectDestroyAllTargets('card-1');

    expect(targets.get('gcp.storage.bucket::b1')?.region).toBeUndefined();
  });
});

describe('orderTargetsForDelete', () => {
  it('sorts by priority: globalForwardingRule(1) → targetHttpsProxy/targetHttpProxy(2) → urlMap(3) → backendBucket(4) → backendService(5) → storage.bucket(6) → managedSslCertificate/sslCertificate(7) → default(50)', () => {
    const targets = [
      { type: 'gcp.storage.bucket' },
      { type: 'gcp.compute.url-map-and-urlMap' }, // includes urlMap → 3
      { type: 'globalForwardingRule' },
      { type: 'gcp.compute.targetHttpsProxy' },
      { type: 'gcp.compute.managedSslCertificate' },
      { type: 'gcp.compute.backendBucket' },
      { type: 'gcp.compute.backendService' },
      { type: 'random-default' },
      { type: 'gcp.compute.targetHttpProxy' },
      { type: 'gcp.compute.sslCertificate' },
    ];

    const ordered = orderTargetsForDelete(targets);

    expect(ordered.map((t) => t.type)).toEqual([
      'globalForwardingRule', // 1
      'gcp.compute.targetHttpsProxy', // 2
      'gcp.compute.targetHttpProxy', // 2
      'gcp.compute.url-map-and-urlMap', // 3
      'gcp.compute.backendBucket', // 4
      'gcp.compute.backendService', // 5
      'gcp.storage.bucket', // 6
      'gcp.compute.managedSslCertificate', // 7
      'gcp.compute.sslCertificate', // 7
      'random-default', // 50
    ]);
  });

  it('does not mutate the input array', () => {
    const input = [
      { type: 'gcp.storage.bucket' },
      { type: 'globalForwardingRule' },
    ];
    const inputCopy = input.slice();

    orderTargetsForDelete(input);

    expect(input).toEqual(inputCopy);
  });

  it('returns an empty array when given an empty array', () => {
    expect(orderTargetsForDelete([])).toEqual([]);
  });

  it('is generic over richer record shapes — extra fields round-trip', () => {
    type Rich = { type: string; name: string; nodeId: string; providerId: string };
    const input: Rich[] = [
      { type: 'gcp.storage.bucket', name: 'b1', nodeId: 'n1', providerId: 'gs://b1' },
      { type: 'globalForwardingRule', name: 'fr1', nodeId: 'n2', providerId: 'p://fr1' },
    ];

    const ordered = orderTargetsForDelete(input);

    expect(ordered[0]).toEqual({
      type: 'globalForwardingRule',
      name: 'fr1',
      nodeId: 'n2',
      providerId: 'p://fr1',
    });
    expect(ordered[1]).toEqual({
      type: 'gcp.storage.bucket',
      name: 'b1',
      nodeId: 'n1',
      providerId: 'gs://b1',
    });
  });

  it('returns a single-element array unchanged', () => {
    const single = [{ type: 'random' }];
    expect(orderTargetsForDelete(single)).toEqual(single);
    // But not the same reference — the function copies.
    expect(orderTargetsForDelete(single)).not.toBe(single);
  });

  it('priority 7 covers BOTH managedSslCertificate AND sslCertificate (the substring includes-match means managedSslCertificate also matches sslCertificate, but both share the same priority)', () => {
    const targets = [
      { type: 'sslCertificate' },
      { type: 'managedSslCertificate' },
    ];
    const ordered = orderTargetsForDelete(targets);
    // Both end up at priority 7 — relative order preserved by Array.prototype.sort
    // when comparator returns 0.
    expect(ordered.map((t) => t.type)).toEqual(['sslCertificate', 'managedSslCertificate']);
  });

  it('priority 2 covers BOTH targetHttpsProxy AND targetHttpProxy', () => {
    const targets = [
      { type: 'targetHttpProxy' },
      { type: 'targetHttpsProxy' },
    ];
    const ordered = orderTargetsForDelete(targets);
    expect(ordered.map((t) => t.type)).toEqual(['targetHttpProxy', 'targetHttpsProxy']);
  });
});

describe('resolveDestroyAllProject', () => {
  it('returns options.gcpProject when set (priority 1, beats credentials.project_id)', () => {
    const result = resolveDestroyAllProject({
      options: { gcpProject: 'project-from-options' },
      credentials: { project_id: 'project-from-credentials' },
      targets: [
        { type: 't', name: 'n', providerId: 'projects/project-from-target/global/foo/bar' },
      ],
    });
    expect(result).toBe('project-from-options');
  });

  it('falls through to credentials.project_id when options is empty (priority 2)', () => {
    const result = resolveDestroyAllProject({
      options: {},
      credentials: { project_id: 'project-from-credentials' },
      targets: [
        { type: 't', name: 'n', providerId: 'projects/project-from-target/global/foo/bar' },
      ],
    });
    expect(result).toBe('project-from-credentials');
  });

  it('falls through to target.providerId regex extract when both options and credentials are empty (priority 3)', () => {
    const result = resolveDestroyAllProject({
      options: {},
      credentials: { project_id: '' },
      targets: [
        { type: 't', name: 'n', providerId: 'projects/project-from-target/global/foo/bar' },
      ],
    });
    expect(result).toBe('project-from-target');
  });

  it('returns null when nothing resolves', () => {
    const result = resolveDestroyAllProject({
      options: {},
      credentials: { project_id: '' },
      targets: [
        { type: 't', name: 'n' /* no providerId */ },
        { type: 't2', name: 'n2', providerId: 'not-a-projects-prefix' },
      ],
    });
    expect(result).toBeNull();
  });

  it('returns null when credentials is null', () => {
    const result = resolveDestroyAllProject({
      options: {},
      credentials: null,
      targets: [],
    });
    expect(result).toBeNull();
  });

  it('returns null when credentials is undefined', () => {
    const result = resolveDestroyAllProject({
      options: {},
      credentials: undefined,
      targets: [],
    });
    expect(result).toBeNull();
  });

  it('matches the `projects/<name>/...` shape — first hit wins, even if a later target has a richer projectId', () => {
    const result = resolveDestroyAllProject({
      options: {},
      credentials: { project_id: '' },
      targets: [
        { type: 't1', name: 'n1', providerId: 'projects/first-hit/global/sslCertificates/foo' },
        { type: 't2', name: 'n2', providerId: 'projects/second-hit/global/urlMaps/bar' },
      ],
    });
    expect(result).toBe('first-hit');
  });

  it('skips targets without a providerId during the regex scan', () => {
    const result = resolveDestroyAllProject({
      options: {},
      credentials: { project_id: '' },
      targets: [
        { type: 't1', name: 'n1' /* no providerId */ },
        { type: 't2', name: 'n2', providerId: '' },
        { type: 't3', name: 'n3', providerId: 'projects/found-it/global/foo/bar' },
      ],
    });
    expect(result).toBe('found-it');
  });

  it('only matches the prefix anchor (^projects/) — a substring match in the middle is not accepted', () => {
    const result = resolveDestroyAllProject({
      options: {},
      credentials: { project_id: '' },
      targets: [
        { type: 't1', name: 'n1', providerId: 'gs://foo/projects/inside/bar' },
      ],
    });
    expect(result).toBeNull();
  });

  it('accepts an Iterable (e.g. Map.values()) as the targets argument', () => {
    const targets = new Map<string, DestroyTarget>();
    targets.set('a', {
      type: 't',
      name: 'n',
      providerId: 'projects/from-iterable/global/foo/bar',
    });
    const result = resolveDestroyAllProject({
      options: {},
      credentials: { project_id: '' },
      targets: targets.values(),
    });
    expect(result).toBe('from-iterable');
  });
});

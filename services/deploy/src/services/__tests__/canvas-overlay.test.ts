/**
 * Unit tests for `services/deploy/src/services/canvas-overlay.ts` —
 * the `getNodeDeploymentOverlay` extraction in rf-deploy-15.
 *
 * Per the `deploy-service-tests-must-import-vitest-explicitly` learning,
 * vitest globals are imported explicitly so the deploy package's typecheck
 * stays green.
 *
 * The function has three passes whose behavior is verified independently:
 *   1. Primary pass — load latest deploy, walk resources, build overlay.
 *      Includes the gcp.storage.bucket trailing-slash URL normalization.
 *   2. CustomDomain propagation — Network.PublicEndpoint → connected
 *      Compute.* blocks via per-edge subdomain.
 *   3. PublicEndpoint mirror — `data.domain` → overlay `url`/`domain`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@ice/db', () => ({
  default: {
    canvasDeployment: {
      findFirst: vi.fn(),
    },
    canvasCard: {
      findUnique: vi.fn(),
    },
  },
}));

import { getNodeDeploymentOverlay } from '../canvas-overlay';
// @ts-ignore — resolved at runtime via pnpm workspace; mocked above
import prismaModule from '@ice/db';

const findFirstMock = (prismaModule as any).canvasDeployment.findFirst as ReturnType<typeof vi.fn>;
const findUniqueMock = (prismaModule as any).canvasCard.findUnique as ReturnType<typeof vi.fn>;

const updatedAt = new Date('2026-04-29T12:00:00Z');
const updatedAtIso = updatedAt.toISOString();

function deployRow(resources: any[], overrides: Partial<{ updated_at: Date; status: string }> = {}) {
  return {
    id: 'dep-1',
    updated_at: overrides.updated_at ?? updatedAt,
    status: overrides.status ?? 'success',
    results: { resources },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no card → falls through to the overlay returned by pass 1.
  findUniqueMock.mockResolvedValue(null);
});

describe('getNodeDeploymentOverlay — primary pass', () => {
  it('returns {} when no deployment exists for card+env+status', async () => {
    findFirstMock.mockResolvedValueOnce(null);
    const result = await getNodeDeploymentOverlay('card-1', 'production');
    expect(result).toEqual({});
    expect(findFirstMock).toHaveBeenCalledWith({
      where: {
        card_id: 'card-1',
        environment: 'production',
        status: { in: ['success', 'partial'] },
      },
      orderBy: { created_at: 'desc' },
    });
  });

  it('defaults environment to "development" when omitted', async () => {
    findFirstMock.mockResolvedValueOnce(null);
    await getNodeDeploymentOverlay('card-1');
    expect(findFirstMock).toHaveBeenCalledWith({
      where: {
        card_id: 'card-1',
        environment: 'development',
        status: { in: ['success', 'partial'] },
      },
      orderBy: { created_at: 'desc' },
    });
  });

  it('returns {} when deployment exists but `results` is null', async () => {
    findFirstMock.mockResolvedValueOnce({ id: 'dep-1', results: null, updated_at: updatedAt });
    const result = await getNodeDeploymentOverlay('card-1');
    expect(result).toEqual({});
  });

  it('relies on the prisma where filter to reject failed deployments', async () => {
    // Simulating "no result returned" because the where filter excludes
    // status: 'failed'. This documents that the filter — not in-memory
    // logic — is what gates non-success deployments.
    findFirstMock.mockResolvedValueOnce(null);
    const result = await getNodeDeploymentOverlay('card-1');
    expect(result).toEqual({});
    expect(findFirstMock.mock.calls[0]?.[0].where.status).toEqual({ in: ['success', 'partial'] });
  });

  it('builds overlay keyed by source_node_id and skips resources without one', async () => {
    findFirstMock.mockResolvedValueOnce(
      deployRow([
        {
          source_node_id: 'node-a',
          type: 'gcp.run.service',
          name: 'svc-a',
          success: true,
          provider_id: 'projects/p/locations/us/services/svc-a',
          outputs: { url: 'https://svc-a.run.app' },
        },
        {
          // No source_node_id — should be skipped.
          type: 'gcp.iam.serviceAccount',
          name: 'sa-orphan',
          success: true,
          outputs: {},
        },
        {
          source_node_id: 'node-b',
          type: 'gcp.run.service',
          name: 'svc-b',
          success: true,
          provider_id: 'projects/p/locations/us/services/svc-b',
          outputs: { url: 'https://svc-b.run.app' },
        },
      ]),
    );
    const result = await getNodeDeploymentOverlay('card-1');
    expect(Object.keys(result).sort()).toEqual(['node-a', 'node-b']);
    expect(result['node-a'].deploy_resource_name).toBe('svc-a');
    expect(result['node-b'].deploy_resource_name).toBe('svc-b');
  });

  it('sets deploy_status "active" for success and "error" for failure', async () => {
    findFirstMock.mockResolvedValueOnce(
      deployRow([
        { source_node_id: 'ok', success: true, type: 'x', outputs: {} },
        { source_node_id: 'bad', success: false, type: 'x', error: 'boom', outputs: {} },
      ]),
    );
    const result = await getNodeDeploymentOverlay('card-1');
    expect(result.ok.deploy_status).toBe('active');
    expect(result.bad.deploy_status).toBe('error');
  });

  it('threads deploy_error: undefined for successes, message for failures', async () => {
    findFirstMock.mockResolvedValueOnce(
      deployRow([
        { source_node_id: 'ok', success: true, type: 'x', outputs: {} },
        { source_node_id: 'bad', success: false, type: 'x', error: 'quota exceeded', outputs: {} },
      ]),
    );
    const result = await getNodeDeploymentOverlay('card-1');
    expect(result.ok.deploy_error).toBeUndefined();
    expect(result.bad.deploy_error).toBe('quota exceeded');
  });

  it('sets last_deployed_at to deployment.updated_at.toISOString()', async () => {
    findFirstMock.mockResolvedValueOnce(deployRow([{ source_node_id: 'a', success: true, type: 'x', outputs: {} }]));
    const result = await getNodeDeploymentOverlay('card-1');
    expect(result.a.last_deployed_at).toBe(updatedAtIso);
  });

  it('falls back deploy_outputs.default_url to handler-emitted url when not pre-set', async () => {
    findFirstMock.mockResolvedValueOnce(
      deployRow([
        {
          source_node_id: 'a',
          success: true,
          type: 'gcp.run.service',
          outputs: { url: 'https://a.run.app' },
        },
        {
          source_node_id: 'b',
          success: true,
          type: 'gcp.run.service',
          // pre-set default_url — keep
          outputs: { url: 'https://b.run.app', default_url: 'https://pre.set/' },
        },
        {
          source_node_id: 'c',
          success: true,
          type: 'gcp.run.service',
          // No url at all — default_url should remain undefined.
          outputs: {},
        },
      ]),
    );
    const result = await getNodeDeploymentOverlay('card-1');
    expect(result.a.deploy_outputs.default_url).toBe('https://a.run.app');
    // ownUrl present → overrides existing default_url (priority is `ownUrl ||`)
    expect(result.b.deploy_outputs.default_url).toBe('https://b.run.app');
    expect(result.c.deploy_outputs.default_url).toBeUndefined();
  });

  it('default_url falls back to handlerOutputs.default_url when no url is emitted', async () => {
    findFirstMock.mockResolvedValueOnce(
      deployRow([
        {
          source_node_id: 'd',
          success: true,
          type: 'gcp.run.service',
          outputs: { default_url: 'https://stored.default/' },
        },
      ]),
    );
    const result = await getNodeDeploymentOverlay('card-1');
    expect(result.d.deploy_outputs.default_url).toBe('https://stored.default/');
  });

  it('rewrites bucket URL with trailing slash to /<index_page> (default index.html)', async () => {
    findFirstMock.mockResolvedValueOnce(
      deployRow([
        {
          source_node_id: 'site',
          success: true,
          type: 'gcp.storage.bucket',
          outputs: { url: 'https://storage.googleapis.com/foo/' },
        },
      ]),
    );
    const result = await getNodeDeploymentOverlay('card-1');
    expect(result.site.deploy_outputs.url).toBe('https://storage.googleapis.com/foo/index.html');
    expect(result.site.deploy_outputs.default_url).toBe('https://storage.googleapis.com/foo/index.html');
  });

  it('rewrites bucket URL with no trailing slash to /<index_page> (default index.html)', async () => {
    findFirstMock.mockResolvedValueOnce(
      deployRow([
        {
          source_node_id: 'site',
          success: true,
          type: 'gcp.storage.bucket',
          outputs: { url: 'https://storage.googleapis.com/bar' },
        },
      ]),
    );
    const result = await getNodeDeploymentOverlay('card-1');
    expect(result.site.deploy_outputs.url).toBe('https://storage.googleapis.com/bar/index.html');
  });

  it('uses outputs.index_page when present', async () => {
    findFirstMock.mockResolvedValueOnce(
      deployRow([
        {
          source_node_id: 'site',
          success: true,
          type: 'gcp.storage.bucket',
          outputs: { url: 'https://storage.googleapis.com/foo/', index_page: 'home.html' },
        },
      ]),
    );
    const result = await getNodeDeploymentOverlay('card-1');
    expect(result.site.deploy_outputs.url).toBe('https://storage.googleapis.com/foo/home.html');
  });

  it('does not rewrite a bucket URL that already has an object path', async () => {
    findFirstMock.mockResolvedValueOnce(
      deployRow([
        {
          source_node_id: 'site',
          success: true,
          type: 'gcp.storage.bucket',
          outputs: { url: 'https://storage.googleapis.com/foo/bar/baz.html' },
        },
      ]),
    );
    const result = await getNodeDeploymentOverlay('card-1');
    expect(result.site.deploy_outputs.url).toBe('https://storage.googleapis.com/foo/bar/baz.html');
  });

  it('does not rewrite a non-bucket resource even if URL pattern matches', async () => {
    findFirstMock.mockResolvedValueOnce(
      deployRow([
        {
          source_node_id: 'svc',
          success: true,
          type: 'gcp.run.service',
          outputs: { url: 'https://storage.googleapis.com/foo/' },
        },
      ]),
    );
    const result = await getNodeDeploymentOverlay('card-1');
    expect(result.svc.deploy_outputs.url).toBe('https://storage.googleapis.com/foo/');
  });

  it('threads provider_id, deploy_resource_type, deploy_resource_name', async () => {
    findFirstMock.mockResolvedValueOnce(
      deployRow([
        {
          source_node_id: 'a',
          success: true,
          provider_id: 'pid-123',
          type: 'gcp.run.service',
          name: 'my-svc',
          outputs: {},
        },
      ]),
    );
    const result = await getNodeDeploymentOverlay('card-1');
    expect(result.a.provider_id).toBe('pid-123');
    expect(result.a.deploy_resource_type).toBe('gcp.run.service');
    expect(result.a.deploy_resource_name).toBe('my-svc');
  });

  it('treats missing results.resources as empty array', async () => {
    findFirstMock.mockResolvedValueOnce({
      id: 'dep-1',
      updated_at: updatedAt,
      status: 'success',
      results: {}, // no resources field
    });
    const result = await getNodeDeploymentOverlay('card-1');
    expect(result).toEqual({});
  });
});

describe('getNodeDeploymentOverlay — CustomDomain propagation', () => {
  it('returns the primary-pass overlay unchanged when card row is not found', async () => {
    findFirstMock.mockResolvedValueOnce(
      deployRow([
        {
          source_node_id: 'a',
          success: true,
          type: 'gcp.run.service',
          outputs: { url: 'https://a.run.app' },
        },
      ]),
    );
    findUniqueMock.mockResolvedValueOnce(null);
    const result = await getNodeDeploymentOverlay('card-1');
    expect(Object.keys(result)).toEqual(['a']);
    expect(result.a.deploy_outputs.url).toBe('https://a.run.app');
  });

  it('propagates LB url to the connected Compute block', async () => {
    findFirstMock.mockResolvedValueOnce(
      deployRow([
        {
          source_node_id: 'pe',
          success: true,
          type: 'gcp.compute.forwardingRule',
          outputs: { url: 'https://lb.example.com' },
        },
        {
          source_node_id: 'svc',
          success: true,
          type: 'gcp.run.service',
          outputs: { url: 'https://svc.run.app' },
        },
      ]),
    );
    findUniqueMock.mockResolvedValueOnce({
      nodes: [
        { id: 'pe', data: { iceType: 'Network.PublicEndpoint' } },
        { id: 'svc', data: { iceType: 'Compute.CloudRun' } },
      ],
      edges: [{ id: 'e1', source: 'pe', target: 'svc' }],
    });
    const result = await getNodeDeploymentOverlay('card-1');
    expect(result.svc.deploy_outputs.url).toBe('https://lb.example.com');
    expect(result.svc.deploy_outputs.default_url).toBe('https://svc.run.app');
  });

  it('propagates lb.domain (no url) as https://<domain> host', async () => {
    findFirstMock.mockResolvedValueOnce(
      deployRow([
        {
          source_node_id: 'pe',
          success: true,
          type: 'gcp.compute.forwardingRule',
          // No url, only domain.
          outputs: { domain: 'example.com' },
        },
        {
          source_node_id: 'svc',
          success: true,
          type: 'gcp.run.service',
          outputs: { url: 'https://svc.run.app' },
        },
      ]),
    );
    findUniqueMock.mockResolvedValueOnce({
      nodes: [
        { id: 'pe', data: { iceType: 'Network.PublicEndpoint' } },
        { id: 'svc', data: { iceType: 'Compute.CloudRun' } },
      ],
      edges: [{ id: 'e1', source: 'svc', target: 'pe' }],
    });
    const result = await getNodeDeploymentOverlay('card-1');
    expect(result.svc.deploy_outputs.domain).toBe('example.com');
    expect(result.svc.deploy_outputs.url).toBe('https://example.com');
    expect(result.svc.deploy_outputs.default_url).toBe('https://svc.run.app');
  });

  it('sets ip_address from lb.ip_address even when no url/domain', async () => {
    findFirstMock.mockResolvedValueOnce(
      deployRow([
        {
          source_node_id: 'pe',
          success: true,
          type: 'gcp.compute.forwardingRule',
          outputs: { ip_address: '1.2.3.4' },
        },
        {
          source_node_id: 'svc',
          success: true,
          type: 'gcp.run.service',
          outputs: { url: 'https://svc.run.app' },
        },
      ]),
    );
    findUniqueMock.mockResolvedValueOnce({
      nodes: [
        { id: 'pe', data: { iceType: 'Network.PublicEndpoint' } },
        { id: 'svc', data: { iceType: 'Compute.CloudRun' } },
      ],
      edges: [{ id: 'e1', source: 'pe', target: 'svc' }],
    });
    const result = await getNodeDeploymentOverlay('card-1');
    expect(result.svc.deploy_outputs.ip_address).toBe('1.2.3.4');
    // No domain, no lb url → primary URL falls back to compute block's own.
    expect(result.svc.deploy_outputs.url).toBe('https://svc.run.app');
  });

  it('also reads IPAddress (PascalCase) from outputs', async () => {
    findFirstMock.mockResolvedValueOnce(
      deployRow([
        {
          source_node_id: 'pe',
          success: true,
          type: 'gcp.compute.forwardingRule',
          outputs: { IPAddress: '5.6.7.8' },
        },
        {
          source_node_id: 'svc',
          success: true,
          type: 'gcp.run.service',
          outputs: {},
        },
      ]),
    );
    findUniqueMock.mockResolvedValueOnce({
      nodes: [
        { id: 'pe', data: { iceType: 'Network.PublicEndpoint' } },
        { id: 'svc', data: { iceType: 'Compute.CloudRun' } },
      ],
      edges: [{ id: 'e1', source: 'pe', target: 'svc' }],
    });
    const result = await getNodeDeploymentOverlay('card-1');
    expect(result.svc.deploy_outputs.ip_address).toBe('5.6.7.8');
  });

  it('per-edge subdomain produces "<sub>.<rootDomain>" host', async () => {
    findFirstMock.mockResolvedValueOnce(
      deployRow([
        {
          source_node_id: 'pe',
          success: true,
          type: 'gcp.compute.forwardingRule',
          outputs: { domain: 'mysite.com' },
        },
        {
          source_node_id: 'api',
          success: true,
          type: 'gcp.run.service',
          outputs: { url: 'https://api.run.app' },
        },
      ]),
    );
    findUniqueMock.mockResolvedValueOnce({
      nodes: [
        { id: 'pe', data: { iceType: 'Network.PublicEndpoint' } },
        { id: 'api', data: { iceType: 'Compute.CloudRun' } },
      ],
      edges: [{ id: 'e1', source: 'pe', target: 'api', data: { subdomain: 'api' } }],
    });
    const result = await getNodeDeploymentOverlay('card-1');
    expect(result.api.deploy_outputs.domain).toBe('api.mysite.com');
    expect(result.api.deploy_outputs.url).toBe('https://api.mysite.com');
  });

  it('edge without subdomain produces bare rootDomain', async () => {
    findFirstMock.mockResolvedValueOnce(
      deployRow([
        {
          source_node_id: 'pe',
          success: true,
          type: 'gcp.compute.forwardingRule',
          outputs: { domain: 'mysite.com' },
        },
        {
          source_node_id: 'web',
          success: true,
          type: 'gcp.run.service',
          outputs: { url: 'https://web.run.app' },
        },
      ]),
    );
    findUniqueMock.mockResolvedValueOnce({
      nodes: [
        { id: 'pe', data: { iceType: 'Network.PublicEndpoint' } },
        { id: 'web', data: { iceType: 'Compute.CloudRun' } },
      ],
      edges: [{ id: 'e1', source: 'pe', target: 'web' }],
    });
    const result = await getNodeDeploymentOverlay('card-1');
    expect(result.web.deploy_outputs.domain).toBe('mysite.com');
    expect(result.web.deploy_outputs.url).toBe('https://mysite.com');
  });

  it('preserves the compute block own URL as default_url, not as url', async () => {
    findFirstMock.mockResolvedValueOnce(
      deployRow([
        {
          source_node_id: 'pe',
          success: true,
          type: 'gcp.compute.forwardingRule',
          outputs: { domain: 'mysite.com' },
        },
        {
          source_node_id: 'svc',
          success: true,
          type: 'gcp.run.service',
          outputs: { url: 'https://svc.run.app' },
        },
      ]),
    );
    findUniqueMock.mockResolvedValueOnce({
      nodes: [
        { id: 'pe', data: { iceType: 'Network.PublicEndpoint' } },
        { id: 'svc', data: { iceType: 'Compute.CloudRun' } },
      ],
      edges: [{ id: 'e1', source: 'pe', target: 'svc' }],
    });
    const result = await getNodeDeploymentOverlay('card-1');
    expect(result.svc.deploy_outputs.url).toBe('https://mysite.com');
    expect(result.svc.deploy_outputs.default_url).toBe('https://svc.run.app');
  });

  it('does not modify non-Compute connections (e.g. Storage on the other side)', async () => {
    findFirstMock.mockResolvedValueOnce(
      deployRow([
        {
          source_node_id: 'pe',
          success: true,
          type: 'gcp.compute.forwardingRule',
          outputs: { domain: 'mysite.com' },
        },
        {
          source_node_id: 'bucket',
          success: true,
          type: 'gcp.storage.bucket',
          outputs: { url: 'https://storage.googleapis.com/foo/index.html' },
        },
      ]),
    );
    findUniqueMock.mockResolvedValueOnce({
      nodes: [
        { id: 'pe', data: { iceType: 'Network.PublicEndpoint' } },
        { id: 'bucket', data: { iceType: 'Storage.Bucket' } },
      ],
      edges: [{ id: 'e1', source: 'pe', target: 'bucket' }],
    });
    const result = await getNodeDeploymentOverlay('card-1');
    // Storage.Bucket wasn't propagated — its URL is the unmodified primary-pass.
    expect(result.bucket.deploy_outputs.url).toBe('https://storage.googleapis.com/foo/index.html');
    expect(result.bucket.deploy_outputs.domain).toBeUndefined();
  });

  it('ignores edges where neither end is the PublicEndpoint node', async () => {
    findFirstMock.mockResolvedValueOnce(
      deployRow([
        {
          source_node_id: 'pe',
          success: true,
          type: 'gcp.compute.forwardingRule',
          outputs: { domain: 'mysite.com' },
        },
        {
          source_node_id: 'svc',
          success: true,
          type: 'gcp.run.service',
          outputs: { url: 'https://svc.run.app' },
        },
        {
          source_node_id: 'svc2',
          success: true,
          type: 'gcp.run.service',
          outputs: { url: 'https://svc2.run.app' },
        },
      ]),
    );
    findUniqueMock.mockResolvedValueOnce({
      nodes: [
        { id: 'pe', data: { iceType: 'Network.PublicEndpoint' } },
        { id: 'svc', data: { iceType: 'Compute.CloudRun' } },
        { id: 'svc2', data: { iceType: 'Compute.CloudRun' } },
      ],
      // Only this edge connects pe → svc; svc2 is independent.
      edges: [
        { id: 'e1', source: 'pe', target: 'svc' },
        { id: 'e2', source: 'svc', target: 'svc2' },
      ],
    });
    const result = await getNodeDeploymentOverlay('card-1');
    expect(result.svc.deploy_outputs.url).toBe('https://mysite.com');
    // svc2 was not connected to pe, so its URL stays untouched.
    expect(result.svc2.deploy_outputs.url).toBe('https://svc2.run.app');
    expect(result.svc2.deploy_outputs.domain).toBeUndefined();
  });

  it('skips PublicEndpoint nodes that have no url, no domain, and no ip', async () => {
    findFirstMock.mockResolvedValueOnce(
      deployRow([
        {
          // PE with empty outputs — should be skipped entirely.
          source_node_id: 'pe',
          success: true,
          type: 'gcp.compute.forwardingRule',
          outputs: {},
        },
        {
          source_node_id: 'svc',
          success: true,
          type: 'gcp.run.service',
          outputs: { url: 'https://svc.run.app' },
        },
      ]),
    );
    findUniqueMock.mockResolvedValueOnce({
      nodes: [
        { id: 'pe', data: { iceType: 'Network.PublicEndpoint' } },
        { id: 'svc', data: { iceType: 'Compute.CloudRun' } },
      ],
      edges: [{ id: 'e1', source: 'pe', target: 'svc' }],
    });
    const result = await getNodeDeploymentOverlay('card-1');
    // svc URL is unchanged because pass-2 was skipped for `pe`.
    expect(result.svc.deploy_outputs.url).toBe('https://svc.run.app');
  });

  it('skips overlay entries for which no canvas node exists', async () => {
    findFirstMock.mockResolvedValueOnce(
      deployRow([
        {
          source_node_id: 'orphan',
          success: true,
          type: 'gcp.compute.forwardingRule',
          outputs: { domain: 'oops.com' },
        },
      ]),
    );
    findUniqueMock.mockResolvedValueOnce({
      // Canvas has no node with id "orphan".
      nodes: [],
      edges: [],
    });
    const result = await getNodeDeploymentOverlay('card-1');
    // Pass 2's `findNode` returns undefined → continue. Primary-pass entry stays.
    expect(result.orphan.deploy_outputs.domain).toBe('oops.com');
  });

  it('skips edges whose other end is not in the nodes list', async () => {
    findFirstMock.mockResolvedValueOnce(
      deployRow([
        {
          source_node_id: 'pe',
          success: true,
          type: 'gcp.compute.forwardingRule',
          outputs: { domain: 'mysite.com' },
        },
      ]),
    );
    findUniqueMock.mockResolvedValueOnce({
      nodes: [{ id: 'pe', data: { iceType: 'Network.PublicEndpoint' } }],
      // Edge points at "ghost" — a node id that doesn't exist in nodes.
      edges: [{ id: 'e1', source: 'pe', target: 'ghost' }],
    });
    const result = await getNodeDeploymentOverlay('card-1');
    // Only `pe` was a candidate, no Compute side to propagate to.
    expect(result.ghost).toBeUndefined();
  });

  it('creates overlay entry for a Compute block that had no primary-pass entry', async () => {
    findFirstMock.mockResolvedValueOnce(
      deployRow([
        {
          source_node_id: 'pe',
          success: true,
          type: 'gcp.compute.forwardingRule',
          outputs: { domain: 'mysite.com' },
        },
        // Note: no resource for "svc-not-yet-deployed" — but the canvas
        // still has a Compute node connected to pe. The propagation pass
        // creates a fresh overlay entry for it.
      ]),
    );
    findUniqueMock.mockResolvedValueOnce({
      nodes: [
        { id: 'pe', data: { iceType: 'Network.PublicEndpoint' } },
        { id: 'svc-not-yet-deployed', data: { iceType: 'Compute.CloudRun' } },
      ],
      edges: [{ id: 'e1', source: 'pe', target: 'svc-not-yet-deployed' }],
    });
    const result = await getNodeDeploymentOverlay('card-1');
    expect(result['svc-not-yet-deployed'].deploy_outputs.domain).toBe('mysite.com');
    expect(result['svc-not-yet-deployed'].deploy_outputs.url).toBe('https://mysite.com');
    // No own-URL existed → default_url is undefined.
    expect(result['svc-not-yet-deployed'].deploy_outputs.default_url).toBeUndefined();
  });

  it('falls back to node.data.domain for rootDomain when lb has no domain output', async () => {
    findFirstMock.mockResolvedValueOnce(
      deployRow([
        {
          source_node_id: 'pe',
          success: true,
          type: 'gcp.compute.forwardingRule',
          // No domain in outputs, but a url that triggers pass-2.
          outputs: { url: 'https://1.2.3.4/' },
        },
        {
          source_node_id: 'svc',
          success: true,
          type: 'gcp.run.service',
          outputs: { url: 'https://svc.run.app' },
        },
      ]),
    );
    findUniqueMock.mockResolvedValueOnce({
      nodes: [
        // node.data.domain provides the rootDomain.
        { id: 'pe', data: { iceType: 'Network.PublicEndpoint', domain: 'fallback.com' } },
        { id: 'svc', data: { iceType: 'Compute.CloudRun' } },
      ],
      edges: [{ id: 'e1', source: 'pe', target: 'svc', data: { subdomain: 'app' } }],
    });
    const result = await getNodeDeploymentOverlay('card-1');
    expect(result.svc.deploy_outputs.domain).toBe('app.fallback.com');
    expect(result.svc.deploy_outputs.url).toBe('https://app.fallback.com');
  });
});

describe('getNodeDeploymentOverlay — PublicEndpoint mirror (third pass)', () => {
  it('creates an overlay entry for a PublicEndpoint with data.domain even with no prior overlay', async () => {
    findFirstMock.mockResolvedValueOnce(deployRow([])); // no resources
    findUniqueMock.mockResolvedValueOnce({
      nodes: [{ id: 'pe', data: { iceType: 'Network.PublicEndpoint', domain: 'example.com' } }],
      edges: [],
    });
    const result = await getNodeDeploymentOverlay('card-1');
    expect(result.pe.deploy_outputs.domain).toBe('example.com');
    expect(result.pe.deploy_outputs.url).toBe('https://example.com');
  });

  it('skips PublicEndpoint with empty data.domain', async () => {
    findFirstMock.mockResolvedValueOnce(deployRow([]));
    findUniqueMock.mockResolvedValueOnce({
      nodes: [{ id: 'pe', data: { iceType: 'Network.PublicEndpoint', domain: '' } }],
      edges: [],
    });
    const result = await getNodeDeploymentOverlay('card-1');
    expect(result.pe).toBeUndefined();
  });

  it('skips PublicEndpoint with whitespace-only data.domain', async () => {
    findFirstMock.mockResolvedValueOnce(deployRow([]));
    findUniqueMock.mockResolvedValueOnce({
      nodes: [{ id: 'pe', data: { iceType: 'Network.PublicEndpoint', domain: '   ' } }],
      edges: [],
    });
    const result = await getNodeDeploymentOverlay('card-1');
    expect(result.pe).toBeUndefined();
  });

  it('merges into existing PublicEndpoint overlay, preserving primary-pass fields', async () => {
    findFirstMock.mockResolvedValueOnce(
      deployRow([
        {
          source_node_id: 'pe',
          success: true,
          provider_id: 'pid-pe',
          type: 'gcp.compute.forwardingRule',
          name: 'pe-name',
          outputs: { ssl_certificate: 'cert-1' },
        },
      ]),
    );
    findUniqueMock.mockResolvedValueOnce({
      nodes: [{ id: 'pe', data: { iceType: 'Network.PublicEndpoint', domain: 'example.com' } }],
      edges: [],
    });
    const result = await getNodeDeploymentOverlay('card-1');
    // primary-pass fields preserved
    expect(result.pe.provider_id).toBe('pid-pe');
    expect(result.pe.deploy_status).toBe('active');
    expect(result.pe.last_deployed_at).toBe(updatedAtIso);
    // mirror added
    expect(result.pe.deploy_outputs.domain).toBe('example.com');
    expect(result.pe.deploy_outputs.url).toBe('https://example.com');
    // pre-existing outputs preserved
    expect(result.pe.deploy_outputs.ssl_certificate).toBe('cert-1');
  });
});

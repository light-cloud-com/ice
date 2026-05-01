/**
 * Tests for `load-balancer/lb-builder.ts` (rf-lbal-3).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../compute-ops.js', () => ({
  wait_for_compute_op: vi.fn().mockResolvedValue(undefined),
}));

import { wait_for_compute_op } from '../compute-ops.js';
import {
  create_url_map,
  create_target_proxy,
  create_forwarding_rule,
  create_redirect_chain,
} from '../lb-builder.js';
import type { GCPHandlerContext } from '../../../types.js';
import type { HostRule } from '../backend-creator.js';

function makeCtx(post: any): GCPHandlerContext {
  return {
    project: 'p',
    region: 'us',
    clients: new Map(),
    rest_client: { post, get: vi.fn(), delete: vi.fn() } as any,
  } as any;
}

describe('load-balancer/lb-builder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(wait_for_compute_op).mockResolvedValue(undefined);
  });

  describe('create_url_map', () => {
    it('builds a single-host URL map (no hostRules)', async () => {
      const post = vi.fn().mockResolvedValue({ name: 'op-1' });
      const ctx = makeCtx(post);
      await create_url_map(ctx, 'my-map', 'projects/p/global/backendBuckets/b1', []);
      expect(post).toHaveBeenCalledWith(
        'https://compute.googleapis.com/compute/v1/projects/p/global/urlMaps',
        expect.objectContaining({
          name: 'my-map',
          defaultService: 'projects/p/global/backendBuckets/b1',
        }),
      );
      const body = post.mock.calls[0][1];
      expect(body.hostRules).toBeUndefined();
      expect(body.pathMatchers).toBeUndefined();
    });

    it('builds a multi-host URL map with hostRules + pathMatchers', async () => {
      const post = vi.fn().mockResolvedValue({ name: 'op-1' });
      const ctx = makeCtx(post);
      const rules: HostRule[] = [
        { host: 'a.com', backendName: 'a-backend', backendType: 'bucket' },
        { host: 'b.com', backendName: 'b-backend', backendType: 'service' },
      ];
      await create_url_map(ctx, 'm', 'default-ref', rules);
      const body = post.mock.calls[0][1];
      expect(body.hostRules).toEqual([
        { hosts: ['a.com'], pathMatcher: 'matcher-0' },
        { hosts: ['b.com'], pathMatcher: 'matcher-1' },
      ]);
      expect(body.pathMatchers).toEqual([
        { name: 'matcher-0', defaultService: 'projects/p/global/backendBuckets/a-backend' },
        { name: 'matcher-1', defaultService: 'projects/p/global/backendServices/b-backend' },
      ]);
    });

    it('dedupes duplicate hosts before building the URL map', async () => {
      const post = vi.fn().mockResolvedValue({ name: 'op-1' });
      const ctx = makeCtx(post);
      const rules: HostRule[] = [
        { host: 'a.com', backendName: 'a1', backendType: 'bucket' },
        { host: 'a.com', backendName: 'a2', backendType: 'bucket' }, // dup
        { host: 'b.com', backendName: 'b', backendType: 'bucket' },
      ];
      await create_url_map(ctx, 'm', 'default-ref', rules);
      const body = post.mock.calls[0][1];
      expect(body.hostRules).toHaveLength(2);
      expect(body.hostRules[0].hosts).toEqual(['a.com']);
      expect(body.hostRules[1].hosts).toEqual(['b.com']);
    });

    it('skips host rules with empty host', async () => {
      const post = vi.fn().mockResolvedValue({ name: 'op-1' });
      const ctx = makeCtx(post);
      const rules: HostRule[] = [
        { host: '', backendName: 'a', backendType: 'bucket' },
        { host: 'b.com', backendName: 'b', backendType: 'bucket' },
      ];
      await create_url_map(ctx, 'm', 'd', rules);
      const body = post.mock.calls[0][1];
      // Only b.com survives — a was skipped (empty host) but the >1
      // length check still passed because the rules array has 2 entries.
      expect(body.hostRules).toEqual([{ hosts: ['b.com'], pathMatcher: 'matcher-0' }]);
    });

    it('does NOT build hostRules when only one entry is supplied', async () => {
      const post = vi.fn().mockResolvedValue({ name: 'op-1' });
      const ctx = makeCtx(post);
      const rules: HostRule[] = [{ host: 'a.com', backendName: 'a', backendType: 'bucket' }];
      await create_url_map(ctx, 'm', 'd', rules);
      const body = post.mock.calls[0][1];
      expect(body.hostRules).toBeUndefined();
    });

    it('awaits wait_for_compute_op when the response carries an op name', async () => {
      const post = vi.fn().mockResolvedValue({ name: 'op-x' });
      const ctx = makeCtx(post);
      await create_url_map(ctx, 'm', 'd', []);
      expect(wait_for_compute_op).toHaveBeenCalledWith(ctx, 'op-x');
    });

    it('skips the wait when the response has no op name', async () => {
      const post = vi.fn().mockResolvedValue({});
      const ctx = makeCtx(post);
      await create_url_map(ctx, 'm', 'd', []);
      expect(wait_for_compute_op).not.toHaveBeenCalled();
    });
  });

  describe('create_target_proxy', () => {
    it('creates targetHttpProxies for HTTP and returns the proxy info', async () => {
      const post = vi.fn().mockResolvedValue({ name: 'op-1' });
      const ctx = makeCtx(post);
      const out = await create_target_proxy(ctx, 'lb', 'lb-url-map', false, '');
      expect(out).toEqual({ proxyName: 'lb-proxy', proxyEndpoint: 'targetHttpProxies' });
      expect(post).toHaveBeenCalledWith(
        'https://compute.googleapis.com/compute/v1/projects/p/global/targetHttpProxies',
        { name: 'lb-proxy', urlMap: 'projects/p/global/urlMaps/lb-url-map' },
      );
    });

    it('creates targetHttpsProxies with sslCertificates when wantsHttps', async () => {
      const post = vi.fn().mockResolvedValue({ name: 'op-1' });
      const ctx = makeCtx(post);
      const out = await create_target_proxy(ctx, 'lb', 'lb-url-map', true, 'my-cert');
      expect(out).toEqual({ proxyName: 'lb-proxy', proxyEndpoint: 'targetHttpsProxies' });
      expect(post).toHaveBeenCalledWith(
        'https://compute.googleapis.com/compute/v1/projects/p/global/targetHttpsProxies',
        expect.objectContaining({
          sslCertificates: ['projects/p/global/sslCertificates/my-cert'],
        }),
      );
    });

    it('does not include sslCertificates when wantsHttps is false', async () => {
      const post = vi.fn().mockResolvedValue({ name: 'op-1' });
      const ctx = makeCtx(post);
      await create_target_proxy(ctx, 'lb', 'lb-url-map', false, '');
      const body = post.mock.calls[0][1];
      expect(body.sslCertificates).toBeUndefined();
    });
  });

  describe('create_forwarding_rule', () => {
    it('creates the forwarding rule on port 443 when wantsHttps', async () => {
      const post = vi.fn().mockResolvedValue({ name: 'op-1' });
      const ctx = makeCtx(post);
      await create_forwarding_rule(ctx, 'lb', 'lb-proxy', 'targetHttpsProxies', true, {});
      const body = post.mock.calls[0][1];
      expect(body.portRange).toBe('443');
      expect(body.target).toBe('projects/p/global/targetHttpsProxies/lb-proxy');
    });

    it('creates the forwarding rule on port 80 when not wantsHttps', async () => {
      const post = vi.fn().mockResolvedValue({ name: 'op-1' });
      const ctx = makeCtx(post);
      await create_forwarding_rule(ctx, 'lb', 'lb-proxy', 'targetHttpProxies', false, {});
      const body = post.mock.calls[0][1];
      expect(body.portRange).toBe('80');
    });

    it('passes through scheme + labels when provided', async () => {
      const post = vi.fn().mockResolvedValue({ name: 'op-1' });
      const ctx = makeCtx(post);
      await create_forwarding_rule(ctx, 'lb', 'lb-proxy', 'targetHttpProxies', false, {
        scheme: 'INTERNAL_MANAGED',
        labels: { env: 'prod' },
      });
      const body = post.mock.calls[0][1];
      expect(body.loadBalancingScheme).toBe('INTERNAL_MANAGED');
      expect(body.labels).toEqual({ env: 'prod' });
    });

    it('defaults scheme=EXTERNAL and labels={}', async () => {
      const post = vi.fn().mockResolvedValue({ name: 'op-1' });
      const ctx = makeCtx(post);
      await create_forwarding_rule(ctx, 'lb', 'lb-proxy', 'targetHttpProxies', false, {});
      const body = post.mock.calls[0][1];
      expect(body.loadBalancingScheme).toBe('EXTERNAL');
      expect(body.labels).toEqual({});
    });
  });

  describe('create_redirect_chain', () => {
    it('creates URL map + target proxy + forwarding rule and returns the FR name', async () => {
      const post = vi.fn().mockResolvedValue({ name: 'op-1' });
      const ctx = makeCtx(post);
      const reportStep = vi.fn();
      const out = await create_redirect_chain(ctx, 'lb', { labels: { env: 'p' } }, reportStep);
      expect(out).toBe('lb-http');
      expect(post).toHaveBeenCalledTimes(3);
      // 1: URL map
      expect(post.mock.calls[0][0]).toBe('https://compute.googleapis.com/compute/v1/projects/p/global/urlMaps');
      expect(post.mock.calls[0][1]).toMatchObject({
        name: 'lb-redirect-urlmap',
        defaultUrlRedirect: {
          httpsRedirect: true,
          redirectResponseCode: 'MOVED_PERMANENTLY_DEFAULT',
          stripQuery: false,
        },
      });
      // 2: HTTP target proxy
      expect(post.mock.calls[1][0]).toBe(
        'https://compute.googleapis.com/compute/v1/projects/p/global/targetHttpProxies',
      );
      expect(post.mock.calls[1][1]).toMatchObject({ name: 'lb-redirect-proxy' });
      // 3: forwarding rule on port 80
      expect(post.mock.calls[2][0]).toBe(
        'https://compute.googleapis.com/compute/v1/projects/p/global/forwardingRules',
      );
      expect(post.mock.calls[2][1]).toMatchObject({ name: 'lb-http', portRange: '80' });
    });

    it('reports steps 5 (redirect) and 6 (HTTP forwarding rule)', async () => {
      const post = vi.fn().mockResolvedValue({ name: 'op-1' });
      const ctx = makeCtx(post);
      const reportStep = vi.fn();
      await create_redirect_chain(ctx, 'lb', {}, reportStep);
      expect(reportStep).toHaveBeenCalledWith(5, 'Creating HTTP → HTTPS redirect');
      expect(reportStep).toHaveBeenCalledWith(6, 'Creating HTTP forwarding rule');
    });

    it('passes scheme + labels through to the redirect FR', async () => {
      const post = vi.fn().mockResolvedValue({ name: 'op-1' });
      const ctx = makeCtx(post);
      await create_redirect_chain(ctx, 'lb', { scheme: 'EXTERNAL_MANAGED', labels: { x: '1' } }, vi.fn());
      const frBody = post.mock.calls[2][1];
      expect(frBody.loadBalancingScheme).toBe('EXTERNAL_MANAGED');
      expect(frBody.labels).toEqual({ x: '1' });
    });
  });
});

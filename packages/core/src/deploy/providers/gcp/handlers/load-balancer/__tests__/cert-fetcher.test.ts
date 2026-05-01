/**
 * Tests for `load-balancer/cert-fetcher.ts` (rf-lbal-2).
 */
import { describe, it, expect, vi } from 'vitest';
import { fetch_initial_status, fetch_current_status, fetch_ip_address } from '../cert-fetcher.js';
import type { GCPHandlerContext } from '../../../types.js';

function ctxWithGet(get: (...args: any[]) => any): GCPHandlerContext {
  return {
    project: 'my-project',
    region: 'us',
    rest_client: { get } as any,
    clients: new Map(),
  } as any;
}

describe('load-balancer/cert-fetcher', () => {
  describe('fetch_initial_status', () => {
    it('returns empty when no cert name is provided', async () => {
      const get = vi.fn();
      const ctx = ctxWithGet(get);
      const out = await fetch_initial_status(ctx, '');
      expect(out).toEqual({});
      expect(get).not.toHaveBeenCalled();
    });

    it('returns the live cert status when readable', async () => {
      const get = vi.fn().mockResolvedValue({ managed: { status: 'ACTIVE', domainStatus: { 'a.com': 'ACTIVE' } } });
      const ctx = ctxWithGet(get);
      const out = await fetch_initial_status(ctx, 'cert-1');
      expect(out).toEqual({ cert_status: 'ACTIVE', cert_domain_statuses: { 'a.com': 'ACTIVE' } });
      expect(get).toHaveBeenCalledWith(
        'https://compute.googleapis.com/compute/v1/projects/my-project/global/sslCertificates/cert-1',
      );
    });

    it('falls back to PROVISIONING when status is missing on the response', async () => {
      const get = vi.fn().mockResolvedValue({ managed: {} });
      const ctx = ctxWithGet(get);
      const out = await fetch_initial_status(ctx, 'cert-1');
      expect(out).toEqual({ cert_status: 'PROVISIONING', cert_domain_statuses: undefined });
    });

    it('falls back to PROVISIONING when the GET throws (cert not yet readable)', async () => {
      const get = vi.fn().mockRejectedValue(new Error('404'));
      const ctx = ctxWithGet(get);
      const out = await fetch_initial_status(ctx, 'cert-1');
      expect(out).toEqual({ cert_status: 'PROVISIONING' });
    });
  });

  describe('fetch_current_status', () => {
    it('returns empty when no cert name is provided', async () => {
      const get = vi.fn();
      const ctx = ctxWithGet(get);
      const out = await fetch_current_status(ctx, '');
      expect(out).toEqual({});
      expect(get).not.toHaveBeenCalled();
    });

    it('returns the live cert status when readable', async () => {
      const get = vi.fn().mockResolvedValue({ managed: { status: 'ACTIVE', domainStatus: { 'a.com': 'ACTIVE' } } });
      const ctx = ctxWithGet(get);
      const out = await fetch_current_status(ctx, 'cert-1');
      expect(out).toEqual({ cert_status: 'ACTIVE', cert_domain_statuses: { 'a.com': 'ACTIVE' } });
    });

    it('returns undefined cert_status when status is missing on the response (not PROVISIONING)', async () => {
      const get = vi.fn().mockResolvedValue({ managed: {} });
      const ctx = ctxWithGet(get);
      const out = await fetch_current_status(ctx, 'cert-1');
      expect(out).toEqual({ cert_status: undefined, cert_domain_statuses: undefined });
    });

    it('returns empty when the GET throws (cert deleted or unreadable)', async () => {
      const get = vi.fn().mockRejectedValue(new Error('500'));
      const ctx = ctxWithGet(get);
      const out = await fetch_current_status(ctx, 'cert-1');
      expect(out).toEqual({});
    });
  });

  describe('fetch_ip_address', () => {
    it('returns the IPAddress field when present', async () => {
      const get = vi.fn().mockResolvedValue({ IPAddress: '1.2.3.4' });
      const ctx = ctxWithGet(get);
      const out = await fetch_ip_address(ctx, 'fr-1');
      expect(out).toBe('1.2.3.4');
      expect(get).toHaveBeenCalledWith(
        'https://compute.googleapis.com/compute/v1/projects/my-project/global/forwardingRules/fr-1',
      );
    });

    it('falls back to lowercase ipAddress field when IPAddress is missing', async () => {
      const get = vi.fn().mockResolvedValue({ ipAddress: '5.6.7.8' });
      const ctx = ctxWithGet(get);
      const out = await fetch_ip_address(ctx, 'fr-1');
      expect(out).toBe('5.6.7.8');
    });

    it('returns undefined when neither field is present', async () => {
      const get = vi.fn().mockResolvedValue({});
      const ctx = ctxWithGet(get);
      const out = await fetch_ip_address(ctx, 'fr-1');
      expect(out).toBeUndefined();
    });

    it('returns undefined when GET throws', async () => {
      const get = vi.fn().mockRejectedValue(new Error('boom'));
      const ctx = ctxWithGet(get);
      const out = await fetch_ip_address(ctx, 'fr-1');
      expect(out).toBeUndefined();
    });
  });
});

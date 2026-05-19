/**
 * Tests for `load-balancer/url-builder.ts` (rf-lbal-2).
 */
import { describe, it, expect } from 'vitest';
import { compute_primary_url, backend_ref } from '../url-builder';

describe('load-balancer/url-builder', () => {
  describe('compute_primary_url', () => {
    it('prefers customDomain over everything else', () => {
      expect(compute_primary_url({ customDomain: 'example.com', wantsHttps: true, ipAddress: '1.2.3.4' })).toBe(
        'https://example.com',
      );
    });

    it('always uses https scheme for customDomain even when wantsHttps is false', () => {
      expect(compute_primary_url({ customDomain: 'example.com', wantsHttps: false, ipAddress: '1.2.3.4' })).toBe(
        'https://example.com',
      );
    });

    it('uses https://<ip> when wantsHttps and an IP is available but no customDomain', () => {
      expect(compute_primary_url({ customDomain: '', wantsHttps: true, ipAddress: '1.2.3.4' })).toBe('https://1.2.3.4');
    });

    it('falls back to http://<ip> when wantsHttps is false', () => {
      expect(compute_primary_url({ customDomain: '', wantsHttps: false, ipAddress: '1.2.3.4' })).toBe('http://1.2.3.4');
    });

    it('returns undefined when nothing is available', () => {
      expect(compute_primary_url({ customDomain: '', wantsHttps: false, ipAddress: undefined })).toBeUndefined();
    });

    it('returns undefined when wantsHttps is true but no IP is available', () => {
      expect(compute_primary_url({ customDomain: '', wantsHttps: true, ipAddress: undefined })).toBeUndefined();
    });
  });

  describe('backend_ref', () => {
    it('builds a backend bucket URL from the bucket variant', () => {
      expect(backend_ref('my-project', 'my-bucket', 'bucket')).toBe(
        'projects/my-project/global/backendBuckets/my-bucket',
      );
    });

    it('builds a backend service URL from the service variant', () => {
      expect(backend_ref('my-project', 'my-svc', 'service')).toBe('projects/my-project/global/backendServices/my-svc');
    });

    it('does not URL-encode the project or backend name (caller responsibility)', () => {
      expect(backend_ref('p', 'n with spaces', 'bucket')).toBe('projects/p/global/backendBuckets/n with spaces');
    });
  });
});

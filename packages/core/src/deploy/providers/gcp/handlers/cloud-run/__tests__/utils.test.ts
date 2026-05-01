/**
 * Tests for `cloud-run/utils.ts` (rf-crun-2). Pure helpers, no GCP SDK
 * — `fetch_service_outputs` mocks the rest_client only.
 */
import { describe, it, expect, vi } from 'vitest';
import { build_env_vars, extract_region, fetch_service_outputs } from '../utils.js';
import type { GCPHandlerContext } from '../../../types.js';

describe('cloud-run/utils', () => {
  describe('build_env_vars', () => {
    it('returns undefined for null', () => {
      expect(build_env_vars(null)).toBeUndefined();
    });

    it('returns undefined for undefined', () => {
      expect(build_env_vars(undefined)).toBeUndefined();
    });

    it('returns undefined for non-object inputs', () => {
      expect(build_env_vars('FOO=bar')).toBeUndefined();
      expect(build_env_vars(42)).toBeUndefined();
      expect(build_env_vars(true)).toBeUndefined();
    });

    it('returns undefined for the empty string', () => {
      expect(build_env_vars('')).toBeUndefined();
    });

    it('converts an object map to {name, value} entries', () => {
      const out = build_env_vars({ FOO: 'bar', BAZ: 'qux' });
      expect(out).toEqual([
        { name: 'FOO', value: 'bar' },
        { name: 'BAZ', value: 'qux' },
      ]);
    });

    it('returns an empty array for an empty object (preserves the API distinction from undefined)', () => {
      expect(build_env_vars({})).toEqual([]);
    });

    it('coerces value via Object.entries (string preserved)', () => {
      const out = build_env_vars({ X: 'hello world' });
      expect(out).toEqual([{ name: 'X', value: 'hello world' }]);
    });
  });

  describe('extract_region', () => {
    it('parses the region from a Cloud Run service provider_id', () => {
      expect(extract_region('projects/p/locations/us-central1/services/foo')).toBe('us-central1');
    });

    it('parses the region from a Cloud Run job provider_id', () => {
      expect(extract_region('projects/p/locations/europe-west4/jobs/bar')).toBe('europe-west4');
    });

    it('falls back to us-central1 when the input has no /locations/ segment', () => {
      expect(extract_region('something-malformed')).toBe('us-central1');
    });

    it('falls back to us-central1 for an empty string', () => {
      expect(extract_region('')).toBe('us-central1');
    });

    it('returns the first match when multiple /locations/ segments appear', () => {
      // Pathological but defensively documented: regex picks the first.
      expect(extract_region('projects/p/locations/asia-east1/foo/locations/us')).toBe('asia-east1');
    });
  });

  describe('fetch_service_outputs', () => {
    function ctxWithGet(get: (...args: any[]) => any): GCPHandlerContext {
      return {
        project: 'p',
        region: 'us-central1',
        rest_client: { get } as any,
        clients: new Map(),
      } as any;
    }

    it('returns full outputs when the GET succeeds', async () => {
      const get = vi.fn().mockResolvedValue({ uri: 'https://x-abc.run.app' });
      const ctx = ctxWithGet(get);
      const out = await fetch_service_outputs(
        ctx,
        'projects/p/locations/us/services/x',
        { region: 'us-central1', min_instances: 1, max_instances: 5 },
        'gcr.io/p/x:latest',
      );
      expect(out).toEqual({
        url: 'https://x-abc.run.app',
        region: 'us-central1',
        min_instances: 1,
        max_instances: 5,
        deployed_image: 'gcr.io/p/x:latest',
      });
      expect(get).toHaveBeenCalledWith('https://run.googleapis.com/v2/projects/p/locations/us/services/x');
    });

    it('falls back to empty url when uri is missing on the response', async () => {
      const get = vi.fn().mockResolvedValue({});
      const ctx = ctxWithGet(get);
      const out = await fetch_service_outputs(ctx, 'pid', { region: 'r' }, 'img:tag');
      expect(out).toEqual({
        url: '',
        region: 'r',
        min_instances: undefined,
        max_instances: undefined,
        deployed_image: 'img:tag',
      });
    });

    it('returns just deployed_image when the GET throws', async () => {
      const get = vi.fn().mockRejectedValue(new Error('500'));
      const ctx = ctxWithGet(get);
      const out = await fetch_service_outputs(ctx, 'pid', { region: 'r' }, 'img:tag');
      expect(out).toEqual({ deployed_image: 'img:tag' });
    });
  });
});

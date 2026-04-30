/**
 * Tests for `cloud-storage/bucket-updater.ts` (rf-cstor-6). Pins each
 * branch of the simple-property dispatch (labels / lifecycle /
 * versioning) so a future "consolidate to one setMetadata call"
 * refactor doesn't accidentally drop or merge the patches.
 */

import { describe, it, expect, vi } from 'vitest';
import { applySimpleProperties } from '../bucket-updater.js';

function makeBucket() {
  return {
    setLabels: vi.fn().mockResolvedValue(undefined),
    setMetadata: vi.fn().mockResolvedValue(undefined),
  };
}

describe('cloud-storage/bucket-updater', () => {
  describe('labels', () => {
    it('calls setLabels when properties.labels is set', async () => {
      const bucket = makeBucket();
      await applySimpleProperties(bucket, { labels: { env: 'prod' } });
      expect(bucket.setLabels).toHaveBeenCalledWith({ env: 'prod' });
    });

    it('skips setLabels when labels is undefined', async () => {
      const bucket = makeBucket();
      await applySimpleProperties(bucket, {});
      expect(bucket.setLabels).not.toHaveBeenCalled();
    });

    it('skips setLabels when labels is null/empty (falsy guard)', async () => {
      const bucket = makeBucket();
      // The guard is `if (properties.labels)` — empty/null fall through.
      await applySimpleProperties(bucket, { labels: null });
      await applySimpleProperties(bucket, { labels: '' });
      await applySimpleProperties(bucket, { labels: 0 });
      expect(bucket.setLabels).not.toHaveBeenCalled();
    });

    it('passes labels through verbatim (no normalization)', async () => {
      const bucket = makeBucket();
      const labels = { 'env-tag': 'prod', team: 'platform', region: 'us-east1' };
      await applySimpleProperties(bucket, { labels });
      expect(bucket.setLabels).toHaveBeenCalledWith(labels);
    });
  });

  describe('lifecycle', () => {
    it('calls setMetadata with lifecycle when set', async () => {
      const bucket = makeBucket();
      const lifecycle = { rule: [{ action: { type: 'Delete' }, condition: { age: 30 } }] };
      await applySimpleProperties(bucket, { lifecycle });
      expect(bucket.setMetadata).toHaveBeenCalledWith({ lifecycle });
    });

    it('skips setMetadata when lifecycle is undefined', async () => {
      const bucket = makeBucket();
      await applySimpleProperties(bucket, {});
      expect(bucket.setMetadata).not.toHaveBeenCalled();
    });

    it('skips setMetadata when lifecycle is null', async () => {
      const bucket = makeBucket();
      await applySimpleProperties(bucket, { lifecycle: null });
      expect(bucket.setMetadata).not.toHaveBeenCalled();
    });
  });

  describe('versioning', () => {
    it('calls setMetadata with versioning.enabled=true for truthy', async () => {
      const bucket = makeBucket();
      await applySimpleProperties(bucket, { versioning: true });
      expect(bucket.setMetadata).toHaveBeenCalledWith({ versioning: { enabled: true } });
    });

    it('calls setMetadata with versioning.enabled=false for false', async () => {
      const bucket = makeBucket();
      await applySimpleProperties(bucket, { versioning: false });
      expect(bucket.setMetadata).toHaveBeenCalledWith({ versioning: { enabled: false } });
    });

    it('treats truthy non-boolean values as enabled=true via !! coercion', async () => {
      const bucket = makeBucket();
      await applySimpleProperties(bucket, { versioning: { enabled: true } });
      expect(bucket.setMetadata).toHaveBeenCalledWith({ versioning: { enabled: true } });
    });

    it('treats null as enabled=false via !! coercion (versioning is set, just falsy)', async () => {
      const bucket = makeBucket();
      // `versioning: null` is `!== undefined`, so the branch enters and !!null === false.
      await applySimpleProperties(bucket, { versioning: null });
      expect(bucket.setMetadata).toHaveBeenCalledWith({ versioning: { enabled: false } });
    });

    it('skips setMetadata when versioning is undefined (NOT present in bag)', async () => {
      const bucket = makeBucket();
      await applySimpleProperties(bucket, {});
      expect(bucket.setMetadata).not.toHaveBeenCalled();
    });
  });

  describe('combined', () => {
    it('applies all three when all are set, in label-then-lifecycle-then-versioning order', async () => {
      const bucket = makeBucket();
      const calls: string[] = [];
      bucket.setLabels = vi.fn().mockImplementation(async () => {
        calls.push('labels');
      });
      bucket.setMetadata = vi.fn().mockImplementation(async (m: any) => {
        if ('lifecycle' in m) calls.push('lifecycle');
        if ('versioning' in m) calls.push('versioning');
      });
      await applySimpleProperties(bucket, {
        labels: { a: '1' },
        lifecycle: { rule: [] },
        versioning: true,
      });
      expect(calls).toEqual(['labels', 'lifecycle', 'versioning']);
    });

    it('issues separate setMetadata calls for lifecycle and versioning (not consolidated)', async () => {
      const bucket = makeBucket();
      await applySimpleProperties(bucket, {
        lifecycle: { rule: [] },
        versioning: true,
      });
      expect(bucket.setMetadata).toHaveBeenCalledTimes(2);
      expect(bucket.setMetadata).toHaveBeenNthCalledWith(1, { lifecycle: { rule: [] } });
      expect(bucket.setMetadata).toHaveBeenNthCalledWith(2, { versioning: { enabled: true } });
    });

    it('does nothing on an empty properties bag', async () => {
      const bucket = makeBucket();
      await applySimpleProperties(bucket, {});
      expect(bucket.setLabels).not.toHaveBeenCalled();
      expect(bucket.setMetadata).not.toHaveBeenCalled();
    });
  });

  describe('error propagation', () => {
    it('propagates setLabels rejection', async () => {
      const bucket = makeBucket();
      bucket.setLabels = vi.fn().mockRejectedValue(new Error('forbidden'));
      await expect(applySimpleProperties(bucket, { labels: { a: '1' } })).rejects.toThrow('forbidden');
    });

    it('propagates lifecycle setMetadata rejection', async () => {
      const bucket = makeBucket();
      bucket.setMetadata = vi.fn().mockRejectedValue(new Error('invalid lifecycle'));
      await expect(applySimpleProperties(bucket, { lifecycle: {} })).rejects.toThrow('invalid lifecycle');
    });
  });
});

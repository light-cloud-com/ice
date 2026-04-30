/**
 * Tests for `cloud-storage/result-helpers.ts` (rf-cstor-1). Pure shape
 * checks — no GCP, no async. Locks the `ResourceDeployResult` contract
 * the orchestrator and per-step modules will share once the rest of
 * the rf-cstor series lands.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TYPE, result, fail } from '../result-helpers.js';

describe('cloud-storage/result-helpers', () => {
  describe('TYPE', () => {
    it('equals the canonical ICE iceType for Cloud Storage buckets', () => {
      expect(TYPE).toBe('gcp.storage.bucket');
    });
  });

  describe('result()', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      // Pin Date.now() so duration_ms math is deterministic.
      vi.setSystemTime(new Date('2026-04-30T12:00:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns the success shape with name reused as resource_id', () => {
      const start = Date.now() - 1234;
      const out = result('my-bucket', 'create', start);
      expect(out).toEqual({
        resource_id: 'my-bucket',
        name: 'my-bucket',
        type: TYPE,
        action: 'create',
        success: true,
        duration_ms: 1234,
      });
    });

    it('uses the TYPE constant for the type field', () => {
      const out = result('x', 'create', Date.now());
      expect(out.type).toBe(TYPE);
    });

    it('computes duration_ms as Date.now() - start', () => {
      const start = Date.now() - 5000;
      const out = result('x', 'create', start);
      expect(out.duration_ms).toBe(5000);
    });

    it('returns duration_ms === 0 when start === Date.now()', () => {
      const start = Date.now();
      const out = result('x', 'create', start);
      expect(out.duration_ms).toBe(0);
    });

    it('passes through the create action', () => {
      const out = result('x', 'create', Date.now());
      expect(out.action).toBe('create');
    });

    it('passes through the update action', () => {
      const out = result('x', 'update', Date.now());
      expect(out.action).toBe('update');
    });

    it('passes through the delete action', () => {
      const out = result('x', 'delete', Date.now());
      expect(out.action).toBe('delete');
    });

    it('defaults overrides to an empty object when omitted', () => {
      // Calling without overrides exercises the default-parameter branch.
      const out = result('x', 'create', Date.now());
      expect(out).toMatchObject({
        resource_id: 'x',
        name: 'x',
        type: TYPE,
        action: 'create',
        success: true,
        duration_ms: 0,
      });
      expect(Object.keys(out).sort()).toEqual(
        ['action', 'duration_ms', 'name', 'resource_id', 'success', 'type'].sort(),
      );
    });

    it('shallow-merges overrides over the base shape', () => {
      const out = result('x', 'create', Date.now(), {
        provider_id: 'gs://x',
        outputs: { url: 'https://storage.googleapis.com/x/index.html' },
      });
      expect(out.provider_id).toBe('gs://x');
      expect(out.outputs).toEqual({ url: 'https://storage.googleapis.com/x/index.html' });
      // Base fields are still present.
      expect(out.success).toBe(true);
      expect(out.type).toBe(TYPE);
      expect(out.resource_id).toBe('x');
    });

    it('lets overrides win the spread (e.g. action override)', () => {
      const out = result('x', 'create', Date.now(), { action: 'update' });
      expect(out.action).toBe('update');
    });
  });

  describe('fail()', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-04-30T12:00:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns the failure shape with success: false and the error string', () => {
      const start = Date.now() - 250;
      const out = fail('my-bucket', 'create', start, 'boom');
      expect(out).toEqual({
        resource_id: 'my-bucket',
        name: 'my-bucket',
        type: TYPE,
        action: 'create',
        success: false,
        error: 'boom',
        duration_ms: 250,
      });
    });

    it('reuses name as resource_id', () => {
      const out = fail('bucket-a', 'update', Date.now(), 'nope');
      expect(out.resource_id).toBe('bucket-a');
      expect(out.name).toBe('bucket-a');
    });

    it('uses the TYPE constant for the type field', () => {
      const out = fail('x', 'create', Date.now(), 'e');
      expect(out.type).toBe(TYPE);
    });

    it('computes duration_ms as Date.now() - start', () => {
      const start = Date.now() - 9_999;
      const out = fail('x', 'delete', start, 'gone');
      expect(out.duration_ms).toBe(9_999);
    });

    it('passes through the create action', () => {
      const out = fail('x', 'create', Date.now(), 'e');
      expect(out.action).toBe('create');
    });

    it('passes through the update action', () => {
      const out = fail('x', 'update', Date.now(), 'e');
      expect(out.action).toBe('update');
    });

    it('passes through the delete action', () => {
      const out = fail('x', 'delete', Date.now(), 'e');
      expect(out.action).toBe('delete');
    });

    it('preserves the error string verbatim', () => {
      const out = fail('x', 'create', Date.now(), 'multi\nline error');
      expect(out.error).toBe('multi\nline error');
    });
  });
});

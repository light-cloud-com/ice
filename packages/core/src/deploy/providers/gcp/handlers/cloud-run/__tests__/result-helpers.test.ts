/**
 * Tests for `cloud-run/result-helpers.ts` (rf-crun-1). Pure shape
 * checks — no GCP, no async. Locks the `ResourceDeployResult` contract
 * the orchestrator and per-method modules will share once the rest of
 * the rf-crun series lands.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TYPE_SERVICE, TYPE_JOB, result, fail } from '../result-helpers.js';

describe('cloud-run/result-helpers', () => {
  describe('TYPE constants', () => {
    it('TYPE_SERVICE equals the canonical ICE iceType for Cloud Run services', () => {
      expect(TYPE_SERVICE).toBe('gcp.run.service');
    });

    it('TYPE_JOB equals the canonical ICE iceType for Cloud Run jobs', () => {
      expect(TYPE_JOB).toBe('gcp.run.job');
    });
  });

  describe('result()', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-04-30T12:00:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns the success shape with name reused as resource_id', () => {
      const start = Date.now() - 1234;
      const out = result('my-svc', TYPE_SERVICE, 'create', start);
      expect(out).toEqual({
        resource_id: 'my-svc',
        name: 'my-svc',
        type: TYPE_SERVICE,
        action: 'create',
        success: true,
        duration_ms: 1234,
      });
    });

    it('passes the type parameter through verbatim (service)', () => {
      const out = result('x', TYPE_SERVICE, 'create', Date.now());
      expect(out.type).toBe(TYPE_SERVICE);
    });

    it('passes the type parameter through verbatim (job)', () => {
      const out = result('x', TYPE_JOB, 'create', Date.now());
      expect(out.type).toBe(TYPE_JOB);
    });

    it('computes duration_ms as Date.now() - start', () => {
      const start = Date.now() - 5000;
      const out = result('x', TYPE_SERVICE, 'create', start);
      expect(out.duration_ms).toBe(5000);
    });

    it('returns duration_ms === 0 when start === Date.now()', () => {
      const start = Date.now();
      const out = result('x', TYPE_SERVICE, 'create', start);
      expect(out.duration_ms).toBe(0);
    });

    it('passes through the create action', () => {
      const out = result('x', TYPE_SERVICE, 'create', Date.now());
      expect(out.action).toBe('create');
    });

    it('passes through the update action', () => {
      const out = result('x', TYPE_SERVICE, 'update', Date.now());
      expect(out.action).toBe('update');
    });

    it('passes through the delete action', () => {
      const out = result('x', TYPE_SERVICE, 'delete', Date.now());
      expect(out.action).toBe('delete');
    });

    it('defaults overrides to an empty object when omitted', () => {
      const out = result('x', TYPE_SERVICE, 'create', Date.now());
      expect(out).toMatchObject({
        resource_id: 'x',
        name: 'x',
        type: TYPE_SERVICE,
        action: 'create',
        success: true,
        duration_ms: 0,
      });
      expect(Object.keys(out).sort()).toEqual(
        ['action', 'duration_ms', 'name', 'resource_id', 'success', 'type'].sort(),
      );
    });

    it('shallow-merges overrides over the base shape', () => {
      const out = result('x', TYPE_SERVICE, 'create', Date.now(), {
        provider_id: 'projects/p/locations/us/services/x',
        outputs: { url: 'https://x.run.app' },
      });
      expect(out.provider_id).toBe('projects/p/locations/us/services/x');
      expect(out.outputs).toEqual({ url: 'https://x.run.app' });
      expect(out.success).toBe(true);
      expect(out.type).toBe(TYPE_SERVICE);
    });

    it('lets overrides win the spread (e.g. action override)', () => {
      const out = result('x', TYPE_SERVICE, 'create', Date.now(), { action: 'update' });
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
      const out = fail('my-svc', TYPE_SERVICE, 'create', start, 'boom');
      expect(out).toEqual({
        resource_id: 'my-svc',
        name: 'my-svc',
        type: TYPE_SERVICE,
        action: 'create',
        success: false,
        error: 'boom',
        duration_ms: 250,
      });
    });

    it('reuses name as resource_id', () => {
      const out = fail('svc-a', TYPE_SERVICE, 'update', Date.now(), 'nope');
      expect(out.resource_id).toBe('svc-a');
      expect(out.name).toBe('svc-a');
    });

    it('passes the type parameter through (job)', () => {
      const out = fail('x', TYPE_JOB, 'create', Date.now(), 'e');
      expect(out.type).toBe(TYPE_JOB);
    });

    it('computes duration_ms as Date.now() - start', () => {
      const start = Date.now() - 9_999;
      const out = fail('x', TYPE_SERVICE, 'delete', start, 'gone');
      expect(out.duration_ms).toBe(9_999);
    });

    it('passes through the create action', () => {
      const out = fail('x', TYPE_SERVICE, 'create', Date.now(), 'e');
      expect(out.action).toBe('create');
    });

    it('passes through the update action', () => {
      const out = fail('x', TYPE_SERVICE, 'update', Date.now(), 'e');
      expect(out.action).toBe('update');
    });

    it('passes through the delete action', () => {
      const out = fail('x', TYPE_SERVICE, 'delete', Date.now(), 'e');
      expect(out.action).toBe('delete');
    });

    it('preserves the error string verbatim', () => {
      const out = fail('x', TYPE_SERVICE, 'create', Date.now(), 'multi\nline error');
      expect(out.error).toBe('multi\nline error');
    });
  });
});

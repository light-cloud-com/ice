/**
 * Tests for `load-balancer/result-helpers.ts` (rf-lbal-1).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TYPE, BASE_URL, result, fail } from '../result-helpers.js';

describe('load-balancer/result-helpers', () => {
  describe('TYPE', () => {
    it('equals the canonical ICE iceType for global forwarding rules', () => {
      expect(TYPE).toBe('gcp.compute.globalForwardingRule');
    });
  });

  describe('BASE_URL', () => {
    it('is the v1 Compute Engine REST endpoint', () => {
      expect(BASE_URL).toBe('https://compute.googleapis.com/compute/v1');
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

    it('returns the success shape with TYPE and reused resource_id', () => {
      const start = Date.now() - 1234;
      const out = result('my-lb', 'create', start);
      expect(out).toEqual({
        resource_id: 'my-lb',
        name: 'my-lb',
        type: TYPE,
        action: 'create',
        success: true,
        duration_ms: 1234,
      });
    });

    it('computes duration_ms correctly for update action', () => {
      const out = result('x', 'update', Date.now() - 500);
      expect(out.action).toBe('update');
      expect(out.duration_ms).toBe(500);
    });

    it('passes through delete action', () => {
      const out = result('x', 'delete', Date.now());
      expect(out.action).toBe('delete');
    });

    it('shallow-merges overrides over base shape', () => {
      const out = result('x', 'create', Date.now(), {
        provider_id: 'projects/p/global/forwardingRules/x',
        outputs: { ip_address: '1.2.3.4' },
      });
      expect(out.provider_id).toBe('projects/p/global/forwardingRules/x');
      expect(out.outputs).toEqual({ ip_address: '1.2.3.4' });
      expect(out.success).toBe(true);
    });

    it('lets overrides win the spread', () => {
      const out = result('x', 'create', Date.now(), { success: false });
      expect(out.success).toBe(false);
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

    it('returns failure shape with success: false and the error string', () => {
      const out = fail('lb', 'create', Date.now() - 250, 'boom');
      expect(out).toEqual({
        resource_id: 'lb',
        name: 'lb',
        type: TYPE,
        action: 'create',
        success: false,
        error: 'boom',
        duration_ms: 250,
      });
    });

    it('passes through update action', () => {
      const out = fail('x', 'update', Date.now(), 'e');
      expect(out.action).toBe('update');
    });

    it('passes through delete action', () => {
      const out = fail('x', 'delete', Date.now(), 'e');
      expect(out.action).toBe('delete');
    });

    it('preserves multi-line error verbatim', () => {
      const out = fail('x', 'create', Date.now(), 'line1\nline2');
      expect(out.error).toBe('line1\nline2');
    });
  });
});

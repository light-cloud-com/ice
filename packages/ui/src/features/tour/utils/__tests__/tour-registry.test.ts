/**
 * tour-1 — Tour registry tests.
 *
 * Covers the validation policy from blueprint §2.4 (and the test list at
 * §6/tour-1):
 *   - register/get round trip
 *   - duplicate tour id throws in dev, warns + overwrites in prod
 *   - duplicate step id throws regardless of env
 *   - empty steps throws regardless of env
 *   - unregister + allTours snapshot semantics
 *
 * `clearRegistry()` runs in `beforeEach` so each test starts from an
 * empty Map. NODE_ENV stubbing uses `vi.stubEnv` per the documented
 * vitest pattern; `vi.unstubAllEnvs()` in `afterEach` keeps tests
 * isolated. The registry has zero React surface, so no jsdom or
 * `vi.mock` is required.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { allTours, clearRegistry, getTour, registerTour, unregisterTour } from '../tour-registry';
import type { Tour, TourStep } from '../../tour.types';

const stubStep = (id: string, overrides: Partial<TourStep> = {}): TourStep => ({
  id,
  target: '#anywhere',
  title: 'tour.x.title',
  body: 'tour.x.body',
  ...overrides,
});

const stubTour = (id: string, stepIds: string[] = ['s1', 's2'], overrides: Partial<Tour> = {}): Tour => ({
  id,
  title: `tour.${id}.title`,
  steps: stepIds.map((sid) => stubStep(sid)),
  ...overrides,
});

describe('tour-registry', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearRegistry();
    // Silence + observe console.warn for the prod-overwrite test. Real
    // production builds emit one warn per duplicate; tests assert on
    // call count without polluting test runner output.
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    warnSpy.mockRestore();
    clearRegistry();
  });

  describe('registerTour + getTour', () => {
    it('adds a tour to the registry; getTour returns the same reference', () => {
      const t = stubTour('canvas-tour');
      registerTour(t);

      expect(getTour('canvas-tour')).toBe(t);
    });

    it('returns undefined for an unregistered tour id', () => {
      expect(getTour('nope')).toBeUndefined();
    });

    it('preserves tour fields verbatim — title, steps, autoStart, manualOnly', () => {
      const autoStart = vi.fn(() => true);
      const t: Tour = {
        id: 'palette-tour',
        title: 'tour.palette.title',
        steps: [stubStep('intro')],
        autoStart,
        manualOnly: true,
      };
      registerTour(t);

      const retrieved = getTour('palette-tour');
      expect(retrieved).toBe(t);
      expect(retrieved?.title).toBe('tour.palette.title');
      expect(retrieved?.steps).toHaveLength(1);
      expect(retrieved?.autoStart).toBe(autoStart);
      expect(retrieved?.manualOnly).toBe(true);
    });
  });

  describe('duplicate tour id', () => {
    it('throws in development (NODE_ENV !== "production")', () => {
      vi.stubEnv('NODE_ENV', 'development');
      registerTour(stubTour('dup-tour'));

      expect(() => registerTour(stubTour('dup-tour'))).toThrow(/already registered/i);
    });

    it('throws in test env too — anything non-production is dev-strict', () => {
      vi.stubEnv('NODE_ENV', 'test');
      registerTour(stubTour('dup-tour-test'));

      expect(() => registerTour(stubTour('dup-tour-test'))).toThrow(/already registered/i);
    });

    it('warns and overwrites in production', () => {
      vi.stubEnv('NODE_ENV', 'production');

      const first = stubTour('dup-tour-prod', ['s1']);
      const second = stubTour('dup-tour-prod', ['only-step']);

      registerTour(first);
      // Second registration must NOT throw under prod.
      expect(() => registerTour(second)).not.toThrow();

      // Warn fires exactly once for the overwrite.
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0]?.[0]).toMatch(/dup-tour-prod/);

      // Registry now points at the SECOND definition.
      const retrieved = getTour('dup-tour-prod');
      expect(retrieved).toBe(second);
      expect(retrieved?.steps[0]?.id).toBe('only-step');
    });
  });

  describe('step id validation', () => {
    it('throws when two steps share the same id (development)', () => {
      vi.stubEnv('NODE_ENV', 'development');

      expect(() => registerTour(stubTour('bad', ['s1', 's1']))).toThrow(/duplicate step id/i);
    });

    it('throws on duplicate step ids in PRODUCTION too — this is a structural bug, not env-conditional', () => {
      vi.stubEnv('NODE_ENV', 'production');

      expect(() => registerTour(stubTour('bad-prod', ['s1', 's2', 's1']))).toThrow(/duplicate step id/i);
    });

    it('rejects an empty steps array (development)', () => {
      vi.stubEnv('NODE_ENV', 'development');

      expect(() => registerTour({ id: 'empty', title: 't', steps: [] })).toThrow(/no steps/i);
    });

    it('rejects an empty steps array in production too — empty tours are always a bug', () => {
      vi.stubEnv('NODE_ENV', 'production');

      expect(() => registerTour({ id: 'empty-prod', title: 't', steps: [] })).toThrow(/no steps/i);
    });
  });

  describe('unregisterTour', () => {
    it('removes the tour; subsequent getTour returns undefined', () => {
      registerTour(stubTour('temp'));
      expect(getTour('temp')).toBeDefined();

      unregisterTour('temp');
      expect(getTour('temp')).toBeUndefined();
    });

    it('is a no-op for an unknown tour id (does not throw)', () => {
      expect(() => unregisterTour('never-registered')).not.toThrow();
    });

    it('allows re-registering after unregister without triggering the dup-id throw', () => {
      vi.stubEnv('NODE_ENV', 'development');

      registerTour(stubTour('cycle'));
      unregisterTour('cycle');
      // After unregister the slot is free — re-register must succeed.
      expect(() => registerTour(stubTour('cycle'))).not.toThrow();
    });
  });

  describe('allTours snapshot semantics', () => {
    it('returns an array containing every registered tour', () => {
      const a = stubTour('a');
      const b = stubTour('b');
      const c = stubTour('c');
      registerTour(a);
      registerTour(b);
      registerTour(c);

      const all = allTours();
      expect(all).toHaveLength(3);
      // Insertion order preserved (Map iteration semantics).
      expect(all.map((t) => t.id)).toEqual(['a', 'b', 'c']);
    });

    it('returns an empty array when no tours are registered', () => {
      expect(allTours()).toEqual([]);
    });

    it('returns a SNAPSHOT — mutating the array does not affect the registry', () => {
      registerTour(stubTour('keep'));

      const snapshot = allTours();
      // Pushing onto the snapshot must not bleed into the registry.
      snapshot.push(stubTour('phantom'));
      // Splicing the snapshot must not remove from the registry.
      snapshot.splice(0, 1);

      expect(allTours()).toHaveLength(1);
      expect(allTours().map((t) => t.id)).toEqual(['keep']);
      expect(getTour('phantom')).toBeUndefined();
    });

    it('reflects unregistration in subsequent allTours calls', () => {
      registerTour(stubTour('x'));
      registerTour(stubTour('y'));
      expect(allTours().map((t) => t.id)).toEqual(['x', 'y']);

      unregisterTour('x');
      expect(allTours().map((t) => t.id)).toEqual(['y']);
    });
  });

  describe('clearRegistry (test-only utility)', () => {
    it('empties the registry', () => {
      registerTour(stubTour('one'));
      registerTour(stubTour('two'));
      expect(allTours()).toHaveLength(2);

      clearRegistry();
      expect(allTours()).toEqual([]);
      expect(getTour('one')).toBeUndefined();
    });
  });
});

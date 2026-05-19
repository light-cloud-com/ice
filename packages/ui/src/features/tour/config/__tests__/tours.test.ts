/**
 * Tour config validation tests.
 *
 * Pure data-shape tests under node-env. No React, no DOM, no slice —
 * we're asserting that the in-tree tour configs satisfy the contracts
 * the runner expects.
 */
import { describe, it, expect } from 'vitest';
import { canvasTour } from '../canvas-tour';
import { dashboardTour } from '../dashboard-tour';
import { tours } from '../tours';
import type { Tour, TourStep } from '../../tour.types';

const allConfigured: readonly Tour[] = tours;

describe('tours config — registry surface', () => {
  it('exports the dashboard and canvas tours', () => {
    const ids = allConfigured.map((t) => t.id);
    expect(ids).toContain('dashboard-tour');
    expect(ids).toContain('canvas-tour');
  });

  it('every tour has a non-empty steps array', () => {
    for (const t of allConfigured) {
      expect(Array.isArray(t.steps)).toBe(true);
      expect(t.steps.length).toBeGreaterThan(0);
    }
  });

  it('every tour title is an i18n-key string', () => {
    for (const t of allConfigured) {
      expect(typeof t.title).toBe('string');
      expect(t.title.length).toBeGreaterThan(0);
    }
  });
});

describe('tours config — step-shape invariants', () => {
  it('every step id is unique within its tour', () => {
    for (const t of allConfigured) {
      const seen = new Set<string>();
      for (const s of t.steps) {
        expect(seen.has(s.id)).toBe(false);
        seen.add(s.id);
      }
    }
  });

  it('every step target is a string CSS selector or a function', () => {
    for (const t of allConfigured) {
      for (const s of t.steps) {
        const validTarget = typeof s.target === 'string' || typeof s.target === 'function';
        expect(validTarget).toBe(true);
      }
    }
  });

  it('every step title and string body is a non-empty i18n key', () => {
    for (const t of allConfigured) {
      for (const s of t.steps) {
        expect(typeof s.title).toBe('string');
        expect(s.title.length).toBeGreaterThan(0);
        // body may be a ReactNode; if it's a string, it must be non-empty.
        if (typeof s.body === 'string') {
          expect(s.body.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('every placement (when set) is one of the allowed Placement values', () => {
    const allowed = new Set(['top', 'bottom', 'left', 'right', 'auto']);
    for (const t of allConfigured) {
      for (const s of t.steps) {
        if (s.placement !== undefined) {
          expect(allowed.has(s.placement)).toBe(true);
        }
      }
    }
  });
});

describe('canvas-tour — shape', () => {
  it('has the 10 expected step ids in top-to-bottom order', () => {
    expect(canvasTour.steps.map((s: TourStep) => s.id)).toEqual([
      'canvas-overview',
      'projects',
      'blocks',
      'templates',
      'properties',
      'ai',
      'cost',
      'integration-cloud',
      'integration-github',
      'deploy',
    ]);
  });

  it('all steps target id-prefixed anchors', () => {
    for (const s of canvasTour.steps) {
      expect(typeof s.target).toBe('string');
      expect((s.target as string).startsWith('#')).toBe(true);
    }
  });

  it('terminal step (deploy) hides skip and uses finish label', () => {
    const last = canvasTour.steps[canvasTour.steps.length - 1];
    expect(last.id).toBe('deploy');
    expect(last.actions?.hideSkip).toBe(true);
    expect(last.actions?.nextLabel).toBe('tour.actions.finish');
  });

  it('declares an autoStart predicate', () => {
    expect(typeof canvasTour.autoStart).toBe('function');
  });
});

describe('dashboard-tour — shape', () => {
  it('has 2 steps in order', () => {
    expect(dashboardTour.steps.map((s: TourStep) => s.id)).toEqual(['dashboard-overview', 'create-project']);
  });

  it('declares an autoStart predicate', () => {
    expect(typeof dashboardTour.autoStart).toBe('function');
  });

  it('has unique tour id', () => {
    expect(dashboardTour.id).toBe('dashboard-tour');
    expect(dashboardTour.id).not.toBe(canvasTour.id);
  });
});

describe('tours config — defensive invariants', () => {
  it('no two tours share the same id', () => {
    const ids = allConfigured.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('no step in any tour declares a route that contradicts itself', () => {
    // No step in v1 sets `route`; if a future step does, the value
    // must be a string starting with '/'.
    for (const t of allConfigured) {
      for (const s of t.steps) {
        if (s.route !== undefined) {
          expect(typeof s.route).toBe('string');
          expect(s.route.startsWith('/')).toBe(true);
        }
      }
    }
  });
});

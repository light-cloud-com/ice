/**
 * tour-11 — `useTourRoute` hook tests.
 *
 * Per decision 2026-05-08, this is a render-driven hook with no DOM
 * surface beyond what react-router-dom hands it; runs under node-env
 * with `react-router-dom` mocked. The hook itself only consumes
 * `useNavigate` + `useLocation` + `useCallback`; we stub `useCallback`
 * to identity (matching `use-tour.test.ts`) and let the test drive the
 * hook directly.
 *
 * Mocks:
 *   - `react.useCallback` → identity, so the hook can be called outside
 *     a React renderer.
 *   - `react-router-dom.useLocation` → returns `{ pathname }` from the
 *     hoisted `mocks` bag; tests overwrite per case.
 *   - `react-router-dom.useNavigate` → returns the hoisted `mocks.navigate`
 *     spy; tests assert on its call args.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn<(to: string) => void>(),
  pathname: '/',
}));

vi.mock('react', () => ({
  useCallback: <T extends (...args: never[]) => unknown>(fn: T): T => fn,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
  useLocation: () => ({ pathname: mocks.pathname }),
}));

import { useTourRoute } from '../use-tour-route';

beforeEach(() => {
  mocks.navigate.mockReset();
  mocks.pathname = '/';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ────────────────────────────────────────────────────────────────────────────

describe('useTourRoute — phase derivation', () => {
  it('targetRoute=undefined → phase="arrived" immediately', () => {
    mocks.pathname = '/whatever';
    const { phase } = useTourRoute({ targetRoute: undefined });
    expect(phase).toBe('arrived');
  });

  it('targetRoute set + pathname mismatch → phase="navigating"', () => {
    mocks.pathname = '/y';
    const { phase } = useTourRoute({ targetRoute: '/x' });
    expect(phase).toBe('navigating');
  });

  it('pathname exactly equals targetRoute → phase="arrived"', () => {
    mocks.pathname = '/x';
    const { phase } = useTourRoute({ targetRoute: '/x' });
    expect(phase).toBe('arrived');
  });

  it('pathname = "/x/sub" + targetRoute = "/x" → phase="arrived" (startsWith)', () => {
    mocks.pathname = '/x/sub';
    const { phase } = useTourRoute({ targetRoute: '/x' });
    expect(phase).toBe('arrived');
  });

  it('pathname = "/xa" + targetRoute = "/x" → phase="arrived" (raw startsWith)', () => {
    // Documented behavior: the comparison is `startsWith`, not segment
    // equality. v1 anchors like `/settings/account` and `/projects/:id`
    // never collide on prefix in practice; if a future tour needs strict
    // segment matching, the hook spec would be updated.
    mocks.pathname = '/xa';
    const { phase } = useTourRoute({ targetRoute: '/x' });
    expect(phase).toBe('arrived');
  });

  it('targetRoute changes from "/x" to "/y" — recomputes against current pathname', () => {
    mocks.pathname = '/x';
    let r = useTourRoute({ targetRoute: '/x' });
    expect(r.phase).toBe('arrived');
    // Mid-flight: tour switches to a new step with a different route.
    r = useTourRoute({ targetRoute: '/y' });
    expect(r.phase).toBe('navigating');
  });

  it('pathname changes mid-flight from "/y" to "/x" → "navigating" then "arrived"', () => {
    mocks.pathname = '/y';
    let r = useTourRoute({ targetRoute: '/x' });
    expect(r.phase).toBe('navigating');
    // Simulate router-driven re-render: pathname has updated.
    mocks.pathname = '/x';
    r = useTourRoute({ targetRoute: '/x' });
    expect(r.phase).toBe('arrived');
  });
});

describe('useTourRoute — navigateTo', () => {
  it('calls useNavigate() with the targetRoute when not yet there', () => {
    mocks.pathname = '/y';
    const { navigateTo } = useTourRoute({ targetRoute: '/x' });
    navigateTo();
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledWith('/x');
  });

  it('no-op when already at the targetRoute (exact match)', () => {
    mocks.pathname = '/x';
    const { navigateTo } = useTourRoute({ targetRoute: '/x' });
    navigateTo();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('no-op when at a sub-path of the targetRoute (startsWith semantics)', () => {
    mocks.pathname = '/x/sub';
    const { navigateTo } = useTourRoute({ targetRoute: '/x' });
    navigateTo();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('no-op when targetRoute is undefined', () => {
    mocks.pathname = '/anything';
    const { navigateTo } = useTourRoute({ targetRoute: undefined });
    navigateTo();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('subsequent calls after pathname update become no-ops', () => {
    mocks.pathname = '/y';
    let r = useTourRoute({ targetRoute: '/x' });
    r.navigateTo();
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    // Router updates: re-render with the new pathname.
    mocks.pathname = '/x';
    r = useTourRoute({ targetRoute: '/x' });
    r.navigateTo();
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
  });
});

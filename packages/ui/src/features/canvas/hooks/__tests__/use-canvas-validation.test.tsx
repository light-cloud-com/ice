/**
 * Tests for `useCanvasValidation` — debounced validation hook.
 *
 * Strategy:
 *   - Mock `useEffect` to fire synchronously and stash any cleanup.
 *   - Mock `useRef` so we can inspect the timer ref.
 *   - Mock `useDispatch` and `useSelector` (with a hoisted state).
 *   - Mock `validateCanvas` to return a deterministic result.
 *   - Drive `setTimeout` via fake timers so the debounced body runs.
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  dispatch: vi.fn(),
  selectActiveCard: vi.fn(() => null as unknown),
  validateCanvas: vi.fn(() => ({
    issues: [],
    valid: true,
    deployable: true,
    summary: { errors: 0, warnings: 0, infos: 0 },
    validatedAt: 1234567890,
  })),
  setValidationResult: vi.fn((p: unknown) => ({ type: 'validation/setResult', payload: p })),
  setValidating: vi.fn((p: unknown) => ({ type: 'validation/setValidating', payload: p })),
  clearValidation: vi.fn(() => ({ type: 'validation/clear' })),
}));

const effectCleanups: Array<() => void> = [];
const sharedRef = { current: null as ReturnType<typeof setTimeout> | null };

vi.mock('react', async (orig) => {
  const actual = (await orig()) as typeof import('react');
  return {
    ...actual,
    useEffect: (cb: () => void | (() => void)) => {
      const cleanup = cb();
      if (typeof cleanup === 'function') effectCleanups.push(cleanup);
    },
    // Reuse the same ref across `mount()` calls so the `if (timerRef.current)`
    // guard can be exercised on the second mount.
    useRef: <T,>(initial: T) => {
      if (sharedRef.current === null && initial !== null) {
        // First render — honor initial.
        sharedRef.current = initial as unknown as ReturnType<typeof setTimeout>;
      }
      return sharedRef as unknown as { current: T };
    },
  };
});

vi.mock('react-redux', () => ({
  useDispatch: () => mocks.dispatch,
  useSelector: (sel: (s: unknown) => unknown) => sel(mocks.state),
}));

vi.mock('@ice/core/validation', () => ({
  validateCanvas: mocks.validateCanvas,
}));

vi.mock('../../../../store/slices/cards-slice', () => ({
  selectActiveCard: mocks.selectActiveCard,
}));

vi.mock('../../../../store/slices/validation-slice', () => ({
  setValidationResult: mocks.setValidationResult,
  setValidating: mocks.setValidating,
  clearValidation: mocks.clearValidation,
}));

import { useCanvasValidation } from '../use-canvas-validation';

const mount = () => {
  const Probe: React.FC = () => {
    useCanvasValidation();
    return null;
  };
  renderToString(React.createElement(Probe));
};

beforeEach(() => {
  vi.useFakeTimers();
  effectCleanups.length = 0;
  sharedRef.current = null;
  mocks.state = {
    environments: {},
  };
  mocks.dispatch.mockReset();
  mocks.selectActiveCard.mockReset();
  mocks.selectActiveCard.mockReturnValue(null);
  mocks.validateCanvas.mockReset();
  mocks.validateCanvas.mockReturnValue({
    issues: [],
    valid: true,
    deployable: true,
    summary: { errors: 0, warnings: 0, infos: 0 },
    validatedAt: 1234567890,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('useCanvasValidation — no active card', () => {
  it('dispatches clearValidation when there is no active card', () => {
    mocks.selectActiveCard.mockReturnValue(null);
    mount();
    expect(mocks.clearValidation).toHaveBeenCalled();
    expect(mocks.dispatch).toHaveBeenCalledWith({ type: 'validation/clear' });
  });

  it('does NOT call validateCanvas when card is missing', () => {
    mocks.selectActiveCard.mockReturnValue(null);
    mount();
    vi.advanceTimersByTime(1000);
    expect(mocks.validateCanvas).not.toHaveBeenCalled();
  });
});

describe('useCanvasValidation — active card', () => {
  beforeEach(() => {
    mocks.selectActiveCard.mockReturnValue({
      nodes: [{ id: 'n1', type: 'block', data: { iceType: 'Compute' }, parentId: undefined }],
      edges: [{ id: 'e1', source: 'n1', target: 'n2', data: { relationship: 'connects_to' } }],
    });
  });

  it('dispatches setValidating(true) immediately', () => {
    mount();
    expect(mocks.setValidating).toHaveBeenCalledWith(true);
    expect(mocks.dispatch).toHaveBeenCalledWith({ type: 'validation/setValidating', payload: true });
  });

  it('does NOT dispatch setValidationResult before the debounce elapses', () => {
    mount();
    expect(mocks.setValidationResult).not.toHaveBeenCalled();
  });

  it('dispatches setValidationResult after 500ms', () => {
    mount();
    vi.advanceTimersByTime(500);
    expect(mocks.setValidationResult).toHaveBeenCalled();
    const arg = mocks.setValidationResult.mock.calls[0][0] as {
      issues: unknown[];
      valid: boolean;
      deployable: boolean;
    };
    expect(arg).toMatchObject({ valid: true, deployable: true });
    expect(arg.issues).toEqual([]);
  });

  it('passes the mapped node/edge shapes to validateCanvas', () => {
    mount();
    vi.advanceTimersByTime(500);
    expect(mocks.validateCanvas).toHaveBeenCalled();
    const [validatableNodes, validatableEdges, opts] = mocks.validateCanvas.mock.calls[0];
    expect(validatableNodes).toEqual([{ id: 'n1', type: 'block', data: { iceType: 'Compute' }, parentId: undefined }]);
    expect(validatableEdges).toEqual([{ id: 'e1', source: 'n1', target: 'n2', data: { relationship: 'connects_to' } }]);
    expect(opts).toMatchObject({ mode: 'design' });
  });

  it('reads provider from environments slice when set', () => {
    mocks.state = {
      environments: { activeProvider: 'gcp' },
    };
    mount();
    vi.advanceTimersByTime(500);
    expect(mocks.validateCanvas).toHaveBeenCalled();
    const [, , opts] = mocks.validateCanvas.mock.calls[0];
    expect(opts).toMatchObject({ provider: 'gcp' });
  });
});

describe('useCanvasValidation — window mirroring', () => {
  beforeEach(() => {
    mocks.selectActiveCard.mockReturnValue({
      nodes: [{ id: 'n1', type: 'block', data: {}, parentId: undefined }],
      edges: [],
    });
  });

  it('mirrors result to window when localStorage flag is "true"', () => {
    const winStub: Record<string, unknown> = {
      localStorage: {
        getItem: (k: string) => (k === 'ice-action-log' ? 'true' : null),
      },
    };
    vi.stubGlobal('window', winStub);
    mount();
    vi.advanceTimersByTime(500);
    expect((winStub as { __ICE_VALIDATION__?: unknown }).__ICE_VALIDATION__).toBeDefined();
  });

  it('does NOT mirror when localStorage flag is missing', () => {
    const winStub: Record<string, unknown> = {
      localStorage: { getItem: () => null },
    };
    vi.stubGlobal('window', winStub);
    mount();
    vi.advanceTimersByTime(500);
    expect((winStub as { __ICE_VALIDATION__?: unknown }).__ICE_VALIDATION__).toBeUndefined();
  });

  it('swallows errors thrown by localStorage access', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('storage-disabled');
        },
      },
    });
    mount();
    expect(() => vi.advanceTimersByTime(500)).not.toThrow();
  });
});

describe('useCanvasValidation — cleanup', () => {
  it('the effect cleanup clears the pending timeout', () => {
    mocks.selectActiveCard.mockReturnValue({
      nodes: [{ id: 'n1', type: 'block', data: {}, parentId: undefined }],
      edges: [],
    });
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    mount();
    expect(effectCleanups.length).toBeGreaterThan(0);
    effectCleanups[0]();
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it('cleanup is a no-op when no timer was scheduled (early return)', () => {
    mocks.selectActiveCard.mockReturnValue(null);
    mount();
    // Early return path — no cleanup function pushed.
    expect(effectCleanups.length).toBe(0);
  });

  it('clears an existing pending timer on a re-render', () => {
    mocks.selectActiveCard.mockReturnValue({
      nodes: [{ id: 'n1', type: 'block', data: {}, parentId: undefined }],
      edges: [],
    });
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    // First mount schedules a timer; sharedRef.current becomes the timer ref.
    mount();
    expect(sharedRef.current).not.toBeNull();
    clearTimeoutSpy.mockClear();
    // Second mount with the SAME shared ref will hit the
    // `if (timerRef.current) clearTimeout(...)` guard.
    mount();
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});

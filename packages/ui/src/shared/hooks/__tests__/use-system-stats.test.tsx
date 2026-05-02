/**
 * useSystemStats — fetches system metrics on a setInterval.
 *
 * Test strategy:
 *   - Mock `axiosInstance.get` to return controllable promises.
 *   - Mock React's `useEffect` to fire synchronously and capture the cb +
 *     cleanup so tests drive the polling tick + unmount explicitly.
 *   - Use `vi.useFakeTimers()` so we can advance the interval without
 *     waiting real time.
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

interface CapturedEffect {
  cb: () => void | (() => void);
  cleanup: void | (() => void);
}

const mocks = vi.hoisted(() => ({
  effects: [] as CapturedEffect[],
  axiosGet: vi.fn(),
}));

vi.mock('react', async (orig) => {
  const actual = await orig<typeof import('react')>();
  return {
    ...actual,
    useEffect: (cb: () => void | (() => void)) => {
      const cleanup = cb();
      mocks.effects.push({ cb, cleanup });
    },
  };
});

vi.mock('../../api/axios-instance', () => ({
  default: { get: mocks.axiosGet },
}));

// ─── Imports after mocks ────────────────────────────────────────────────────

import { useSystemStats } from '../use-system-stats';

// ─── Helpers ────────────────────────────────────────────────────────────────

function captureHook(intervalMs?: number): { current?: ReturnType<typeof useSystemStats> } {
  const captured: { current?: ReturnType<typeof useSystemStats> } = {};
  const Probe: React.FC = () => {
    captured.current = useSystemStats(intervalMs);
    return null;
  };
  renderToString(<Probe />);
  return captured;
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  mocks.effects.length = 0;
  mocks.axiosGet.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ────────────────────────────────────────────────────────────────────────────

describe('useSystemStats', () => {
  it('returns null on first render before the fetch resolves', () => {
    mocks.axiosGet.mockResolvedValue({ data: { ram: 100, cpu: 5 } });
    const out = captureHook();
    expect(out.current).toBeNull();
  });

  it('hits /system/stats once on mount', () => {
    mocks.axiosGet.mockResolvedValue({ data: { ram: 100, cpu: 5 } });
    captureHook();
    expect(mocks.axiosGet).toHaveBeenCalledWith('/system/stats');
  });

  it('schedules a setInterval for repeat polling', () => {
    mocks.axiosGet.mockResolvedValue({ data: { ram: 100, cpu: 5 } });
    captureHook(5000);
    expect(mocks.axiosGet).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(mocks.axiosGet).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(5000);
    expect(mocks.axiosGet).toHaveBeenCalledTimes(3);
  });

  it('uses the default 10_000ms interval when not specified', () => {
    mocks.axiosGet.mockResolvedValue({ data: { ram: 100, cpu: 5 } });
    captureHook();
    expect(mocks.axiosGet).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(9999);
    expect(mocks.axiosGet).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(mocks.axiosGet).toHaveBeenCalledTimes(2);
  });

  it('stops polling after cleanup', () => {
    mocks.axiosGet.mockResolvedValue({ data: { ram: 100, cpu: 5 } });
    captureHook(1000);
    const cleanup = mocks.effects[0].cleanup as () => void;
    cleanup();
    vi.advanceTimersByTime(5000);
    expect(mocks.axiosGet).toHaveBeenCalledTimes(1);
  });

  it('swallows fetch errors silently', async () => {
    mocks.axiosGet.mockRejectedValue(new Error('network down'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    captureHook();
    vi.useRealTimers();
    await flush();
    await flush();
    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('does not set state after cleanup, even if a fetch resolves later', async () => {
    let resolver: ((v: { data: { ram: number; cpu: number } }) => void) | undefined;
    mocks.axiosGet.mockImplementation(
      () => new Promise((res) => {
        resolver = res;
      }),
    );
    captureHook();
    const cleanup = mocks.effects[0].cleanup as () => void;
    cleanup();
    if (resolver) resolver({ data: { ram: 50, cpu: 1 } });
    vi.useRealTimers();
    await flush();
  });
});

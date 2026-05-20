/**
 * `debug-logger` exposes three thin wrappers around a gated `console.debug`:
 *
 *   logCanvasRender / logBlueprint / logDrop
 *
 * The module memoizes the gate state in `_debugEnabled`, so each test re-imports
 * via `vi.resetModules()` to reset the cache. Tests stub `localStorage` and
 * `console.debug` with `vi.stubGlobal` (no jsdom) and walk every branch:
 * enabled / disabled / localStorage-throws / data-undefined / data-present.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

interface FakeStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

function makeStorage(value: string | null = null): FakeStorage {
  return {
    getItem: vi.fn((k: string) => (k === 'ice-debug' ? value : null)),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('debug-logger — gating behavior', () => {
  beforeEach(() => {
    // Each test gets a fresh module so `_debugEnabled` starts as `null`.
    vi.resetModules();
  });

  it('logCanvasRender does NOT call console.debug when localStorage flag is unset', async () => {
    vi.stubGlobal('localStorage', makeStorage(null));
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const { logCanvasRender } = await import('../debug-logger');
    logCanvasRender({ nodeCount: 10, edgeCount: 5, visibleCount: 8, viewLevel: 2 });
    expect(debugSpy).not.toHaveBeenCalled();
  });

  it('logCanvasRender calls console.debug when localStorage flag is "true"', async () => {
    vi.stubGlobal('localStorage', makeStorage('true'));
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const { logCanvasRender } = await import('../debug-logger');
    logCanvasRender({ nodeCount: 10, edgeCount: 5, visibleCount: 8, viewLevel: 2 });
    expect(debugSpy).toHaveBeenCalledTimes(1);
    // Format string includes prefix + body summary.
    const [fmt] = debugSpy.mock.calls[0];
    expect(fmt).toContain('[ICE:Canvas]');
    expect(fmt).toContain('Render: 8/10 nodes, 5 edges, L2');
  });

  it('treats a non-"true" localStorage value as disabled', async () => {
    vi.stubGlobal('localStorage', makeStorage('1'));
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const { logCanvasRender } = await import('../debug-logger');
    logCanvasRender({ nodeCount: 1, edgeCount: 0, visibleCount: 1, viewLevel: 1 });
    expect(debugSpy).not.toHaveBeenCalled();
  });

  it('treats a localStorage that throws on getItem as disabled (catch branch)', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const { logCanvasRender } = await import('../debug-logger');
    logCanvasRender({ nodeCount: 1, edgeCount: 0, visibleCount: 1, viewLevel: 1 });
    expect(debugSpy).not.toHaveBeenCalled();
  });

  it('caches the gate state across calls (only reads localStorage once)', async () => {
    const storage = makeStorage('true');
    vi.stubGlobal('localStorage', storage);
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const { logCanvasRender } = await import('../debug-logger');
    logCanvasRender({ nodeCount: 1, edgeCount: 0, visibleCount: 1, viewLevel: 1 });
    logCanvasRender({ nodeCount: 2, edgeCount: 0, visibleCount: 2, viewLevel: 1 });
    // localStorage.getItem read once, console.debug called twice.
    expect(storage.getItem).toHaveBeenCalledTimes(1);
    expect(debugSpy).toHaveBeenCalledTimes(2);
  });
});

describe('debug-logger — message formatting', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('localStorage', makeStorage('true'));
  });

  it('logBlueprint passes the data object as a fourth arg (data !== undefined branch)', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const { logBlueprint } = await import('../debug-logger');
    const data = { type: 'StaticSite', childCount: 3, containerWidth: 240, containerHeight: 160 };
    logBlueprint(data);
    expect(debugSpy).toHaveBeenCalledTimes(1);
    const args = debugSpy.mock.calls[0];
    expect(args[0]).toContain('[ICE:Blueprint]');
    expect(args[0]).toContain('Expand: StaticSite (3 children, 240x160)');
    // The data object lives at index 3 (after format, two color styles).
    expect(args[3]).toBe(data);
  });

  it('logDrop rounds fractional positions for the format string', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const { logDrop } = await import('../debug-logger');
    logDrop({ position: { x: 12.4, y: 87.6 }, nodeType: 'Compute.Container' });
    const args = debugSpy.mock.calls[0];
    expect(args[0]).toContain('Drop: Compute.Container at (12, 88)');
  });

  it('logCanvasRender (no data arg) takes the 3-arg overload (data === undefined branch)', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const { logCanvasRender } = await import('../debug-logger');
    logCanvasRender({ nodeCount: 1, edgeCount: 0, visibleCount: 1, viewLevel: 3 });
    const args = debugSpy.mock.calls[0];
    // Only three args (format + two color styles); no data tail.
    expect(args).toHaveLength(3);
  });
});

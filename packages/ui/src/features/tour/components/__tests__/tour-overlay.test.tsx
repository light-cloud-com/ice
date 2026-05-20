// @vitest-environment jsdom
/**
 * tour-8 — TourOverlay tests.
 *
 * Per the 2026-05-08 decision in `state/decisions.md` ("Test environment
 * ceiling for the tour engine"), this suite runs under jsdom — React +
 * portal interactions are not worth a ~70-line fake-DOM harness when
 * jsdom hands us `document.body`, `getBoundingClientRect`, and event
 * dispatch for free.
 *
 * `useReducedMotion` is mocked via `vi.mock` so we can flip the value
 * per test without monkey-patching `window.matchMedia`. The mock
 * factory reads from a hoisted `mocks` bag (matches the existing
 * `svg-connection-path.test.tsx` pattern in `features/canvas`).
 */

import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  reducedMotion: false,
}));

vi.mock('../../../../shared/hooks/use-reduced-motion', () => ({
  useReducedMotion: () => mocks.reducedMotion,
}));

import { TourOverlay } from '../tour-overlay';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeRect(init: { left: number; top: number; width: number; height: number }): DOMRect {
  const { left, top, width, height } = init;
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({ x: left, y: top, left, top, width, height, right: left + width, bottom: top + height }),
  } as DOMRect;
}

let container: HTMLDivElement;
let root: Root;

function render(ui: React.ReactElement): void {
  act(() => {
    root.render(ui);
  });
}

function unmount(): void {
  act(() => {
    root.unmount();
  });
}

beforeEach(() => {
  mocks.reducedMotion = false;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  unmount();
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

function getSpotlight(): HTMLElement | null {
  return document.querySelector('[data-tour-overlay="spotlight"]');
}

function getShield(side: 'top' | 'bottom' | 'left' | 'right'): HTMLElement | null {
  return document.querySelector(`[data-tour-shield="${side}"]`);
}

function getAllShields(): HTMLElement[] {
  return Array.from(document.querySelectorAll('[data-tour-shield]'));
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('TourOverlay', () => {
  it('renders nothing when rect is null', () => {
    render(<TourOverlay rect={null} onSkip={vi.fn()} />);
    expect(getSpotlight()).toBeNull();
    expect(getAllShields()).toHaveLength(0);
  });

  it('spotlight position matches rect + pad', () => {
    const rect = makeRect({ left: 100, top: 200, width: 50, height: 40 });
    render(<TourOverlay rect={rect} pad={8} onSkip={vi.fn()} />);
    const spotlight = getSpotlight();
    expect(spotlight).not.toBeNull();
    // pad=8 → expanded by 8 on every side.
    expect(spotlight!.style.left).toBe('92px'); // 100 - 8
    expect(spotlight!.style.top).toBe('192px'); // 200 - 8
    expect(spotlight!.style.width).toBe('66px'); // 50 + 16
    expect(spotlight!.style.height).toBe('56px'); // 40 + 16
  });

  it('uses the default pad of 8 when not provided', () => {
    const rect = makeRect({ left: 0, top: 0, width: 10, height: 10 });
    render(<TourOverlay rect={rect} onSkip={vi.fn()} />);
    const spotlight = getSpotlight()!;
    // (0 - 8, 0 - 8, 10 + 16, 10 + 16)
    expect(spotlight.style.left).toBe('-8px');
    expect(spotlight.style.top).toBe('-8px');
    expect(spotlight.style.width).toBe('26px');
    expect(spotlight.style.height).toBe('26px');
  });

  it('click on any shield strip calls onSkip', () => {
    const onSkip = vi.fn();
    const rect = makeRect({ left: 100, top: 100, width: 200, height: 80 });
    render(<TourOverlay rect={rect} pad={0} onSkip={onSkip} />);
    for (const side of ['top', 'bottom', 'left', 'right'] as const) {
      const shield = getShield(side);
      expect(shield).not.toBeNull();
      shield!.click();
    }
    expect(onSkip).toHaveBeenCalledTimes(4);
  });

  it('click on spotlight inner area does NOT trigger onSkip (no shield in rect)', () => {
    const onSkip = vi.fn();
    const rect = makeRect({ left: 100, top: 100, width: 200, height: 80 });
    render(<TourOverlay rect={rect} pad={0} onSkip={onSkip} />);
    // Place a child *inside* the spotlight rect and click it. None of
    // the four strips covers the inner rect, so the click target is
    // exclusively the inner element — the shield handlers must not fire.
    const inner = document.createElement('button');
    inner.style.position = 'fixed';
    inner.style.left = '150px';
    inner.style.top = '120px';
    document.body.appendChild(inner);
    inner.click();
    expect(onSkip).not.toHaveBeenCalled();
  });

  it('useReducedMotion() true → no transition style on spotlight', () => {
    mocks.reducedMotion = true;
    const rect = makeRect({ left: 0, top: 0, width: 50, height: 50 });
    render(<TourOverlay rect={rect} onSkip={vi.fn()} />);
    const spotlight = getSpotlight()!;
    expect(spotlight.style.transition).toBe('');
  });

  it('useReducedMotion() false → spotlight carries the 180ms transition', () => {
    mocks.reducedMotion = false;
    const rect = makeRect({ left: 0, top: 0, width: 50, height: 50 });
    render(<TourOverlay rect={rect} onSkip={vi.fn()} />);
    const spotlight = getSpotlight()!;
    // jsdom normalizes whitespace but keeps the property names + durations.
    expect(spotlight.style.transition).toContain('top');
    expect(spotlight.style.transition).toContain('180ms');
    expect(spotlight.style.transition).toContain('width');
  });

  it('radius prop applied to border-radius', () => {
    const rect = makeRect({ left: 0, top: 0, width: 50, height: 50 });
    render(<TourOverlay rect={rect} radius={20} onSkip={vi.fn()} />);
    expect(getSpotlight()!.style.borderRadius).toBe('20px');
  });

  it('default radius is 8', () => {
    const rect = makeRect({ left: 0, top: 0, width: 50, height: 50 });
    render(<TourOverlay rect={rect} onSkip={vi.fn()} />);
    expect(getSpotlight()!.style.borderRadius).toBe('8px');
  });

  it('spotlight is pointer-events: none', () => {
    const rect = makeRect({ left: 0, top: 0, width: 50, height: 50 });
    render(<TourOverlay rect={rect} onSkip={vi.fn()} />);
    expect(getSpotlight()!.style.pointerEvents).toBe('none');
  });

  it('shield strips are pointer-events: auto', () => {
    const rect = makeRect({ left: 0, top: 0, width: 50, height: 50 });
    render(<TourOverlay rect={rect} onSkip={vi.fn()} />);
    for (const strip of getAllShields()) {
      expect(strip.style.pointerEvents).toBe('auto');
    }
  });

  it('strip math: rect (100,100,200x80) → top h=100, bottom top=180, left w=100, right left=300', () => {
    // pad=0 so the spotlight equals the input rect verbatim.
    const rect = makeRect({ left: 100, top: 100, width: 200, height: 80 });
    render(<TourOverlay rect={rect} pad={0} onSkip={vi.fn()} />);
    const top = getShield('top')!;
    const bottom = getShield('bottom')!;
    const left = getShield('left')!;
    const right = getShield('right')!;

    // Top: top=0, height=100 (the rect's top edge).
    expect(top.style.top).toBe('0px');
    expect(top.style.height).toBe('100px');

    // Bottom: top = rect.bottom = 180.
    expect(bottom.style.top).toBe('180px');

    // Left: width = rect.left = 100.
    expect(left.style.width).toBe('100px');

    // Right: left = rect.right = 300.
    expect(right.style.left).toBe('300px');
  });

  it('negative pad clamps width/height at zero (no negative dimensions)', () => {
    // pad=-100 on a 50x40 rect would normally produce -150 width — clamp to 0.
    const rect = makeRect({ left: 100, top: 100, width: 50, height: 40 });
    render(<TourOverlay rect={rect} pad={-100} onSkip={vi.fn()} />);
    const spotlight = getSpotlight()!;
    expect(spotlight.style.width).toBe('0px');
    expect(spotlight.style.height).toBe('0px');
    // left/top still shift by -pad (=+100) since the math is rect.left - pad.
    expect(spotlight.style.left).toBe('200px');
    expect(spotlight.style.top).toBe('200px');
  });

  it('re-render with a new rect updates positions', () => {
    const r1 = makeRect({ left: 10, top: 20, width: 30, height: 40 });
    render(<TourOverlay rect={r1} pad={0} onSkip={vi.fn()} />);
    expect(getSpotlight()!.style.left).toBe('10px');

    const r2 = makeRect({ left: 500, top: 600, width: 80, height: 90 });
    render(<TourOverlay rect={r2} pad={0} onSkip={vi.fn()} />);
    const spotlight = getSpotlight()!;
    expect(spotlight.style.left).toBe('500px');
    expect(spotlight.style.top).toBe('600px');
    expect(spotlight.style.width).toBe('80px');
    expect(spotlight.style.height).toBe('90px');

    // Strip math also tracks the new rect.
    expect(getShield('right')!.style.left).toBe('580px'); // r2.right
    expect(getShield('bottom')!.style.top).toBe('690px'); // r2.bottom
  });

  it('rect → null re-render unmounts the overlay', () => {
    const rect = makeRect({ left: 0, top: 0, width: 50, height: 50 });
    render(<TourOverlay rect={rect} onSkip={vi.fn()} />);
    expect(getSpotlight()).not.toBeNull();
    render(<TourOverlay rect={null} onSkip={vi.fn()} />);
    expect(getSpotlight()).toBeNull();
    expect(getAllShields()).toHaveLength(0);
  });

  it('content is portalled to document.body, not the React container', () => {
    const rect = makeRect({ left: 0, top: 0, width: 50, height: 50 });
    render(<TourOverlay rect={rect} onSkip={vi.fn()} />);
    const spotlight = getSpotlight()!;
    // The spotlight must be a descendant of document.body but NOT of
    // `container` — that's the whole point of the portal.
    expect(document.body.contains(spotlight)).toBe(true);
    expect(container.contains(spotlight)).toBe(false);
  });

  it('all overlay layers carry the same z-index class', () => {
    const rect = makeRect({ left: 0, top: 0, width: 50, height: 50 });
    render(<TourOverlay rect={rect} onSkip={vi.fn()} />);
    const all = [getSpotlight()!, ...getAllShields()];
    for (const el of all) {
      expect(el.className).toContain('z-[9998]');
      expect(el.className).toContain('fixed');
    }
  });

  it('onSkip fresh closure: changing the prop re-binds handlers', () => {
    const rect = makeRect({ left: 0, top: 0, width: 50, height: 50 });
    const skip1 = vi.fn();
    render(<TourOverlay rect={rect} onSkip={skip1} />);
    const skip2 = vi.fn();
    render(<TourOverlay rect={rect} onSkip={skip2} />);
    getShield('top')!.click();
    expect(skip1).not.toHaveBeenCalled();
    expect(skip2).toHaveBeenCalledTimes(1);
  });
});

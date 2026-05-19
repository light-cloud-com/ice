// @vitest-environment jsdom
/**
 * tour-10 — TourPopover tests.
 *
 * Per the 2026-05-08 decision in `state/decisions.md` ("Test environment
 * ceiling for the tour engine") React + Radix Popover composition uses
 * jsdom — the focus-trap (tour-5), Radix's portal indirection, and our
 * `data-tour-popover="..."` query selectors all want a real document.
 *
 * What's mocked:
 *   - `useTranslation` — passthrough so assertions can read i18n keys
 *     verbatim.
 *   - `useReducedMotion` — flippable per test via a hoisted bag.
 *   - `installFocusTrap` — real install path is fine for keyboard
 *     behavior, but we replace it with a spy in the tests that assert
 *     install/uninstall ordering across re-renders. The default export
 *     keeps the real impl so the focus-trap-keyboard tests work.
 *
 * Mock paths follow the rule from learning
 * `vi-mock-paths-resolve-relative-to-test-file-not-source-file` —
 * paths are relative to THIS test file, so `'../../../../i18n'` (4 ../
 * to reach `packages/ui/src/i18n`).
 */

import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  reducedMotion: false,
  installCalls: [] as Array<{ container: HTMLElement; returnFocus: HTMLElement | undefined }>,
  uninstallSpies: [] as ReturnType<typeof vi.fn>[],
  /** When true, the mock takes over and tracks calls — otherwise real impl runs. */
  useSpyForInstallFocusTrap: false,
}));

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k, locale: 'en', setLocale: () => {} }),
}));

vi.mock('../../../../shared/hooks/use-reduced-motion', () => ({
  useReducedMotion: () => mocks.reducedMotion,
}));

vi.mock('../../utils/focus-trap', async (importActual) => {
  const actual = await importActual<typeof import('../../utils/focus-trap')>();
  return {
    ...actual,
    installFocusTrap: (container: HTMLElement, options?: { returnFocus?: HTMLElement }) => {
      if (mocks.useSpyForInstallFocusTrap) {
        const uninstall = vi.fn();
        mocks.installCalls.push({ container, returnFocus: options?.returnFocus });
        mocks.uninstallSpies.push(uninstall);
        return uninstall;
      }
      return actual.installFocusTrap(container, options);
    },
  };
});

import { TourPopover, pickAutoPlacement } from '../tour-popover';
import type { TourStep } from '../../tour.types';

// ─── Helpers ────────────────────────────────────────────────────────────────

let container: HTMLDivElement;
let root: Root;
let anchorEl: HTMLDivElement;

function makeStep(overrides: Partial<TourStep> = {}): TourStep {
  return {
    id: overrides.id ?? 'step-1',
    target: overrides.target ?? '#anchor',
    title: overrides.title ?? 'tour.title',
    body: overrides.body ?? 'tour.body',
    placement: overrides.placement,
    pad: overrides.pad,
    route: overrides.route,
    onEnter: overrides.onEnter,
    onExit: overrides.onExit,
    condition: overrides.condition,
    actions: overrides.actions,
  } satisfies TourStep;
}

function setAnchorRect(el: HTMLElement, rect: { left: number; top: number; width: number; height: number }): void {
  const { left, top, width, height } = rect;
  el.getBoundingClientRect = () => ({
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect);
}

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

function getPopover(): HTMLElement | null {
  return document.body.querySelector('[data-tour-popover="content"]');
}

function getButton(name: 'next' | 'back' | 'skip' | 'close'): HTMLButtonElement | null {
  return document.body.querySelector(`[data-tour-popover="${name}"]`);
}

beforeEach(() => {
  // Tells React 19's `act` that this is a test environment; without it,
  // the runtime emits "current testing environment is not configured to
  // support act(...)" warnings on synchronous renders.
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.reducedMotion = false;
  mocks.installCalls = [];
  mocks.uninstallSpies = [];
  mocks.useSpyForInstallFocusTrap = false;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  // The runner hands us a real Element; create one with a faked rect.
  anchorEl = document.createElement('div');
  anchorEl.id = 'anchor';
  document.body.appendChild(anchorEl);
  setAnchorRect(anchorEl, { left: 100, top: 100, width: 50, height: 30 });
  // Default viewport for jsdom.
  Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
});

afterEach(() => {
  unmount();
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('TourPopover — null / mount basics', () => {
  it('returns null when anchor is null', () => {
    render(
      <TourPopover
        step={makeStep()}
        stepIdx={0}
        totalSteps={3}
        anchor={null}
        onAdvance={vi.fn()}
        onPrevious={vi.fn()}
        onSkip={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(getPopover()).toBeNull();
  });

  it('renders title + body + counter + Next button when anchor is non-null', () => {
    render(
      <TourPopover
        step={makeStep({ title: 'tour.canvas.title', body: 'tour.canvas.body' })}
        stepIdx={1}
        totalSteps={3}
        anchor={anchorEl}
        onAdvance={vi.fn()}
        onPrevious={vi.fn()}
        onSkip={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const popover = getPopover();
    expect(popover).not.toBeNull();
    expect(document.body.textContent).toContain('tour.canvas.title');
    expect(document.body.textContent).toContain('tour.canvas.body');
    // Counter is `stepIdx+1 / totalSteps`.
    expect(document.body.querySelector('[data-tour-popover="counter"]')?.textContent).toBe('2 / 3');
    expect(getButton('next')).not.toBeNull();
  });
});

describe('TourPopover — button visibility', () => {
  it('isFirst (stepIdx=0) → no Back button', () => {
    render(
      <TourPopover
        step={makeStep()}
        stepIdx={0}
        totalSteps={3}
        anchor={anchorEl}
        onAdvance={vi.fn()}
        onPrevious={vi.fn()}
        onSkip={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(getButton('back')).toBeNull();
    // But Skip + Next are present on a non-final, non-first step.
    expect(getButton('skip')).not.toBeNull();
    expect(getButton('next')).not.toBeNull();
  });

  it('step.actions.hideSkip=true → no Skip button (mid-tour)', () => {
    render(
      <TourPopover
        step={makeStep({ actions: { hideSkip: true } })}
        stepIdx={1}
        totalSteps={3}
        anchor={anchorEl}
        onAdvance={vi.fn()}
        onPrevious={vi.fn()}
        onSkip={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(getButton('skip')).toBeNull();
    expect(getButton('back')).not.toBeNull();
    expect(getButton('next')).not.toBeNull();
  });

  it('isLast (stepIdx=totalSteps-1) → Skip is hidden too (avoids skip-vs-finish confusion)', () => {
    render(
      <TourPopover
        step={makeStep()}
        stepIdx={2}
        totalSteps={3}
        anchor={anchorEl}
        onAdvance={vi.fn()}
        onPrevious={vi.fn()}
        onSkip={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(getButton('skip')).toBeNull();
    // Back present on last step.
    expect(getButton('back')).not.toBeNull();
  });
});

describe('TourPopover — labels', () => {
  it('respects step.actions.nextLabel and backLabel (mid-tour)', () => {
    render(
      <TourPopover
        step={makeStep({ actions: { nextLabel: 'custom.next', backLabel: 'custom.back' } })}
        stepIdx={1}
        totalSteps={3}
        anchor={anchorEl}
        onAdvance={vi.fn()}
        onPrevious={vi.fn()}
        onSkip={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(getButton('next')!.textContent).toBe('custom.next');
    expect(getButton('back')!.textContent).toBe('custom.back');
  });

  it('isLast → Next label is t("tour.actions.finish") by default', () => {
    render(
      <TourPopover
        step={makeStep()}
        stepIdx={2}
        totalSteps={3}
        anchor={anchorEl}
        onAdvance={vi.fn()}
        onPrevious={vi.fn()}
        onSkip={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(getButton('next')!.textContent).toBe('tour.actions.finish');
  });

  it('isLast with actions.nextLabel override wins over default "finish"', () => {
    render(
      <TourPopover
        step={makeStep({ actions: { nextLabel: 'custom.complete' } })}
        stepIdx={2}
        totalSteps={3}
        anchor={anchorEl}
        onAdvance={vi.fn()}
        onPrevious={vi.fn()}
        onSkip={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(getButton('next')!.textContent).toBe('custom.complete');
  });

  it('mid-tour Next defaults to t("tour.actions.next"); Back to "tour.actions.back"', () => {
    render(
      <TourPopover
        step={makeStep()}
        stepIdx={1}
        totalSteps={3}
        anchor={anchorEl}
        onAdvance={vi.fn()}
        onPrevious={vi.fn()}
        onSkip={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(getButton('next')!.textContent).toBe('tour.actions.next');
    expect(getButton('back')!.textContent).toBe('tour.actions.back');
  });
});

describe('TourPopover — click wiring', () => {
  it('click Next → onAdvance', () => {
    const onAdvance = vi.fn();
    render(
      <TourPopover
        step={makeStep()}
        stepIdx={1}
        totalSteps={3}
        anchor={anchorEl}
        onAdvance={onAdvance}
        onPrevious={vi.fn()}
        onSkip={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    act(() => {
      getButton('next')!.click();
    });
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });

  it('click Back → onPrevious', () => {
    const onPrevious = vi.fn();
    render(
      <TourPopover
        step={makeStep()}
        stepIdx={1}
        totalSteps={3}
        anchor={anchorEl}
        onAdvance={vi.fn()}
        onPrevious={onPrevious}
        onSkip={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    act(() => {
      getButton('back')!.click();
    });
    expect(onPrevious).toHaveBeenCalledTimes(1);
  });

  it('click Skip → onSkip', () => {
    const onSkip = vi.fn();
    render(
      <TourPopover
        step={makeStep()}
        stepIdx={1}
        totalSteps={3}
        anchor={anchorEl}
        onAdvance={vi.fn()}
        onPrevious={vi.fn()}
        onSkip={onSkip}
        onClose={vi.fn()}
      />,
    );
    act(() => {
      getButton('skip')!.click();
    });
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('click Close (X) → onClose, NOT onSkip', () => {
    const onClose = vi.fn();
    const onSkip = vi.fn();
    render(
      <TourPopover
        step={makeStep()}
        stepIdx={1}
        totalSteps={3}
        anchor={anchorEl}
        onAdvance={vi.fn()}
        onPrevious={vi.fn()}
        onSkip={onSkip}
        onClose={onClose}
      />,
    );
    act(() => {
      getButton('close')!.click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSkip).not.toHaveBeenCalled();
  });
});

describe('TourPopover — body rendering', () => {
  it('ReactNode body bypasses t() and renders directly', () => {
    const Body = (
      <div data-test-body="tour-body-jsx">
        <strong>Bold</strong> emphasis here
      </div>
    );
    render(
      <TourPopover
        step={makeStep({ body: Body })}
        stepIdx={0}
        totalSteps={3}
        anchor={anchorEl}
        onAdvance={vi.fn()}
        onPrevious={vi.fn()}
        onSkip={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const bodyEl = document.body.querySelector('[data-test-body="tour-body-jsx"]');
    expect(bodyEl).not.toBeNull();
    expect(bodyEl!.querySelector('strong')!.textContent).toBe('Bold');
    // Title still uses t() since it's a string.
    const title = document.body.querySelector('#tour-popover-title');
    expect(title?.textContent).toBe('tour.title');
  });
});

describe('TourPopover — focus trap', () => {
  it('focus moves to the first focusable (Close, then content) on mount', async () => {
    // Pre-focus an element outside the popover so we can assert focus
    // moves AWAY from it on mount.
    const externalBtn = document.createElement('button');
    externalBtn.textContent = 'Outside';
    document.body.appendChild(externalBtn);
    externalBtn.focus();
    expect(document.activeElement).toBe(externalBtn);

    render(
      <TourPopover
        step={makeStep()}
        stepIdx={1}
        totalSteps={3}
        anchor={anchorEl}
        onAdvance={vi.fn()}
        onPrevious={vi.fn()}
        onSkip={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    // After mount + focus-trap install, activeElement should be the
    // first focusable inside the popover (the Close X is rendered first
    // in DOM order so getFocusableElements() picks it as initial).
    const popover = getPopover();
    expect(popover).not.toBeNull();
    expect(popover!.contains(document.activeElement)).toBe(true);
  });

  it('passes installFocusTrap a returnFocus = previously-focused element; uninstall fires on unmount and refocuses it', () => {
    mocks.useSpyForInstallFocusTrap = true;
    const externalBtn = document.createElement('button');
    document.body.appendChild(externalBtn);
    externalBtn.focus();

    render(
      <TourPopover
        step={makeStep()}
        stepIdx={0}
        totalSteps={3}
        anchor={anchorEl}
        onAdvance={vi.fn()}
        onPrevious={vi.fn()}
        onSkip={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(mocks.installCalls.length).toBe(1);
    const call = mocks.installCalls[0]!;
    // The container is the PopoverContent element with role="dialog".
    expect(call.container.getAttribute('role')).toBe('dialog');
    expect(call.returnFocus).toBe(externalBtn);
    // No uninstall fired yet.
    expect(mocks.uninstallSpies[0]).not.toHaveBeenCalled();

    unmount();
    expect(mocks.uninstallSpies[0]).toHaveBeenCalledTimes(1);
  });

  it('re-render with a new step → trap uninstalls for prior, re-installs for new', () => {
    mocks.useSpyForInstallFocusTrap = true;
    render(
      <TourPopover
        step={makeStep({ id: 'step-a' })}
        stepIdx={0}
        totalSteps={3}
        anchor={anchorEl}
        onAdvance={vi.fn()}
        onPrevious={vi.fn()}
        onSkip={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(mocks.installCalls.length).toBe(1);
    const firstUninstall = mocks.uninstallSpies[0]!;

    // Re-render with different step id; effect dep tuple changes →
    // uninstall fires for old, install for new.
    render(
      <TourPopover
        step={makeStep({ id: 'step-b' })}
        stepIdx={1}
        totalSteps={3}
        anchor={anchorEl}
        onAdvance={vi.fn()}
        onPrevious={vi.fn()}
        onSkip={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(firstUninstall).toHaveBeenCalled();
    expect(mocks.installCalls.length).toBe(2);
    expect(mocks.uninstallSpies.length).toBe(2);
  });
});

describe('TourPopover — auto-placement', () => {
  it('pickAutoPlacement: target on left edge → "right"', () => {
    const rect = { left: 5, top: 300, width: 40, height: 40, right: 45, bottom: 340 } as DOMRect;
    const side = pickAutoPlacement(rect, { width: 1024, height: 768 });
    expect(side).toBe('right');
  });

  it('pickAutoPlacement: target near top edge → "bottom"', () => {
    // Top space ~10, bottom space ~720, left ~480, right ~480 → bottom wins.
    const rect = { left: 480, top: 10, width: 64, height: 32, right: 544, bottom: 42 } as DOMRect;
    const side = pickAutoPlacement(rect, { width: 1024, height: 768 });
    expect(side).toBe('bottom');
  });

  it('pickAutoPlacement: target near bottom edge → "top"', () => {
    // Top space large, bottom small → top wins.
    const rect = { left: 480, top: 720, width: 64, height: 32, right: 544, bottom: 752 } as DOMRect;
    const side = pickAutoPlacement(rect, { width: 1024, height: 768 });
    expect(side).toBe('top');
  });

  it('pickAutoPlacement: target near right edge → "left"', () => {
    // Right space ~10, left ~960, top ~360, bottom ~360 → left wins.
    const rect = { left: 960, top: 360, width: 50, height: 50, right: 1010, bottom: 410 } as DOMRect;
    const side = pickAutoPlacement(rect, { width: 1024, height: 768 });
    expect(side).toBe('left');
  });

  it('pickAutoPlacement: ties resolve to top → bottom → right → left', () => {
    // All four spaces equal at 100. Iteration order: top, bottom, right,
    // left → first maximum wins → 'top'. Achieved by a square viewport
    // and a centered square element.
    const rect = { left: 100, top: 100, width: 100, height: 100, right: 200, bottom: 200 } as DOMRect;
    const side = pickAutoPlacement(rect, { width: 300, height: 300 });
    expect(side).toBe('top');
  });
});

describe('TourPopover — reduced motion', () => {
  it('reducedMotion=false → no data-reduced-motion attribute', () => {
    mocks.reducedMotion = false;
    render(
      <TourPopover
        step={makeStep()}
        stepIdx={0}
        totalSteps={3}
        anchor={anchorEl}
        onAdvance={vi.fn()}
        onPrevious={vi.fn()}
        onSkip={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const popover = getPopover()!;
    expect(popover.getAttribute('data-reduced-motion')).toBeNull();
  });

  it('reducedMotion=true → data-reduced-motion="true" + animate-none class', () => {
    mocks.reducedMotion = true;
    render(
      <TourPopover
        step={makeStep()}
        stepIdx={0}
        totalSteps={3}
        anchor={anchorEl}
        onAdvance={vi.fn()}
        onPrevious={vi.fn()}
        onSkip={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const popover = getPopover()!;
    expect(popover.getAttribute('data-reduced-motion')).toBe('true');
    // The class merge layers in animate-none for the Radix data-state hooks.
    expect(popover.className).toContain('motion-reduce:animate-none');
  });
});

describe('TourPopover — accessibility', () => {
  it('role=dialog, aria-modal=false, aria-labelledby + aria-describedby resolve to existing ids', () => {
    render(
      <TourPopover
        step={makeStep({ title: 'tour.title', body: 'tour.body' })}
        stepIdx={0}
        totalSteps={3}
        anchor={anchorEl}
        onAdvance={vi.fn()}
        onPrevious={vi.fn()}
        onSkip={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const popover = getPopover()!;
    expect(popover.getAttribute('role')).toBe('dialog');
    // aria-modal is rendered as the string "false" by Radix/React.
    expect(popover.getAttribute('aria-modal')).toBe('false');
    const labelledBy = popover.getAttribute('aria-labelledby');
    const describedBy = popover.getAttribute('aria-describedby');
    expect(labelledBy).toBe('tour-popover-title');
    expect(describedBy).toBe('tour-popover-body');
    // The referenced ids exist somewhere in the DOM.
    expect(document.getElementById(labelledBy!)).not.toBeNull();
    expect(document.getElementById(describedBy!)).not.toBeNull();
  });

  it('step counter has aria-live="polite"', () => {
    render(
      <TourPopover
        step={makeStep()}
        stepIdx={1}
        totalSteps={3}
        anchor={anchorEl}
        onAdvance={vi.fn()}
        onPrevious={vi.fn()}
        onSkip={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const counter = document.body.querySelector('[data-tour-popover="counter"]');
    expect(counter).not.toBeNull();
    expect(counter!.getAttribute('aria-live')).toBe('polite');
  });

  it('Close button has aria-label = t("tour.actions.close")', () => {
    render(
      <TourPopover
        step={makeStep()}
        stepIdx={0}
        totalSteps={3}
        anchor={anchorEl}
        onAdvance={vi.fn()}
        onPrevious={vi.fn()}
        onSkip={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const close = getButton('close')!;
    expect(close.getAttribute('aria-label')).toBe('tour.actions.close');
  });
});

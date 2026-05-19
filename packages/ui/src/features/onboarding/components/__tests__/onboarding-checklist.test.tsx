/**
 * OnboardingChecklist — small floating bottom-left checklist.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  useStateQueue: [] as unknown[],
  effects: [] as Array<() => void | (() => void)>,
  state: {
    account: {
      user: { onboardingCompleted: true, defaultProvider: null as string | null },
    } as { user: { onboardingCompleted: boolean; defaultProvider?: string | null } | null },
    integrations: {
      integrations: {
        github: { status: 'disconnected' as 'connected' | 'disconnected' | 'connecting' | 'error' },
        gcp: { status: 'disconnected' as 'connected' | 'disconnected' | 'connecting' | 'error' },
      },
    },
  },
  dispatch: vi.fn(),
  checkSpy: vi.fn(() => ({ type: 'integrations/check' })),
  storage: new Map<string, string>(),
  startTour: vi.fn(),
  isTourCompleted: vi.fn((_id: string) => false),
}));

vi.mock('react', async (orig) => {
  const actual = (await orig()) as typeof import('react');
  const useState = vi.fn(<T,>(init: T | (() => T)): [T, (v: T) => void] => {
    const next = mocks.useStateQueue.shift();
    if (next !== undefined) return [next as T, vi.fn()];
    const initial = typeof init === 'function' ? (init as () => T)() : init;
    return [initial, vi.fn()];
  });
  const useEffect = vi.fn((cb: () => void | (() => void)) => {
    mocks.effects.push(cb);
  });
  const def = (actual as unknown as { default?: typeof actual }).default ?? actual;
  return { ...actual, useState, useEffect, default: { ...def, useState, useEffect } };
});

vi.mock('react-redux', () => ({
  useSelector: (sel: (s: unknown) => unknown) => sel(mocks.state),
  useDispatch: () => mocks.dispatch,
}));

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => `t:${k}` }),
}));

vi.mock('../../../tour', () => ({
  useTour: () => ({
    activeTourId: null,
    stepIdx: 0,
    totalSteps: 0,
    isFirst: true,
    isLast: false,
    isCompleted: (id: string) => mocks.isTourCompleted(id),
    start: (id: string) => mocks.startTour(id),
    advance: vi.fn(),
    previous: vi.fn(),
    skip: vi.fn(),
    stop: vi.fn(),
  }),
}));

vi.mock('../../../../shared/utils/cn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

vi.mock('../../../../store/slices/integrations-slice', () => ({
  checkGitHubConnection: () => mocks.checkSpy(),
}));

import { OnboardingChecklist } from '../onboarding-checklist';

interface ReactElementLike {
  type: unknown;
  props: { [k: string]: unknown; children?: unknown };
}
function isElement(x: unknown): x is ReactElementLike {
  return !!x && typeof x === 'object' && 'type' in x && 'props' in x;
}
function* walk(node: unknown): Generator<ReactElementLike> {
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c);
    return;
  }
  if (!isElement(node)) return;
  yield node;
  yield* walk(node.props.children);
}
function findAll(tree: unknown, predicate: (el: ReactElementLike) => boolean): ReactElementLike[] {
  const out: ReactElementLike[] = [];
  for (const el of walk(tree)) {
    if (predicate(el)) out.push(el);
  }
  return out;
}
function findByPredicate(tree: unknown, predicate: (el: ReactElementLike) => boolean): ReactElementLike | undefined {
  for (const el of walk(tree)) {
    if (predicate(el)) return el;
  }
  return undefined;
}
function collectText(node: unknown): string {
  let s = '';
  for (const el of walk(node)) {
    const c = (el.props as { children?: unknown }).children;
    if (typeof c === 'string') s += c + ' ';
    else if (Array.isArray(c)) {
      for (const item of c) {
        if (typeof item === 'string') s += item + ' ';
        else if (typeof item === 'number') s += String(item) + ' ';
      }
    } else if (typeof c === 'number') s += String(c) + ' ';
  }
  return s;
}

const callRender = (): unknown => (OnboardingChecklist as () => unknown)();

beforeEach(() => {
  mocks.useStateQueue.length = 0;
  mocks.effects.length = 0;
  mocks.state.account.user = { onboardingCompleted: true, defaultProvider: null };
  mocks.state.integrations.integrations = {
    github: { status: 'disconnected' },
    gcp: { status: 'disconnected' },
  };
  mocks.dispatch.mockReset();
  mocks.checkSpy.mockClear();
  mocks.startTour.mockReset();
  mocks.isTourCompleted.mockReset();
  mocks.isTourCompleted.mockImplementation((_id: string) => false);
  mocks.storage.clear();
  // Provide a fake localStorage on globalThis
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mocks.storage.get(k) ?? null,
    setItem: (k: string, v: string) => mocks.storage.set(k, v),
    removeItem: (k: string) => mocks.storage.delete(k),
    clear: () => mocks.storage.clear(),
  };
});

describe('OnboardingChecklist — gating', () => {
  it('returns null when user has not completed onboarding', () => {
    mocks.state.account.user = { onboardingCompleted: false };
    expect(callRender()).toBeNull();
  });

  it('returns null when user is missing entirely', () => {
    mocks.state.account.user = null;
    expect(callRender()).toBeNull();
  });

  it('returns null when dismissed=true (per useState)', () => {
    mocks.useStateQueue.push(true); // dismissed=true
    expect(callRender()).toBeNull();
  });

  it('returns null when all items are done', () => {
    mocks.state.account.user = { onboardingCompleted: true, defaultProvider: 'gcp' };
    mocks.state.integrations.integrations = {
      github: { status: 'connected' },
      gcp: { status: 'connected' },
    };
    mocks.isTourCompleted.mockImplementation(() => true);
    expect(callRender()).toBeNull();
  });

  it('reads localStorage on init (returns dismissed=true)', () => {
    mocks.storage.set('ice-onboarding-checklist-dismissed', 'true');
    // First useState (dismissed) should evaluate the initializer fn,
    // pulling the stored value.
    expect(callRender()).toBeNull();
  });
});

describe('OnboardingChecklist — collapsed pill', () => {
  it('renders the small pill by default with 0 / 1', () => {
    // collapsed=true is the default 2nd useState init
    const tree = callRender();
    const text = collectText(tree);
    expect(text).toContain('t:onboarding.checklist.setup');
    expect(text).toContain('0');
    expect(text).toContain('1');
  });

  it('clicking the pill calls setCollapsed(false)', () => {
    const tree = callRender() as ReactElementLike;
    const btn = findByPredicate(tree, (el) => el.type === 'button');
    expect(typeof btn?.props.onClick).toBe('function');
    expect(() => (btn?.props.onClick as () => void)()).not.toThrow();
  });
});

describe('OnboardingChecklist — expanded panel', () => {
  it('renders only the canvas-tour entry (cloud/github moved into the tour itself)', () => {
    mocks.useStateQueue.push(false); // dismissed
    mocks.useStateQueue.push(false); // collapsed
    const tree = callRender();
    const text = collectText(tree);
    expect(text).toContain('t:onboarding.checklist.title');
    expect(text).toContain('t:onboarding.checklist.takeCanvasTour');
    // The cloud/github/account chores were absorbed into the canvas tour.
    expect(text).not.toContain('t:onboarding.checklist.createAccount');
    expect(text).not.toContain('t:onboarding.checklist.connectCloud');
    expect(text).not.toContain('t:onboarding.checklist.connectGithub');
  });

  it('returns null when canvas-tour is the only item and it is completed', () => {
    mocks.useStateQueue.push(false);
    mocks.useStateQueue.push(false);
    mocks.isTourCompleted.mockImplementation(() => true);
    expect(callRender()).toBeNull();
  });

  it('clicking the dismiss (X) button persists to localStorage', () => {
    mocks.useStateQueue.push(false); // dismissed
    mocks.useStateQueue.push(false); // collapsed
    const tree = callRender();
    const buttons = findAll(tree, (el) => el.type === 'button');
    // 2nd button = X (dismiss); 1st = chevron-down (collapse toggle)
    const dismiss = buttons.find((b) =>
      typeof (b.props as { title?: string }).title === 'string' &&
      ((b.props as { title: string }).title.includes('dismissTitle') ?? false),
    );
    (dismiss?.props.onClick as () => void)?.();
    expect(mocks.storage.get('ice-onboarding-checklist-dismissed')).toBe('true');
  });
});


describe('OnboardingChecklist — tour entry points', () => {
  it('renders a "Show me how" button next to the canvas-tour item when not completed', () => {
    mocks.useStateQueue.push(false); // dismissed
    mocks.useStateQueue.push(false); // collapsed
    const tree = callRender();
    const text = collectText(tree);
    expect(text).toContain('t:onboarding.checklist.takeCanvasTour');
    expect(text).toContain('t:tour.actions.showMeHow');
    const showMeHowBtn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        Array.isArray((el.props as { children?: unknown }).children) === false &&
        typeof (el.props as { children?: unknown }).children === 'string' &&
        ((el.props as { children: string }).children).includes('showMeHow'),
    );
    expect(showMeHowBtn).toBeDefined();
    expect(typeof showMeHowBtn?.props.onClick).toBe('function');
  });

  it('clicking "Show me how" while on a canvas page calls useTour().start("canvas-tour")', () => {
    mocks.useStateQueue.push(false); // dismissed
    mocks.useStateQueue.push(false); // collapsed
    mocks.useStateQueue.push(null); // tourHint
    // Pretend the canvas SVG is on the page — the handler short-circuits
    // to startTour when document.getElementById('ice-canvas-svg') !== null.
    const fakeCanvas = { id: 'ice-canvas-svg' } as unknown as HTMLElement;
    const prevDoc = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: unknown }).document = {
      getElementById: (id: string) => (id === 'ice-canvas-svg' ? fakeCanvas : null),
    };
    try {
      const tree = callRender();
      const showMeHowBtn = findByPredicate(
        tree,
        (el) =>
          el.type === 'button' &&
          typeof (el.props as { children?: unknown }).children === 'string' &&
          ((el.props as { children: string }).children).includes('showMeHow'),
      );
      expect(showMeHowBtn).toBeDefined();
      (showMeHowBtn?.props.onClick as () => void)?.();
      expect(mocks.startTour).toHaveBeenCalledWith('canvas-tour');
      expect(mocks.startTour).toHaveBeenCalledTimes(1);
    } finally {
      (globalThis as { document?: unknown }).document = prevDoc;
    }
  });

  it('clicking "Show me how" without a canvas on screen surfaces a hint instead of firing the tour', () => {
    mocks.useStateQueue.push(false); // dismissed
    mocks.useStateQueue.push(false); // collapsed
    mocks.useStateQueue.push(null); // tourHint initial
    const prevDoc = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: unknown }).document = {
      getElementById: () => null,
    };
    try {
      const tree = callRender();
      const showMeHowBtn = findByPredicate(
        tree,
        (el) =>
          el.type === 'button' &&
          typeof (el.props as { children?: unknown }).children === 'string' &&
          ((el.props as { children: string }).children).includes('showMeHow'),
      );
      (showMeHowBtn?.props.onClick as () => void)?.();
      // No tour fired — the runner would silently auto-skip every step
      // since none of the canvas anchors exist on the folder view.
      expect(mocks.startTour).not.toHaveBeenCalled();
    } finally {
      (globalThis as { document?: unknown }).document = prevDoc;
    }
  });

  it('hides the whole checklist once the canvas tour is completed (only item)', () => {
    mocks.useStateQueue.push(false); // dismissed
    mocks.useStateQueue.push(false); // collapsed
    mocks.isTourCompleted.mockImplementation((id: string) => id === 'canvas-tour');
    // Only one item left and it's done → allDone short-circuits to null.
    expect(callRender()).toBeNull();
  });

  it('renders exactly one "Show me how" button (the canvas tour entry)', () => {
    mocks.useStateQueue.push(false); // dismissed
    mocks.useStateQueue.push(false); // collapsed
    const tree = callRender();
    const showMeHowButtons = findAll(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { children?: unknown }).children === 'string' &&
        ((el.props as { children: string }).children).includes('showMeHow'),
    );
    expect(showMeHowButtons).toHaveLength(1);
  });
});

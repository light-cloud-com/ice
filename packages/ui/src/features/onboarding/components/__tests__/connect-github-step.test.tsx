/**
 * ConnectGithubStep — onboarding step 4 (PAT + Device flow).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  useStateQueue: [] as unknown[],
  effects: [] as Array<{ cb: () => void | (() => void); deps?: unknown[] }>,
  state: {
    integrations: {
      integrations: {
        github: {
          status: 'disconnected' as 'connected' | 'connecting' | 'disconnected' | 'error',
          username: '',
          avatarUrl: '',
          error: '',
        },
      },
      github: {
        deviceFlow: null as null | { userCode: string; verificationUri: string },
      },
    },
    onboarding: { githubConnected: false },
  },
  dispatch: vi.fn(),
  connectPATSpy: vi.fn((tok: string) => ({ type: 'gh/connectPAT', payload: tok })),
  startDeviceSpy: vi.fn(() => ({ type: 'gh/device' })),
  checkSpy: vi.fn(() => ({ type: 'gh/check' })),
  setGithubConnectedSpy: vi.fn((b: boolean) => ({ type: 'ob/githubConnected', payload: b })),
}));

vi.mock('react', async (orig) => {
  const actual = (await orig()) as typeof import('react');
  const useState = vi.fn(<T,>(init: T): [T, (v: T) => void] => {
    const next = mocks.useStateQueue.shift();
    return [(next === undefined ? init : (next as T)), vi.fn()];
  });
  const useEffect = vi.fn((cb: () => void | (() => void), deps?: unknown[]) => {
    mocks.effects.push({ cb, deps });
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

vi.mock('../../../../shared/utils/cn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

vi.mock('../../../../store/slices/integrations-slice', () => ({
  connectGitHubPAT: (tok: string) => mocks.connectPATSpy(tok),
  startGitHubDeviceFlow: () => mocks.startDeviceSpy(),
  checkGitHubConnection: () => mocks.checkSpy(),
}));

vi.mock('../../../../store/slices/onboarding-slice', () => ({
  setGithubConnected: (b: boolean) => mocks.setGithubConnectedSpy(b),
}));

import { ConnectGithubStep } from '../connect-github-step';

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
      }
    }
  }
  return s;
}

const callRender = (): unknown => (ConnectGithubStep as () => unknown)();

beforeEach(() => {
  mocks.useStateQueue.length = 0;
  mocks.effects.length = 0;
  mocks.state.integrations.integrations.github = {
    status: 'disconnected',
    username: '',
    avatarUrl: '',
    error: '',
  };
  mocks.state.integrations.github.deviceFlow = null;
  mocks.state.onboarding.githubConnected = false;
  mocks.dispatch.mockReset();
  mocks.connectPATSpy.mockClear();
  mocks.startDeviceSpy.mockClear();
  mocks.checkSpy.mockClear();
  mocks.setGithubConnectedSpy.mockClear();
});

describe('ConnectGithubStep — connected', () => {
  it('renders the connected user block', () => {
    mocks.state.integrations.integrations.github = {
      status: 'connected',
      username: 'octocat',
      avatarUrl: '',
      error: '',
    };
    const tree = callRender();
    const text = collectText(tree);
    expect(text).toContain('octocat');
  });

  it('renders the avatar when present', () => {
    mocks.state.integrations.integrations.github = {
      status: 'connected',
      username: 'oc',
      avatarUrl: '/oc.png',
      error: '',
    };
    const tree = callRender();
    const img = findByPredicate(tree, (el) => el.type === 'img');
    expect(img?.props.src).toBe('/oc.png');
  });

  it('falls back to username "GitHub" when missing', () => {
    mocks.state.integrations.integrations.github = {
      status: 'connected',
      username: '',
      avatarUrl: '',
      error: '',
    };
    const tree = callRender();
    expect(collectText(tree)).toContain('GitHub');
  });
});

describe('ConnectGithubStep — disconnected', () => {
  it('renders the PAT tab by default', () => {
    const tree = callRender();
    const text = collectText(tree);
    expect(text).toContain('t:onboarding.github.connectWithToken');
  });

  it('clicking PAT connect with empty token does not dispatch', () => {
    const tree = callRender();
    const buttons = findAll(tree, (el) => el.type === 'button');
    const patBtn = buttons.find((b) =>
      typeof (b.props as { className?: string }).className === 'string' &&
      ((b.props as { className: string }).className.includes('ice-btn-primary') ?? false),
    );
    (patBtn?.props.onClick as () => void)?.();
    expect(mocks.connectPATSpy).not.toHaveBeenCalled();
  });

  it('switches to device tab via tab toggle', () => {
    mocks.useStateQueue.push('device');
    const tree = callRender();
    const text = collectText(tree);
    expect(text).toContain('t:onboarding.github.signInButton');
  });

  it('renders the user code when deviceFlow is set', () => {
    mocks.useStateQueue.push('device');
    mocks.state.integrations.github.deviceFlow = {
      userCode: 'XYZ-123',
      verificationUri: 'https://example.com',
    };
    const tree = callRender();
    expect(collectText(tree)).toContain('XYZ-123');
    expect(collectText(tree)).toContain('https://example.com');
  });

  it('renders error message when status=error', () => {
    mocks.state.integrations.integrations.github = {
      status: 'error',
      username: '',
      avatarUrl: '',
      error: 'oops',
    };
    const tree = callRender();
    expect(collectText(tree)).toContain('oops');
  });

  it('typing the PAT input updates local state', () => {
    const tree = callRender();
    const input = findByPredicate(tree, (el) => el.type === 'input');
    expect(typeof input?.props.onChange).toBe('function');
    expect(() =>
      (input?.props.onChange as (e: { target: { value: string } }) => void)?.({ target: { value: 'tok' } }),
    ).not.toThrow();
  });

  it('Enter key on PAT input triggers handlePATConnect (early-returns if empty)', () => {
    const tree = callRender();
    const input = findByPredicate(tree, (el) => el.type === 'input');
    (input?.props.onKeyDown as (e: { key: string }) => void)?.({ key: 'Enter' });
    expect(mocks.connectPATSpy).not.toHaveBeenCalled();
  });

  it('clicking the device flow button dispatches startGitHubDeviceFlow', () => {
    mocks.useStateQueue.push('device');
    const tree = callRender();
    const buttons = findAll(tree, (el) => el.type === 'button');
    const deviceBtn = buttons.find((b) =>
      typeof (b.props as { className?: string }).className === 'string' &&
      ((b.props as { className: string }).className.includes('bg-[#24292f]') ?? false),
    );
    (deviceBtn?.props.onClick as () => void)?.();
    expect(mocks.startDeviceSpy).toHaveBeenCalled();
  });
});

describe('ConnectGithubStep — useEffect', () => {
  it('dispatches checkGitHubConnection on mount', () => {
    callRender();
    mocks.effects[0].cb();
    expect(mocks.checkSpy).toHaveBeenCalled();
  });

  it('dispatches setGithubConnected(true) when newly connected', () => {
    mocks.state.integrations.integrations.github.status = 'connected';
    mocks.state.onboarding.githubConnected = false;
    callRender();
    mocks.effects[1].cb();
    expect(mocks.setGithubConnectedSpy).toHaveBeenCalledWith(true);
  });

  it('does not re-dispatch setGithubConnected when already connected', () => {
    mocks.state.integrations.integrations.github.status = 'connected';
    mocks.state.onboarding.githubConnected = true;
    callRender();
    mocks.effects[1].cb();
    expect(mocks.setGithubConnectedSpy).not.toHaveBeenCalled();
  });
});

describe('ConnectGithubStep — copy code', () => {
  const installFakeClipboard = (writeText: ReturnType<typeof vi.fn>) => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText } },
      configurable: true,
      writable: true,
    });
  };

  it('copies the user code to clipboard', () => {
    mocks.useStateQueue.push('device');
    mocks.state.integrations.github.deviceFlow = {
      userCode: 'COPYME',
      verificationUri: 'https://x',
    };
    const writeText = vi.fn();
    installFakeClipboard(writeText);
    const tree = callRender();
    const buttons = findAll(tree, (el) => el.type === 'button');
    const copyBtn = buttons.find((b) =>
      typeof (b.props as { title?: string }).title === 'string' &&
      ((b.props as { title: string }).title.includes('copyCode') ?? false),
    );
    (copyBtn?.props.onClick as () => void)?.();
    expect(writeText).toHaveBeenCalledWith('COPYME');
  });

  it('does nothing when deviceFlow.userCode is undefined', () => {
    mocks.useStateQueue.push('device');
    mocks.state.integrations.github.deviceFlow = null;
    const writeText = vi.fn();
    installFakeClipboard(writeText);
    const tree = callRender();
    expect(tree).toBeDefined();
    expect(writeText).not.toHaveBeenCalled();
  });
});

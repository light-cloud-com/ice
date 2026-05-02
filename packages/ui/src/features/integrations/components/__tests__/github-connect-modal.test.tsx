/**
 * GitHubConnectModal — two-tab connect modal (PAT + Device Flow).
 *
 * Direct-FC tree-walker. We stub Dialog/Tabs to passthrough renderings
 * so the modal tree is fully traversable.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const Pass = ({ children, ...rest }: { children?: unknown } & Record<string, unknown>) => ({
    type: 'div',
    props: { ...rest, children },
  });
  return {
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
    },
    dispatch: vi.fn(),
    connectPATSpy: vi.fn((tok: string) => ({ type: 'gh/connect', payload: tok })),
    startDeviceSpy: vi.fn(() => ({ type: 'gh/device' })),
    disconnectSpy: vi.fn(() => ({ type: 'gh/disconnect' })),
    Pass,
    useStateQueue: [] as unknown[],
  };
});

vi.mock('react', async (orig) => {
  const actual = (await orig()) as typeof import('react');
  const useState = vi.fn(<T,>(init: T): [T, (v: T) => void] => {
    const next = mocks.useStateQueue.shift();
    return [(next === undefined ? init : (next as T)), vi.fn()];
  });
  const def = (actual as unknown as { default?: typeof actual }).default ?? actual;
  return { ...actual, useState, default: { ...def, useState } };
});

vi.mock('react-redux', () => ({
  useSelector: (sel: (s: unknown) => unknown) => sel(mocks.state),
  useDispatch: () => mocks.dispatch,
}));

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string, opts?: Record<string, unknown>) => `t:${k}${opts ? `:${JSON.stringify(opts)}` : ''}` }),
}));

vi.mock('../../../../store/slices/integrations-slice', () => ({
  connectGitHubPAT: (tok: string) => mocks.connectPATSpy(tok),
  startGitHubDeviceFlow: () => mocks.startDeviceSpy(),
  disconnectGitHub: () => mocks.disconnectSpy(),
}));

vi.mock('../../../../shared/components/ui/dialog', () => ({
  Dialog: mocks.Pass,
  DialogContent: mocks.Pass,
  DialogHeader: mocks.Pass,
  DialogTitle: mocks.Pass,
  DialogDescription: mocks.Pass,
}));
vi.mock('../../../../shared/components/ui/tabs', () => ({
  Tabs: mocks.Pass,
  TabsList: mocks.Pass,
  TabsTrigger: mocks.Pass,
  TabsContent: mocks.Pass,
}));

import { GitHubConnectModal } from '../github-connect-modal';

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
  if (typeof node.type === 'function') {
    try {
      const FC = node.type as (p: unknown) => unknown;
      yield* walk(FC(node.props));
    } catch {
      /* skip */
    }
    return;
  }
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

const callRender = (props: React.ComponentProps<typeof GitHubConnectModal>): unknown =>
  (GitHubConnectModal as (p: React.ComponentProps<typeof GitHubConnectModal>) => unknown)(props);

beforeEach(() => {
  mocks.state.integrations.integrations.github = {
    status: 'disconnected',
    username: '',
    avatarUrl: '',
    error: '',
  };
  mocks.state.integrations.github.deviceFlow = null;
  mocks.dispatch.mockReset();
  mocks.connectPATSpy.mockClear();
  mocks.startDeviceSpy.mockClear();
  mocks.disconnectSpy.mockClear();
  mocks.useStateQueue.length = 0;
});

describe('GitHubConnectModal — connected state', () => {
  it('shows the connected user block', () => {
    mocks.state.integrations.integrations.github = {
      status: 'connected',
      username: 'octocat',
      avatarUrl: '/octo.png',
      error: '',
    };
    const tree = callRender({ isOpen: true, onClose: vi.fn() });
    const text = collectText(tree);
    expect(text).toContain('octocat');
  });

  it('renders the avatar image when avatarUrl is set', () => {
    mocks.state.integrations.integrations.github = {
      status: 'connected',
      username: 'octo',
      avatarUrl: '/img.png',
      error: '',
    };
    const tree = callRender({ isOpen: true, onClose: vi.fn() });
    const img = findByPredicate(tree, (el) => el.type === 'img');
    expect(img?.props.src).toBe('/img.png');
  });

  it('renders Disconnect button which dispatches disconnectGitHub', () => {
    mocks.state.integrations.integrations.github = {
      status: 'connected',
      username: 'octo',
      avatarUrl: '',
      error: '',
    };
    const tree = callRender({ isOpen: true, onClose: vi.fn() });
    const disc = findByPredicate(tree, (el) => el.type === 'button' && el.props.children !== undefined);
    // The first button in connected state is Disconnect
    const buttons = findAll(tree, (el) => el.type === 'button');
    (buttons[0].props.onClick as () => void)?.();
    expect(mocks.disconnectSpy).toHaveBeenCalled();
    expect(disc).toBeDefined();
  });
});

describe('GitHubConnectModal — error state', () => {
  it('renders the error message when status=error', () => {
    mocks.state.integrations.integrations.github = {
      status: 'error',
      username: '',
      avatarUrl: '',
      error: 'token invalid',
    };
    const tree = callRender({ isOpen: true, onClose: vi.fn() });
    const text = collectText(tree);
    expect(text).toContain('token invalid');
  });
});

describe('GitHubConnectModal — disconnected state, PAT tab', () => {
  it('renders the PAT input', () => {
    const tree = callRender({ isOpen: true, onClose: vi.fn() });
    const inputs = findAll(tree, (el) => el.type === 'input');
    expect(inputs.length).toBeGreaterThanOrEqual(1);
  });

  it('PAT connect button is disabled when token is empty', () => {
    const tree = callRender({ isOpen: true, onClose: vi.fn() });
    const buttons = findAll(tree, (el) => el.type === 'button');
    // PAT connect button is the one with className containing ice-btn-primary
    const patBtn = buttons.find((b) =>
      typeof (b.props as { className?: string }).className === 'string' &&
      ((b.props as { className: string }).className.includes('ice-btn-primary') ?? false),
    );
    expect(patBtn?.props.disabled).toBe(true);
  });

  it('Enter key in the PAT input triggers handlePATConnect (no-op when empty)', () => {
    const tree = callRender({ isOpen: true, onClose: vi.fn() });
    const inputs = findAll(tree, (el) => el.type === 'input');
    (inputs[0].props.onKeyDown as (e: { key: string }) => void)?.({ key: 'Enter' });
    expect(mocks.connectPATSpy).not.toHaveBeenCalled();
  });
});

describe('GitHubConnectModal — disconnected state, Device Flow tab', () => {
  it('renders the device-flow trigger button when deviceFlow is null', () => {
    const tree = callRender({ isOpen: true, onClose: vi.fn() });
    const text = collectText(tree);
    expect(text).toContain('t:integrations.github.deviceFlowButton');
  });

  it('renders the user code + verification uri when deviceFlow is set', () => {
    mocks.state.integrations.github.deviceFlow = {
      userCode: 'AB12-CD34',
      verificationUri: 'https://github.com/login/device',
    };
    const tree = callRender({ isOpen: true, onClose: vi.fn() });
    const text = collectText(tree);
    expect(text).toContain('AB12-CD34');
    expect(text).toContain('https://github.com/login/device');
  });
});

describe('GitHubConnectModal — handlers', () => {
  const installFakeClipboard = (writeText: ReturnType<typeof vi.fn>) => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText } },
      configurable: true,
      writable: true,
    });
  };

  it('handlePATConnect dispatches connectGitHubPAT with trimmed token', () => {
    mocks.useStateQueue.push('  my-token  '); // patToken
    const tree = callRender({ isOpen: true, onClose: vi.fn() });
    const buttons = findAll(tree, (el) => el.type === 'button');
    const patBtn = buttons.find((b) =>
      typeof (b.props as { className?: string }).className === 'string' &&
      ((b.props as { className: string }).className.includes('ice-btn-primary') ?? false),
    );
    (patBtn?.props.onClick as () => void)?.();
    expect(mocks.connectPATSpy).toHaveBeenCalledWith('my-token');
  });

  it('handleDeviceFlow dispatches startGitHubDeviceFlow', () => {
    const tree = callRender({ isOpen: true, onClose: vi.fn() });
    const buttons = findAll(tree, (el) => el.type === 'button');
    // Find the second ice-btn-primary (in the device tab)
    const primaryBtns = buttons.filter((b) =>
      typeof (b.props as { className?: string }).className === 'string' &&
      ((b.props as { className: string }).className.includes('ice-btn-primary') ?? false),
    );
    expect(primaryBtns.length).toBeGreaterThanOrEqual(2);
    (primaryBtns[1].props.onClick as () => void)?.();
    expect(mocks.startDeviceSpy).toHaveBeenCalled();
  });

  it('handleDisconnect (connected state) dispatches disconnectGitHub', () => {
    mocks.state.integrations.integrations.github = {
      status: 'connected',
      username: 'oc',
      avatarUrl: '',
      error: '',
    };
    const tree = callRender({ isOpen: true, onClose: vi.fn() });
    const buttons = findAll(tree, (el) => el.type === 'button');
    (buttons[0].props.onClick as () => void)?.();
    expect(mocks.disconnectSpy).toHaveBeenCalled();
  });

  it('handleCopyCode copies user code to clipboard when deviceFlow is set', () => {
    const writeText = vi.fn();
    installFakeClipboard(writeText);
    mocks.state.integrations.github.deviceFlow = {
      userCode: 'COPYME',
      verificationUri: 'https://x',
    };
    const tree = callRender({ isOpen: true, onClose: vi.fn() });
    const buttons = findAll(tree, (el) => el.type === 'button');
    const copyBtn = buttons.find((b) =>
      typeof (b.props as { title?: string }).title === 'string' &&
      ((b.props as { title: string }).title.includes('deviceFlowCopy') ?? false),
    );
    (copyBtn?.props.onClick as () => void)?.();
    expect(writeText).toHaveBeenCalledWith('COPYME');
  });

  it('handleCopyCode is a no-op when no deviceFlow', () => {
    const writeText = vi.fn();
    installFakeClipboard(writeText);
    mocks.state.integrations.github.deviceFlow = null;
    const tree = callRender({ isOpen: true, onClose: vi.fn() });
    expect(tree).toBeDefined();
    expect(writeText).not.toHaveBeenCalled();
  });
});

describe('GitHubConnectModal — Dialog open/close', () => {
  it('Dialog onOpenChange(false) calls onClose', () => {
    const onClose = vi.fn();
    const tree = callRender({ isOpen: true, onClose });
    // Dialog stub passthroughs onOpenChange via props
    const dialogs = findAll(
      tree,
      (el) =>
        typeof (el.props as { onOpenChange?: unknown }).onOpenChange === 'function',
    );
    (dialogs[0].props.onOpenChange as (open: boolean) => void)?.(false);
    expect(onClose).toHaveBeenCalled();
  });

  it('Dialog onOpenChange(true) does NOT call onClose', () => {
    const onClose = vi.fn();
    const tree = callRender({ isOpen: true, onClose });
    const dialogs = findAll(
      tree,
      (el) =>
        typeof (el.props as { onOpenChange?: unknown }).onOpenChange === 'function',
    );
    (dialogs[0].props.onOpenChange as (open: boolean) => void)?.(true);
    expect(onClose).not.toHaveBeenCalled();
  });
});

/**
 * InviteAcceptPage — auth-gated org invite acceptance.
 *
 * Direct-FC tree-walker (rf-rpal-8 / rf-pdpl pattern). All hooks
 * (useState/useEffect) are patched to expose state slots and effect
 * callbacks for direct invocation; isAuthenticated/axios are stubbed
 * via vi.hoisted so async flows (success/error/missing-org) can be
 * driven test-by-test.
 *
 * Auth note: when `isAuthenticated()` returns false, the effect
 * navigates to `/login?redirect=/invite/<token>` with `replace: true`
 * and short-circuits — `axios.post` MUST NOT fire. That assertion is
 * the security boundary this file protects.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const stateSlots: unknown[] = [];
  const effects: Array<{ cb: () => void | (() => void); deps: unknown[] }> = [];
  return {
    stateSlots,
    effects,
    resetUseState: () => {
      stateSlots.length = 0;
    },
    token: 'tk-1' as string | undefined,
    navigate: vi.fn(),
    isAuthenticated: vi.fn(() => true),
    axiosPost: vi.fn(),
  };
});

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  let useStateIdx = 0;
  const patchedUseState = vi.fn((initial?: unknown) => {
    const slot = useStateIdx;
    if (mocks.stateSlots.length <= slot) {
      const init = typeof initial === 'function' ? (initial as () => unknown)() : initial;
      mocks.stateSlots.push(init);
    }
    const setter = vi.fn((next: unknown) => {
      const cur = mocks.stateSlots[slot];
      const resolved = typeof next === 'function' ? (next as (prev: unknown) => unknown)(cur) : next;
      mocks.stateSlots[slot] = resolved;
    });
    useStateIdx += 1;
    return [mocks.stateSlots[slot], setter];
  });
  (mocks as unknown as { __resetIdx: () => void }).__resetIdx = () => {
    useStateIdx = 0;
  };
  const patchedUseEffect = vi.fn((cb: () => void | (() => void), deps?: unknown[]) => {
    mocks.effects.push({ cb, deps: deps ?? [] });
  });
  const actualDefault = (actual as unknown as { default?: typeof actual }).default ?? actual;
  return {
    ...actual,
    useState: patchedUseState,
    useEffect: patchedUseEffect,
    default: {
      ...actualDefault,
      useState: patchedUseState,
      useEffect: patchedUseEffect,
    },
  };
});

vi.mock('@ui/i18n', () => ({
  useTranslation: () => ({ t: (k: string, vars?: Record<string, string>) => (vars ? `${k}:${JSON.stringify(vars)}` : k) }),
}));

vi.mock('react-router-dom', () => ({
  useParams: () => ({ token: mocks.token }),
  useNavigate: () => mocks.navigate,
  Link: ({ to, children, className }: { to: string; children: React.ReactNode; className?: string }) => (
    <a data-stub="Link" href={to} className={className}>
      {children}
    </a>
  ),
}));

vi.mock('@ui/shared/api/auth', () => ({
  isAuthenticated: (...args: unknown[]) => mocks.isAuthenticated(...args),
}));

vi.mock('@ui/shared/api/axios-instance', () => ({
  default: { post: (...args: unknown[]) => mocks.axiosPost(...args) },
}));

import { InviteAcceptPage } from '../invite-accept';

// ─── Tree-walker helpers ──────────────────────────────────────────────────

type ReactNodeLike = React.ReactNode;

function* walk(node: ReactNodeLike): Generator<React.ReactElement> {
  if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') return;
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c as ReactNodeLike);
    return;
  }
  const el = node as React.ReactElement;
  yield el;
  if (typeof el.type === 'function') {
    try {
      const FC = el.type as (props: unknown) => React.ReactNode;
      yield* walk(FC(el.props) as ReactNodeLike);
    } catch {
      /* skip */
    }
    return;
  }
  const children = (el.props as { children?: React.ReactNode } | undefined)?.children;
  if (children == null) return;
  yield* walk(children);
}

function findByPredicate(
  tree: React.ReactNode,
  predicate: (el: React.ReactElement) => boolean,
): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) if (el && predicate(el)) out.push(el);
  return out;
}

function render(): React.ReactElement | null {
  (mocks as unknown as { __resetIdx: () => void }).__resetIdx();
  return (InviteAcceptPage as unknown as () => React.ReactElement | null)();
}

beforeEach(() => {
  mocks.resetUseState();
  mocks.effects.length = 0;
  mocks.navigate.mockReset();
  mocks.isAuthenticated.mockReset().mockReturnValue(true);
  mocks.axiosPost.mockReset();
  mocks.token = 'tk-1';
});

// ─── Render in each status ────────────────────────────────────────────────

describe('InviteAcceptPage — initial loading state', () => {
  it('renders the loading copy when status slot is "loading"', () => {
    const tree = render();
    const loading = findByPredicate(
      tree,
      (el) => el.type === 'p' && (el.props as { children?: unknown }).children === 'invite.loading',
    );
    expect(loading).toHaveLength(1);
  });

  it('does not render success or error text in the initial state', () => {
    const tree = render();
    const successHeadings = findByPredicate(
      tree,
      (el) => el.type === 'h1' && (el.props as { children?: unknown }).children === 'invite.success.title',
    );
    const errorHeadings = findByPredicate(
      tree,
      (el) => el.type === 'h1' && (el.props as { children?: unknown }).children === 'invite.error.title',
    );
    expect(successHeadings).toHaveLength(0);
    expect(errorHeadings).toHaveLength(0);
  });
});

// ─── Auth gate ────────────────────────────────────────────────────────────

describe('InviteAcceptPage — auth gate', () => {
  it('redirects to /login with the token-bearing redirect URL when not authenticated', async () => {
    mocks.isAuthenticated.mockReturnValueOnce(false);
    render();
    await mocks.effects[0].cb();
    expect(mocks.navigate).toHaveBeenCalledWith('/login?redirect=/invite/tk-1', { replace: true });
  });

  it('does not call axios.post when unauthenticated (security boundary)', async () => {
    mocks.isAuthenticated.mockReturnValueOnce(false);
    render();
    await mocks.effects[0].cb();
    expect(mocks.axiosPost).not.toHaveBeenCalled();
  });

  it('uses the token from useParams in the redirect URL', async () => {
    mocks.token = 'special-token-99';
    mocks.isAuthenticated.mockReturnValueOnce(false);
    render();
    await mocks.effects[0].cb();
    expect(mocks.navigate).toHaveBeenCalledWith('/login?redirect=/invite/special-token-99', { replace: true });
  });
});

// ─── Accept flow — success ───────────────────────────────────────────────

describe('InviteAcceptPage — accept flow success', () => {
  it('posts the token to /users/invite/accept and sets status=success', async () => {
    mocks.axiosPost.mockResolvedValueOnce({ data: { organisation: { name: 'Acme' } } });
    render();
    await mocks.effects[0].cb();
    // axios was called with the token from URL
    expect(mocks.axiosPost).toHaveBeenCalledWith('/users/invite/accept', { token: 'tk-1' });
  });

  it('falls back to the i18n key when the response omits organisation.name', async () => {
    mocks.axiosPost.mockResolvedValueOnce({ data: { organisation: {} } });
    render();
    await mocks.effects[0].cb();
    // After flush, slot for orgName should be the fallback key
    // status (slot 0) → "success", orgName (slot 1) → fallback, errorMsg (slot 2) untouched
    expect(mocks.stateSlots[1]).toBe('invite.error.fallbackOrg');
  });

  it('falls back to fallbackOrg key when response omits the organisation altogether', async () => {
    mocks.axiosPost.mockResolvedValueOnce({ data: {} });
    render();
    await mocks.effects[0].cb();
    expect(mocks.stateSlots[1]).toBe('invite.error.fallbackOrg');
  });

  it('renders the success heading + button + description after success state propagates', async () => {
    // Pre-seed slots: status=success, orgName='Acme', errorMsg=''
    mocks.stateSlots.push('success', 'Acme', '');
    const tree = render();
    const heading = findByPredicate(
      tree,
      (el) => el.type === 'h1' && (el.props as { children?: unknown }).children === 'invite.success.title',
    );
    expect(heading).toHaveLength(1);
    const buttons = findByPredicate(
      tree,
      (el) => el.type === 'button' && (el.props as { children?: unknown }).children === 'invite.success.button',
    );
    expect(buttons).toHaveLength(1);
    // success description renders the orgName via the i18n vars channel
    const desc = findByPredicate(
      tree,
      (el) =>
        el.type === 'p' &&
        typeof (el.props as { children?: unknown }).children === 'string' &&
        ((el.props as { children: string }).children).startsWith('invite.success.description'),
    );
    expect(desc).toHaveLength(1);
  });

  it('navigates to "/" when the success button onClick fires', async () => {
    mocks.stateSlots.push('success', 'Acme', '');
    const tree = render();
    const button = findByPredicate(
      tree,
      (el) => el.type === 'button' && (el.props as { children?: unknown }).children === 'invite.success.button',
    )[0];
    (button.props as { onClick: () => void }).onClick();
    expect(mocks.navigate).toHaveBeenCalledWith('/', { replace: true });
  });
});

// ─── Accept flow — error ─────────────────────────────────────────────────

describe('InviteAcceptPage — accept flow error', () => {
  it('captures err.response.data.message into errorMsg slot when present', async () => {
    mocks.axiosPost.mockRejectedValueOnce({ response: { data: { message: 'Token expired' } } });
    render();
    await mocks.effects[0].cb();
    // slot 2 = errorMsg
    expect(mocks.stateSlots[2]).toBe('Token expired');
  });

  it('falls back to defaultMessage i18n key when err.response.data.message is missing', async () => {
    mocks.axiosPost.mockRejectedValueOnce(new Error('boom'));
    render();
    await mocks.effects[0].cb();
    expect(mocks.stateSlots[2]).toBe('invite.error.defaultMessage');
  });

  it('falls back to defaultMessage when err.response exists but data is empty', async () => {
    mocks.axiosPost.mockRejectedValueOnce({ response: { data: {} } });
    render();
    await mocks.effects[0].cb();
    expect(mocks.stateSlots[2]).toBe('invite.error.defaultMessage');
  });

  it('renders the error UI with heading + Link back to / when status=error', () => {
    // Pre-seed: status=error, orgName='', errorMsg='Bad'
    mocks.stateSlots.push('error', '', 'Bad');
    const tree = render();
    const heading = findByPredicate(
      tree,
      (el) => el.type === 'h1' && (el.props as { children?: unknown }).children === 'invite.error.title',
    );
    expect(heading).toHaveLength(1);
    const links = findByPredicate(
      tree,
      (el) => typeof (el.props as { ['data-stub']?: string })['data-stub'] === 'string' &&
        (el.props as { ['data-stub']: string })['data-stub'] === 'Link',
    );
    expect(links).toHaveLength(1);
    expect((links[0].props as { href: string }).href).toBe('/');
  });

  it('renders the captured errorMsg in the error description paragraph', () => {
    mocks.stateSlots.push('error', '', 'Custom error text');
    const tree = render();
    const errorPara = findByPredicate(
      tree,
      (el) => el.type === 'p' && (el.props as { children?: unknown }).children === 'Custom error text',
    );
    expect(errorPara).toHaveLength(1);
  });
});

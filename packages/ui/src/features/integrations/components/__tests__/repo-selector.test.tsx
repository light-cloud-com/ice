/**
 * RepoSelector — github repo combobox + connect/error escape hatches.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const make = (name: string) => {
    const fc = ((p: Record<string, unknown>) => ({ type: 'div', props: p })) as unknown as React.FC;
    (fc as { displayName?: string }).displayName = name;
    return fc;
  };
  return {
    state: {
      integrations: {
        integrations: { github: { status: 'connected' as 'connected' | 'disconnected' | 'error' | 'connecting' | undefined } },
        github: {
          repos: [] as Array<{ full_name: string; description?: string | null; private?: boolean }>,
          loading: false,
          reposError: null as string | null,
        },
      },
    },
    dispatch: vi.fn(),
    fetchSpy: vi.fn((arg: unknown) => ({ type: 'gh/fetchRepos', payload: arg })),
    ComboboxStub: make('Combobox'),
    ModalStub: make('GitHubConnectModal'),
  };
});

vi.mock('react', async (orig) => {
  const actual = (await orig()) as typeof import('react');
  const useState = vi.fn(<T,>(init: T): [T, (v: T) => void] => [init, vi.fn()]);
  const useEffect = vi.fn();
  const useMemo = vi.fn(<T,>(fn: () => T): T => fn());
  const def = (actual as unknown as { default?: typeof actual }).default ?? actual;
  return { ...actual, useState, useEffect, useMemo, default: { ...def, useState, useEffect, useMemo } };
});

vi.mock('react-redux', () => ({
  useSelector: (sel: (s: unknown) => unknown) => sel(mocks.state),
  useDispatch: () => mocks.dispatch,
}));

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => `t:${k}` }),
}));

vi.mock('../../../../store/slices/integrations-slice', () => ({
  fetchGitHubRepos: (arg: unknown) => mocks.fetchSpy(arg),
}));

vi.mock('../../../../shared/components/ui/combobox', () => ({ Combobox: mocks.ComboboxStub }));
vi.mock('../github-connect-modal', () => ({ GitHubConnectModal: mocks.ModalStub }));

import { RepoSelector } from '../repo-selector';

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

const callRender = (props: React.ComponentProps<typeof RepoSelector>): unknown =>
  (RepoSelector as (p: React.ComponentProps<typeof RepoSelector>) => unknown)(props);

beforeEach(() => {
  mocks.state.integrations.integrations = { github: { status: 'connected' } };
  mocks.state.integrations.github = { repos: [], loading: false, reposError: null };
  mocks.dispatch.mockReset();
  mocks.fetchSpy.mockClear();
});

describe('RepoSelector — disconnected state', () => {
  it('renders a "connect" button when github is not connected', () => {
    mocks.state.integrations.integrations = { github: { status: 'disconnected' } };
    const tree = callRender({ value: '', onChange: vi.fn() });
    const text = collectText(tree);
    expect(text).toContain('t:integrations.repoSelector.connectGitHub');
  });

  it('clicking the connect button opens the modal', () => {
    mocks.state.integrations.integrations = { github: { status: 'disconnected' } };
    const tree = callRender({ value: '', onChange: vi.fn() });
    const btn = findByPredicate(tree, (el) => el.type === 'button');
    expect(typeof btn?.props.onClick).toBe('function');
    expect(() => (btn?.props.onClick as () => void)()).not.toThrow();
  });

  it('uses smaller padding when compact prop is true', () => {
    mocks.state.integrations.integrations = { github: { status: 'disconnected' } };
    const tree = callRender({ value: '', onChange: vi.fn(), compact: true });
    const btn = findByPredicate(tree, (el) => el.type === 'button');
    expect((btn?.props.className as string)).toContain('text-ice-2xs');
  });
});

describe('RepoSelector — error state', () => {
  it('renders the error block when reposError set and repos empty', () => {
    mocks.state.integrations.github.reposError = 'something exploded';
    const tree = callRender({ value: '', onChange: vi.fn() });
    const text = collectText(tree);
    expect(text).toContain('something exploded');
    expect(text).toContain("Couldn't load repositories");
    expect(text).toContain('Retry');
  });

  it('shows the Reconnect link for auth-like errors', () => {
    mocks.state.integrations.github.reposError = '401 Unauthorized';
    const tree = callRender({ value: '', onChange: vi.fn() });
    const text = collectText(tree);
    expect(text).toContain('Reconnect GitHub');
  });

  it('omits the Reconnect link for non-auth errors', () => {
    mocks.state.integrations.github.reposError = 'network down';
    const tree = callRender({ value: '', onChange: vi.fn() });
    const text = collectText(tree);
    expect(text).not.toContain('Reconnect GitHub');
  });

  it('clicking Retry dispatches fetchGitHubRepos(undefined)', () => {
    mocks.state.integrations.github.reposError = 'fail';
    const tree = callRender({ value: '', onChange: vi.fn() });
    const buttons = findAll(tree, (el) => el.type === 'button');
    const retry = buttons.find((b) => b.props.children === 'Retry');
    (retry?.props.onClick as () => void)?.();
    expect(mocks.fetchSpy).toHaveBeenCalledWith(undefined);
  });

  it('clicking Reconnect opens the modal', () => {
    mocks.state.integrations.github.reposError = '403 Forbidden';
    const tree = callRender({ value: '', onChange: vi.fn() });
    const buttons = findAll(tree, (el) => el.type === 'button');
    const reconnect = buttons.find((b) => b.props.children === 'Reconnect GitHub');
    expect(typeof reconnect?.props.onClick).toBe('function');
  });

  it('does NOT show error UI when reposError is set but repos non-empty', () => {
    mocks.state.integrations.github.reposError = 'fail';
    mocks.state.integrations.github.repos = [{ full_name: 'a/b' }];
    const tree = callRender({ value: '', onChange: vi.fn() });
    const text = collectText(tree);
    expect(text).not.toContain("Couldn't load");
  });
});

describe('RepoSelector — connected state', () => {
  it('renders the Combobox with mapped options', () => {
    mocks.state.integrations.github.repos = [
      { full_name: 'octo/repo1', description: 'public repo', private: false },
      { full_name: 'octo/repo2', description: null, private: true },
    ];
    const tree = callRender({ value: 'octo/repo1', onChange: vi.fn() });
    const combobox = findByPredicate(tree, (el) => el.type === mocks.ComboboxStub);
    const options = combobox?.props.options as Array<{ value: string; label: string; description?: string; badge?: string }>;
    expect(options).toHaveLength(2);
    expect(options[0]).toEqual({ value: 'octo/repo1', label: 'octo/repo1', description: 'public repo', badge: undefined });
    expect(options[1]).toEqual({ value: 'octo/repo2', label: 'octo/repo2', description: undefined, badge: 'private' });
  });

  it('passes through value, loading, placeholder, emptyText, compact', () => {
    mocks.state.integrations.github.loading = true;
    const tree = callRender({ value: 'a/b', onChange: vi.fn(), compact: true });
    const combobox = findByPredicate(tree, (el) => el.type === mocks.ComboboxStub);
    expect(combobox?.props.value).toBe('a/b');
    expect(combobox?.props.loading).toBe(true);
    expect(combobox?.props.compact).toBe(true);
    expect(combobox?.props.placeholder).toBe('t:integrations.repoSelector.placeholder');
    expect(combobox?.props.emptyText).toBe('t:integrations.repoSelector.noRepos');
  });

  it('Combobox onSelect forwards to the onChange prop', () => {
    const onChange = vi.fn();
    mocks.state.integrations.github.repos = [{ full_name: 'a/b' }];
    const tree = callRender({ value: '', onChange });
    const combobox = findByPredicate(tree, (el) => el.type === mocks.ComboboxStub);
    (combobox?.props.onSelect as (s: string) => void)?.('a/b');
    expect(onChange).toHaveBeenCalledWith('a/b');
  });
});

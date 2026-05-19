/**
 * rf-etabs-3 — EnvironmentTabItem tests.
 *
 * Direct-FC invocation; cn is mocked to a deterministic join.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  cnSpy: vi.fn((...args: unknown[]) =>
    args.filter((a) => typeof a === 'string' && a).join(' '),
  ),
}));

vi.mock('../../../../shared/utils/cn', () => ({
  cn: mocks.cnSpy,
}));

import { EnvironmentTabItem } from '../environment-tab-item';
import type { Environment } from '../../../../store/slices/environments-slice';

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
function findByPredicate(
  tree: unknown,
  predicate: (el: ReactElementLike) => boolean,
): ReactElementLike | undefined {
  for (const el of walk(tree)) {
    if (predicate(el)) return el;
  }
  return undefined;
}

const makeEnv = (overrides: Partial<Environment> = {}): Environment =>
  ({
    id: 'env-1',
    name: 'staging',
    type: 'staging',
    project_id: 'proj-1',
    card_id: 'card-1',
    region: 'us-central1',
    is_protected: false,
    pr_number: null,
    ...overrides,
  }) as Environment;

const callRender = (props: React.ComponentProps<typeof EnvironmentTabItem>): unknown =>
  (EnvironmentTabItem as (p: React.ComponentProps<typeof EnvironmentTabItem>) => unknown)(props);

beforeEach(() => mocks.cnSpy.mockClear());

describe('EnvironmentTabItem — rendering', () => {
  it('renders a button with the env name', () => {
    const tree = callRender({
      env: makeEnv({ name: 'preview-1' }),
      isActive: false,
      deployStatus: undefined,
      onSwitch: vi.fn(),
      onContextMenu: vi.fn(),
    });
    const btn = findByPredicate(tree, (el) => el.type === 'button');
    const children = btn?.props.children;
    expect(children).toBeDefined();
    // Children contain env.name as one of the items
    const text = JSON.stringify(children);
    expect(text).toContain('preview-1');
  });

  it('uses the active class when isActive=true', () => {
    callRender({
      env: makeEnv(),
      isActive: true,
      deployStatus: undefined,
      onSwitch: vi.fn(),
      onContextMenu: vi.fn(),
    });
    expect(mocks.cnSpy).toHaveBeenCalled();
    // Inspect the second call (the button class). First call is the dot.
    const btnClassArgs = mocks.cnSpy.mock.calls.find((args) =>
      typeof args[0] === 'string' && (args[0] as string).includes('flex items-center gap-1'),
    );
    expect(btnClassArgs?.[1]).toBe('bg-ice-active text-ice-text-1');
  });

  it('uses the inactive hover class when isActive=false', () => {
    callRender({
      env: makeEnv(),
      isActive: false,
      deployStatus: undefined,
      onSwitch: vi.fn(),
      onContextMenu: vi.fn(),
    });
    const btnClassArgs = mocks.cnSpy.mock.calls.find((args) =>
      typeof args[0] === 'string' && (args[0] as string).includes('flex items-center gap-1'),
    );
    expect(btnClassArgs?.[1]).toBe('text-ice-text-3 hover:text-ice-text-2 hover:bg-ice-hover');
  });

  it('renders the deployed URL link when deployStatus.url is present and active', () => {
    const tree = callRender({
      env: makeEnv(),
      isActive: true,
      deployStatus: { status: 'success', url: 'https://example.com/foo/bar/baz' },
      onSwitch: vi.fn(),
      onContextMenu: vi.fn(),
    });
    const link = findByPredicate(tree, (el) => el.type === 'a');
    expect(link?.props.href).toBe('https://example.com/foo/bar/baz');
    expect(link?.props.target).toBe('_blank');
    expect(link?.props.rel).toBe('noopener noreferrer');
  });

  it('does not render URL link when not active even with a URL', () => {
    const tree = callRender({
      env: makeEnv(),
      isActive: false,
      deployStatus: { status: 'success', url: 'https://example.com' },
      onSwitch: vi.fn(),
      onContextMenu: vi.fn(),
    });
    const link = findByPredicate(tree, (el) => el.type === 'a');
    expect(link).toBeUndefined();
  });

  it('strips the protocol from the displayed URL and slices to 20 chars', () => {
    const tree = callRender({
      env: makeEnv(),
      isActive: true,
      deployStatus: { status: 'success', url: 'https://very-long-host-name.com/path' },
      onSwitch: vi.fn(),
      onContextMenu: vi.fn(),
    });
    const link = findByPredicate(tree, (el) => el.type === 'a');
    expect(link?.props.children).toBe('very-long-host-name.');
  });

  it('renders the Lock icon for protected environments', () => {
    const tree = callRender({
      env: makeEnv({ is_protected: true }),
      isActive: false,
      deployStatus: undefined,
      onSwitch: vi.fn(),
      onContextMenu: vi.fn(),
    });
    // Lock is a lucide forwardRef object — check by className signature
    const lock = findByPredicate(
      tree,
      (el) => typeof el.props.className === 'string' && el.props.className === 'w-2.5 h-2.5 text-ice-text-3',
    );
    expect(lock).toBeDefined();
  });

  it('renders the PR badge for pr-type environments with a pr_number', () => {
    const tree = callRender({
      env: makeEnv({ type: 'pr' as Environment['type'], pr_number: 42 } as Partial<Environment>),
      isActive: false,
      deployStatus: undefined,
      onSwitch: vi.fn(),
      onContextMenu: vi.fn(),
    });
    const badge = findByPredicate(
      tree,
      (el) =>
        typeof el.props.className === 'string' && el.props.className.includes('text-purple-400'),
    );
    expect(badge).toBeDefined();
    const text = JSON.stringify(badge?.props.children);
    expect(text).toContain('42');
  });

  it('omits the PR badge when type is pr but pr_number is null', () => {
    const tree = callRender({
      env: makeEnv({ type: 'pr' as Environment['type'], pr_number: null } as Partial<Environment>),
      isActive: false,
      deployStatus: undefined,
      onSwitch: vi.fn(),
      onContextMenu: vi.fn(),
    });
    const badge = findByPredicate(
      tree,
      (el) =>
        typeof el.props.className === 'string' && el.props.className.includes('text-purple-400'),
    );
    expect(badge).toBeUndefined();
  });

  it('uses env.name as the title fallback when no deployStatus.url', () => {
    const tree = callRender({
      env: makeEnv({ name: 'fallback-name' }),
      isActive: false,
      deployStatus: undefined,
      onSwitch: vi.fn(),
      onContextMenu: vi.fn(),
    });
    const btn = findByPredicate(tree, (el) => el.type === 'button');
    expect(btn?.props.title).toBe('fallback-name');
  });

  it('prefers deployStatus.url over env.name in the title', () => {
    const tree = callRender({
      env: makeEnv({ name: 'fallback' }),
      isActive: false,
      deployStatus: { status: 'success', url: 'https://example.com' },
      onSwitch: vi.fn(),
      onContextMenu: vi.fn(),
    });
    const btn = findByPredicate(tree, (el) => el.type === 'button');
    expect(btn?.props.title).toBe('https://example.com');
  });
});

describe('EnvironmentTabItem — handlers', () => {
  it('clicking the button calls onSwitch with the env', () => {
    const onSwitch = vi.fn();
    const env = makeEnv();
    const tree = callRender({
      env,
      isActive: false,
      deployStatus: undefined,
      onSwitch,
      onContextMenu: vi.fn(),
    });
    const btn = findByPredicate(tree, (el) => el.type === 'button');
    (btn?.props.onClick as () => void)?.();
    expect(onSwitch).toHaveBeenCalledWith(env);
  });

  it('right-clicking the button calls onContextMenu with the event and id', () => {
    const onContextMenu = vi.fn();
    const env = makeEnv({ id: 'env-x' });
    const tree = callRender({
      env,
      isActive: false,
      deployStatus: undefined,
      onSwitch: vi.fn(),
      onContextMenu,
    });
    const btn = findByPredicate(tree, (el) => el.type === 'button');
    const fakeEvent = { preventDefault: vi.fn() };
    (btn?.props.onContextMenu as (e: unknown) => void)?.(fakeEvent);
    expect(onContextMenu).toHaveBeenCalledWith(fakeEvent, 'env-x');
  });

  it('clicking the deployed-URL link does not propagate to the button', () => {
    const tree = callRender({
      env: makeEnv(),
      isActive: true,
      deployStatus: { status: 'success', url: 'https://example.com' },
      onSwitch: vi.fn(),
      onContextMenu: vi.fn(),
    });
    const link = findByPredicate(tree, (el) => el.type === 'a');
    const fakeEvent = { stopPropagation: vi.fn() };
    (link?.props.onClick as (e: unknown) => void)?.(fakeEvent);
    expect(fakeEvent.stopPropagation).toHaveBeenCalled();
  });
});

/**
 * rf-etabs-3 — EnvironmentContextMenu tests.
 *
 * Direct-FC invocation; useTranslation mocked.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  tFn: vi.fn((k: string) => `t:${k}`),
}));

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: mocks.tFn }),
}));

import { EnvironmentContextMenu } from '../environment-context-menu';
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
function findByPredicate(tree: unknown, predicate: (el: ReactElementLike) => boolean): ReactElementLike | undefined {
  for (const el of walk(tree)) {
    if (predicate(el)) return el;
  }
  return undefined;
}
function findAllByPredicate(tree: unknown, predicate: (el: ReactElementLike) => boolean): ReactElementLike[] {
  const out: ReactElementLike[] = [];
  for (const el of walk(tree)) {
    if (predicate(el)) out.push(el);
  }
  return out;
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

const PROD = makeEnv({ id: 'prod', name: 'production', type: 'production', is_protected: true });

const callRender = (props: React.ComponentProps<typeof EnvironmentContextMenu>): unknown =>
  (EnvironmentContextMenu as (p: React.ComponentProps<typeof EnvironmentContextMenu>) => unknown)(props);

beforeEach(() => mocks.tFn.mockClear());

describe('EnvironmentContextMenu — rendering', () => {
  it('returns null when env is not in the list', () => {
    const result = callRender({
      envId: 'unknown',
      x: 0,
      y: 0,
      environments: [makeEnv()],
      prodEnv: undefined,
      onDeploy: vi.fn(),
      onPromote: vi.fn(),
      onRename: vi.fn(),
      onDelete: vi.fn(),
      onClose: vi.fn(),
    });
    expect(result).toBe(null);
  });

  it('renders all four buttons for a non-protected env when prodEnv exists', () => {
    const env = makeEnv({ id: 'staging-1' });
    const tree = callRender({
      envId: 'staging-1',
      x: 100,
      y: 200,
      environments: [env],
      prodEnv: PROD,
      onDeploy: vi.fn(),
      onPromote: vi.fn(),
      onRename: vi.fn(),
      onDelete: vi.fn(),
      onClose: vi.fn(),
    });
    const buttons = findAllByPredicate(tree, (el) => el.type === 'button');
    // deploy + promote + rename + delete = 4 buttons
    expect(buttons.length).toBe(4);
  });

  it('hides promote/rename/delete for protected (production) envs', () => {
    const env = makeEnv({ id: 'prod', is_protected: true });
    const tree = callRender({
      envId: 'prod',
      x: 0,
      y: 0,
      environments: [env],
      prodEnv: env,
      onDeploy: vi.fn(),
      onPromote: vi.fn(),
      onRename: vi.fn(),
      onDelete: vi.fn(),
      onClose: vi.fn(),
    });
    const buttons = findAllByPredicate(tree, (el) => el.type === 'button');
    // only deploy is shown
    expect(buttons.length).toBe(1);
  });

  it('hides promote when prodEnv is undefined', () => {
    const env = makeEnv({ id: 'staging-1' });
    const tree = callRender({
      envId: 'staging-1',
      x: 0,
      y: 0,
      environments: [env],
      prodEnv: undefined,
      onDeploy: vi.fn(),
      onPromote: vi.fn(),
      onRename: vi.fn(),
      onDelete: vi.fn(),
      onClose: vi.fn(),
    });
    const buttons = findAllByPredicate(tree, (el) => el.type === 'button');
    // deploy + rename + delete = 3
    expect(buttons.length).toBe(3);
    const promote = findByPredicate(tree, (el) => el.props.children === 't:environments.tabBar.contextPromote');
    expect(promote).toBeUndefined();
  });

  it('positions the menu via inline left/top from x/y props', () => {
    const env = makeEnv({ id: 'env-1', is_protected: true });
    const tree = callRender({
      envId: 'env-1',
      x: 314,
      y: 159,
      environments: [env],
      prodEnv: undefined,
      onDeploy: vi.fn(),
      onPromote: vi.fn(),
      onRename: vi.fn(),
      onDelete: vi.fn(),
      onClose: vi.fn(),
    });
    const root = findByPredicate(
      tree,
      (el) => typeof el.props.className === 'string' && el.props.className.includes('fixed z-[9999]'),
    );
    const style = root?.props.style as { left: number; top: number };
    expect(style.left).toBe(314);
    expect(style.top).toBe(159);
  });
});

describe('EnvironmentContextMenu — handlers', () => {
  it('Deploy button closes the menu and calls onDeploy with the env', () => {
    const onDeploy = vi.fn();
    const onClose = vi.fn();
    const env = makeEnv({ id: 'e1', is_protected: true });
    const tree = callRender({
      envId: 'e1',
      x: 0,
      y: 0,
      environments: [env],
      prodEnv: undefined,
      onDeploy,
      onPromote: vi.fn(),
      onRename: vi.fn(),
      onDelete: vi.fn(),
      onClose,
    });
    const deployBtn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        Array.isArray(el.props.children) &&
        (el.props.children as unknown[]).some((c) => c === 't:environments.tabBar.contextDeploy'),
    );
    (deployBtn?.props.onClick as () => void)?.();
    expect(onClose).toHaveBeenCalled();
    expect(onDeploy).toHaveBeenCalledWith(env);
  });

  it('Promote button calls onPromote(envId) directly (does not call onClose)', () => {
    const onPromote = vi.fn();
    const onClose = vi.fn();
    const env = makeEnv({ id: 'e1' });
    const tree = callRender({
      envId: 'e1',
      x: 0,
      y: 0,
      environments: [env],
      prodEnv: PROD,
      onDeploy: vi.fn(),
      onPromote,
      onRename: vi.fn(),
      onDelete: vi.fn(),
      onClose,
    });
    const promoteBtn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        Array.isArray(el.props.children) &&
        (el.props.children as unknown[]).some((c) => c === 't:environments.tabBar.contextPromote'),
    );
    (promoteBtn?.props.onClick as () => void)?.();
    expect(onPromote).toHaveBeenCalledWith('e1');
    // onClose is NOT called by the promote handler — caller deals with it.
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Rename button closes the menu and calls onRename with the env', () => {
    const onRename = vi.fn();
    const onClose = vi.fn();
    const env = makeEnv({ id: 'e1' });
    const tree = callRender({
      envId: 'e1',
      x: 0,
      y: 0,
      environments: [env],
      prodEnv: undefined,
      onDeploy: vi.fn(),
      onPromote: vi.fn(),
      onRename,
      onDelete: vi.fn(),
      onClose,
    });
    const renameBtn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        Array.isArray(el.props.children) &&
        (el.props.children as unknown[]).some((c) => c === 't:environments.tabBar.contextRename'),
    );
    (renameBtn?.props.onClick as () => void)?.();
    expect(onClose).toHaveBeenCalled();
    expect(onRename).toHaveBeenCalledWith(env);
  });

  it('Delete button calls onDelete(envId)', () => {
    const onDelete = vi.fn();
    const env = makeEnv({ id: 'e1' });
    const tree = callRender({
      envId: 'e1',
      x: 0,
      y: 0,
      environments: [env],
      prodEnv: undefined,
      onDeploy: vi.fn(),
      onPromote: vi.fn(),
      onRename: vi.fn(),
      onDelete,
      onClose: vi.fn(),
    });
    const deleteBtn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        Array.isArray(el.props.children) &&
        (el.props.children as unknown[]).some((c) => c === 't:environments.tabBar.contextDelete'),
    );
    (deleteBtn?.props.onClick as () => void)?.();
    expect(onDelete).toHaveBeenCalledWith('e1');
  });

  it('clicking the menu root calls stopPropagation', () => {
    const env = makeEnv({ id: 'e1' });
    const tree = callRender({
      envId: 'e1',
      x: 0,
      y: 0,
      environments: [env],
      prodEnv: undefined,
      onDeploy: vi.fn(),
      onPromote: vi.fn(),
      onRename: vi.fn(),
      onDelete: vi.fn(),
      onClose: vi.fn(),
    });
    const root = findByPredicate(
      tree,
      (el) => typeof el.props.className === 'string' && el.props.className.includes('fixed z-[9999]'),
    );
    const fakeEvent = { stopPropagation: vi.fn() };
    (root?.props.onClick as (e: unknown) => void)?.(fakeEvent);
    expect(fakeEvent.stopPropagation).toHaveBeenCalled();
  });
});

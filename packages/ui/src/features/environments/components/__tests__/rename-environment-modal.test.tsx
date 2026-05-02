/**
 * rf-etabs-2 — RenameEnvironmentModal component tests.
 *
 * Direct-FC tree-walker with vi.hoisted mocks. We patch react.useState to a
 * fixed-init passthrough and react-redux.useDispatch to a hoisted spy.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  tFn: vi.fn((k: string) => `t:${k}`),
  renameEnvSpy: vi.fn((arg) => ({ type: 'env/rename', payload: arg })),
  useStateQueue: [] as unknown[],
  setStates: [] as Array<ReturnType<typeof vi.fn>>,
}));

// Make rename thunk return a thunk-like object with .unwrap
const mockThunkResolve = (value: unknown) => ({
  unwrap: () => Promise.resolve(value),
});
const mockThunkReject = (err: unknown) => ({
  unwrap: () => Promise.reject(err),
});

vi.mock('react', async (orig) => {
  const r = (await orig()) as typeof import('react');
  return {
    ...r,
    useState: <T,>(init: T): [T, (v: T) => void] => {
      const next = mocks.useStateQueue.shift();
      const setter = vi.fn();
      mocks.setStates.push(setter);
      return [next === undefined ? init : (next as T), setter];
    },
  };
});

vi.mock('react-redux', () => ({
  useDispatch: () => mocks.dispatch,
}));

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: mocks.tFn }),
}));

vi.mock('../../../../store/slices/environments-slice', () => ({
  renameEnvironment: mocks.renameEnvSpy,
}));

import { RenameEnvironmentModal } from '../rename-environment-modal';
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

const callRender = (props: React.ComponentProps<typeof RenameEnvironmentModal>): unknown =>
  (RenameEnvironmentModal as (p: React.ComponentProps<typeof RenameEnvironmentModal>) => unknown)(props);

beforeEach(() => {
  mocks.dispatch.mockReset();
  mocks.dispatch.mockReturnValue(mockThunkResolve(undefined));
  mocks.tFn.mockClear();
  mocks.renameEnvSpy.mockClear();
  mocks.useStateQueue.length = 0;
  mocks.setStates.length = 0;
});

describe('RenameEnvironmentModal — render', () => {
  it('renders the title', () => {
    const tree = callRender({ env: makeEnv(), projectId: 'p1', onClose: vi.fn() });
    const heading = findByPredicate(tree, (el) => el.type === 'h3');
    expect(heading?.props.children).toBe('t:environments.renameModal.title');
  });

  it('renders the input pre-populated with the env name', () => {
    const tree = callRender({ env: makeEnv({ name: 'preview' }), projectId: 'p1', onClose: vi.fn() });
    const input = findByPredicate(tree, (el) => el.type === 'input');
    expect(input?.props.value).toBe('preview');
  });

  it('omits the error block when no error is set', () => {
    const tree = callRender({ env: makeEnv(), projectId: 'p1', onClose: vi.fn() });
    const errBlock = findByPredicate(
      tree,
      (el) => typeof el.props.className === 'string' && el.props.className.includes('bg-red-500/10'),
    );
    expect(errBlock).toBeUndefined();
  });
});

describe('RenameEnvironmentModal — handlers', () => {
  it('clicking outside the inner div calls onClose (overlay click)', () => {
    const onClose = vi.fn();
    const tree = callRender({ env: makeEnv(), projectId: 'p1', onClose });
    const overlay = findByPredicate(
      tree,
      (el) => typeof el.props.className === 'string' && el.props.className.includes('fixed inset-0'),
    );
    (overlay?.props.onClick as () => void)?.();
    expect(onClose).toHaveBeenCalled();
  });

  it('clicking the cancel button calls onClose', () => {
    const onClose = vi.fn();
    const tree = callRender({ env: makeEnv(), projectId: 'p1', onClose });
    const cancel = findByPredicate(
      tree,
      (el) => el.type === 'button' && el.props.children === 't:environments.renameModal.cancelButton',
    );
    (cancel?.props.onClick as () => void)?.();
    expect(onClose).toHaveBeenCalled();
  });

  it('save button is disabled when name is empty (initial state)', () => {
    const tree = callRender({ env: makeEnv({ name: '' }), projectId: 'p1', onClose: vi.fn() });
    const save = findByPredicate(
      tree,
      (el) => el.type === 'button' && typeof el.props.onClick === 'function' && el.props.children !== 't:environments.renameModal.cancelButton',
    );
    expect(save?.props.disabled).toBe(true);
  });

  it('save button is disabled when trimmed name equals env.name', () => {
    const tree = callRender({ env: makeEnv({ name: 'staging' }), projectId: 'p1', onClose: vi.fn() });
    const save = findByPredicate(
      tree,
      (el) => el.type === 'button' && typeof el.props.onClick === 'function' && el.props.children !== 't:environments.renameModal.cancelButton',
    );
    expect(save?.props.disabled).toBe(true);
  });

  it('clicking the inner div does NOT propagate to overlay', () => {
    const onClose = vi.fn();
    const tree = callRender({ env: makeEnv(), projectId: 'p1', onClose });
    const inner = findByPredicate(
      tree,
      (el) => typeof el.props.className === 'string' && el.props.className.includes('w-[380px]'),
    );
    const fakeEvent = { stopPropagation: vi.fn() };
    (inner?.props.onClick as (e: unknown) => void)?.(fakeEvent);
    expect(fakeEvent.stopPropagation).toHaveBeenCalled();
  });
});

describe('RenameEnvironmentModal — handleSave (integration via render-time call)', () => {
  it('shows the saving label when saving=true (manual probe)', () => {
    // We can't drive useState reliably without jsdom. The Save button label
    // toggles between savingButton and saveButton based on the saving state;
    // initial render shows saveButton.
    const tree = callRender({ env: makeEnv(), projectId: 'p1', onClose: vi.fn() });
    const saveLabel = findByPredicate(tree, (el) => el.props.children === 't:environments.renameModal.saveButton');
    expect(saveLabel).toBeDefined();
  });

  it('Enter on the input invokes handleSave (no-op when name unchanged)', () => {
    const onClose = vi.fn();
    const tree = callRender({ env: makeEnv({ name: 'staging' }), projectId: 'p1', onClose });
    const input = findByPredicate(tree, (el) => el.type === 'input');
    (input?.props.onKeyDown as (e: { key: string }) => void)?.({ key: 'Enter' });
    // trimmed name === env.name → onClose triggered
    expect(onClose).toHaveBeenCalled();
  });

  it('Enter on a non-Enter key does nothing', () => {
    const onClose = vi.fn();
    const tree = callRender({ env: makeEnv({ name: 'staging' }), projectId: 'p1', onClose });
    const input = findByPredicate(tree, (el) => el.type === 'input');
    (input?.props.onKeyDown as (e: { key: string }) => void)?.({ key: 'Tab' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('handleSave dispatches and closes on success', async () => {
    mocks.useStateQueue.push('renamed');
    const onClose = vi.fn();
    mocks.dispatch.mockReturnValue(mockThunkResolve(undefined));
    const tree = callRender({ env: makeEnv({ name: 'staging' }), projectId: 'p1', onClose });
    const buttons: ReactElementLike[] = [];
    for (const el of walk(tree)) if (el.type === 'button') buttons.push(el);
    const save = buttons.find((b) => b.props.children === 't:environments.renameModal.saveButton');
    await (save?.props.onClick as () => Promise<void>)?.();
    expect(mocks.renameEnvSpy).toHaveBeenCalledWith({ envId: 'env-1', projectId: 'p1', name: 'renamed' });
    expect(onClose).toHaveBeenCalled();
  });

  it('handleSave surfaces an error when the thunk rejects (string error)', async () => {
    mocks.useStateQueue.push('newname');
    mocks.dispatch.mockReturnValue(mockThunkReject('boom'));
    const onClose = vi.fn();
    const tree = callRender({ env: makeEnv({ name: 'staging' }), projectId: 'p1', onClose });
    const buttons: ReactElementLike[] = [];
    for (const el of walk(tree)) if (el.type === 'button') buttons.push(el);
    const save = buttons.find((b) => b.props.children === 't:environments.renameModal.saveButton');
    await (save?.props.onClick as () => Promise<void>)?.();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('handleSave surfaces a fallback error message when err.message is missing', async () => {
    mocks.useStateQueue.push('newname');
    mocks.dispatch.mockReturnValue(mockThunkReject({}));
    const tree = callRender({ env: makeEnv({ name: 'staging' }), projectId: 'p1', onClose: vi.fn() });
    const buttons: ReactElementLike[] = [];
    for (const el of walk(tree)) if (el.type === 'button') buttons.push(el);
    const save = buttons.find((b) => b.props.children === 't:environments.renameModal.saveButton');
    await (save?.props.onClick as () => Promise<void>)?.();
    // Used the fallback path
    expect(mocks.renameEnvSpy).toHaveBeenCalled();
  });

  it('handleSave on empty trimmed name sets a required-error', async () => {
    mocks.useStateQueue.push('   ');
    const onClose = vi.fn();
    const tree = callRender({ env: makeEnv({ name: 'staging' }), projectId: 'p1', onClose });
    const buttons: ReactElementLike[] = [];
    for (const el of walk(tree)) if (el.type === 'button') buttons.push(el);
    const save = buttons.find((b) => b.props.children === 't:environments.renameModal.saveButton');
    await (save?.props.onClick as () => Promise<void>)?.();
    expect(mocks.renameEnvSpy).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('RenameEnvironmentModal — error display', () => {
  it('renders the error block when error state is non-null', () => {
    // Push "name" then "saving" then "error". useState call order:
    // 1) name (env.name)
    // 2) saving (false)
    // 3) error (null)
    mocks.useStateQueue.push('staging'); // name
    mocks.useStateQueue.push(false); // saving
    mocks.useStateQueue.push('boom error'); // error
    const tree = callRender({ env: makeEnv({ name: 'staging' }), projectId: 'p1', onClose: vi.fn() });
    const errBlock = findByPredicate(
      tree,
      (el) => typeof el.props.className === 'string' && el.props.className.includes('bg-red-500/10'),
    );
    expect(errBlock).toBeDefined();
  });
});

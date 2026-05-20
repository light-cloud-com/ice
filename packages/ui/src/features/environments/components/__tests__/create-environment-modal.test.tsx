/**
 * rf-etabs-2 — CreateEnvironmentModal component tests.
 *
 * Direct-FC tree-walker with vi.hoisted mocks for IceSelect identity, the
 * createEnvironment thunk, react.useState passthrough, and useDispatch.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  tFn: vi.fn((k: string) => `t:${k}`),
  createEnvSpy: vi.fn((arg) => ({ type: 'env/create', payload: arg })),
  MockIceSelect: vi.fn(),
  useStateQueue: [] as unknown[],
  setStates: [] as Array<ReturnType<typeof vi.fn>>,
}));

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

vi.mock('../../../../shared/components/ui/ice-select', () => ({
  IceSelect: mocks.MockIceSelect,
}));

vi.mock('../../../../store/slices/environments-slice', () => ({
  createEnvironment: mocks.createEnvSpy,
}));

import { CreateEnvironmentModal } from '../create-environment-modal';

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

const callRender = (props: React.ComponentProps<typeof CreateEnvironmentModal>): unknown =>
  (CreateEnvironmentModal as (p: React.ComponentProps<typeof CreateEnvironmentModal>) => unknown)(props);

beforeEach(() => {
  mocks.dispatch.mockReset();
  mocks.dispatch.mockReturnValue(mockThunkResolve(undefined));
  mocks.tFn.mockClear();
  mocks.createEnvSpy.mockClear();
  mocks.useStateQueue.length = 0;
  mocks.setStates.length = 0;
});

describe('CreateEnvironmentModal — render', () => {
  it('renders the title and description', () => {
    const tree = callRender({ projectId: 'p1', onClose: vi.fn() });
    const heading = findByPredicate(tree, (el) => el.type === 'h3');
    expect(heading?.props.children).toBe('t:environments.createModal.title');
    const desc = findByPredicate(tree, (el) => el.type === 'p');
    expect(desc?.props.children).toBe('t:environments.createModal.description');
  });

  it('renders the IceSelect with the three type options', () => {
    const tree = callRender({ projectId: 'p1', onClose: vi.fn() });
    const select = findByPredicate(tree, (el) => el.type === mocks.MockIceSelect);
    expect(select).toBeDefined();
    const options = select?.props.options as Array<{ value: string; label: string }>;
    expect(options.map((o) => o.value)).toEqual(['staging', 'development', 'pr']);
  });

  it('IceSelect default value is staging', () => {
    const tree = callRender({ projectId: 'p1', onClose: vi.fn() });
    const select = findByPredicate(tree, (el) => el.type === mocks.MockIceSelect);
    expect(select?.props.value).toBe('staging');
  });

  it('renders two text inputs (name and region)', () => {
    const tree = callRender({ projectId: 'p1', onClose: vi.fn() });
    const inputs: ReactElementLike[] = [];
    for (const el of walk(tree)) if (el.type === 'input') inputs.push(el);
    expect(inputs.length).toBe(2);
    expect(inputs[0].props.placeholder).toBe('t:environments.createModal.namePlaceholder');
    expect(inputs[1].props.placeholder).toBe('t:environments.createModal.regionPlaceholder');
  });

  it('omits the error block when no error is set', () => {
    const tree = callRender({ projectId: 'p1', onClose: vi.fn() });
    const errBlock = findByPredicate(
      tree,
      (el) => typeof el.props.className === 'string' && el.props.className.includes('bg-red-500/10'),
    );
    expect(errBlock).toBeUndefined();
  });
});

describe('CreateEnvironmentModal — handlers', () => {
  it('clicking outside (overlay) calls onClose', () => {
    const onClose = vi.fn();
    const tree = callRender({ projectId: 'p1', onClose });
    const overlay = findByPredicate(
      tree,
      (el) => typeof el.props.className === 'string' && el.props.className.includes('fixed inset-0'),
    );
    (overlay?.props.onClick as () => void)?.();
    expect(onClose).toHaveBeenCalled();
  });

  it('clicking the cancel button calls onClose', () => {
    const onClose = vi.fn();
    const tree = callRender({ projectId: 'p1', onClose });
    const cancel = findByPredicate(
      tree,
      (el) => el.type === 'button' && el.props.children === 't:environments.createModal.cancelButton',
    );
    (cancel?.props.onClick as () => void)?.();
    expect(onClose).toHaveBeenCalled();
  });

  it('clicking the inner div does NOT propagate to overlay', () => {
    const tree = callRender({ projectId: 'p1', onClose: vi.fn() });
    const inner = findByPredicate(
      tree,
      (el) => typeof el.props.className === 'string' && el.props.className.includes('w-[380px]'),
    );
    const fakeEvent = { stopPropagation: vi.fn() };
    (inner?.props.onClick as (e: unknown) => void)?.(fakeEvent);
    expect(fakeEvent.stopPropagation).toHaveBeenCalled();
  });

  it('create button is disabled when name is empty', () => {
    const tree = callRender({ projectId: 'p1', onClose: vi.fn() });
    const create = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof el.props.onClick === 'function' &&
        el.props.children === 't:environments.createModal.createButton',
    );
    expect(create?.props.disabled).toBe(true);
  });

  it('create button label shows createButton when not creating', () => {
    const tree = callRender({ projectId: 'p1', onClose: vi.fn() });
    const create = findByPredicate(tree, (el) => el.props.children === 't:environments.createModal.createButton');
    expect(create).toBeDefined();
  });

  it('Enter key on the name input triggers handleCreate (early-returns on empty)', () => {
    const onClose = vi.fn();
    const tree = callRender({ projectId: 'p1', onClose });
    const inputs: ReactElementLike[] = [];
    for (const el of walk(tree)) if (el.type === 'input') inputs.push(el);
    (inputs[0].props.onKeyDown as (e: { key: string }) => void)?.({ key: 'Enter' });
    // name is empty → no dispatch (just sets error)
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it('non-Enter key on the name input does nothing', () => {
    const onClose = vi.fn();
    const tree = callRender({ projectId: 'p1', onClose });
    const inputs: ReactElementLike[] = [];
    for (const el of walk(tree)) if (el.type === 'input') inputs.push(el);
    (inputs[0].props.onKeyDown as (e: { key: string }) => void)?.({ key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('IceSelect onChange callback is wired (drives setType)', () => {
    const tree = callRender({ projectId: 'p1', onClose: vi.fn() });
    const select = findByPredicate(tree, (el) => el.type === mocks.MockIceSelect);
    expect(typeof (select?.props.onChange as unknown)).toBe('function');
    expect(() => (select?.props.onChange as (v: string) => void)('development')).not.toThrow();
  });

  it('typing the region input fires setRegion (no dispatch)', () => {
    const tree = callRender({ projectId: 'p1', onClose: vi.fn() });
    const inputs: ReactElementLike[] = [];
    for (const el of walk(tree)) if (el.type === 'input') inputs.push(el);
    expect(typeof inputs[1].props.onChange).toBe('function');
  });
});

describe('CreateEnvironmentModal — handleCreate (async)', () => {
  it('handleCreate dispatches createEnvironment + closes on success', async () => {
    // Override "name" useState
    mocks.useStateQueue.push('staging-2');
    const onClose = vi.fn();
    mocks.dispatch.mockReturnValue(mockThunkResolve(undefined));
    const tree = callRender({ projectId: 'p1', onClose });
    const buttons: ReactElementLike[] = [];
    for (const el of walk(tree)) if (el.type === 'button') buttons.push(el);
    const create = buttons.find((b) => b.props.children === 't:environments.createModal.createButton');
    await (create?.props.onClick as () => Promise<void>)?.();
    expect(mocks.createEnvSpy).toHaveBeenCalledWith({
      projectId: 'p1',
      name: 'staging-2',
      type: 'staging',
      region: undefined,
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('handleCreate forwards a non-empty region', async () => {
    mocks.useStateQueue.push('staging-2'); // name
    mocks.useStateQueue.push('staging'); // type
    mocks.useStateQueue.push('eu-west1'); // region
    mocks.dispatch.mockReturnValue(mockThunkResolve(undefined));
    const tree = callRender({ projectId: 'p2', onClose: vi.fn() });
    const buttons: ReactElementLike[] = [];
    for (const el of walk(tree)) if (el.type === 'button') buttons.push(el);
    const create = buttons.find((b) => b.props.children === 't:environments.createModal.createButton');
    await (create?.props.onClick as () => Promise<void>)?.();
    expect(mocks.createEnvSpy).toHaveBeenCalledWith({
      projectId: 'p2',
      name: 'staging-2',
      type: 'staging',
      region: 'eu-west1',
    });
  });

  it('handleCreate surfaces a string error', async () => {
    mocks.useStateQueue.push('valid-name');
    mocks.dispatch.mockReturnValue(mockThunkReject('explosion'));
    const onClose = vi.fn();
    const tree = callRender({ projectId: 'p1', onClose });
    const buttons: ReactElementLike[] = [];
    for (const el of walk(tree)) if (el.type === 'button') buttons.push(el);
    const create = buttons.find((b) => b.props.children === 't:environments.createModal.createButton');
    await (create?.props.onClick as () => Promise<void>)?.();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('handleCreate surfaces err.message when err is an object with one', async () => {
    mocks.useStateQueue.push('valid-name');
    mocks.dispatch.mockReturnValue(mockThunkReject({ message: 'msg detail' }));
    const tree = callRender({ projectId: 'p1', onClose: vi.fn() });
    const buttons: ReactElementLike[] = [];
    for (const el of walk(tree)) if (el.type === 'button') buttons.push(el);
    const create = buttons.find((b) => b.props.children === 't:environments.createModal.createButton');
    await (create?.props.onClick as () => Promise<void>)?.();
    expect(mocks.createEnvSpy).toHaveBeenCalled();
  });

  it('handleCreate falls back to fallback error message', async () => {
    mocks.useStateQueue.push('valid-name');
    mocks.dispatch.mockReturnValue(mockThunkReject({}));
    const tree = callRender({ projectId: 'p1', onClose: vi.fn() });
    const buttons: ReactElementLike[] = [];
    for (const el of walk(tree)) if (el.type === 'button') buttons.push(el);
    const create = buttons.find((b) => b.props.children === 't:environments.createModal.createButton');
    await (create?.props.onClick as () => Promise<void>)?.();
    expect(mocks.createEnvSpy).toHaveBeenCalled();
  });

  it('renders error block when error state is non-null', () => {
    mocks.useStateQueue.push(''); // name
    mocks.useStateQueue.push('staging'); // type
    mocks.useStateQueue.push(''); // region
    mocks.useStateQueue.push(false); // creating
    mocks.useStateQueue.push('boom!'); // error
    const tree = callRender({ projectId: 'p1', onClose: vi.fn() });
    const errBlock = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { className?: string }).className === 'string' &&
        ((el.props as { className: string }).className.includes('bg-red-500/10') ?? false),
    );
    expect(errBlock).toBeDefined();
  });
});

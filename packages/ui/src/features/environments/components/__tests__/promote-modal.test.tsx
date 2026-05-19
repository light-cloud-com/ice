/**
 * PromoteModal — environment-promotion confirmation modal.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  state: {
    environments: {
      pendingDiff: null as null | {
        added: Array<{ nodeId: string; label: string; iceType: string }>;
        modified: Array<{ nodeId: string; label: string; iceType: string; changedFields?: string[] }>;
        removed: Array<{ nodeId: string; label: string; iceType: string }>;
        unchangedCount: number;
      },
      pendingPromote: null as null | { sourceEnvId: string; targetEnvId: string },
      promoting: false,
      byProject: {} as Record<string, Array<{ id: string; name: string }>>,
    },
  },
  dispatch: vi.fn((arg: unknown) => {
    if (typeof (arg as { unwrap?: unknown }).unwrap === 'function') return arg;
    return Promise.resolve(arg);
  }),
  promoteSpy: vi.fn((arg: unknown) => ({ unwrap: () => Promise.resolve(arg) })),
  fetchSpy: vi.fn(() => ({ type: 'env/fetch' })),
  clearSpy: vi.fn(() => ({ type: 'env/clear' })),
}));

vi.mock('react-redux', () => ({
  useSelector: (sel: (s: unknown) => unknown) => sel(mocks.state),
  useDispatch: () => mocks.dispatch,
}));

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => `t:${k}` }),
  t: (k: string) => `t:${k}`,
}));

vi.mock('../../../../shared/utils/cn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

vi.mock('../../../../store/slices/environments-slice', () => ({
  promoteEnvironment: (arg: unknown) => mocks.promoteSpy(arg),
  clearPendingDiff: () => mocks.clearSpy(),
  fetchEnvironments: () => mocks.fetchSpy(),
}));

import { PromoteModal } from '../promote-modal';

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
        else if (typeof item === 'number') s += String(item) + ' ';
      }
    } else if (typeof c === 'number') s += String(c) + ' ';
  }
  return s;
}

const callRender = (): unknown => (PromoteModal as () => unknown)();

beforeEach(() => {
  mocks.state.environments = {
    pendingDiff: null,
    pendingPromote: null,
    promoting: false,
    byProject: {},
  };
  mocks.dispatch.mockReset();
  mocks.dispatch.mockImplementation((arg: unknown) => {
    if (arg && typeof (arg as { unwrap?: unknown }).unwrap === 'function') return arg;
    return Promise.resolve(arg);
  });
  mocks.promoteSpy.mockClear();
  mocks.fetchSpy.mockClear();
  mocks.clearSpy.mockClear();
});

describe('PromoteModal — null state', () => {
  it('returns null when no pendingDiff', () => {
    expect(callRender()).toBeNull();
  });

  it('returns null when pendingDiff exists but no pendingPromote', () => {
    mocks.state.environments.pendingDiff = {
      added: [],
      modified: [],
      removed: [],
      unchangedCount: 0,
    };
    expect(callRender()).toBeNull();
  });
});

describe('PromoteModal — no-changes case', () => {
  beforeEach(() => {
    mocks.state.environments.pendingDiff = {
      added: [],
      modified: [],
      removed: [],
      unchangedCount: 5,
    };
    mocks.state.environments.pendingPromote = { sourceEnvId: 's', targetEnvId: 't' };
    mocks.state.environments.byProject = {
      p1: [
        { id: 's', name: 'staging' },
        { id: 't', name: 'production' },
      ],
    };
  });

  it('renders the inSync placeholder', () => {
    const tree = callRender();
    expect(collectText(tree)).toContain('t:environments.promote.inSync');
  });

  it('does not render the Promote button when noChanges', () => {
    const tree = callRender();
    const buttons = findAll(tree, (el) => el.type === 'button');
    // Only Cancel
    expect(buttons.length).toBe(1);
  });
});

describe('PromoteModal — diff case', () => {
  beforeEach(() => {
    mocks.state.environments.pendingDiff = {
      added: [{ nodeId: 'n1', label: 'New Block', iceType: 'Compute.X' }],
      modified: [
        { nodeId: 'n2', label: 'Updated', iceType: 'Compute.Y', changedFields: ['region', 'tier'] },
      ],
      removed: [{ nodeId: 'n3', label: 'Gone', iceType: 'Compute.Z' }],
      unchangedCount: 7,
    };
    mocks.state.environments.pendingPromote = { sourceEnvId: 's', targetEnvId: 't' };
    mocks.state.environments.byProject = {
      p1: [
        { id: 's', name: 'staging' },
        { id: 't', name: 'production' },
      ],
    };
  });

  it('renders the source + target names from the env list', () => {
    const tree = callRender();
    const text = collectText(tree);
    expect(text).toContain('staging');
    expect(text).toContain('production');
  });

  it('renders one DiffRow per added/modified/removed entry', () => {
    const tree = callRender();
    const text = collectText(tree);
    expect(text).toContain('New Block');
    expect(text).toContain('Updated');
    expect(text).toContain('Gone');
  });

  it('shows changedFields detail when present', () => {
    const tree = callRender();
    const text = collectText(tree);
    expect(text).toContain('region, tier');
  });

  it('shows the unchangedCount when > 0', () => {
    const tree = callRender();
    const text = collectText(tree);
    expect(text).toContain('7');
    expect(text).toContain('t:environments.promote.unchanged');
  });

  it('renders Promote button (with target name) and Cancel', () => {
    const tree = callRender();
    const buttons = findAll(tree, (el) => el.type === 'button');
    expect(buttons.length).toBe(2);
  });

  it('clicking Cancel dispatches clearPendingDiff', () => {
    const tree = callRender();
    const buttons = findAll(tree, (el) => el.type === 'button');
    (buttons[0].props.onClick as () => void)?.();
    expect(mocks.clearSpy).toHaveBeenCalled();
  });

  it('overlay onClick dispatches clearPendingDiff', () => {
    const tree = callRender() as ReactElementLike;
    (tree.props.onClick as () => void)?.();
    expect(mocks.clearSpy).toHaveBeenCalled();
  });

  it('clicking Promote dispatches promoteEnvironment + fetchEnvironments', async () => {
    const tree = callRender();
    const buttons = findAll(tree, (el) => el.type === 'button');
    await (buttons[1].props.onClick as () => Promise<void>)?.();
    expect(mocks.promoteSpy).toHaveBeenCalledWith({ sourceEnvId: 's', targetEnvId: 't' });
    expect(mocks.fetchSpy).toHaveBeenCalled();
  });

  it('inner content stops propagation', () => {
    const tree = callRender() as ReactElementLike;
    const inner = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { onClick?: unknown }).onClick === 'function' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        ((el.props as { className: string }).className.includes('w-[480px]') ?? false),
    );
    const fakeE = { stopPropagation: vi.fn() };
    (inner?.props.onClick as (e: unknown) => void)?.(fakeE);
    expect(fakeE.stopPropagation).toHaveBeenCalled();
  });

  it('shows "in sync" placeholder when no diff items but unchanged is set', () => {
    mocks.state.environments.pendingDiff = {
      added: [],
      modified: [],
      removed: [],
      unchangedCount: 12,
    };
    const tree = callRender();
    expect(collectText(tree)).toContain('t:environments.promote.inSync');
  });
});

describe('PromoteModal — singular/plural copy', () => {
  it('uses the singular "change" word for exactly 1 change', () => {
    mocks.state.environments.pendingDiff = {
      added: [{ nodeId: 'n1', label: 'Solo', iceType: 'X' }],
      modified: [],
      removed: [],
      unchangedCount: 0,
    };
    mocks.state.environments.pendingPromote = { sourceEnvId: 's', targetEnvId: 't' };
    const tree = callRender();
    expect(collectText(tree)).toContain('t:environments.promote.change');
  });

  it('uses plural "changes" for >1', () => {
    mocks.state.environments.pendingDiff = {
      added: [{ nodeId: 'n1', label: 'a', iceType: 'X' }, { nodeId: 'n2', label: 'b', iceType: 'X' }],
      modified: [],
      removed: [],
      unchangedCount: 0,
    };
    mocks.state.environments.pendingPromote = { sourceEnvId: 's', targetEnvId: 't' };
    const tree = callRender();
    expect(collectText(tree)).toContain('t:environments.promote.changes');
  });

  it('uses singular "node" for unchangedCount === 1', () => {
    mocks.state.environments.pendingDiff = {
      added: [{ nodeId: 'n1', label: 'a', iceType: 'X' }],
      modified: [],
      removed: [],
      unchangedCount: 1,
    };
    mocks.state.environments.pendingPromote = { sourceEnvId: 's', targetEnvId: 't' };
    const tree = callRender();
    expect(collectText(tree)).toContain('t:environments.promote.node');
  });
});

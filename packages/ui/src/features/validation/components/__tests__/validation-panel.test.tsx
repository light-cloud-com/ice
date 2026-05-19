/**
 * ValidationPanel — right sidebar issue list.
 *
 * Direct-FC tree-walker. Component reads validation slice + dispatches
 * setSelectedNodes when an issue is clicked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CanvasIssue } from '../../../../store/slices/validation-slice';

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  state: {
    issues: [] as CanvasIssue[],
    valid: true,
    summary: { errors: 0, warnings: 0, info: 0 } as { errors: number; warnings: number; info?: number },
  },
  setSelectedNodes: vi.fn((ids: string[]) => ({ type: 'selection/set', payload: ids })),
}));

// Patch React.useMemo to a passthrough so memoized filters run every render
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const useMemo = vi.fn(<T,>(fn: () => T): T => fn());
  const def = (actual as unknown as { default?: typeof actual }).default ?? actual;
  return { ...actual, useMemo, default: { ...def, useMemo } };
});

vi.mock('react-redux', () => ({
  useDispatch: () => mocks.dispatch,
  useSelector: (sel: (s: unknown) => unknown) => sel({ validation: mocks.state }),
}));

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => `t:${k}` }),
}));

vi.mock('../../../../store/slices/selection-slice', () => ({
  setSelectedNodes: (ids: string[]) => mocks.setSelectedNodes(ids),
}));

import { ValidationPanel } from '../validation-panel';

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

const callRender = (): unknown => (ValidationPanel as () => unknown)();

beforeEach(() => {
  mocks.state.issues = [];
  mocks.state.valid = true;
  mocks.state.summary = { errors: 0, warnings: 0, info: 0 };
  mocks.dispatch.mockReset();
  mocks.setSelectedNodes.mockClear();
});

const issue = (over: Partial<CanvasIssue> = {}): CanvasIssue =>
  ({
    id: 'iss-1',
    severity: 'error',
    message: 'something broke',
    category: 'graph',
    nodeId: 'n1',
    ...over,
  }) as CanvasIssue;

describe('ValidationPanel — empty state', () => {
  it('renders the no-issues placeholder when valid+no issues', () => {
    mocks.state.valid = true;
    mocks.state.issues = [];
    const tree = callRender();
    expect(collectText(tree)).toContain('t:validation.noIssues');
  });

  it('does not render the error count badge when errors=0', () => {
    mocks.state.summary = { errors: 0, warnings: 0 };
    const tree = callRender();
    const badges = findAll(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        ((el.props as { className: string }).className.includes('bg-red-500/15') ?? false),
    );
    expect(badges).toHaveLength(0);
  });

  it('does not render the warning count badge when warnings=0', () => {
    mocks.state.summary = { errors: 0, warnings: 0 };
    const tree = callRender();
    const badges = findAll(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        ((el.props as { className: string }).className.includes('bg-amber-500/15') ?? false),
    );
    expect(badges).toHaveLength(0);
  });
});

describe('ValidationPanel — populated state', () => {
  it('renders the error count badge when errors>0', () => {
    mocks.state.summary = { errors: 3, warnings: 0 };
    const tree = callRender();
    const badge = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        ((el.props as { className: string }).className.includes('bg-red-500/15') ?? false),
    );
    expect(badge).toBeDefined();
    expect(badge?.props.children).toBe(3);
  });

  it('renders the warning count badge when warnings>0', () => {
    mocks.state.summary = { errors: 0, warnings: 2 };
    const tree = callRender();
    const badge = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        ((el.props as { className: string }).className.includes('bg-amber-500/15') ?? false),
    );
    expect(badge).toBeDefined();
    expect(badge?.props.children).toBe(2);
  });

  it('groups errors / warnings / info into separate IssueGroups', () => {
    mocks.state.valid = false;
    mocks.state.issues = [
      issue({ id: 'e1', severity: 'error', message: 'err msg' }),
      issue({ id: 'w1', severity: 'warning', message: 'warn msg' }),
      issue({ id: 'i1', severity: 'info', message: 'info msg' }),
    ];
    const tree = callRender();
    const text = collectText(tree);
    expect(text).toContain('err msg');
    expect(text).toContain('warn msg');
    expect(text).toContain('info msg');
    expect(text).toContain('t:validation.errors');
    expect(text).toContain('t:validation.warnings');
    expect(text).toContain('t:validation.info');
  });

  it('does not render the errors group when none have severity=error', () => {
    mocks.state.valid = false;
    mocks.state.issues = [issue({ id: 'w1', severity: 'warning', message: 'just warn' })];
    const tree = callRender();
    const text = collectText(tree);
    expect(text).not.toContain('t:validation.errors');
    expect(text).toContain('t:validation.warnings');
  });

  it('does not render the no-issues placeholder when issues are present', () => {
    mocks.state.valid = false;
    mocks.state.issues = [issue({ id: 'e1', severity: 'error', message: 'err msg' })];
    const tree = callRender();
    expect(collectText(tree)).not.toContain('t:validation.noIssues');
  });
});

describe('ValidationPanel — handlers', () => {
  it('clicking an issue dispatches setSelectedNodes with that nodeId', () => {
    mocks.state.valid = false;
    mocks.state.issues = [issue({ id: 'e1', severity: 'error', message: 'msg', nodeId: 'node-42' })];
    const tree = callRender();
    const issueButton = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        ((el.props as { className: string }).className.includes('w-full flex items-start') ?? false),
    );
    (issueButton?.props.onClick as () => void)?.();
    expect(mocks.setSelectedNodes).toHaveBeenCalledWith(['node-42']);
    expect(mocks.dispatch).toHaveBeenCalled();
  });

  it('does not dispatch when issue.nodeId is undefined', () => {
    mocks.state.valid = false;
    mocks.state.issues = [issue({ id: 'e1', severity: 'error', message: 'no node', nodeId: undefined })];
    const tree = callRender();
    const issueButton = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        ((el.props as { className: string }).className.includes('w-full flex items-start') ?? false),
    );
    (issueButton?.props.onClick as () => void)?.();
    expect(mocks.setSelectedNodes).not.toHaveBeenCalled();
  });

  it('renders the suggestion when issue has one', () => {
    mocks.state.valid = false;
    mocks.state.issues = [issue({ id: 'e1', severity: 'error', message: 'msg', suggestion: 'try this fix' })];
    const tree = callRender();
    expect(collectText(tree)).toContain('try this fix');
  });

  it('shows red icon color for errors', () => {
    mocks.state.valid = false;
    mocks.state.issues = [issue({ id: 'e1', severity: 'error', message: 'm' })];
    const tree = callRender();
    const icons = findAll(
      tree,
      (el) =>
        typeof (el.props as { className?: string }).className === 'string' &&
        ((el.props as { className: string }).className.includes('w-3.5 h-3.5 mt-0.5 flex-shrink-0') ?? false),
    );
    expect(icons[0].props.className as string).toContain('text-red-400');
  });

  it('shows amber icon color for warnings', () => {
    mocks.state.valid = false;
    mocks.state.issues = [issue({ id: 'w1', severity: 'warning', message: 'm' })];
    const tree = callRender();
    const icons = findAll(
      tree,
      (el) =>
        typeof (el.props as { className?: string }).className === 'string' &&
        ((el.props as { className: string }).className.includes('w-3.5 h-3.5 mt-0.5 flex-shrink-0') ?? false),
    );
    expect(icons[0].props.className as string).toContain('text-amber-400');
  });

  it('falls back to muted color for info severity', () => {
    mocks.state.valid = false;
    mocks.state.issues = [issue({ id: 'i1', severity: 'info', message: 'm' })];
    const tree = callRender();
    const icons = findAll(
      tree,
      (el) =>
        typeof (el.props as { className?: string }).className === 'string' &&
        ((el.props as { className: string }).className.includes('w-3.5 h-3.5 mt-0.5 flex-shrink-0') ?? false),
    );
    expect(icons[0].props.className as string).toContain('text-ice-text-3/40');
  });
});

/**
 * rf-props-10 — drift section (DriftIndicator + DriftCheckButton).
 *
 * Same direct-FC tree-walker pattern as rf-props-6 / rf-props-9 (cite
 * `tree-walker-for-react-fc-tests-must-flatten-nested-children-arrays`):
 * components are invoked as React.FC functions, the returned tree walked
 * depth-first to find leaves and assert on type / props / children.
 *
 * `useDriftCheck` is mocked so the button can be tested in isolation —
 * the hook itself has its own coverage in
 * `properties/hooks/__tests__/use-drift-check.test.tsx` (rf-props-8).
 *
 * Redux is wired through a real store (so `useSelector` resolves) but with
 * only the pieces of state the indicator reads — `deploy.driftByNode` and
 * `deploy.driftCheckLoading`. We use a tiny one-shot reducer rather than the
 * real `deploy-slice` because we want full control of the initial state from
 * each test.
 */

import { configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Provider } from 'react-redux';
import { describe, it, expect, vi } from 'vitest';

// Mock useDriftCheck — the test sits at `components/sections/__tests__/`,
// so `../../..` lands at `properties/`, and `../../../hooks/use-drift-check`
// resolves to `properties/hooks/use-drift-check`. The mock is hoisted before
// the import below so DriftCheckButton picks up the mocked version.
const driftCheckSpy = vi.fn();
vi.mock('../../../hooks/use-drift-check', () => ({
  useDriftCheck: vi.fn(() => ({ isLoading: false, checkDrift: driftCheckSpy })),
}));

import { useDriftCheck } from '../../../hooks/use-drift-check';
import { DriftIndicator, DriftCheckButton } from '../drift';

// ─── Tree-walker (same shape as rf-props-6/9) ───────────────────────────────

type ReactNodeLike = React.ReactNode;

function* walk(node: ReactNodeLike): Generator<React.ReactElement> {
  if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') {
    return;
  }
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c as ReactNodeLike);
    return;
  }
  const el = node as React.ReactElement;
  yield el;
  const children = (el.props as { children?: React.ReactNode } | undefined)?.children;
  if (children == null) return;
  yield* walk(children);
}

function findByPredicate(tree: React.ReactNode, predicate: (el: React.ReactElement) => boolean): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) {
    if (el && predicate(el)) out.push(el);
  }
  return out;
}

function findByType(tree: React.ReactNode, type: string): React.ReactElement[] {
  return findByPredicate(tree, (el) => el.type === type);
}

function collectText(tree: React.ReactNode): string {
  const parts: string[] = [];
  const visit = (n: ReactNodeLike): void => {
    if (n == null || typeof n === 'boolean') return;
    if (typeof n === 'string' || typeof n === 'number') {
      parts.push(String(n));
      return;
    }
    if (Array.isArray(n)) {
      for (const c of n) visit(c as ReactNodeLike);
      return;
    }
    const el = n as React.ReactElement;
    visit((el.props as { children?: React.ReactNode } | undefined)?.children ?? null);
  };
  visit(tree);
  return parts.join(' ');
}

// ─── Mini deploy slice — only the bits DriftIndicator subscribes to ─────────

interface DriftChange {
  path: string;
  desired: unknown;
  actual: unknown;
}

interface NodeDriftInfoLike {
  nodeId: string;
  status: 'in_sync' | 'drifted' | 'missing' | 'extra' | 'unknown';
  changes: DriftChange[];
}

interface MiniDeployState {
  driftByNode: Record<string, NodeDriftInfoLike>;
  driftCheckLoading: boolean;
}

const miniDeploy = createSlice({
  name: 'deploy',
  initialState: {
    driftByNode: {},
    driftMeta: { checkedAt: null, unsupported: false },
    driftCheckLoading: false,
  } as MiniDeployState,
  reducers: {
    set(state, action: PayloadAction<MiniDeployState>) {
      state.driftByNode = action.payload.driftByNode;
      state.driftCheckLoading = action.payload.driftCheckLoading;
    },
  },
});

function makeStore(deploy: Partial<MiniDeployState> = {}) {
  return configureStore({
    reducer: { deploy: miniDeploy.reducer },
    preloadedState: {
      deploy: {
        driftByNode: deploy.driftByNode ?? {},
        driftCheckLoading: deploy.driftCheckLoading ?? false,
      },
    },
  });
}

// ─── Provider-wrapped FC invocation ─────────────────────────────────────────
// Direct-FC invocation skips React's hook context entirely (and `useSelector`
// throws because there's no Provider in scope). Wrap the component in a one-
// off `Provider` element so its render tree contains the component as a child;
// then walk to find it and call it as a function with the captured props +
// store. This is the rf-props-9 pattern adapted to a hook-using component.
//
// We can't just call `<DriftIndicator />` as a function because `useSelector`
// needs Redux context. Instead we render through `Provider` using
// `react-test-renderer` semantics by short-circuiting: invoke the component
// inside the Provider's render output and let React's runtime execute hooks
// via a minimal manual setup. The simplest reliable path here is using
// `renderToString` from `react-dom/server`, which runs hooks and we can
// then inspect the produced string. But we need access to handler props
// (the button's `onClick`), so we actually need both — string for text
// assertions and direct invocation when we control the hook output via mock.
//
// Decision: DriftIndicator is hook-driven (Redux subscriptions), so it goes
// through `renderToString` + an HTML-substring assertion. DriftCheckButton's
// hook is mocked to a known shape, so we can invoke it directly.

// React SSR injects `<!-- -->` markers between adjacent text expressions so it
// can rehydrate them on the client. They split substrings like `1 change`
// into `1<!-- --> <!-- -->change` in the raw output. Strip the markers (and
// any pure whitespace they leave behind) before substring assertions so tests
// match the visual text the user sees, not the SSR transport encoding.
const stripSsrMarkers = (html: string): string => html.replace(/<!-- -->/g, '');

const renderIndicator = (store: ReturnType<typeof makeStore>, nodeId: string): string =>
  stripSsrMarkers(
    renderToString(
      <Provider store={store}>
        <DriftIndicator nodeId={nodeId} />
      </Provider>,
    ),
  );

// ─── DriftIndicator ─────────────────────────────────────────────────────────

describe('DriftIndicator', () => {
  it('renders the spinner + checking text when isLoading is true', () => {
    const html = renderIndicator(makeStore({ driftCheckLoading: true }), 'n1');
    expect(html).toContain('animate-spin');
    expect(html).toContain('Checking drift');
  });

  it('returns null when no driftInfo exists for the node', () => {
    const html = renderIndicator(makeStore(), 'n1');
    expect(html).toBe('');
  });

  it('renders the emerald dot + In sync text when status is in_sync', () => {
    const html = renderIndicator(
      makeStore({
        driftByNode: { n1: { nodeId: 'n1', status: 'in_sync', changes: [] } },
      }),
      'n1',
    );
    expect(html).toContain('bg-emerald-500');
    expect(html).toContain('In sync');
  });

  it('renders the amber dot + notInDeployment text when status is missing', () => {
    const html = renderIndicator(
      makeStore({
        driftByNode: { n1: { nodeId: 'n1', status: 'missing', changes: [] } },
      }),
      'n1',
    );
    expect(html).toContain('bg-amber-500');
    expect(html).toContain('Not in latest deployment');
  });

  it('renders the orange dot + change-singular text + the diff line for drifted with one change', () => {
    const html = renderIndicator(
      makeStore({
        driftByNode: {
          n1: {
            nodeId: 'n1',
            status: 'drifted',
            changes: [{ path: 'spec.cpu', actual: '1', desired: '2' }],
          },
        },
      }),
      'n1',
    );
    expect(html).toContain('bg-orange-500');
    expect(html).toContain('Drifted');
    expect(html).toContain('1 change');
    // Singular not plural — the substring match has to disambiguate "change" vs "changes".
    expect(html).not.toContain('1 changes');
    // Diff line content
    expect(html).toContain('spec.cpu');
    expect(html).toContain('1');
    expect(html).toContain('2');
  });

  it('renders multiple diff lines + plural change text when there are multiple drifted changes', () => {
    const html = renderIndicator(
      makeStore({
        driftByNode: {
          n1: {
            nodeId: 'n1',
            status: 'drifted',
            changes: [
              { path: 'spec.cpu', actual: '1', desired: '2' },
              { path: 'spec.memory', actual: '512Mi', desired: '1Gi' },
              { path: 'spec.replicas', actual: 1, desired: 3 },
            ],
          },
        },
      }),
      'n1',
    );
    expect(html).toContain('3 changes');
    expect(html).toContain('spec.cpu');
    expect(html).toContain('spec.memory');
    expect(html).toContain('spec.replicas');
    // Numeric values get coerced through `String(...)` — verify they survive.
    expect(html).toContain('512Mi');
    expect(html).toContain('1Gi');
  });

  it('returns null when status is drifted but the changes array is empty (the && length>0 guard)', () => {
    const html = renderIndicator(
      makeStore({
        driftByNode: { n1: { nodeId: 'n1', status: 'drifted', changes: [] } },
      }),
      'n1',
    );
    expect(html).toBe('');
  });
});

// ─── DriftCheckButton ───────────────────────────────────────────────────────

describe('DriftCheckButton', () => {
  // The mock factory returns a fresh shape per call; we override per-test
  // by reassigning the mock implementation on the imported reference.
  const mocked = useDriftCheck as unknown as ReturnType<typeof vi.fn>;

  it('renders the check-drift button with the checkButton text when isLoading is false', () => {
    driftCheckSpy.mockClear();
    mocked.mockReturnValueOnce({ isLoading: false, checkDrift: driftCheckSpy });
    const tree = DriftCheckButton({ cardId: 'card-1', nodes: [] }) as React.ReactElement;
    const buttons = findByType(tree, 'button');
    expect(buttons).toHaveLength(1);
    expect((buttons[0].props as { disabled?: boolean }).disabled).toBe(false);
    expect(collectText(tree)).toContain('Check for Drift');
    // Confirm no spinner in the not-loading case.
    const spinners = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('animate-spin'),
    );
    expect(spinners).toHaveLength(0);
  });

  it('renders the spinner + checkingButton text when isLoading is true', () => {
    mocked.mockReturnValueOnce({ isLoading: true, checkDrift: driftCheckSpy });
    const tree = DriftCheckButton({ cardId: 'card-1', nodes: [] }) as React.ReactElement;
    expect(collectText(tree)).toContain('Checking');
    const spinners = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('animate-spin'),
    );
    expect(spinners).toHaveLength(1);
  });

  it('marks the button disabled when isLoading is true', () => {
    mocked.mockReturnValueOnce({ isLoading: true, checkDrift: driftCheckSpy });
    const tree = DriftCheckButton({ cardId: 'card-1', nodes: [] }) as React.ReactElement;
    const buttons = findByType(tree, 'button');
    expect(buttons).toHaveLength(1);
    expect((buttons[0].props as { disabled: boolean }).disabled).toBe(true);
  });

  it('clicking the button fires checkDrift from the hook', () => {
    driftCheckSpy.mockClear();
    mocked.mockReturnValueOnce({ isLoading: false, checkDrift: driftCheckSpy });
    const tree = DriftCheckButton({ cardId: 'card-1', nodes: [{ id: 'n1' }] }) as React.ReactElement;
    const button = findByType(tree, 'button')[0];
    (button.props as { onClick: () => void }).onClick();
    expect(driftCheckSpy).toHaveBeenCalledTimes(1);
  });
});

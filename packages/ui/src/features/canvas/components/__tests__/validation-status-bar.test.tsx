/**
 * Tests for `ValidationStatusBar` — the thin bottom-of-canvas bar that
 * surfaces the validation summary and (when expanded) the list of issues.
 *
 * Branches under test:
 *   - nodeCount=0 → returns null (the bar hides on an empty canvas).
 *   - clean canvas (no errors/warnings) → CheckCircle + "valid" label.
 *   - errors > 0 → red theme, AlertTriangle, and pluralized error label.
 *   - warnings only → amber theme, AlertTriangle, pluralized warning label.
 *   - clicking the bar with issues toggles `expanded` via setExpanded.
 *   - expanded=true → renders the issues list (info-severity excluded).
 *   - clicking an issue with a nodeId dispatches setSelectedNodes([id]).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const stateMocks = vi.hoisted(() => ({
  expandedValue: false as boolean,
  setExpandedSpy: vi.fn(),
  selectorMock: vi.fn(),
  dispatchSpy: vi.fn(),
  setSelectedNodes: vi.fn((ids: string[]) => ({ type: 'SET_SELECTED', payload: ids })),
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: vi.fn(<T,>(init: T | (() => T)): [T, (v: T) => void] => {
      const initial = typeof init === 'function' ? (init as () => T)() : init;
      if (typeof initial === 'boolean') {
        return [stateMocks.expandedValue as unknown as T, stateMocks.setExpandedSpy];
      }
      return [initial, vi.fn()];
    }),
  };
});

vi.mock('react-redux', () => ({
  useSelector: (sel: (state: unknown) => unknown) => stateMocks.selectorMock(sel),
  useDispatch: () => stateMocks.dispatchSpy,
}));

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('../../../../store/slices/cards-slice', () => ({
  selectActiveCard: { __id: 'selectActiveCard' },
}));

vi.mock('../../../../store/slices/selection-slice', () => ({
  setSelectedNodes: stateMocks.setSelectedNodes,
}));

import { ValidationStatusBar } from '../validation-status-bar';

type ReactNodeLike = React.ReactNode;

function* walk(node: ReactNodeLike): Generator<React.ReactElement> {
  if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') return;
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

const findByType = (tree: React.ReactNode, type: unknown) => [...walk(tree)].filter((el) => el.type === type);

const findByPredicate = (tree: React.ReactNode, p: (el: React.ReactElement) => boolean) => [...walk(tree)].filter(p);

const collectText = (tree: React.ReactNode): string => {
  let out = '';
  const visit = (n: ReactNodeLike): void => {
    if (n == null || typeof n === 'boolean') return;
    if (typeof n === 'string' || typeof n === 'number') {
      out += String(n);
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
  return out;
};

interface MockState {
  validation?: {
    issues: Array<{
      id: string;
      severity: string;
      message: string;
      nodeId?: string;
      suggestion?: string;
      category?: string;
    }>;
    summary: { errors: number; warnings: number };
  };
  activeCard?: { nodes?: Array<{ id: string }> };
}

const setupState = (state: MockState) => {
  stateMocks.selectorMock.mockImplementation((sel: unknown) => {
    if ((sel as { __id?: string }).__id === 'selectActiveCard') return state.activeCard;
    // The first selector inside the FC reads state.validation.
    const fn = sel as (s: MockState) => unknown;
    return fn({ validation: state.validation } as unknown as MockState);
  });
};

beforeEach(() => {
  stateMocks.expandedValue = false;
  stateMocks.setExpandedSpy.mockClear();
  stateMocks.selectorMock.mockReset();
  stateMocks.dispatchSpy.mockClear();
  stateMocks.setSelectedNodes.mockClear();
});

describe('ValidationStatusBar', () => {
  it('returns null when there are zero nodes on the canvas', () => {
    setupState({
      validation: { issues: [], summary: { errors: 0, warnings: 0 } },
      activeCard: { nodes: [] },
    });
    const tree = ValidationStatusBar({});
    expect(tree).toBeNull();
  });

  it('returns null when the active card is undefined', () => {
    setupState({
      validation: { issues: [], summary: { errors: 0, warnings: 0 } },
      activeCard: undefined,
    });
    const tree = ValidationStatusBar({});
    expect(tree).toBeNull();
  });

  it('renders a "valid" CheckCircle line on a clean canvas with nodes', () => {
    setupState({
      validation: { issues: [], summary: { errors: 0, warnings: 0 } },
      activeCard: { nodes: [{ id: 'n1' }] },
    });
    const tree = ValidationStatusBar({}) as React.ReactElement;
    const text = collectText(tree);
    expect(text).toContain('common.labels.valid');
  });

  it('renders the errors count when errors > 0 (singular form for 1)', () => {
    setupState({
      validation: {
        issues: [{ id: 'i1', severity: 'error', message: 'broken' }],
        summary: { errors: 1, warnings: 0 },
      },
      activeCard: { nodes: [{ id: 'n1' }] },
    });
    const tree = ValidationStatusBar({}) as React.ReactElement;
    const text = collectText(tree);
    expect(text).toContain('1');
    expect(text).toContain('statusBar.error');
  });

  it('uses pluralized statusBar.errors when errors > 1', () => {
    setupState({
      validation: {
        issues: [
          { id: 'i1', severity: 'error', message: 'a' },
          { id: 'i2', severity: 'error', message: 'b' },
        ],
        summary: { errors: 2, warnings: 0 },
      },
      activeCard: { nodes: [{ id: 'n1' }] },
    });
    const text = collectText(ValidationStatusBar({}) as React.ReactElement);
    expect(text).toContain('statusBar.errors');
  });

  it('renders the warnings count when warnings > 0 (singular for 1)', () => {
    setupState({
      validation: {
        issues: [{ id: 'i1', severity: 'warning', message: 'ok' }],
        summary: { errors: 0, warnings: 1 },
      },
      activeCard: { nodes: [{ id: 'n1' }] },
    });
    const text = collectText(ValidationStatusBar({}) as React.ReactElement);
    expect(text).toContain('statusBar.warning');
  });

  it('uses pluralized statusBar.warnings when warnings > 1', () => {
    setupState({
      validation: {
        issues: [
          { id: 'i1', severity: 'warning', message: 'a' },
          { id: 'i2', severity: 'warning', message: 'b' },
        ],
        summary: { errors: 0, warnings: 3 },
      },
      activeCard: { nodes: [{ id: 'n1' }] },
    });
    const text = collectText(ValidationStatusBar({}) as React.ReactElement);
    expect(text).toContain('statusBar.warnings');
  });

  it('renders a divider dot between errors and warnings when both are non-zero', () => {
    setupState({
      validation: {
        issues: [
          { id: 'i1', severity: 'error', message: 'a' },
          { id: 'i2', severity: 'warning', message: 'b' },
        ],
        summary: { errors: 1, warnings: 1 },
      },
      activeCard: { nodes: [{ id: 'n1' }] },
    });
    const text = collectText(ValidationStatusBar({}) as React.ReactElement);
    expect(text).toContain('·');
  });

  it('clicking the bar (with issues) toggles expanded via setExpanded(!expanded)', () => {
    setupState({
      validation: {
        issues: [{ id: 'i1', severity: 'error', message: 'a' }],
        summary: { errors: 1, warnings: 0 },
      },
      activeCard: { nodes: [{ id: 'n1' }] },
    });
    stateMocks.expandedValue = false;
    const tree = ValidationStatusBar({}) as React.ReactElement;
    const bar = findByPredicate(
      tree,
      (el) => el.type === 'div' && typeof (el.props as { onClick?: unknown }).onClick === 'function',
    )[0];
    (bar.props as { onClick: () => void }).onClick();
    expect(stateMocks.setExpandedSpy).toHaveBeenCalledWith(true);
  });

  it('clicking the bar without issues is a no-op (hasIssues guard)', () => {
    setupState({
      validation: { issues: [], summary: { errors: 0, warnings: 0 } },
      activeCard: { nodes: [{ id: 'n1' }] },
    });
    const tree = ValidationStatusBar({}) as React.ReactElement;
    const bar = findByPredicate(
      tree,
      (el) => el.type === 'div' && typeof (el.props as { onClick?: unknown }).onClick === 'function',
    )[0];
    (bar.props as { onClick: () => void }).onClick();
    expect(stateMocks.setExpandedSpy).not.toHaveBeenCalled();
  });

  it('expanded=true renders the issues panel with non-info issues', () => {
    setupState({
      validation: {
        issues: [
          { id: 'i1', severity: 'error', message: 'broken-1', nodeId: 'n1', category: 'wiring' },
          { id: 'i2', severity: 'info', message: 'just-fyi' },
          { id: 'i3', severity: 'warning', message: 'broken-2', category: 'cost' },
        ],
        summary: { errors: 1, warnings: 1 },
      },
      activeCard: { nodes: [{ id: 'n1' }] },
    });
    stateMocks.expandedValue = true;
    const tree = ValidationStatusBar({}) as React.ReactElement;
    const text = collectText(tree);
    // Two visible (error + warning); info excluded.
    expect(text).toContain('broken-1');
    expect(text).toContain('broken-2');
    expect(text).not.toContain('just-fyi');
  });

  it('issue button with a nodeId dispatches setSelectedNodes([nodeId])', () => {
    setupState({
      validation: {
        issues: [{ id: 'i1', severity: 'error', message: 'go-here', nodeId: 'block-a', category: 'cost' }],
        summary: { errors: 1, warnings: 0 },
      },
      activeCard: { nodes: [{ id: 'block-a' }] },
    });
    stateMocks.expandedValue = true;
    const tree = ValidationStatusBar({}) as React.ReactElement;
    const buttons = findByType(tree, 'button');
    // Find the issue button (its first child is the colored severity dot).
    const issueButton = buttons.find(
      (b) =>
        typeof (b.props as { onClick?: unknown }).onClick === 'function' &&
        Array.isArray((b.props as { children?: unknown }).children),
    )!;
    (issueButton.props as { onClick: () => void }).onClick();
    expect(stateMocks.setSelectedNodes).toHaveBeenCalledWith(['block-a']);
    expect(stateMocks.dispatchSpy).toHaveBeenCalled();
  });

  it('issue button without a nodeId is clickable but does not dispatch', () => {
    setupState({
      validation: {
        issues: [{ id: 'i1', severity: 'warning', message: 'orphan', category: 'general' }],
        summary: { errors: 0, warnings: 1 },
      },
      activeCard: { nodes: [{ id: 'n1' }] },
    });
    stateMocks.expandedValue = true;
    const tree = ValidationStatusBar({}) as React.ReactElement;
    const buttons = findByType(tree, 'button');
    const issueButton = buttons.find(
      (b) =>
        typeof (b.props as { onClick?: unknown }).onClick === 'function' &&
        Array.isArray((b.props as { children?: unknown }).children),
    )!;
    (issueButton.props as { onClick: () => void }).onClick();
    expect(stateMocks.dispatchSpy).not.toHaveBeenCalled();
  });

  it('expanded panel close button (X) calls setExpanded(false)', () => {
    setupState({
      validation: {
        issues: [{ id: 'i1', severity: 'error', message: 'a' }],
        summary: { errors: 1, warnings: 0 },
      },
      activeCard: { nodes: [{ id: 'n1' }] },
    });
    stateMocks.expandedValue = true;
    const tree = ValidationStatusBar({}) as React.ReactElement;
    const buttons = findByType(tree, 'button');
    // First button in the expanded header is the close X.
    const closeBtn = buttons[0];
    (closeBtn.props as { onClick: () => void }).onClick();
    expect(stateMocks.setExpandedSpy).toHaveBeenCalledWith(false);
  });

  it('renders the issue count in the panel header (e.g., "validation.issues (2)")', () => {
    setupState({
      validation: {
        issues: [
          { id: 'i1', severity: 'error', message: 'a' },
          { id: 'i2', severity: 'warning', message: 'b' },
        ],
        summary: { errors: 1, warnings: 1 },
      },
      activeCard: { nodes: [{ id: 'n1' }] },
    });
    stateMocks.expandedValue = true;
    const tree = ValidationStatusBar({}) as React.ReactElement;
    const text = collectText(tree);
    expect(text).toContain('validation.issues');
    expect(text).toContain('(2)');
  });

  it('renders an issue suggestion below its message when present', () => {
    setupState({
      validation: {
        issues: [
          {
            id: 'i1',
            severity: 'error',
            message: 'msg',
            suggestion: 'try-this',
            category: 'cost',
          },
        ],
        summary: { errors: 1, warnings: 0 },
      },
      activeCard: { nodes: [{ id: 'n1' }] },
    });
    stateMocks.expandedValue = true;
    const tree = ValidationStatusBar({}) as React.ReactElement;
    const text = collectText(tree);
    expect(text).toContain('try-this');
  });

  it('omits the panel when there are no non-info issues even if expanded=true', () => {
    setupState({
      validation: {
        issues: [{ id: 'i1', severity: 'info', message: 'just-fyi' }],
        summary: { errors: 0, warnings: 0 },
      },
      activeCard: { nodes: [{ id: 'n1' }] },
    });
    stateMocks.expandedValue = true;
    const tree = ValidationStatusBar({}) as React.ReactElement;
    const text = collectText(tree);
    // Header text would contain "validation.issues" — not present.
    expect(text).not.toContain('validation.issues');
  });
});

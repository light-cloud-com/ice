/**
 * Tests for `EmptyCanvasOverlay` — the bottom-center hint that lists
 * quick-start templates when the canvas is empty.
 *
 * Branches under test:
 *   - icon fallback: ICON_MAP[template.icon] || Globe.
 *   - color fallback: ARCHETYPE_COLORS[id] || '#3b82f6'.
 *   - dismiss optional callback (called or no-op).
 *   - selecting a quick-start template dispatches importToActiveCard +
 *     fires onDismiss (if provided).
 *   - the "more templates" button navigates to /templates.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  navigate: vi.fn(),
  useDispatch: vi.fn(() => mocks.dispatch),
  useNavigate: vi.fn(() => mocks.navigate),
  useCallback: vi.fn(<T,>(fn: T, _d: unknown[]) => fn),
  templates: [] as Array<{ id: string; icon: string; name: string }>,
  expandedTemplate: { nodes: [{ id: 'n1' }], edges: [{ id: 'e1' }] },
  importThunk: vi.fn((p: unknown) => ({ type: 'IMPORT_TO_ACTIVE_CARD', payload: p })),
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useCallback: mocks.useCallback,
  };
});

vi.mock('react-redux', () => ({
  useDispatch: () => mocks.useDispatch(),
}));
vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.useNavigate(),
}));

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('../../../../config/color-palette', () => ({
  ARCHETYPE_COLORS: { 'tpl-known': '#abcdef' } as Record<string, string>,
}));

vi.mock('../../../../config/templates', () => ({
  getTemplatesByCategory: () => mocks.templates,
  expandComposedTemplate: vi.fn(() => mocks.expandedTemplate),
}));

vi.mock('../../../../store/slices/cards-slice', () => ({
  importToActiveCard: mocks.importThunk,
}));

import { EmptyCanvasOverlay } from '../empty-canvas-overlay';

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

const findByType = (tree: React.ReactNode, type: unknown) =>
  [...walk(tree)].filter((el) => el.type === type);

const findByPredicate = (tree: React.ReactNode, p: (el: React.ReactElement) => boolean) =>
  [...walk(tree)].filter(p);

beforeEach(() => {
  mocks.dispatch.mockClear();
  mocks.navigate.mockClear();
  mocks.useDispatch.mockClear();
  mocks.useNavigate.mockClear();
  mocks.importThunk.mockClear();
  mocks.templates = [];
});

describe('EmptyCanvasOverlay', () => {
  it('renders one button per quick-start template plus a "more" button', () => {
    mocks.templates = [
      { id: 'tpl-1', icon: 'Globe', name: 'Web App' },
      { id: 'tpl-2', icon: 'Server', name: 'Backend' },
    ];
    const tree = EmptyCanvasOverlay({});
    const buttons = findByType(tree, 'button');
    // 2 template buttons + 1 dismiss + 1 "more" = 4 buttons.
    expect(buttons).toHaveLength(4);
  });

  it('clicking a template button dispatches importToActiveCard + calls onDismiss', () => {
    mocks.templates = [{ id: 'tpl-1', icon: 'Globe', name: 'Web App' }];
    const onDismiss = vi.fn();
    const tree = EmptyCanvasOverlay({ onDismiss });
    const buttons = findByType(tree, 'button');
    // First button is the X dismiss; templates start at index 1.
    const tpl = buttons[1];
    (tpl.props as { onClick: () => void }).onClick();
    expect(mocks.importThunk).toHaveBeenCalledWith({
      nodes: mocks.expandedTemplate.nodes,
      edges: mocks.expandedTemplate.edges,
    });
    expect(mocks.dispatch).toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not throw when onDismiss is omitted', () => {
    mocks.templates = [{ id: 'tpl-1', icon: 'Globe', name: 'Web App' }];
    const tree = EmptyCanvasOverlay({});
    const buttons = findByType(tree, 'button');
    expect(() => (buttons[1].props as { onClick: () => void }).onClick()).not.toThrow();
  });

  it('falls back to #3b82f6 color when ARCHETYPE_COLORS does not contain the id', () => {
    mocks.templates = [{ id: 'tpl-unknown', icon: 'Globe', name: 'X' }];
    const tree = EmptyCanvasOverlay({});
    // The icon element with an inline style.color is the lucide icon.
    const iconEls = findByPredicate(
      tree,
      (el) =>
        typeof el.type === 'object' &&
        (el.props as { style?: Record<string, string> }).style?.color !== undefined,
    );
    const fallback = iconEls.find(
      (el) => (el.props as { style: { color: string } }).style.color === '#3b82f6',
    );
    expect(fallback).toBeDefined();
  });

  it('uses ARCHETYPE_COLORS[id] when present', () => {
    mocks.templates = [{ id: 'tpl-known', icon: 'Globe', name: 'X' }];
    const tree = EmptyCanvasOverlay({});
    const iconEls = findByPredicate(
      tree,
      (el) =>
        typeof el.type === 'object' &&
        (el.props as { style?: Record<string, string> }).style?.color !== undefined,
    );
    const known = iconEls.find(
      (el) => (el.props as { style: { color: string } }).style.color === '#abcdef',
    );
    expect(known).toBeDefined();
  });

  it('falls back to Globe icon when ICON_MAP does not contain the requested icon name', () => {
    mocks.templates = [{ id: 'tpl-1', icon: 'NotInIconMap', name: 'X' }];
    const tree = EmptyCanvasOverlay({});
    // Just verify the render doesn't throw and a button still exists for it.
    const buttons = findByType(tree, 'button');
    expect(buttons.length).toBeGreaterThan(2);
  });

  it('the "more" button navigates to /templates', () => {
    mocks.templates = [];
    const tree = EmptyCanvasOverlay({});
    const buttons = findByType(tree, 'button');
    const moreButton = buttons[buttons.length - 1];
    (moreButton.props as { onClick: () => void }).onClick();
    expect(mocks.navigate).toHaveBeenCalledWith('/templates');
  });

  it('the dismiss "X" button calls onDismiss when supplied', () => {
    mocks.templates = [];
    const onDismiss = vi.fn();
    const tree = EmptyCanvasOverlay({ onDismiss });
    const buttons = findByType(tree, 'button');
    // First button is the dismiss X.
    (buttons[0].props as { onClick: () => void }).onClick();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('renders the quickStart label key', () => {
    mocks.templates = [];
    const tree = EmptyCanvasOverlay({});
    const labelEls = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        (el.props as { children?: unknown }).children === 'canvas.emptyState.quickStart',
    );
    expect(labelEls).toHaveLength(1);
  });

  it('renders the more-templates label key', () => {
    mocks.templates = [];
    const tree = EmptyCanvasOverlay({});
    const labelEls = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        (el.props as { children?: unknown }).children === 'canvas.emptyState.more',
    );
    expect(labelEls).toHaveLength(1);
  });
});

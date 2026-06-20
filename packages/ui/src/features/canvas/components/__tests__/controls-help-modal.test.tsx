/**
 * Tests for `ControlsHelpModal` — the bottom-right "?" affordance that
 * opens a popover listing canvas keyboard / mouse shortcuts.
 *
 * Branches under test:
 *   - default render shows just the "?" button (open=false).
 *   - open=true → backdrop + panel with title + 5 sections + close button.
 *   - clicking the trigger toggles the open state (verified via setOpen mock).
 *   - clicking the backdrop / "Esc" button calls setOpen(false).
 *   - section list shape: 5 sections, each with a stable title key.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const stateMocks = vi.hoisted(() => ({
  openValue: false as boolean,
  setOpenSpy: vi.fn(),
}));

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: vi.fn(<T,>(init: T | (() => T)): [T, (v: T) => void] => {
      const initial = typeof init === 'function' ? (init as () => T)() : init;
      if (typeof initial === 'boolean') {
        return [stateMocks.openValue as unknown as T, stateMocks.setOpenSpy];
      }
      return [initial, vi.fn()];
    }),
    // The component now installs an Escape-key effect; no-op it for the
    // function-call (tree-walker) render so it doesn't touch a real fiber.
    useEffect: vi.fn(),
  };
});

import { ControlsHelpModal } from '../controls-help-modal';

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

beforeEach(() => {
  stateMocks.openValue = false;
  stateMocks.setOpenSpy.mockClear();
});

describe('ControlsHelpModal', () => {
  it('renders just the trigger button when closed', () => {
    const tree = ControlsHelpModal({});
    const buttons = findByType(tree, 'button');
    // Only the trigger is rendered when closed.
    expect(buttons).toHaveLength(1);
    expect((buttons[0].props as { children: unknown }).children).toBe('?');
  });

  it('trigger button uses raised background when closed', () => {
    stateMocks.openValue = false;
    const tree = ControlsHelpModal({});
    const trigger = findByType(tree, 'button')[0];
    const style = (trigger.props as { style: Record<string, string> }).style;
    expect(style.background).toBe('var(--ice-bg-raised)');
    expect(style.color).toBe('var(--ice-text-secondary)');
  });

  it('trigger button uses strong background when open', () => {
    stateMocks.openValue = true;
    const tree = ControlsHelpModal({});
    const trigger = findByType(tree, 'button')[0];
    const style = (trigger.props as { style: Record<string, string> }).style;
    expect(style.background).toBe('var(--ice-border-strong)');
    expect(style.color).toBe('var(--ice-text-primary)');
  });

  it('clicking the trigger toggles open via setOpen(!open)', () => {
    stateMocks.openValue = false;
    const tree = ControlsHelpModal({});
    const trigger = findByType(tree, 'button')[0];
    (trigger.props as { onClick: () => void }).onClick();
    expect(stateMocks.setOpenSpy).toHaveBeenCalledWith(true);
  });

  it('clicking the trigger when open passes false to setOpen', () => {
    stateMocks.openValue = true;
    const tree = ControlsHelpModal({});
    const trigger = findByType(tree, 'button')[0];
    (trigger.props as { onClick: () => void }).onClick();
    expect(stateMocks.setOpenSpy).toHaveBeenCalledWith(false);
  });

  it('trigger has a tooltip key (canvas.controls.shortcutsTitle)', () => {
    const tree = ControlsHelpModal({});
    const trigger = findByType(tree, 'button')[0];
    expect((trigger.props as { title: string }).title).toBe('canvas.controls.shortcutsTitle');
  });

  // AX8/AX6 — the icon-only "?" trigger needs an accessible name (the "?" glyph
  // alone announces as "question mark") and an aria-expanded reflecting state.
  it('trigger carries an aria-label and aria-expanded reflecting open state', () => {
    stateMocks.openValue = false;
    const closed = findByType(ControlsHelpModal({}), 'button')[0];
    expect((closed.props as { 'aria-label': string })['aria-label']).toBe('canvas.controls.shortcutsTitle');
    expect((closed.props as { 'aria-expanded': boolean })['aria-expanded']).toBe(false);

    stateMocks.openValue = true;
    const open = findByType(ControlsHelpModal({}), 'button')[0];
    expect((open.props as { 'aria-expanded': boolean })['aria-expanded']).toBe(true);
  });

  it('renders the backdrop + panel when open=true', () => {
    stateMocks.openValue = true;
    const tree = ControlsHelpModal({});
    // Backdrop is the div with className containing "absolute inset-0 z-20".
    const backdrop = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('inset-0'),
    );
    expect(backdrop).toHaveLength(1);
  });

  it('clicking the backdrop closes the modal (setOpen(false))', () => {
    stateMocks.openValue = true;
    const tree = ControlsHelpModal({});
    const backdrop = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('inset-0'),
    )[0];
    (backdrop.props as { onClick: () => void }).onClick();
    expect(stateMocks.setOpenSpy).toHaveBeenCalledWith(false);
  });

  it('the Esc close button (canvas.controls.escButton) closes the modal', () => {
    stateMocks.openValue = true;
    const tree = ControlsHelpModal({});
    const buttons = findByType(tree, 'button');
    const escButton = buttons.find(
      (el) => (el.props as { children?: unknown }).children === 'canvas.controls.escButton',
    )!;
    (escButton.props as { onClick: () => void }).onClick();
    expect(stateMocks.setOpenSpy).toHaveBeenCalledWith(false);
  });

  it('renders the panel title (canvas.controls.title)', () => {
    stateMocks.openValue = true;
    const tree = ControlsHelpModal({});
    const titles = findByPredicate(
      tree,
      (el) => el.type === 'span' && (el.props as { children?: unknown }).children === 'canvas.controls.title',
    );
    expect(titles).toHaveLength(1);
  });

  it('renders all five canvas-controls section keys', () => {
    stateMocks.openValue = true;
    const tree = ControlsHelpModal({});
    const sectionTitles = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { children?: unknown }).children === 'string' &&
        (el.props as { children: string }).children.startsWith('canvas.controls.section'),
    );
    expect(sectionTitles.map((s) => (s.props as { children: string }).children)).toEqual([
      'canvas.controls.sectionNavigation',
      'canvas.controls.sectionSelection',
      'canvas.controls.sectionEditing',
      'canvas.controls.sectionContainment',
      'canvas.controls.sectionView',
    ]);
  });

  it('renders the WASD pan key under the navigation section', () => {
    stateMocks.openValue = true;
    const tree = ControlsHelpModal({});
    const wasd = findByPredicate(
      tree,
      (el) => el.type === 'span' && (el.props as { children?: unknown }).children === 'W A S D / Arrow Keys',
    );
    expect(wasd).toHaveLength(1);
  });

  it('renders the Cmd+C/X/V key under editing', () => {
    stateMocks.openValue = true;
    const tree = ControlsHelpModal({});
    const cmd = findByPredicate(
      tree,
      (el) => el.type === 'span' && (el.props as { children?: unknown }).children === 'Cmd + C / X / V',
    );
    expect(cmd).toHaveLength(1);
  });

  it('documents the Shift+A add affordance (CD2)', () => {
    stateMocks.openValue = true;
    const tree = ControlsHelpModal({});
    const shiftA = findByPredicate(
      tree,
      (el) => el.type === 'span' && (el.props as { children?: unknown }).children === 'Shift + A',
    );
    expect(shiftA).toHaveLength(1);
  });

  it('no longer advertises the dead 1 / 2 view-level keys (IA3)', () => {
    stateMocks.openValue = true;
    const tree = ControlsHelpModal({});
    const oneOrTwo = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        ((el.props as { children?: unknown }).children === '1' ||
          (el.props as { children?: unknown }).children === '2'),
    );
    expect(oneOrTwo).toHaveLength(0);
  });

  it('marks the panel as a modal dialog (AX3)', () => {
    stateMocks.openValue = true;
    const tree = ControlsHelpModal({});
    const dialog = findByPredicate(tree, (el) => (el.props as { role?: string }).role === 'dialog');
    expect(dialog).toHaveLength(1);
    expect((dialog[0].props as { 'aria-modal'?: string })['aria-modal']).toBe('true');
  });
});

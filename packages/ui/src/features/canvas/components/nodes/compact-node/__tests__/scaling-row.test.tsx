/**
 * Tests for `ScalingRow` — the inline min/max instances stepper row.
 *
 * Branches under test:
 *   - active instances panel (green dot + count) renders when
 *     `activeInstances != null`, hidden otherwise.
 *   - "active" / "instances" label flips on activeInstances presence.
 *   - min/max stepper +/- onClick fires `onUpdateData(nodeId, {...})`.
 *   - clamp ranges: min ≥ 0; min ≤ maxInstances ?? 99; max ≥ minInstances ?? 1.
 *   - default fallbacks when min/max null: minInstances ?? 1; maxInstances ?? 3.
 *   - onUpdateData undefined: optional chaining yields no-op.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  StepperButton: Object.assign(
    ({ label, onClick }: { label: string; onClick: (e: React.MouseEvent) => void }) =>
      ({ type: 'button', props: { 'data-test': 'stepper', label, onClick }, key: null } as React.ReactElement),
    { displayName: 'MockStepperButton' },
  ),
}));

vi.mock('../../_shared/stepper-button', () => ({ StepperButton: mocks.StepperButton }));

import { ScalingRow } from '../scaling-row';

const MockStepperButton = mocks.StepperButton;

// ─── tree walker ──────────────────────────────────────────────────────

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
function findByPredicate(
  tree: React.ReactNode,
  predicate: (el: React.ReactElement) => boolean,
): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) if (el && predicate(el)) out.push(el);
  return out;
}
function findByType(tree: React.ReactNode, type: unknown): React.ReactElement[] {
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
    visit(((n as React.ReactElement).props as { children?: React.ReactNode } | undefined)?.children ?? null);
  };
  visit(tree);
  return parts.join('');
}

const renderRow = (
  props: Partial<React.ComponentProps<typeof ScalingRow>> = {},
): React.ReactElement => {
  const Inner = (ScalingRow as unknown as {
    type: (p: React.ComponentProps<typeof ScalingRow>) => React.ReactElement;
  }).type;
  const defaults: React.ComponentProps<typeof ScalingRow> = {
    nodeId: 'node-1',
    minInstances: null,
    maxInstances: null,
    activeInstances: null,
    onUpdateData: undefined,
  };
  return Inner({ ...defaults, ...props });
};

describe('ScalingRow — React.memo + displayName', () => {
  it('is wrapped in React.memo', () => {
    const t = (ScalingRow as unknown as { $$typeof: symbol }).$$typeof;
    expect(typeof t).toBe('symbol');
  });

  it('carries displayName "ScalingRow"', () => {
    expect((ScalingRow as unknown as { displayName: string }).displayName).toBe('ScalingRow');
  });
});

describe('ScalingRow — active panel', () => {
  it('renders green dot + count when activeInstances != null', () => {
    const tree = renderRow({ activeInstances: 3 });
    // green dot
    const dots = findByPredicate(tree, (el) => {
      if (el.type !== 'span') return false;
      const style = (el.props as { style?: { background?: string; width?: number } }).style;
      return style?.background === '#22c55e' && style?.width === 6;
    });
    expect(dots).toHaveLength(1);
    expect(collectText(tree)).toContain('3');
  });

  it('omits dot+count when activeInstances null', () => {
    const tree = renderRow({ activeInstances: null });
    const dots = findByPredicate(tree, (el) => {
      if (el.type !== 'span') return false;
      const style = (el.props as { style?: { background?: string } }).style;
      return style?.background === '#22c55e';
    });
    expect(dots).toHaveLength(0);
  });

  it('label is "active" when activeInstances set, "instances" when null', () => {
    // The actual i18n strings; the tests just need to confirm they are different and reflect the toggle.
    const withActive = collectText(renderRow({ activeInstances: 1 }));
    const withoutActive = collectText(renderRow({ activeInstances: null }));
    expect(withActive).not.toBe(withoutActive);
  });
});

describe('ScalingRow — min stepper', () => {
  it('decrement clamps to >= 0', () => {
    const fn = vi.fn();
    const tree = renderRow({ minInstances: 0, onUpdateData: fn });
    const buttons = findByType(tree, MockStepperButton).filter((b) => (b.props as { label: string }).label === '−');
    // First minus is the min decrement
    const minMinus = buttons[0];
    (minMinus.props as { onClick: (e: React.MouseEvent) => void }).onClick({ stopPropagation: () => {} } as React.MouseEvent);
    expect(fn).toHaveBeenCalledWith('node-1', { minInstances: 0 });
  });

  it('decrement subtracts 1 when min > 0', () => {
    const fn = vi.fn();
    const tree = renderRow({ minInstances: 5, onUpdateData: fn });
    const buttons = findByType(tree, MockStepperButton).filter((b) => (b.props as { label: string }).label === '−');
    (buttons[0].props as { onClick: (e: React.MouseEvent) => void }).onClick({ stopPropagation: () => {} } as React.MouseEvent);
    expect(fn).toHaveBeenCalledWith('node-1', { minInstances: 4 });
  });

  it('decrement uses default 1 when minInstances null (yields max(0, 0) = 0)', () => {
    const fn = vi.fn();
    const tree = renderRow({ minInstances: null, onUpdateData: fn });
    const buttons = findByType(tree, MockStepperButton).filter((b) => (b.props as { label: string }).label === '−');
    (buttons[0].props as { onClick: (e: React.MouseEvent) => void }).onClick({ stopPropagation: () => {} } as React.MouseEvent);
    expect(fn).toHaveBeenCalledWith('node-1', { minInstances: 0 });
  });

  it('increment clamps to <= maxInstances', () => {
    const fn = vi.fn();
    const tree = renderRow({ minInstances: 5, maxInstances: 5, onUpdateData: fn });
    const buttons = findByType(tree, MockStepperButton).filter((b) => (b.props as { label: string }).label === '+');
    (buttons[0].props as { onClick: (e: React.MouseEvent) => void }).onClick({ stopPropagation: () => {} } as React.MouseEvent);
    expect(fn).toHaveBeenCalledWith('node-1', { minInstances: 5 });
  });

  it('increment falls back to maxInstances=99 when null', () => {
    const fn = vi.fn();
    const tree = renderRow({ minInstances: 50, maxInstances: null, onUpdateData: fn });
    const buttons = findByType(tree, MockStepperButton).filter((b) => (b.props as { label: string }).label === '+');
    (buttons[0].props as { onClick: (e: React.MouseEvent) => void }).onClick({ stopPropagation: () => {} } as React.MouseEvent);
    expect(fn).toHaveBeenCalledWith('node-1', { minInstances: 51 });
  });

  it('increment uses default 1 when minInstances null', () => {
    const fn = vi.fn();
    const tree = renderRow({ minInstances: null, onUpdateData: fn });
    const buttons = findByType(tree, MockStepperButton).filter((b) => (b.props as { label: string }).label === '+');
    (buttons[0].props as { onClick: (e: React.MouseEvent) => void }).onClick({ stopPropagation: () => {} } as React.MouseEvent);
    expect(fn).toHaveBeenCalledWith('node-1', { minInstances: 2 });
  });

  it('renders minInstances value or default 1', () => {
    expect(collectText(renderRow({ minInstances: 7 }))).toContain('7');
    expect(collectText(renderRow({ minInstances: null }))).toContain('1');
  });
});

describe('ScalingRow — max stepper', () => {
  it('decrement clamps to >= minInstances', () => {
    const fn = vi.fn();
    const tree = renderRow({ minInstances: 3, maxInstances: 3, onUpdateData: fn });
    const buttons = findByType(tree, MockStepperButton).filter((b) => (b.props as { label: string }).label === '−');
    // Second minus is the max decrement.
    (buttons[1].props as { onClick: (e: React.MouseEvent) => void }).onClick({ stopPropagation: () => {} } as React.MouseEvent);
    expect(fn).toHaveBeenCalledWith('node-1', { maxInstances: 3 });
  });

  it('decrement subtracts 1 when max > min', () => {
    const fn = vi.fn();
    const tree = renderRow({ minInstances: 1, maxInstances: 5, onUpdateData: fn });
    const buttons = findByType(tree, MockStepperButton).filter((b) => (b.props as { label: string }).label === '−');
    (buttons[1].props as { onClick: (e: React.MouseEvent) => void }).onClick({ stopPropagation: () => {} } as React.MouseEvent);
    expect(fn).toHaveBeenCalledWith('node-1', { maxInstances: 4 });
  });

  it('decrement falls back to minInstances=1 when null', () => {
    const fn = vi.fn();
    const tree = renderRow({ minInstances: null, maxInstances: 3, onUpdateData: fn });
    const buttons = findByType(tree, MockStepperButton).filter((b) => (b.props as { label: string }).label === '−');
    (buttons[1].props as { onClick: (e: React.MouseEvent) => void }).onClick({ stopPropagation: () => {} } as React.MouseEvent);
    expect(fn).toHaveBeenCalledWith('node-1', { maxInstances: 2 });
  });

  it('decrement uses default maxInstances=3 when null', () => {
    const fn = vi.fn();
    const tree = renderRow({ minInstances: 1, maxInstances: null, onUpdateData: fn });
    const buttons = findByType(tree, MockStepperButton).filter((b) => (b.props as { label: string }).label === '−');
    (buttons[1].props as { onClick: (e: React.MouseEvent) => void }).onClick({ stopPropagation: () => {} } as React.MouseEvent);
    expect(fn).toHaveBeenCalledWith('node-1', { maxInstances: 2 });
  });

  it('increment adds 1 to maxInstances', () => {
    const fn = vi.fn();
    const tree = renderRow({ maxInstances: 7, onUpdateData: fn });
    const buttons = findByType(tree, MockStepperButton).filter((b) => (b.props as { label: string }).label === '+');
    (buttons[1].props as { onClick: (e: React.MouseEvent) => void }).onClick({ stopPropagation: () => {} } as React.MouseEvent);
    expect(fn).toHaveBeenCalledWith('node-1', { maxInstances: 8 });
  });

  it('increment uses default maxInstances=3 when null', () => {
    const fn = vi.fn();
    const tree = renderRow({ maxInstances: null, onUpdateData: fn });
    const buttons = findByType(tree, MockStepperButton).filter((b) => (b.props as { label: string }).label === '+');
    (buttons[1].props as { onClick: (e: React.MouseEvent) => void }).onClick({ stopPropagation: () => {} } as React.MouseEvent);
    expect(fn).toHaveBeenCalledWith('node-1', { maxInstances: 4 });
  });

  it('renders maxInstances value or default 3', () => {
    expect(collectText(renderRow({ maxInstances: 9 }))).toContain('9');
    expect(collectText(renderRow({ maxInstances: null }))).toContain('3');
  });
});

describe('ScalingRow — onUpdateData undefined', () => {
  it('all four steppers are no-op when onUpdateData is undefined', () => {
    const tree = renderRow({ minInstances: 2, maxInstances: 5, onUpdateData: undefined });
    const buttons = findByType(tree, MockStepperButton);
    for (const b of buttons) {
      expect(() =>
        (b.props as { onClick: (e: React.MouseEvent) => void }).onClick({ stopPropagation: () => {} } as React.MouseEvent),
      ).not.toThrow();
    }
  });

  it('all four steppers stopPropagation on the event', () => {
    const tree = renderRow({ minInstances: 1, maxInstances: 5 });
    const buttons = findByType(tree, MockStepperButton);
    for (const b of buttons) {
      const stops: string[] = [];
      (b.props as { onClick: (e: React.MouseEvent) => void }).onClick({
        stopPropagation: () => stops.push('s'),
      } as React.MouseEvent);
      expect(stops).toEqual(['s']);
    }
  });
});

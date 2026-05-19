/**
 * Tests for `StepIndicator` — pure presentational FC.
 *
 * No hooks or state — invoke directly via the FC and tree-walk the
 * returned element. Asserts on per-step done/active/pending classes,
 * connector rendering, label rendering, and the Check icon at done
 * steps.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { StepIndicator } from '../step-indicator';

// ─── Tree walker ────────────────────────────────────────────────────────────

interface ElLike {
  type: unknown;
  props: { [k: string]: unknown; children?: unknown };
}
function isEl(x: unknown): x is ElLike {
  return !!x && typeof x === 'object' && 'type' in x && 'props' in x;
}

function* walk(node: unknown): Generator<ElLike> {
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c);
    return;
  }
  if (!isEl(node)) return;
  yield node;
  if (typeof node.type === 'function') {
    try {
      const FC = node.type as (p: unknown) => unknown;
      yield* walk(FC(node.props));
    } catch {
      /* opaque FC */
    }
    return;
  }
  yield* walk(node.props.children);
}

function findAll(tree: unknown, pred: (el: ElLike) => boolean): ElLike[] {
  const out: ElLike[] = [];
  for (const el of walk(tree)) if (pred(el)) out.push(el);
  return out;
}

const circlePred = (el: ElLike): boolean =>
  el.type === 'div' &&
  typeof (el.props as { className?: string }).className === 'string' &&
  (el.props as { className: string }).className.includes('rounded-full') &&
  (el.props as { className: string }).className.includes('w-8');

const connectorPred = (el: ElLike): boolean =>
  el.type === 'div' &&
  typeof (el.props as { className?: string }).className === 'string' &&
  (el.props as { className: string }).className.includes('h-0.5');

function collectText(tree: unknown): string {
  let s = '';
  for (const el of walk(tree)) {
    const c = el.props.children;
    if (typeof c === 'string') s += c;
    else if (typeof c === 'number') s += String(c);
    else if (Array.isArray(c)) {
      for (const item of c) {
        if (typeof item === 'string') s += item;
        else if (typeof item === 'number') s += String(item);
      }
    }
  }
  return s;
}

const render = (props: {
  currentStep: number;
  totalSteps: number;
  labels: string[];
  className?: string;
}): React.ReactElement => (StepIndicator as unknown as (p: typeof props) => React.ReactElement)(props);

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('StepIndicator', () => {
  it('renders one step circle per totalSteps', () => {
    const tree = render({ currentStep: 1, totalSteps: 3, labels: ['A', 'B', 'C'] });
    // Each step renders a circle div with className containing 'rounded-full'
    const circles = findAll(tree, circlePred);
    expect(circles).toHaveLength(3);
  });

  it('renders all labels', () => {
    const tree = render({ currentStep: 1, totalSteps: 3, labels: ['Alpha', 'Beta', 'Gamma'] });
    const text = collectText(tree);
    expect(text).toContain('Alpha');
    expect(text).toContain('Beta');
    expect(text).toContain('Gamma');
  });

  it('marks step < currentStep as done (Check icon, no number)', () => {
    const tree = render({ currentStep: 3, totalSteps: 3, labels: ['A', 'B', 'C'] });
    // Step 1 + 2 are done (rendered as Check icon); step 3 is active (no Check)
    const circles = findAll(tree, circlePred);
    // First two should NOT contain '1' / '2' as text — they have Check icon.
    const step1Children = circles[0].props.children;
    const step2Children = circles[1].props.children;
    const step3Children = circles[2].props.children;
    // Step 3 is active — child is the step number.
    expect(step3Children).toBe(3);
    // Steps 1-2 are done — child is a Check icon (an element, not a number).
    expect(typeof step1Children === 'object' && step1Children !== null).toBe(true);
    expect(typeof step2Children === 'object' && step2Children !== null).toBe(true);
  });

  it('marks step === currentStep as active (with ring class)', () => {
    const tree = render({ currentStep: 2, totalSteps: 3, labels: ['A', 'B', 'C'] });
    const circles = findAll(tree, circlePred);
    expect((circles[1].props as { className: string }).className).toContain('ring-2');
    expect((circles[1].props as { className: string }).className).toContain('bg-ice-accent');
  });

  it('marks step > currentStep as pending (with border + raised bg)', () => {
    const tree = render({ currentStep: 1, totalSteps: 3, labels: ['A', 'B', 'C'] });
    const circles = findAll(tree, circlePred);
    // Steps 2 and 3 are pending.
    expect((circles[1].props as { className: string }).className).toContain('bg-ice-raised');
    expect((circles[2].props as { className: string }).className).toContain('border-ice-border');
  });

  it('renders connector between steps but not after the last', () => {
    const tree = render({ currentStep: 1, totalSteps: 3, labels: ['A', 'B', 'C'] });
    // Connector divs have className with `flex-1 h-0.5`.
    const connectors = findAll(tree, connectorPred);
    // 3 steps → 2 connectors.
    expect(connectors).toHaveLength(2);
  });

  it('connector before currentStep uses bg-ice-green; after uses bg-ice-border', () => {
    const tree = render({ currentStep: 2, totalSteps: 3, labels: ['A', 'B', 'C'] });
    const connectors = findAll(tree, connectorPred);
    // Step 1 < currentStep(2) → green; step 2 not < 2 → border.
    expect((connectors[0].props as { className: string }).className).toContain('bg-ice-green');
    expect((connectors[1].props as { className: string }).className).toContain('bg-ice-border');
  });

  it('renders single-step indicator with no connectors', () => {
    const tree = render({ currentStep: 1, totalSteps: 1, labels: ['One'] });
    const connectors = findAll(tree, connectorPred);
    expect(connectors).toHaveLength(0);
  });

  it('applies custom className to outer container', () => {
    const tree = render({ currentStep: 1, totalSteps: 1, labels: ['One'], className: 'my-custom' });
    const outer = tree as ElLike;
    expect((outer.props as { className: string }).className).toContain('my-custom');
  });

  it('applies done label color (text-ice-green)', () => {
    const tree = render({ currentStep: 3, totalSteps: 3, labels: ['Done1', 'Done2', 'Active'] });
    const labels = findAll(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('whitespace-nowrap'),
    );
    expect((labels[0].props as { className: string }).className).toContain('text-ice-green');
    expect((labels[1].props as { className: string }).className).toContain('text-ice-green');
  });

  it('applies active label color (text-ice-accent)', () => {
    const tree = render({ currentStep: 2, totalSteps: 3, labels: ['A', 'Active', 'C'] });
    const labels = findAll(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('whitespace-nowrap'),
    );
    expect((labels[1].props as { className: string }).className).toContain('text-ice-accent');
  });

  it('applies pending label color (text-ice-text-2)', () => {
    const tree = render({ currentStep: 1, totalSteps: 3, labels: ['A', 'Pending1', 'Pending2'] });
    const labels = findAll(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('whitespace-nowrap'),
    );
    expect((labels[1].props as { className: string }).className).toContain('text-ice-text-2');
    expect((labels[2].props as { className: string }).className).toContain('text-ice-text-2');
  });
});

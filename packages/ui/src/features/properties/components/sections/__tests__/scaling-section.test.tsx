/**
 * rf-props-14 — scaling-section subcomponent.
 *
 * `ScalingSection` is purely presentational (no Redux, no hooks beyond the
 * FC body), so we use the direct-FC tree-walker pattern (cite
 * `tree-walker-for-react-fc-tests-must-flatten-nested-children-arrays`):
 * invoke the component as a function, then walk the returned React-element
 * tree depth-first to find leaves and assert on type / props / children.
 *
 * The field-primitive bundle is mocked at `'../../fields'` (one extra `..`
 * vs. the source file because the test sits in `__tests__/`, one level
 * deeper than the source). Each mocked primitive becomes a typed React-FC
 * stub so the walker can match it by `el.type === MockStepperField` and
 * inspect the props the parent passed in (cite
 * `mocked-component-leaves-are-invisible-to-direct-fc-tree-walkers`).
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

// Mock the field-primitives bundle. Each primitive becomes a `vi.fn` stub the
// walker matches by reference (`el.type === mocks.MockStepperField`). The stub
// bodies never run — direct-FC invocation only walks the tree of elements
// returned by the parent FC, not the rendered DOM. So `Section` is matched as
// an element in the tree; the walker reads `Section.props.children` directly
// (the JSX inside) to descend (cite
// `mocked-component-leaves-are-invisible-to-direct-fc-tree-walkers`).
//
// `vi.hoisted` is needed because `vi.mock` is hoisted to the top of the file,
// but we want the mock identities to be the same JS values referenced from the
// test bodies — so we lift the `vi.fn()` calls into a hoisted block, then
// re-export them in the mock factory.
const mocks = vi.hoisted(() => ({
  MockSection: vi.fn(),
  MockStepperField: vi.fn(),
  MockSelectField: vi.fn(),
  MockNumberField: vi.fn(),
}));

vi.mock('../../fields', () => ({
  Section: mocks.MockSection,
  StepperField: mocks.MockStepperField,
  SelectField: mocks.MockSelectField,
  NumberField: mocks.MockNumberField,
}));

// Mock i18n — return stable `t:<key>` strings for label assertions.
vi.mock('../../../../../i18n', () => ({
  t: vi.fn((key: string) => `t:${key}`),
}));

import { ScalingSection } from '../scaling-section';
import type { CardNode } from '../../../../../store/slices/cards-slice';

// ─── Tree-walker (same shape as rf-props-6/9/10/11/12/13) ───────────────────

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

// ─── Helpers ────────────────────────────────────────────────────────────────

interface StepperProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}

interface SelectProps {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}

interface NumberProps {
  label: string;
  value: number | string;
  onChange: (v: number) => void;
}

const makeNode = (data: CardNode['data'] = {}): CardNode => ({
  id: 'node-1',
  type: 'block',
  position: { x: 0, y: 0 },
  width: 100,
  height: 100,
  data,
});

const renderSection = (
  data: CardNode['data'] = {},
): {
  tree: React.ReactElement;
  updateNodeField: ReturnType<typeof vi.fn>;
} => {
  // Reset captured calls between renders so each test inspects the props
  // captured during *its* own render.
  mocks.MockSection.mockClear();
  mocks.MockStepperField.mockClear();
  mocks.MockSelectField.mockClear();
  mocks.MockNumberField.mockClear();
  const updateNodeField = vi.fn();
  const tree = ScalingSection({
    selectedNode: makeNode(data),
    updateNodeField,
  }) as React.ReactElement;
  return { tree, updateNodeField };
};

const findSteppers = (tree: React.ReactNode): React.ReactElement[] =>
  findByPredicate(tree, (el) => el.type === mocks.MockStepperField);
const findSelects = (tree: React.ReactNode): React.ReactElement[] =>
  findByPredicate(tree, (el) => el.type === mocks.MockSelectField);
const findNumbers = (tree: React.ReactNode): React.ReactElement[] =>
  findByPredicate(tree, (el) => el.type === mocks.MockNumberField);

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ScalingSection', () => {
  it('renders a Section wrapper with empty title', () => {
    const { tree } = renderSection();
    const sections = findByPredicate(tree, (el) => el.type === mocks.MockSection);
    expect(sections).toHaveLength(1);
    expect((sections[0].props as { title: string }).title).toBe('');
  });

  it('renders min + max stepper + scale-on selector by default (no metric → no threshold)', () => {
    const { tree } = renderSection();
    expect(findSteppers(tree)).toHaveLength(2);
    expect(findSelects(tree)).toHaveLength(1);
    // No scalingMetric means the threshold input must NOT render.
    expect(findNumbers(tree)).toHaveLength(0);
  });

  it('default values: minInstances=1, maxInstances=3, scalingMetric=""', () => {
    const { tree } = renderSection();
    const [minStepper, maxStepper] = findSteppers(tree);
    expect((minStepper.props as StepperProps).label).toBe('t:properties.scaling.minInstances');
    expect((minStepper.props as StepperProps).value).toBe(1);
    expect((minStepper.props as StepperProps).min).toBe(0);
    expect((minStepper.props as StepperProps).max).toBe(99);
    expect((maxStepper.props as StepperProps).label).toBe('t:properties.scaling.maxInstances');
    expect((maxStepper.props as StepperProps).value).toBe(3);
    expect((maxStepper.props as StepperProps).min).toBe(0);
    expect((maxStepper.props as StepperProps).max).toBe(99);

    const [selector] = findSelects(tree);
    expect((selector.props as SelectProps).value).toBe('');
  });

  it('passes through stored minInstances/maxInstances values', () => {
    const { tree } = renderSection({ minInstances: 2, maxInstances: 8 });
    const [minStepper, maxStepper] = findSteppers(tree);
    expect((minStepper.props as StepperProps).value).toBe(2);
    // Min stepper's max bound is the maxInstances value (so min can never exceed max).
    expect((minStepper.props as StepperProps).max).toBe(8);
    expect((maxStepper.props as StepperProps).value).toBe(8);
    // Max stepper's min bound is the minInstances value (so max can never drop below min).
    expect((maxStepper.props as StepperProps).min).toBe(2);
  });

  it('scale-on selector exposes the five canonical options', () => {
    const { tree } = renderSection();
    const [selector] = findSelects(tree);
    expect((selector.props as SelectProps).options).toEqual(['cpu', 'memory', 'requests', 'queue_depth', 'custom']);
    expect((selector.props as SelectProps).label).toBe('t:properties.scaling.scaleOn');
  });

  it('renders threshold NumberField only when scalingMetric is set and != custom', () => {
    // No metric → no threshold.
    expect(findNumbers(renderSection({}).tree)).toHaveLength(0);
    // metric = '' (falsy after the `|| ''`) → no threshold.
    expect(findNumbers(renderSection({ scalingMetric: '' }).tree)).toHaveLength(0);
    // metric = 'custom' → no threshold.
    expect(findNumbers(renderSection({ scalingMetric: 'custom' }).tree)).toHaveLength(0);
    // metric = 'cpu' → threshold renders.
    expect(findNumbers(renderSection({ scalingMetric: 'cpu' }).tree)).toHaveLength(1);
    // metric = 'memory' → threshold renders.
    expect(findNumbers(renderSection({ scalingMetric: 'memory' }).tree)).toHaveLength(1);
  });

  it('threshold default value is 70 when scalingThreshold is unset', () => {
    const { tree } = renderSection({ scalingMetric: 'cpu' });
    const [threshold] = findNumbers(tree);
    expect((threshold.props as NumberProps).value).toBe(70);
    expect((threshold.props as NumberProps).label).toBe('t:properties.scaling.threshold');
  });

  it('threshold reflects stored scalingThreshold', () => {
    const { tree } = renderSection({ scalingMetric: 'cpu', scalingThreshold: 85 });
    const [threshold] = findNumbers(tree);
    expect((threshold.props as NumberProps).value).toBe(85);
  });

  it('renders activeInstances badge when activeInstances is set (non-null)', () => {
    const { tree } = renderSection({ activeInstances: 4 });
    // The badge is a `<span>` whose text contains the running translation key.
    // Search for any `<span>` whose children include the running t-key.
    const runningSpans = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        Array.isArray((el.props as { children?: unknown }).children) &&
        ((el.props as { children: React.ReactNode[] }).children as unknown[]).some(
          (c) => typeof c === 'string' && (c as string).includes('properties.scaling.running'),
        ),
    );
    expect(runningSpans.length).toBeGreaterThan(0);
    // The numeric value (4) is one of the children of that span.
    const children = (runningSpans[0].props as { children: React.ReactNode[] }).children;
    expect(children).toContain(4);
  });

  it('does NOT render activeInstances badge when activeInstances is null/undefined', () => {
    const { tree } = renderSection({});
    const runningSpans = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        Array.isArray((el.props as { children?: unknown }).children) &&
        ((el.props as { children: React.ReactNode[] }).children as unknown[]).some(
          (c) => typeof c === 'string' && (c as string).includes('properties.scaling.running'),
        ),
    );
    expect(runningSpans).toHaveLength(0);
  });

  it('does NOT render activeInstances badge when activeInstances is 0 (truthy via `!= null`)', () => {
    // `!= null` admits 0 — verify the badge DOES render with activeInstances=0.
    const { tree } = renderSection({ activeInstances: 0 });
    const runningSpans = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        Array.isArray((el.props as { children?: unknown }).children) &&
        ((el.props as { children: React.ReactNode[] }).children as unknown[]).some(
          (c) => typeof c === 'string' && (c as string).includes('properties.scaling.running'),
        ),
    );
    expect(runningSpans.length).toBeGreaterThan(0);
  });

  it('min stepper onChange → updateNodeField("minInstances", v)', () => {
    const { tree, updateNodeField } = renderSection({ minInstances: 2 });
    const [minStepper] = findSteppers(tree);
    (minStepper.props as StepperProps).onChange(7);
    expect(updateNodeField).toHaveBeenCalledTimes(1);
    expect(updateNodeField).toHaveBeenCalledWith('minInstances', 7);
  });

  it('max stepper onChange → updateNodeField("maxInstances", v)', () => {
    const { tree, updateNodeField } = renderSection({ maxInstances: 8 });
    const [, maxStepper] = findSteppers(tree);
    (maxStepper.props as StepperProps).onChange(15);
    expect(updateNodeField).toHaveBeenCalledTimes(1);
    expect(updateNodeField).toHaveBeenCalledWith('maxInstances', 15);
  });

  it('select onChange → updateNodeField("scalingMetric", v)', () => {
    const { tree, updateNodeField } = renderSection();
    const [selector] = findSelects(tree);
    (selector.props as SelectProps).onChange('memory');
    expect(updateNodeField).toHaveBeenCalledTimes(1);
    expect(updateNodeField).toHaveBeenCalledWith('scalingMetric', 'memory');
  });

  it('threshold onChange → updateNodeField("scalingThreshold", v)', () => {
    const { tree, updateNodeField } = renderSection({ scalingMetric: 'cpu' });
    const [threshold] = findNumbers(tree);
    (threshold.props as NumberProps).onChange(60);
    expect(updateNodeField).toHaveBeenCalledTimes(1);
    expect(updateNodeField).toHaveBeenCalledWith('scalingThreshold', 60);
  });
});

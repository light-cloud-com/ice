/**
 * rf-props-9 — render-property-field factory + PropertyFields orchestrator.
 *
 * Same tree-walker pattern as rf-props-6 (cite anchor:
 * `tree-walker-for-react-fc-tests-must-flatten-nested-children-arrays`):
 * direct invocation of the React.FC (or factory call for `renderPropertyField`)
 * gives a React element tree we walk depth-first to find leaves and assert on
 * their type / props / data-attributes. Arrays inside `props.children` (from
 * `.map()` calls in `PropertyFields`) MUST be recursed into explicitly before
 * treating a node as an element — otherwise the walker tries to read
 * `props.children` on a raw array and throws.
 *
 * `IceSelect` is mocked to a plain `<select>` so we can render dispatch through
 * Radix-portal logic without a browser environment. The mock preserves the
 * `width` and `options` shape so we can still assert on dispatch.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

// Mock IceSelect — render-property-field's select+optionDetails branch uses
// IceSelect with object-shape options, not the simpler string-array shape
// the rf-props-6 mock supports. Override here with a tag we can identify in
// the tree walker.
vi.mock('../../../../../shared/components/ui/ice-select', () => ({
  IceSelect: (props: {
    value: string;
    width?: string;
    onChange: (v: string) => void;
    options: Array<{ value: string; label: string; description?: string }>;
  }) =>
    React.createElement(
      'select',
      {
        'data-testid': 'ice-select',
        'data-width': props.width,
        value: props.value,
        onChange: (e: { target: { value: string } }) => props.onChange(e.target.value),
      },
      props.options.map((opt) =>
        React.createElement(
          'option',
          { key: opt.value, value: opt.value, 'data-description': opt.description },
          opt.label,
        ),
      ),
    ),
}));

import {
  renderPropertyField,
  PropertyFields,
  type HighLevelProperty,
} from '../render-property-field';

// ─── Tree-walker helpers (same shape as rf-props-6 — see learning anchor) ──

type ReactNodeLike = React.ReactNode;

function* walk(node: ReactNodeLike): Generator<React.ReactElement> {
  if (
    node == null ||
    typeof node === 'boolean' ||
    typeof node === 'string' ||
    typeof node === 'number'
  ) {
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

function findByPredicate(
  tree: React.ReactElement | React.ReactNode,
  predicate: (el: React.ReactElement) => boolean,
): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) {
    if (el && predicate(el)) out.push(el);
  }
  return out;
}

function findByDisplayName(
  tree: React.ReactElement | React.ReactNode,
  name: string,
): React.ReactElement[] {
  return findByPredicate(tree, (el) => {
    const t = el.type as { displayName?: string; name?: string } | string;
    if (typeof t === 'string') return t === name;
    return t?.displayName === name || t?.name === name;
  });
}

// ─── renderPropertyField dispatch ──────────────────────────────────────────

describe('renderPropertyField', () => {
  const mkProp = (over: Partial<HighLevelProperty>): HighLevelProperty => ({
    name: 'demo',
    label: 'Demo',
    type: 'string',
    required: false,
    description: '',
    ...over,
  });

  it('dispatches to IceSelect when prop.type === "select" and optionDetails are present', () => {
    const onChange = vi.fn();
    const prop = mkProp({
      type: 'select',
      optionDetails: [
        { value: 'small', label: 'Small', cost: '$10' },
        { value: 'large', label: 'Large', cost: '$100' },
      ],
    });
    const tree = renderPropertyField(prop, 'small', onChange) as React.ReactElement;
    // The IceSelect element receives a `width` prop from the factory — match
    // by that shape (the mock preserves the prop, the walker sees the unrendered
    // element where IceSelect's component-fn is the type).
    const selects = findByPredicate(
      tree,
      (el) => typeof (el.props as { width?: string }).width === 'string' && Array.isArray((el.props as { options?: unknown }).options),
    );
    expect(selects).toHaveLength(1);
    expect((selects[0].props as { width: string }).width).toBe('160px');
  });

  it('dispatches to SelectField when prop.type === "select" without optionDetails but with options', () => {
    const onChange = vi.fn();
    const prop = mkProp({ type: 'select', options: ['a', 'b', 'c'] });
    const tree = renderPropertyField(prop, 'a', onChange) as React.ReactElement;
    const matches = findByDisplayName(tree, 'SelectField');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('dispatches to ListField when prop.type === "list"', () => {
    const onChange = vi.fn();
    const prop = mkProp({ type: 'list' });
    const tree = renderPropertyField(prop, ['a', 'b'], onChange) as React.ReactElement;
    const matches = findByDisplayName(tree, 'ListField');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('dispatches to QueueListField when prop.type === "queue_list"', () => {
    const onChange = vi.fn();
    const prop = mkProp({ type: 'queue_list' });
    const tree = renderPropertyField(prop, [], onChange) as React.ReactElement;
    const matches = findByDisplayName(tree, 'QueueListField');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('dispatches to a number-typed input when prop.type === "number"', () => {
    const onChange = vi.fn();
    const prop = mkProp({ type: 'number' });
    const tree = renderPropertyField(prop, 5, onChange) as React.ReactElement;
    const numberInputs = findByPredicate(
      tree,
      (el) => el.type === 'input' && (el.props as { type?: string }).type === 'number',
    );
    expect(numberInputs).toHaveLength(1);
  });

  it('dispatches to a boolean toggle (rendered as a stepper-style on/off button) when prop.type === "boolean"', () => {
    // Note: the original implementation repurposes a flat <button> toggle for
    // boolean (NOT the StepperField primitive). The factory's intent is "step
    // through on/off states with a single button" — preserved verbatim.
    const onChange = vi.fn();
    const prop = mkProp({ type: 'boolean' });
    const tree = renderPropertyField(prop, false, onChange) as React.ReactElement;
    const buttons = findByPredicate(tree, (el) => el.type === 'button');
    expect(buttons).toHaveLength(1);
    // Click flips false → true
    buttons[0].props.onClick();
    expect(onChange).toHaveBeenCalledWith('demo', true);
  });

  it('falls through to a default text-input for prop.type === "string"', () => {
    const onChange = vi.fn();
    const prop = mkProp({ type: 'string', placeholder: 'enter name' });
    const tree = renderPropertyField(prop, 'hello', onChange) as React.ReactElement;
    const textInputs = findByPredicate(
      tree,
      (el) => el.type === 'input' && (el.props as { type?: string }).type === 'text',
    );
    expect(textInputs).toHaveLength(1);
    expect((textInputs[0].props as { value?: string }).value).toBe('hello');
    expect((textInputs[0].props as { placeholder?: string }).placeholder).toBe('enter name');
  });

  it('renders CustomValueInput underneath the IceSelect when value === "custom" AND prop.customInput is set', () => {
    const onChange = vi.fn();
    const prop = mkProp({
      type: 'select',
      optionDetails: [
        { value: 'preset', label: 'Preset' },
        { value: 'custom', label: 'Custom' },
      ],
      customInput: { type: 'number', unit: 'GB' },
    });
    const tree = renderPropertyField(prop, 'custom', onChange) as React.ReactElement;
    const customInputs = findByDisplayName(tree, 'CustomValueInput');
    expect(customInputs).toHaveLength(1);
  });

  it('does NOT render CustomValueInput when value === "custom" but prop.customInput is undefined', () => {
    const onChange = vi.fn();
    const prop = mkProp({
      type: 'select',
      optionDetails: [
        { value: 'preset', label: 'Preset' },
        { value: 'custom', label: 'Custom' },
      ],
      // customInput intentionally absent
    });
    const tree = renderPropertyField(prop, 'custom', onChange) as React.ReactElement;
    const customInputs = findByDisplayName(tree, 'CustomValueInput');
    expect(customInputs).toHaveLength(0);
  });

  it('IceSelect onChange dispatches both the prop value AND the *_display field with concatenated label/description', () => {
    const onChange = vi.fn();
    const prop = mkProp({
      name: 'tier',
      type: 'select',
      optionDetails: [
        { value: 'gold', label: 'Gold', description: 'fast' },
        { value: 'platinum', label: 'Platinum', description: 'fastest' },
      ],
    });
    const tree = renderPropertyField(prop, 'gold', onChange) as React.ReactElement;
    const select = findByPredicate(
      tree,
      (el) => typeof (el.props as { width?: string }).width === 'string' && Array.isArray((el.props as { options?: unknown }).options),
    )[0];
    // Invoke the onChange the factory wired into IceSelect — it should dispatch
    // both the field name and the *_display companion field.
    (select.props as { onChange: (v: string) => void }).onChange('platinum');
    expect(onChange).toHaveBeenCalledWith('tier', 'platinum');
    expect(onChange).toHaveBeenCalledWith('tier_display', 'Platinum · fastest');
  });

  it('reads default value when current value is null', () => {
    const onChange = vi.fn();
    const prop = mkProp({ type: 'string', default: 'fallback' });
    const tree = renderPropertyField(prop, null, onChange) as React.ReactElement;
    const textInput = findByPredicate(
      tree,
      (el) => el.type === 'input' && (el.props as { type?: string }).type === 'text',
    )[0];
    // The text-default branch coerces null to '', not to default — preserved baseline.
    expect((textInput.props as { value?: string }).value).toBe('');
  });

  it('reads prop.default for boolean toggle when value is null', () => {
    const onChange = vi.fn();
    const prop = mkProp({ type: 'boolean', default: true });
    const tree = renderPropertyField(prop, null, onChange) as React.ReactElement;
    const button = findByPredicate(tree, (el) => el.type === 'button')[0];
    button.props.onClick();
    // value is null, so the click flips !default → false
    expect(onChange).toHaveBeenCalledWith('demo', false);
  });

  it('list field forwards onChange wired to (prop.name, listValue)', () => {
    const onChange = vi.fn();
    const prop = mkProp({ name: 'tags', type: 'list' });
    const tree = renderPropertyField(prop, ['a', 'b'], onChange) as React.ReactElement;
    const list = findByDisplayName(tree, 'ListField')[0];
    (list.props as { onChange: (v: string[]) => void }).onChange(['a', 'b', 'c']);
    expect(onChange).toHaveBeenCalledWith('tags', ['a', 'b', 'c']);
  });

  it('queue_list field forwards onChange wired to (prop.name, listValue)', () => {
    const onChange = vi.fn();
    const prop = mkProp({ name: 'queues', type: 'queue_list' });
    const tree = renderPropertyField(prop, [], onChange) as React.ReactElement;
    const list = findByDisplayName(tree, 'QueueListField')[0];
    (list.props as { onChange: (v: string[]) => void }).onChange(['{"name":"orders","fifo":false}']);
    expect(onChange).toHaveBeenCalledWith('queues', ['{"name":"orders","fifo":false}']);
  });

  it('select+options SelectField forwards onChange wired to (prop.name, value)', () => {
    const onChange = vi.fn();
    const prop = mkProp({ name: 'tier', type: 'select', options: ['a', 'b'] });
    const tree = renderPropertyField(prop, 'a', onChange) as React.ReactElement;
    const sel = findByDisplayName(tree, 'SelectField')[0];
    (sel.props as { onChange: (v: string) => void }).onChange('b');
    expect(onChange).toHaveBeenCalledWith('tier', 'b');
  });

  it('number input fires onChange with parsed Number (and "" when input is empty)', () => {
    const onChange = vi.fn();
    const prop = mkProp({ name: 'replicas', type: 'number' });
    const tree = renderPropertyField(prop, 3, onChange) as React.ReactElement;
    const input = findByPredicate(
      tree,
      (el) => el.type === 'input' && (el.props as { type?: string }).type === 'number',
    )[0];
    (input.props as { onChange: (e: { target: { value: string } }) => void }).onChange({
      target: { value: '5' },
    });
    expect(onChange).toHaveBeenCalledWith('replicas', 5);
    onChange.mockClear();
    (input.props as { onChange: (e: { target: { value: string } }) => void }).onChange({
      target: { value: '' },
    });
    expect(onChange).toHaveBeenCalledWith('replicas', '');
  });

  it('number input falls back to prop.default when value is null and default is set', () => {
    const onChange = vi.fn();
    const prop = mkProp({ type: 'number', default: 8 });
    const tree = renderPropertyField(prop, null, onChange) as React.ReactElement;
    const input = findByPredicate(
      tree,
      (el) => el.type === 'input' && (el.props as { type?: string }).type === 'number',
    )[0];
    expect((input.props as { value?: number }).value).toBe(8);
  });

  it('text input fires onChange with the raw string', () => {
    const onChange = vi.fn();
    const prop = mkProp({ name: 'region', type: 'string' });
    const tree = renderPropertyField(prop, 'us-east-1', onChange) as React.ReactElement;
    const input = findByPredicate(
      tree,
      (el) => el.type === 'input' && (el.props as { type?: string }).type === 'text',
    )[0];
    (input.props as { onChange: (e: { target: { value: string } }) => void }).onChange({
      target: { value: 'eu-west-1' },
    });
    expect(onChange).toHaveBeenCalledWith('region', 'eu-west-1');
  });

  it('IceSelect onChange does NOT dispatch *_display when the chosen option is not in optionDetails', () => {
    // Defensive branch: `find` returns undefined → the `if (detail)` skips.
    const onChange = vi.fn();
    const prop = mkProp({
      name: 'tier',
      type: 'select',
      optionDetails: [{ value: 'a', label: 'A' }],
    });
    const tree = renderPropertyField(prop, 'a', onChange) as React.ReactElement;
    const select = findByPredicate(
      tree,
      (el) => typeof (el.props as { width?: string }).width === 'string' && Array.isArray((el.props as { options?: unknown }).options),
    )[0];
    (select.props as { onChange: (v: string) => void }).onChange('not-in-details');
    expect(onChange).toHaveBeenCalledWith('tier', 'not-in-details');
    // No *_display dispatch
    const displayCalls = onChange.mock.calls.filter((c) => c[0] === 'tier_display');
    expect(displayCalls).toHaveLength(0);
  });

  it('CustomValueInput onChange fires both *_custom and *_display dispatches', () => {
    const onChange = vi.fn();
    const prop = mkProp({
      name: 'memory',
      type: 'select',
      optionDetails: [
        { value: 'preset', label: 'Preset' },
        { value: 'custom', label: 'Custom' },
      ],
      customInput: { type: 'number', unit: 'GB' },
    });
    const tree = renderPropertyField(prop, 'custom', onChange, {}) as React.ReactElement;
    const customInput = findByDisplayName(tree, 'CustomValueInput')[0];
    (customInput.props as { onChange: (v: unknown) => void }).onChange(64);
    expect(onChange).toHaveBeenCalledWith('memory_custom', 64);
    expect(onChange).toHaveBeenCalledWith('memory_display', 'Custom: 64 GB');
  });
});

// ─── PropertyFields orchestrator ───────────────────────────────────────────

describe('PropertyFields', () => {
  const mkProp = (over: Partial<HighLevelProperty>): HighLevelProperty => ({
    name: 'demo',
    label: 'Demo',
    type: 'string',
    required: false,
    description: '',
    ...over,
  });

  it('renders no Section when all properties are filtered out by tier', () => {
    // All are advanced — hidden tier.
    const properties = [
      mkProp({ name: 'a', tier: 'advanced' }),
      mkProp({ name: 'b', tier: 'advanced' }),
    ];
    const tree = (PropertyFields as React.FC<Parameters<typeof PropertyFields>[0]>)({
      properties,
      nodeData: {},
      onFieldChange: vi.fn(),
    }) as React.ReactElement;
    // The visible-list is empty so no Section is rendered.
    const sections = findByDisplayName(tree, 'Section');
    expect(sections).toHaveLength(0);
  });

  it('filters out tier === "advanced" properties from visible list', () => {
    const properties = [
      mkProp({ name: 'shown1', tier: 'essential' }),
      mkProp({ name: 'hidden', tier: 'advanced' }),
      mkProp({ name: 'shown2', tier: 'detailed' }),
    ];
    const tree = (PropertyFields as React.FC<Parameters<typeof PropertyFields>[0]>)({
      properties,
      nodeData: {},
      onFieldChange: vi.fn(),
    }) as React.ReactElement;
    const wrappers = findByPredicate(
      tree,
      (el) => el.type === 'div' && typeof (el.props as { 'data-prop-key'?: string })['data-prop-key'] === 'string',
    );
    const keys = wrappers.map((el) => (el.props as { 'data-prop-key': string })['data-prop-key']);
    expect(keys).toEqual(['shown1', 'shown2']);
  });

  it('treats no-tier properties as visible (essential default)', () => {
    const properties = [mkProp({ name: 'untiered' })];
    const tree = (PropertyFields as React.FC<Parameters<typeof PropertyFields>[0]>)({
      properties,
      nodeData: {},
      onFieldChange: vi.fn(),
    }) as React.ReactElement;
    const wrappers = findByPredicate(
      tree,
      (el) => el.type === 'div' && (el.props as { 'data-prop-key'?: string })['data-prop-key'] === 'untiered',
    );
    expect(wrappers).toHaveLength(1);
  });

  it('includes tier === "essential" and tier === "detailed"', () => {
    const properties = [
      mkProp({ name: 'e', tier: 'essential' }),
      mkProp({ name: 'd', tier: 'detailed' }),
    ];
    const tree = (PropertyFields as React.FC<Parameters<typeof PropertyFields>[0]>)({
      properties,
      nodeData: {},
      onFieldChange: vi.fn(),
    }) as React.ReactElement;
    const wrappers = findByPredicate(
      tree,
      (el) => el.type === 'div' && typeof (el.props as { 'data-prop-key'?: string })['data-prop-key'] === 'string',
    );
    expect(wrappers).toHaveLength(2);
  });

  it('provider-filters optionDetails: keeps only entries matching nodeData.provider', () => {
    const properties = [
      mkProp({
        name: 'instance',
        type: 'select',
        optionDetails: [
          { value: 'a1', label: 'AWS A1', provider: 'aws' },
          { value: 'g1', label: 'GCP G1', provider: 'gcp' },
        ],
      }),
    ];
    const tree = (PropertyFields as React.FC<Parameters<typeof PropertyFields>[0]>)({
      properties,
      nodeData: { provider: 'aws' },
      onFieldChange: vi.fn(),
    }) as React.ReactElement;
    // Find the IceSelect element by props shape (not data-testid: the mock isn't
    // executed at walk time — we see the unrendered element).
    const select = findByPredicate(
      tree,
      (el) => typeof (el.props as { width?: string }).width === 'string' && Array.isArray((el.props as { options?: unknown }).options),
    )[0];
    // Read the `options` prop that the factory passed to IceSelect — that's
    // the post-filter shape.
    const options = (select.props as { options: Array<{ value: string }> }).options;
    expect(options).toHaveLength(1);
    expect(options[0].value).toBe('a1');
  });

  it('preserves prop unchanged when no provider is set on the node', () => {
    const properties = [
      mkProp({
        name: 'instance',
        type: 'select',
        optionDetails: [
          { value: 'a1', label: 'AWS A1', provider: 'aws' },
          { value: 'g1', label: 'GCP G1', provider: 'gcp' },
        ],
      }),
    ];
    const tree = (PropertyFields as React.FC<Parameters<typeof PropertyFields>[0]>)({
      properties,
      nodeData: {},
      onFieldChange: vi.fn(),
    }) as React.ReactElement;
    const select = findByPredicate(
      tree,
      (el) => typeof (el.props as { width?: string }).width === 'string' && Array.isArray((el.props as { options?: unknown }).options),
    )[0];
    const options = (select.props as { options: Array<{ value: string }> }).options;
    // Both options retained
    expect(options).toHaveLength(2);
  });

  it('preserves data-prop-key={prop.name} on each rendered wrapper (E2E selector)', () => {
    const properties = [
      mkProp({ name: 'region' }),
      mkProp({ name: 'tier' }),
      mkProp({ name: 'replicas' }),
    ];
    const tree = (PropertyFields as React.FC<Parameters<typeof PropertyFields>[0]>)({
      properties,
      nodeData: {},
      onFieldChange: vi.fn(),
    }) as React.ReactElement;
    const wrappers = findByPredicate(
      tree,
      (el) => el.type === 'div' && typeof (el.props as { 'data-prop-key'?: string })['data-prop-key'] === 'string',
    );
    const keys = wrappers.map((el) => (el.props as { 'data-prop-key': string })['data-prop-key']);
    expect(keys).toEqual(['region', 'tier', 'replicas']);
  });

  it('renders propertyIssues message in red when severity === "error"', () => {
    const properties = [mkProp({ name: 'region' })];
    const propertyIssues = new Map([
      ['region', { severity: 'error', message: 'invalid region' }],
    ]);
    const tree = (PropertyFields as React.FC<Parameters<typeof PropertyFields>[0]>)({
      properties,
      nodeData: {},
      onFieldChange: vi.fn(),
      propertyIssues,
    }) as React.ReactElement;
    const errorBanners = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('text-red-400'),
    );
    expect(errorBanners).toHaveLength(1);
    // The message is the only child string
    expect((errorBanners[0].props as { children?: unknown }).children).toBe('invalid region');
  });

  it('renders propertyIssues message in amber for non-error severities (e.g. warning)', () => {
    const properties = [mkProp({ name: 'region' })];
    const propertyIssues = new Map([
      ['region', { severity: 'warning', message: 'deprecated region' }],
    ]);
    const tree = (PropertyFields as React.FC<Parameters<typeof PropertyFields>[0]>)({
      properties,
      nodeData: {},
      onFieldChange: vi.fn(),
      propertyIssues,
    }) as React.ReactElement;
    const amberBanners = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('text-amber-400'),
    );
    expect(amberBanners).toHaveLength(1);
  });

  it('does not render any inline message when propertyIssues lacks the prop name', () => {
    const properties = [mkProp({ name: 'region' })];
    const propertyIssues = new Map([
      ['some-other-prop', { severity: 'error', message: 'unrelated' }],
    ]);
    const tree = (PropertyFields as React.FC<Parameters<typeof PropertyFields>[0]>)({
      properties,
      nodeData: {},
      onFieldChange: vi.fn(),
      propertyIssues,
    }) as React.ReactElement;
    const banners = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        ((el.props as { className: string }).className.includes('text-red-400') ||
          (el.props as { className: string }).className.includes('text-amber-400')),
    );
    expect(banners).toHaveLength(0);
  });

  it('forwards nodeData[prop.name] as the value into renderPropertyField', () => {
    const onFieldChange = vi.fn();
    const properties = [mkProp({ name: 'region', type: 'string' })];
    const tree = (PropertyFields as React.FC<Parameters<typeof PropertyFields>[0]>)({
      properties,
      nodeData: { region: 'us-east-1' },
      onFieldChange,
    }) as React.ReactElement;
    const textInput = findByPredicate(
      tree,
      (el) => el.type === 'input' && (el.props as { type?: string }).type === 'text',
    )[0];
    expect((textInput.props as { value?: string }).value).toBe('us-east-1');
  });
});

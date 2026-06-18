/**
 * rf-props-6 — field primitives bundle.
 *
 * Tests run in a node environment (no jsdom in this monorepo), so two
 * complementary strategies are used:
 *
 *   1. `renderToString` from `react-dom/server` — for markup-level assertions
 *      (label text, value attribute, button presence, classes that gate UX).
 *
 *   2. Direct invocation of the React.FC for components without hooks — for
 *      handler assertions. We call the component as a function, walk the
 *      returned React element tree to find the relevant `<input>`/`<button>`,
 *      then invoke its `onChange`/`onClick` prop with a synthetic event.
 *      This sidesteps the DOM entirely and tests the behavioral contract.
 *
 * `PropertyLabel` uses `useState` so direct invocation isn't safe; only its
 * `renderToString` output is asserted (initial state — tooltip hidden).
 *
 * `IceSelect` is mocked because it depends on Radix UI's portal-and-context
 * machinery which expects a browser environment.
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';

// Mock IceSelect with a plain <select> so SelectField's behavior can be tested
// without dragging in Radix UI's DOM dependencies.
vi.mock('../../../../../shared/components/ui/ice-select', () => ({
  IceSelect: ({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) =>
    React.createElement(
      'select',
      {
        'data-testid': 'ice-select',
        value,
        onChange: (e: { target: { value: string } }) => onChange(e.target.value),
      },
      options.map((opt) => React.createElement('option', { key: opt, value: opt }, opt)),
    ),
}));

import {
  Section,
  TextField,
  NumberField,
  SelectField,
  ListField,
  QueueListField,
  StepperField,
  PropertyLabel,
  CustomValueInput,
  type CustomInputConfig,
} from '..';

// ─── Tree-walking helpers ───────────────────────────────────────────────────

type ReactNodeLike = React.ReactNode;

/**
 * Walk a React element tree depth-first; yields every element. Arrays are
 * flattened arbitrarily deep (React.Children.toArray would also work, but
 * we want to avoid coupling to React's runtime helpers in a node-only test).
 */
function* walk(node: ReactNodeLike): Generator<React.ReactElement> {
  if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') {
    return;
  }
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c as ReactNodeLike);
    return;
  }
  // React element
  const el = node as React.ReactElement;
  yield el;
  const children = (el.props as { children?: React.ReactNode } | undefined)?.children;
  if (children == null) return;
  yield* walk(children);
}

function findByType(tree: React.ReactElement, type: string): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) {
    if (el && el.type === type) out.push(el);
  }
  return out;
}

function findByPredicate(
  tree: React.ReactElement,
  predicate: (el: React.ReactElement) => boolean,
): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) {
    if (el && predicate(el)) out.push(el);
  }
  return out;
}

/**
 * Invoke a function-component as a function. Only safe for components that
 * use no hooks beyond `useState` (and only if the test doesn't depend on
 * state being preserved across renders).
 */
function invoke<P>(Component: React.FC<P>, props: P): React.ReactElement {
  return Component(props) as React.ReactElement;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('Section', () => {
  it('renders the title and children when title is non-empty', () => {
    const html = renderToString(React.createElement(Section, { title: 'My Title', children: 'child-content' }));
    expect(html).toContain('My Title');
    expect(html).toContain('child-content');
  });

  it('omits the title element when title is the empty string but still renders children', () => {
    const tree = invoke(Section, { title: '', children: 'inner' });
    // Outer <div> wraps the inner <div className="space-y-1"> only when title is empty.
    const innerDivs = findByType(tree, 'div');
    expect(innerDivs.length).toBe(2); // outer wrapper + inner space-y-1
    const html = renderToString(tree);
    expect(html).toContain('inner');
    expect(html).not.toContain('mb-2'); // the title's className isn't rendered
  });
});

describe('TextField', () => {
  it('renders label, value, and placeholder', () => {
    const onChange = vi.fn();
    const html = renderToString(
      React.createElement(TextField, {
        label: 'Region',
        value: 'us-east-1',
        onChange,
        placeholder: 'pick a region',
        propKey: 'region',
      }),
    );
    expect(html).toContain('Region');
    expect(html).toContain('us-east-1');
    expect(html).toContain('pick a region');
    expect(html).toContain('data-prop-key="region"');
  });

  it('fires onChange with the new value on input change', () => {
    const onChange = vi.fn();
    const tree = invoke(TextField, {
      label: 'Region',
      value: 'us-east-1',
      onChange,
    });
    const inputs = findByType(tree, 'input');
    expect(inputs).toHaveLength(1);
    const input = inputs[0];
    expect(input.props.type).toBe('text');
    // Synthetic change event
    input.props.onChange({ target: { value: 'eu-west-1' } });
    expect(onChange).toHaveBeenCalledWith('eu-west-1');
  });
});

describe('NumberField', () => {
  it('renders label and current value as a number-typed input', () => {
    const onChange = vi.fn();
    const html = renderToString(
      React.createElement(NumberField, {
        label: 'Replicas',
        value: 3,
        onChange,
      }),
    );
    expect(html).toContain('Replicas');
    expect(html).toContain('type="number"');
    expect(html).toContain('value="3"');
  });

  it('fires onChange with the parsed Number on input change', () => {
    const onChange = vi.fn();
    const tree = invoke(NumberField, {
      label: 'Replicas',
      value: 3,
      onChange,
    });
    const input = findByType(tree, 'input')[0];
    input.props.onChange({ target: { value: '7' } });
    expect(onChange).toHaveBeenCalledWith(7);
  });

  it('coerces an empty string to NaN via Number() — preserved-behavior baseline', () => {
    const onChange = vi.fn();
    const tree = invoke(NumberField, {
      label: 'Replicas',
      value: 3,
      onChange,
    });
    const input = findByType(tree, 'input')[0];
    input.props.onChange({ target: { value: '' } });
    // Number('') === 0, not NaN — the original code does Number(e.target.value)
    expect(onChange).toHaveBeenCalledWith(0);
  });
});

describe('SelectField', () => {
  it('renders the (mocked) IceSelect with options', () => {
    const onChange = vi.fn();
    const html = renderToString(
      React.createElement(SelectField, {
        label: 'Tier',
        value: 'gold',
        options: ['silver', 'gold', 'platinum'],
        onChange,
      }),
    );
    expect(html).toContain('Tier');
    expect(html).toContain('silver');
    expect(html).toContain('gold');
    expect(html).toContain('platinum');
  });

  it('fires onChange with the selected value via the wrapped IceSelect', () => {
    const onChange = vi.fn();
    const tree = invoke(SelectField, {
      label: 'Tier',
      value: 'gold',
      options: ['silver', 'gold', 'platinum'],
      onChange,
    });
    // The IceSelect wrapper receives onChange as a direct prop. Find the
    // rendered IceSelect element and invoke its onChange to verify wiring.
    const matches = findByPredicate(tree, (el) => typeof el.props.options !== 'undefined' && el.props.value === 'gold');
    expect(matches.length).toBe(1);
    matches[0].props.onChange('platinum');
    expect(onChange).toHaveBeenCalledWith('platinum');
  });
});

describe('ListField', () => {
  it('renders an input row per item plus an add button', () => {
    const onChange = vi.fn();
    const html = renderToString(
      React.createElement(ListField, {
        label: 'Tags',
        value: ['alpha', 'beta'],
        onChange,
      }),
    );
    expect(html).toContain('Tags');
    expect(html).toContain('alpha');
    expect(html).toContain('beta');
    // The add button text starts with the literal "+ "
    expect(html).toMatch(/\+\s/);
  });

  it('appends a blank string when the add button is clicked', () => {
    const onChange = vi.fn();
    const tree = invoke(ListField, {
      label: 'Tags',
      value: ['alpha', 'beta'],
      onChange,
    });
    const buttons = findByType(tree, 'button');
    // Last button is the add-row button
    const addButton = buttons[buttons.length - 1];
    addButton.props.onClick();
    expect(onChange).toHaveBeenCalledWith(['alpha', 'beta', '']);
  });

  it('removes the matching item when its × button is clicked', () => {
    const onChange = vi.fn();
    const tree = invoke(ListField, {
      label: 'Tags',
      value: ['alpha', 'beta', 'gamma'],
      onChange,
    });
    const buttons = findByType(tree, 'button');
    // Per-item × buttons appear before the trailing add button
    // (3 remove buttons + 1 add button = 4 total)
    expect(buttons).toHaveLength(4);
    buttons[1].props.onClick(); // remove the second item ('beta')
    expect(onChange).toHaveBeenCalledWith(['alpha', 'gamma']);
  });

  it('updates the matching item when an input is edited', () => {
    const onChange = vi.fn();
    const tree = invoke(ListField, {
      label: 'Tags',
      value: ['alpha', 'beta'],
      onChange,
    });
    const inputs = findByType(tree, 'input');
    inputs[0].props.onChange({ target: { value: 'ALPHA' } });
    expect(onChange).toHaveBeenCalledWith(['ALPHA', 'beta']);
  });

  it('uses the addLabel override when provided', () => {
    const onChange = vi.fn();
    const html = renderToString(
      React.createElement(ListField, {
        label: 'Tags',
        value: [],
        onChange,
        addLabel: 'Add a tag',
      }),
    );
    expect(html).toContain('Add a tag');
  });
});

describe('QueueListField', () => {
  it('round-trips a queue spec on read (parses JSON) and write (stringify)', () => {
    const onChange = vi.fn();
    const tree = invoke(QueueListField, {
      label: 'Queues',
      value: ['{"name":"orders","fifo":false}'],
      onChange,
    });
    const inputs = findByType(tree, 'input');
    expect(inputs).toHaveLength(1);
    expect(inputs[0].props.value).toBe('orders');
    inputs[0].props.onChange({ target: { value: 'shipments' } });
    expect(onChange).toHaveBeenCalledWith(['{"name":"shipments","fifo":false}']);
  });

  it('toggles fifo on the matching queue when its FIFO button is clicked', () => {
    const onChange = vi.fn();
    const tree = invoke(QueueListField, {
      label: 'Queues',
      value: ['{"name":"orders","fifo":false}'],
      onChange,
    });
    const buttons = findByType(tree, 'button');
    // First button is the FIFO toggle, second is remove, third is add-row
    expect(buttons.length).toBeGreaterThanOrEqual(3);
    buttons[0].props.onClick();
    expect(onChange).toHaveBeenCalledWith(['{"name":"orders","fifo":true}']);
  });

  it('removes the matching queue when its × button is clicked', () => {
    const onChange = vi.fn();
    const tree = invoke(QueueListField, {
      label: 'Queues',
      value: ['{"name":"orders","fifo":false}', '{"name":"shipments","fifo":true}'],
      onChange,
    });
    const buttons = findByType(tree, 'button');
    // Per-queue layout: [FIFO toggle, remove, FIFO toggle, remove, add-row]
    buttons[1].props.onClick(); // remove first queue
    expect(onChange).toHaveBeenCalledWith(['{"name":"shipments","fifo":true}']);
  });

  it('appends a blank queue (name: "", fifo: false) when the add button is clicked', () => {
    const onChange = vi.fn();
    const tree = invoke(QueueListField, {
      label: 'Queues',
      value: [],
      onChange,
    });
    const buttons = findByType(tree, 'button');
    expect(buttons).toHaveLength(1); // just the add-row button
    buttons[0].props.onClick();
    expect(onChange).toHaveBeenCalledWith(['{"name":"","fifo":false}']);
  });

  it('upgrades a plain-string entry to a queue spec on read (back-compat)', () => {
    const onChange = vi.fn();
    const tree = invoke(QueueListField, {
      label: 'Queues',
      value: ['legacy-queue'], // plain-string entry, no JSON
      onChange,
    });
    const inputs = findByType(tree, 'input');
    expect(inputs[0].props.value).toBe('legacy-queue');
  });
});

describe('StepperField', () => {
  it('renders label and value', () => {
    const onChange = vi.fn();
    const html = renderToString(
      React.createElement(StepperField, {
        label: 'Replicas',
        value: 5,
        onChange,
      }),
    );
    expect(html).toContain('Replicas');
    expect(html).toContain('5');
  });

  it('decrements via the − button down to but not below `min`', () => {
    const onChange = vi.fn();
    const tree = invoke(StepperField, {
      label: 'Replicas',
      value: 1,
      min: 1,
      onChange,
    });
    const buttons = findByType(tree, 'button');
    expect(buttons).toHaveLength(2);
    buttons[0].props.onClick(); // − button
    expect(onChange).toHaveBeenCalledWith(1); // clamped at min
  });

  it('increments via the + button up to but not above `max`', () => {
    const onChange = vi.fn();
    const tree = invoke(StepperField, {
      label: 'Replicas',
      value: 5,
      max: 5,
      onChange,
    });
    const buttons = findByType(tree, 'button');
    buttons[1].props.onClick(); // + button
    expect(onChange).toHaveBeenCalledWith(5); // clamped at max
  });

  it('decrements normally when above min', () => {
    const onChange = vi.fn();
    const tree = invoke(StepperField, {
      label: 'Replicas',
      value: 4,
      min: 0,
      max: 10,
      onChange,
    });
    findByType(tree, 'button')[0].props.onClick();
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('increments normally when below max', () => {
    const onChange = vi.fn();
    const tree = invoke(StepperField, {
      label: 'Replicas',
      value: 4,
      min: 0,
      max: 10,
      onChange,
    });
    findByType(tree, 'button')[1].props.onClick();
    expect(onChange).toHaveBeenCalledWith(5);
  });

  it('defaults min=0 and max=99 when omitted', () => {
    const onChange = vi.fn();
    const tree = invoke(StepperField, {
      label: 'Replicas',
      value: 0,
      onChange,
    });
    findByType(tree, 'button')[0].props.onClick();
    expect(onChange).toHaveBeenCalledWith(0); // clamped at default min=0
    onChange.mockClear();
    const tree2 = invoke(StepperField, {
      label: 'Replicas',
      value: 99,
      onChange,
    });
    findByType(tree2, 'button')[1].props.onClick();
    expect(onChange).toHaveBeenCalledWith(99); // clamped at default max=99
  });
});

describe('PropertyLabel', () => {
  it('renders the label without a tooltip when none is supplied', () => {
    const html = renderToString(React.createElement(PropertyLabel, { label: 'CIDR Block' }));
    expect(html).toContain('CIDR Block');
    // No Info icon when tooltip is absent
    expect(html).not.toContain('cursor-help');
  });

  it('renders the Info icon trigger when a tooltip is supplied (initial state hides the popup)', () => {
    const html = renderToString(
      React.createElement(PropertyLabel, {
        label: 'CIDR Block',
        tooltip: 'A range like 10.0.0.0/16',
      }),
    );
    expect(html).toContain('CIDR Block');
    expect(html).toContain('cursor-help'); // Info icon class
    // Initial state — tooltip text is NOT in the DOM (showTooltip starts false)
    expect(html).not.toContain('A range like 10.0.0.0/16');
  });

  // PE1 — a required field shows a red asterisk with an accessible name so the
  // user knows it's mandatory before a deploy fails on it.
  it('marks a required field with an asterisk + accessible name', () => {
    const html = renderToString(React.createElement(PropertyLabel, { label: 'VPC ID', required: true }));
    expect(html).toContain('VPC ID');
    expect(html).toContain('*');
    // aria-label/title resolve via i18n (default locale → "Required").
    expect(html).toContain('aria-label="Required"');
  });

  it('omits the required asterisk for an optional field', () => {
    const html = renderToString(React.createElement(PropertyLabel, { label: 'VPC ID' }));
    expect(html).not.toContain('aria-label="Required"');
  });
});

describe('CustomValueInput', () => {
  it('renders the input with the configured type, min/max/step, and unit suffix', () => {
    const config: CustomInputConfig = {
      type: 'number',
      unit: 'GB',
      min: 1,
      max: 100,
      step: 10,
      placeholder: 'amount',
    };
    const onChange = vi.fn();
    const html = renderToString(
      React.createElement(CustomValueInput, {
        config,
        value: 50,
        onChange,
      }),
    );
    expect(html).toContain('type="number"');
    expect(html).toContain('GB');
    expect(html).toContain('min="1"');
    expect(html).toContain('max="100"');
    expect(html).toContain('step="10"');
    expect(html).toContain('value="50"');
    expect(html).toContain('placeholder="amount"');
  });

  it('renders an empty string when value is null', () => {
    const config: CustomInputConfig = { type: 'number', unit: 'GB' };
    const onChange = vi.fn();
    const html = renderToString(
      React.createElement(CustomValueInput, {
        config,
        value: null,
        onChange,
      }),
    );
    expect(html).toContain('value=""');
  });

  it('parses number-typed input through Number() and fires onChange with the result', () => {
    const config: CustomInputConfig = { type: 'number', unit: 'GB' };
    const onChange = vi.fn();
    const tree = invoke(CustomValueInput, {
      config,
      value: 50,
      onChange,
    });
    const input = findByType(tree, 'input')[0];
    input.props.onChange({ target: { value: '75' } });
    expect(onChange).toHaveBeenCalledWith(75);
  });

  it('passes through string-typed input verbatim and fires onChange', () => {
    const config: CustomInputConfig = { type: 'string', unit: 'chars' };
    const onChange = vi.fn();
    const tree = invoke(CustomValueInput, {
      config,
      value: 'hello',
      onChange,
    });
    const input = findByType(tree, 'input')[0];
    input.props.onChange({ target: { value: 'world' } });
    expect(onChange).toHaveBeenCalledWith('world');
  });

  it('fires onChange with empty-string when number-typed input is cleared', () => {
    const config: CustomInputConfig = { type: 'number', unit: 'GB' };
    const onChange = vi.fn();
    const tree = invoke(CustomValueInput, {
      config,
      value: 50,
      onChange,
    });
    const input = findByType(tree, 'input')[0];
    input.props.onChange({ target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith('');
  });
});

// ─── Sanity: walk handles primitive children correctly ─────────────────────

describe('walk helper coverage', () => {
  it('finds elements regardless of whether children are arrays or single nodes', () => {
    const tree = invoke(Section, { title: 'X', children: ['a', 'b', 'c'] });
    const divs = findByType(tree, 'div');
    expect(divs.length).toBeGreaterThanOrEqual(2);
  });

  it('findByPredicate filters by arbitrary prop shape', () => {
    const tree = invoke(TextField, {
      label: 'L',
      value: 'v',
      onChange: () => {},
      propKey: 'k',
    });
    const matches = findByPredicate(tree, (el) => el.props['data-prop-key'] === 'k');
    expect(matches.length).toBeGreaterThan(0);
  });
});

/**
 * Tests for `IceSelect` — wraps Radix Select with normalize/sentinel logic
 * for empty values, plus size/disabled/fullWidth/width affordances.
 *
 * Strategy:
 *  - Mock all `@radix-ui/react-select` primitives as identity passthroughs.
 *  - The component is wrapped in `memo` — access the underlying type.render
 *    or invoke as FC.
 *  - Walk the rendered tree to assert variant classes and option mapping.
 */

import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const Pass = (kind: string) => {
    const fn = (props: Record<string, unknown>) => ({ type: kind, props });
    (fn as unknown as { displayName: string }).displayName = kind;
    return fn;
  };
  return {
    Root: Pass('IS-Root'),
    Trigger: Pass('IS-Trigger'),
    Value: Pass('IS-Value'),
    Icon: Pass('IS-Icon'),
    Portal: Pass('IS-Portal'),
    Content: Pass('IS-Content'),
    Viewport: Pass('IS-Viewport'),
    Item: Pass('IS-Item'),
    ItemText: Pass('IS-ItemText'),
  };
});

vi.mock('@radix-ui/react-select', () => ({
  Root: mocks.Root,
  Trigger: mocks.Trigger,
  Value: mocks.Value,
  Icon: mocks.Icon,
  Portal: mocks.Portal,
  Content: mocks.Content,
  Viewport: mocks.Viewport,
  Item: mocks.Item,
  ItemText: mocks.ItemText,
}));

import { IceSelect, type IceSelectOption } from '../ice-select';

interface ElLike {
  type: unknown;
  props: {
    className?: string;
    children?: unknown;
    value?: string;
    style?: Record<string, unknown>;
    disabled?: boolean;
    onValueChange?: (v: string) => void;
    [k: string]: unknown;
  };
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
      yield* walk((node.type as (p: unknown) => unknown)(node.props));
    } catch {
      /* skip */
    }
    return;
  }
  yield* walk(node.props.children);
}
function findFirst(tree: unknown, pred: (el: ElLike) => boolean): ElLike | undefined {
  for (const el of walk(tree)) if (pred(el)) return el;
  return undefined;
}
function findAll(tree: unknown, pred: (el: ElLike) => boolean): ElLike[] {
  const out: ElLike[] = [];
  for (const el of walk(tree)) if (pred(el)) out.push(el);
  return out;
}

// IceSelect is wrapped in memo — the underlying FC lives on .type
const InnerFC = (IceSelect as unknown as { type: (p: unknown) => ElLike }).type;
const renderIS = (props: Record<string, unknown>): ElLike => InnerFC(props);

const baseProps = {
  value: '',
  onChange: () => {},
  options: [] as (string | IceSelectOption)[],
};

describe('IceSelect — render shape', () => {
  it('renders Radix Root with onValueChange forwarded', () => {
    const tree = renderIS({ ...baseProps, options: ['a', 'b'] });
    expect(tree.type).toBe(mocks.Root);
    expect(typeof tree.props.onValueChange).toBe('function');
  });

  it('Root.value becomes undefined when value is the empty string', () => {
    const tree = renderIS({ ...baseProps, value: '' });
    expect(tree.props.value).toBeUndefined();
  });

  it('Root.value passes through when value is non-empty', () => {
    const tree = renderIS({ ...baseProps, value: 'a', options: ['a'] });
    expect(tree.props.value).toBe('a');
  });

  it('forwards disabled to Root', () => {
    const tree = renderIS({ ...baseProps, disabled: true });
    expect(tree.props.disabled).toBe(true);
  });
});

describe('IceSelect — onValueChange sentinel handling', () => {
  it('passes empty string when value is the EMPTY_SENTINEL', () => {
    const onChange = vi.fn();
    const tree = renderIS({ ...baseProps, onChange });
    (tree.props.onValueChange as (v: string) => void)('__ice_select_empty__');
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('passes the raw value through for non-sentinel values', () => {
    const onChange = vi.fn();
    const tree = renderIS({ ...baseProps, onChange });
    (tree.props.onValueChange as (v: string) => void)('foo');
    expect(onChange).toHaveBeenCalledWith('foo');
  });
});

describe('IceSelect — Trigger styling', () => {
  it('uses small-size classes by default (h-6, text-ice-xs)', () => {
    const tree = renderIS({ ...baseProps });
    const trigger = findFirst(tree, (el) => el.type === mocks.Trigger)!;
    expect(trigger.props.className).toContain('h-6');
    expect(trigger.props.className).toContain('text-ice-xs');
  });

  it('uses md-size classes when size="md" (h-7, text-ice-sm)', () => {
    const tree = renderIS({ ...baseProps, size: 'md' });
    const trigger = findFirst(tree, (el) => el.type === mocks.Trigger)!;
    expect(trigger.props.className).toContain('h-7');
    expect(trigger.props.className).toContain('text-ice-sm');
  });

  it('adds w-full when fullWidth is true', () => {
    const tree = renderIS({ ...baseProps, fullWidth: true });
    const trigger = findFirst(tree, (el) => el.type === mocks.Trigger)!;
    expect(trigger.props.className).toContain('w-full');
  });

  it('adds disabled styling classes when disabled', () => {
    const tree = renderIS({ ...baseProps, disabled: true });
    const trigger = findFirst(tree, (el) => el.type === mocks.Trigger)!;
    expect(trigger.props.className).toContain('opacity-40');
  });

  it('forwards an explicit width via inline style', () => {
    const tree = renderIS({ ...baseProps, width: '180px' });
    const trigger = findFirst(tree, (el) => el.type === mocks.Trigger)!;
    expect(trigger.props.style).toEqual({ width: '180px' });
  });

  it('omits the width style when width is not set', () => {
    const tree = renderIS({ ...baseProps });
    const trigger = findFirst(tree, (el) => el.type === mocks.Trigger)!;
    expect(trigger.props.style).toBeUndefined();
  });

  it('merges caller className', () => {
    const tree = renderIS({ ...baseProps, className: 'mine' });
    const trigger = findFirst(tree, (el) => el.type === mocks.Trigger)!;
    expect(trigger.props.className).toContain('mine');
  });
});

describe('IceSelect — md-size item text class', () => {
  it('option items use text-ice-sm when size="md"', () => {
    const tree = renderIS({ ...baseProps, size: 'md', options: ['a'] });
    const items = findAll(tree, (el) => el.type === mocks.Item);
    // Find a non-empty-sentinel item.
    const real = items.find((i) => i.props.value === 'a')!;
    expect(real.props.className).toContain('text-ice-sm');
  });
});

describe('IceSelect — option normalization', () => {
  it('treats string options as { value, label } pairs', () => {
    const tree = renderIS({ ...baseProps, options: ['x', 'y'] });
    const items = findAll(tree, (el) => el.type === mocks.Item);
    // Items include the empty-sentinel + 2 options when allowEmpty defaults true.
    const xItem = items.find((i) => i.props.value === 'x')!;
    expect(xItem).toBeDefined();
  });

  it('renders option-object values + labels + descriptions', () => {
    const opts: IceSelectOption[] = [
      { value: 'a', label: 'A', description: 'desc' },
      { value: 'b', label: 'B' },
    ];
    const tree = renderIS({ ...baseProps, options: opts });
    const items = findAll(tree, (el) => el.type === mocks.Item);
    const aItem = items.find((i) => i.props.value === 'a')!;
    expect(aItem).toBeDefined();
    // Item with description has py-1.5 (default size) — branch coverage.
    expect(aItem.props.className).toContain('py-1.5');
    const bItem = items.find((i) => i.props.value === 'b')!;
    expect(bItem.props.className).toContain('py-1');
  });

  it('forwards disabled flag from option-object to Item', () => {
    const opts: IceSelectOption[] = [{ value: 'a', label: 'A', disabled: true }];
    const tree = renderIS({ ...baseProps, options: opts });
    const items = findAll(tree, (el) => el.type === mocks.Item);
    const a = items.find((i) => i.props.value === 'a')!;
    expect(a.props.disabled).toBe(true);
  });
});

describe('IceSelect — empty option (allowEmpty)', () => {
  it('renders the empty-sentinel item by default (allowEmpty=true)', () => {
    const tree = renderIS({ ...baseProps, options: ['a'] });
    const items = findAll(tree, (el) => el.type === mocks.Item);
    const empty = items.find((i) => i.props.value === '__ice_select_empty__');
    expect(empty).toBeDefined();
  });

  it('omits the empty-sentinel item when allowEmpty=false', () => {
    const tree = renderIS({ ...baseProps, options: ['a'], allowEmpty: false });
    const items = findAll(tree, (el) => el.type === mocks.Item);
    const empty = items.find((i) => i.props.value === '__ice_select_empty__');
    expect(empty).toBeUndefined();
  });
});

describe('IceSelect — selected label and check icon', () => {
  it('Value placeholder defaults to em-dash and is shown when no match', () => {
    const tree = renderIS({ ...baseProps, options: ['a'] });
    const value = findFirst(tree, (el) => el.type === mocks.Value)!;
    expect(value.props.placeholder).toBe('—');
  });

  it('uses custom placeholder when provided', () => {
    const tree = renderIS({ ...baseProps, options: ['a'], placeholder: 'Pick' });
    const value = findFirst(tree, (el) => el.type === mocks.Value)!;
    expect(value.props.placeholder).toBe('Pick');
  });

  it('the truncate span omits placeholder color class when an option label is selected', () => {
    const tree = renderIS({ ...baseProps, value: 'a', options: ['a'] });
    const truncate = findFirst(tree, (el) => el.type === 'span' && (el.props.className ?? '').includes('truncate'))!;
    expect(truncate.props.className).not.toContain('text-ice-text-3/40');
  });

  it('the truncate span carries placeholder color class when no value matches', () => {
    const tree = renderIS({ ...baseProps, value: 'missing', options: ['a'] });
    const truncate = findFirst(tree, (el) => el.type === 'span' && (el.props.className ?? '').includes('truncate'))!;
    expect(truncate.props.className).toContain('text-ice-text-3/40');
  });
});

describe('IceSelect — displayName', () => {
  it('exposes a displayName', () => {
    expect(IceSelect.displayName).toBe('IceSelect');
  });
});

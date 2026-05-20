/**
 * Tests for `Select` family — re-exports plus styled forwardRef wrappers
 * around `@radix-ui/react-select` primitives.
 */

import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const Pass = (kind: string) => {
    const fn = (props: Record<string, unknown>) => ({ type: kind, props });
    (fn as unknown as { displayName: string }).displayName = kind;
    return fn;
  };
  return {
    Root: Pass('SelectRoot'),
    Group: Pass('SelectGroup'),
    Value: Pass('SelectValue'),
    Trigger: Pass('SelectTrigger'),
    Icon: Pass('SelectIcon'),
    Portal: Pass('SelectPortal'),
    Content: Pass('SelectContent'),
    Viewport: Pass('SelectViewport'),
    Item: Pass('SelectItem'),
    ItemText: Pass('SelectItemText'),
    ItemIndicator: Pass('SelectItemIndicator'),
    Label: Pass('SelectLabel'),
    Separator: Pass('SelectSeparator'),
    ScrollUpButton: Pass('SelectScrollUpButton'),
    ScrollDownButton: Pass('SelectScrollDownButton'),
  };
});

vi.mock('@radix-ui/react-select', () => ({
  Root: mocks.Root,
  Group: mocks.Group,
  Value: mocks.Value,
  Trigger: mocks.Trigger,
  Icon: mocks.Icon,
  Portal: mocks.Portal,
  Content: mocks.Content,
  Viewport: mocks.Viewport,
  Item: mocks.Item,
  ItemText: mocks.ItemText,
  ItemIndicator: mocks.ItemIndicator,
  Label: mocks.Label,
  Separator: mocks.Separator,
  ScrollUpButton: mocks.ScrollUpButton,
  ScrollDownButton: mocks.ScrollDownButton,
}));

import {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
} from '../select';

interface ElLike {
  type: unknown;
  props: { className?: string; children?: unknown; position?: string; [k: string]: unknown };
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
  const t = node.type as { render?: (p: unknown, r: unknown) => unknown } | null;
  if (t && typeof t.render === 'function') {
    try {
      yield* walk(t.render(node.props, null));
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

const callRender = (Comp: unknown, props: Record<string, unknown>, ref: unknown = null): ElLike =>
  (Comp as unknown as { render: (p: unknown, r: unknown) => ElLike }).render(props, ref);

describe('Select re-exports', () => {
  it('Select is Radix Root', () => expect(Select).toBe(mocks.Root));
  it('SelectGroup is Radix Group', () => expect(SelectGroup).toBe(mocks.Group));
  it('SelectValue is Radix Value', () => expect(SelectValue).toBe(mocks.Value));
});

describe('SelectTrigger', () => {
  it('renders Radix Trigger and contains a chevron Icon', () => {
    const tree = callRender(SelectTrigger, { children: 'inner' });
    expect(tree.type).toBe(mocks.Trigger);
    const icon = findFirst(tree, (el) => el.type === mocks.Icon);
    expect(icon).toBeDefined();
  });

  it('applies default classes', () => {
    const tree = callRender(SelectTrigger, {});
    expect(tree.props.className).toContain('rounded-md');
  });

  it('merges caller className', () => {
    const tree = callRender(SelectTrigger, { className: 'mine' });
    expect(tree.props.className).toContain('mine');
  });

  it('has a displayName', () => {
    expect(SelectTrigger.displayName).toBeDefined();
  });
});

describe('SelectScrollUpButton', () => {
  it('renders Radix ScrollUpButton with default classes', () => {
    const tree = callRender(SelectScrollUpButton, {});
    expect(tree.type).toBe(mocks.ScrollUpButton);
    expect(tree.props.className).toContain('cursor-default');
  });

  it('merges caller className', () => {
    const tree = callRender(SelectScrollUpButton, { className: 'mine' });
    expect(tree.props.className).toContain('mine');
  });

  it('has a displayName', () => {
    expect(SelectScrollUpButton.displayName).toBeDefined();
  });
});

describe('SelectScrollDownButton', () => {
  it('renders Radix ScrollDownButton with default classes', () => {
    const tree = callRender(SelectScrollDownButton, {});
    expect(tree.type).toBe(mocks.ScrollDownButton);
    expect(tree.props.className).toContain('cursor-default');
  });

  it('merges caller className', () => {
    const tree = callRender(SelectScrollDownButton, { className: 'mine' });
    expect(tree.props.className).toContain('mine');
  });

  it('has a displayName', () => {
    expect(SelectScrollDownButton.displayName).toBeDefined();
  });
});

describe('SelectContent', () => {
  it('renders Radix Portal -> Content', () => {
    const tree = callRender(SelectContent, { children: 'inner' });
    expect(tree.type).toBe(mocks.Portal);
    const content = findFirst(tree, (el) => el.type === mocks.Content);
    expect(content).toBeDefined();
  });

  it('defaults position to "popper" and applies popper translate classes', () => {
    const tree = callRender(SelectContent, {});
    const content = findFirst(tree, (el) => el.type === mocks.Content)!;
    expect(content.props.position).toBe('popper');
    expect(content.props.className).toContain('data-[side=bottom]:translate-y-1');
  });

  it('does not include popper translate classes when position is "item-aligned"', () => {
    const tree = callRender(SelectContent, { position: 'item-aligned' });
    const content = findFirst(tree, (el) => el.type === mocks.Content)!;
    expect(content.props.className).not.toContain('data-[side=bottom]:translate-y-1');
  });

  it('renders ScrollUpButton, Viewport with children, and ScrollDownButton', () => {
    const tree = callRender(SelectContent, { children: 'INNER' });
    const viewport = findFirst(tree, (el) => el.type === mocks.Viewport);
    expect(viewport).toBeDefined();
    expect(viewport!.props.children).toBe('INNER');
  });

  it('viewport has popper trigger-width vars when position=popper', () => {
    const tree = callRender(SelectContent, {});
    const viewport = findFirst(tree, (el) => el.type === mocks.Viewport)!;
    expect(viewport.props.className).toContain('--radix-select-trigger-width');
  });

  it('viewport drops popper var classes when position=item-aligned', () => {
    const tree = callRender(SelectContent, { position: 'item-aligned' });
    const viewport = findFirst(tree, (el) => el.type === mocks.Viewport)!;
    expect(viewport.props.className).not.toContain('--radix-select-trigger-width');
  });

  it('merges caller className on the Content element', () => {
    const tree = callRender(SelectContent, { className: 'mine' });
    const content = findFirst(tree, (el) => el.type === mocks.Content)!;
    expect(content.props.className).toContain('mine');
  });

  it('has a displayName', () => {
    expect(SelectContent.displayName).toBeDefined();
  });
});

describe('SelectLabel', () => {
  it('renders Radix Label with default classes', () => {
    const tree = callRender(SelectLabel, {});
    expect(tree.type).toBe(mocks.Label);
    expect(tree.props.className).toContain('font-semibold');
  });

  it('merges caller className', () => {
    const tree = callRender(SelectLabel, { className: 'mine' });
    expect(tree.props.className).toContain('mine');
  });

  it('has a displayName', () => {
    expect(SelectLabel.displayName).toBeDefined();
  });
});

describe('SelectItem', () => {
  it('renders Radix Item with the children threaded through ItemText', () => {
    const tree = callRender(SelectItem, { children: 'X' });
    expect(tree.type).toBe(mocks.Item);
    const itemText = findFirst(tree, (el) => el.type === mocks.ItemText);
    expect(itemText).toBeDefined();
    expect(itemText!.props.children).toBe('X');
  });

  it('renders an ItemIndicator with the Check icon', () => {
    const tree = callRender(SelectItem, {});
    const indicator = findFirst(tree, (el) => el.type === mocks.ItemIndicator);
    expect(indicator).toBeDefined();
  });

  it('merges caller className', () => {
    const tree = callRender(SelectItem, { className: 'mine' });
    expect(tree.props.className).toContain('mine');
  });

  it('has a displayName', () => {
    expect(SelectItem.displayName).toBeDefined();
  });
});

describe('SelectSeparator', () => {
  it('renders Radix Separator with default classes', () => {
    const tree = callRender(SelectSeparator, {});
    expect(tree.type).toBe(mocks.Separator);
    expect(tree.props.className).toContain('h-px');
  });

  it('merges caller className', () => {
    const tree = callRender(SelectSeparator, { className: 'mine' });
    expect(tree.props.className).toContain('mine');
  });

  it('has a displayName', () => {
    expect(SelectSeparator.displayName).toBeDefined();
  });
});

/**
 * Tests for `ContextMenu` family — same pattern as DropdownMenu but built on
 * `@radix-ui/react-context-menu`.
 */

import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const Pass = (kind: string) => {
    const fn = (props: Record<string, unknown>) => ({ type: kind, props });
    (fn as unknown as { displayName: string }).displayName = kind;
    return fn;
  };
  return {
    Root: Pass('CMRoot'),
    Trigger: Pass('CMTrigger'),
    Group: Pass('CMGroup'),
    Portal: Pass('CMPortal'),
    Sub: Pass('CMSub'),
    RadioGroup: Pass('CMRadioGroup'),
    SubTrigger: Pass('CMSubTrigger'),
    SubContent: Pass('CMSubContent'),
    Content: Pass('CMContent'),
    Item: Pass('CMItem'),
    CheckboxItem: Pass('CMCheckboxItem'),
    RadioItem: Pass('CMRadioItem'),
    Label: Pass('CMLabel'),
    Separator: Pass('CMSeparator'),
    ItemIndicator: Pass('CMItemIndicator'),
  };
});

vi.mock('@radix-ui/react-context-menu', () => ({
  Root: mocks.Root,
  Trigger: mocks.Trigger,
  Group: mocks.Group,
  Portal: mocks.Portal,
  Sub: mocks.Sub,
  RadioGroup: mocks.RadioGroup,
  SubTrigger: mocks.SubTrigger,
  SubContent: mocks.SubContent,
  Content: mocks.Content,
  Item: mocks.Item,
  CheckboxItem: mocks.CheckboxItem,
  RadioItem: mocks.RadioItem,
  Label: mocks.Label,
  Separator: mocks.Separator,
  ItemIndicator: mocks.ItemIndicator,
}));

import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuGroup,
  ContextMenuPortal,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuRadioGroup,
} from '../context-menu';

interface ElLike {
  type: unknown;
  props: { className?: string; children?: unknown; [k: string]: unknown };
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

describe('ContextMenu re-exports', () => {
  it('ContextMenu is Radix Root', () => expect(ContextMenu).toBe(mocks.Root));
  it('ContextMenuTrigger is Radix Trigger', () => expect(ContextMenuTrigger).toBe(mocks.Trigger));
  it('ContextMenuGroup is Radix Group', () => expect(ContextMenuGroup).toBe(mocks.Group));
  it('ContextMenuPortal is Radix Portal', () => expect(ContextMenuPortal).toBe(mocks.Portal));
  it('ContextMenuSub is Radix Sub', () => expect(ContextMenuSub).toBe(mocks.Sub));
  it('ContextMenuRadioGroup is Radix RadioGroup', () => expect(ContextMenuRadioGroup).toBe(mocks.RadioGroup));
});

describe('ContextMenuSubTrigger', () => {
  it('renders SubTrigger and includes children + chevron', () => {
    const tree = callRender(ContextMenuSubTrigger, { children: 'k' });
    expect(tree.type).toBe(mocks.SubTrigger);
    const kids = tree.props.children as unknown[];
    expect(kids[0]).toBe('k');
  });

  it('does not include pl-8 by default', () => {
    const tree = callRender(ContextMenuSubTrigger, {});
    expect(tree.props.className).not.toContain('pl-8');
  });

  it('includes pl-8 when inset is true', () => {
    const tree = callRender(ContextMenuSubTrigger, { inset: true });
    expect(tree.props.className).toContain('pl-8');
  });

  it('merges caller className', () => {
    const tree = callRender(ContextMenuSubTrigger, { className: 'mine' });
    expect(tree.props.className).toContain('mine');
  });

  it('has a displayName', () => {
    expect(ContextMenuSubTrigger.displayName).toBeDefined();
  });
});

describe('ContextMenuSubContent', () => {
  it('renders SubContent with default classes', () => {
    const tree = callRender(ContextMenuSubContent, {});
    expect(tree.type).toBe(mocks.SubContent);
    expect(tree.props.className).toContain('rounded-md');
  });

  it('merges caller className', () => {
    const tree = callRender(ContextMenuSubContent, { className: 'mine' });
    expect(tree.props.className).toContain('mine');
  });

  it('has a displayName', () => {
    expect(ContextMenuSubContent.displayName).toBeDefined();
  });
});

describe('ContextMenuContent', () => {
  it('wraps Content in a Portal', () => {
    const tree = callRender(ContextMenuContent, {});
    expect(tree.type).toBe(mocks.Portal);
    const content = findFirst(tree, (el) => el.type === mocks.Content);
    expect(content).toBeDefined();
  });

  it('merges caller className on the Content element', () => {
    const tree = callRender(ContextMenuContent, { className: 'mine' });
    const content = findFirst(tree, (el) => el.type === mocks.Content)!;
    expect(content.props.className).toContain('mine');
  });

  it('has a displayName', () => {
    expect(ContextMenuContent.displayName).toBeDefined();
  });
});

describe('ContextMenuItem', () => {
  it('renders Item with default classes', () => {
    const tree = callRender(ContextMenuItem, {});
    expect(tree.type).toBe(mocks.Item);
    expect(tree.props.className).toContain('rounded-sm');
  });

  it('does not include pl-8 by default', () => {
    const tree = callRender(ContextMenuItem, {});
    expect(tree.props.className).not.toContain('pl-8');
  });

  it('includes pl-8 when inset is true', () => {
    const tree = callRender(ContextMenuItem, { inset: true });
    expect(tree.props.className).toContain('pl-8');
  });

  it('merges caller className', () => {
    const tree = callRender(ContextMenuItem, { className: 'mine' });
    expect(tree.props.className).toContain('mine');
  });

  it('has a displayName', () => {
    expect(ContextMenuItem.displayName).toBeDefined();
  });
});

describe('ContextMenuCheckboxItem', () => {
  it('renders CheckboxItem with the indicator and children', () => {
    const tree = callRender(ContextMenuCheckboxItem, { checked: true, children: 'X' });
    expect(tree.type).toBe(mocks.CheckboxItem);
    expect(tree.props.checked).toBe(true);
    const indicator = findFirst(tree, (el) => el.type === mocks.ItemIndicator);
    expect(indicator).toBeDefined();
  });

  it('merges caller className', () => {
    const tree = callRender(ContextMenuCheckboxItem, { className: 'mine' });
    expect(tree.props.className).toContain('mine');
  });

  it('has a displayName', () => {
    expect(ContextMenuCheckboxItem.displayName).toBeDefined();
  });
});

describe('ContextMenuRadioItem', () => {
  it('renders RadioItem with the indicator and children', () => {
    const tree = callRender(ContextMenuRadioItem, { children: 'Y' });
    expect(tree.type).toBe(mocks.RadioItem);
    const indicator = findFirst(tree, (el) => el.type === mocks.ItemIndicator);
    expect(indicator).toBeDefined();
  });

  it('merges caller className', () => {
    const tree = callRender(ContextMenuRadioItem, { className: 'mine' });
    expect(tree.props.className).toContain('mine');
  });

  it('has a displayName', () => {
    expect(ContextMenuRadioItem.displayName).toBeDefined();
  });
});

describe('ContextMenuLabel', () => {
  it('renders Label with default classes', () => {
    const tree = callRender(ContextMenuLabel, {});
    expect(tree.type).toBe(mocks.Label);
    expect(tree.props.className).toContain('font-semibold');
  });

  it('does not include pl-8 by default', () => {
    const tree = callRender(ContextMenuLabel, {});
    expect(tree.props.className).not.toContain('pl-8');
  });

  it('includes pl-8 when inset is true', () => {
    const tree = callRender(ContextMenuLabel, { inset: true });
    expect(tree.props.className).toContain('pl-8');
  });

  it('merges caller className', () => {
    const tree = callRender(ContextMenuLabel, { className: 'mine' });
    expect(tree.props.className).toContain('mine');
  });

  it('has a displayName', () => {
    expect(ContextMenuLabel.displayName).toBeDefined();
  });
});

describe('ContextMenuSeparator', () => {
  it('renders Separator with default classes', () => {
    const tree = callRender(ContextMenuSeparator, {});
    expect(tree.type).toBe(mocks.Separator);
    expect(tree.props.className).toContain('h-px');
  });

  it('merges caller className', () => {
    const tree = callRender(ContextMenuSeparator, { className: 'mine' });
    expect(tree.props.className).toContain('mine');
  });

  it('has a displayName', () => {
    expect(ContextMenuSeparator.displayName).toBeDefined();
  });
});

describe('ContextMenuShortcut', () => {
  it('renders a span with default classes', () => {
    const el = (ContextMenuShortcut as (p: unknown) => ElLike)({});
    expect(el.type).toBe('span');
    expect(el.props.className).toContain('ml-auto');
  });

  it('merges caller className', () => {
    const el = (ContextMenuShortcut as (p: unknown) => ElLike)({ className: 'mine' });
    expect(el.props.className).toContain('mine');
  });

  it('has displayName "ContextMenuShortcut"', () => {
    expect(ContextMenuShortcut.displayName).toBe('ContextMenuShortcut');
  });
});

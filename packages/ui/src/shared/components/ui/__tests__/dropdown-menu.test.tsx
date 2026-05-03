/**
 * Tests for `DropdownMenu` family — re-exports plus styled forwardRef wrappers
 * around `@radix-ui/react-dropdown-menu` primitives.
 */

import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const Pass = (kind: string) => {
    const fn = (props: Record<string, unknown>) => ({ type: kind, props });
    (fn as unknown as { displayName: string }).displayName = kind;
    return fn;
  };
  return {
    Root: Pass('DDRoot'),
    Trigger: Pass('DDTrigger'),
    Group: Pass('DDGroup'),
    Portal: Pass('DDPortal'),
    Sub: Pass('DDSub'),
    RadioGroup: Pass('DDRadioGroup'),
    SubTrigger: Pass('DDSubTrigger'),
    SubContent: Pass('DDSubContent'),
    Content: Pass('DDContent'),
    Item: Pass('DDItem'),
    CheckboxItem: Pass('DDCheckboxItem'),
    RadioItem: Pass('DDRadioItem'),
    Label: Pass('DDLabel'),
    Separator: Pass('DDSeparator'),
    ItemIndicator: Pass('DDItemIndicator'),
  };
});

vi.mock('@radix-ui/react-dropdown-menu', () => ({
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
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
} from '../dropdown-menu';

interface ElLike {
  type: unknown;
  props: { className?: string; children?: unknown; sideOffset?: number; [k: string]: unknown };
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

describe('DropdownMenu re-exports', () => {
  it('DropdownMenu is Radix Root', () => expect(DropdownMenu).toBe(mocks.Root));
  it('DropdownMenuTrigger is Radix Trigger', () => expect(DropdownMenuTrigger).toBe(mocks.Trigger));
  it('DropdownMenuGroup is Radix Group', () => expect(DropdownMenuGroup).toBe(mocks.Group));
  it('DropdownMenuPortal is Radix Portal', () => expect(DropdownMenuPortal).toBe(mocks.Portal));
  it('DropdownMenuSub is Radix Sub', () => expect(DropdownMenuSub).toBe(mocks.Sub));
  it('DropdownMenuRadioGroup is Radix RadioGroup', () => expect(DropdownMenuRadioGroup).toBe(mocks.RadioGroup));
});

describe('DropdownMenuSubTrigger', () => {
  it('renders Radix SubTrigger and includes the children + chevron', () => {
    const tree = callRender(DropdownMenuSubTrigger, { children: 'kids' });
    expect(tree.type).toBe(mocks.SubTrigger);
    const kids = tree.props.children as unknown[];
    expect(kids[0]).toBe('kids');
  });

  it('does not include pl-8 by default (inset omitted)', () => {
    const tree = callRender(DropdownMenuSubTrigger, {});
    expect(tree.props.className).not.toContain('pl-8');
  });

  it('includes pl-8 when inset is true', () => {
    const tree = callRender(DropdownMenuSubTrigger, { inset: true });
    expect(tree.props.className).toContain('pl-8');
  });

  it('merges caller className', () => {
    const tree = callRender(DropdownMenuSubTrigger, { className: 'mine' });
    expect(tree.props.className).toContain('mine');
  });

  it('has a displayName', () => {
    expect(DropdownMenuSubTrigger.displayName).toBeDefined();
  });
});

describe('DropdownMenuSubContent', () => {
  it('renders Radix SubContent with default classes', () => {
    const tree = callRender(DropdownMenuSubContent, {});
    expect(tree.type).toBe(mocks.SubContent);
    expect(tree.props.className).toContain('rounded-md');
  });

  it('merges caller className', () => {
    const tree = callRender(DropdownMenuSubContent, { className: 'mine' });
    expect(tree.props.className).toContain('mine');
  });

  it('has a displayName', () => {
    expect(DropdownMenuSubContent.displayName).toBeDefined();
  });
});

describe('DropdownMenuContent', () => {
  it('renders inside a Portal', () => {
    const tree = callRender(DropdownMenuContent, {});
    expect(tree.type).toBe(mocks.Portal);
    const content = findFirst(tree, (el) => el.type === mocks.Content);
    expect(content).toBeDefined();
  });

  it('defaults sideOffset to 4', () => {
    const tree = callRender(DropdownMenuContent, {});
    const content = findFirst(tree, (el) => el.type === mocks.Content)!;
    expect(content.props.sideOffset).toBe(4);
  });

  it('accepts an explicit sideOffset', () => {
    const tree = callRender(DropdownMenuContent, { sideOffset: 9 });
    const content = findFirst(tree, (el) => el.type === mocks.Content)!;
    expect(content.props.sideOffset).toBe(9);
  });

  it('merges caller className', () => {
    const tree = callRender(DropdownMenuContent, { className: 'mine' });
    const content = findFirst(tree, (el) => el.type === mocks.Content)!;
    expect(content.props.className).toContain('mine');
  });

  it('has a displayName', () => {
    expect(DropdownMenuContent.displayName).toBeDefined();
  });
});

describe('DropdownMenuItem', () => {
  it('renders Radix Item with default classes', () => {
    const tree = callRender(DropdownMenuItem, {});
    expect(tree.type).toBe(mocks.Item);
    expect(tree.props.className).toContain('rounded-sm');
  });

  it('does not include pl-8 by default (inset omitted)', () => {
    const tree = callRender(DropdownMenuItem, {});
    expect(tree.props.className).not.toContain('pl-8');
  });

  it('includes pl-8 when inset is true', () => {
    const tree = callRender(DropdownMenuItem, { inset: true });
    expect(tree.props.className).toContain('pl-8');
  });

  it('merges caller className', () => {
    const tree = callRender(DropdownMenuItem, { className: 'mine' });
    expect(tree.props.className).toContain('mine');
  });

  it('has a displayName', () => {
    expect(DropdownMenuItem.displayName).toBeDefined();
  });
});

describe('DropdownMenuCheckboxItem', () => {
  it('renders Radix CheckboxItem with the indicator and children', () => {
    const tree = callRender(DropdownMenuCheckboxItem, { checked: true, children: 'X' });
    expect(tree.type).toBe(mocks.CheckboxItem);
    expect(tree.props.checked).toBe(true);
    const indicator = findFirst(tree, (el) => el.type === mocks.ItemIndicator);
    expect(indicator).toBeDefined();
  });

  it('merges caller className', () => {
    const tree = callRender(DropdownMenuCheckboxItem, { className: 'mine' });
    expect(tree.props.className).toContain('mine');
  });

  it('has a displayName', () => {
    expect(DropdownMenuCheckboxItem.displayName).toBeDefined();
  });
});

describe('DropdownMenuRadioItem', () => {
  it('renders Radix RadioItem with the indicator and children', () => {
    const tree = callRender(DropdownMenuRadioItem, { children: 'Y' });
    expect(tree.type).toBe(mocks.RadioItem);
    const indicator = findFirst(tree, (el) => el.type === mocks.ItemIndicator);
    expect(indicator).toBeDefined();
  });

  it('merges caller className', () => {
    const tree = callRender(DropdownMenuRadioItem, { className: 'mine' });
    expect(tree.props.className).toContain('mine');
  });

  it('has a displayName', () => {
    expect(DropdownMenuRadioItem.displayName).toBeDefined();
  });
});

describe('DropdownMenuLabel', () => {
  it('renders Radix Label with default classes', () => {
    const tree = callRender(DropdownMenuLabel, {});
    expect(tree.type).toBe(mocks.Label);
    expect(tree.props.className).toContain('font-semibold');
  });

  it('does not include pl-8 by default', () => {
    const tree = callRender(DropdownMenuLabel, {});
    expect(tree.props.className).not.toContain('pl-8');
  });

  it('includes pl-8 when inset is true', () => {
    const tree = callRender(DropdownMenuLabel, { inset: true });
    expect(tree.props.className).toContain('pl-8');
  });

  it('merges caller className', () => {
    const tree = callRender(DropdownMenuLabel, { className: 'mine' });
    expect(tree.props.className).toContain('mine');
  });

  it('has a displayName', () => {
    expect(DropdownMenuLabel.displayName).toBeDefined();
  });
});

describe('DropdownMenuSeparator', () => {
  it('renders Radix Separator with default classes', () => {
    const tree = callRender(DropdownMenuSeparator, {});
    expect(tree.type).toBe(mocks.Separator);
    expect(tree.props.className).toContain('h-px');
  });

  it('merges caller className', () => {
    const tree = callRender(DropdownMenuSeparator, { className: 'mine' });
    expect(tree.props.className).toContain('mine');
  });

  it('has a displayName', () => {
    expect(DropdownMenuSeparator.displayName).toBeDefined();
  });
});

describe('DropdownMenuShortcut', () => {
  it('renders a span with default classes', () => {
    const el = (DropdownMenuShortcut as (p: unknown) => ElLike)({});
    expect(el.type).toBe('span');
    expect(el.props.className).toContain('ml-auto');
  });

  it('merges caller className', () => {
    const el = (DropdownMenuShortcut as (p: unknown) => ElLike)({ className: 'mine' });
    expect(el.props.className).toContain('mine');
  });

  it('has displayName "DropdownMenuShortcut"', () => {
    expect(DropdownMenuShortcut.displayName).toBe('DropdownMenuShortcut');
  });
});

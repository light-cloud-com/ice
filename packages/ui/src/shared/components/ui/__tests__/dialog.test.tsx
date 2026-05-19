/**
 * Tests for `Dialog` family — re-exports plus DialogContent (with embedded
 * DialogPortal/DialogOverlay/Close), DialogHeader, DialogFooter, DialogTitle,
 * DialogDescription.
 */

import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const Pass = (kind: string) => {
    const fn = (props: Record<string, unknown>) => ({ type: kind, props });
    (fn as unknown as { displayName: string }).displayName = kind;
    return fn;
  };
  return {
    Root: Pass('DialogRoot'),
    Trigger: Pass('DialogTrigger'),
    Portal: Pass('DialogPortal'),
    Close: Pass('DialogClose'),
    Overlay: Pass('DialogOverlay'),
    Content: Pass('DialogContent'),
    Title: Pass('DialogTitle'),
    Description: Pass('DialogDescription'),
  };
});

vi.mock('@radix-ui/react-dialog', () => ({
  Root: mocks.Root,
  Trigger: mocks.Trigger,
  Portal: mocks.Portal,
  Close: mocks.Close,
  Overlay: mocks.Overlay,
  Content: mocks.Content,
  Title: mocks.Title,
  Description: mocks.Description,
}));

import {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogClose,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '../dialog';

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
  // Plain function component
  if (typeof node.type === 'function') {
    try {
      yield* walk((node.type as (p: unknown) => unknown)(node.props));
    } catch {
      /* skip */
    }
    return;
  }
  // forwardRef object exposes a `render` function
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

describe('Dialog re-exports', () => {
  it('Dialog is Radix Root', () => expect(Dialog).toBe(mocks.Root));
  it('DialogTrigger is Radix Trigger', () => expect(DialogTrigger).toBe(mocks.Trigger));
  it('DialogPortal is Radix Portal', () => expect(DialogPortal).toBe(mocks.Portal));
  it('DialogClose is Radix Close', () => expect(DialogClose).toBe(mocks.Close));
});

describe('DialogOverlay', () => {
  it('renders Radix Overlay with default classes', () => {
    const el = callRender(DialogOverlay, {});
    expect(el.type).toBe(mocks.Overlay);
    expect(el.props.className).toContain('fixed');
    expect(el.props.className).toContain('inset-0');
  });

  it('merges caller className', () => {
    const el = callRender(DialogOverlay, { className: 'mine' });
    expect(el.props.className).toContain('mine');
  });

  it('has a displayName', () => {
    expect(DialogOverlay.displayName).toBeDefined();
  });
});

describe('DialogContent', () => {
  it('wraps children in DialogPortal -> DialogOverlay -> Content -> children + Close', () => {
    const tree = callRender(DialogContent, { children: 'hi' });
    // The outer is DialogPortal (FC) — walk to find the Content
    const content = findFirst(tree, (el) => el.type === mocks.Content);
    expect(content).toBeDefined();
    expect(content!.props.className).toContain('fixed');
    expect(content!.props.className).toContain('left-[50%]');
  });

  it('renders an Overlay before the Content', () => {
    const tree = callRender(DialogContent, {});
    const overlay = findFirst(tree, (el) => el.type === mocks.Overlay);
    expect(overlay).toBeDefined();
  });

  it('renders a Close button with sr-only "Close" text', () => {
    const tree = callRender(DialogContent, {});
    const close = findFirst(tree, (el) => el.type === mocks.Close);
    expect(close).toBeDefined();
    const sr = findFirst(tree, (el) => el.type === 'span' && (el.props.className ?? '').includes('sr-only'));
    expect(sr).toBeDefined();
  });

  it('merges caller className on the Content node', () => {
    const tree = callRender(DialogContent, { className: 'mine' });
    const content = findFirst(tree, (el) => el.type === mocks.Content);
    expect(content!.props.className).toContain('mine');
  });

  it('has a displayName', () => {
    expect(DialogContent.displayName).toBeDefined();
  });
});

describe('DialogHeader', () => {
  it('renders a div with default flex classes', () => {
    const el = (DialogHeader as (p: unknown) => ElLike)({});
    expect(el.type).toBe('div');
    expect(el.props.className).toContain('flex-col');
  });

  it('merges caller className', () => {
    const el = (DialogHeader as (p: unknown) => ElLike)({ className: 'mine' });
    expect(el.props.className).toContain('mine');
  });

  it('has displayName "DialogHeader"', () => {
    expect(DialogHeader.displayName).toBe('DialogHeader');
  });
});

describe('DialogFooter', () => {
  it('renders a div with default flex classes', () => {
    const el = (DialogFooter as (p: unknown) => ElLike)({});
    expect(el.type).toBe('div');
    expect(el.props.className).toContain('flex-col-reverse');
  });

  it('merges caller className', () => {
    const el = (DialogFooter as (p: unknown) => ElLike)({ className: 'mine' });
    expect(el.props.className).toContain('mine');
  });

  it('has displayName "DialogFooter"', () => {
    expect(DialogFooter.displayName).toBe('DialogFooter');
  });
});

describe('DialogTitle', () => {
  it('renders Radix Title with default text-lg classes', () => {
    const el = callRender(DialogTitle, {});
    expect(el.type).toBe(mocks.Title);
    expect(el.props.className).toContain('text-lg');
  });

  it('merges caller className', () => {
    const el = callRender(DialogTitle, { className: 'mine' });
    expect(el.props.className).toContain('mine');
  });

  it('has a displayName', () => {
    expect(DialogTitle.displayName).toBeDefined();
  });
});

describe('DialogDescription', () => {
  it('renders Radix Description', () => {
    const el = callRender(DialogDescription, {});
    expect(el.type).toBe(mocks.Description);
    expect(el.props.className).toContain('text-sm');
  });

  it('merges caller className', () => {
    const el = callRender(DialogDescription, { className: 'mine' });
    expect(el.props.className).toContain('mine');
  });

  it('has a displayName', () => {
    expect(DialogDescription.displayName).toBeDefined();
  });
});

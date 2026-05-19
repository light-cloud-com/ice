/**
 * Tests for `Popover` re-exports + `PopoverContent` forwardRef.
 */

import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const Pass = (kind: string) => {
    const fn = (props: Record<string, unknown>) => ({ type: kind, props });
    (fn as unknown as { displayName: string }).displayName = kind;
    return fn;
  };
  return {
    Root: Pass('PopoverRoot'),
    Trigger: Pass('PopoverTrigger'),
    Anchor: Pass('PopoverAnchor'),
    Portal: Pass('PopoverPortal'),
    Content: Pass('PopoverContent'),
  };
});

vi.mock('@radix-ui/react-popover', () => ({
  Root: mocks.Root,
  Trigger: mocks.Trigger,
  Anchor: mocks.Anchor,
  Portal: mocks.Portal,
  Content: mocks.Content,
}));

import { Popover, PopoverTrigger, PopoverAnchor, PopoverPortal, PopoverContent } from '../popover';

interface ElLike {
  type: unknown;
  props: { className?: string; align?: string; sideOffset?: number; children?: unknown; [k: string]: unknown };
}

const callRender = (Comp: unknown, props: Record<string, unknown>, ref: unknown = null): ElLike =>
  (Comp as unknown as { render: (p: unknown, r: unknown) => ElLike }).render(props, ref);

describe('Popover re-exports', () => {
  it('Popover is Radix Root', () => {
    expect(Popover).toBe(mocks.Root);
  });

  it('PopoverTrigger is Radix Trigger', () => {
    expect(PopoverTrigger).toBe(mocks.Trigger);
  });

  it('PopoverAnchor is Radix Anchor', () => {
    expect(PopoverAnchor).toBe(mocks.Anchor);
  });

  it('PopoverPortal is Radix Portal', () => {
    expect(PopoverPortal).toBe(mocks.Portal);
  });

  it('Popover has a displayName', () => {
    expect((Popover as unknown as { displayName: string }).displayName).toBeDefined();
  });

  it('PopoverTrigger has a displayName', () => {
    expect((PopoverTrigger as unknown as { displayName: string }).displayName).toBeDefined();
  });

  it('PopoverAnchor has a displayName', () => {
    expect((PopoverAnchor as unknown as { displayName: string }).displayName).toBeDefined();
  });

  it('PopoverPortal has a displayName', () => {
    expect((PopoverPortal as unknown as { displayName: string }).displayName).toBeDefined();
  });
});

describe('PopoverContent', () => {
  it('renders the Radix Content primitive', () => {
    const el = callRender(PopoverContent, {});
    expect(el.type).toBe(mocks.Content);
  });

  it('defaults align to "center"', () => {
    const el = callRender(PopoverContent, {});
    expect(el.props.align).toBe('center');
  });

  it('respects an explicit align', () => {
    const el = callRender(PopoverContent, { align: 'start' });
    expect(el.props.align).toBe('start');
  });

  it('defaults sideOffset to 6', () => {
    const el = callRender(PopoverContent, {});
    expect(el.props.sideOffset).toBe(6);
  });

  it('respects an explicit sideOffset', () => {
    const el = callRender(PopoverContent, { sideOffset: 12 });
    expect(el.props.sideOffset).toBe(12);
  });

  it('applies ICE token styling classes', () => {
    const el = callRender(PopoverContent, {});
    expect(el.props.className).toContain('bg-ice-raised');
    expect(el.props.className).toContain('border-ice-border');
    expect(el.props.className).toContain('text-ice-text-1');
    expect(el.props.className).toContain('shadow-lg');
    expect(el.props.className).toContain('rounded-md');
  });

  it('applies open/close animation classes', () => {
    const el = callRender(PopoverContent, {});
    expect(el.props.className).toContain('data-[state=open]:animate-in');
    expect(el.props.className).toContain('data-[state=closed]:animate-out');
    expect(el.props.className).toContain('data-[state=open]:fade-in-0');
    expect(el.props.className).toContain('data-[state=closed]:fade-out-0');
  });

  it('applies side-aware slide-in classes', () => {
    const el = callRender(PopoverContent, {});
    expect(el.props.className).toContain('data-[side=bottom]:slide-in-from-top-1');
    expect(el.props.className).toContain('data-[side=top]:slide-in-from-bottom-1');
    expect(el.props.className).toContain('data-[side=left]:slide-in-from-right-1');
    expect(el.props.className).toContain('data-[side=right]:slide-in-from-left-1');
  });

  it('merges caller className via cn()', () => {
    const el = callRender(PopoverContent, { className: 'mine extra' });
    expect(el.props.className).toContain('mine');
    expect(el.props.className).toContain('extra');
    // Default tokens still present after merge.
    expect(el.props.className).toContain('bg-ice-raised');
  });

  it('is a forwardRef component (exposes render fn)', () => {
    expect(typeof (PopoverContent as unknown as { render: unknown }).render).toBe('function');
    expect((PopoverContent as unknown as { $$typeof: symbol }).$$typeof.toString()).toContain('react.forward_ref');
  });

  it('passes through arbitrary props (side, children)', () => {
    const el = callRender(PopoverContent, { side: 'top', children: 'hello' });
    expect(el.props.side).toBe('top');
    expect(el.props.children).toBe('hello');
  });

  it('has a displayName matching the Radix Content primitive', () => {
    expect(PopoverContent.displayName).toBe((mocks.Content as unknown as { displayName: string }).displayName);
  });
});

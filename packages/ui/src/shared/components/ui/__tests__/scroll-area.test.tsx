/**
 * Tests for `ScrollArea` and `ScrollBar` — wrap `@radix-ui/react-scroll-area`.
 */

import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const Pass = (kind: string) => {
    const fn = (props: Record<string, unknown>) => ({ type: kind, props });
    (fn as unknown as { displayName: string }).displayName = kind;
    return fn;
  };
  return {
    Root: Pass('Root'),
    Viewport: Pass('Viewport'),
    Corner: Pass('Corner'),
    ScrollAreaScrollbar: Pass('Scrollbar'),
    ScrollAreaThumb: Pass('Thumb'),
  };
});

vi.mock('@radix-ui/react-scroll-area', () => ({
  Root: mocks.Root,
  Viewport: mocks.Viewport,
  Corner: mocks.Corner,
  ScrollAreaScrollbar: mocks.ScrollAreaScrollbar,
  ScrollAreaThumb: mocks.ScrollAreaThumb,
}));

import { ScrollArea, ScrollBar } from '../scroll-area';

interface ElLike {
  type: unknown;
  props: { className?: string; children?: unknown; [k: string]: unknown };
}

const callRender = (Comp: unknown, props: Record<string, unknown>, ref: unknown = null): ElLike =>
  (Comp as unknown as { render: (p: unknown, r: unknown) => ElLike }).render(props, ref);

describe('ScrollArea', () => {
  it('renders Radix Root with default classes', () => {
    const el = callRender(ScrollArea, { children: 'hello' });
    expect(el.type).toBe(mocks.Root);
    expect(el.props.className).toContain('relative');
    expect(el.props.className).toContain('overflow-hidden');
  });

  it('merges caller className with defaults', () => {
    const el = callRender(ScrollArea, { className: 'mine' });
    expect(el.props.className).toContain('mine');
  });

  it('contains a Viewport with rounded inheritance class and the children', () => {
    const el = callRender(ScrollArea, { children: 'INSIDE' });
    const kids = el.props.children as ElLike[];
    const viewport = kids.find((k) => k.type === mocks.Viewport)!;
    expect(viewport).toBeDefined();
    expect(viewport.props.className).toContain('rounded-[inherit]');
    expect(viewport.props.children).toBe('INSIDE');
  });

  it('renders a ScrollBar and a Corner', () => {
    const el = callRender(ScrollArea, {});
    const kids = el.props.children as ElLike[];
    const corner = kids.find((k) => k.type === mocks.Corner);
    expect(corner).toBeDefined();
  });

  it('runs without throwing when a ref is supplied', () => {
    const ref = { current: null };
    const el = callRender(ScrollArea, {}, ref);
    expect(el.type).toBe(mocks.Root);
  });

  it('has a displayName', () => {
    expect(ScrollArea.displayName).toBeDefined();
  });
});

describe('ScrollBar', () => {
  it('renders Radix ScrollAreaScrollbar', () => {
    const el = callRender(ScrollBar, {});
    expect(el.type).toBe(mocks.ScrollAreaScrollbar);
  });

  it('defaults to vertical orientation', () => {
    const el = callRender(ScrollBar, {});
    expect(el.props.orientation).toBe('vertical');
    expect(el.props.className).toContain('h-full');
    expect(el.props.className).toContain('w-2.5');
  });

  it('uses horizontal classes when orientation is horizontal', () => {
    const el = callRender(ScrollBar, { orientation: 'horizontal' });
    expect(el.props.orientation).toBe('horizontal');
    expect(el.props.className).toContain('h-2.5');
    expect(el.props.className).toContain('flex-col');
  });

  it('contains a Thumb child', () => {
    const el = callRender(ScrollBar, {});
    const thumb = el.props.children as ElLike;
    expect(thumb.type).toBe(mocks.ScrollAreaThumb);
    expect(thumb.props.className).toContain('rounded-full');
  });

  it('merges caller className', () => {
    const el = callRender(ScrollBar, { className: 'mine' });
    expect(el.props.className).toContain('mine');
  });

  it('has a displayName', () => {
    expect(ScrollBar.displayName).toBeDefined();
  });
});

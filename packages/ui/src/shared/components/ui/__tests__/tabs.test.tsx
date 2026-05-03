/**
 * Tests for `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`.
 */

import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const Pass = (kind: string) => {
    const fn = (props: Record<string, unknown>) => ({ type: kind, props });
    (fn as unknown as { displayName: string }).displayName = kind;
    return fn;
  };
  return {
    Root: Pass('TabsRoot'),
    List: Pass('TabsList'),
    Trigger: Pass('TabsTrigger'),
    Content: Pass('TabsContent'),
  };
});

vi.mock('@radix-ui/react-tabs', () => ({
  Root: mocks.Root,
  List: mocks.List,
  Trigger: mocks.Trigger,
  Content: mocks.Content,
}));

import { Tabs, TabsList, TabsTrigger, TabsContent } from '../tabs';

interface ElLike {
  type: unknown;
  props: { className?: string; [k: string]: unknown };
}

const callRender = (Comp: unknown, props: Record<string, unknown>, ref: unknown = null): ElLike =>
  (Comp as unknown as { render: (p: unknown, r: unknown) => ElLike }).render(props, ref);

describe('Tabs', () => {
  it('Tabs is the Radix Root primitive', () => {
    expect(Tabs).toBe(mocks.Root);
  });
});

describe('TabsList', () => {
  it('renders Radix List with default classes', () => {
    const el = callRender(TabsList, {});
    expect(el.type).toBe(mocks.List);
    expect(el.props.className).toContain('rounded-md');
  });

  it('merges caller className', () => {
    const el = callRender(TabsList, { className: 'mine' });
    expect(el.props.className).toContain('mine');
  });

  it('has a displayName', () => {
    expect(TabsList.displayName).toBeDefined();
  });
});

describe('TabsTrigger', () => {
  it('renders Radix Trigger', () => {
    const el = callRender(TabsTrigger, {});
    expect(el.type).toBe(mocks.Trigger);
  });

  it('applies the active-state classes through cn merging', () => {
    const el = callRender(TabsTrigger, {});
    expect(el.props.className).toContain('data-[state=active]:bg-ice-raised');
  });

  it('merges caller className', () => {
    const el = callRender(TabsTrigger, { className: 'mine' });
    expect(el.props.className).toContain('mine');
  });

  it('has a displayName', () => {
    expect(TabsTrigger.displayName).toBeDefined();
  });
});

describe('TabsContent', () => {
  it('renders Radix Content with default classes', () => {
    const el = callRender(TabsContent, {});
    expect(el.type).toBe(mocks.Content);
    expect(el.props.className).toContain('mt-2');
  });

  it('merges caller className', () => {
    const el = callRender(TabsContent, { className: 'mine' });
    expect(el.props.className).toContain('mine');
  });

  it('has a displayName', () => {
    expect(TabsContent.displayName).toBeDefined();
  });
});

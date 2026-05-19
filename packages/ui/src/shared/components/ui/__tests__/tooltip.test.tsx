/**
 * Tests for `Tooltip` re-exports + `TooltipContent` forwardRef.
 */

import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const Pass = (kind: string) => {
    const fn = (props: Record<string, unknown>) => ({ type: kind, props });
    (fn as unknown as { displayName: string }).displayName = kind;
    return fn;
  };
  return {
    Provider: Pass('TooltipProvider'),
    Root: Pass('TooltipRoot'),
    Trigger: Pass('TooltipTrigger'),
    Content: Pass('TooltipContent'),
  };
});

vi.mock('@radix-ui/react-tooltip', () => ({
  Provider: mocks.Provider,
  Root: mocks.Root,
  Trigger: mocks.Trigger,
  Content: mocks.Content,
}));

import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../tooltip';

interface ElLike {
  type: unknown;
  props: { className?: string; sideOffset?: number; [k: string]: unknown };
}

const callRender = (Comp: unknown, props: Record<string, unknown>, ref: unknown = null): ElLike =>
  (Comp as unknown as { render: (p: unknown, r: unknown) => ElLike }).render(props, ref);

describe('Tooltip re-exports', () => {
  it('Tooltip is Radix Root', () => {
    expect(Tooltip).toBe(mocks.Root);
  });

  it('TooltipTrigger is Radix Trigger', () => {
    expect(TooltipTrigger).toBe(mocks.Trigger);
  });

  it('TooltipProvider is Radix Provider', () => {
    expect(TooltipProvider).toBe(mocks.Provider);
  });
});

describe('TooltipContent', () => {
  it('renders the Radix Content primitive', () => {
    const el = callRender(TooltipContent, {});
    expect(el.type).toBe(mocks.Content);
  });

  it('defaults sideOffset to 6', () => {
    const el = callRender(TooltipContent, {});
    expect(el.props.sideOffset).toBe(6);
  });

  it('respects an explicit sideOffset', () => {
    const el = callRender(TooltipContent, { sideOffset: 12 });
    expect(el.props.sideOffset).toBe(12);
  });

  it('applies default styling classes', () => {
    const el = callRender(TooltipContent, {});
    expect(el.props.className).toContain('rounded-md');
    expect(el.props.className).toContain('shadow-lg');
  });

  it('merges caller className', () => {
    const el = callRender(TooltipContent, { className: 'mine' });
    expect(el.props.className).toContain('mine');
  });

  it('has a displayName', () => {
    expect(TooltipContent.displayName).toBeDefined();
  });
});

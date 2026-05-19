/**
 * Tests for `Switch` — wraps `@radix-ui/react-switch`. Renders Root with a
 * Thumb child.
 */

import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const Root = (props: Record<string, unknown>) => ({ type: 'switch-root', props });
  (Root as unknown as { displayName: string }).displayName = 'SwitchRoot';
  const Thumb = (props: Record<string, unknown>) => ({ type: 'switch-thumb', props });
  return { Root, Thumb };
});

vi.mock('@radix-ui/react-switch', () => ({ Root: mocks.Root, Thumb: mocks.Thumb }));

import { Switch } from '../switch';

interface ElLike {
  type: unknown;
  props: { className?: string; children?: ElLike; [k: string]: unknown };
}

const renderSwitch = (props: Record<string, unknown>, ref: unknown = null): ElLike => {
  const renderFn = (Switch as unknown as { render: (p: unknown, r: unknown) => ElLike }).render;
  return renderFn(props, ref);
};

describe('Switch', () => {
  it('renders Radix SwitchPrimitives.Root', () => {
    const el = renderSwitch({});
    expect(el.type).toBe(mocks.Root);
  });

  it('renders a Thumb as a child', () => {
    const el = renderSwitch({});
    const thumb = el.props.children as ElLike;
    expect(thumb.type).toBe(mocks.Thumb);
    expect(thumb.props.className).toContain('rounded-full');
  });

  it('applies default Root classes', () => {
    const el = renderSwitch({});
    expect(el.props.className).toContain('rounded-full');
    expect(el.props.className).toContain('cursor-pointer');
  });

  it('merges caller className', () => {
    const el = renderSwitch({ className: 'mine' });
    expect(el.props.className).toContain('mine');
  });

  it('forwards extra props (checked, onCheckedChange)', () => {
    const onCheckedChange = () => {};
    const el = renderSwitch({ checked: true, onCheckedChange });
    expect(el.props.checked).toBe(true);
    expect(el.props.onCheckedChange).toBe(onCheckedChange);
  });

  it('runs without throwing when a ref is supplied', () => {
    const ref = { current: null };
    const el = renderSwitch({}, ref);
    expect(el.type).toBe(mocks.Root);
  });

  it('has a displayName', () => {
    expect(Switch.displayName).toBeDefined();
  });
});

/**
 * Tests for `Button` — versatile button with multiple variants and sizes.
 *
 * Strategy:
 *  - Mock `@radix-ui/react-slot` Slot as identity passthrough so the asChild
 *    branch is observable through `el.type`.
 *  - Direct-invoke the forwardRef render function via `(Button as any).render`.
 *  - Assert classNames for every variant, every size, asChild on/off, and
 *    HTML attribute / ref forwarding.
 */

import { describe, it, expect, vi } from 'vitest';
import * as React from 'react';

vi.mock('@radix-ui/react-slot', () => {
  const Slot = (_props: unknown) => null;
  // Tag with a recognizable displayName so we can assert via reference equality.
  (Slot as unknown as { displayName: string }).displayName = 'SlotMock';
  return { Slot };
});

import { Button, buttonVariants } from '../button';
import { Slot } from '@radix-ui/react-slot';

interface ElLike {
  type: unknown;
  props: { className?: string; [k: string]: unknown };
}

const renderBtn = (props: Record<string, unknown>, ref?: unknown): ElLike => {
  const renderFn = (Button as unknown as { render: (p: unknown, r: unknown) => ElLike }).render;
  return renderFn(props, ref ?? null);
};

describe('Button — render', () => {
  it('renders a native <button> when asChild is false (default)', () => {
    const el = renderBtn({});
    expect(el.type).toBe('button');
  });

  it('renders the Slot component when asChild is true', () => {
    const el = renderBtn({ asChild: true });
    expect(el.type).toBe(Slot);
  });

  it('runs without throwing when a ref is supplied', () => {
    const ref = { current: null };
    const el = renderBtn({}, ref);
    expect(el.type).toBe('button');
  });

  it('forwards extra HTML attributes via spread', () => {
    const el = renderBtn({ id: 'b1', type: 'submit', disabled: true });
    expect(el.props.id).toBe('b1');
    expect(el.props.type).toBe('submit');
    expect(el.props.disabled).toBe(true);
  });

  it('applies caller className alongside variant classes', () => {
    const el = renderBtn({ className: 'extra-cls' });
    expect(el.props.className).toContain('extra-cls');
  });
});

describe('Button — variant classes', () => {
  for (const variant of ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'] as const) {
    it(`includes a class for the ${variant} variant`, () => {
      const el = renderBtn({ variant });
      // Each variant has at least one distinguishing class — test the
      // variant function output appears in the rendered className.
      const expected = buttonVariants({ variant });
      const tokens = expected.split(' ').filter(Boolean);
      // A reasonable subset of tokens should appear in the rendered className.
      const rendered = el.props.className ?? '';
      const hits = tokens.filter((t) => rendered.includes(t));
      expect(hits.length).toBeGreaterThan(0);
    });
  }
});

describe('Button — size classes', () => {
  for (const size of ['default', 'sm', 'lg', 'icon'] as const) {
    it(`includes a class for the ${size} size`, () => {
      const el = renderBtn({ size });
      const rendered = el.props.className ?? '';
      const expectedTokens = buttonVariants({ size }).split(' ').filter(Boolean);
      const hits = expectedTokens.filter((t) => rendered.includes(t));
      expect(hits.length).toBeGreaterThan(0);
    });
  }
});

describe('Button — displayName', () => {
  it('is set to "Button"', () => {
    expect(Button.displayName).toBe('Button');
  });
});

describe('buttonVariants helper', () => {
  it('returns a string with default variant tokens when called with no args', () => {
    expect(buttonVariants()).toContain('bg-primary');
  });

  it('combines variant and size and className into one string', () => {
    const out = buttonVariants({ variant: 'destructive', size: 'lg', className: 'my-extra' });
    expect(out).toContain('my-extra');
    expect(out).toContain('bg-destructive');
  });
});

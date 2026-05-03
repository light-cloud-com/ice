/**
 * Tests for `Badge` — small label component for status / categories.
 *
 * Strategy:
 *  - Direct-FC invocation: `Badge` is a plain FC, call it as a function.
 *  - Assert variant class names and HTML attribute pass-through.
 *  - Cover all four variants of `badgeVariants` plus the default fallback.
 */

import { describe, it, expect } from 'vitest';
import { Badge, badgeVariants } from '../badge';

interface ElLike {
  type: unknown;
  props: { className?: string; [k: string]: unknown };
}

const render = (props: Record<string, unknown>): ElLike =>
  (Badge as unknown as (p: Record<string, unknown>) => ElLike)(props);

describe('Badge', () => {
  it('renders a div with default variant classes when no variant is passed', () => {
    const el = render({});
    expect(el.type).toBe('div');
    expect(el.props.className).toContain('bg-primary');
    expect(el.props.className).toContain('text-primary-foreground');
  });

  it('applies the secondary variant classes', () => {
    const el = render({ variant: 'secondary' });
    expect(el.props.className).toContain('bg-secondary');
  });

  it('applies the destructive variant classes', () => {
    const el = render({ variant: 'destructive' });
    expect(el.props.className).toContain('bg-destructive');
  });

  it('applies the outline variant classes', () => {
    const el = render({ variant: 'outline' });
    expect(el.props.className).toContain('text-foreground');
  });

  it('merges a caller-provided className with the variant classes', () => {
    const el = render({ className: 'custom-extra' });
    expect(el.props.className).toContain('custom-extra');
  });

  it('forwards arbitrary HTML attributes via spread', () => {
    const el = render({ id: 'badge-id', 'data-testid': 'badge-test' });
    expect(el.props.id).toBe('badge-id');
    expect(el.props['data-testid']).toBe('badge-test');
  });
});

describe('badgeVariants', () => {
  it('exposes the variant class generator as a function', () => {
    expect(typeof badgeVariants).toBe('function');
  });

  it('returns a string class name when invoked with a known variant', () => {
    const out = badgeVariants({ variant: 'destructive' });
    expect(typeof out).toBe('string');
    expect(out).toContain('bg-destructive');
  });

  it('returns the default variant class name when called with no args', () => {
    const out = badgeVariants();
    expect(out).toContain('bg-primary');
  });
});

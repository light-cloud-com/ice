/**
 * Tests for `Label` — wraps `@radix-ui/react-label` with default styling.
 */

import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const Pass = (props: Record<string, unknown>) => ({ type: 'div', props });
  (Pass as unknown as { displayName: string }).displayName = 'LabelRoot';
  return { Pass };
});

vi.mock('@radix-ui/react-label', () => ({ Root: mocks.Pass }));

import { Label } from '../label';

interface ElLike {
  type: unknown;
  props: { className?: string; [k: string]: unknown };
}

const renderLabel = (props: Record<string, unknown>, ref: unknown = null): ElLike => {
  const renderFn = (Label as unknown as { render: (p: unknown, r: unknown) => ElLike }).render;
  return renderFn(props, ref);
};

describe('Label', () => {
  it('renders the Radix Label.Root primitive', () => {
    const el = renderLabel({});
    expect(el.type).toBe(mocks.Pass);
  });

  it('applies the default labelVariants className', () => {
    const el = renderLabel({});
    expect(el.props.className).toContain('font-medium');
  });

  it('merges caller className with the default classes', () => {
    const el = renderLabel({ className: 'extra-cls' });
    expect(el.props.className).toContain('extra-cls');
    expect(el.props.className).toContain('font-medium');
  });

  it('forwards htmlFor via spread', () => {
    const el = renderLabel({ htmlFor: 'fld' });
    expect(el.props.htmlFor).toBe('fld');
  });

  it('runs without throwing when a ref is supplied', () => {
    const ref = { current: null };
    const el = renderLabel({}, ref);
    expect(el.type).toBe(mocks.Pass);
  });

  it('inherits a displayName from the Radix primitive', () => {
    expect(Label.displayName).toBeDefined();
  });
});

/**
 * Tests for `Separator` — wraps `@radix-ui/react-separator`.
 */

import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const Pass = (props: Record<string, unknown>) => ({ type: 'div', props });
  (Pass as unknown as { displayName: string }).displayName = 'SeparatorRoot';
  return { Pass };
});

vi.mock('@radix-ui/react-separator', () => ({ Root: mocks.Pass }));

import { Separator } from '../separator';

interface ElLike {
  type: unknown;
  props: { className?: string; orientation?: string; decorative?: boolean; [k: string]: unknown };
}

const renderSep = (props: Record<string, unknown>, ref: unknown = null): ElLike => {
  const renderFn = (Separator as unknown as { render: (p: unknown, r: unknown) => ElLike }).render;
  return renderFn(props, ref);
};

describe('Separator', () => {
  it('renders the Radix Separator.Root primitive', () => {
    const el = renderSep({});
    expect(el.type).toBe(mocks.Pass);
  });

  it('uses horizontal orientation by default with horizontal classes', () => {
    const el = renderSep({});
    expect(el.props.orientation).toBe('horizontal');
    expect(el.props.className).toContain('h-[1px]');
    expect(el.props.className).toContain('w-full');
  });

  it('uses vertical classes when orientation is vertical', () => {
    const el = renderSep({ orientation: 'vertical' });
    expect(el.props.orientation).toBe('vertical');
    expect(el.props.className).toContain('h-full');
    expect(el.props.className).toContain('w-[1px]');
  });

  it('decorative defaults to true', () => {
    const el = renderSep({});
    expect(el.props.decorative).toBe(true);
  });

  it('decorative can be overridden', () => {
    const el = renderSep({ decorative: false });
    expect(el.props.decorative).toBe(false);
  });

  it('merges caller className with the defaults', () => {
    const el = renderSep({ className: 'mine' });
    expect(el.props.className).toContain('mine');
  });

  it('runs without throwing when a ref is supplied', () => {
    const ref = { current: null };
    const el = renderSep({}, ref);
    expect(el.type).toBe(mocks.Pass);
  });

  it('inherits a displayName from the Radix primitive', () => {
    expect(Separator.displayName).toBeDefined();
  });
});

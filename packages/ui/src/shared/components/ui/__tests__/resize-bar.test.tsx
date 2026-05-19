/**
 * Tests for `ResizeBar` — shared drag handle for resizable panels.
 */

import { describe, it, expect, vi } from 'vitest';
import { ResizeBar } from '../resize-bar';

interface ElLike {
  type: unknown;
  props: { className?: string; [k: string]: unknown };
}

const render = (props: Record<string, unknown>): ElLike => (ResizeBar as unknown as (p: unknown) => ElLike)(props);

describe('ResizeBar', () => {
  it('renders a div', () => {
    const el = render({ direction: 'vertical' });
    expect(el.type).toBe('div');
  });

  it('uses vertical (col-resize) classes when direction is vertical', () => {
    const el = render({ direction: 'vertical' });
    expect(el.props.className).toContain('cursor-col-resize');
    expect(el.props.className).toContain('w-1');
  });

  it('uses horizontal (row-resize) classes when direction is horizontal', () => {
    const el = render({ direction: 'horizontal' });
    expect(el.props.className).toContain('cursor-row-resize');
    expect(el.props.className).toContain('h-1');
  });

  it('merges caller className', () => {
    const el = render({ direction: 'vertical', className: 'mine' });
    expect(el.props.className).toContain('mine');
  });

  it('forwards the pointer event handlers', () => {
    const onPointerDown = vi.fn();
    const onPointerMove = vi.fn();
    const onPointerUp = vi.fn();
    const el = render({ direction: 'vertical', onPointerDown, onPointerMove, onPointerUp });
    expect(el.props.onPointerDown).toBe(onPointerDown);
    expect(el.props.onPointerMove).toBe(onPointerMove);
    expect(el.props.onPointerUp).toBe(onPointerUp);
  });

  it('has displayName "ResizeBar"', () => {
    expect(ResizeBar.displayName).toBe('ResizeBar');
  });
});

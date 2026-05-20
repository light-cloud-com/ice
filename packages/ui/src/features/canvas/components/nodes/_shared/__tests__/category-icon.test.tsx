/**
 * Tests for `CategoryIcon` — wraps `renderCategoryIcon` (the SVG glyph
 * dispatch) into a sized `<svg>` shell.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../../../assets/icons/category-icons', () => ({
  renderCategoryIcon: vi.fn((category: string, x: number, y: number, size: number, color: string) => (
    <g data-category={category} data-x={x} data-y={y} data-size={size} data-color={color} />
  )),
}));

import { renderCategoryIcon } from '../../../../../../assets/icons/category-icons';
import { CategoryIcon } from '../category-icon';

const renderInner = (props: React.ComponentProps<typeof CategoryIcon>): React.ReactElement => {
  const Inner = (
    CategoryIcon as unknown as {
      type: (p: React.ComponentProps<typeof CategoryIcon>) => React.ReactElement;
    }
  ).type;
  return Inner(props);
};

describe('CategoryIcon', () => {
  it('returns an <svg> with default size from ICON_SIZE (20)', () => {
    const tree = renderInner({ category: 'compute', color: '#fff' });
    expect(tree.type).toBe('svg');
    const props = tree.props as { width: number; height: number; viewBox: string };
    expect(props.width).toBe(20);
    expect(props.height).toBe(20);
    expect(props.viewBox).toBe('0 0 20 20');
  });

  it('honors a custom size', () => {
    const tree = renderInner({ category: 'compute', color: '#fff', size: 32 });
    const props = tree.props as { width: number; height: number; viewBox: string };
    expect(props.width).toBe(32);
    expect(props.height).toBe(32);
    expect(props.viewBox).toBe('0 0 32 32');
  });

  it('forwards category, color and size to renderCategoryIcon', () => {
    (renderCategoryIcon as unknown as { mockClear: () => void }).mockClear();
    renderInner({ category: 'database', color: '#22c55e', size: 24 });
    expect(renderCategoryIcon).toHaveBeenCalledWith('database', 0, 0, 24, '#22c55e');
  });

  it('exposes a stable displayName', () => {
    expect((CategoryIcon as unknown as { displayName: string }).displayName).toBe('CategoryIcon');
  });
});

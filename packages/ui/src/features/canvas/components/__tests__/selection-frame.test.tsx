/**
 * Tests for `SelectionFrame` — the dashed box-select rectangle drawn while
 * the user drags out a selection on canvas. Reads `selection.selectionRect`
 * from the redux store via `useSelector`.
 *
 * Branches under test:
 *   - selectionRect=null → returns null.
 *   - selectionRect set → renders a rect with the supplied geometry.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  state: { selection: { selectionRect: null as unknown } } as unknown,
}));

vi.mock('react-redux', () => ({
  // Pass-through: invokes the selector so the inner arrow is covered.
  useSelector: (selector: (state: unknown) => unknown) => selector(mocks.state),
}));

import { SelectionFrame } from '../selection-frame';

describe('SelectionFrame', () => {
  it('returns null when selectionRect is null', () => {
    mocks.state = { selection: { selectionRect: null } };
    const tree = SelectionFrame({});
    expect(tree).toBeNull();
  });

  it('renders a dashed blue rect with selection geometry when selectionRect is set', () => {
    mocks.state = { selection: { selectionRect: { x: 50, y: 100, width: 200, height: 80 } } };
    const tree = SelectionFrame({});
    expect(tree).not.toBeNull();
    const r = tree as React.ReactElement;
    expect(r.type).toBe('rect');
    const props = r.props as {
      x: number;
      y: number;
      width: number;
      height: number;
      stroke: string;
      strokeDasharray: string;
      pointerEvents: string;
    };
    expect(props.x).toBe(50);
    expect(props.y).toBe(100);
    expect(props.width).toBe(200);
    expect(props.height).toBe(80);
    expect(props.stroke).toBe('#3b82f6');
    expect(props.strokeDasharray).toBe('6 3');
    expect(props.pointerEvents).toBe('none');
  });

  it('uses semi-transparent blue fill so underlying nodes stay visible', () => {
    mocks.state = { selection: { selectionRect: { x: 0, y: 0, width: 1, height: 1 } } };
    const tree = SelectionFrame({}) as React.ReactElement;
    expect((tree.props as { fill: string }).fill).toBe('rgba(59, 130, 246, 0.08)');
  });

  it('uses 1px stroke width', () => {
    mocks.state = { selection: { selectionRect: { x: 0, y: 0, width: 1, height: 1 } } };
    const tree = SelectionFrame({}) as React.ReactElement;
    expect((tree.props as { strokeWidth: number }).strokeWidth).toBe(1);
  });
});

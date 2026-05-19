/**
 * Tests for `ChildExitingIndicator` — a dashed orange rectangle drawn
 * around a node that's about to leave its parent container on drag-detach.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { ChildExitingIndicator } from '../child-exiting-indicator';

const renderInner = (props: React.ComponentProps<typeof ChildExitingIndicator>): React.ReactElement => {
  const Inner = (
    ChildExitingIndicator as unknown as {
      type: (p: React.ComponentProps<typeof ChildExitingIndicator>) => React.ReactElement;
    }
  ).type;
  return Inner(props);
};

describe('ChildExitingIndicator', () => {
  it('expands the bounding rect by 3 on every side', () => {
    const tree = renderInner({ x: 10, y: 20, width: 100, height: 50 });
    const props = tree.props as { x: number; y: number; width: number; height: number };
    expect(props.x).toBe(7);
    expect(props.y).toBe(17);
    expect(props.width).toBe(106);
    expect(props.height).toBe(56);
  });

  it('uses the orange stroke (#f97316) with the dashed exit pattern 6 4', () => {
    const tree = renderInner({ x: 0, y: 0, width: 1, height: 1 });
    const props = tree.props as { stroke: string; strokeDasharray: string; opacity: number };
    expect(props.stroke).toBe('#f97316');
    expect(props.strokeDasharray).toBe('6 4');
    expect(props.opacity).toBe(0.9);
  });

  it('rx = CORNER_RADIUS+3', () => {
    const tree = renderInner({ x: 0, y: 0, width: 1, height: 1 });
    expect((tree.props as { rx: number }).rx).toBe(11);
  });

  it('exposes a stable displayName', () => {
    expect((ChildExitingIndicator as unknown as { displayName: string }).displayName).toBe('ChildExitingIndicator');
  });
});

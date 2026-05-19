/**
 * Tests for `StepperButton` — a small 18×18 button used inside number
 * steppers (+/− controls).
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { StepperButton } from '../stepper-button';

const renderInner = (props: React.ComponentProps<typeof StepperButton>): React.ReactElement => {
  const Inner = (
    StepperButton as unknown as {
      type: (p: React.ComponentProps<typeof StepperButton>) => React.ReactElement;
    }
  ).type;
  return Inner(props);
};

describe('StepperButton', () => {
  it('renders a button with the supplied label', () => {
    const tree = renderInner({ label: '+', onClick: vi.fn() });
    expect(tree.type).toBe('button');
    expect((tree.props as { children: unknown }).children).toBe('+');
  });

  it('forwards onClick to the button click handler', () => {
    const onClick = vi.fn();
    const tree = renderInner({ label: '−', onClick });
    const handler = (tree.props as { onClick: (e: React.MouseEvent) => void }).onClick;
    const evt = { stopPropagation: vi.fn() } as unknown as React.MouseEvent;
    handler(evt);
    expect(onClick).toHaveBeenCalledWith(evt);
  });

  it('mousedown handler stops propagation so canvas drag does not start', () => {
    const tree = renderInner({ label: '+', onClick: vi.fn() });
    const onMouseDown = (tree.props as { onMouseDown: (e: React.MouseEvent) => void }).onMouseDown;
    const stopProp = vi.fn();
    onMouseDown({ stopPropagation: stopProp } as unknown as React.MouseEvent);
    expect(stopProp).toHaveBeenCalledTimes(1);
  });

  it('button has type="button" so it never submits a form', () => {
    const tree = renderInner({ label: '+', onClick: vi.fn() });
    expect((tree.props as { type: string }).type).toBe('button');
  });

  it('exposes a stable displayName', () => {
    expect((StepperButton as unknown as { displayName: string }).displayName).toBe('StepperButton');
  });
});

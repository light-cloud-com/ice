/**
 * Tests for `Textarea` — styled multi-line input forwardRef wrapper.
 */

import { describe, it, expect } from 'vitest';
import { Textarea } from '../textarea';

interface ElLike {
  type: unknown;
  props: { className?: string; [k: string]: unknown };
}

const renderTextarea = (props: Record<string, unknown>, ref: unknown = null): ElLike => {
  const renderFn = (Textarea as unknown as { render: (p: unknown, r: unknown) => ElLike }).render;
  return renderFn(props, ref);
};

describe('Textarea', () => {
  it('renders a native <textarea>', () => {
    const el = renderTextarea({});
    expect(el.type).toBe('textarea');
  });

  it('passes through standard HTML attrs (value, onChange, rows)', () => {
    const onChange = () => {};
    const el = renderTextarea({ value: 'hi', onChange, rows: 5 });
    expect(el.props.value).toBe('hi');
    expect(el.props.onChange).toBe(onChange);
    expect(el.props.rows).toBe(5);
  });

  it('merges caller className with the default classes', () => {
    const el = renderTextarea({ className: 'mine' });
    expect(el.props.className).toContain('mine');
    expect(el.props.className).toContain('rounded-md');
  });

  it('runs without throwing when a ref is supplied', () => {
    const ref = { current: null };
    const el = renderTextarea({}, ref);
    expect(el.type).toBe('textarea');
  });

  it('has displayName "Textarea"', () => {
    expect(Textarea.displayName).toBe('Textarea');
  });
});

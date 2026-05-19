/**
 * Tests for `Input` — styled text input forwardRef wrapper.
 */

import { describe, it, expect } from 'vitest';
import { Input } from '../input';

interface ElLike {
  type: unknown;
  props: { className?: string; type?: string; [k: string]: unknown };
}

const renderInput = (props: Record<string, unknown>, ref: unknown = null): ElLike => {
  const renderFn = (Input as unknown as { render: (p: unknown, r: unknown) => ElLike }).render;
  return renderFn(props, ref);
};

describe('Input', () => {
  it('renders a native <input>', () => {
    const el = renderInput({});
    expect(el.type).toBe('input');
  });

  it('forwards the type attribute', () => {
    const el = renderInput({ type: 'email' });
    expect(el.props.type).toBe('email');
  });

  it('passes through value, onChange, placeholder, and id', () => {
    const onChange = () => {};
    const el = renderInput({ value: 'hi', onChange, placeholder: 'p', id: 'i' });
    expect(el.props.value).toBe('hi');
    expect(el.props.onChange).toBe(onChange);
    expect(el.props.placeholder).toBe('p');
    expect(el.props.id).toBe('i');
  });

  it('merges caller className with the default classes', () => {
    const el = renderInput({ className: 'mine' });
    expect(el.props.className).toContain('mine');
    expect(el.props.className).toContain('rounded-md');
  });

  it('runs without throwing when a ref is supplied', () => {
    const ref = { current: null };
    const el = renderInput({}, ref);
    expect(el.type).toBe('input');
  });

  it('has displayName "Input"', () => {
    expect(Input.displayName).toBe('Input');
  });
});

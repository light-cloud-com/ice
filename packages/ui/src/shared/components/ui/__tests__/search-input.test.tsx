/**
 * Tests for `SearchInput` — bordered input with icon and clear button.
 */

import { describe, it, expect, vi } from 'vitest';
import { SearchInput } from '../search-input';

interface ElLike {
  type: unknown;
  props: { className?: string; children?: unknown; value?: string; [k: string]: unknown };
}
function isEl(x: unknown): x is ElLike {
  return !!x && typeof x === 'object' && 'type' in x && 'props' in x;
}
function* walk(node: unknown): Generator<ElLike> {
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c);
    return;
  }
  if (!isEl(node)) return;
  yield node;
  yield* walk(node.props.children);
}
function findFirst(tree: unknown, pred: (el: ElLike) => boolean): ElLike | undefined {
  for (const el of walk(tree)) if (pred(el)) return el;
  return undefined;
}

const renderSI = (props: Record<string, unknown>, ref: unknown = null): ElLike => {
  const renderFn = (SearchInput as unknown as { render: (p: unknown, r: unknown) => ElLike }).render;
  return renderFn(props, ref);
};

describe('SearchInput', () => {
  it('renders a wrapping <div> containing an <input>', () => {
    const tree = renderSI({ value: '', onChange: () => {} });
    expect(tree.type).toBe('div');
    const input = findFirst(tree, (el) => el.type === 'input');
    expect(input).toBeDefined();
  });

  it('forwards the value to the input', () => {
    const tree = renderSI({ value: 'hello', onChange: () => {} });
    const input = findFirst(tree, (el) => el.type === 'input')!;
    expect(input.props.value).toBe('hello');
  });

  it('uses small-size classes by default (pl-6)', () => {
    const tree = renderSI({ value: '', onChange: () => {} });
    const input = findFirst(tree, (el) => el.type === 'input')!;
    expect(input.props.className).toContain('pl-6');
  });

  it('uses md-size classes when size="md" (pl-8)', () => {
    const tree = renderSI({ value: '', onChange: () => {}, size: 'md' });
    const input = findFirst(tree, (el) => el.type === 'input')!;
    expect(input.props.className).toContain('pl-8');
  });

  it('does not render the clear button when value is empty', () => {
    const tree = renderSI({ value: '', onChange: () => {} });
    const btn = findFirst(tree, (el) => el.type === 'button');
    expect(btn).toBeUndefined();
  });

  it('renders the clear button when value is non-empty', () => {
    const tree = renderSI({ value: 'x', onChange: () => {} });
    const btn = findFirst(tree, (el) => el.type === 'button');
    expect(btn).toBeDefined();
  });

  it('clear button calls onChange with empty string', () => {
    const onChange = vi.fn();
    const tree = renderSI({ value: 'abc', onChange });
    const btn = findFirst(tree, (el) => el.type === 'button')!;
    (btn.props.onClick as () => void)();
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('input change handler calls onChange with the new value', () => {
    const onChange = vi.fn();
    const tree = renderSI({ value: '', onChange });
    const input = findFirst(tree, (el) => el.type === 'input')!;
    (input.props.onChange as (e: { target: { value: string } }) => void)({ target: { value: 'q' } });
    expect(onChange).toHaveBeenCalledWith('q');
  });

  it('uses default placeholder "Search..." when not provided', () => {
    const tree = renderSI({ value: '', onChange: () => {} });
    const input = findFirst(tree, (el) => el.type === 'input')!;
    expect(input.props.placeholder).toBe('Search...');
  });

  it('uses an explicit placeholder when provided', () => {
    const tree = renderSI({ value: '', onChange: () => {}, placeholder: 'Find' });
    const input = findFirst(tree, (el) => el.type === 'input')!;
    expect(input.props.placeholder).toBe('Find');
  });

  it('passes id, autoFocus and onKeyDown', () => {
    const onKeyDown = () => {};
    const tree = renderSI({
      value: '',
      onChange: () => {},
      id: 'q',
      autoFocus: true,
      onKeyDown,
    });
    const input = findFirst(tree, (el) => el.type === 'input')!;
    expect(input.props.id).toBe('q');
    expect(input.props.autoFocus).toBe(true);
    expect(input.props.onKeyDown).toBe(onKeyDown);
  });

  it('merges caller className on the wrapper', () => {
    const tree = renderSI({ value: '', onChange: () => {}, className: 'wcls' });
    expect(tree.props.className).toContain('wcls');
  });

  it('has displayName "SearchInput"', () => {
    expect(SearchInput.displayName).toBe('SearchInput');
  });
});

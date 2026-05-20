/**
 * rf-props-11 — group-color-picker section.
 *
 * `GroupColorPicker` is purely presentational (no Redux, no hooks beyond the
 * FC body), so we use the direct-FC tree-walker pattern (cite
 * `tree-walker-for-react-fc-tests-must-flatten-nested-children-arrays`):
 * invoke the component as a function, then walk the returned React-element
 * tree depth-first to find leaves and assert on type / props / children.
 *
 * The walker explicitly recurses into arrays before treating a node as an
 * element so the `GROUP_COLORS.map(...)` swatch list (an array nested inside
 * the parent's `children`) doesn't trip the walk.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { GROUP_COLOR_PRESETS } from '../../../../../config/color-palette';
import { GroupColorPicker } from '../group-color-picker';

// ─── Tree-walker (same shape as rf-props-6/9/10) ────────────────────────────

type ReactNodeLike = React.ReactNode;

function* walk(node: ReactNodeLike): Generator<React.ReactElement> {
  if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') {
    return;
  }
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c as ReactNodeLike);
    return;
  }
  const el = node as React.ReactElement;
  yield el;
  const children = (el.props as { children?: React.ReactNode } | undefined)?.children;
  if (children == null) return;
  yield* walk(children);
}

function findByPredicate(tree: React.ReactNode, predicate: (el: React.ReactElement) => boolean): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) {
    if (el && predicate(el)) out.push(el);
  }
  return out;
}

function findByType(tree: React.ReactNode, type: string): React.ReactElement[] {
  return findByPredicate(tree, (el) => el.type === type);
}

function collectText(tree: React.ReactNode): string {
  const parts: string[] = [];
  const visit = (n: ReactNodeLike): void => {
    if (n == null || typeof n === 'boolean') return;
    if (typeof n === 'string' || typeof n === 'number') {
      parts.push(String(n));
      return;
    }
    if (Array.isArray(n)) {
      for (const c of n) visit(c as ReactNodeLike);
      return;
    }
    const el = n as React.ReactElement;
    visit((el.props as { children?: React.ReactNode } | undefined)?.children ?? null);
  };
  visit(tree);
  return parts.join(' ');
}

// ─── Helpers ────────────────────────────────────────────────────────────────

interface SwatchProps {
  onClick: () => void;
  className: string;
  style: {
    backgroundColor: string;
    borderColor: string;
    boxShadow?: string;
  };
  title: string;
}

interface SliderProps {
  type: 'range';
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (e: { target: { value: string } }) => void;
  className: string;
  style: { accentColor: string };
}

interface ResetButtonProps {
  onClick: () => void;
  className: string;
}

const renderPicker = (
  overrides: {
    color?: string;
    opacity?: number;
    onChange?: (c: string) => void;
    onOpacityChange?: (o: number) => void;
  } = {},
): React.ReactElement => {
  const props = {
    color: overrides.color ?? '#3b82f6',
    opacity: overrides.opacity ?? 0.1,
    onChange: overrides.onChange ?? vi.fn(),
    onOpacityChange: overrides.onOpacityChange ?? vi.fn(),
  };
  return GroupColorPicker(props) as React.ReactElement;
};

const swatchButtons = (tree: React.ReactNode): React.ReactElement[] => {
  // Swatch buttons have a `title` prop that matches one of the colors and
  // a backgroundColor style. Reset button has neither — distinguish by props.
  return findByPredicate(
    tree,
    (el) =>
      el.type === 'button' &&
      typeof (el.props as Partial<SwatchProps>).title === 'string' &&
      typeof (el.props as Partial<SwatchProps>).style?.backgroundColor === 'string',
  );
};

const sliderInput = (tree: React.ReactNode): React.ReactElement => {
  const inputs = findByPredicate(
    tree,
    (el) => el.type === 'input' && (el.props as Partial<SliderProps>).type === 'range',
  );
  expect(inputs).toHaveLength(1);
  return inputs[0];
};

const resetButton = (tree: React.ReactNode): React.ReactElement => {
  // Reset button: no `title`, no `backgroundColor` style (i.e. not a swatch).
  const btns = findByPredicate(
    tree,
    (el) => el.type === 'button' && typeof (el.props as Partial<SwatchProps>).title !== 'string',
  );
  expect(btns).toHaveLength(1);
  return btns[0];
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('GroupColorPicker', () => {
  it('renders one swatch button per GROUP_COLOR_PRESETS entry', () => {
    const tree = renderPicker();
    expect(swatchButtons(tree)).toHaveLength(GROUP_COLOR_PRESETS.length);
  });

  it('each swatch has style.backgroundColor matching its preset color', () => {
    const tree = renderPicker();
    const swatches = swatchButtons(tree);
    swatches.forEach((swatch, i) => {
      const props = swatch.props as SwatchProps;
      expect(props.style.backgroundColor).toBe(GROUP_COLOR_PRESETS[i]);
      // The `title` prop also carries the color string.
      expect(props.title).toBe(GROUP_COLOR_PRESETS[i]);
    });
  });

  it('the selected swatch has borderColor white and a boxShadow; non-selected swatches have transparent border', () => {
    const selected = GROUP_COLOR_PRESETS[2];
    const tree = renderPicker({ color: selected });
    const swatches = swatchButtons(tree);
    swatches.forEach((swatch) => {
      const { style } = swatch.props as SwatchProps;
      if (style.backgroundColor === selected) {
        expect(style.borderColor).toBe('white');
        expect(style.boxShadow).toBe(`0 0 0 2px ${selected}`);
      } else {
        expect(style.borderColor).toBe('transparent');
        expect(style.boxShadow).toBeUndefined();
      }
    });
  });

  it('clicking a swatch fires onChange with that swatch color', () => {
    const onChange = vi.fn();
    const tree = renderPicker({ onChange });
    const swatches = swatchButtons(tree);
    // Pick the 4th swatch (arbitrary, not the default).
    const target = swatches[3];
    (target.props as SwatchProps).onClick();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(GROUP_COLOR_PRESETS[3]);
  });

  it('opacity slider value is Math.round(opacity * 100)', () => {
    const tree = renderPicker({ opacity: 0.5 });
    const slider = sliderInput(tree);
    expect((slider.props as SliderProps).value).toBe(50);
  });

  it('opacity slider value rounds non-integer percentages', () => {
    // 0.123 * 100 = 12.3 → Math.round → 12
    const tree = renderPicker({ opacity: 0.123 });
    expect((sliderInput(tree).props as SliderProps).value).toBe(12);
  });

  it('slider min / max / step are 0 / 100 / 5', () => {
    const tree = renderPicker();
    const slider = sliderInput(tree);
    const props = slider.props as SliderProps;
    expect(props.min).toBe(0);
    expect(props.max).toBe(100);
    expect(props.step).toBe(5);
  });

  it('slider onChange divides the input value by 100 before calling onOpacityChange', () => {
    const onOpacityChange = vi.fn();
    const tree = renderPicker({ onOpacityChange });
    const slider = sliderInput(tree);
    (slider.props as SliderProps).onChange({ target: { value: '60' } });
    expect(onOpacityChange).toHaveBeenCalledTimes(1);
    expect(onOpacityChange).toHaveBeenCalledWith(0.6);
  });

  it('opacity badge text reads `${Math.round(opacity * 100)}%`', () => {
    const tree = renderPicker({ opacity: 0.42 });
    // The badge JSX is `{Math.round(opacity * 100)}%` — a number child followed
    // by a string child. `collectText` walks each child individually and joins
    // with spaces, so the two adjacent text parts come back as "42 %" rather
    // than "42%". Find the badge span directly to assert the *children* it was
    // handed in source order rather than relying on a join-collapsed string.
    const badge = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('font-mono'),
    )[0];
    expect(badge).toBeDefined();
    const children = (badge.props as { children: React.ReactNode }).children as unknown[];
    expect(children[0]).toBe(42);
    expect(children[1]).toBe('%');
  });

  it('reset button click fires onOpacityChange(0.1)', () => {
    const onOpacityChange = vi.fn();
    const tree = renderPicker({ onOpacityChange, opacity: 0.7 });
    (resetButton(tree).props as ResetButtonProps).onClick();
    expect(onOpacityChange).toHaveBeenCalledTimes(1);
    expect(onOpacityChange).toHaveBeenCalledWith(0.1);
  });

  it("slider's accentColor style matches the current color prop", () => {
    const customColor = '#abcdef';
    const tree = renderPicker({ color: customColor });
    const slider = sliderInput(tree);
    expect((slider.props as SliderProps).style.accentColor).toBe(customColor);
  });
});

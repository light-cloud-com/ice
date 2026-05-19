/**
 * rf-props-13 — env-vars-editor section.
 *
 * `EnvVarsEditor` is purely presentational (no Redux, no hooks beyond the FC
 * body), so we use the direct-FC tree-walker pattern (cite
 * `tree-walker-for-react-fc-tests-must-flatten-nested-children-arrays`):
 * invoke the component as a function, then walk the returned React-element
 * tree depth-first to find leaves and assert on type / props / children.
 *
 * `Section` is mocked to a passthrough that exposes the `title` prop on the
 * stub root and the `children` prop unchanged. This way the EnvVarsEditor's
 * own render — the per-row inputs/buttons + the trailing add button — is
 * directly walkable without depending on the field-primitive's actual JSX.
 * Mock path is `../../fields` (one extra `..` vs. the source file because the
 * test sits in `__tests__/`, one level deeper than the source).
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

// Mock the field-primitives bundle. Section becomes a passthrough that just
// renders its children inside a div carrying the title as data-title — the
// walker can then descend into the editor's own JSX directly.
vi.mock('../../fields', () => ({
  Section: ({ title, children }: { title: string; children: React.ReactNode }) =>
    React.createElement('div', { 'data-section-title': title }, children),
}));

// Mock i18n — return stable `t:<key>` strings for placeholder/title assertions.
vi.mock('../../../../../i18n', () => ({
  t: vi.fn((key: string) => `t:${key}`),
}));

import { EnvVarsEditor } from '../env-vars-editor';

// ─── Tree-walker (same shape as rf-props-6/9/10/11/12) ──────────────────────

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

// ─── Helpers ────────────────────────────────────────────────────────────────

interface InputProps {
  value: string;
  onChange: (e: { target: { value: string } }) => void;
  placeholder: string;
  type?: string;
  className: string;
}

interface ButtonProps {
  onClick: () => void;
  className: string;
  title?: string;
  children?: React.ReactNode;
}

type EnvVar = { name: string; value: string; isSecret?: boolean };

const renderEditor = (
  variables: EnvVar[],
): {
  tree: React.ReactElement;
  onChange: ReturnType<typeof vi.fn>;
} => {
  const onChange = vi.fn();
  const tree = EnvVarsEditor({ variables, onChange }) as React.ReactElement;
  return { tree, onChange };
};

const findInputs = (tree: React.ReactNode): React.ReactElement[] => findByType(tree, 'input');
const findButtons = (tree: React.ReactNode): React.ReactElement[] => findByType(tree, 'button');

// The "row" buttons are the lock/unlock toggle + the remove button. The "add"
// button has the addVariable t-key as a string child.
const findAddButton = (tree: React.ReactNode): React.ReactElement => {
  const btns = findButtons(tree).filter(
    (b) =>
      typeof (b.props as ButtonProps).children === 'string' &&
      ((b.props as ButtonProps).children as string).includes('addVariable'),
  );
  expect(btns).toHaveLength(1);
  return btns[0];
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('EnvVarsEditor', () => {
  it('empty variables → renders only the add button', () => {
    const { tree } = renderEditor([]);
    const inputs = findInputs(tree);
    expect(inputs).toHaveLength(0);
    const buttons = findButtons(tree);
    expect(buttons).toHaveLength(1);
    // The single button should be the add button.
    expect((buttons[0].props as ButtonProps).children).toBe('t:properties.envVars.addVariable');
  });

  it('one variable → renders name input + value input + secret-toggle + remove + add button', () => {
    const { tree } = renderEditor([{ name: 'FOO', value: 'bar' }]);
    const inputs = findInputs(tree);
    // Two inputs per row.
    expect(inputs).toHaveLength(2);
    // 3 buttons total: secret-toggle, remove, add.
    const buttons = findButtons(tree);
    expect(buttons).toHaveLength(3);
    // Name input
    expect((inputs[0].props as InputProps).value).toBe('FOO');
    expect((inputs[0].props as InputProps).placeholder).toBe('t:properties.envVars.keyPlaceholder');
    // Value input
    expect((inputs[1].props as InputProps).value).toBe('bar');
    expect((inputs[1].props as InputProps).placeholder).toBe('t:properties.envVars.valuePlaceholder');
    expect((inputs[1].props as InputProps).type).toBe('text');
  });

  it('add button click → fires onChange with [...variables, blank-row]', () => {
    const variables: EnvVar[] = [{ name: 'FOO', value: 'bar' }];
    const { tree, onChange } = renderEditor(variables);
    const addBtn = findAddButton(tree);
    (addBtn.props as ButtonProps).onClick();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([
      { name: 'FOO', value: 'bar' },
      { name: '', value: '', isSecret: false },
    ]);
  });

  it('name input change → fires onChange with updated name on the right row', () => {
    const { tree, onChange } = renderEditor([{ name: 'FOO', value: 'bar' }]);
    const [nameInput] = findInputs(tree);
    (nameInput.props as InputProps).onChange({ target: { value: 'BAZ' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([{ name: 'BAZ', value: 'bar' }]);
  });

  it('value input change → fires onChange with updated value on the right row', () => {
    const { tree, onChange } = renderEditor([{ name: 'FOO', value: 'bar' }]);
    const [, valueInput] = findInputs(tree);
    (valueInput.props as InputProps).onChange({ target: { value: 'qux' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([{ name: 'FOO', value: 'qux' }]);
  });

  it('secret-toggle click → fires onChange with isSecret flipped', () => {
    const { tree, onChange } = renderEditor([{ name: 'FOO', value: 'bar', isSecret: false }]);
    const buttons = findButtons(tree);
    // Order in the row: secret-toggle (index 0), remove (index 1). Add is last (index 2).
    const toggleBtn = buttons[0];
    (toggleBtn.props as ButtonProps).onClick();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([{ name: 'FOO', value: 'bar', isSecret: true }]);
  });

  it('secret-toggle click on already-secret row → flips back to false', () => {
    const { tree, onChange } = renderEditor([{ name: 'FOO', value: 'bar', isSecret: true }]);
    const buttons = findButtons(tree);
    const toggleBtn = buttons[0];
    (toggleBtn.props as ButtonProps).onClick();
    expect(onChange).toHaveBeenCalledWith([{ name: 'FOO', value: 'bar', isSecret: false }]);
  });

  it('remove button click → fires onChange with the variable filtered out', () => {
    const { tree, onChange } = renderEditor([
      { name: 'FOO', value: 'bar' },
      { name: 'BAZ', value: 'qux' },
    ]);
    const buttons = findButtons(tree);
    // Buttons per row: 2 (secret + remove). Two rows = 4 row-buttons + 1 add = 5 total.
    expect(buttons).toHaveLength(5);
    // Remove button on row 0 is at index 1 (after the secret-toggle at 0).
    const removeBtn0 = buttons[1];
    (removeBtn0.props as ButtonProps).onClick();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([{ name: 'BAZ', value: 'qux' }]);
  });

  it('isSecret: true → value input is type="password" and displays "••••••"', () => {
    const { tree } = renderEditor([{ name: 'FOO', value: 'super-secret', isSecret: true }]);
    const [, valueInput] = findInputs(tree);
    expect((valueInput.props as InputProps).type).toBe('password');
    expect((valueInput.props as InputProps).value).toBe('••••••');
  });

  it('isSecret: false → value input is type="text" and displays the raw value', () => {
    const { tree } = renderEditor([{ name: 'FOO', value: 'plain-text', isSecret: false }]);
    const [, valueInput] = findInputs(tree);
    expect((valueInput.props as InputProps).type).toBe('text');
    expect((valueInput.props as InputProps).value).toBe('plain-text');
  });

  it('multiple variables → all rendered, in source order, with correct values', () => {
    const { tree } = renderEditor([
      { name: 'A', value: '1' },
      { name: 'B', value: '2', isSecret: true },
      { name: 'C', value: '3' },
    ]);
    const inputs = findInputs(tree);
    // 2 inputs per row × 3 rows = 6.
    expect(inputs).toHaveLength(6);
    // Row 0: name + value (text)
    expect((inputs[0].props as InputProps).value).toBe('A');
    expect((inputs[1].props as InputProps).value).toBe('1');
    expect((inputs[1].props as InputProps).type).toBe('text');
    // Row 1: secret row — value masked, type=password.
    expect((inputs[2].props as InputProps).value).toBe('B');
    expect((inputs[3].props as InputProps).value).toBe('••••••');
    expect((inputs[3].props as InputProps).type).toBe('password');
    // Row 2: name + value (text)
    expect((inputs[4].props as InputProps).value).toBe('C');
    expect((inputs[5].props as InputProps).value).toBe('3');
    // Buttons: 2 per row × 3 rows + 1 add = 7.
    const buttons = findButtons(tree);
    expect(buttons).toHaveLength(7);
  });

  it('secret-toggle on row 1 of multi-row list → flips only that row', () => {
    const { tree, onChange } = renderEditor([
      { name: 'A', value: '1', isSecret: false },
      { name: 'B', value: '2', isSecret: false },
      { name: 'C', value: '3', isSecret: false },
    ]);
    const buttons = findButtons(tree);
    // Row 1's secret-toggle is at index 2 (row 0: 0=toggle, 1=remove; row 1: 2=toggle, 3=remove).
    const row1Toggle = buttons[2];
    (row1Toggle.props as ButtonProps).onClick();
    expect(onChange).toHaveBeenCalledWith([
      { name: 'A', value: '1', isSecret: false },
      { name: 'B', value: '2', isSecret: true },
      { name: 'C', value: '3', isSecret: false },
    ]);
  });

  it("secret-toggle button's title reflects the row's current isSecret", () => {
    const { tree } = renderEditor([
      { name: 'A', value: '1', isSecret: false },
      { name: 'B', value: '2', isSecret: true },
    ]);
    const buttons = findButtons(tree);
    // Row 0 toggle (isSecret false) → makeSecretTitle.
    expect((buttons[0].props as ButtonProps).title).toBe('t:properties.envVars.makeSecretTitle');
    // Row 1 toggle (isSecret true) → secretTitle.
    expect((buttons[2].props as ButtonProps).title).toBe('t:properties.envVars.secretTitle');
  });

  it("secret-toggle button's child emoji is 🔒 when secret, 🔓 when not", () => {
    const { tree } = renderEditor([
      { name: 'A', value: '1', isSecret: false },
      { name: 'B', value: '2', isSecret: true },
    ]);
    const buttons = findButtons(tree);
    expect((buttons[0].props as ButtonProps).children).toBe('🔓');
    expect((buttons[2].props as ButtonProps).children).toBe('🔒');
  });
});

/**
 * rf-npsec-2 — NodeIdentityCard tests.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { NodeIdentityCard } from '../node-identity-card';
import type { CardNode } from '../../../../../store/slices/cards-slice';
import type { ResourceDef } from '../../../hooks/use-resource-map';

interface ReactElementLike {
  type: unknown;
  props: { [k: string]: unknown; children?: unknown };
}
function isElement(x: unknown): x is ReactElementLike {
  return !!x && typeof x === 'object' && 'type' in x && 'props' in x;
}
function* walk(node: unknown): Generator<ReactElementLike> {
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c);
    return;
  }
  if (!isElement(node)) return;
  yield node;
  yield* walk(node.props.children);
}
function findByPredicate(tree: unknown, predicate: (el: ReactElementLike) => boolean): ReactElementLike | undefined {
  for (const el of walk(tree)) {
    if (predicate(el)) return el;
  }
  return undefined;
}
function findAllByPredicate(tree: unknown, predicate: (el: ReactElementLike) => boolean): ReactElementLike[] {
  const out: ReactElementLike[] = [];
  for (const el of walk(tree)) {
    if (predicate(el)) out.push(el);
  }
  return out;
}

const makeNode = (overrides: Partial<CardNode> = {}): CardNode =>
  ({
    id: 'n1',
    type: 'compute',
    position: { x: 0, y: 0 },
    data: {},
    ...overrides,
  }) as CardNode;

const callRender = (props: React.ComponentProps<typeof NodeIdentityCard>): unknown =>
  (NodeIdentityCard as (p: React.ComponentProps<typeof NodeIdentityCard>) => unknown)(props);

describe('NodeIdentityCard — rendering', () => {
  it('renders an img with the iconUrl', () => {
    const tree = callRender({
      selectedNode: makeNode(),
      iconUrl: '/some/icon.svg',
      label: 'Hello',
      iceType: 'iceType',
      provider: 'aws',
      resourceDef: undefined,
      onUpdateName: vi.fn(),
    });
    const img = findByPredicate(tree, (el) => el.type === 'img');
    expect(img?.props.src).toBe('/some/icon.svg');
  });

  it('renders the input with defaultValue from label and key from node id', () => {
    const tree = callRender({
      selectedNode: makeNode({ id: 'node-x' }),
      iconUrl: '',
      label: 'My Service',
      iceType: '',
      provider: '',
      resourceDef: undefined,
      onUpdateName: vi.fn(),
    });
    const input = findByPredicate(tree, (el) => el.type === 'input');
    expect(input?.props.defaultValue).toBe('My Service');
    // key is not on props (it's a special React prop), but id matches
    expect(input?.props.id).toBe('ice-properties-node-name');
  });

  it('renders the resourceDef.display_name chip when resourceDef is set', () => {
    const tree = callRender({
      selectedNode: makeNode(),
      iconUrl: '',
      label: '',
      iceType: 'IceType',
      provider: '',
      resourceDef: { display_name: 'GCP Cloud Run', properties: [] } as unknown as ResourceDef,
      onUpdateName: vi.fn(),
    });
    const chip = findByPredicate(tree, (el) => el.props.children === 'GCP Cloud Run');
    expect(chip).toBeDefined();
  });

  it('renders the iceType chip when no resourceDef', () => {
    const tree = callRender({
      selectedNode: makeNode(),
      iconUrl: '',
      label: '',
      iceType: 'Compute.Foo',
      provider: '',
      resourceDef: undefined,
      onUpdateName: vi.fn(),
    });
    const chip = findByPredicate(tree, (el) => el.props.children === 'Compute.Foo');
    expect(chip).toBeDefined();
  });

  it('does NOT render the iceType chip when resourceDef IS set', () => {
    const tree = callRender({
      selectedNode: makeNode(),
      iconUrl: '',
      label: '',
      iceType: 'IceTypeShouldNotShow',
      provider: '',
      resourceDef: { display_name: 'X', properties: [] } as unknown as ResourceDef,
      onUpdateName: vi.fn(),
    });
    const chip = findByPredicate(tree, (el) => el.props.children === 'IceTypeShouldNotShow');
    expect(chip).toBeUndefined();
  });

  it('renders the provider chip when provider is non-empty', () => {
    const tree = callRender({
      selectedNode: makeNode(),
      iconUrl: '',
      label: '',
      iceType: '',
      provider: 'gcp',
      resourceDef: undefined,
      onUpdateName: vi.fn(),
    });
    const chip = findByPredicate(tree, (el) => el.props.children === 'gcp');
    expect(chip).toBeDefined();
  });

  it('omits the provider chip when provider is empty', () => {
    const tree = callRender({
      selectedNode: makeNode(),
      iconUrl: '',
      label: '',
      iceType: '',
      provider: '',
      resourceDef: undefined,
      onUpdateName: vi.fn(),
    });
    const chips = findAllByPredicate(
      tree,
      (el) => typeof el.props.className === 'string' && el.props.className.includes('text-blue-400'),
    );
    expect(chips.length).toBe(0);
  });
});

describe('NodeIdentityCard — handlers', () => {
  it('onBlur calls onUpdateName with trimmed value when changed', () => {
    const onUpdateName = vi.fn();
    const tree = callRender({
      selectedNode: makeNode(),
      iconUrl: '',
      label: 'old',
      iceType: '',
      provider: '',
      resourceDef: undefined,
      onUpdateName,
    });
    const input = findByPredicate(tree, (el) => el.type === 'input');
    const fakeEvent = { target: { value: '  new name  ' } };
    (input?.props.onBlur as (e: unknown) => void)?.(fakeEvent);
    expect(onUpdateName).toHaveBeenCalledWith('new name');
  });

  it('onBlur does NOT call onUpdateName when value is unchanged', () => {
    const onUpdateName = vi.fn();
    const tree = callRender({
      selectedNode: makeNode(),
      iconUrl: '',
      label: 'same',
      iceType: '',
      provider: '',
      resourceDef: undefined,
      onUpdateName,
    });
    const input = findByPredicate(tree, (el) => el.type === 'input');
    const fakeEvent = { target: { value: 'same' } };
    (input?.props.onBlur as (e: unknown) => void)?.(fakeEvent);
    expect(onUpdateName).not.toHaveBeenCalled();
  });

  it('onBlur does NOT call onUpdateName when trimmed value is empty', () => {
    const onUpdateName = vi.fn();
    const tree = callRender({
      selectedNode: makeNode(),
      iconUrl: '',
      label: 'old',
      iceType: '',
      provider: '',
      resourceDef: undefined,
      onUpdateName,
    });
    const input = findByPredicate(tree, (el) => el.type === 'input');
    const fakeEvent = { target: { value: '   ' } };
    (input?.props.onBlur as (e: unknown) => void)?.(fakeEvent);
    expect(onUpdateName).not.toHaveBeenCalled();
  });

  it('onKeyDown Enter blurs the input', () => {
    const tree = callRender({
      selectedNode: makeNode(),
      iconUrl: '',
      label: '',
      iceType: '',
      provider: '',
      resourceDef: undefined,
      onUpdateName: vi.fn(),
    });
    const input = findByPredicate(tree, (el) => el.type === 'input');
    const blur = vi.fn();
    const fakeEvent = { key: 'Enter', target: { blur } };
    (input?.props.onKeyDown as (e: unknown) => void)?.(fakeEvent);
    expect(blur).toHaveBeenCalled();
  });

  it('onKeyDown for non-Enter keys is a no-op', () => {
    const tree = callRender({
      selectedNode: makeNode(),
      iconUrl: '',
      label: '',
      iceType: '',
      provider: '',
      resourceDef: undefined,
      onUpdateName: vi.fn(),
    });
    const input = findByPredicate(tree, (el) => el.type === 'input');
    const blur = vi.fn();
    const fakeEvent = { key: 'a', target: { blur } };
    (input?.props.onKeyDown as (e: unknown) => void)?.(fakeEvent);
    expect(blur).not.toHaveBeenCalled();
  });
});

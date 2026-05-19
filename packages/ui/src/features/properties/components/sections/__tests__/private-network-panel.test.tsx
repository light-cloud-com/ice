/**
 * rf-props-16 — private-network-panel subcomponent.
 *
 * `PrivateNetworkPanel` is purely presentational (no Redux, no hooks
 * beyond the FC body). It composes two file-private
 * `PrivateNetworkPolicySection`s — one per direction — that render the
 * radio-group + optional allowlist editor.
 *
 * The load-bearing detail per blueprint risk flag #7 is `data-testid`
 * preservation: each policy radio label, allowlist input, and the
 * "+ Add ..." button carry `data-testid="pn-${direction}-..."` attributes
 * referenced by E2E selectors. The `direction` prop value is
 * `'inbound' | 'outbound'` (NOT `ingress`/`egress` — those name the data
 * fields on `selectedNode.data`, but the rendered testids use the
 * direction string).
 *
 * Direct-FC tree-walker pattern (cite
 * `tree-walker-for-react-fc-tests-must-flatten-nested-children-arrays`):
 * invoke the component as a function, walk the returned React-element
 * tree depth-first, find primitives by `el.type` + `el.props`. Mock
 * `Section` from `'../../fields'` to a `vi.hoisted` `vi.fn()` so the
 * walker descends through `Section.props.children` natively without
 * needing the mock body to execute (cite
 * `vi-hoisted-for-stable-mock-identity-in-direct-fc-tree-walker-tests`).
 *
 * The file-private `PrivateNetworkPolicySection` is exercised through the
 * `PrivateNetworkPanel` render tree — it is not imported directly.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  MockSection: vi.fn(),
}));

vi.mock('../../fields', () => ({
  Section: mocks.MockSection,
}));

import { PrivateNetworkPanel } from '../private-network-panel';

// ─── Tree-walker (rf-props-16 variant) ──────────────────────────────────────
//
// The standard direct-FC walker (rf-props-6/9/10/11/12/13/14/15) descends
// only through `el.props.children`. That works when the component under
// test renders flat JSX of mocked primitives + HTML elements. This unit is
// different: `PrivateNetworkPanel` renders TWO instances of a file-private
// `PrivateNetworkPolicySection` FC, and all the load-bearing JSX (radios,
// allowlist inputs, the data-testid attributes the E2E suite depends on)
// lives inside `PrivateNetworkPolicySection`'s body — not inside the
// parent's `props.children`.
//
// `PrivateNetworkPolicySection` is intentionally NOT exported and NOT
// mocked (it's the load-bearing helper the unit is meant to preserve), so
// the walker must invoke any non-mocked, non-primitive FC element it
// encounters and yield from the resulting subtree. The mocked `Section`
// is detected by reference equality and yielded as a leaf — its children
// continue to be walked through `props.children` (as in the standard
// pattern, since the orchestrator passes JSX children through Section).

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
  const isMock = el.type === mocks.MockSection;
  const isFunctionFC = typeof el.type === 'function' && !isMock;
  if (isFunctionFC) {
    // Invoke the file-private FC and walk its rendered subtree.
    const FC = el.type as (props: unknown) => React.ReactNode;
    const rendered = FC(el.props);
    yield* walk(rendered as ReactNodeLike);
    return;
  }
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

// ─── Helpers ────────────────────────────────────────────────────────────────

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

interface LabelProps {
  ['data-testid']?: string;
  children?: React.ReactNode;
}

interface InputProps {
  type: string;
  name?: string;
  value: string;
  checked?: boolean;
  onChange: (e?: { target: { value: string } }) => void;
  placeholder?: string;
  ['data-testid']?: string;
}

interface ButtonProps {
  onClick: () => void;
  ['data-testid']?: string;
  ['aria-label']?: string;
  children?: React.ReactNode;
}

const findSections = (tree: React.ReactNode): React.ReactElement[] =>
  findByPredicate(tree, (el) => el.type === mocks.MockSection);

const findRadioLabels = (tree: React.ReactNode): React.ReactElement[] =>
  findByPredicate(
    tree,
    (el) =>
      el.type === 'label' &&
      typeof (el.props as LabelProps)['data-testid'] === 'string' &&
      (el.props as LabelProps)['data-testid']!.startsWith('pn-'),
  );

const findRadioByTestid = (tree: React.ReactNode, testid: string): React.ReactElement | undefined => {
  const label = findRadioLabels(tree).find((el) => (el.props as LabelProps)['data-testid'] === testid);
  if (!label) return undefined;
  // The label has a single `<input type="radio">` child — find it.
  const inputs = findByPredicate(label, (el) => el.type === 'input');
  return inputs[0];
};

const findAllowlistInputs = (tree: React.ReactNode, direction: 'inbound' | 'outbound'): React.ReactElement[] =>
  findByPredicate(
    tree,
    (el) =>
      el.type === 'input' &&
      typeof (el.props as InputProps)['data-testid'] === 'string' &&
      (el.props as InputProps)['data-testid']!.startsWith(`pn-${direction}-allowlist-entry-`),
  );

const findAllowlistAddButton = (
  tree: React.ReactNode,
  direction: 'inbound' | 'outbound',
): React.ReactElement | undefined =>
  findByPredicate(
    tree,
    (el) => el.type === 'button' && (el.props as ButtonProps)['data-testid'] === `pn-${direction}-allowlist-add`,
  )[0];

interface RenderResult {
  tree: React.ReactElement;
  updateNodeField: ReturnType<typeof vi.fn>;
}

const renderPanel = (data: Record<string, unknown> = {}): RenderResult => {
  mocks.MockSection.mockClear();
  const updateNodeField = vi.fn();
  const selectedNode = { id: 'pn-1', data };
  const tree = PrivateNetworkPanel({
    selectedNode,
    updateNodeField,
  }) as React.ReactElement;
  return { tree, updateNodeField };
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('PrivateNetworkPanel', () => {
  describe('Section rendering', () => {
    it('renders both inbound and outbound policy sections (via two `Section` mocks)', () => {
      const { tree } = renderPanel();
      const sections = findSections(tree);
      expect(sections).toHaveLength(2);
      expect((sections[0].props as SectionProps).title).toBe('Inbound internet');
      expect((sections[1].props as SectionProps).title).toBe('Outbound internet');
    });

    it('passes the inbound and outbound hint copy through to the section bodies', () => {
      const { tree } = renderPanel();
      // Hint <p> is the first child inside each Section; find paragraphs that
      // contain the expected copy.
      const paragraphs = findByPredicate(tree, (el) => el.type === 'p');
      const texts = paragraphs.map((p) => {
        const c = (p.props as { children?: unknown }).children;
        return typeof c === 'string' ? c : '';
      });
      expect(texts.some((t) => t.includes('public internet can reach'))).toBe(true);
      expect(texts.some((t) => t.includes('reach the public internet'))).toBe(true);
    });
  });

  describe('Default policy values', () => {
    it("inbound default 'all' when selectedNode.data.ingress is missing", () => {
      const { tree } = renderPanel();
      const radio = findRadioByTestid(tree, 'pn-inbound-all');
      expect(radio).toBeDefined();
      expect((radio!.props as InputProps).checked).toBe(true);
    });

    it("outbound default 'all' when selectedNode.data.egress is missing", () => {
      const { tree } = renderPanel();
      const radio = findRadioByTestid(tree, 'pn-outbound-all');
      expect(radio).toBeDefined();
      expect((radio!.props as InputProps).checked).toBe(true);
    });

    it("the other inbound options are not checked when ingress defaults to 'all'", () => {
      const { tree } = renderPanel();
      expect((findRadioByTestid(tree, 'pn-inbound-allowlist')!.props as InputProps).checked).toBe(false);
      expect((findRadioByTestid(tree, 'pn-inbound-none')!.props as InputProps).checked).toBe(false);
    });

    it("the other outbound options are not checked when egress defaults to 'all'", () => {
      const { tree } = renderPanel();
      expect((findRadioByTestid(tree, 'pn-outbound-allowlist')!.props as InputProps).checked).toBe(false);
      expect((findRadioByTestid(tree, 'pn-outbound-none')!.props as InputProps).checked).toBe(false);
    });
  });

  describe('Current policy values from selectedNode.data', () => {
    it('renders the current ingress=allowlist value', () => {
      const { tree } = renderPanel({ ingress: 'allowlist' });
      expect((findRadioByTestid(tree, 'pn-inbound-allowlist')!.props as InputProps).checked).toBe(true);
      expect((findRadioByTestid(tree, 'pn-inbound-all')!.props as InputProps).checked).toBe(false);
      expect((findRadioByTestid(tree, 'pn-inbound-none')!.props as InputProps).checked).toBe(false);
    });

    it('renders the current ingress=none value', () => {
      const { tree } = renderPanel({ ingress: 'none' });
      expect((findRadioByTestid(tree, 'pn-inbound-none')!.props as InputProps).checked).toBe(true);
    });

    it('renders the current egress=allowlist value', () => {
      const { tree } = renderPanel({ egress: 'allowlist' });
      expect((findRadioByTestid(tree, 'pn-outbound-allowlist')!.props as InputProps).checked).toBe(true);
      expect((findRadioByTestid(tree, 'pn-outbound-all')!.props as InputProps).checked).toBe(false);
    });

    it('renders the current egress=none value', () => {
      const { tree } = renderPanel({ egress: 'none' });
      expect((findRadioByTestid(tree, 'pn-outbound-none')!.props as InputProps).checked).toBe(true);
    });

    it('the two directions are independent — ingress=none + egress=all is allowed', () => {
      const { tree } = renderPanel({ ingress: 'none', egress: 'all' });
      expect((findRadioByTestid(tree, 'pn-inbound-none')!.props as InputProps).checked).toBe(true);
      expect((findRadioByTestid(tree, 'pn-outbound-all')!.props as InputProps).checked).toBe(true);
    });
  });

  describe('Radio click → updateNodeField', () => {
    it("clicking inbound 'allowlist' radio dispatches updateNodeField('ingress', 'allowlist')", () => {
      const { tree, updateNodeField } = renderPanel();
      const radio = findRadioByTestid(tree, 'pn-inbound-allowlist')!;
      (radio.props as InputProps).onChange();
      expect(updateNodeField).toHaveBeenCalledTimes(1);
      expect(updateNodeField).toHaveBeenCalledWith('ingress', 'allowlist');
    });

    it("clicking inbound 'none' radio dispatches updateNodeField('ingress', 'none')", () => {
      const { tree, updateNodeField } = renderPanel();
      (findRadioByTestid(tree, 'pn-inbound-none')!.props as InputProps).onChange();
      expect(updateNodeField).toHaveBeenCalledWith('ingress', 'none');
    });

    it("clicking outbound 'allowlist' radio dispatches updateNodeField('egress', 'allowlist')", () => {
      const { tree, updateNodeField } = renderPanel();
      const radio = findRadioByTestid(tree, 'pn-outbound-allowlist')!;
      (radio.props as InputProps).onChange();
      expect(updateNodeField).toHaveBeenCalledTimes(1);
      expect(updateNodeField).toHaveBeenCalledWith('egress', 'allowlist');
    });

    it("clicking outbound 'none' radio dispatches updateNodeField('egress', 'none')", () => {
      const { tree, updateNodeField } = renderPanel();
      (findRadioByTestid(tree, 'pn-outbound-none')!.props as InputProps).onChange();
      expect(updateNodeField).toHaveBeenCalledWith('egress', 'none');
    });
  });

  describe('Allowlist field — visibility', () => {
    it("inbound allowlist field NOT rendered when ingress='all'", () => {
      const { tree } = renderPanel({ ingress: 'all' });
      expect(findAllowlistAddButton(tree, 'inbound')).toBeUndefined();
    });

    it("inbound allowlist field NOT rendered when ingress='none'", () => {
      const { tree } = renderPanel({ ingress: 'none' });
      expect(findAllowlistAddButton(tree, 'inbound')).toBeUndefined();
    });

    it("inbound allowlist field IS rendered when ingress='allowlist'", () => {
      const { tree } = renderPanel({ ingress: 'allowlist' });
      expect(findAllowlistAddButton(tree, 'inbound')).toBeDefined();
    });

    it("outbound allowlist field NOT rendered when egress='all'", () => {
      const { tree } = renderPanel({ egress: 'all' });
      expect(findAllowlistAddButton(tree, 'outbound')).toBeUndefined();
    });

    it("outbound allowlist field IS rendered when egress='allowlist'", () => {
      const { tree } = renderPanel({ egress: 'allowlist' });
      expect(findAllowlistAddButton(tree, 'outbound')).toBeDefined();
    });

    it('opening only inbound to allowlist does NOT open outbound allowlist', () => {
      const { tree } = renderPanel({ ingress: 'allowlist', egress: 'all' });
      expect(findAllowlistAddButton(tree, 'inbound')).toBeDefined();
      expect(findAllowlistAddButton(tree, 'outbound')).toBeUndefined();
    });
  });

  describe('Allowlist field — content + edit', () => {
    it('inbound allowlist renders the existing entries with stable indices', () => {
      const { tree } = renderPanel({
        ingress: 'allowlist',
        ingressAllowlist: ['1.2.3.4', '5.6.7.8'],
      });
      const inputs = findAllowlistInputs(tree, 'inbound');
      expect(inputs).toHaveLength(2);
      expect((inputs[0].props as InputProps).value).toBe('1.2.3.4');
      expect((inputs[1].props as InputProps).value).toBe('5.6.7.8');
      expect((inputs[0].props as InputProps)['data-testid']).toBe('pn-inbound-allowlist-entry-0');
      expect((inputs[1].props as InputProps)['data-testid']).toBe('pn-inbound-allowlist-entry-1');
    });

    it("editing an inbound allowlist entry dispatches updateNodeField('ingressAllowlist', updated)", () => {
      const { tree, updateNodeField } = renderPanel({
        ingress: 'allowlist',
        ingressAllowlist: ['1.2.3.4', '5.6.7.8'],
      });
      const inputs = findAllowlistInputs(tree, 'inbound');
      (inputs[1].props as InputProps).onChange({ target: { value: '9.9.9.9' } });
      expect(updateNodeField).toHaveBeenCalledTimes(1);
      expect(updateNodeField).toHaveBeenCalledWith('ingressAllowlist', ['1.2.3.4', '9.9.9.9']);
    });

    it("editing an outbound allowlist entry dispatches updateNodeField('egressAllowlist', updated)", () => {
      const { tree, updateNodeField } = renderPanel({
        egress: 'allowlist',
        egressAllowlist: ['api.stripe.com'],
      });
      const inputs = findAllowlistInputs(tree, 'outbound');
      (inputs[0].props as InputProps).onChange({ target: { value: 'stripe.com' } });
      expect(updateNodeField).toHaveBeenCalledWith('egressAllowlist', ['stripe.com']);
    });

    it("clicking the inbound add-button dispatches updateNodeField('ingressAllowlist', [...existing, ''])", () => {
      const { tree, updateNodeField } = renderPanel({
        ingress: 'allowlist',
        ingressAllowlist: ['1.2.3.4'],
      });
      const addBtn = findAllowlistAddButton(tree, 'inbound')!;
      (addBtn.props as ButtonProps).onClick();
      expect(updateNodeField).toHaveBeenCalledTimes(1);
      expect(updateNodeField).toHaveBeenCalledWith('ingressAllowlist', ['1.2.3.4', '']);
    });

    it("clicking the outbound add-button dispatches updateNodeField('egressAllowlist', [...existing, ''])", () => {
      const { tree, updateNodeField } = renderPanel({
        egress: 'allowlist',
        egressAllowlist: ['api.stripe.com'],
      });
      const addBtn = findAllowlistAddButton(tree, 'outbound')!;
      (addBtn.props as ButtonProps).onClick();
      expect(updateNodeField).toHaveBeenCalledWith('egressAllowlist', ['api.stripe.com', '']);
    });

    it('add-button on an empty allowlist appends a single empty entry', () => {
      const { tree, updateNodeField } = renderPanel({ ingress: 'allowlist' });
      const addBtn = findAllowlistAddButton(tree, 'inbound')!;
      (addBtn.props as ButtonProps).onClick();
      expect(updateNodeField).toHaveBeenCalledWith('ingressAllowlist', ['']);
    });

    it('inbound remove button removes the matching entry by index', () => {
      const { tree, updateNodeField } = renderPanel({
        ingress: 'allowlist',
        ingressAllowlist: ['a', 'b', 'c'],
      });
      const removeBtns = findByPredicate(
        tree,
        (el) => el.type === 'button' && (el.props as ButtonProps)['aria-label'] === 'Remove source',
      );
      expect(removeBtns).toHaveLength(3);
      (removeBtns[1].props as ButtonProps).onClick();
      expect(updateNodeField).toHaveBeenCalledWith('ingressAllowlist', ['a', 'c']);
    });

    it('outbound remove button removes the matching entry by index', () => {
      const { tree, updateNodeField } = renderPanel({
        egress: 'allowlist',
        egressAllowlist: ['x', 'y', 'z'],
      });
      const removeBtns = findByPredicate(
        tree,
        (el) => el.type === 'button' && (el.props as ButtonProps)['aria-label'] === 'Remove destination',
      );
      expect(removeBtns).toHaveLength(3);
      (removeBtns[0].props as ButtonProps).onClick();
      expect(updateNodeField).toHaveBeenCalledWith('egressAllowlist', ['y', 'z']);
    });

    it('renders the empty-state copy when allowlist is empty under allowlist policy', () => {
      const { tree } = renderPanel({ ingress: 'allowlist', ingressAllowlist: [] });
      const empty = findByPredicate(
        tree,
        (el) =>
          el.type === 'div' &&
          typeof (el.props as { children?: unknown }).children === 'string' &&
          ((el.props as { children: string }).children as string).includes('No entries yet'),
      );
      expect(empty.length).toBeGreaterThan(0);
    });

    it('inbound allowlist label reads "Allowed sources"', () => {
      const { tree } = renderPanel({ ingress: 'allowlist' });
      const labels = findByPredicate(
        tree,
        (el) =>
          el.type === 'div' &&
          typeof (el.props as { children?: unknown }).children === 'string' &&
          (el.props as { children: string }).children === 'Allowed sources',
      );
      expect(labels.length).toBe(1);
    });

    it('outbound allowlist label reads "Allowed destinations"', () => {
      const { tree } = renderPanel({ egress: 'allowlist' });
      const labels = findByPredicate(
        tree,
        (el) =>
          el.type === 'div' &&
          typeof (el.props as { children?: unknown }).children === 'string' &&
          (el.props as { children: string }).children === 'Allowed destinations',
      );
      expect(labels.length).toBe(1);
    });
  });

  describe('data-testid preservation (E2E selector contract — blueprint risk flag #7)', () => {
    it('all three inbound radio labels carry data-testid="pn-inbound-{value}"', () => {
      const { tree } = renderPanel();
      const labels = findRadioLabels(tree);
      const inboundIds = labels
        .map((l) => (l.props as LabelProps)['data-testid']!)
        .filter((id) => id.startsWith('pn-inbound-'));
      expect(inboundIds.sort()).toEqual(['pn-inbound-all', 'pn-inbound-allowlist', 'pn-inbound-none']);
    });

    it('all three outbound radio labels carry data-testid="pn-outbound-{value}"', () => {
      const { tree } = renderPanel();
      const labels = findRadioLabels(tree);
      const outboundIds = labels
        .map((l) => (l.props as LabelProps)['data-testid']!)
        .filter((id) => id.startsWith('pn-outbound-'));
      expect(outboundIds.sort()).toEqual(['pn-outbound-all', 'pn-outbound-allowlist', 'pn-outbound-none']);
    });

    it('allowlist entry inputs carry data-testid="pn-inbound-allowlist-entry-{i}" verbatim', () => {
      const { tree } = renderPanel({
        ingress: 'allowlist',
        ingressAllowlist: ['x', 'y', 'z'],
      });
      const inputs = findAllowlistInputs(tree, 'inbound');
      expect(inputs.map((i) => (i.props as InputProps)['data-testid'])).toEqual([
        'pn-inbound-allowlist-entry-0',
        'pn-inbound-allowlist-entry-1',
        'pn-inbound-allowlist-entry-2',
      ]);
    });

    it('allowlist entry inputs carry data-testid="pn-outbound-allowlist-entry-{i}" verbatim', () => {
      const { tree } = renderPanel({
        egress: 'allowlist',
        egressAllowlist: ['a', 'b'],
      });
      const inputs = findAllowlistInputs(tree, 'outbound');
      expect(inputs.map((i) => (i.props as InputProps)['data-testid'])).toEqual([
        'pn-outbound-allowlist-entry-0',
        'pn-outbound-allowlist-entry-1',
      ]);
    });

    it('inbound add-button carries data-testid="pn-inbound-allowlist-add" verbatim', () => {
      const { tree } = renderPanel({ ingress: 'allowlist' });
      const btn = findAllowlistAddButton(tree, 'inbound');
      expect(btn).toBeDefined();
      expect((btn!.props as ButtonProps)['data-testid']).toBe('pn-inbound-allowlist-add');
    });

    it('outbound add-button carries data-testid="pn-outbound-allowlist-add" verbatim', () => {
      const { tree } = renderPanel({ egress: 'allowlist' });
      const btn = findAllowlistAddButton(tree, 'outbound');
      expect(btn).toBeDefined();
      expect((btn!.props as ButtonProps)['data-testid']).toBe('pn-outbound-allowlist-add');
    });

    it("radio inputs carry name='private-network-{direction}' for grouping", () => {
      const { tree } = renderPanel();
      const inboundRadio = findRadioByTestid(tree, 'pn-inbound-all')!;
      const outboundRadio = findRadioByTestid(tree, 'pn-outbound-all')!;
      expect((inboundRadio.props as InputProps).name).toBe('private-network-inbound');
      expect((outboundRadio.props as InputProps).name).toBe('private-network-outbound');
    });
  });

  describe('Allowlist shallow-copy preserves the original (no mutation of upstream)', () => {
    it('updateEntry on an entry uses .slice() — does not mutate selectedNode.data.ingressAllowlist', () => {
      const original = ['1.2.3.4', '5.6.7.8'];
      const { tree, updateNodeField } = renderPanel({
        ingress: 'allowlist',
        ingressAllowlist: original,
      });
      const inputs = findAllowlistInputs(tree, 'inbound');
      (inputs[1].props as InputProps).onChange({ target: { value: 'CHANGED' } });
      expect(original).toEqual(['1.2.3.4', '5.6.7.8']);
      const [, payload] = updateNodeField.mock.calls[0];
      expect(payload).toEqual(['1.2.3.4', 'CHANGED']);
    });
  });

  describe('Empty / missing selectedNode.data — defensive defaults', () => {
    it('selectedNode.data undefined → renders defaults without throwing', () => {
      const updateNodeField = vi.fn();
      const tree = PrivateNetworkPanel({
        selectedNode: { id: 'pn-1' },
        updateNodeField,
      }) as React.ReactElement;
      const sections = findSections(tree);
      expect(sections).toHaveLength(2);
      expect((findRadioByTestid(tree, 'pn-inbound-all')!.props as InputProps).checked).toBe(true);
      expect((findRadioByTestid(tree, 'pn-outbound-all')!.props as InputProps).checked).toBe(true);
    });

    it('selectedNode itself null/undefined → still renders both sections with default policies', () => {
      const updateNodeField = vi.fn();
      const tree = PrivateNetworkPanel({
        selectedNode: null,
        updateNodeField,
      }) as React.ReactElement;
      const sections = findSections(tree);
      expect(sections).toHaveLength(2);
      expect((findRadioByTestid(tree, 'pn-inbound-all')!.props as InputProps).checked).toBe(true);
    });
  });
});

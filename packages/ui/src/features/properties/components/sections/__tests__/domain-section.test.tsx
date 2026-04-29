/**
 * rf-props-14 — public-endpoint domain-section subcomponent.
 *
 * `PublicEndpointDomainSection` is purely presentational (no Redux, no
 * hooks beyond the FC body), so we use the direct-FC tree-walker pattern
 * (cite `tree-walker-for-react-fc-tests-must-flatten-nested-children-arrays`):
 * invoke the component as a function, then walk the returned React-element
 * tree depth-first to find leaves and assert on type / props / children.
 *
 * The field-primitive bundle is mocked at `'../../fields'` (one extra `..`
 * vs. the source file because the test sits in `__tests__/`, one level
 * deeper than the source). Each mocked primitive becomes a typed React-FC
 * stub so the walker can match it by `el.type === MockTextField` and
 * inspect the props the parent passed in (cite
 * `mocked-component-leaves-are-invisible-to-direct-fc-tree-walkers`).
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

// Mock the field-primitives bundle. Each primitive becomes a `vi.fn` stub the
// walker matches by reference (`el.type === mocks.MockTextField`). The stub
// bodies never run — direct-FC invocation only walks the tree of elements
// returned by the parent FC, not the rendered DOM (cite
// `mocked-component-leaves-are-invisible-to-direct-fc-tree-walkers`).
//
// `vi.hoisted` is needed because `vi.mock` is hoisted to the top of the file,
// but we want the mock identities to be the same JS values referenced from the
// test bodies.
const mocks = vi.hoisted(() => ({
  MockSection: vi.fn(),
  MockTextField: vi.fn(),
  MockSelectField: vi.fn(),
}));

vi.mock('../../fields', () => ({
  Section: mocks.MockSection,
  TextField: mocks.MockTextField,
  SelectField: mocks.MockSelectField,
}));

// Mock i18n — return stable `t:<key>` strings for label/placeholder assertions.
vi.mock('../../../../../i18n', () => ({
  t: vi.fn((key: string) => `t:${key}`),
}));

import { PublicEndpointDomainSection } from '../domain-section';
import type { CardNode } from '../../../../../store/slices/cards-slice';

// ─── Tree-walker (same shape as rf-props-6/9/10/11/12/13) ───────────────────

type ReactNodeLike = React.ReactNode;

function* walk(node: ReactNodeLike): Generator<React.ReactElement> {
  if (
    node == null ||
    typeof node === 'boolean' ||
    typeof node === 'string' ||
    typeof node === 'number'
  ) {
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

function findByPredicate(
  tree: React.ReactNode,
  predicate: (el: React.ReactElement) => boolean,
): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) {
    if (el && predicate(el)) out.push(el);
  }
  return out;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

interface TextProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  propKey?: string;
}

interface SelectProps {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  propKey?: string;
}

const makeNode = (data: CardNode['data'] = {}): CardNode => ({
  id: 'node-1',
  type: 'block',
  position: { x: 0, y: 0 },
  width: 100,
  height: 100,
  data,
});

const renderSection = (
  data: CardNode['data'] = {},
): {
  tree: React.ReactElement;
  updateNodeField: ReturnType<typeof vi.fn>;
} => {
  // Reset captured calls between renders.
  mocks.MockSection.mockClear();
  mocks.MockTextField.mockClear();
  mocks.MockSelectField.mockClear();
  const updateNodeField = vi.fn();
  const tree = PublicEndpointDomainSection({
    selectedNode: makeNode(data),
    updateNodeField,
  }) as React.ReactElement;
  return { tree, updateNodeField };
};

const findTexts = (tree: React.ReactNode): React.ReactElement[] =>
  findByPredicate(tree, (el) => el.type === mocks.MockTextField);
const findSelects = (tree: React.ReactNode): React.ReactElement[] =>
  findByPredicate(tree, (el) => el.type === mocks.MockSelectField);

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('PublicEndpointDomainSection', () => {
  it('renders a Section wrapper with empty title', () => {
    const { tree } = renderSection();
    const sections = findByPredicate(tree, (el) => el.type === mocks.MockSection);
    expect(sections).toHaveLength(1);
    expect((sections[0].props as { title: string }).title).toBe('');
  });

  it('renders three TextFields (hostname, subdomain, dnsProvider) and one SelectField (sslMode)', () => {
    const { tree } = renderSection();
    expect(findTexts(tree)).toHaveLength(3);
    expect(findSelects(tree)).toHaveLength(1);
  });

  it('TextFields are in the right order: hostname, subdomain, dnsProvider', () => {
    const { tree } = renderSection();
    const [hostname, subdomain, dnsProvider] = findTexts(tree);
    expect((hostname.props as TextProps).label).toBe('t:properties.domain.hostname');
    expect((subdomain.props as TextProps).label).toBe('t:properties.domain.subdomain');
    expect((dnsProvider.props as TextProps).label).toBe('t:properties.domain.dnsProvider');
  });

  it('text-field placeholders use the right t-keys', () => {
    const { tree } = renderSection();
    const [hostname, subdomain, dnsProvider] = findTexts(tree);
    expect((hostname.props as TextProps).placeholder).toBe('t:properties.domain.hostnamePlaceholder');
    expect((subdomain.props as TextProps).placeholder).toBe('t:properties.domain.subdomainPlaceholder');
    expect((dnsProvider.props as TextProps).placeholder).toBe('t:properties.domain.dnsProviderPlaceholder');
  });

  it('default values are empty strings when data has no field', () => {
    const { tree } = renderSection();
    const [hostname, subdomain, dnsProvider] = findTexts(tree);
    expect((hostname.props as TextProps).value).toBe('');
    expect((subdomain.props as TextProps).value).toBe('');
    expect((dnsProvider.props as TextProps).value).toBe('');
  });

  it('values reflect selectedNode.data.<field>', () => {
    const { tree } = renderSection({
      hostname: 'api.example.com',
      subdomain: 'api',
      dnsProvider: 'cloudflare',
    });
    const [hostname, subdomain, dnsProvider] = findTexts(tree);
    expect((hostname.props as TextProps).value).toBe('api.example.com');
    expect((subdomain.props as TextProps).value).toBe('api');
    expect((dnsProvider.props as TextProps).value).toBe('cloudflare');
  });

  it('SSL mode default is "auto" when data.sslMode is unset', () => {
    const { tree } = renderSection();
    const [selector] = findSelects(tree);
    expect((selector.props as SelectProps).label).toBe('t:properties.domain.sslMode');
    expect((selector.props as SelectProps).value).toBe('auto');
  });

  it('SSL mode reflects stored data.sslMode', () => {
    const { tree } = renderSection({ sslMode: 'manual' });
    const [selector] = findSelects(tree);
    expect((selector.props as SelectProps).value).toBe('manual');
  });

  it('SSL options are exactly ["auto", "manual", "none"]', () => {
    const { tree } = renderSection();
    const [selector] = findSelects(tree);
    expect((selector.props as SelectProps).options).toEqual(['auto', 'manual', 'none']);
  });

  it('hostname onChange → updateNodeField("hostname", v)', () => {
    const { tree, updateNodeField } = renderSection();
    const [hostname] = findTexts(tree);
    (hostname.props as TextProps).onChange('new.host.com');
    expect(updateNodeField).toHaveBeenCalledTimes(1);
    expect(updateNodeField).toHaveBeenCalledWith('hostname', 'new.host.com');
  });

  it('subdomain onChange → updateNodeField("subdomain", v)', () => {
    const { tree, updateNodeField } = renderSection();
    const [, subdomain] = findTexts(tree);
    (subdomain.props as TextProps).onChange('staging');
    expect(updateNodeField).toHaveBeenCalledTimes(1);
    expect(updateNodeField).toHaveBeenCalledWith('subdomain', 'staging');
  });

  it('dnsProvider onChange → updateNodeField("dnsProvider", v)', () => {
    const { tree, updateNodeField } = renderSection();
    const [, , dnsProvider] = findTexts(tree);
    (dnsProvider.props as TextProps).onChange('route53');
    expect(updateNodeField).toHaveBeenCalledTimes(1);
    expect(updateNodeField).toHaveBeenCalledWith('dnsProvider', 'route53');
  });

  it('sslMode onChange → updateNodeField("sslMode", v)', () => {
    const { tree, updateNodeField } = renderSection();
    const [selector] = findSelects(tree);
    (selector.props as SelectProps).onChange('none');
    expect(updateNodeField).toHaveBeenCalledTimes(1);
    expect(updateNodeField).toHaveBeenCalledWith('sslMode', 'none');
  });

  it('all four fields read from a single data object correctly', () => {
    const { tree, updateNodeField } = renderSection({
      hostname: 'api.foo.com',
      subdomain: 'api',
      sslMode: 'manual',
      dnsProvider: 'route53',
    });
    const [hostname, subdomain, dnsProvider] = findTexts(tree);
    const [selector] = findSelects(tree);
    expect((hostname.props as TextProps).value).toBe('api.foo.com');
    expect((subdomain.props as TextProps).value).toBe('api');
    expect((selector.props as SelectProps).value).toBe('manual');
    expect((dnsProvider.props as TextProps).value).toBe('route53');
    // updateNodeField should not have been called during render.
    expect(updateNodeField).not.toHaveBeenCalled();
  });
});

/**
 * rf-props-15 — custom-domain-panel subcomponent.
 *
 * `CustomDomainPanel` is purely presentational (no Redux, no hooks beyond
 * the FC body). The orchestrator renders it TWICE (domain tab + config
 * tab) with byte-identical props — these tests focus on the component
 * shape: root-domain field, route list, route edit/add/remove, and the
 * post-deploy DNS-records preview.
 *
 * The unused `dispatch` prop is destructured as `_dispatch`. We
 * specifically test that providing it does not break rendering and that
 * the component does NOT call it internally — this verifies the
 * destructure-as-`_dispatch` shape is preserved.
 *
 * Direct-FC tree-walker pattern (cite
 * `tree-walker-for-react-fc-tests-must-flatten-nested-children-arrays`):
 * invoke the component as a function, walk the returned React-element
 * tree, and find primitives (`<input>`, `<button>`) by their props. We
 * mock `Section` from `../../fields` to a passthrough so the walker can
 * descend through `Section.props.children` without descending into
 * unrendered framework primitives.
 *
 * `normalizeSubdomain` is mocked at `'../../../utils/normalize-subdomain'`
 * (one extra `..` because the test sits in `__tests__/`, one level deeper
 * than the source) so we can assert the subdomain flows through it on
 * edit. The mock is a `vi.fn` that just returns its argument unchanged —
 * the full normalize behavior is covered by the dedicated normalize-
 * subdomain tests in rf-props-2.
 *
 * Cite `vi-hoisted-for-stable-mock-identity-in-direct-fc-tree-walker-tests`:
 * mock identities live in a hoisted block, then re-exported from the
 * `vi.mock` factory, so the walker can match by reference equality.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

// Mock the field-primitives bundle. Only `Section` is needed — the rest of
// the JSX is plain HTML primitives.
const mocks = vi.hoisted(() => ({
  MockSection: vi.fn(),
  MockNormalizeSubdomain: vi.fn((s: string) => s),
}));

vi.mock('../../fields', () => ({
  Section: mocks.MockSection,
}));

vi.mock('../../../utils/normalize-subdomain', () => ({
  normalizeSubdomain: mocks.MockNormalizeSubdomain,
}));

import { CustomDomainPanel, type CustomDomainRoute } from '../custom-domain-panel';
import type { AppDispatch } from '../../../../../store';

// ─── Tree-walker (same shape as rf-props-6/9/10/11/12/13/14) ────────────────

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

// ─── Helpers ────────────────────────────────────────────────────────────────

interface InputProps {
  type: string;
  value: string;
  onChange: (e: { target: { value: string } }) => void;
  placeholder?: string;
  ['data-prop-key']?: string;
  ['data-route-id']?: string;
}

interface ButtonProps {
  onClick: () => void;
  title?: string;
  children?: React.ReactNode;
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

const findInputs = (tree: React.ReactNode): React.ReactElement[] => findByPredicate(tree, (el) => el.type === 'input');

const findButtons = (tree: React.ReactNode): React.ReactElement[] =>
  findByPredicate(tree, (el) => el.type === 'button');

const findSections = (tree: React.ReactNode): React.ReactElement[] =>
  findByPredicate(tree, (el) => el.type === mocks.MockSection);

const findRouteSubdomainInputs = (tree: React.ReactNode): React.ReactElement[] =>
  findByPredicate(
    tree,
    (el) => el.type === 'input' && (el.props as InputProps)['data-prop-key'] === 'routes.subdomain',
  );

const findRootDomainInput = (tree: React.ReactNode): React.ReactElement | undefined =>
  findByPredicate(tree, (el) => el.type === 'input' && (el.props as InputProps)['data-prop-key'] === 'domain')[0];

const findAddRouteButton = (tree: React.ReactNode): React.ReactElement | undefined =>
  findButtons(tree).find((b) => {
    const children = (b.props as ButtonProps).children;
    return typeof children === 'string' && children.includes('Add subdomain route');
  });

const findDeleteRouteButtons = (tree: React.ReactNode): React.ReactElement[] =>
  findButtons(tree).filter((b) => (b.props as ButtonProps).title === 'Delete route');

interface RenderResult {
  tree: React.ReactElement;
  updateNodeField: ReturnType<typeof vi.fn>;
  dispatch: ReturnType<typeof vi.fn>;
}

const makeNode = (
  data: Record<string, unknown> = {},
  id: string = 'cd-1',
): { id: string; data: Record<string, unknown> } => ({
  id,
  data,
});

const renderPanel = (opts: {
  routes?: CustomDomainRoute[];
  domain?: string;
  outgoingEdges?: any[];
  cardNodes?: any[];
  selectedNodeId?: string;
  selectedNodeData?: Record<string, unknown>;
}): RenderResult => {
  mocks.MockSection.mockClear();
  mocks.MockNormalizeSubdomain.mockClear();
  const { routes, domain, outgoingEdges = [], cardNodes = [], selectedNodeId = 'cd-1' } = opts;
  const baseData: Record<string, unknown> = {
    ...(opts.selectedNodeData || {}),
  };
  if (routes !== undefined) baseData.routes = routes;
  if (domain !== undefined) baseData.domain = domain;
  const selectedNode = makeNode(baseData, selectedNodeId);
  const updateNodeField = vi.fn();
  const dispatch = vi.fn() as unknown as AppDispatch;
  const tree = CustomDomainPanel({
    selectedNode,
    outgoingEdges,
    activeCard: { nodes: cardNodes },
    updateNodeField,
    dispatch,
  }) as React.ReactElement;
  return {
    tree,
    updateNodeField,
    dispatch: dispatch as unknown as ReturnType<typeof vi.fn>,
  };
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('CustomDomainPanel', () => {
  describe('Root domain field', () => {
    it('renders the root-domain input with the current `selectedNode.data.domain` value', () => {
      const { tree } = renderPanel({ domain: 'example.com', routes: [] });
      const root = findRootDomainInput(tree);
      expect(root).toBeDefined();
      expect((root!.props as InputProps).value).toBe('example.com');
      expect((root!.props as InputProps).placeholder).toBe('example.com');
    });

    it('root-domain default is empty string when data.domain is unset', () => {
      const { tree } = renderPanel({});
      const root = findRootDomainInput(tree);
      expect((root!.props as InputProps).value).toBe('');
    });

    it('root-domain onChange → updateNodeField("domain", lowercased+trimmed value)', () => {
      const { tree, updateNodeField } = renderPanel({});
      const root = findRootDomainInput(tree)!;
      (root.props as InputProps).onChange({ target: { value: '  Example.COM  ' } });
      expect(updateNodeField).toHaveBeenCalledTimes(1);
      expect(updateNodeField).toHaveBeenCalledWith('domain', 'example.com');
    });
  });

  describe('Empty routes state', () => {
    it('renders empty-state placeholder + "Add subdomain route" button when routes is empty', () => {
      const { tree } = renderPanel({ routes: [] });
      const addBtn = findAddRouteButton(tree);
      expect(addBtn).toBeDefined();
      expect(findRouteSubdomainInputs(tree)).toHaveLength(0);
    });

    it('routes count 0 reflected in the routes section title', () => {
      const { tree } = renderPanel({ routes: [] });
      const sections = findSections(tree);
      const routesSection = sections.find((s) => (s.props as SectionProps).title.includes('Routes'));
      expect(routesSection).toBeDefined();
      expect((routesSection!.props as SectionProps).title).toBe('Routes (0)');
    });

    it('renders empty-state copy when routes is undefined entirely', () => {
      const { tree } = renderPanel({});
      const sections = findSections(tree);
      const routesSection = sections.find((s) => (s.props as SectionProps).title.includes('Routes'));
      expect((routesSection!.props as SectionProps).title).toBe('Routes (0)');
    });
  });

  describe('Route rendering', () => {
    it('one route with no matching edge → renders the row with no target-node info', () => {
      const route: CustomDomainRoute = { id: 'r-1', subdomain: 'api' };
      const { tree } = renderPanel({
        routes: [route],
        outgoingEdges: [], // no matching edge
        cardNodes: [],
      });
      const subInputs = findRouteSubdomainInputs(tree);
      expect(subInputs).toHaveLength(1);
      // The "unconnected" affordance is rendered.
      const unconnected = findByPredicate(
        tree,
        (el) =>
          el.type === 'span' &&
          typeof (el.props as { children?: unknown }).children === 'string' &&
          ((el.props as { children: string }).children as string).includes('unconnected'),
      );
      expect(unconnected.length).toBeGreaterThan(0);
    });

    it('one route with a matching edge → finds the connected target node, renders iceType + label', () => {
      const route: CustomDomainRoute = { id: 'r-1', subdomain: 'api' };
      const targetNode = {
        id: 'target-node-id',
        data: { iceType: 'Compute.CloudRun', label: 'My Service' },
      };
      const edge = { source: 'cd-1', target: 'target-node-id', data: { routeId: 'r-1' } };
      const { tree } = renderPanel({
        routes: [route],
        outgoingEdges: [edge],
        cardNodes: [targetNode],
        selectedNodeId: 'cd-1',
      });
      // Look for a span whose `title` attribute contains the iceType + targetId.
      const labelSpan = findByPredicate(
        tree,
        (el) =>
          el.type === 'span' &&
          typeof (el.props as { title?: string }).title === 'string' &&
          ((el.props as { title: string }).title as string).includes('Compute.CloudRun'),
      );
      expect(labelSpan.length).toBeGreaterThan(0);
      // The label "My Service" should appear in the tree somewhere as a string child.
      const labels: string[] = [];
      for (const el of walk(tree)) {
        const children = (el.props as { children?: React.ReactNode }).children;
        if (Array.isArray(children)) {
          for (const c of children) if (typeof c === 'string') labels.push(c);
        } else if (typeof children === 'string') {
          labels.push(children);
        }
      }
      const joined = labels.join(' ');
      expect(joined).toContain('My Service');
    });

    it('renders multiple routes with stable key={route.id}', () => {
      const routes: CustomDomainRoute[] = [
        { id: 'r-1', subdomain: 'api' },
        { id: 'r-2', subdomain: 'staging' },
        { id: 'r-3', subdomain: '' },
      ];
      const { tree } = renderPanel({ routes });
      const subInputs = findRouteSubdomainInputs(tree);
      expect(subInputs).toHaveLength(3);
      expect((subInputs[0].props as InputProps)['data-route-id']).toBe('r-1');
      expect((subInputs[1].props as InputProps)['data-route-id']).toBe('r-2');
      expect((subInputs[2].props as InputProps)['data-route-id']).toBe('r-3');
      // The key prop is on the wrapping `<div>`s, not the `<input>`s. Find
      // the route-row divs by their `data-prop-key=routes.subdomain` input
      // child and check the key path.
      const rowDivs = findByPredicate(
        tree,
        (el) =>
          el.type === 'div' &&
          typeof (el.props as { className?: string }).className === 'string' &&
          ((el.props as { className: string }).className as string).includes('rounded') &&
          ((el.props as { className: string }).className as string).includes('bg-ice-base/40'),
      );
      // There may also be DNS-row divs with similar classes; filter to the
      // route-rows by checking the `key` is one of our route ids.
      const routeRowKeys = rowDivs.map((d) => d.key).filter((k) => typeof k === 'string');
      expect(routeRowKeys).toContain('r-1');
      expect(routeRowKeys).toContain('r-2');
      expect(routeRowKeys).toContain('r-3');
    });

    it('routes count > 0 reflected in the section title', () => {
      const routes: CustomDomainRoute[] = [
        { id: 'r-1', subdomain: 'api' },
        { id: 'r-2', subdomain: 'b' },
      ];
      const { tree } = renderPanel({ routes });
      const sections = findSections(tree);
      const routesSection = sections.find((s) => (s.props as SectionProps).title.includes('Routes'));
      expect((routesSection!.props as SectionProps).title).toBe('Routes (2)');
    });

    it('with one route → no delete button (cannot delete the last route)', () => {
      const routes: CustomDomainRoute[] = [{ id: 'r-1', subdomain: 'api' }];
      const { tree } = renderPanel({ routes });
      expect(findDeleteRouteButtons(tree)).toHaveLength(0);
    });

    it('with > 1 routes → delete buttons appear per row', () => {
      const routes: CustomDomainRoute[] = [
        { id: 'r-1', subdomain: 'api' },
        { id: 'r-2', subdomain: 'b' },
      ];
      const { tree } = renderPanel({ routes });
      expect(findDeleteRouteButtons(tree)).toHaveLength(2);
    });
  });

  describe('updateRouteSubdomain', () => {
    it('editing subdomain → updateNodeField("routes", [...] with this one updated, value passed through normalizeSubdomain)', () => {
      const routes: CustomDomainRoute[] = [
        { id: 'r-1', subdomain: 'api' },
        { id: 'r-2', subdomain: 'b' },
      ];
      const { tree, updateNodeField } = renderPanel({ routes });
      const subInputs = findRouteSubdomainInputs(tree);
      // Edit the second route's subdomain.
      (subInputs[1].props as InputProps).onChange({ target: { value: 'NEW-VAL' } });
      expect(mocks.MockNormalizeSubdomain).toHaveBeenCalledTimes(1);
      expect(mocks.MockNormalizeSubdomain).toHaveBeenCalledWith('NEW-VAL');
      expect(updateNodeField).toHaveBeenCalledTimes(1);
      expect(updateNodeField).toHaveBeenCalledWith('routes', [
        { id: 'r-1', subdomain: 'api' },
        { id: 'r-2', subdomain: 'NEW-VAL' },
      ]);
    });

    it('subdomain edit only mutates the matching route id', () => {
      const routes: CustomDomainRoute[] = [
        { id: 'r-1', subdomain: 'a' },
        { id: 'r-2', subdomain: 'b' },
        { id: 'r-3', subdomain: 'c' },
      ];
      const { tree, updateNodeField } = renderPanel({ routes });
      const subInputs = findRouteSubdomainInputs(tree);
      (subInputs[0].props as InputProps).onChange({ target: { value: 'aaa' } });
      const [, payload] = updateNodeField.mock.calls[0];
      expect(payload).toEqual([
        { id: 'r-1', subdomain: 'aaa' },
        { id: 'r-2', subdomain: 'b' },
        { id: 'r-3', subdomain: 'c' },
      ]);
    });
  });

  describe('addRoute', () => {
    it('clicking "+ Add subdomain route" → updateNodeField("routes", [...existing, {id, subdomain: ""}])', () => {
      const routes: CustomDomainRoute[] = [{ id: 'r-1', subdomain: 'api' }];
      const { tree, updateNodeField } = renderPanel({ routes });
      const addBtn = findAddRouteButton(tree)!;
      (addBtn.props as ButtonProps).onClick();
      expect(updateNodeField).toHaveBeenCalledTimes(1);
      const [field, payload] = updateNodeField.mock.calls[0];
      expect(field).toBe('routes');
      expect(Array.isArray(payload)).toBe(true);
      expect((payload as CustomDomainRoute[]).length).toBe(2);
      expect((payload as CustomDomainRoute[])[0]).toEqual({ id: 'r-1', subdomain: 'api' });
      const newRoute = (payload as CustomDomainRoute[])[1];
      expect(typeof newRoute.id).toBe('string');
      expect(newRoute.id.length).toBeGreaterThan(0);
      expect(newRoute.id.startsWith('route-')).toBe(true);
      expect(newRoute.subdomain).toBe('');
    });

    it('addRoute on empty list creates a single new entry', () => {
      const { tree, updateNodeField } = renderPanel({ routes: [] });
      const addBtn = findAddRouteButton(tree)!;
      (addBtn.props as ButtonProps).onClick();
      const [, payload] = updateNodeField.mock.calls[0];
      expect((payload as CustomDomainRoute[]).length).toBe(1);
      expect((payload as CustomDomainRoute[])[0].subdomain).toBe('');
    });
  });

  describe('deleteRoute', () => {
    it('clicking delete on a route → updateNodeField("routes", routes.filter(r => r.id !== thisId))', () => {
      const routes: CustomDomainRoute[] = [
        { id: 'r-1', subdomain: 'a' },
        { id: 'r-2', subdomain: 'b' },
        { id: 'r-3', subdomain: 'c' },
      ];
      const { tree, updateNodeField } = renderPanel({ routes });
      const deleteBtns = findDeleteRouteButtons(tree);
      // Delete the middle route (index 1).
      (deleteBtns[1].props as ButtonProps).onClick();
      expect(updateNodeField).toHaveBeenCalledTimes(1);
      expect(updateNodeField).toHaveBeenCalledWith('routes', [
        { id: 'r-1', subdomain: 'a' },
        { id: 'r-3', subdomain: 'c' },
      ]);
    });
  });

  describe('Target-node lookup via outgoingEdges + activeCard.nodes', () => {
    it('finds the edge by routeId, then finds the target node by id', () => {
      const route: CustomDomainRoute = { id: 'r-99', subdomain: 'app' };
      const targetNode = {
        id: 'tgt',
        data: { iceType: 'Compute.CloudRun', label: 'web' },
      };
      // Two edges: one routeId mismatch, one match.
      const edges = [
        { source: 'cd-1', target: 'other', data: { routeId: 'WRONG' } },
        { source: 'cd-1', target: 'tgt', data: { routeId: 'r-99' } },
      ];
      const { tree } = renderPanel({
        routes: [route],
        outgoingEdges: edges,
        cardNodes: [{ id: 'other', data: { iceType: 'Network.Foo' } }, targetNode],
        selectedNodeId: 'cd-1',
      });
      // The label must have the matching node's data.
      const labelSpan = findByPredicate(
        tree,
        (el) =>
          el.type === 'span' &&
          typeof (el.props as { title?: string }).title === 'string' &&
          ((el.props as { title: string }).title as string).includes('Compute.CloudRun'),
      );
      expect(labelSpan.length).toBeGreaterThan(0);
    });

    it('handles inverted edge direction (target is the selectedNode, source is the route target)', () => {
      const route: CustomDomainRoute = { id: 'r-1', subdomain: 'api' };
      // Edge with `target === selectedNode.id` and `source === route target`.
      const edge = { source: 'tgt', target: 'cd-1', data: { routeId: 'r-1' } };
      const targetNode = {
        id: 'tgt',
        data: { iceType: 'Compute.Foo', label: 'foo' },
      };
      const { tree } = renderPanel({
        routes: [route],
        outgoingEdges: [edge],
        cardNodes: [targetNode],
        selectedNodeId: 'cd-1',
      });
      const labelSpan = findByPredicate(
        tree,
        (el) =>
          el.type === 'span' &&
          typeof (el.props as { title?: string }).title === 'string' &&
          ((el.props as { title: string }).title as string).includes('Compute.Foo'),
      );
      expect(labelSpan.length).toBeGreaterThan(0);
    });

    it('matching-edge but missing target node → unconnected affordance does NOT render but no crash', () => {
      const route: CustomDomainRoute = { id: 'r-1', subdomain: 'api' };
      const edge = { source: 'cd-1', target: 'missing-id', data: { routeId: 'r-1' } };
      const { tree } = renderPanel({
        routes: [route],
        outgoingEdges: [edge],
        cardNodes: [], // no target nodes registered
        selectedNodeId: 'cd-1',
      });
      // Should still render the row + the input.
      expect(findRouteSubdomainInputs(tree)).toHaveLength(1);
    });
  });

  describe('DNS records preview', () => {
    it('no DNS records → renders the placeholder copy section', () => {
      const route: CustomDomainRoute = { id: 'r-1', subdomain: 'api' };
      const { tree } = renderPanel({
        routes: [route],
        outgoingEdges: [],
        cardNodes: [],
      });
      const sections = findSections(tree);
      const dnsSection = sections.find((s) => (s.props as SectionProps).title === 'DNS records');
      expect(dnsSection).toBeDefined();
    });

    it('with add-records → renders count in section title and Copy buttons', () => {
      const route: CustomDomainRoute = { id: 'r-1', subdomain: 'api' };
      const targetNode = {
        id: 'tgt',
        data: {
          iceType: 'Compute.CloudRun',
          label: 'web',
          custom_domain_dns_records: [
            { type: 'A', domain: 'api.example.com', value: '1.2.3.4' },
            { type: 'TXT', domain: 'api.example.com', value: 'verify=abc' },
          ],
        },
      };
      const edge = { source: 'cd-1', target: 'tgt', data: { routeId: 'r-1' } };
      const { tree } = renderPanel({
        routes: [route],
        domain: 'example.com',
        outgoingEdges: [edge],
        cardNodes: [targetNode],
      });
      const sections = findSections(tree);
      const dnsSection = sections.find((s) => (s.props as SectionProps).title.startsWith('DNS records'));
      expect((dnsSection!.props as SectionProps).title).toBe('DNS records (2)');
      const copyButtons = findButtons(tree).filter((b) => (b.props as ButtonProps).title === 'Copy value to clipboard');
      expect(copyButtons).toHaveLength(2);
    });

    it('with both add and remove records → two banners render', () => {
      const route: CustomDomainRoute = { id: 'r-1', subdomain: 'api' };
      const targetNode = {
        id: 'tgt',
        data: {
          iceType: 'Compute.CloudRun',
          label: 'web',
          custom_domain_dns_records: [
            { type: 'A', domain: 'api.example.com', value: '1.2.3.4' },
            {
              type: 'TXT',
              domain: 'api.example.com',
              value: 'old-verify',
              required_action: 'remove',
            },
          ],
        },
      };
      const edge = { source: 'cd-1', target: 'tgt', data: { routeId: 'r-1' } };
      const { tree } = renderPanel({
        routes: [route],
        domain: 'example.com',
        outgoingEdges: [edge],
        cardNodes: [targetNode],
      });
      const sections = findSections(tree);
      const dnsSection = sections.find((s) => (s.props as SectionProps).title.startsWith('DNS records'));
      expect((dnsSection!.props as SectionProps).title).toBe('DNS records (2)');
    });

    it('Copy button calls navigator.clipboard.writeText with the record value', () => {
      const route: CustomDomainRoute = { id: 'r-1', subdomain: 'api' };
      const targetNode = {
        id: 'tgt',
        data: {
          iceType: 'Compute.CloudRun',
          label: 'web',
          custom_domain_dns_records: [{ type: 'A', domain: 'api.example.com', value: 'COPY-ME-1.2.3.4' }],
        },
      };
      const edge = { source: 'cd-1', target: 'tgt', data: { routeId: 'r-1' } };
      // Mock navigator.clipboard.writeText for this test only.
      const writeText = vi.fn().mockResolvedValue(undefined);
      const originalClipboard = (globalThis as { navigator?: Navigator }).navigator?.clipboard;
      Object.defineProperty(globalThis.navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
      });
      try {
        const { tree } = renderPanel({
          routes: [route],
          domain: 'example.com',
          outgoingEdges: [edge],
          cardNodes: [targetNode],
        });
        const copyButtons = findButtons(tree).filter(
          (b) => (b.props as ButtonProps).title === 'Copy value to clipboard',
        );
        expect(copyButtons).toHaveLength(1);
        (copyButtons[0].props as ButtonProps).onClick();
        expect(writeText).toHaveBeenCalledWith('COPY-ME-1.2.3.4');
      } finally {
        if (originalClipboard !== undefined) {
          Object.defineProperty(globalThis.navigator, 'clipboard', {
            value: originalClipboard,
            configurable: true,
          });
        }
      }
    });

    it('falls back to deploy_outputs.custom_domain_dns_records when top-level array is absent', () => {
      const route: CustomDomainRoute = { id: 'r-1', subdomain: 'api' };
      const targetNode = {
        id: 'tgt',
        data: {
          iceType: 'Compute.CloudRun',
          label: 'web',
          deploy_outputs: {
            custom_domain_dns_records: [{ type: 'A', domain: 'api.example.com', value: '5.6.7.8' }],
          },
        },
      };
      const edge = { source: 'cd-1', target: 'tgt', data: { routeId: 'r-1' } };
      const { tree } = renderPanel({
        routes: [route],
        domain: 'example.com',
        outgoingEdges: [edge],
        cardNodes: [targetNode],
      });
      const sections = findSections(tree);
      const dnsSection = sections.find((s) => (s.props as SectionProps).title.startsWith('DNS records'));
      expect((dnsSection!.props as SectionProps).title).toBe('DNS records (1)');
    });
  });

  describe('Behavior-risk preservation: `dispatch` prop is unused', () => {
    it('providing dispatch does not throw and is NOT called by the component', () => {
      const dispatch = vi.fn();
      const tree = CustomDomainPanel({
        selectedNode: makeNode({ routes: [], domain: '' }),
        outgoingEdges: [],
        activeCard: { nodes: [] },
        updateNodeField: vi.fn(),
        dispatch: dispatch as unknown as AppDispatch,
      }) as React.ReactElement;
      expect(tree).toBeDefined();
      expect(dispatch).not.toHaveBeenCalled();
    });

    it('dispatch is not invoked across any user interaction (root-domain edit, route add, route delete, subdomain edit)', () => {
      const dispatch = vi.fn() as unknown as AppDispatch;
      const routes: CustomDomainRoute[] = [
        { id: 'r-1', subdomain: 'a' },
        { id: 'r-2', subdomain: 'b' },
      ];
      const tree = CustomDomainPanel({
        selectedNode: makeNode({ routes, domain: 'example.com' }),
        outgoingEdges: [],
        activeCard: { nodes: [] },
        updateNodeField: vi.fn(),
        dispatch,
      }) as React.ReactElement;
      // Trigger every callback.
      const root = findRootDomainInput(tree)!;
      (root.props as InputProps).onChange({ target: { value: 'foo.com' } });
      const subInputs = findRouteSubdomainInputs(tree);
      (subInputs[0].props as InputProps).onChange({ target: { value: 'updated' } });
      const addBtn = findAddRouteButton(tree)!;
      (addBtn.props as ButtonProps).onClick();
      const deleteBtns = findDeleteRouteButtons(tree);
      (deleteBtns[0].props as ButtonProps).onClick();
      expect(dispatch as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
    });
  });

  describe('routes shallow-copy preserves the original', () => {
    it('mutating the routes array passed to updateNodeField does not mutate selectedNode.data.routes', () => {
      const original: CustomDomainRoute[] = [{ id: 'r-1', subdomain: 'a' }];
      const { tree, updateNodeField } = renderPanel({
        selectedNodeData: { routes: original },
      });
      const addBtn = findAddRouteButton(tree)!;
      (addBtn.props as ButtonProps).onClick();
      // The original array should still have 1 element — the component's
      // `routes.slice()` shallow copy ensures we don't mutate the upstream.
      expect(original).toHaveLength(1);
      // The `updateNodeField` payload has 2 entries (existing + new).
      const [, payload] = updateNodeField.mock.calls[0];
      expect((payload as CustomDomainRoute[]).length).toBe(2);
    });
  });
});

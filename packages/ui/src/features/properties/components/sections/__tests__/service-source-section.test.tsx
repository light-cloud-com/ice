/**
 * rf-props-18 — service-source-section subcomponent.
 *
 * `ServiceSourceSection` is purely presentational (no Redux, no `useState`,
 * no hooks beyond the FC body), so we use the direct-FC tree-walker pattern
 * (cite `tree-walker-for-react-fc-tests-must-flatten-nested-children-arrays`):
 * invoke the component as a function, then walk the returned React-element
 * tree depth-first to find leaves and assert on type / props / children.
 *
 * The field-primitive bundle is mocked at `'../../fields'` (one extra `..`
 * vs. the source file because the test sits in `__tests__/`, one level
 * deeper than the source). Each mocked primitive becomes a typed React-FC
 * stub so the walker can match it by `el.type === mocks.MockSection` and
 * inspect the props the parent passed in (cite
 * `mocked-component-leaves-are-invisible-to-direct-fc-tree-walkers`,
 * `vi-hoisted-for-mocked-component-references-in-section-extraction-tests`).
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  MockSection: vi.fn(),
}));

vi.mock('../../fields', () => ({
  Section: mocks.MockSection,
}));

vi.mock('../../../../../i18n', () => ({
  t: vi.fn((key: string) => `t:${key}`),
}));

import { ServiceSourceSection } from '../service-source-section';

// ─── Tree-walker (same shape as rf-props-6/9/10/11/12/13/14/15/16/17) ───────

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

function collectText(tree: React.ReactNode): string {
  const parts: string[] = [];
  function recurse(node: ReactNodeLike): void {
    if (node == null || typeof node === 'boolean') return;
    if (typeof node === 'string' || typeof node === 'number') {
      parts.push(String(node));
      return;
    }
    if (Array.isArray(node)) {
      for (const c of node) recurse(c as ReactNodeLike);
      return;
    }
    const el = node as React.ReactElement;
    const children = (el.props as { children?: React.ReactNode } | undefined)?.children;
    recurse(children);
  }
  recurse(tree);
  return parts.join(' ');
}

// ─── Helpers ────────────────────────────────────────────────────────────────

interface CardEdge {
  source: string;
  target: string;
}

interface CardNodeData {
  iceType?: string;
  behavior?: string;
  repository?: string;
  branch?: string;
  label?: string;
}

interface CardNode {
  id: string;
  data?: CardNodeData;
}

interface ActiveCardLike {
  edges?: CardEdge[];
  nodes?: CardNode[];
}

interface SectionProps {
  title: string;
  children?: React.ReactNode;
}

const renderSection = (props: {
  nodeId: string;
  nodeRepo: string;
  nodeBranch: string;
  activeCard: ActiveCardLike | null;
}): React.ReactElement => {
  mocks.MockSection.mockClear();
  return ServiceSourceSection(props as never) as React.ReactElement;
};

const findSection = (tree: React.ReactNode): React.ReactElement => {
  const sections = findByPredicate(tree, (el) => el.type === mocks.MockSection);
  expect(sections).toHaveLength(1);
  return sections[0];
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ServiceSourceSection', () => {
  it('renders the linked-repo display when a connected Source.Repository block is found', () => {
    const tree = renderSection({
      nodeId: 'svc-1',
      nodeRepo: '',
      nodeBranch: '',
      activeCard: {
        edges: [{ source: 'svc-1', target: 'src-1' }],
        nodes: [
          {
            id: 'src-1',
            data: { iceType: 'Source.Repository', repository: 'org/app', branch: 'main', label: 'My Repo' },
          },
        ],
      },
    });
    const section = findSection(tree);
    expect((section.props as SectionProps).title).toBe('t:properties.source.title');
    const text = collectText(tree);
    expect(text).toContain('org/app');
    expect(text).toContain('main');
    expect(text).toContain('My Repo');
    // Empty-state copy must NOT appear when a repo is linked.
    expect(text).not.toContain('t:properties.source.noSourceConnected');
  });

  it('matches a connected node with behavior === "source" (not iceType)', () => {
    const tree = renderSection({
      nodeId: 'svc-1',
      nodeRepo: '',
      nodeBranch: '',
      activeCard: {
        edges: [{ source: 'src-2', target: 'svc-1' }],
        nodes: [
          {
            id: 'src-2',
            data: { behavior: 'source', repository: 'org/by-behavior', branch: 'develop', label: 'Behavior Source' },
          },
        ],
      },
    });
    const text = collectText(tree);
    expect(text).toContain('org/by-behavior');
    expect(text).toContain('develop');
    expect(text).toContain('Behavior Source');
  });

  it('uses nodeRepo prop when no source block is connected but the prop is set', () => {
    const tree = renderSection({
      nodeId: 'svc-1',
      nodeRepo: 'fallback/repo',
      nodeBranch: 'release',
      activeCard: { edges: [], nodes: [] },
    });
    const text = collectText(tree);
    expect(text).toContain('fallback/repo');
    expect(text).toContain('release');
    // sourceBlockName remains '' when no edge matched, so the "managed by" line is hidden.
    expect(text).not.toContain('t:properties.source.managedBy');
    expect(text).not.toContain('t:properties.source.noSourceConnected');
  });

  it('renders the empty-state hint when no source connected and no nodeRepo', () => {
    const tree = renderSection({
      nodeId: 'svc-1',
      nodeRepo: '',
      nodeBranch: '',
      activeCard: { edges: [], nodes: [] },
    });
    const section = findSection(tree);
    expect((section.props as SectionProps).title).toBe('t:properties.source.title');
    const text = collectText(tree);
    expect(text).toContain('t:properties.source.noSourceConnected');
    expect(text).toContain('t:properties.source.noSourceHint');
  });

  it('renders the empty-state hint when activeCard is null', () => {
    const tree = renderSection({
      nodeId: 'svc-1',
      nodeRepo: '',
      nodeBranch: '',
      activeCard: null,
    });
    const section = findSection(tree);
    expect((section.props as SectionProps).title).toBe('t:properties.source.title');
    const text = collectText(tree);
    expect(text).toContain('t:properties.source.noSourceConnected');
    expect(text).toContain('t:properties.source.noSourceHint');
  });

  it('falls back to nodeRepo prop when connected node has empty repository', () => {
    const tree = renderSection({
      nodeId: 'svc-1',
      nodeRepo: 'service/own-repo',
      nodeBranch: 'service-branch',
      activeCard: {
        edges: [{ source: 'svc-1', target: 'src-3' }],
        nodes: [
          {
            id: 'src-3',
            data: { iceType: 'Source.Repository', repository: '', branch: '', label: 'Empty Repo Block' },
          },
        ],
      },
    });
    const text = collectText(tree);
    // Repository fell through to nodeRepo prop.
    expect(text).toContain('service/own-repo');
    // Branch fell through to nodeBranch prop.
    expect(text).toContain('service-branch');
    // sourceBlockName still resolved to label (the dual-fallback only applies to repository/branch).
    expect(text).toContain('Empty Repo Block');
  });

  it('first matching connected node wins; later matches are ignored', () => {
    const tree = renderSection({
      nodeId: 'svc-1',
      nodeRepo: '',
      nodeBranch: '',
      activeCard: {
        edges: [
          { source: 'svc-1', target: 'src-A' },
          { source: 'svc-1', target: 'src-B' },
        ],
        nodes: [
          {
            id: 'src-A',
            data: { iceType: 'Source.Repository', repository: 'first/repo', branch: 'first-branch', label: 'First' },
          },
          {
            id: 'src-B',
            data: { iceType: 'Source.Repository', repository: 'second/repo', branch: 'second-branch', label: 'Second' },
          },
        ],
      },
    });
    const text = collectText(tree);
    expect(text).toContain('first/repo');
    expect(text).toContain('first-branch');
    expect(text).toContain('First');
    // The second match must NOT leak through.
    expect(text).not.toContain('second/repo');
    expect(text).not.toContain('second-branch');
    expect(text).not.toContain('Second');
  });

  it('matches edges in either direction (source or target side equals nodeId)', () => {
    const treeOutgoing = renderSection({
      nodeId: 'svc-1',
      nodeRepo: '',
      nodeBranch: '',
      activeCard: {
        edges: [{ source: 'svc-1', target: 'src-out' }],
        nodes: [
          {
            id: 'src-out',
            data: { iceType: 'Source.Repository', repository: 'out/repo', branch: 'main', label: 'Out' },
          },
        ],
      },
    });
    expect(collectText(treeOutgoing)).toContain('out/repo');

    const treeIncoming = renderSection({
      nodeId: 'svc-1',
      nodeRepo: '',
      nodeBranch: '',
      activeCard: {
        edges: [{ source: 'src-in', target: 'svc-1' }],
        nodes: [
          { id: 'src-in', data: { iceType: 'Source.Repository', repository: 'in/repo', branch: 'main', label: 'In' } },
        ],
      },
    });
    expect(collectText(treeIncoming)).toContain('in/repo');
  });

  it('sourceBlockName falls back to "GitHub Repo" when the connected node has no label', () => {
    const tree = renderSection({
      nodeId: 'svc-1',
      nodeRepo: '',
      nodeBranch: '',
      activeCard: {
        edges: [{ source: 'svc-1', target: 'src-nolabel' }],
        nodes: [{ id: 'src-nolabel', data: { iceType: 'Source.Repository', repository: 'no/label', branch: 'main' } }],
      },
    });
    const text = collectText(tree);
    expect(text).toContain('GitHub Repo');
    expect(text).toContain('t:properties.source.managedBy');
    expect(text).toContain('t:properties.source.block');
  });

  it('linkedBranch is rendered with the → arrow prefix', () => {
    const tree = renderSection({
      nodeId: 'svc-1',
      nodeRepo: '',
      nodeBranch: '',
      activeCard: {
        edges: [{ source: 'svc-1', target: 'src-arrow' }],
        nodes: [
          {
            id: 'src-arrow',
            data: { iceType: 'Source.Repository', repository: 'arrow/repo', branch: 'feature-x', label: 'Arrow' },
          },
        ],
      },
    });
    // The arrow span uses font-mono class. Find the div whose first child is the
    // `→` (rendered from `&rarr;` as the U+2192 character) plus a space, then
    // the branch name.
    const branchDivs = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        ((el.props as { className?: string }).className as string).includes('font-mono'),
    );
    // At least the linked-repo block contains a font-mono div around the branch.
    expect(branchDivs.length).toBeGreaterThanOrEqual(1);
    const branchDiv = branchDivs.find((el) => collectText(el).includes('feature-x'));
    expect(branchDiv).toBeDefined();
    const branchText = collectText(branchDiv!);
    // `&rarr;` becomes the literal U+2192 right-arrow when JSX renders it.
    expect(branchText).toContain('→');
    expect(branchText).toContain('feature-x');
  });

  it('does not crash when activeCard has no edges or nodes arrays', () => {
    const tree = renderSection({
      nodeId: 'svc-1',
      nodeRepo: 'fallback/repo',
      nodeBranch: '',
      // activeCard exists but has neither `edges` nor `nodes` — the `|| []`
      // fallbacks in the source must produce an empty `connected` list.
      activeCard: {} as ActiveCardLike,
    });
    const text = collectText(tree);
    // Falls through to the nodeRepo prop, not the empty state.
    expect(text).toContain('fallback/repo');
  });

  it('skips connected nodes whose data does not match either iceType or behavior', () => {
    const tree = renderSection({
      nodeId: 'svc-1',
      nodeRepo: '',
      nodeBranch: '',
      activeCard: {
        edges: [{ source: 'svc-1', target: 'unrelated-1' }],
        nodes: [{ id: 'unrelated-1', data: { iceType: 'Compute.Service', repository: 'leak/repo' } }],
      },
    });
    const text = collectText(tree);
    expect(text).not.toContain('leak/repo');
    expect(text).toContain('t:properties.source.noSourceConnected');
  });

  it('handles activeCard with edges but undefined nodes (the `|| []` nodes fallback)', () => {
    const tree = renderSection({
      nodeId: 'svc-1',
      nodeRepo: '',
      nodeBranch: '',
      activeCard: { edges: [{ source: 'svc-1', target: 'src-x' }] } as ActiveCardLike,
    });
    const text = collectText(tree);
    expect(text).toContain('t:properties.source.noSourceConnected');
  });

  it('skips edges whose otherId has no matching node', () => {
    const tree = renderSection({
      nodeId: 'svc-1',
      nodeRepo: '',
      nodeBranch: '',
      activeCard: {
        edges: [{ source: 'svc-1', target: 'missing' }],
        nodes: [],
      },
    });
    const text = collectText(tree);
    expect(text).toContain('t:properties.source.noSourceConnected');
  });
});

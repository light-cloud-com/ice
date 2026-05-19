/**
 * Tests for `SvgGithubRepoNode` — bespoke renderer that surfaces the
 * repository address front-and-centre in the body, with branch + path
 * underneath and build/deploy in the footer. Validated block: visuals
 * change, schema preserved.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const passthrough: React.FC<Record<string, unknown>> = (props) =>
    React.createElement('div', null, (props as { children?: React.ReactNode }).children);
  passthrough.displayName = 'MockCardShell';
  return { CardShell: passthrough };
});

vi.mock('../../_shared', () => ({
  CardShell: mocks.CardShell,
}));

vi.mock('lucide-react', () => ({
  GitBranch: ((_p: Record<string, unknown>) => null) as React.FC,
}));

import {
  SvgGithubRepoNode,
  computeGithubRepoHeight,
  normaliseRepoIdentifier,
  COMPUTE_HEADER_HEIGHT,
  COMPUTE_BODY_HEIGHT,
  COMPUTE_PADDING,
} from '..';
import { CARD_FOOTER_HEIGHT } from '@ice/constants';
import type { CanvasNode } from '../../../svg-canvas';

type ReactNodeLike = React.ReactNode;
function* walk(node: ReactNodeLike): Generator<React.ReactElement> {
  if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') return;
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
function findByTestId(tree: React.ReactNode, id: string): React.ReactElement | undefined {
  for (const el of walk(tree)) {
    if ((el.props as { 'data-testid'?: string })['data-testid'] === id) return el;
  }
  return undefined;
}

const makeNode = (overrides: Partial<CanvasNode> = {}): CanvasNode => ({
  id: 'gh-1',
  type: 'block',
  x: 0,
  y: 0,
  width: 240,
  height: 160,
  label: 'Source Code',
  data: { iceType: 'Source.Repository' },
  ...overrides,
});

const renderInner = (
  props: Partial<React.ComponentProps<typeof SvgGithubRepoNode>> = {},
): React.ReactElement => {
  const defaults: React.ComponentProps<typeof SvgGithubRepoNode> = {
    node: makeNode(),
    isSelected: false,
  };
  return SvgGithubRepoNode({ ...defaults, ...props }) as React.ReactElement;
};

describe('normaliseRepoIdentifier', () => {
  it('passes through `owner/repo` unchanged', () => {
    expect(normaliseRepoIdentifier('octocat/spoon-knife')).toBe('octocat/spoon-knife');
  });

  it('strips the https://github.com/ prefix', () => {
    expect(normaliseRepoIdentifier('https://github.com/octocat/spoon-knife')).toBe('octocat/spoon-knife');
  });

  it('strips a `.git` suffix', () => {
    expect(normaliseRepoIdentifier('https://github.com/octocat/spoon-knife.git')).toBe('octocat/spoon-knife');
  });

  it('strips a trailing slash', () => {
    expect(normaliseRepoIdentifier('octocat/spoon-knife/')).toBe('octocat/spoon-knife');
  });

  it('handles www. and uppercase protocol', () => {
    expect(normaliseRepoIdentifier('HTTPS://www.github.com/octocat/repo')).toBe('octocat/repo');
  });

  it('returns empty string for empty input', () => {
    expect(normaliseRepoIdentifier('')).toBe('');
  });
});

describe('computeGithubRepoHeight', () => {
  it('sums header + padding*2 + body + footer', () => {
    const expected = COMPUTE_HEADER_HEIGHT + COMPUTE_PADDING + COMPUTE_BODY_HEIGHT + COMPUTE_PADDING + CARD_FOOTER_HEIGHT;
    expect(computeGithubRepoHeight()).toBe(expected);
  });
});

describe('SvgGithubRepoNode — title', () => {
  it('uses the user-set node.label as the title', () => {
    const tree = renderInner({ node: makeNode({ label: 'Main Source' }) });
    expect((tree.props as { title: string }).title).toBe('Main Source');
  });

  it('falls back to "GitHub Repository" when label is empty', () => {
    const tree = renderInner({ node: makeNode({ label: '' }) });
    expect((tree.props as { title: string }).title).toBe('GitHub Repository');
  });
});

describe('SvgGithubRepoNode — repository address', () => {
  it('renders the address with a github.com/ prefix when repository is set', () => {
    const tree = renderInner({ node: makeNode({ data: { repository: 'octocat/spoon-knife' } }) });
    const addr = findByTestId(tree, 'repo-address-gh-1');
    expect(addr).toBeDefined();
    // The address row interleaves the prefix and the owner/repo into two spans.
    const title = (addr!.props as { title: string }).title;
    expect(title).toBe('github.com/octocat/spoon-knife');
  });

  it('normalises a full https URL down to owner/repo before display', () => {
    const tree = renderInner({
      node: makeNode({ data: { repository: 'https://github.com/octocat/spoon-knife.git' } }),
    });
    const addr = findByTestId(tree, 'repo-address-gh-1');
    expect((addr!.props as { title: string }).title).toBe('github.com/octocat/spoon-knife');
  });

  it('accepts the legacy `repo` field', () => {
    const tree = renderInner({ node: makeNode({ data: { repo: 'old/legacy-repo' } }) });
    const addr = findByTestId(tree, 'repo-address-gh-1');
    expect((addr!.props as { title: string }).title).toBe('github.com/old/legacy-repo');
  });

  it('shows the empty-state hint when no repository is set', () => {
    const tree = renderInner({ node: makeNode({ data: {} }) });
    const empty = findByTestId(tree, 'repo-empty-gh-1');
    expect(empty).toBeDefined();
    expect((empty!.props as { children: string }).children).toContain('no repository connected');
    expect(findByTestId(tree, 'repo-address-gh-1')).toBeUndefined();
  });
});

describe('SvgGithubRepoNode — body details', () => {
  it('renders the path under the branch tag, defaulting to "/"', () => {
    const tree = renderInner();
    const pathEl = findByTestId(tree, 'repo-path-gh-1');
    expect((pathEl!.props as { children: string }).children).toBe('/');
  });

  it('renders a custom path when set', () => {
    const tree = renderInner({ node: makeNode({ data: { path: 'apps/web' } }) });
    const pathEl = findByTestId(tree, 'repo-path-gh-1');
    expect((pathEl!.props as { children: string }).children).toBe('apps/web');
  });
});

describe('SvgGithubRepoNode — liveConfig footer', () => {
  it('shows "auto-deploy" by default', () => {
    const tree = renderInner();
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('auto-deploy');
  });

  it('flips to "manual deploys" when autoDeploy is explicitly false', () => {
    const tree = renderInner({ node: makeNode({ data: { autoDeploy: false } }) });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('manual deploys');
  });

  it('includes the build command when set', () => {
    const tree = renderInner({
      node: makeNode({ data: { buildCommand: 'npm run build', autoDeploy: true } }),
    });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('auto-deploy · build: npm run build');
  });
});

describe('SvgGithubRepoNode — surface', () => {
  it('exposes the displayName', () => {
    expect(SvgGithubRepoNode.displayName).toBe('SvgGithubRepoNode');
  });

  it('renders a CardShell wrapper', () => {
    const tree = renderInner();
    expect(tree.type).toBe(mocks.CardShell);
  });
});

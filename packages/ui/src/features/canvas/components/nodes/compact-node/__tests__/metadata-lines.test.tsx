/**
 * Tests for `MetadataLines` — context-line list rendered under the
 * label of the compact node. Plays double-duty: regular informational
 * lines vs the editable repo line (Source.Repository, selected, with
 * the inline RepoSelector dropdown).
 *
 * Branches:
 *   - regular line vs placeholder (isPlaceholder via leading NBSP).
 *   - repo line: only for selected + isSourceRepo at the right index.
 *   - "Link repo" prompt: !repository + selected + hovered + isSourceRepo.
 *   - RepoSelector dropdown opens via setRepoSelectorOpen toggles.
 *   - onUpdateData(nodeId, { repository }) on RepoSelector.onChange.
 *
 * Harness: useState is mocked so we can drive `repoSelectorOpen` per
 * test, and `useTranslation` is stubbed to return an identity-like
 * `t(key)` that yields a stable string for the link-repo prompt.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const named = (name: string): React.FC<Record<string, unknown>> => {
    const fc: React.FC<Record<string, unknown>> = () => null;
    fc.displayName = name;
    return fc;
  };
  return {
    RepoSelector: named('MockRepoSelector'),
    state: {
      repoSelectorOpen: false as boolean,
      setRepoSelectorOpen: vi.fn(),
    },
  };
});

// useState mock returns hoisted ref so tests can pin repoSelectorOpen state
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: vi.fn(<T,>(init: T | (() => T)): [T, (v: T) => void] => {
      const initialValue = typeof init === 'function' ? (init as () => T)() : init;
      // The only useState in this SUT is `useState(false)` for repoSelectorOpen.
      if (typeof initialValue === 'boolean') {
        return [mocks.state.repoSelectorOpen as unknown as T, mocks.state.setRepoSelectorOpen];
      }
      return [initialValue, vi.fn()];
    }),
  };
});

vi.mock('../../../../../integrations/components/repo-selector', () => ({
  RepoSelector: mocks.RepoSelector,
}));

vi.mock('../../../../../../i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../../i18n')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
      locale: 'en',
      setLocale: () => {},
    }),
  };
});

import { MetadataLines } from '../metadata-lines';

const MockRepoSelector = mocks.RepoSelector;

// ─── tree walker ─────────────────────────────────────────────────────

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
function findByPredicate(
  tree: React.ReactNode,
  predicate: (el: React.ReactElement) => boolean,
): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) if (el && predicate(el)) out.push(el);
  return out;
}
function findByType(tree: React.ReactNode, type: unknown): React.ReactElement[] {
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
    visit(((n as React.ReactElement).props as { children?: React.ReactNode } | undefined)?.children ?? null);
  };
  visit(tree);
  return parts.join('');
}

const renderML = (
  props: Partial<React.ComponentProps<typeof MetadataLines>> = {},
): React.ReactElement => {
  const Inner = (MetadataLines as unknown as {
    type: (p: React.ComponentProps<typeof MetadataLines>) => React.ReactElement;
  }).type;
  const defaults: React.ComponentProps<typeof MetadataLines> = {
    metaLines: [],
    repoLineIndex: -1,
    isSelected: false,
    isHovered: false,
    isSourceRepo: false,
    repository: '',
    nodeId: 'node-1',
    onUpdateData: undefined,
  };
  return Inner({ ...defaults, ...props });
};

beforeEach(() => {
  mocks.state.repoSelectorOpen = false;
  mocks.state.setRepoSelectorOpen.mockClear();
});

describe('MetadataLines — React.memo + displayName', () => {
  it('is wrapped in React.memo', () => {
    expect(typeof (MetadataLines as unknown as { $$typeof: symbol }).$$typeof).toBe('symbol');
  });

  it('carries displayName "MetadataLines"', () => {
    expect((MetadataLines as unknown as { displayName: string }).displayName).toBe('MetadataLines');
  });
});

describe('MetadataLines — regular lines', () => {
  it('renders each metaLine in a div, italics for placeholder', () => {
    const tree = renderML({ metaLines: ['regular', ' placeholder'], repoLineIndex: -1 });
    // Find divs containing the line text.
    const realLine = findByPredicate(tree, (el) => el.type === 'div' && (el.props as { children?: unknown }).children === 'regular');
    expect(realLine).toHaveLength(1);
    expect((realLine[0].props as { style: { fontStyle: string } }).style.fontStyle).toBe('normal');

    const phLine = findByPredicate(tree, (el) => el.type === 'div' && (el.props as { children?: unknown }).children === 'placeholder');
    expect(phLine).toHaveLength(1);
    expect((phLine[0].props as { style: { fontStyle: string } }).style.fontStyle).toBe('italic');
    expect((phLine[0].props as { style: { opacity: number } }).style.opacity).toBe(0.45);
  });

  it('placeholder lines show without leading NBSP', () => {
    const tree = renderML({ metaLines: [' hidden'] });
    expect(collectText(tree)).toContain('hidden');
    expect(collectText(tree)).not.toContain(' hidden');
  });
});

describe('MetadataLines — repo line (selected + isSourceRepo)', () => {
  it('shows repo span (clickable) when isRepoLine + isSelected + isSourceRepo', () => {
    const tree = renderML({
      metaLines: ['octocat/hello'],
      repoLineIndex: 0,
      isSelected: true,
      isSourceRepo: true,
    });
    // Locate the clickable repo span by its child text.
    const span = findByPredicate(tree, (el) => {
      if (el.type !== 'span') return false;
      const c = (el.props as { children?: unknown }).children;
      return c === 'octocat/hello';
    });
    expect(span).toHaveLength(1);
    expect((span[0].props as { onClick?: unknown }).onClick).toBeDefined();
  });

  it('does NOT activate repo line when not selected', () => {
    const tree = renderML({
      metaLines: ['octocat/hello'],
      repoLineIndex: 0,
      isSelected: false,
      isSourceRepo: true,
    });
    // Falls back to the regular line div (not span with onClick).
    const span = findByPredicate(tree, (el) => el.type === 'span' && (el.props as { children?: unknown }).children === 'octocat/hello');
    expect(span).toHaveLength(0);
  });

  it('does NOT activate repo line when not isSourceRepo', () => {
    const tree = renderML({
      metaLines: ['octocat/hello'],
      repoLineIndex: 0,
      isSelected: true,
      isSourceRepo: false,
    });
    const span = findByPredicate(tree, (el) => el.type === 'span' && (el.props as { children?: unknown }).children === 'octocat/hello');
    expect(span).toHaveLength(0);
  });

  it('repo span opacity = 0.85 when hovered, 0.7 otherwise', () => {
    const hovered = renderML({
      metaLines: ['octocat/hello'],
      repoLineIndex: 0,
      isSelected: true,
      isSourceRepo: true,
      isHovered: true,
    });
    const idle = renderML({
      metaLines: ['octocat/hello'],
      repoLineIndex: 0,
      isSelected: true,
      isSourceRepo: true,
      isHovered: false,
    });
    const hSpan = findByPredicate(hovered, (el) => el.type === 'span' && (el.props as { children?: unknown }).children === 'octocat/hello')[0];
    const iSpan = findByPredicate(idle, (el) => el.type === 'span' && (el.props as { children?: unknown }).children === 'octocat/hello')[0];
    expect((hSpan.props as { style: { opacity: number } }).style.opacity).toBe(0.85);
    expect((iSpan.props as { style: { opacity: number } }).style.opacity).toBe(0.7);
  });

  it('shows pencil edit affordance when hovered', () => {
    const tree = renderML({
      metaLines: ['octocat/hello'],
      repoLineIndex: 0,
      isSelected: true,
      isSourceRepo: true,
      isHovered: true,
    });
    const pencil = findByPredicate(tree, (el) => el.type === 'span' && (el.props as { children?: unknown }).children === '✎');
    expect(pencil).toHaveLength(1);
  });

  it('hides pencil edit affordance when not hovered', () => {
    const tree = renderML({
      metaLines: ['octocat/hello'],
      repoLineIndex: 0,
      isSelected: true,
      isSourceRepo: true,
      isHovered: false,
    });
    const pencil = findByPredicate(tree, (el) => el.type === 'span' && (el.props as { children?: unknown }).children === '✎');
    expect(pencil).toHaveLength(0);
  });

  it('clicking the repo span toggles repoSelectorOpen state and stops propagation', () => {
    const tree = renderML({
      metaLines: ['octocat/hello'],
      repoLineIndex: 0,
      isSelected: true,
      isSourceRepo: true,
    });
    const span = findByPredicate(tree, (el) => el.type === 'span' && (el.props as { children?: unknown }).children === 'octocat/hello')[0];
    const stops: string[] = [];
    (span.props as { onClick: (e: React.MouseEvent) => void }).onClick({
      stopPropagation: () => stops.push('s'),
    } as React.MouseEvent);
    expect(stops).toEqual(['s']);
    expect(mocks.state.setRepoSelectorOpen).toHaveBeenCalledWith(true);
  });

  it('clicking the pencil also toggles repoSelectorOpen', () => {
    const tree = renderML({
      metaLines: ['octocat/hello'],
      repoLineIndex: 0,
      isSelected: true,
      isSourceRepo: true,
      isHovered: true,
    });
    const pencil = findByPredicate(tree, (el) => el.type === 'span' && (el.props as { children?: unknown }).children === '✎')[0];
    const stops: string[] = [];
    (pencil.props as { onClick: (e: React.MouseEvent) => void }).onClick({
      stopPropagation: () => stops.push('s'),
    } as React.MouseEvent);
    expect(stops).toEqual(['s']);
    expect(mocks.state.setRepoSelectorOpen).toHaveBeenCalledWith(true);
  });

  it('clicking the repo span when already open toggles to false', () => {
    mocks.state.repoSelectorOpen = true;
    const tree = renderML({
      metaLines: ['octocat/hello'],
      repoLineIndex: 0,
      isSelected: true,
      isSourceRepo: true,
    });
    const span = findByPredicate(tree, (el) => el.type === 'span' && (el.props as { children?: unknown }).children === 'octocat/hello')[0];
    (span.props as { onClick: (e: React.MouseEvent) => void }).onClick({
      stopPropagation: () => {},
    } as React.MouseEvent);
    expect(mocks.state.setRepoSelectorOpen).toHaveBeenCalledWith(false);
  });
});

describe('MetadataLines — Link repo prompt', () => {
  it('renders the link-repo prompt when !repository + isSelected + isHovered + isSourceRepo', () => {
    const tree = renderML({
      isSelected: true,
      isHovered: true,
      isSourceRepo: true,
      repository: '',
    });
    const promptSpans = findByPredicate(tree, (el) => {
      if (el.type !== 'span') return false;
      const c = (el.props as { children?: unknown }).children;
      return typeof c === 'string' && c.includes('integrations.repoSelector.linkRepo');
    });
    expect(promptSpans).toHaveLength(1);
  });

  it('omits link-repo prompt when repository is set', () => {
    const tree = renderML({
      isSelected: true,
      isHovered: true,
      isSourceRepo: true,
      repository: 'foo/bar',
    });
    const promptSpans = findByPredicate(tree, (el) => {
      if (el.type !== 'span') return false;
      const c = (el.props as { children?: unknown }).children;
      return typeof c === 'string' && c.includes('linkRepo');
    });
    expect(promptSpans).toHaveLength(0);
  });

  it('clicking link-repo prompt opens the selector', () => {
    const tree = renderML({
      isSelected: true,
      isHovered: true,
      isSourceRepo: true,
      repository: '',
    });
    const promptSpan = findByPredicate(tree, (el) => {
      if (el.type !== 'span') return false;
      const c = (el.props as { children?: unknown }).children;
      return typeof c === 'string' && c.includes('linkRepo');
    })[0];
    const stops: string[] = [];
    (promptSpan.props as { onClick: (e: React.MouseEvent) => void }).onClick({
      stopPropagation: () => stops.push('s'),
    } as React.MouseEvent);
    expect(stops).toEqual(['s']);
    expect(mocks.state.setRepoSelectorOpen).toHaveBeenCalledWith(true);
  });
});

describe('MetadataLines — RepoSelector dropdown', () => {
  it('does not render selector when state closed', () => {
    mocks.state.repoSelectorOpen = false;
    const tree = renderML({ isSelected: true, isSourceRepo: true });
    expect(findByType(tree, MockRepoSelector)).toHaveLength(0);
  });

  it('renders the RepoSelector when open + selected + isSourceRepo', () => {
    mocks.state.repoSelectorOpen = true;
    const tree = renderML({ isSelected: true, isSourceRepo: true, repository: 'foo/bar' });
    const selectors = findByType(tree, MockRepoSelector);
    expect(selectors).toHaveLength(1);
    const props = selectors[0].props as { compact: boolean; value: string };
    expect(props.compact).toBe(true);
    expect(props.value).toBe('foo/bar');
  });

  it('does not render RepoSelector when not isSourceRepo even if open', () => {
    mocks.state.repoSelectorOpen = true;
    const tree = renderML({ isSelected: true, isSourceRepo: false });
    expect(findByType(tree, MockRepoSelector)).toHaveLength(0);
  });

  it('does not render RepoSelector when not selected even if open', () => {
    mocks.state.repoSelectorOpen = true;
    const tree = renderML({ isSelected: false, isSourceRepo: true });
    expect(findByType(tree, MockRepoSelector)).toHaveLength(0);
  });

  it('RepoSelector.onChange fires onUpdateData and closes selector', () => {
    mocks.state.repoSelectorOpen = true;
    const updateSpy = vi.fn();
    const tree = renderML({
      isSelected: true,
      isSourceRepo: true,
      onUpdateData: updateSpy,
    });
    const selector = findByType(tree, MockRepoSelector)[0];
    (selector.props as { onChange: (s: string) => void }).onChange('foo/bar');
    expect(updateSpy).toHaveBeenCalledWith('node-1', { repository: 'foo/bar' });
    expect(mocks.state.setRepoSelectorOpen).toHaveBeenCalledWith(false);
  });

  it('RepoSelector.onChange is no-op when onUpdateData is undefined', () => {
    mocks.state.repoSelectorOpen = true;
    const tree = renderML({ isSelected: true, isSourceRepo: true, onUpdateData: undefined });
    const selector = findByType(tree, MockRepoSelector)[0];
    expect(() =>
      (selector.props as { onChange: (s: string) => void }).onChange('foo/bar'),
    ).not.toThrow();
  });

  it('RepoSelector container stops propagation on onClick / onMouseDown (avoid drag-start)', () => {
    mocks.state.repoSelectorOpen = true;
    const tree = renderML({ isSelected: true, isSourceRepo: true });
    // Find the container div wrapping the selector.
    const containerDiv = findByPredicate(tree, (el) => {
      if (el.type !== 'div') return false;
      const props = el.props as { onClick?: unknown; onMouseDown?: unknown };
      return typeof props.onClick === 'function' && typeof props.onMouseDown === 'function';
    })[0];
    expect(containerDiv).toBeDefined();
    const stops: string[] = [];
    (containerDiv.props as { onClick: (e: React.MouseEvent) => void }).onClick({
      stopPropagation: () => stops.push('c'),
    } as React.MouseEvent);
    (containerDiv.props as { onMouseDown: (e: React.MouseEvent) => void }).onMouseDown({
      stopPropagation: () => stops.push('m'),
    } as React.MouseEvent);
    expect(stops).toEqual(['c', 'm']);
  });
});

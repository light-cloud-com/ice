/**
 * ConceptInfoModal — tabbed dialog with markdown overview, per-provider
 * compiles-to, code snippet language switcher, and external links.
 *
 * Direct-FC tree-walker pattern. The modal owns one `useState` (the active
 * tab); the inner CompilesTab + SnippetsTab each have their own `useState`
 * for the per-tab selection. We use a queued useState mock indexed by call
 * order so each FC's slot is pre-seedable independently.
 *
 * Cites:
 *   - `react-namespace-hook-access-requires-patching-default-export-too`
 *     (the file does `import React, { useMemo, useState } from 'react'`)
 *   - `useState-mock-with-call-index-queue-for-multi-useState-components`
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const stateSlots: unknown[] = [];
  let useStateIdx = 0;
  return {
    stateSlots,
    useStateIdx,
    resetIdx: () => {
      // overridden after vi.mock('react') sets up the closure
    },
    resetSlots: () => {
      stateSlots.length = 0;
    },
    infoMap: {} as Record<string, unknown>,
    renderMarkdown: vi.fn((src: string) => `<MD>${src}</MD>`),
  };
});

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  let useStateIdx = 0;
  const patchedUseState = vi.fn(<T,>(initial: T) => {
    const slot = useStateIdx;
    if (mocks.stateSlots.length <= slot) {
      const init = typeof initial === 'function' ? (initial as () => T)() : initial;
      mocks.stateSlots.push(init);
    }
    const setter = vi.fn((next: unknown) => {
      const cur = mocks.stateSlots[slot];
      const resolved = typeof next === 'function' ? (next as (prev: unknown) => unknown)(cur) : next;
      mocks.stateSlots[slot] = resolved;
    });
    useStateIdx += 1;
    return [mocks.stateSlots[slot], setter] as [T, (v: T) => void];
  });
  const patchedUseMemo = vi.fn(<T,>(fn: () => T) => fn());
  (mocks as unknown as { resetIdx: () => void }).resetIdx = () => {
    useStateIdx = 0;
  };
  const actualDefault = (actual as unknown as { default?: typeof actual }).default ?? actual;
  return {
    ...actual,
    useState: patchedUseState,
    useMemo: patchedUseMemo,
    default: { ...actualDefault, useState: patchedUseState, useMemo: patchedUseMemo },
  };
});

vi.mock('@ice/blocks', () => ({
  getInfoContent: (iceType: string) => mocks.infoMap[iceType],
  SNIPPET_LANGUAGES: ['ts', 'py', 'go', 'java', 'csharp', 'rust'],
  SNIPPET_LANGUAGE_LABELS: {
    ts: 'TypeScript',
    py: 'Python',
    go: 'Go',
    java: 'Java',
    csharp: 'C#',
    rust: 'Rust',
  },
  // Re-export Provider type sentinel for module shape; not used at runtime.
  Provider: 'aws',
}));

vi.mock('../markdown', () => ({
  renderMarkdown: (src: string) => mocks.renderMarkdown(src),
}));

import { ConceptInfoModal } from '../concept-info-modal';

// ─── Tree-walker helpers ──────────────────────────────────────────────────

type ReactNodeLike = React.ReactNode;

function* walk(node: ReactNodeLike): Generator<React.ReactElement> {
  if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') return;
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c as ReactNodeLike);
    return;
  }
  const el = node as React.ReactElement;
  yield el;
  if (typeof el.type === 'function') {
    try {
      const FC = el.type as (props: unknown) => React.ReactNode;
      yield* walk(FC(el.props) as ReactNodeLike);
    } catch {
      /* skip */
    }
    return;
  }
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

function collectText(tree: React.ReactNode): string {
  let s = '';
  for (const el of walk(tree)) {
    const c = (el.props as { children?: unknown } | undefined)?.children;
    if (typeof c === 'string') s += c + '|';
    else if (typeof c === 'number') s += String(c) + '|';
    else if (Array.isArray(c)) {
      for (const item of c) {
        if (typeof item === 'string') s += item + '|';
        else if (typeof item === 'number') s += String(item) + '|';
      }
    }
  }
  return s;
}

interface RenderProps {
  iceType?: string;
  displayName?: string;
  currentProvider?: string;
  onClose?: () => void;
}

function render(props: RenderProps = {}): React.ReactElement | null {
  (mocks as unknown as { resetIdx: () => void }).resetIdx();
  const Component = ConceptInfoModal as unknown as (p: unknown) => React.ReactElement | null;
  return Component({
    iceType: props.iceType ?? 'Test.Block',
    displayName: props.displayName ?? 'Test Block',
    currentProvider: props.currentProvider,
    onClose: props.onClose ?? (() => {}),
  });
}

// ─── Fixtures ─────────────────────────────────────────────────────────────

const fullContent = {
  overview: { markdown: '# Heading\nbody text' },
  compilesTo: {
    aws: [
      { name: 'VPC', type: 'aws_vpc', role: 'network', optional: false },
      { name: 'IGW', type: 'aws_internet_gateway', optional: true },
    ],
    gcp: [{ name: 'Network', type: 'google_compute_network' }],
  },
  snippets: {
    ts: 'const x = 1;',
    py: 'x = 1',
  },
  links: [
    { label: 'AWS docs', url: 'https://aws.example.com' },
    { label: 'GCP docs', url: 'https://gcp.example.com' },
  ],
};

beforeEach(() => {
  mocks.resetSlots();
  mocks.infoMap = { 'Test.Block': fullContent };
  mocks.renderMarkdown.mockClear();
  mocks.renderMarkdown.mockImplementation((src: string) => `<MD>${src}</MD>`);
});

// ─── Null branch ──────────────────────────────────────────────────────────

describe('ConceptInfoModal — content lookup', () => {
  it('returns null when getInfoContent yields undefined', () => {
    mocks.infoMap = {};
    const tree = render({ iceType: 'Unknown.Block' });
    expect(tree).toBeNull();
  });

  it('renders the modal shell when content exists', () => {
    const tree = render();
    expect(tree).not.toBeNull();
    const buttons = findByPredicate(tree, (el) => el.type === 'button');
    expect(buttons.length).toBeGreaterThan(0);
  });
});

// ─── Header ──────────────────────────────────────────────────────────────

describe('ConceptInfoModal — header', () => {
  it('renders displayName + iceType in the header', () => {
    mocks.infoMap = { 'Compute.Lambda': fullContent };
    const tree = render({ iceType: 'Compute.Lambda', displayName: 'Lambda Function' });
    const text = collectText(tree);
    expect(text).toContain('Lambda Function');
    expect(text).toContain('Compute.Lambda');
  });

  it('renders a close button with aria-label "Close"', () => {
    const tree = render();
    const closeBtns = findByPredicate(
      tree,
      (el) => el.type === 'button' && (el.props as { ['aria-label']?: string })['aria-label'] === 'Close',
    );
    expect(closeBtns).toHaveLength(1);
  });

  it('close button onClick invokes onClose prop', () => {
    const onClose = vi.fn();
    const tree = render({ onClose });
    const closeBtn = findByPredicate(
      tree,
      (el) => el.type === 'button' && (el.props as { ['aria-label']?: string })['aria-label'] === 'Close',
    )[0];
    (closeBtn.props as { onClick: () => void }).onClick();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('backdrop onClick invokes onClose', () => {
    const onClose = vi.fn();
    const tree = render({ onClose });
    expect(tree).not.toBeNull();
    const root = tree as React.ReactElement;
    const handler = (root.props as { onClick: () => void }).onClick;
    handler();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('backdrop event-stop handlers stopPropagation', () => {
    const tree = render();
    const root = tree as React.ReactElement;
    const props = root.props as Record<string, (e: { stopPropagation: () => void }) => void>;
    const stop = vi.fn();
    props.onMouseDown({ stopPropagation: stop });
    props.onMouseUp({ stopPropagation: stop });
    props.onPointerDown({ stopPropagation: stop });
    props.onPointerUp({ stopPropagation: stop });
    props.onWheel({ stopPropagation: stop });
    props.onContextMenu({ stopPropagation: stop });
    expect(stop).toHaveBeenCalledTimes(6);
  });

  it('panel-level handlers cover click/dblclick/keydown/keyup', () => {
    const tree = render();
    const buttons = findByPredicate(tree, (el) => el.type === 'div');
    // The panel is the first descendant div with onKeyDown stop handler.
    const panel = buttons.find(
      (el) => typeof (el.props as { onKeyDown?: unknown }).onKeyDown === 'function',
    );
    expect(panel).toBeDefined();
    const props = (panel as React.ReactElement).props as Record<
      string,
      (e: { stopPropagation: () => void }) => void
    >;
    const stop = vi.fn();
    props.onClick({ stopPropagation: stop });
    props.onDoubleClick({ stopPropagation: stop });
    props.onKeyDown({ stopPropagation: stop });
    props.onKeyUp({ stopPropagation: stop });
    expect(stop).toHaveBeenCalledTimes(4);
  });
});

// ─── Tab visibility ──────────────────────────────────────────────────────

describe('ConceptInfoModal — tab visibility', () => {
  it('renders all four tabs when content has every section', () => {
    const tree = render();
    // Tab buttons have specific font-medium className
    const tabBtns = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        ((el.props as { className?: string }).className ?? '').includes('font-medium'),
    );
    expect(tabBtns.length).toBe(4);
  });

  it('hides the Compiles tab when compilesTo is empty', () => {
    mocks.infoMap = {
      'Test.Block': { ...fullContent, compilesTo: {} },
    };
    const tree = render();
    const text = collectText(tree);
    expect(text).not.toContain('Compiles To');
  });

  it('hides the Compiles tab when compilesTo is undefined', () => {
    mocks.infoMap = {
      'Test.Block': { overview: fullContent.overview, snippets: fullContent.snippets, links: fullContent.links },
    };
    const tree = render();
    const text = collectText(tree);
    expect(text).not.toContain('Compiles To');
  });

  it('hides the Code tab when snippets is empty', () => {
    mocks.infoMap = {
      'Test.Block': { ...fullContent, snippets: {} },
    };
    const tree = render();
    const text = collectText(tree);
    // The header still shows the iceType etc; ensure no Code tab button
    const tabBtns = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        ((el.props as { className?: string }).className ?? '').includes('font-medium'),
    );
    const labels = tabBtns.map((b) => (b.props as { children?: unknown }).children);
    expect(labels).not.toContain('Code');
  });

  it('hides the Links tab when links is empty', () => {
    mocks.infoMap = {
      'Test.Block': { ...fullContent, links: [] },
    };
    const tree = render();
    const tabBtns = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        ((el.props as { className?: string }).className ?? '').includes('font-medium'),
    );
    const labels = tabBtns.map((b) => (b.props as { children?: unknown }).children);
    expect(labels).not.toContain('Links');
  });

  it('hides the Links tab when links is undefined', () => {
    mocks.infoMap = {
      'Test.Block': { overview: fullContent.overview, compilesTo: fullContent.compilesTo },
    };
    const tree = render();
    const tabBtns = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        ((el.props as { className?: string }).className ?? '').includes('font-medium'),
    );
    // Overview + Compiles = 2; Links absent
    expect(tabBtns.length).toBe(2);
    const labels = tabBtns.map((b) => (b.props as { children: unknown }).children);
    expect(labels).not.toContain('Links');
  });

  it('only shows Overview when content has nothing else', () => {
    mocks.infoMap = {
      'Test.Block': { overview: { markdown: '# only' } },
    };
    const tree = render();
    const tabBtns = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        ((el.props as { className?: string }).className ?? '').includes('font-medium'),
    );
    expect(tabBtns).toHaveLength(1);
    expect((tabBtns[0].props as { children: unknown }).children).toBe('Overview');
  });

  it('switching tabs invokes setTab via tab button onClick', () => {
    const tree = render();
    const tabBtns = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        ((el.props as { className?: string }).className ?? '').includes('font-medium'),
    );
    // Compiles tab is index 1
    expect(typeof (tabBtns[1].props as { onClick: () => void }).onClick).toBe('function');
    (tabBtns[1].props as { onClick: () => void }).onClick();
    // After click, slot 0 (the modal's tab state) is "compiles"
    expect(mocks.stateSlots[0]).toBe('compiles');
  });
});

// ─── Overview tab ────────────────────────────────────────────────────────

describe('ConceptInfoModal — Overview tab', () => {
  it('default tab is overview and renders markdown via renderMarkdown', () => {
    const tree = render();
    // Walk forces OverviewTab to be invoked, which calls renderMarkdown.
    findByPredicate(tree, () => false);
    expect(mocks.renderMarkdown).toHaveBeenCalledWith('# Heading\nbody text');
  });

  it('overview body is injected as dangerouslySetInnerHTML', () => {
    const tree = render();
    const innerHtml = findByPredicate(
      tree,
      (el) => typeof (el.props as { dangerouslySetInnerHTML?: unknown }).dangerouslySetInnerHTML === 'object',
    );
    expect(innerHtml).toHaveLength(1);
    expect(
      (innerHtml[0].props as { dangerouslySetInnerHTML: { __html: string } }).dangerouslySetInnerHTML.__html,
    ).toContain('<MD>');
  });
});

// ─── Compiles tab ────────────────────────────────────────────────────────

describe('ConceptInfoModal — Compiles tab', () => {
  it('renders provider buttons and primitive cards when tab=compiles', () => {
    // Pre-seed: slot 0 = tab='compiles', slot 1 = CompilesTab's selected provider
    mocks.stateSlots[0] = 'compiles';
    const tree = render();
    const text = collectText(tree);
    // Provider labels rendered uppercase via CSS — children value is 'aws'/'gcp'
    expect(text).toContain('aws');
    expect(text).toContain('gcp');
    // Primitives
    expect(text).toContain('VPC');
    expect(text).toContain('aws_vpc');
    expect(text).toContain('IGW');
    expect(text).toContain('optional');
  });

  it('renders role text when primitive has role', () => {
    mocks.stateSlots[0] = 'compiles';
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('network');
  });

  it('initial provider is currentProvider when present in compilesTo', () => {
    mocks.stateSlots[0] = 'compiles';
    const tree = render({ currentProvider: 'gcp' as 'gcp' });
    // Selected button has 'border-strong' background — find via inline style match
    const text = collectText(tree);
    // GCP's lone primitive should be visible
    expect(text).toContain('Network');
    expect(text).toContain('google_compute_network');
  });

  it('falls back to first provider when currentProvider is missing from compilesTo', () => {
    mocks.stateSlots[0] = 'compiles';
    const tree = render({ currentProvider: 'azure' as 'azure' });
    // azure is not a key, so first key (aws) becomes selected; aws primitives render
    const text = collectText(tree);
    expect(text).toContain('VPC');
  });

  it('renders empty-state when compilesTo has zero provider keys', () => {
    mocks.infoMap = {
      'Test.Block': { ...fullContent, compilesTo: {} },
    };
    // Force tab to compiles so the conditional renders the inner FC. (allTabs
    // will not include compiles so the user can't click it, but the FC is
    // still callable directly to assert the empty branch.)
    mocks.stateSlots[0] = 'compiles';
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('No infrastructure');
  });

  it('renders empty-state when compilesTo is absent on content', () => {
    mocks.infoMap = {
      'Test.Block': { overview: fullContent.overview },
    };
    mocks.stateSlots[0] = 'compiles';
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('No infrastructure');
  });

  it('clicking a provider button updates the per-tab selected provider', () => {
    mocks.stateSlots[0] = 'compiles';
    const tree = render();
    // Provider buttons inside the compiles tab
    const providerBtns = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        ((el.props as { className?: string }).className ?? '').includes('uppercase'),
    );
    expect(providerBtns.length).toBe(2);
    (providerBtns[1].props as { onClick: () => void }).onClick();
    expect(mocks.stateSlots[1]).toBe('gcp');
  });

  it('does not render role span when primitive lacks role', () => {
    mocks.infoMap = {
      'Test.Block': {
        ...fullContent,
        compilesTo: {
          aws: [{ name: 'NoRole', type: 'aws_x' }],
        },
      },
    };
    mocks.stateSlots[0] = 'compiles';
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('NoRole');
    // role 'network' should not appear since this primitive has no role
    expect(text).not.toContain('network');
  });

  it('treats a missing primitives array as [] (?? []) for the selected provider', () => {
    mocks.infoMap = {
      'Test.Block': {
        ...fullContent,
        compilesTo: { aws: undefined as unknown as never[] },
      },
    };
    mocks.stateSlots[0] = 'compiles';
    const tree = render();
    // Should not throw, and the selected provider button is still aws
    const text = collectText(tree);
    expect(text).toContain('aws');
  });
});

// ─── Snippets tab ────────────────────────────────────────────────────────

describe('ConceptInfoModal — Snippets tab', () => {
  it('renders the language switcher and the default language code', () => {
    mocks.stateSlots[0] = 'snippets';
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('TypeScript');
    expect(text).toContain('Python');
    expect(text).toContain('const x = 1;');
  });

  it('switching language updates the inner state slot', () => {
    mocks.stateSlots[0] = 'snippets';
    const tree = render();
    const langBtns = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { children?: unknown }).children === 'string' &&
        ['TypeScript', 'Python'].includes((el.props as { children: string }).children),
    );
    expect(langBtns).toHaveLength(2);
    (langBtns[1].props as { onClick: () => void }).onClick();
    expect(mocks.stateSlots[1]).toBe('py');
  });

  it('renders empty-state when no languages have snippets', () => {
    mocks.infoMap = {
      'Test.Block': { ...fullContent, snippets: {} },
    };
    mocks.stateSlots[0] = 'snippets';
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('No code snippets');
  });

  it('renders empty-state when content.snippets is undefined', () => {
    mocks.infoMap = {
      'Test.Block': { overview: fullContent.overview },
    };
    mocks.stateSlots[0] = 'snippets';
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('No code snippets');
  });

  it('falls back to empty string when chosen language has no snippet (?? ""guard)', () => {
    // SnippetsTab filters availableLangs = SNIPPET_LANGUAGES.filter(l => snippets[l]) — truthy.
    // To exercise the `?? ''` fallback we need a language that is in available
    // (truthy) BUT has the chosen `lang` not present. The cleanest setup:
    // ts truthy → availableLangs = ['ts'], but pre-seed slot 1 to 'py' (forcing
    // the chosen lang to be missing from snippets). content.snippets?.['py'] →
    // undefined → falls through to ''.
    mocks.infoMap = {
      'Test.Block': { ...fullContent, snippets: { ts: 'ok' } },
    };
    mocks.stateSlots[0] = 'snippets';
    mocks.stateSlots[1] = 'py';
    const tree = render();
    const codeEl = findByPredicate(tree, (el) => el.type === 'code');
    expect(codeEl).toHaveLength(1);
    expect((codeEl[0].props as { children: string }).children).toBe('');
  });
});

// ─── Links tab ───────────────────────────────────────────────────────────

describe('ConceptInfoModal — Links tab', () => {
  it('renders one anchor per link with href + label', () => {
    mocks.stateSlots[0] = 'links';
    const tree = render();
    const anchors = findByPredicate(tree, (el) => el.type === 'a');
    expect(anchors).toHaveLength(2);
    const hrefs = anchors.map((a) => (a.props as { href: string }).href);
    expect(hrefs).toEqual(['https://aws.example.com', 'https://gcp.example.com']);
    const text = collectText(tree);
    expect(text).toContain('AWS docs');
    expect(text).toContain('GCP docs');
  });

  it('anchors open in a new tab via target+rel', () => {
    mocks.stateSlots[0] = 'links';
    const tree = render();
    const anchors = findByPredicate(tree, (el) => el.type === 'a');
    for (const a of anchors) {
      const props = a.props as { target: string; rel: string };
      expect(props.target).toBe('_blank');
      expect(props.rel).toBe('noopener noreferrer');
    }
  });

  it('does not render any anchors when links is undefined (?.map guard)', () => {
    mocks.infoMap = {
      'Test.Block': { overview: fullContent.overview },
    };
    mocks.stateSlots[0] = 'links';
    const tree = render();
    const anchors = findByPredicate(tree, (el) => el.type === 'a');
    expect(anchors).toHaveLength(0);
  });
});

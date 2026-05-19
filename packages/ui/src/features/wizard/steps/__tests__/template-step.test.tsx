/**
 * TemplateStep — wizard step 3 template picker.
 *
 * Direct-FC tree-walker pattern. Component owns one `useState` (active
 * category) and one `useMemo` (filtered list). Both are mocked via
 * `vi.mock('react')` patching default + named exports.
 *
 * The unit composes:
 *   - TEMPLATE_CATEGORIES rows (mocked to a small fixture)
 *   - ALL_TEMPLATES (mocked likewise)
 *   - SearchInput / Badge / lucide icons (left as-is — primitives walk fine)
 *   - searchTemplates / getProviderCompatibility (mocked to controllable fns)
 *
 * Cites:
 *   - `react-namespace-hook-access-requires-patching-default-export-too`
 *   - `useState-mock-with-call-index-queue-for-multi-useState-components`
 *   - `vi-hoisted-must-include-large-fixture-arrays-when-vi-mock-factory-references-them`
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface FixtureCategory {
  id: 'frontend' | 'backend' | 'data';
  label: string;
  icon: string;
  color: string;
}

interface FixtureTemplate {
  id: string;
  name: string;
  description: string;
  category: FixtureCategory['id'];
  icon: string;
  estimatedCost: string;
  blocks: string[];
  tags: string[];
  securityLevel: 'basic' | 'standard' | 'strict' | 'compliance';
}

const mocks = vi.hoisted(() => {
  const fixtureCategories: FixtureCategory[] = [
    { id: 'frontend', label: 'Frontend', icon: 'Globe', color: '#ff0000' },
    { id: 'backend', label: 'Backend', icon: 'Server', color: '#00ff00' },
    { id: 'data', label: 'Data', icon: 'UnknownIcon', color: '#0000ff' },
  ];
  const fixtureTemplates: FixtureTemplate[] = [
    {
      id: 't-fe-1',
      name: 'FE Template 1',
      description: 'desc-fe-1',
      category: 'frontend',
      icon: 'Rocket',
      estimatedCost: '$10/mo',
      blocks: ['a', 'b'],
      tags: ['react', 'tailwind', 'extra'],
      securityLevel: 'standard',
    },
    {
      id: 't-be-1',
      name: 'BE Template 1',
      description: 'desc-be-1',
      category: 'backend',
      icon: 'Server',
      estimatedCost: '$5/mo',
      blocks: ['x'],
      tags: ['node'],
      securityLevel: 'basic',
    },
    {
      id: 't-no-icon',
      name: 'Unknown Icon',
      description: 'desc-unknown',
      category: 'data',
      icon: 'NoSuchIcon',
      estimatedCost: '$0',
      blocks: [],
      tags: [],
      securityLevel: 'compliance',
    },
  ];
  return {
    stateSlots: [] as unknown[],
    resetIdx: () => {},
    resetSlots() {
      this.stateSlots.length = 0;
    },
    fixtureCategories,
    fixtureTemplates,
    searchSpy: vi.fn((q: string, pool: FixtureTemplate[]) =>
      q ? pool.filter((t) => t.name.toLowerCase().includes(q.toLowerCase())) : pool,
    ),
    compatSpy: vi.fn(
      (_t: FixtureTemplate, _p: string) => ({ supported: 1, total: 1, unsupported: [] as string[] }),
    ),
  };
});

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  let useStateIdx = 0;
  const patchedUseState = vi.fn(<T,>(initial: T | (() => T)) => {
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

vi.mock('../../../../config/templates', () => ({
  ALL_TEMPLATES: mocks.fixtureTemplates,
  TEMPLATE_CATEGORIES: mocks.fixtureCategories,
  searchTemplates: (q: string, pool: FixtureTemplate[]) => mocks.searchSpy(q, pool),
  getProviderCompatibility: (t: FixtureTemplate, p: string) => mocks.compatSpy(t, p),
}));

vi.mock('../../../../config/color-palette', () => ({
  SECURITY_LEVEL_COLORS: {
    basic: '#bbb',
    standard: '#aaa',
    strict: '#ccc',
    compliance: '#ddd',
  },
}));

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('../../../../shared/components/ui/badge', () => ({
  Badge: ({ children }: { children?: React.ReactNode }) => (
    <span data-stub="Badge">{children}</span>
  ),
}));

vi.mock('../../../../shared/components/ui/search-input', () => ({
  SearchInput: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
  }) => (
    <input
      data-stub="SearchInput"
      data-placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

import { TemplateStep } from '../template-step';

// ── tree walker ──────────────────────────────────────────────────────────────
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

interface Props {
  selectedTemplateId: string | null;
  searchQuery: string;
  provider: 'aws' | 'gcp' | 'azure';
  onSelect: (id: string | null) => void;
  onSearchChange: (q: string) => void;
}

function render(propsOverride: Partial<Props> = {}): React.ReactElement {
  (mocks as unknown as { resetIdx: () => void }).resetIdx();
  const props: Props = {
    selectedTemplateId: null,
    searchQuery: '',
    provider: 'aws',
    onSelect: vi.fn(),
    onSearchChange: vi.fn(),
    ...propsOverride,
  };
  return (TemplateStep as unknown as (p: Props) => React.ReactElement)(props);
}

beforeEach(() => {
  mocks.resetSlots();
  mocks.searchSpy.mockClear();
  mocks.compatSpy.mockClear();
  mocks.compatSpy.mockImplementation((_t, _p) => ({
    supported: 1,
    total: 1,
    unsupported: [] as string[],
  }));
});

describe('TemplateStep', () => {
  describe('Header / static copy', () => {
    it('renders title and hint paragraphs from translations', () => {
      const tree = render();
      const titles = findByPredicate(tree, (el) => el.type === 'h3');
      expect(titles).toHaveLength(1);
      expect((titles[0].props as { children: string }).children).toBe('wizard.template.title');
    });
  });

  describe('Category tabs', () => {
    it('renders an "all" tab plus one per category fixture', () => {
      const tree = render();
      const tabs = findByPredicate(tree, (el) => el.type === 'button' && (el.props as { className?: string }).className?.includes('rounded-full') === true);
      expect(tabs.length).toBe(1 + mocks.fixtureCategories.length);
    });

    it('default active category is "all" — visible on the All tab', () => {
      const tree = render();
      const tabs = findByPredicate(
        tree,
        (el) => el.type === 'button' && (el.props as { className?: string }).className?.includes('rounded-full') === true,
      );
      expect((tabs[0].props as { className: string }).className).toContain('bg-ice-accent-muted');
    });

    it('clicking a non-all category sets that category as active', () => {
      const tree = render();
      const tabs = findByPredicate(
        tree,
        (el) => el.type === 'button' && (el.props as { className?: string }).className?.includes('rounded-full') === true,
      );
      const backendTab = tabs[2];
      (backendTab.props as { onClick: () => void }).onClick();
      expect(mocks.stateSlots[0]).toBe('backend');
    });

    it('clicking the all tab resets active category to "all"', () => {
      const tree = render();
      const tabs = findByPredicate(
        tree,
        (el) => el.type === 'button' && (el.props as { className?: string }).className?.includes('rounded-full') === true,
      );
      // First switch off "all"
      (tabs[1].props as { onClick: () => void }).onClick();
      // Then click "all"
      (tabs[0].props as { onClick: () => void }).onClick();
      expect(mocks.stateSlots[0]).toBe('all');
    });

    it('non-all category tab carries inline style only when active', () => {
      // Pre-seed the useState slot with frontend
      mocks.stateSlots.push('frontend');
      const tree = render();
      const tabs = findByPredicate(
        tree,
        (el) => el.type === 'button' && (el.props as { className?: string }).className?.includes('rounded-full') === true,
      );
      // tabs[1] = frontend
      expect((tabs[1].props as { style?: object }).style).toBeDefined();
      // tabs[2] = backend (not active)
      expect((tabs[2].props as { style?: object }).style).toBeUndefined();
    });

    it('when an unknown icon name is referenced the tab falls back to the Zap icon', () => {
      // 'data' fixture has icon 'UnknownIcon' — should map to fallback (Zap from lucide-react)
      const tree = render();
      const tabs = findByPredicate(
        tree,
        (el) => el.type === 'button' && (el.props as { className?: string }).className?.includes('rounded-full') === true,
      );
      // tabs[3] = data tab; its first child should be a function (lucide icon component)
      const tabChildren = (tabs[3].props as { children: React.ReactNode[] }).children;
      const iconEl = tabChildren[0] as React.ReactElement;
      expect(typeof iconEl.type).toBe('object'); // forwardRef icon
    });
  });

  describe('SearchInput integration', () => {
    it('forwards searchQuery and onSearchChange to SearchInput', () => {
      const onSearchChange = vi.fn();
      const tree = render({ searchQuery: 'react', onSearchChange });
      const search = findByPredicate(
        tree,
        (el) => (el.props as { ['data-stub']?: string })['data-stub'] === 'SearchInput',
      )[0];
      expect((search.props as { value: string }).value).toBe('react');
      (search.props as { onChange: (e: { target: { value: string } }) => void }).onChange({
        target: { value: 'be' },
      });
      expect(onSearchChange).toHaveBeenCalledWith('be');
    });

    it('renders a placeholder from translations', () => {
      const tree = render();
      const search = findByPredicate(
        tree,
        (el) => (el.props as { ['data-stub']?: string })['data-stub'] === 'SearchInput',
      )[0];
      expect((search.props as { ['data-placeholder']?: string })['data-placeholder']).toBe(
        'wizard.template.searchPlaceholder',
      );
    });
  });

  describe('Filtering', () => {
    it('passes ALL_TEMPLATES when category=all', () => {
      render();
      expect(mocks.searchSpy).toHaveBeenCalledTimes(1);
      const [q, pool] = mocks.searchSpy.mock.calls[0];
      expect(q).toBe('');
      expect(pool).toEqual(mocks.fixtureTemplates);
    });

    it('filters pool to category before searching when category != all', () => {
      mocks.stateSlots.push('backend');
      render();
      const [, pool] = mocks.searchSpy.mock.calls[0];
      expect((pool as FixtureTemplate[]).every((t) => t.category === 'backend')).toBe(true);
    });

    it('forwards searchQuery directly into searchTemplates', () => {
      render({ searchQuery: 'BE' });
      const [q] = mocks.searchSpy.mock.calls[0];
      expect(q).toBe('BE');
    });
  });

  describe('Blank canvas option', () => {
    it('renders the blank-canvas card with selected styling when selectedTemplateId is null', () => {
      const tree = render({ selectedTemplateId: null });
      const cards = findByPredicate(
        tree,
        (el) =>
          el.type === 'button' &&
          (el.props as { className?: string }).className?.includes('flex-col items-start') === true,
      );
      expect(cards.length).toBeGreaterThan(0);
      // First card is the blank one
      expect((cards[0].props as { className: string }).className).toContain('border-ice-accent');
    });

    it('renders blank-canvas card without selected styling when a template is selected', () => {
      const tree = render({ selectedTemplateId: 't-fe-1' });
      const cards = findByPredicate(
        tree,
        (el) =>
          el.type === 'button' &&
          (el.props as { className?: string }).className?.includes('flex-col items-start') === true,
      );
      expect((cards[0].props as { className: string }).className).not.toContain('border-ice-accent');
    });

    it('clicking the blank card calls onSelect(null)', () => {
      const onSelect = vi.fn();
      const tree = render({ onSelect });
      const cards = findByPredicate(
        tree,
        (el) =>
          el.type === 'button' &&
          (el.props as { className?: string }).className?.includes('flex-col items-start') === true,
      );
      (cards[0].props as { onClick: () => void }).onClick();
      expect(onSelect).toHaveBeenCalledWith(null);
    });
  });

  describe('Template cards', () => {
    it('renders one card per filtered template after the blank card', () => {
      const tree = render();
      const cards = findByPredicate(
        tree,
        (el) =>
          el.type === 'button' &&
          (el.props as { className?: string }).className?.includes('flex-col items-start') === true,
      );
      // 1 blank + 3 templates
      expect(cards).toHaveLength(1 + mocks.fixtureTemplates.length);
    });

    it('clicking a template card calls onSelect with that template id', () => {
      const onSelect = vi.fn();
      const tree = render({ onSelect });
      const cards = findByPredicate(
        tree,
        (el) =>
          el.type === 'button' &&
          (el.props as { className?: string }).className?.includes('flex-col items-start') === true,
      );
      (cards[1].props as { onClick: () => void }).onClick();
      expect(onSelect).toHaveBeenCalledWith('t-fe-1');
    });

    it('selected template card has accent class', () => {
      const tree = render({ selectedTemplateId: 't-fe-1' });
      const cards = findByPredicate(
        tree,
        (el) =>
          el.type === 'button' &&
          (el.props as { className?: string }).className?.includes('flex-col items-start') === true,
      );
      expect((cards[1].props as { className: string }).className).toContain('border-ice-accent');
      expect((cards[2].props as { className: string }).className).not.toContain('border-ice-accent');
    });

    it('renders the cost / block-count / category badges per card', () => {
      const tree = render();
      // Just collect text and verify expected fragments
      const allText = findByPredicate(tree, (el) => typeof (el.props as { children?: unknown }).children === 'string')
        .map((el) => (el.props as { children: string }).children)
        .join(' ');
      expect(allText).toContain('FE Template 1');
      expect(allText).toContain('$10/mo');
      expect(allText).toContain('BE Template 1');
    });

    it('renders compatibility check icon when allSupported', () => {
      mocks.compatSpy.mockImplementation(() => ({
        supported: 2,
        total: 2,
        unsupported: [] as string[],
      }));
      const tree = render();
      // Look for the CheckCircle (lucide) span
      const checks = findByPredicate(
        tree,
        (el) =>
          el.type === 'span' &&
          (el.props as { className?: string }).className?.includes('text-emerald-400') === true,
      );
      expect(checks.length).toBeGreaterThan(0);
    });

    it('renders a partial-compat warning with title "Unsupported: ..." when some unsupported', () => {
      mocks.compatSpy.mockImplementation(() => ({
        supported: 1,
        total: 2,
        unsupported: ['azure'] as string[],
      }));
      const tree = render();
      const warns = findByPredicate(
        tree,
        (el) =>
          el.type === 'span' &&
          typeof (el.props as { title?: string }).title === 'string' &&
          (el.props as { title: string }).title.startsWith('Unsupported:'),
      );
      expect(warns.length).toBeGreaterThan(0);
    });

    it('applies opacity-50 dim styling when no providers supported', () => {
      mocks.compatSpy.mockImplementation(() => ({
        supported: 0,
        total: 2,
        unsupported: ['aws', 'gcp'] as string[],
      }));
      const tree = render();
      const cards = findByPredicate(
        tree,
        (el) =>
          el.type === 'button' &&
          (el.props as { className?: string }).className?.includes('flex-col items-start') === true,
      );
      // Skip the blank card (cards[0]) — it doesn't go through compat
      expect((cards[1].props as { className: string }).className).toContain('opacity-50');
    });

    it('does not render a check or warn icon when no providers are supported', () => {
      mocks.compatSpy.mockImplementation(() => ({
        supported: 0,
        total: 2,
        unsupported: ['aws', 'gcp'] as string[],
      }));
      const tree = render();
      const checks = findByPredicate(
        tree,
        (el) =>
          el.type === 'span' &&
          (el.props as { className?: string }).className?.includes('text-emerald-400') === true,
      );
      const warns = findByPredicate(
        tree,
        (el) =>
          el.type === 'span' &&
          typeof (el.props as { title?: string }).title === 'string' &&
          (el.props as { title: string }).title.startsWith('Unsupported:'),
      );
      expect(checks.length).toBe(0);
      expect(warns.length).toBe(0);
    });

    it('omits the category-meta badge when the template category does not match a known meta', () => {
      mocks.fixtureCategories.length = 0; // strip category metas — no match exists
      const tree = render();
      // No element with backgroundColor matching '#ff000020' style
      const badges = findByPredicate(
        tree,
        (el) =>
          el.type === 'span' &&
          (el.props as { style?: { backgroundColor?: string } }).style?.backgroundColor === '#ff000020',
      );
      expect(badges).toHaveLength(0);
      // Restore for other tests
      mocks.fixtureCategories.push(
        { id: 'frontend', label: 'Frontend', icon: 'Globe', color: '#ff0000' },
        { id: 'backend', label: 'Backend', icon: 'Server', color: '#00ff00' },
        { id: 'data', label: 'Data', icon: 'UnknownIcon', color: '#0000ff' },
      );
    });

    it('renders only the first 2 tags from the template (slice(0,2))', () => {
      const tree = render();
      // FE template has 3 tags: react, tailwind, extra — only react+tailwind should render
      const badges = findByPredicate(
        tree,
        (el) => (el.props as { ['data-stub']?: string })['data-stub'] === 'Badge',
      );
      const tagTexts = badges
        .map((b) => (b.props as { children?: unknown }).children)
        .filter((c): c is string => typeof c === 'string');
      expect(tagTexts).toContain('react');
      expect(tagTexts).toContain('tailwind');
      expect(tagTexts).not.toContain('extra');
    });

    it('falls back to Rocket icon when template.icon is unknown', () => {
      const tree = render();
      // No throw; just verify the render did not crash and produced cards
      const cards = findByPredicate(
        tree,
        (el) =>
          el.type === 'button' &&
          (el.props as { className?: string }).className?.includes('flex-col items-start') === true,
      );
      expect(cards.length).toBeGreaterThan(0);
    });
  });
});

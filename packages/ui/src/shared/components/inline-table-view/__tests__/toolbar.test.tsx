/**
 * Tests for `inline-table-view/toolbar.tsx` (rf-itab-2).
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({
    t: (k: string, vars?: Record<string, unknown>) => (vars ? `${k}:${JSON.stringify(vars)}` : k),
  }),
}));

import { Toolbar } from '../toolbar';
import type { RowStatus } from '../../inline-table-view-helpers';

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

function findElements(tree: React.ReactNode, predicate: (el: React.ReactElement) => boolean): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) {
    if (predicate(el)) out.push(el);
  }
  return out;
}

import type { Density, GroupBy } from '../types';

const baseProps: {
  search: string;
  onSearchChange: ReturnType<typeof vi.fn>;
  statusFilter: Set<RowStatus>;
  providerFilter: Set<string>;
  counts: Record<RowStatus, number>;
  availableProviders: string[];
  hasActiveFilter: boolean;
  groupBy: GroupBy;
  density: Density;
  onToggleStatus: ReturnType<typeof vi.fn>;
  onToggleProvider: ReturnType<typeof vi.fn>;
  onClearFilters: ReturnType<typeof vi.fn>;
  onGroupByChange: ReturnType<typeof vi.fn>;
  onDensityChange: ReturnType<typeof vi.fn>;
} = {
  search: '',
  onSearchChange: vi.fn(),
  statusFilter: new Set<RowStatus>(),
  providerFilter: new Set<string>(),
  counts: { live: 3, drifted: 0, deploying: 0, building: 0, queued: 0, failed: 1, idle: 0 } as Record<
    RowStatus,
    number
  >,
  availableProviders: ['gcp'],
  hasActiveFilter: false,
  groupBy: 'none',
  density: 'comfortable',
  onToggleStatus: vi.fn(),
  onToggleProvider: vi.fn(),
  onClearFilters: vi.fn(),
  onGroupByChange: vi.fn(),
  onDensityChange: vi.fn(),
};

function render(props: Partial<typeof baseProps> = {}) {
  return (Toolbar as unknown as (p: typeof baseProps) => React.ReactNode)({ ...baseProps, ...props });
}

describe('inline-table-view/toolbar', () => {
  it('renders one filter chip per status with non-zero count', () => {
    const tree = render();
    // The filter chip is the FilterChip FC, which renders a button. After
    // walking through the FC, the only buttons inside the status filter
    // group are the chips.
    const chips = findElements(tree, (el) => el.type === 'button' && Array.isArray((el.props as any).children));
    // 2 status chips (live, failed) + density buttons (2). The density
    // buttons have a single string child, while chips have 2 children
    // (dot + label)
    const statusChips = chips.filter((b) => {
      const c = (b.props as any).children as React.ReactNode[];
      // chip has [dot|false, label]
      return Array.isArray(c) && c.length === 2 && typeof c[1] === 'string' && c[1].startsWith('table.status.');
    });
    expect(statusChips).toHaveLength(2);
  });

  it('does NOT render the provider filter group when only 0 or 1 provider exists', () => {
    const tree = render({ availableProviders: ['gcp'] });
    // Look for any FilterChip whose label is 'gcp' (providerLabel returns
    // 'GCP' for known providers) — there shouldn't be any since we only
    // render the provider group when length > 1
    const allButtons = findElements(tree, (el) => el.type === 'button');
    const providerChips = allButtons.filter((b) => {
      const c = (b.props as any).children as React.ReactNode[];
      return (
        Array.isArray(c) &&
        c.length === 2 &&
        c[0] === false &&
        typeof c[1] === 'string' &&
        c[1].toLowerCase().includes('gcp')
      );
    });
    expect(providerChips).toHaveLength(0);
  });

  it('renders the provider filter group when 2+ providers exist', () => {
    const tree = render({ availableProviders: ['gcp', 'aws'] });
    const allButtons = findElements(tree, (el) => el.type === 'button');
    // The presence of more buttons confirms the provider group renders
    const allChipButtons = allButtons.filter((b) => {
      const c = (b.props as any).children as React.ReactNode[];
      return Array.isArray(c) && c.length === 2;
    });
    // At least 2 status chips + 2 provider chips
    expect(allChipButtons.length).toBeGreaterThanOrEqual(4);
  });

  it('does NOT render the clear-filters button when hasActiveFilter is false', () => {
    const tree = render({ hasActiveFilter: false });
    // The clear filter button has X icon + i18n key for clear
    const buttons = findElements(tree, (el) => el.type === 'button');
    const clearButton = buttons.find((b) => {
      const c = (b.props as any).children as React.ReactNode[];
      return Array.isArray(c) && typeof c[1] === 'string' && c[1] === 'table.filter.clear';
    });
    expect(clearButton).toBeUndefined();
  });

  it('renders the clear-filters button when hasActiveFilter is true', () => {
    const tree = render({ hasActiveFilter: true });
    const buttons = findElements(tree, (el) => el.type === 'button');
    const clearButton = buttons.find((b) => {
      const c = (b.props as any).children as React.ReactNode[];
      return Array.isArray(c) && typeof c[1] === 'string' && c[1] === 'table.filter.clear';
    });
    expect(clearButton).toBeDefined();
  });

  it('invokes onClearFilters when the clear button is clicked', () => {
    const onClearFilters = vi.fn();
    const tree = render({ hasActiveFilter: true, onClearFilters });
    const buttons = findElements(tree, (el) => el.type === 'button');
    const clearButton = buttons.find((b) => {
      const c = (b.props as any).children as React.ReactNode[];
      return Array.isArray(c) && typeof c[1] === 'string' && c[1] === 'table.filter.clear';
    });
    (clearButton!.props as any).onClick();
    expect(onClearFilters).toHaveBeenCalled();
  });

  it('renders a select with the correct value for groupBy', () => {
    const tree = render({ groupBy: 'status' });
    const selects = findElements(tree, (el) => el.type === 'select');
    expect(selects).toHaveLength(1);
    expect((selects[0]!.props as any).value).toBe('status');
  });

  it('invokes onGroupByChange when the select fires onChange', () => {
    const onGroupByChange = vi.fn();
    const tree = render({ onGroupByChange });
    const selects = findElements(tree, (el) => el.type === 'select');
    (selects[0]!.props as any).onChange({ target: { value: 'family' } });
    expect(onGroupByChange).toHaveBeenCalledWith('family');
  });

  it('marks the comfortable density button active when density === comfortable', () => {
    const tree = render({ density: 'comfortable' });
    const buttons = findElements(tree, (el) => el.type === 'button');
    const densityButtons = buttons.filter((b) => {
      const c = (b.props as any).children;
      return typeof c === 'string' && (c === 'table.density.comfortable' || c === 'table.density.compact');
    });
    expect(densityButtons).toHaveLength(2);
    const comfortable = densityButtons.find((b) => (b.props as any).children === 'table.density.comfortable');
    expect((comfortable!.props as any).className).toContain('bg-ice-accent-muted');
  });

  it('invokes onDensityChange when a density button is clicked', () => {
    const onDensityChange = vi.fn();
    const tree = render({ onDensityChange });
    const buttons = findElements(tree, (el) => el.type === 'button');
    const compactButton = buttons.find((b) => (b.props as any).children === 'table.density.compact');
    (compactButton!.props as any).onClick();
    expect(onDensityChange).toHaveBeenCalledWith('compact');
  });
});

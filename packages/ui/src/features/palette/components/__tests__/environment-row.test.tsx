/**
 * rf-ptree-5 — `EnvironmentRow` component.
 *
 * Direct-FC tree-walker pattern (rf-props-6 / rf-pdpl-7..15). The component
 * is a plain FC (no memo, no forwardRef), so it can be invoked directly via
 * `(EnvironmentRow as unknown as Fn)(props)` and the returned tree walked
 * for assertions about className, deploying spinner, and click wiring.
 *
 * Lucide icons (`Loader2`) are forwardRef objects, so predicates filter on
 * className instead of `el.type` (cite
 * `lucide-react-icons-are-forwardref-objects-not-fcs-for-tree-walker-predicates`,
 * rf-pdpl-14).
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

import { EnvironmentRow, type EnvironmentRowProps } from '../environment-row';
import type { Environment, Project } from '../../../../store/slices/projects-slice';

const ENV_PROD: Environment = {
  id: 'env-prod',
  name: 'production',
  type: 'production',
  cardId: 'card-prod',
  templateId: null,
  securityLevel: 'standard',
  region: 'us-central1',
  createdAt: 0,
};

const PROJECT: Project = {
  id: 'p1',
  name: 'Alpha',
  description: '',
  provider: 'gcp',
  organisationId: 'org-1',
  environments: [ENV_PROD],
  folderId: null,
  order: 0,
  expanded: false,
  createdAt: 0,
};

type RenderedTree = React.ReactElement;
type Fn = (p: EnvironmentRowProps) => RenderedTree;

const render = (props: Partial<EnvironmentRowProps> = {}): RenderedTree => {
  const merged: EnvironmentRowProps = {
    env: ENV_PROD,
    project: PROJECT,
    depth: 0,
    activeEnvId: null,
    activeProjectId: null,
    deployingCardId: null,
    deployStatus: 'idle',
    onClick: vi.fn(),
    ...props,
  };
  return (EnvironmentRow as unknown as Fn)(merged);
};

// Walk a React element tree and return all elements where `pred(el)` is true.
function findAll(
  el: React.ReactElement | string | number | boolean | null | undefined,
  pred: (e: React.ReactElement) => boolean,
): React.ReactElement[] {
  if (el == null || typeof el !== 'object') return [];
  const out: React.ReactElement[] = [];
  if (pred(el as React.ReactElement)) out.push(el as React.ReactElement);
  const children = (el as React.ReactElement).props?.children;
  const arr = Array.isArray(children) ? children : [children];
  for (const c of arr) {
    if (typeof c === 'object' && c !== null) {
      out.push(...findAll(c as React.ReactElement, pred));
    }
  }
  return out;
}

const collectText = (
  el: React.ReactElement | string | number | boolean | null | undefined,
): string => {
  if (el == null || typeof el === 'boolean') return '';
  if (typeof el === 'string' || typeof el === 'number') return String(el);
  const children = (el as React.ReactElement).props?.children;
  const arr = Array.isArray(children) ? children : [children];
  return arr.map((c) => collectText(c)).join('');
};

const classOf = (el: React.ReactElement): string =>
  (el.props?.className as string | undefined) ?? '';

// ────────────────────────────────────────────────────────────────────────────

describe('EnvironmentRow — base render', () => {
  it('renders the env name and region in the row', () => {
    const tree = render();
    const txt = collectText(tree);
    expect(txt).toContain('production');
    expect(txt).toContain('us-central1');
  });

  it('shows a colored dot (no spinner) when not deploying', () => {
    const tree = render();
    const dots = findAll(tree, (el) => classOf(el).includes('rounded-full'));
    expect(dots.length).toBeGreaterThanOrEqual(1);
    const spinners = findAll(tree, (el) => classOf(el).includes('animate-spin'));
    expect(spinners).toHaveLength(0);
  });

  it('applies depth-driven left padding via inline style (depth=2 → 40px)', () => {
    const tree = render({ depth: 2 });
    const style = tree.props.style as React.CSSProperties;
    // 2 * 16 + 8 = 40
    expect(style.paddingLeft).toBe('calc(40px * var(--ice-space-scale, 1))');
  });

  it('depth=0 still applies paddingLeft of TREE_INDENT_BASE (8px)', () => {
    const tree = render({ depth: 0 });
    const style = tree.props.style as React.CSSProperties;
    expect(style.paddingLeft).toBe('calc(8px * var(--ice-space-scale, 1))');
  });
});

describe('EnvironmentRow — active state', () => {
  it('applies active highlight class when activeEnvId AND activeProjectId match', () => {
    const tree = render({ activeEnvId: 'env-prod', activeProjectId: 'p1' });
    expect(classOf(tree)).toContain('bg-blue-500/10');
    expect(classOf(tree)).toContain('text-ice-text-1');
  });

  it('does NOT apply active highlight when only env id matches', () => {
    const tree = render({ activeEnvId: 'env-prod', activeProjectId: 'other-project' });
    expect(classOf(tree)).toContain('hover:bg-ice-hover');
    expect(classOf(tree)).not.toContain('bg-blue-500/10 text-ice-text-1');
  });

  it('does NOT apply active highlight when only project id matches', () => {
    const tree = render({ activeEnvId: 'other-env', activeProjectId: 'p1' });
    expect(classOf(tree)).toContain('hover:bg-ice-hover');
  });
});

describe('EnvironmentRow — deploying state', () => {
  it('shows the Loader2 spinner when this card is deploying', () => {
    const tree = render({ deployingCardId: 'card-prod', deployStatus: 'deploying' });
    const spinners = findAll(tree, (el) => classOf(el).includes('animate-spin'));
    expect(spinners.length).toBeGreaterThanOrEqual(1);
    // The dot (rounded-full span) should NOT be in the tree alongside the spinner.
    const dots = findAll(tree, (el) => classOf(el).includes('rounded-full'));
    expect(dots).toHaveLength(0);
  });

  it('shows the spinner when status === "planning" too', () => {
    const tree = render({ deployingCardId: 'card-prod', deployStatus: 'planning' });
    const spinners = findAll(tree, (el) => classOf(el).includes('animate-spin'));
    expect(spinners).toHaveLength(1);
  });

  it('replaces region text with "deploying" while deploying', () => {
    const tree = render({ deployingCardId: 'card-prod', deployStatus: 'deploying' });
    const txt = collectText(tree);
    expect(txt).toContain('deploying');
    expect(txt).not.toContain('us-central1');
  });

  it('applies the blue ring + animate-pulse classes while deploying', () => {
    const tree = render({ deployingCardId: 'card-prod', deployStatus: 'deploying' });
    expect(classOf(tree)).toContain('animate-pulse');
    expect(classOf(tree)).toContain('ring-blue-500/40');
  });

  it('does NOT apply deploying state when deployingCardId is for a DIFFERENT card', () => {
    const tree = render({ deployingCardId: 'card-other', deployStatus: 'deploying' });
    expect(classOf(tree)).not.toContain('animate-pulse');
    const spinners = findAll(tree, (el) => classOf(el).includes('animate-spin'));
    expect(spinners).toHaveLength(0);
  });

  it('sets title="Deploying…" while deploying', () => {
    const tree = render({ deployingCardId: 'card-prod', deployStatus: 'deploying' });
    expect(tree.props.title).toBe('Deploying…');
  });
});

describe('EnvironmentRow — error state', () => {
  it('applies red ring class when this card has deploy error', () => {
    const tree = render({ deployingCardId: 'card-prod', deployStatus: 'error' });
    expect(classOf(tree)).toContain('ring-red-500/40');
    expect(classOf(tree)).toContain('bg-red-500/10');
  });

  it('sets title="Last deploy failed" when this card has deploy error', () => {
    const tree = render({ deployingCardId: 'card-prod', deployStatus: 'error' });
    expect(tree.props.title).toBe('Last deploy failed');
  });

  it('keeps the dot (no spinner) in error state', () => {
    const tree = render({ deployingCardId: 'card-prod', deployStatus: 'error' });
    const dots = findAll(tree, (el) => classOf(el).includes('rounded-full'));
    expect(dots).toHaveLength(1);
    const spinners = findAll(tree, (el) => classOf(el).includes('animate-spin'));
    expect(spinners).toHaveLength(0);
  });

  it('preserves the region text in error state', () => {
    const tree = render({ deployingCardId: 'card-prod', deployStatus: 'error' });
    expect(collectText(tree)).toContain('us-central1');
  });
});

describe('EnvironmentRow — onClick wiring', () => {
  it('passes (event, project, env) to the onClick prop', () => {
    const onClick = vi.fn();
    const tree = render({ onClick });
    // Invoke the row's onClick with a stub event.
    const ev = { stopPropagation: vi.fn() } as unknown as React.MouseEvent;
    (tree.props.onClick as (e: React.MouseEvent) => void)(ev);
    expect(onClick).toHaveBeenCalledWith(ev, PROJECT, ENV_PROD);
  });
});

describe('EnvironmentRow — dot color by env type', () => {
  it('uses ENV_DOT_COLORS map for valid env types', () => {
    const tree = render();
    const dot = findAll(tree, (el) => classOf(el).includes('rounded-full'))[0];
    // The dotColor class is one of bg-* mapped from ENV_DOT_COLORS.production.
    // We just confirm it has a bg-* token (color-palette is the source of truth).
    expect(classOf(dot)).toMatch(/bg-/);
  });

  it('falls back to bg-gray-500 for an unknown env type', () => {
    const weirdEnv: Environment = { ...ENV_PROD, type: 'weird-unknown-type' as Environment['type'] };
    const tree = render({ env: weirdEnv });
    const dot = findAll(tree, (el) => classOf(el).includes('rounded-full'))[0];
    expect(classOf(dot)).toContain('bg-gray-500');
  });
});

describe('EnvironmentRow — deployingCardId variants', () => {
  it('deployingCardId = undefined behaves the same as null (no deploying state)', () => {
    const tree = render({ deployingCardId: undefined, deployStatus: 'deploying' });
    expect(classOf(tree)).not.toContain('animate-pulse');
  });

  it('deployStatus other than deploying/planning/error → no special highlight', () => {
    const tree = render({ deployingCardId: 'card-prod', deployStatus: 'idle' });
    expect(classOf(tree)).not.toContain('animate-pulse');
    expect(classOf(tree)).not.toContain('ring-red-500/40');
  });
});

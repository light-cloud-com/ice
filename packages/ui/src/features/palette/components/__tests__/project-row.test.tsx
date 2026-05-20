/**
 * rf-ptree-6 — `ProjectRow` component.
 *
 * Direct-FC tree-walker pattern (rf-props-6 / rf-pdpl-7..15). The component
 * is a plain FC, so it can be invoked directly via `(ProjectRow as Fn)(props)`
 * and the returned tree walked for assertions about active highlight,
 * expand chevron variant, env children, edit input wiring, and the four
 * event-handler props (onProjectClick, onContextMenu, onToggleExpanded,
 * onDragStart).
 *
 * Lucide icons (`ChevronDown`, `ChevronRight`, `Layers`, `MoreHorizontal`)
 * are forwardRef objects — predicates filter on className substring rather
 * than `el.type` (cite rf-pdpl-14 lucide-react-icons-are-forwardref-objects).
 *
 * The nested EnvironmentRow children are matched by reference equality on
 * `el.type === EnvironmentRow` (cite rf-pdpl-15 lucide-react-aliased-icons-
 * displayname-tracks-target-not-binding for the equivalent pattern on
 * lucide aliases — same idea: identity, not displayName).
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { EnvironmentRow } from '../environment-row';
import { ProjectRow, type ProjectRowProps } from '../project-row';
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
const ENV_STG: Environment = { ...ENV_PROD, id: 'env-stg', name: 'staging', type: 'staging', cardId: 'card-stg' };

const PROJECT_WITH_ENVS: Project = {
  id: 'p1',
  name: 'Alpha',
  description: '',
  provider: 'gcp',
  organisationId: 'org-1',
  environments: [ENV_PROD, ENV_STG],
  folderId: null,
  order: 0,
  expanded: true,
  createdAt: 0,
};
const PROJECT_NO_ENVS: Project = { ...PROJECT_WITH_ENVS, id: 'p-empty', environments: [], expanded: false };
const PROJECT_COLLAPSED: Project = { ...PROJECT_WITH_ENVS, id: 'p-coll', expanded: false };

type Fn = (p: ProjectRowProps) => React.ReactElement;

const baseProps = (overrides: Partial<ProjectRowProps> = {}): ProjectRowProps => ({
  project: PROJECT_WITH_ENVS,
  depth: 0,
  activeProjectId: null,
  activeEnvId: null,
  deployingCardId: null,
  deployStatus: 'idle',
  editingId: null,
  editingName: '',
  editInputRef: { current: null } as React.RefObject<HTMLInputElement>,
  onDragStart: vi.fn(),
  onProjectClick: vi.fn(),
  onEnvClick: vi.fn(),
  onContextMenu: vi.fn(),
  onFinishRename: vi.fn(),
  onToggleExpanded: vi.fn(),
  setEditingId: vi.fn(),
  setEditingName: vi.fn(),
  ...overrides,
});

const render = (overrides: Partial<ProjectRowProps> = {}): React.ReactElement => {
  return (ProjectRow as unknown as Fn)(baseProps(overrides));
};

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

const collectText = (el: React.ReactElement | string | number | boolean | null | undefined): string => {
  if (el == null || typeof el === 'boolean') return '';
  if (typeof el === 'string' || typeof el === 'number') return String(el);
  const children = (el as React.ReactElement).props?.children;
  const arr = Array.isArray(children) ? children : [children];
  return arr.map((c) => collectText(c)).join('');
};

const classOf = (el: React.ReactElement): string => (el.props?.className as string | undefined) ?? '';

// The header-row div is the FIRST div child of the wrapper.
const getHeaderRow = (tree: React.ReactElement): React.ReactElement => {
  const children = tree.props?.children;
  const arr = Array.isArray(children) ? children : [children];
  const div = arr.find(
    (c): c is React.ReactElement => c != null && typeof c === 'object' && (c as React.ReactElement).type === 'div',
  );
  if (!div) throw new Error('header div not found');
  return div;
};

// ────────────────────────────────────────────────────────────────────────────

describe('ProjectRow — base render', () => {
  it('renders the project name in the row', () => {
    const tree = render();
    expect(collectText(tree)).toContain('Alpha');
  });

  it('renders the env count badge when envCount > 0 and not editing', () => {
    const tree = render();
    // The env count is "2"
    const badges = findAll(tree, (el) => classOf(el).includes('tabular-nums'));
    expect(badges).toHaveLength(1);
    expect(collectText(badges[0])).toBe('2');
  });

  it('does NOT render env count badge when project has no envs', () => {
    const tree = render({ project: PROJECT_NO_ENVS });
    const badges = findAll(tree, (el) => classOf(el).includes('tabular-nums'));
    expect(badges).toHaveLength(0);
  });

  it('applies depth-driven left padding on the header row', () => {
    const tree = render({ depth: 2 });
    const header = getHeaderRow(tree);
    const style = header.props.style as React.CSSProperties;
    expect(style.paddingLeft).toBe('calc(40px * var(--ice-space-scale, 1))');
  });
});

describe('ProjectRow — active state', () => {
  it('applies active highlight when project.id === activeProjectId', () => {
    const tree = render({ activeProjectId: 'p1' });
    const header = getHeaderRow(tree);
    expect(classOf(header)).toContain('bg-blue-500/15');
    expect(classOf(header)).toContain('text-white');
  });

  it('does NOT apply active highlight when activeProjectId is different', () => {
    const tree = render({ activeProjectId: 'other' });
    const header = getHeaderRow(tree);
    expect(classOf(header)).toContain('hover:bg-ice-hover');
    expect(classOf(header)).not.toContain('bg-blue-500/15');
  });
});

describe('ProjectRow — expand chevron', () => {
  it('shows ChevronDown when project is expanded AND has envs', () => {
    const tree = render({ project: { ...PROJECT_WITH_ENVS, expanded: true } });
    // The chevron is inside a button with className "shrink-0 p-0"
    const button = findAll(tree, (el) => el.type === 'button' && classOf(el).includes('shrink-0 p-0'))[0];
    expect(button).toBeDefined();
    // Find lucide icon under it — predicate by className
    const icons = findAll(button, (el) => classOf(el).includes('w-3 h-3 opacity-50'));
    expect(icons).toHaveLength(1);
  });

  it('shows ChevronRight when project is collapsed', () => {
    const tree = render({ project: PROJECT_COLLAPSED });
    const button = findAll(tree, (el) => el.type === 'button' && classOf(el).includes('shrink-0 p-0'))[0];
    expect(button).toBeDefined();
  });

  it('renders a spacer div (no chevron button) when project has no envs', () => {
    const tree = render({ project: PROJECT_NO_ENVS });
    const buttons = findAll(tree, (el) => el.type === 'button' && classOf(el).includes('shrink-0 p-0'));
    expect(buttons).toHaveLength(0);
    // Spacer div with className "w-3 shrink-0"
    const spacers = findAll(tree, (el) => el.type === 'div' && classOf(el) === 'w-3 shrink-0');
    expect(spacers).toHaveLength(1);
  });

  it('clicking the chevron calls onToggleExpanded(project.id) and stopPropagation', () => {
    const onToggleExpanded = vi.fn();
    const tree = render({ onToggleExpanded });
    const button = findAll(tree, (el) => el.type === 'button' && classOf(el).includes('shrink-0 p-0'))[0];
    const stopPropagation = vi.fn();
    (button.props.onClick as (e: React.MouseEvent) => void)({ stopPropagation } as unknown as React.MouseEvent);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(onToggleExpanded).toHaveBeenCalledWith('p1');
  });
});

describe('ProjectRow — children environments', () => {
  it('renders one EnvironmentRow per env when expanded', () => {
    const tree = render({ project: { ...PROJECT_WITH_ENVS, expanded: true } });
    const envRows = findAll(tree, (el) => el.type === EnvironmentRow);
    expect(envRows).toHaveLength(2);
  });

  it('does NOT render env children when project is collapsed', () => {
    const tree = render({ project: PROJECT_COLLAPSED });
    const envRows = findAll(tree, (el) => el.type === EnvironmentRow);
    expect(envRows).toHaveLength(0);
  });

  it('does NOT render env children when project has no envs (even if expanded)', () => {
    const tree = render({ project: { ...PROJECT_NO_ENVS, expanded: true } });
    const envRows = findAll(tree, (el) => el.type === EnvironmentRow);
    expect(envRows).toHaveLength(0);
  });

  it('threads activeEnvId, deployingCardId, deployStatus, onEnvClick to each env row', () => {
    const onEnvClick = vi.fn();
    const tree = render({
      activeEnvId: 'env-prod',
      activeProjectId: 'p1',
      deployingCardId: 'card-prod',
      deployStatus: 'deploying',
      onEnvClick,
    });
    const envRows = findAll(tree, (el) => el.type === EnvironmentRow);
    expect(envRows[0].props.activeEnvId).toBe('env-prod');
    expect(envRows[0].props.deployingCardId).toBe('card-prod');
    expect(envRows[0].props.deployStatus).toBe('deploying');
    expect(envRows[0].props.onClick).toBe(onEnvClick);
  });

  it('children get depth+1 (parent depth=0 → children depth=1)', () => {
    const tree = render({ depth: 0, project: { ...PROJECT_WITH_ENVS, expanded: true } });
    const envRows = findAll(tree, (el) => el.type === EnvironmentRow);
    expect(envRows[0].props.depth).toBe(1);
    expect(envRows[1].props.depth).toBe(1);
  });
});

describe('ProjectRow — edit mode', () => {
  it('renders an input (not a span) when editingId === project.id', () => {
    const tree = render({ editingId: 'p1', editingName: 'Edited' });
    const inputs = findAll(tree, (el) => el.type === 'input');
    expect(inputs).toHaveLength(1);
    expect(inputs[0].props.value).toBe('Edited');
  });

  it('input is NOT draggable while editing (draggable={!isEditing})', () => {
    const tree = render({ editingId: 'p1' });
    const header = getHeaderRow(tree);
    expect(header.props.draggable).toBe(false);
  });

  it('hides the env count badge while editing', () => {
    const tree = render({ editingId: 'p1', editingName: 'X' });
    const badges = findAll(tree, (el) => classOf(el).includes('tabular-nums'));
    expect(badges).toHaveLength(0);
  });

  it('hides the More button while editing', () => {
    const tree = render({ editingId: 'p1' });
    const moreButtons = findAll(
      tree,
      (el) => el.type === 'button' && classOf(el).includes('opacity-0 group-hover:opacity-100'),
    );
    expect(moreButtons).toHaveLength(0);
  });

  it('input.onChange updates editingName via setEditingName', () => {
    const setEditingName = vi.fn();
    const tree = render({ editingId: 'p1', editingName: 'A', setEditingName });
    const input = findAll(tree, (el) => el.type === 'input')[0];
    (input.props.onChange as (e: React.ChangeEvent<HTMLInputElement>) => void)({
      target: { value: 'AB' },
    } as unknown as React.ChangeEvent<HTMLInputElement>);
    expect(setEditingName).toHaveBeenCalledWith('AB');
  });

  it('input.onBlur calls onFinishRename', () => {
    const onFinishRename = vi.fn();
    const tree = render({ editingId: 'p1', onFinishRename });
    const input = findAll(tree, (el) => el.type === 'input')[0];
    (input.props.onBlur as () => void)();
    expect(onFinishRename).toHaveBeenCalledTimes(1);
  });

  it('input.onKeyDown Enter calls onFinishRename', () => {
    const onFinishRename = vi.fn();
    const tree = render({ editingId: 'p1', onFinishRename });
    const input = findAll(tree, (el) => el.type === 'input')[0];
    (input.props.onKeyDown as (e: React.KeyboardEvent) => void)({ key: 'Enter' } as React.KeyboardEvent);
    expect(onFinishRename).toHaveBeenCalledTimes(1);
  });

  it('input.onKeyDown Escape calls setEditingId(null) + setEditingName("")', () => {
    const setEditingId = vi.fn();
    const setEditingName = vi.fn();
    const onFinishRename = vi.fn();
    const tree = render({ editingId: 'p1', setEditingId, setEditingName, onFinishRename });
    const input = findAll(tree, (el) => el.type === 'input')[0];
    (input.props.onKeyDown as (e: React.KeyboardEvent) => void)({ key: 'Escape' } as React.KeyboardEvent);
    expect(setEditingId).toHaveBeenCalledWith(null);
    expect(setEditingName).toHaveBeenCalledWith('');
    expect(onFinishRename).not.toHaveBeenCalled();
  });

  it('input.onKeyDown other keys do nothing', () => {
    const setEditingId = vi.fn();
    const setEditingName = vi.fn();
    const onFinishRename = vi.fn();
    const tree = render({ editingId: 'p1', setEditingId, setEditingName, onFinishRename });
    const input = findAll(tree, (el) => el.type === 'input')[0];
    (input.props.onKeyDown as (e: React.KeyboardEvent) => void)({ key: 'a' } as React.KeyboardEvent);
    expect(setEditingId).not.toHaveBeenCalled();
    expect(onFinishRename).not.toHaveBeenCalled();
  });

  it('input.onClick stops propagation (prevents header click)', () => {
    const tree = render({ editingId: 'p1' });
    const input = findAll(tree, (el) => el.type === 'input')[0];
    const stopPropagation = vi.fn();
    (input.props.onClick as (e: React.MouseEvent) => void)({
      stopPropagation,
    } as unknown as React.MouseEvent);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
  });
});

describe('ProjectRow — header event wiring', () => {
  it('header.onClick calls onProjectClick(project) when not editing', () => {
    const onProjectClick = vi.fn();
    const tree = render({ onProjectClick });
    const header = getHeaderRow(tree);
    (header.props.onClick as () => void)();
    expect(onProjectClick).toHaveBeenCalledWith(PROJECT_WITH_ENVS);
  });

  it('header.onClick is a no-op when editing', () => {
    const onProjectClick = vi.fn();
    const tree = render({ editingId: 'p1', onProjectClick });
    const header = getHeaderRow(tree);
    (header.props.onClick as () => void)();
    expect(onProjectClick).not.toHaveBeenCalled();
  });

  it('header.onContextMenu calls onContextMenu(e, "project", id)', () => {
    const onContextMenu = vi.fn();
    const tree = render({ onContextMenu });
    const header = getHeaderRow(tree);
    const ev = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as React.MouseEvent;
    (header.props.onContextMenu as (e: React.MouseEvent) => void)(ev);
    expect(onContextMenu).toHaveBeenCalledWith(ev, 'project', 'p1');
  });

  it('header.onDragStart calls onDragStart(e, "project", id)', () => {
    const onDragStart = vi.fn();
    const tree = render({ onDragStart });
    const header = getHeaderRow(tree);
    const ev = {} as React.DragEvent;
    (header.props.onDragStart as (e: React.DragEvent) => void)(ev);
    expect(onDragStart).toHaveBeenCalledWith(ev, 'project', 'p1');
  });

  it('More button click calls onContextMenu and stopPropagation', () => {
    const onContextMenu = vi.fn();
    const tree = render({ onContextMenu });
    const moreButton = findAll(
      tree,
      (el) => el.type === 'button' && classOf(el).includes('opacity-0 group-hover:opacity-100'),
    )[0];
    expect(moreButton).toBeDefined();
    const stopPropagation = vi.fn();
    (moreButton.props.onClick as (e: React.MouseEvent) => void)({
      stopPropagation,
    } as unknown as React.MouseEvent);
    expect(stopPropagation).toHaveBeenCalled();
    expect(onContextMenu).toHaveBeenCalled();
  });
});

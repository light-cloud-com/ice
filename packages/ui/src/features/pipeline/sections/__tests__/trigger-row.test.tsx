/**
 * rf-ppanel-6 — TriggerRow.
 *
 * Direct-FC tree-walker tests. Stateless — every input change fires a
 * callback prop, so we can test handler dispatch by invoking onClick /
 * onChange directly on the rendered elements.
 *
 * Cite:
 *   - `lucide-react-icons-are-forwardref-objects-not-fcs-for-tree-walker-predicates`
 *     — Trash2 + ArrowRight icons are forwardRef.
 *
 * The branch select has TWO render paths:
 *   - branches.length > 0 → loaded list + '*' wildcard
 *   - branches.length === 0 → fallback list ('main', 'master', '*') with
 *     a conditionally-injected current branch_pattern option if the rule's
 *     pattern isn't already 'main', 'master', or '*'.
 *
 * Both paths and the unknown-branch injection are pinned.
 */

import { Trash2, ArrowRight } from 'lucide-react';
import React from 'react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

import { TriggerRow } from '../trigger-row';
import type { DeploymentRule } from '../../../../store/slices/pipeline-slice';
import type { TriggerRowProps, BranchInfo } from '../trigger-row';

function render(props: TriggerRowProps): React.ReactElement {
  return (TriggerRow as unknown as (p: TriggerRowProps) => React.ReactElement)(props);
}

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

function findByRef(tree: React.ReactNode, ref: unknown): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) {
    if (el && el.type === ref) out.push(el);
  }
  return out;
}

function findByType(tree: React.ReactNode, type: string): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) {
    if (el && el.type === type) out.push(el);
  }
  return out;
}

const baseRule: DeploymentRule = {
  id: 'rule-1',
  card_id: 'card-1',
  node_id: 'node-1',
  repository: 'foo/bar',
  trigger_type: 'push',
  branch_pattern: 'main',
  environment: 'production',
  build_command: null,
  install_command: null,
  output_dir: null,
  framework: null,
  enabled: true,
  webhook_id: null,
  created_at: '2026-01-01',
};

const baseBranches: BranchInfo[] = [
  { name: 'main', commit: { sha: 'a' }, protected: true },
  { name: 'develop', commit: { sha: 'b' }, protected: false },
];

describe('TriggerRow — outer container', () => {
  it('renders an enabled (raised bg) container when rule.enabled=true', () => {
    const tree = render({
      rule: { ...baseRule, enabled: true },
      branches: baseBranches,
      onToggle: vi.fn(),
      onDelete: vi.fn(),
      onChangeBranch: vi.fn(),
      onChangeEnvironment: vi.fn(),
    });
    expect(tree.type).toBe('div');
    const cls = (tree.props as { className: string }).className;
    expect(cls).toContain('bg-ice-raised');
    expect(cls).not.toContain('opacity-60');
  });

  it('renders a disabled (faded) container when rule.enabled=false', () => {
    const tree = render({
      rule: { ...baseRule, enabled: false },
      branches: baseBranches,
      onToggle: vi.fn(),
      onDelete: vi.fn(),
      onChangeBranch: vi.fn(),
      onChangeEnvironment: vi.fn(),
    });
    const cls = (tree.props as { className: string }).className;
    expect(cls).toContain('opacity-60');
  });
});

describe('TriggerRow — toggle button', () => {
  it('renders an emerald toggle when enabled and the knob slid right', () => {
    const tree = render({
      rule: { ...baseRule, enabled: true },
      branches: baseBranches,
      onToggle: vi.fn(),
      onDelete: vi.fn(),
      onChangeBranch: vi.fn(),
      onChangeEnvironment: vi.fn(),
    });
    const buttons = findByType(tree, 'button');
    expect(buttons.length).toBeGreaterThanOrEqual(2); // toggle + delete
    const toggle = buttons[0];
    const cls = (toggle.props as { className: string }).className;
    expect(cls).toContain('bg-emerald-500');
    // knob is the inner div
    const knob = (toggle.props as { children: React.ReactElement }).children;
    const knobCls = (knob.props as { className: string }).className;
    expect(knobCls).toContain('left-3.5');
  });

  it('renders a muted toggle when disabled and knob slid left', () => {
    const tree = render({
      rule: { ...baseRule, enabled: false },
      branches: baseBranches,
      onToggle: vi.fn(),
      onDelete: vi.fn(),
      onChangeBranch: vi.fn(),
      onChangeEnvironment: vi.fn(),
    });
    const toggle = findByType(tree, 'button')[0];
    const cls = (toggle.props as { className: string }).className;
    expect(cls).toContain('bg-ice-border');
    const knob = (toggle.props as { children: React.ReactElement }).children;
    const knobCls = (knob.props as { className: string }).className;
    expect(knobCls).toContain('left-0.5');
  });

  it('fires onToggle with the inverted value when clicked', () => {
    const onToggle = vi.fn();
    const tree = render({
      rule: { ...baseRule, enabled: true },
      branches: baseBranches,
      onToggle,
      onDelete: vi.fn(),
      onChangeBranch: vi.fn(),
      onChangeEnvironment: vi.fn(),
    });
    const toggle = findByType(tree, 'button')[0];
    (toggle.props as { onClick: () => void }).onClick();
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it('fires onToggle(true) when clicked from the disabled state', () => {
    const onToggle = vi.fn();
    const tree = render({
      rule: { ...baseRule, enabled: false },
      branches: baseBranches,
      onToggle,
      onDelete: vi.fn(),
      onChangeBranch: vi.fn(),
      onChangeEnvironment: vi.fn(),
    });
    const toggle = findByType(tree, 'button')[0];
    (toggle.props as { onClick: () => void }).onClick();
    expect(onToggle).toHaveBeenCalledWith(true);
  });
});

describe('TriggerRow — trigger-type label', () => {
  it("renders 'pipeline.pushTo' for trigger_type='push'", () => {
    const tree = render({
      rule: { ...baseRule, trigger_type: 'push' },
      branches: baseBranches,
      onToggle: vi.fn(),
      onDelete: vi.fn(),
      onChangeBranch: vi.fn(),
      onChangeEnvironment: vi.fn(),
    });
    let found = false;
    for (const el of walk(tree)) {
      if (el.type === 'span' && (el.props as { children?: unknown }).children === 'pipeline.pushTo') {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("renders 'pipeline.mergeTo' for trigger_type='merge'", () => {
    const tree = render({
      rule: { ...baseRule, trigger_type: 'merge' },
      branches: baseBranches,
      onToggle: vi.fn(),
      onDelete: vi.fn(),
      onChangeBranch: vi.fn(),
      onChangeEnvironment: vi.fn(),
    });
    let found = false;
    for (const el of walk(tree)) {
      if (el.type === 'span' && (el.props as { children?: unknown }).children === 'pipeline.mergeTo') {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });
});

describe('TriggerRow — branch select (loaded path)', () => {
  it('renders an option for every loaded branch + the wildcard', () => {
    const tree = render({
      rule: baseRule,
      branches: baseBranches,
      onToggle: vi.fn(),
      onDelete: vi.fn(),
      onChangeBranch: vi.fn(),
      onChangeEnvironment: vi.fn(),
    });
    const options = findByType(tree, 'option');
    // 2 branches + wildcard + envProduction/Staging/Development = 6 options
    expect(options.length).toBe(6);
  });

  it("appends ' pipeline.branchProtected' to the option label for protected branches", () => {
    const tree = render({
      rule: baseRule,
      branches: baseBranches,
      onToggle: vi.fn(),
      onDelete: vi.fn(),
      onChangeBranch: vi.fn(),
      onChangeEnvironment: vi.fn(),
    });
    const options = findByType(tree, 'option');
    const mainOption = options.find((o) => (o.props as { value: string }).value === 'main');
    expect(mainOption).toBeDefined();
    const children = (mainOption!.props as { children: unknown[] }).children as Array<string>;
    // children = ['main', ' pipeline.branchProtected']
    expect(children).toContain('main');
    expect(children).toContain(' pipeline.branchProtected');
  });

  it('does NOT append protected suffix for non-protected branches', () => {
    const tree = render({
      rule: baseRule,
      branches: baseBranches,
      onToggle: vi.fn(),
      onDelete: vi.fn(),
      onChangeBranch: vi.fn(),
      onChangeEnvironment: vi.fn(),
    });
    const options = findByType(tree, 'option');
    const developOption = options.find((o) => (o.props as { value: string }).value === 'develop');
    const children = (developOption!.props as { children: unknown[] }).children as Array<string>;
    expect(children).toContain('develop');
    expect(children).toContain(''); // empty suffix
  });

  it('fires onChangeBranch with the selected value when the select changes', () => {
    const onChangeBranch = vi.fn();
    const tree = render({
      rule: baseRule,
      branches: baseBranches,
      onToggle: vi.fn(),
      onDelete: vi.fn(),
      onChangeBranch,
      onChangeEnvironment: vi.fn(),
    });
    const selects = findByType(tree, 'select');
    const branchSelect = selects[0];
    (branchSelect.props as { onChange: (e: unknown) => void }).onChange({
      target: { value: 'develop' },
    });
    expect(onChangeBranch).toHaveBeenCalledWith('develop');
  });
});

describe('TriggerRow — branch select (fallback path with no branches loaded)', () => {
  it("renders the fixed main/master/* fallback options when branches=[] and branch_pattern='*'", () => {
    // Use '*' for branch_pattern so the inject branch is short-circuited
    // (currentInList=true) and we get exactly the 3 fallback options.
    const tree = render({
      rule: { ...baseRule, branch_pattern: '*' },
      branches: [],
      onToggle: vi.fn(),
      onDelete: vi.fn(),
      onChangeBranch: vi.fn(),
      onChangeEnvironment: vi.fn(),
    });
    const options = findByType(tree, 'option');
    const branchOptions = options.filter((o) => {
      const v = (o.props as { value: string }).value;
      return ['main', 'master', '*'].includes(v);
    });
    expect(branchOptions.length).toBe(3);
  });

  it("injects the current branch_pattern as a leading option when it's NOT in the fallback set", () => {
    const tree = render({
      rule: { ...baseRule, branch_pattern: 'feature/foo' },
      branches: [],
      onToggle: vi.fn(),
      onDelete: vi.fn(),
      onChangeBranch: vi.fn(),
      onChangeEnvironment: vi.fn(),
    });
    const options = findByType(tree, 'option');
    const featureOption = options.find((o) => (o.props as { value: string }).value === 'feature/foo');
    expect(featureOption).toBeDefined();
    expect((featureOption!.props as { children: unknown }).children).toBe('feature/foo');
  });

  it("does NOT inject the current branch_pattern when it equals '*' (wildcard branch_pattern)", () => {
    const tree = render({
      rule: { ...baseRule, branch_pattern: '*' },
      branches: [],
      onToggle: vi.fn(),
      onDelete: vi.fn(),
      onChangeBranch: vi.fn(),
      onChangeEnvironment: vi.fn(),
    });
    const options = findByType(tree, 'option');
    // Should be 3 (main, master, *) plus env options. Branch options are
    // main/master/*. Filter to confirm.
    const branchOptions = options.filter((o) => {
      const v = (o.props as { value: string }).value;
      return ['main', 'master', '*'].includes(v);
    });
    expect(branchOptions.length).toBe(3);
  });

  it("DOES inject a duplicate 'main' when branches=[] and branch_pattern='main' — verbatim", () => {
    // The currentInList check uses `branchNames.includes(...)` against the
    // LOADED branches list, not the static fallback. So when branches=[],
    // branchNames=[], currentInList becomes false for everything except '*'.
    // This means even branch_pattern='main' gets injected as a leading
    // option, making 'main' appear TWICE in the fallback select. That's a
    // pre-extraction bug-shaped behavior; pin verbatim so a future fix
    // (`!fallbackKnown(rule.branch_pattern)`) has to update this test.
    const tree = render({
      rule: { ...baseRule, branch_pattern: 'main' },
      branches: [],
      onToggle: vi.fn(),
      onDelete: vi.fn(),
      onChangeBranch: vi.fn(),
      onChangeEnvironment: vi.fn(),
    });
    const options = findByType(tree, 'option');
    const mainOptions = options.filter((o) => (o.props as { value: string }).value === 'main');
    expect(mainOptions.length).toBe(2);
  });
});

describe('TriggerRow — environment select', () => {
  it('renders three env options (production, staging, development)', () => {
    const tree = render({
      rule: baseRule,
      branches: baseBranches,
      onToggle: vi.fn(),
      onDelete: vi.fn(),
      onChangeBranch: vi.fn(),
      onChangeEnvironment: vi.fn(),
    });
    const options = findByType(tree, 'option');
    const envOptions = options.filter((o) => {
      const v = (o.props as { value: string }).value;
      return ['production', 'staging', 'development'].includes(v);
    });
    expect(envOptions.length).toBe(3);
  });

  it('fires onChangeEnvironment when the env select changes', () => {
    const onChangeEnvironment = vi.fn();
    const tree = render({
      rule: baseRule,
      branches: baseBranches,
      onToggle: vi.fn(),
      onDelete: vi.fn(),
      onChangeBranch: vi.fn(),
      onChangeEnvironment,
    });
    const selects = findByType(tree, 'select');
    expect(selects.length).toBe(2);
    const envSelect = selects[1];
    (envSelect.props as { onChange: (e: unknown) => void }).onChange({
      target: { value: 'staging' },
    });
    expect(onChangeEnvironment).toHaveBeenCalledWith('staging');
  });
});

describe('TriggerRow — delete button + arrow icon', () => {
  it('renders a Trash2 lucide icon inside the delete button', () => {
    const tree = render({
      rule: baseRule,
      branches: baseBranches,
      onToggle: vi.fn(),
      onDelete: vi.fn(),
      onChangeBranch: vi.fn(),
      onChangeEnvironment: vi.fn(),
    });
    const trashes = findByRef(tree, Trash2);
    expect(trashes.length).toBe(1);
  });

  it('renders an ArrowRight separator between the branch and env selects', () => {
    const tree = render({
      rule: baseRule,
      branches: baseBranches,
      onToggle: vi.fn(),
      onDelete: vi.fn(),
      onChangeBranch: vi.fn(),
      onChangeEnvironment: vi.fn(),
    });
    const arrows = findByRef(tree, ArrowRight);
    expect(arrows.length).toBe(1);
  });

  it('fires onDelete when the delete button is clicked', () => {
    const onDelete = vi.fn();
    const tree = render({
      rule: baseRule,
      branches: baseBranches,
      onToggle: vi.fn(),
      onDelete,
      onChangeBranch: vi.fn(),
      onChangeEnvironment: vi.fn(),
    });
    const buttons = findByType(tree, 'button');
    // Last button is the delete button (toggle is first)
    const deleteBtn = buttons[buttons.length - 1];
    (deleteBtn.props as { onClick: () => void }).onClick();
    expect(onDelete).toHaveBeenCalled();
  });
});

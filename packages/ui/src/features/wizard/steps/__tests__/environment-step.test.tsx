/**
 * EnvironmentStep — wizard step 2 environments configuration.
 *
 * Direct-FC tree-walker. Stateless — controlled props.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => `t:${k}` }),
}));

vi.mock('../../../../config/color-palette', () => ({
  SECURITY_LEVEL_COLORS: {
    basic: '#aaa',
    standard: '#bbb',
    strict: '#ccc',
    compliance: '#ddd',
  },
}));

import { EnvironmentStep } from '../environment-step';
import type { WizardEnvironment } from '../../hooks/use-wizard-state';

interface ReactElementLike {
  type: unknown;
  props: { [k: string]: unknown; children?: unknown };
}
function isElement(x: unknown): x is ReactElementLike {
  return !!x && typeof x === 'object' && 'type' in x && 'props' in x;
}
function* walk(node: unknown): Generator<ReactElementLike> {
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c);
    return;
  }
  if (!isElement(node)) return;
  yield node;
  yield* walk(node.props.children);
}
function findAll(tree: unknown, predicate: (el: ReactElementLike) => boolean): ReactElementLike[] {
  const out: ReactElementLike[] = [];
  for (const el of walk(tree)) {
    if (predicate(el)) out.push(el);
  }
  return out;
}

const baseEnvs = (): WizardEnvironment[] => [
  { enabled: true, type: 'production', name: 'P', region: 'us-east1', securityLevel: 'standard' },
  { enabled: false, type: 'staging', name: 'S', region: 'us-west1', securityLevel: 'basic' },
];

const callRender = (
  envs: WizardEnvironment[] = baseEnvs(),
  handlers: Partial<{
    onToggle: (i: number) => void;
    onRegionChange: (i: number, r: string) => void;
    onSecurityChange: (i: number, l: 'basic' | 'standard' | 'strict' | 'compliance') => void;
    onAllSecurityChange: (l: 'basic' | 'standard' | 'strict' | 'compliance') => void;
  }> = {},
): unknown =>
  (EnvironmentStep as (p: React.ComponentProps<typeof EnvironmentStep>) => unknown)({
    environments: envs,
    onToggle: handlers.onToggle ?? vi.fn(),
    onRegionChange: handlers.onRegionChange ?? vi.fn(),
    onSecurityChange: handlers.onSecurityChange ?? vi.fn(),
    onAllSecurityChange: handlers.onAllSecurityChange ?? vi.fn(),
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('EnvironmentStep — render', () => {
  it('renders one card per environment', () => {
    const tree = callRender();
    const cards = findAll(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        ((el.props as { className: string }).className.includes('rounded-lg border transition-all') ?? false),
    );
    expect(cards).toHaveLength(2);
  });

  it('renders config row only for enabled environments', () => {
    const tree = callRender();
    const selects = findAll(tree, (el) => el.type === 'select');
    // 2 selects (region + security) per enabled env. Only env 0 is enabled
    expect(selects).toHaveLength(2);
  });

  it('renders the global "set all" buttons (4 security levels)', () => {
    const tree = callRender();
    const buttons = findAll(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { onClick?: unknown }).onClick === 'function' &&
        typeof (el.props as { style?: { color?: string } }).style?.color === 'string',
    );
    // 4 levels × 1 button each
    expect(buttons.length).toBeGreaterThanOrEqual(4);
  });
});

describe('EnvironmentStep — handlers', () => {
  it('clicking the env toggle button fires onToggle with index', () => {
    const onToggle = vi.fn();
    const tree = callRender(baseEnvs(), { onToggle });
    const toggleButtons = findAll(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        ((el.props as { className: string }).className.includes('flex items-center gap-3 w-full px-3') ?? false),
    );
    (toggleButtons[1].props.onClick as () => void)?.();
    expect(onToggle).toHaveBeenCalledWith(1);
  });

  it('changing the region select fires onRegionChange', () => {
    const onRegionChange = vi.fn();
    const tree = callRender(baseEnvs(), { onRegionChange });
    const selects = findAll(tree, (el) => el.type === 'select');
    // Region select for the enabled env (index 0)
    (selects[0].props.onChange as (e: { target: { value: string } }) => void)?.({
      target: { value: 'asia-east1' },
    });
    expect(onRegionChange).toHaveBeenCalledWith(0, 'asia-east1');
  });

  it('changing the security select fires onSecurityChange', () => {
    const onSecurityChange = vi.fn();
    const tree = callRender(baseEnvs(), { onSecurityChange });
    const selects = findAll(tree, (el) => el.type === 'select');
    (selects[1].props.onChange as (e: { target: { value: string } }) => void)?.({
      target: { value: 'strict' },
    });
    expect(onSecurityChange).toHaveBeenCalledWith(0, 'strict');
  });

  it('clicking a global security button fires onAllSecurityChange with that level', () => {
    const onAllSecurityChange = vi.fn();
    const tree = callRender(baseEnvs(), { onAllSecurityChange });
    const buttons = findAll(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { onClick?: unknown }).onClick === 'function' &&
        typeof (el.props as { style?: { color?: string } }).style?.color === 'string',
    );
    // First color-styled button = 'basic'
    (buttons[0].props.onClick as () => void)?.();
    expect(onAllSecurityChange).toHaveBeenCalledWith('basic');
  });
});

describe('EnvironmentStep — selected styling', () => {
  it('disabled env gets the muted class', () => {
    const tree = callRender();
    const cards = findAll(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        ((el.props as { className: string }).className.includes('rounded-lg border transition-all') ?? false),
    );
    expect((cards[0].props.className as string)).toContain('bg-ice-surface');
    expect((cards[1].props.className as string)).toContain('opacity-60');
  });
});

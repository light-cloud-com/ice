/**
 * ProjectInfoStep — wizard step 1.
 *
 * Direct-FC tree-walker. Step is stateless (controlled props) — test
 * renders with fixture props and exercises the change handlers + the
 * provider-button selection styling.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface FixtureProvider {
  id: string;
  name: string;
  shortName: string;
  color: string;
}

const mocks = vi.hoisted(() => ({
  fixtureProviders: [
    { id: 'aws', name: 'Amazon Web Services', shortName: 'AWS', color: '#ff9900' },
    { id: 'gcp', name: 'Google Cloud', shortName: 'GCP', color: '#4285f4' },
  ] as FixtureProvider[],
}));

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => `t:${k}` }),
}));

vi.mock('../../../../config/providers', () => ({
  ENABLED_PROVIDERS: mocks.fixtureProviders,
}));

import { ProjectInfoStep } from '../project-info-step';

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
function findByPredicate(
  tree: unknown,
  predicate: (el: ReactElementLike) => boolean,
): ReactElementLike | undefined {
  for (const el of walk(tree)) {
    if (predicate(el)) return el;
  }
  return undefined;
}
function findAll(tree: unknown, predicate: (el: ReactElementLike) => boolean): ReactElementLike[] {
  const out: ReactElementLike[] = [];
  for (const el of walk(tree)) {
    if (predicate(el)) out.push(el);
  }
  return out;
}

const callRender = (
  props: React.ComponentProps<typeof ProjectInfoStep>,
): unknown =>
  (ProjectInfoStep as (p: React.ComponentProps<typeof ProjectInfoStep>) => unknown)(props);

const baseProps = (): React.ComponentProps<typeof ProjectInfoStep> => ({
  projectName: 'Init',
  projectDescription: 'desc',
  provider: 'aws' as const,
  onNameChange: vi.fn(),
  onDescriptionChange: vi.fn(),
  onProviderChange: vi.fn(),
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ProjectInfoStep — render', () => {
  it('renders an input pre-populated with projectName', () => {
    const tree = callRender({ ...baseProps(), projectName: 'My Cool App' });
    const input = findByPredicate(tree, (el) => el.type === 'input');
    expect(input).toBeDefined();
    expect(input?.props.value).toBe('My Cool App');
  });

  it('renders a textarea pre-populated with projectDescription', () => {
    const tree = callRender({ ...baseProps(), projectDescription: 'has details' });
    const ta = findByPredicate(tree, (el) => el.type === 'textarea');
    expect(ta).toBeDefined();
    expect(ta?.props.value).toBe('has details');
  });

  it('renders a button per ENABLED_PROVIDER', () => {
    const tree = callRender(baseProps());
    const buttons = findAll(tree, (el) => el.type === 'button');
    expect(buttons.length).toBe(mocks.fixtureProviders.length);
  });

  it('renders the provider shortName + name as button text', () => {
    const tree = callRender(baseProps());
    const buttons = findAll(tree, (el) => el.type === 'button');
    const shortNames = buttons.flatMap((b) => {
      const out: string[] = [];
      for (const el of walk(b)) {
        const c = (el.props as { children?: unknown }).children;
        if (typeof c === 'string') out.push(c);
      }
      return out;
    });
    expect(shortNames).toContain('AWS');
    expect(shortNames).toContain('Amazon Web Services');
    expect(shortNames).toContain('GCP');
    expect(shortNames).toContain('Google Cloud');
  });
});

describe('ProjectInfoStep — handlers', () => {
  it('typing in the input fires onNameChange with the input value', () => {
    const onNameChange = vi.fn();
    const tree = callRender({ ...baseProps(), onNameChange });
    const input = findByPredicate(tree, (el) => el.type === 'input');
    (input?.props.onChange as (e: { target: { value: string } }) => void)?.({
      target: { value: 'New Name' },
    });
    expect(onNameChange).toHaveBeenCalledWith('New Name');
  });

  it('typing in the textarea fires onDescriptionChange', () => {
    const onDescriptionChange = vi.fn();
    const tree = callRender({ ...baseProps(), onDescriptionChange });
    const ta = findByPredicate(tree, (el) => el.type === 'textarea');
    (ta?.props.onChange as (e: { target: { value: string } }) => void)?.({
      target: { value: 'New Desc' },
    });
    expect(onDescriptionChange).toHaveBeenCalledWith('New Desc');
  });

  it('clicking a provider button fires onProviderChange with that id', () => {
    const onProviderChange = vi.fn();
    const tree = callRender({ ...baseProps(), onProviderChange });
    const buttons = findAll(tree, (el) => el.type === 'button');
    (buttons[1].props.onClick as () => void)?.();
    expect(onProviderChange).toHaveBeenCalledWith('gcp');
  });
});

describe('ProjectInfoStep — selected provider styling', () => {
  it('uses the provider color for the selected provider shortName text', () => {
    const tree = callRender({ ...baseProps(), provider: 'gcp' as const });
    const buttons = findAll(tree, (el) => el.type === 'button');
    // gcp is index 1
    const shortNameSpan = findByPredicate(buttons[1], (el) =>
      el.type === 'span' &&
      typeof (el.props as { className?: string }).className === 'string' &&
      ((el.props as { className: string }).className.includes('font-bold') ?? false),
    );
    expect((shortNameSpan?.props.style as { color: string }).color).toBe('#4285f4');
  });

  it('falls back to the muted color for non-selected providers', () => {
    const tree = callRender({ ...baseProps(), provider: 'aws' as const });
    const buttons = findAll(tree, (el) => el.type === 'button');
    // gcp is NOT selected
    const shortNameSpan = findByPredicate(buttons[1], (el) =>
      el.type === 'span' &&
      typeof (el.props as { className?: string }).className === 'string' &&
      ((el.props as { className: string }).className.includes('font-bold') ?? false),
    );
    expect((shortNameSpan?.props.style as { color: string }).color).toBe('#8b949e');
  });

  it('selected provider button has the ring class', () => {
    const tree = callRender({ ...baseProps(), provider: 'aws' as const });
    const buttons = findAll(tree, (el) => el.type === 'button');
    // aws is index 0
    expect((buttons[0].props.className as string)).toContain('ring-ice-accent');
    expect((buttons[1].props.className as string)).not.toContain('ring-ice-accent');
  });
});

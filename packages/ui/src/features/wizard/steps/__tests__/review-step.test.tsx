/**
 * ReviewStep — wizard step 4 review.
 *
 * Direct-FC tree-walker with hoisted mocks for COMPOSED_TEMPLATES,
 * SECURITY_LEVEL_COLORS, and getCloudProvider.
 */

import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  templates: [
    {
      id: 'tmpl-1',
      name: 'Tmpl One',
      description: 'd1',
      blocks: [{ a: 1 }, { a: 2 }, { a: 3 }],
      estimatedCost: '$11/mo',
    },
  ],
  providerLookup: vi.fn((id: string) => {
    if (id === 'gcp') return { color: '#4285f4', shortName: 'GCP' };
    if (id === 'aws') return { color: '#ff9900', shortName: 'AWS' };
    return null;
  }),
}));

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) => `t:${k}${opts ? `:${JSON.stringify(opts)}` : ''}`,
  }),
}));

vi.mock('../../../../config/templates', () => ({
  COMPOSED_TEMPLATES: mocks.templates,
}));

vi.mock('../../../../config/color-palette', () => ({
  SECURITY_LEVEL_COLORS: {
    basic: '#aaa',
    standard: '#bbb',
    strict: '#ccc',
    compliance: '#ddd',
  },
}));

vi.mock('@ice/core/resources', () => ({
  getCloudProvider: (id: string) => mocks.providerLookup(id),
}));

import { ReviewStep } from '../review-step';
import type { WizardState } from '../../hooks/use-wizard-state';

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
function collectText(node: unknown): string {
  let s = '';
  for (const el of walk(node)) {
    const c = (el.props as { children?: unknown }).children;
    if (typeof c === 'string') s += c + ' ';
    else if (Array.isArray(c)) {
      for (const item of c) {
        if (typeof item === 'string') s += item + ' ';
        else if (typeof item === 'number') s += String(item) + ' ';
      }
    } else if (typeof c === 'number') s += String(c) + ' ';
  }
  return s;
}
function findByPredicate(tree: unknown, predicate: (el: ReactElementLike) => boolean): ReactElementLike | undefined {
  for (const el of walk(tree)) {
    if (predicate(el)) return el;
  }
  return undefined;
}

const baseState = (overrides: Partial<WizardState> = {}): WizardState => ({
  step: 4,
  projectName: 'My App',
  projectDescription: '',
  provider: 'aws',
  environments: [
    { enabled: true, type: 'production', name: 'Prod', region: 'us-east1', securityLevel: 'standard' },
    { enabled: true, type: 'staging', name: 'Stg', region: 'eu-west1', securityLevel: 'basic' },
    { enabled: false, type: 'development', name: 'Dev', region: 'us-east1', securityLevel: 'basic' },
  ],
  selectedTemplateId: null,
  searchQuery: '',
  ...overrides,
});

const callRender = (state: WizardState): unknown => (ReviewStep as (p: { state: WizardState }) => unknown)({ state });

describe('ReviewStep — project summary', () => {
  it('renders the project name', () => {
    const tree = callRender(baseState({ projectName: 'My Cool App' }));
    expect(collectText(tree)).toContain('My Cool App');
  });

  it('renders the project description when set', () => {
    const tree = callRender(baseState({ projectDescription: 'a special project' }));
    expect(collectText(tree)).toContain('a special project');
  });

  it('does not render a description block when description is empty', () => {
    const tree = callRender(baseState({ projectDescription: '' }));
    // The description <p> has class text-ice-text-2 mt-0.5 and only renders when set
    const text = collectText(tree);
    expect(text).not.toContain('a special project');
  });

  it('renders the provider shortName from getCloudProvider when known', () => {
    const tree = callRender(baseState({ provider: 'gcp' as const }));
    expect(collectText(tree)).toContain('GCP');
  });

  it('falls back to provider.toUpperCase() when getCloudProvider returns null', () => {
    const tree = callRender(baseState({ provider: 'unknown' as never }));
    expect(collectText(tree)).toContain('UNKNOWN');
  });
});

describe('ReviewStep — environments summary', () => {
  it('renders only enabled envs', () => {
    const tree = callRender(baseState());
    const text = collectText(tree);
    expect(text).toContain('Prod');
    expect(text).toContain('Stg');
    expect(text).not.toContain('Dev');
  });

  it('renders the env region as text', () => {
    const tree = callRender(baseState());
    const text = collectText(tree);
    expect(text).toContain('us-east1');
    expect(text).toContain('eu-west1');
  });

  it('renders the security level on each enabled env', () => {
    const tree = callRender(baseState());
    const text = collectText(tree);
    expect(text).toContain('standard');
    expect(text).toContain('basic');
  });

  it('shows "environment" (singular) for exactly 1 enabled env', () => {
    const tree = callRender(
      baseState({
        environments: [{ enabled: true, type: 'production', name: 'Only', region: 'us', securityLevel: 'basic' }],
      }),
    );
    const text = collectText(tree);
    expect(text).toContain('t:wizard.review.environment');
  });

  it('shows "environments" (plural) for >=2 enabled envs', () => {
    const tree = callRender(baseState());
    const text = collectText(tree);
    expect(text).toContain('t:wizard.review.environments');
  });
});

describe('ReviewStep — template summary', () => {
  it('renders the selected template details when matched', () => {
    const tree = callRender(baseState({ selectedTemplateId: 'tmpl-1' }));
    const text = collectText(tree);
    expect(text).toContain('Tmpl One');
    expect(text).toContain('$11/mo');
  });

  it('renders the blank canvas label when no template selected', () => {
    const tree = callRender(baseState({ selectedTemplateId: null }));
    const text = collectText(tree);
    expect(text).toContain('t:wizard.review.blankCanvas');
  });

  it('renders blank canvas when selectedTemplateId does not match', () => {
    const tree = callRender(baseState({ selectedTemplateId: 'unknown-tmpl' }));
    const text = collectText(tree);
    expect(text).toContain('t:wizard.review.blankCanvas');
  });
});

describe('ReviewStep — summary line', () => {
  it('emits summaryWithTemplate when a template is selected', () => {
    const tree = callRender(baseState({ selectedTemplateId: 'tmpl-1' }));
    const text = collectText(tree);
    expect(text).toContain('t:wizard.review.summaryWithTemplate');
  });

  it('emits summaryBlank when no template is selected', () => {
    const tree = callRender(baseState({ selectedTemplateId: null }));
    const text = collectText(tree);
    expect(text).toContain('t:wizard.review.summaryBlank');
  });
});

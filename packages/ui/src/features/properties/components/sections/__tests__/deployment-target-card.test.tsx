/**
 * Tests for `DeploymentTargetCard` — region picker shown at the top of
 * the right-side properties panel.
 *
 * Behavior pinned by these tests:
 *   - Provider is implicit (set at drop time, visible on the canvas via
 *     the brand stamp). No chips here.
 *   - Region select renders when provider is set and uses
 *     PROVIDER_REGIONS[provider].
 *   - Region select shows a plain "auto" italic span when provider is empty.
 *   - Changing region fires onUpdate('region', v).
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const Inert: React.FC<{
    value: string;
    onChange: (v: string) => void;
    options: unknown[];
    placeholder?: string;
  }> = () => null;
  Inert.displayName = 'MockIceSelect';
  return { IceSelect: Inert };
});

vi.mock('../../../../../shared/components/ui/ice-select', () => ({
  IceSelect: mocks.IceSelect,
}));

import { PROVIDER_REGIONS } from '../../../../deploy/utils/provider-regions';
import { DeploymentTargetCard } from '../deployment-target-card';

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
const findByType = (tree: React.ReactNode, type: unknown) => [...walk(tree)].filter((el) => el.type === type);

const renderInner = (props: Partial<React.ComponentProps<typeof DeploymentTargetCard>> = {}): React.ReactElement => {
  const onUpdate = vi.fn();
  return DeploymentTargetCard({ provider: '', region: '', onUpdate, ...props }) as React.ReactElement;
};

describe('DeploymentTargetCard — no provider switcher', () => {
  it('renders no buttons (provider is implicit, set at drop time)', () => {
    const tree = renderInner({ provider: 'aws' });
    const buttons = findByType(tree, 'button');
    expect(buttons).toHaveLength(0);
  });
});

describe('DeploymentTargetCard — region select', () => {
  it('renders an "auto" italic span when provider is empty', () => {
    const tree = renderInner({ provider: '' });
    const selects = findByType(tree, mocks.IceSelect);
    expect(selects).toHaveLength(0);
    const autoSpans = [...walk(tree)].filter(
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('italic'),
    );
    expect(autoSpans).toHaveLength(1);
    expect((autoSpans[0].props as { children: string }).children).toBe('auto');
  });

  it('renders IceSelect when provider is set', () => {
    const tree = renderInner({ provider: 'aws' });
    const selects = findByType(tree, mocks.IceSelect);
    expect(selects).toHaveLength(1);
  });

  it('passes PROVIDER_REGIONS[provider] into the select', () => {
    const tree = renderInner({ provider: 'gcp' });
    const select = findByType(tree, mocks.IceSelect)[0];
    const opts = (select.props as { options: unknown[] }).options;
    expect(opts).toEqual(PROVIDER_REGIONS.gcp);
  });

  it('changing the select fires onUpdate(region, v)', () => {
    const onUpdate = vi.fn();
    const tree = renderInner({ provider: 'aws', region: '', onUpdate });
    const select = findByType(tree, mocks.IceSelect)[0];
    const handler = (select.props as { onChange: (v: string) => void }).onChange;
    handler('us-west-2');
    expect(onUpdate).toHaveBeenCalledWith('region', 'us-west-2');
  });

  it('reflects the current region value in the select', () => {
    const tree = renderInner({ provider: 'azure', region: 'westeurope' });
    const select = findByType(tree, mocks.IceSelect)[0];
    expect((select.props as { value: string }).value).toBe('westeurope');
  });
});

describe('DeploymentTargetCard — surface', () => {
  it('exposes a stable displayName', () => {
    expect(DeploymentTargetCard.displayName).toBe('DeploymentTargetCard');
  });

  it('renders a "Deployment" section heading', () => {
    const tree = renderInner({ provider: 'aws' });
    const headings = [...walk(tree)].filter(
      (el) => el.type === 'div' && (el.props as { children?: unknown }).children === 'Deployment',
    );
    expect(headings).toHaveLength(1);
  });
});

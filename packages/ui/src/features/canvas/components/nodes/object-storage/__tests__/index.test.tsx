/**
 * Tests for `SvgObjectStorageNode` — bespoke bucket renderer with the
 * stacked drawer body + globe/padlock status glyph.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const passthrough: React.FC<Record<string, unknown>> = (props) =>
    React.createElement('div', null, (props as { children?: React.ReactNode }).children);
  passthrough.displayName = 'MockCardShell';
  return { CardShell: passthrough };
});

vi.mock('../../_shared', () => ({
  CardShell: mocks.CardShell,
}));

vi.mock('lucide-react', () => ({
  Folder: ((_p: Record<string, unknown>) => null) as React.FC,
  Globe: ((_p: Record<string, unknown>) => null) as React.FC,
  Lock: ((_p: Record<string, unknown>) => null) as React.FC,
}));

import {
  SvgObjectStorageNode,
  computeObjectStorageHeight,
  BUCKET_HEADER_HEIGHT,
  BUCKET_BODY_HEIGHT,
  BUCKET_PADDING,
} from '..';
import { CARD_FOOTER_HEIGHT } from '@ice/constants';
import type { CanvasNode } from '../../../svg-canvas';

const makeNode = (overrides: Partial<CanvasNode> = {}): CanvasNode => ({
  id: 'b-1',
  type: 'block',
  x: 0,
  y: 0,
  width: 240,
  height: 160,
  label: 'media-bucket',
  data: { iceType: 'Storage.Bucket' },
  ...overrides,
});

const renderInner = (props: Partial<React.ComponentProps<typeof SvgObjectStorageNode>> = {}): React.ReactElement => {
  const defaults: React.ComponentProps<typeof SvgObjectStorageNode> = {
    node: makeNode(),
    isSelected: false,
  };
  return SvgObjectStorageNode({ ...defaults, ...props }) as React.ReactElement;
};

describe('computeObjectStorageHeight', () => {
  it('sums header + padding*2 + body + footer', () => {
    const expected = BUCKET_HEADER_HEIGHT + BUCKET_PADDING + BUCKET_BODY_HEIGHT + BUCKET_PADDING + CARD_FOOTER_HEIGHT;
    expect(computeObjectStorageHeight()).toBe(expected);
  });
});

describe('SvgObjectStorageNode', () => {
  it('exposes the displayName', () => {
    expect(SvgObjectStorageNode.displayName).toBe('SvgObjectStorageNode');
  });

  it('renders a CardShell wrapper', () => {
    const tree = renderInner();
    expect(tree.type).toBe(mocks.CardShell);
  });

  // The Lock vs. Globe glyph lives inside the BucketDrawers subcomponent,
  // which our shallow walker can't enter without invoking the function. The
  // public/private state is pinned through `liveConfig` instead — that
  // string drives the same decision tree the glyph does.

  it('builds liveConfig as `private · {class}`', () => {
    const tree = renderInner({ node: makeNode({ data: { storage_class: 'standard' } }) });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('private · Standard');
  });

  it('flips the visibility token to "public" when set', () => {
    const tree = renderInner({
      node: makeNode({ data: { public: true, storage_class: 'nearline' } }),
    });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('public · Nearline');
  });

  it('adds "versioned" when versioning is on', () => {
    const tree = renderInner({
      node: makeNode({ data: { storage_class: 'standard', versioning: true } }),
    });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('private · Standard · versioned');
  });

  it('translates known storage class slugs to display labels', () => {
    const tree = renderInner({ node: makeNode({ data: { storage_class: 'glacier_deep_archive' } }) });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('private · Glacier Deep Archive');
  });

  it('preserves unknown storage class slugs verbatim', () => {
    const tree = renderInner({ node: makeNode({ data: { storage_class: 'custom-class' } }) });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('private · custom-class');
  });
});

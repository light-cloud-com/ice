/**
 * Tests for `SvgEventStreamNode` — bespoke renderer with the fan-out
 * concentric-rings body.
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
  Radio: ((_p: Record<string, unknown>) => null) as React.FC,
}));

import {
  SvgEventStreamNode,
  computeEventStreamHeight,
  COMPUTE_HEADER_HEIGHT,
  COMPUTE_BODY_HEIGHT,
  COMPUTE_PADDING,
} from '..';
import { CARD_FOOTER_HEIGHT } from '@ice/constants';
import type { CanvasNode } from '../../../svg-canvas';

const makeNode = (overrides: Partial<CanvasNode> = {}): CanvasNode => ({
  id: 'es-1',
  type: 'block',
  x: 0,
  y: 0,
  width: 240,
  height: 160,
  label: 'user-events',
  data: { iceType: 'Messaging.EventStream' },
  ...overrides,
});

const renderInner = (
  props: Partial<React.ComponentProps<typeof SvgEventStreamNode>> = {},
): React.ReactElement => {
  const defaults: React.ComponentProps<typeof SvgEventStreamNode> = {
    node: makeNode(),
    isSelected: false,
  };
  return SvgEventStreamNode({ ...defaults, ...props }) as React.ReactElement;
};

describe('computeEventStreamHeight', () => {
  it('sums header + padding*2 + body + footer', () => {
    const expected = COMPUTE_HEADER_HEIGHT + COMPUTE_PADDING + COMPUTE_BODY_HEIGHT + COMPUTE_PADDING + CARD_FOOTER_HEIGHT;
    expect(computeEventStreamHeight()).toBe(expected);
  });
});

describe('SvgEventStreamNode', () => {
  it('exposes the displayName', () => {
    expect(SvgEventStreamNode.displayName).toBe('SvgEventStreamNode');
  });

  it('renders a CardShell wrapper', () => {
    const tree = renderInner();
    expect(tree.type).toBe(mocks.CardShell);
  });

  it('uses node.label as title', () => {
    const tree = renderInner({ node: makeNode({ label: 'click-stream' }) });
    expect((tree.props as { title: string }).title).toBe('click-stream');
  });

  it('falls back to "Event Stream" when label empty', () => {
    const tree = renderInner({ node: makeNode({ label: '' }) });
    expect((tree.props as { title: string }).title).toBe('Event Stream');
  });

  it('builds liveConfig from size + retention + partitionCount', () => {
    const tree = renderInner({
      node: makeNode({ data: { size: 'on-demand', retention: '7d', partitionCount: 12 } }),
    });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('on-demand · 7 days retention · 12 partitions');
  });

  it('translates retention slugs to "N hours / N days" labels', () => {
    const tree = renderInner({ node: makeNode({ data: { retention: '24h' } }) });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('24 hours retention');
  });

  it('falls back to legacy retentionHours when retention is unset', () => {
    const tree = renderInner({ node: makeNode({ data: { retentionHours: 48 } }) });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('48h retention');
  });

  it('falls back to "unconfigured" liveConfig when no data', () => {
    const tree = renderInner({ node: makeNode({ data: {} }) });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('unconfigured');
  });
});

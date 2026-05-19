/**
 * Tests for `SvgRedisCacheNode` — bespoke renderer with the in-memory
 * pulse body.
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
  Zap: ((_p: Record<string, unknown>) => null) as React.FC,
}));

import {
  SvgRedisCacheNode,
  computeRedisCacheHeight,
  DB_HEADER_HEIGHT,
  DB_BODY_HEIGHT,
  DB_PADDING,
} from '..';
import { CARD_FOOTER_HEIGHT } from '@ice/constants';
import type { CanvasNode } from '../../../svg-canvas';

const makeNode = (overrides: Partial<CanvasNode> = {}): CanvasNode => ({
  id: 'r-1',
  type: 'block',
  x: 0,
  y: 0,
  width: 240,
  height: 160,
  label: 'session-cache',
  data: { iceType: 'Database.Redis' },
  ...overrides,
});

const renderInner = (
  props: Partial<React.ComponentProps<typeof SvgRedisCacheNode>> = {},
): React.ReactElement => {
  const defaults: React.ComponentProps<typeof SvgRedisCacheNode> = {
    node: makeNode(),
    isSelected: false,
  };
  return SvgRedisCacheNode({ ...defaults, ...props }) as React.ReactElement;
};

describe('computeRedisCacheHeight', () => {
  it('sums header + padding*2 + body + footer', () => {
    const expected = DB_HEADER_HEIGHT + DB_PADDING + DB_BODY_HEIGHT + DB_PADDING + CARD_FOOTER_HEIGHT;
    expect(computeRedisCacheHeight()).toBe(expected);
  });
});

describe('SvgRedisCacheNode', () => {
  it('exposes the displayName', () => {
    expect(SvgRedisCacheNode.displayName).toBe('SvgRedisCacheNode');
  });

  it('renders a CardShell wrapper', () => {
    const tree = renderInner();
    expect(tree.type).toBe(mocks.CardShell);
  });

  it('builds liveConfig from version + memory + eviction + persistence', () => {
    const tree = renderInner({
      node: makeNode({
        data: { version: '7', memoryMb: 1024, eviction: 'allkeys-lru', persistence: true },
      }),
    });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe(
      'Redis 7 · 1 GB · allkeys-lru · persistent',
    );
  });

  it('formats memory under 1024 as MB', () => {
    const tree = renderInner({ node: makeNode({ data: { memoryMb: 256 } }) });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('Redis · 256 MB');
  });

  it('formats memory at or above 1024 as GB', () => {
    const tree = renderInner({ node: makeNode({ data: { memoryMb: 2048 } }) });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('Redis · 2 GB');
  });

  it('accepts the legacy `memory` field too', () => {
    const tree = renderInner({ node: makeNode({ data: { memory: 512 } }) });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('Redis · 512 MB');
  });

  it('falls back to bare "Redis" when no data', () => {
    const tree = renderInner({ node: makeNode({ data: {} }) });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('Redis');
  });
});

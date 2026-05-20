/**
 * Tests for `SvgLlmGatewayNode` — bespoke renderer showing the
 * primary-and-fallback model stack with rate-limit footer.
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
  Brain: ((_p: Record<string, unknown>) => null) as React.FC,
}));

import {
  SvgLlmGatewayNode,
  computeLlmGatewayHeight,
  COMPUTE_HEADER_HEIGHT,
  COMPUTE_BODY_HEIGHT,
  COMPUTE_PADDING,
} from '..';
import { CARD_FOOTER_HEIGHT } from '@ice/constants';
import type { CanvasNode } from '../../../svg-canvas';

const makeNode = (overrides: Partial<CanvasNode> = {}): CanvasNode => ({
  id: 'l-1',
  type: 'block',
  x: 0,
  y: 0,
  width: 240,
  height: 160,
  label: 'LLM Gateway',
  data: { iceType: 'AI.LLMGateway' },
  ...overrides,
});

const renderInner = (props: Partial<React.ComponentProps<typeof SvgLlmGatewayNode>> = {}): React.ReactElement => {
  const defaults: React.ComponentProps<typeof SvgLlmGatewayNode> = {
    node: makeNode(),
    isSelected: false,
  };
  return SvgLlmGatewayNode({ ...defaults, ...props }) as React.ReactElement;
};

describe('computeLlmGatewayHeight', () => {
  it('sums header + padding*2 + body + footer', () => {
    const expected =
      COMPUTE_HEADER_HEIGHT + COMPUTE_PADDING + COMPUTE_BODY_HEIGHT + COMPUTE_PADDING + CARD_FOOTER_HEIGHT;
    expect(computeLlmGatewayHeight()).toBe(expected);
  });
});

describe('SvgLlmGatewayNode', () => {
  it('exposes the displayName', () => {
    expect(SvgLlmGatewayNode.displayName).toBe('SvgLlmGatewayNode');
  });

  it('renders a CardShell wrapper', () => {
    const tree = renderInner();
    expect(tree.type).toBe(mocks.CardShell);
  });

  it('falls back to "no rate limits" liveConfig when no quotas/rate set', () => {
    const tree = renderInner({ node: makeNode({ data: { model: 'gpt-4o-mini' } }) });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('no rate limits');
  });

  it('builds liveConfig from rateLimitPerMin', () => {
    const tree = renderInner({
      node: makeNode({ data: { model: 'gpt-4o', rateLimitPerMin: 100 } }),
    });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('100 rpm');
  });

  it('signals "fallback on" when fallbackModel is set', () => {
    const tree = renderInner({
      node: makeNode({ data: { model: 'claude-3.5', fallbackModel: 'gpt-4o-mini' } }),
    });
    expect((tree.props as { liveConfig: string }).liveConfig).toContain('fallback on');
  });

  it('signals "fallback on" when fallbackModels array has entries', () => {
    const tree = renderInner({
      node: makeNode({ data: { model: 'claude-3.5', fallbackModels: ['gpt-4o-mini'] } }),
    });
    expect((tree.props as { liveConfig: string }).liveConfig).toContain('fallback on');
  });

  it('does NOT show "fallback on" when no fallback configured', () => {
    const tree = renderInner({ node: makeNode({ data: { model: 'claude-3.5' } }) });
    expect((tree.props as { liveConfig: string }).liveConfig).not.toContain('fallback on');
  });
});

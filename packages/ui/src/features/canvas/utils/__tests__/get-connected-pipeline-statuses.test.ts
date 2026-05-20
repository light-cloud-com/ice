/**
 * rf-canv2-5 — getConnectedPipelineStatuses util tests.
 *
 * Pure-function util — no React, no hooks. Tests assert the behavior
 * preserved verbatim from the inline `getConnectedPipelineStatuses`
 * useCallback that lived in svg-canvas.tsx L448-466 prior to extraction.
 */

import { describe, it, expect } from 'vitest';
import { getConnectedPipelineStatuses } from '../get-connected-pipeline-statuses';
import type { Card, CardEdge } from '../../../../store/slices/cards-slice';
import type { NodePipelineStatus } from '../../../../store/slices/pipeline-slice';
import type { CanvasNode } from '../../components/types';

const makeCanvasNode = (overrides: Partial<CanvasNode> = {}): CanvasNode =>
  ({
    id: 'n1',
    type: 'block',
    x: 0,
    y: 0,
    width: 100,
    height: 80,
    data: { iceType: 'Compute.Service' },
    parentId: null,
    ...overrides,
  }) as CanvasNode;

const makeCard = (overrides: Partial<Card> = {}): Card => ({
  id: 'card-1',
  name: 'Card',
  nodes: [],
  edges: [],
  viewport: { panX: 0, panY: 0, scale: 1 },
  createdAt: Date.now(),
  ...overrides,
});

describe('getConnectedPipelineStatuses', () => {
  it('returns [] for non-source nodes', () => {
    const node = makeCanvasNode({ id: 'svc', data: { iceType: 'Compute.Service' } });
    const card = makeCard();
    expect(getConnectedPipelineStatuses(node, card, {})).toEqual([]);
  });

  it('returns [] when card is undefined', () => {
    const node = makeCanvasNode({ id: 'repo', data: { iceType: 'Source.Repository' } });
    expect(getConnectedPipelineStatuses(node, undefined, {})).toEqual([]);
  });

  it('matches Source.Repository iceType as a source', () => {
    const repo = makeCanvasNode({
      id: 'repo',
      data: { iceType: 'Source.Repository' },
    });
    const edges: CardEdge[] = [{ id: 'e1', source: 'repo', target: 'svc' }];
    const card = makeCard({ edges });
    const pipeline: Record<string, NodePipelineStatus> = {
      svc: { status: 'building' },
    };
    const result = getConnectedPipelineStatuses(repo, card, pipeline);
    expect(result).toHaveLength(1);
    expect(result[0]?.status).toBe('building');
  });

  it('matches data.behavior === "source" as a source (alternate path)', () => {
    const repo = makeCanvasNode({
      id: 'repo',
      data: { iceType: 'Custom.Repo', behavior: 'source' },
    });
    const edges: CardEdge[] = [{ id: 'e1', source: 'repo', target: 'svc' }];
    const card = makeCard({ edges });
    const pipeline: Record<string, NodePipelineStatus> = {
      svc: { status: 'success' },
    };
    const result = getConnectedPipelineStatuses(repo, card, pipeline);
    expect(result).toHaveLength(1);
    expect(result[0]?.status).toBe('success');
  });

  it('aggregates statuses from every connected service (source-side and target-side edges)', () => {
    const repo = makeCanvasNode({
      id: 'repo',
      data: { iceType: 'Source.Repository' },
    });
    const edges: CardEdge[] = [
      { id: 'e1', source: 'repo', target: 'svc-A' },
      { id: 'e2', source: 'svc-B', target: 'repo' },
    ];
    const card = makeCard({ edges });
    const pipeline: Record<string, NodePipelineStatus> = {
      'svc-A': { status: 'queued' },
      'svc-B': { status: 'deploying' },
    };
    const result = getConnectedPipelineStatuses(repo, card, pipeline);
    expect(result).toHaveLength(2);
    const statuses = result.map((s) => s.status).sort();
    expect(statuses).toEqual(['deploying', 'queued']);
  });

  it('omits services without any pipeline status entry', () => {
    const repo = makeCanvasNode({
      id: 'repo',
      data: { iceType: 'Source.Repository' },
    });
    const edges: CardEdge[] = [
      { id: 'e1', source: 'repo', target: 'svc-A' },
      { id: 'e2', source: 'repo', target: 'svc-B' },
    ];
    const card = makeCard({ edges });
    const pipeline: Record<string, NodePipelineStatus> = {
      'svc-A': { status: 'failed' },
      // svc-B has no status entry → omitted from result
    };
    const result = getConnectedPipelineStatuses(repo, card, pipeline);
    expect(result).toHaveLength(1);
    expect(result[0]?.status).toBe('failed');
  });

  it('returns [] when the source has no connected edges', () => {
    const repo = makeCanvasNode({
      id: 'repo',
      data: { iceType: 'Source.Repository' },
    });
    const card = makeCard({ edges: [] });
    expect(getConnectedPipelineStatuses(repo, card, {})).toEqual([]);
  });
});

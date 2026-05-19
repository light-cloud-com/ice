/**
 * rf-svgcv2-4 — useRenderCtx hook tests.
 *
 * The hook is a pure assembly (no React state, no effects). Invoke it
 * directly and inspect the returned object. The only computed field
 * (`getConnectedPipelineStatuses`) is verified by stubbing the underlying
 * util and asserting the bound call site forwards `(node, card,
 * pipelineNodeStatus)` triples through.
 */

import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getConnectedPipelineStatuses: vi.fn(() => ({ ingress: ['idle'], egress: ['idle'] })),
}));

vi.mock('../../utils/get-connected-pipeline-statuses', () => ({
  getConnectedPipelineStatuses: mocks.getConnectedPipelineStatuses,
}));

import { useRenderCtx, type UseRenderCtxArgs } from '../use-render-ctx';

const makeArgs = (overrides: Partial<UseRenderCtxArgs> = {}): UseRenderCtxArgs => ({
  sortedNodes: [{ id: 'a' }] as never,
  selectedNodes: ['sel-1'],
  lod: 2,
  zoom: 1.5,
  pipelineNodeStatus: { 'a': 'idle' as never },
  dragOverGroupId: 'g-x',
  exitingGroupId: 'g-y',
  renamingNodeId: null,
  connectionDragTargets: null,
  nodeValidationMap: new Map(),
  handleToggleFold: vi.fn(),
  handleNodeHover: vi.fn(),
  handleNodeDoubleClick: vi.fn(),
  handleRenameCommit: vi.fn(),
  handleRenameCancel: vi.fn(),
  handleUpdateNodeData: vi.fn(),
  handlePipelineClick: vi.fn(),
  card: { id: 'c1' } as never,
  ...overrides,
});

describe('useRenderCtx', () => {
  it('forwards every pass-through field verbatim', () => {
    const args = makeArgs();
    const ctx = useRenderCtx(args);
    expect(ctx.sortedNodes).toBe(args.sortedNodes);
    expect(ctx.selectedNodes).toBe(args.selectedNodes);
    expect(ctx.lod).toBe(args.lod);
    expect(ctx.zoom).toBe(args.zoom);
    expect(ctx.pipelineNodeStatus).toBe(args.pipelineNodeStatus);
    expect(ctx.dragOverGroupId).toBe(args.dragOverGroupId);
    expect(ctx.exitingGroupId).toBe(args.exitingGroupId);
    expect(ctx.renamingNodeId).toBe(args.renamingNodeId);
    expect(ctx.connectionDragTargets).toBe(args.connectionDragTargets);
    expect(ctx.nodeValidationMap).toBe(args.nodeValidationMap);
    expect(ctx.handleToggleFold).toBe(args.handleToggleFold);
    expect(ctx.handleNodeHover).toBe(args.handleNodeHover);
    expect(ctx.handleNodeDoubleClick).toBe(args.handleNodeDoubleClick);
    expect(ctx.handleRenameCommit).toBe(args.handleRenameCommit);
    expect(ctx.handleRenameCancel).toBe(args.handleRenameCancel);
    expect(ctx.handleUpdateNodeData).toBe(args.handleUpdateNodeData);
    expect(ctx.handlePipelineClick).toBe(args.handlePipelineClick);
  });

  it('does NOT leak `card` onto the returned ctx surface', () => {
    const args = makeArgs();
    const ctx = useRenderCtx(args);
    expect((ctx as unknown as Record<string, unknown>).card).toBeUndefined();
  });

  it('binds getConnectedPipelineStatuses with (node, card, pipelineNodeStatus)', () => {
    const args = makeArgs({
      pipelineNodeStatus: { 'b': 'building' as never },
      card: { id: 'card-x' } as never,
    });
    const ctx = useRenderCtx(args);
    const node = { id: 'node-1' } as never;
    ctx.getConnectedPipelineStatuses(node);
    expect(mocks.getConnectedPipelineStatuses).toHaveBeenCalledWith(
      node,
      args.card,
      args.pipelineNodeStatus,
    );
  });

  it('returns the underlying util output verbatim', () => {
    const args = makeArgs();
    const ctx = useRenderCtx(args);
    mocks.getConnectedPipelineStatuses.mockReturnValueOnce({ ingress: ['ok' as never], egress: [] });
    const out = ctx.getConnectedPipelineStatuses({ id: 'x' } as never);
    expect(out).toEqual({ ingress: ['ok'], egress: [] });
  });

  it('produces a fresh object on each call (no memoization expected)', () => {
    const args = makeArgs();
    const a = useRenderCtx(args);
    const b = useRenderCtx(args);
    expect(a).not.toBe(b);
    // But the inner refs match because the args object's references
    // are the same — confirms shallow pass-through.
    expect(a.sortedNodes).toBe(b.sortedNodes);
  });
});

/**
 * rf-svgcv2-2 — useCanvasMouseRouting hook tests.
 *
 * The hook contains no React state, no useEffect, no useCallback — it
 * just stitches handlers together. So we invoke it directly and call
 * the returned functions with synthesized event objects, asserting
 * which downstream callback fires for each branch.
 */

import { describe, it, expect, vi } from 'vitest';
import type React from 'react';

import { useCanvasMouseRouting } from '../use-canvas-mouse-routing';

const makeEvent = (target?: { classList?: { contains: (s: string) => boolean } }): React.MouseEvent =>
  ({ target } as never);

const makeBindCanvas = () => ({
  onMouseDown: vi.fn(),
  onMouseMove: vi.fn(),
  onMouseUp: vi.fn(),
  onMouseLeave: vi.fn(),
  onAuxClick: vi.fn(),
  onContextMenu: vi.fn(),
});

const makeArgs = (overrides: Partial<Parameters<typeof useCanvasMouseRouting>[0]> = {}) => ({
  bindCanvas: makeBindCanvas() as never,
  drawingConnection: null as unknown,
  handleConnectionPortDown: vi.fn(),
  handleConnectionMove: vi.fn(),
  handleConnectionEnd: vi.fn(),
  setConnTooltip: vi.fn(),
  ...overrides,
});

describe('useCanvasMouseRouting', () => {
  describe('onMouseDown', () => {
    it('dismisses connection tooltip on every mousedown', () => {
      const args = makeArgs();
      const handlers = useCanvasMouseRouting(args);
      handlers.onMouseDown(
        makeEvent({ classList: { contains: () => false } }),
      );
      expect(args.setConnTooltip).toHaveBeenCalledWith(null);
    });

    it('routes to handleConnectionPortDown when target has .connection-port class', () => {
      const args = makeArgs();
      const handlers = useCanvasMouseRouting(args);
      const e = makeEvent({ classList: { contains: (s: string) => s === 'connection-port' } });
      handlers.onMouseDown(e);
      expect(args.handleConnectionPortDown).toHaveBeenCalledWith(e);
      expect(args.bindCanvas.onMouseDown).not.toHaveBeenCalled();
    });

    it('falls through to bindCanvas.onMouseDown when target lacks the class', () => {
      const args = makeArgs();
      const handlers = useCanvasMouseRouting(args);
      const e = makeEvent({ classList: { contains: () => false } });
      handlers.onMouseDown(e);
      expect(args.handleConnectionPortDown).not.toHaveBeenCalled();
      expect(args.bindCanvas.onMouseDown).toHaveBeenCalledWith(e);
    });
  });

  describe('onMouseMove', () => {
    it('routes to handleConnectionMove when drawingConnection is truthy', () => {
      const args = makeArgs({ drawingConnection: { sourceId: 'n1' } });
      const handlers = useCanvasMouseRouting(args);
      const e = makeEvent();
      handlers.onMouseMove(e);
      expect(args.handleConnectionMove).toHaveBeenCalledWith(e);
      expect(args.bindCanvas.onMouseMove).not.toHaveBeenCalled();
    });

    it('falls through to bindCanvas.onMouseMove when drawingConnection is null', () => {
      const args = makeArgs({ drawingConnection: null });
      const handlers = useCanvasMouseRouting(args);
      const e = makeEvent();
      handlers.onMouseMove(e);
      expect(args.handleConnectionMove).not.toHaveBeenCalled();
      expect(args.bindCanvas.onMouseMove).toHaveBeenCalledWith(e);
    });
  });

  describe('onMouseUp', () => {
    it('routes to handleConnectionEnd when drawingConnection is truthy', () => {
      const args = makeArgs({ drawingConnection: { sourceId: 'n1' } });
      const handlers = useCanvasMouseRouting(args);
      const e = makeEvent();
      handlers.onMouseUp(e);
      expect(args.handleConnectionEnd).toHaveBeenCalledWith(e);
      expect(args.bindCanvas.onMouseUp).not.toHaveBeenCalled();
    });

    it('falls through to bindCanvas.onMouseUp when drawingConnection is null', () => {
      const args = makeArgs();
      const handlers = useCanvasMouseRouting(args);
      const e = makeEvent();
      handlers.onMouseUp(e);
      expect(args.handleConnectionEnd).not.toHaveBeenCalled();
      expect(args.bindCanvas.onMouseUp).toHaveBeenCalledWith(e);
    });
  });

  describe('onMouseLeave', () => {
    it('dismisses tooltip and forwards to bindCanvas.onMouseLeave', () => {
      const args = makeArgs();
      const handlers = useCanvasMouseRouting(args);
      const e = makeEvent();
      handlers.onMouseLeave(e);
      expect(args.setConnTooltip).toHaveBeenCalledWith(null);
      expect(args.bindCanvas.onMouseLeave).toHaveBeenCalledWith(e);
    });
  });

  describe('onAuxClick / onContextMenu', () => {
    it('forwards onAuxClick to bindCanvas.onAuxClick directly', () => {
      const args = makeArgs();
      const handlers = useCanvasMouseRouting(args);
      // The hook returns the same function reference — no wrap.
      expect(handlers.onAuxClick).toBe(args.bindCanvas.onAuxClick);
    });

    it('forwards onContextMenu to bindCanvas.onContextMenu directly', () => {
      const args = makeArgs();
      const handlers = useCanvasMouseRouting(args);
      expect(handlers.onContextMenu).toBe(args.bindCanvas.onContextMenu);
    });
  });

  describe('classList sniff is the dispatch seam', () => {
    it('does NOT call bindCanvas.onMouseDown when port path is taken', () => {
      const args = makeArgs();
      const handlers = useCanvasMouseRouting(args);
      handlers.onMouseDown(
        makeEvent({ classList: { contains: (s: string) => s === 'connection-port' } }),
      );
      expect(args.handleConnectionPortDown).toHaveBeenCalledTimes(1);
      expect(args.bindCanvas.onMouseDown).not.toHaveBeenCalled();
    });

    it('does NOT call handleConnectionPortDown when fall-through is taken', () => {
      const args = makeArgs();
      const handlers = useCanvasMouseRouting(args);
      handlers.onMouseDown(makeEvent({ classList: { contains: () => false } }));
      expect(args.handleConnectionPortDown).not.toHaveBeenCalled();
      expect(args.bindCanvas.onMouseDown).toHaveBeenCalledTimes(1);
    });
  });
});

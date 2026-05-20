/**
 * Reducer tests for debug-slice.
 */

import { describe, it, expect } from 'vitest';
import debugReducer, { toggleDebugPanel, type DebugState } from '../debug-slice';

function init(): DebugState {
  return debugReducer(undefined, { type: '@@INIT' });
}

describe('debug-slice', () => {
  it('seeds panelOpen=false + zeroed metric fields', () => {
    expect(init()).toEqual({
      panelOpen: false,
      lastAction: '',
      lastActionTime: 0,
      renderDuration: 0,
    });
  });

  it('toggleDebugPanel flips panelOpen on each call', () => {
    let s = debugReducer(init(), toggleDebugPanel());
    expect(s.panelOpen).toBe(true);
    s = debugReducer(s, toggleDebugPanel());
    expect(s.panelOpen).toBe(false);
    s = debugReducer(s, toggleDebugPanel());
    expect(s.panelOpen).toBe(true);
  });

  it('toggleDebugPanel does not touch the metric fields', () => {
    const s = debugReducer(init(), toggleDebugPanel());
    expect(s.lastAction).toBe('');
    expect(s.lastActionTime).toBe(0);
    expect(s.renderDuration).toBe(0);
  });
});

/**
 * Reducer tests for view-slice.
 */

import { describe, it, expect } from 'vitest';
import viewReducer, { setViewLevel, type ViewState } from '../view-slice';

function init(): ViewState {
  return viewReducer(undefined, { type: '@@INIT' });
}

describe('view-slice', () => {
  it('seeds viewLevel=2 (Professional view)', () => {
    expect(init()).toEqual({ viewLevel: 2 });
  });

  it('setViewLevel writes 1', () => {
    const s = viewReducer(init(), setViewLevel(1));
    expect(s.viewLevel).toBe(1);
  });

  it('setViewLevel writes 2', () => {
    let s = viewReducer(init(), setViewLevel(1));
    s = viewReducer(s, setViewLevel(2));
    expect(s.viewLevel).toBe(2);
  });
});

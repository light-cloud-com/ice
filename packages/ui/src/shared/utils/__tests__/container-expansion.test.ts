/**
 * Container Expansion Direction — regression tests
 *
 * Guards against the bug where dragging a child toward the left/top edge
 * of its parent container caused the parent to expand right/bottom instead.
 *
 * Tests the per-edge overflow detection logic used by handleNodeMove:
 *   Left overflow  → shift parent.x LEFT,  increase width  (right edge stays)
 *   Top overflow   → shift parent.y UP,    increase height (bottom edge stays)
 *   Right overflow → increase width only   (left edge stays)
 *   Bottom overflow→ increase height only  (top edge stays)
 */

import { describe, it, expect } from 'vitest';

const CONTAINER_PAD = 20;
const CONTAINER_HEADER_H = 36;
const MIN_CONTAINER_WIDTH = 240;
const MIN_CONTAINER_HEIGHT = 150;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Replicates the exact per-edge overflow logic from handleNodeMove in svg-canvas.tsx.
 * Given a parent container and its children's positions, returns the expanded parent bounds.
 */
function expandContainer(parent: Rect, children: Rect[]): Rect {
  if (children.length === 0) return { ...parent };

  let childMinX = Infinity,
    childMinY = Infinity;
  let childMaxR = -Infinity,
    childMaxB = -Infinity;

  for (const c of children) {
    childMinX = Math.min(childMinX, c.x);
    childMinY = Math.min(childMinY, c.y);
    childMaxR = Math.max(childMaxR, c.x + c.width);
    childMaxB = Math.max(childMaxB, c.y + c.height);
  }

  let { x: px, y: py, width: pw, height: ph } = parent;

  const padL = CONTAINER_PAD;
  const padT = CONTAINER_PAD + CONTAINER_HEADER_H;
  const padR = CONTAINER_PAD;
  const padB = CONTAINER_PAD;

  // Left overflow
  const overflowL = px + padL - childMinX;
  if (overflowL > 0) {
    px -= overflowL;
    pw += overflowL;
  }

  // Top overflow
  const overflowT = py + padT - childMinY;
  if (overflowT > 0) {
    py -= overflowT;
    ph += overflowT;
  }

  // Right overflow
  const overflowR = childMaxR - (px + pw - padR);
  if (overflowR > 0) {
    pw += overflowR;
  }

  // Bottom overflow
  const overflowB = childMaxB - (py + ph - padB);
  if (overflowB > 0) {
    ph += overflowB;
  }

  pw = Math.max(MIN_CONTAINER_WIDTH, pw);
  ph = Math.max(MIN_CONTAINER_HEIGHT, ph);

  return { x: px, y: py, width: pw, height: ph };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Right edge of a rect */
const right = (r: Rect) => r.x + r.width;
/** Bottom edge of a rect */
const bottom = (r: Rect) => r.y + r.height;

// =============================================================================
// LEFT edge expansion
// =============================================================================

describe('Left edge — child dragged left', () => {
  const parent: Rect = { x: 100, y: 100, width: 400, height: 300 };

  it('should shift parent.x left and increase width', () => {
    const result = expandContainer(parent, [{ x: 60, y: 200, width: 200, height: 100 }]);
    expect(result.x).toBeLessThan(parent.x);
    expect(result.width).toBeGreaterThan(parent.width);
  });

  it('should keep the right edge unchanged', () => {
    const result = expandContainer(parent, [{ x: 60, y: 200, width: 200, height: 100 }]);
    expect(right(result)).toBe(right(parent));
  });

  it('should shift x by exactly the overflow amount', () => {
    // child at x=60, parent inner left = 100 + 20 = 120, overflow = 60
    const result = expandContainer(parent, [{ x: 60, y: 200, width: 200, height: 100 }]);
    expect(result.x).toBe(parent.x - 60); // 100 - 60 = 40
    expect(result.width).toBe(parent.width + 60); // 400 + 60 = 460
  });

  it('should handle child far outside left', () => {
    const result = expandContainer(parent, [{ x: -200, y: 200, width: 100, height: 50 }]);
    expect(result.x).toBeLessThan(-200);
    expect(right(result)).toBe(right(parent));
  });

  it('100px to the left = reposition 100px left + 100px width', () => {
    // Parent inner left = 100 + 20 = 120. Child at 20 → overflow = 100.
    const result = expandContainer(parent, [{ x: 20, y: 200, width: 100, height: 50 }]);
    expect(result.x).toBe(parent.x - 100);
    expect(result.width).toBe(parent.width + 100);
    expect(right(result)).toBe(right(parent));
  });
});

// =============================================================================
// TOP edge expansion
// =============================================================================

describe('Top edge — child dragged up', () => {
  const parent: Rect = { x: 100, y: 100, width: 400, height: 300 };

  it('should shift parent.y up and increase height', () => {
    const result = expandContainer(parent, [{ x: 200, y: 50, width: 200, height: 100 }]);
    expect(result.y).toBeLessThan(parent.y);
    expect(result.height).toBeGreaterThan(parent.height);
  });

  it('should keep the bottom edge unchanged', () => {
    const result = expandContainer(parent, [{ x: 200, y: 50, width: 200, height: 100 }]);
    expect(bottom(result)).toBe(bottom(parent));
  });

  it('should account for header height in top padding', () => {
    // Parent inner top = 100 + 20 + 36 = 156. Child at 56 → overflow = 100.
    const result = expandContainer(parent, [{ x: 200, y: 56, width: 100, height: 50 }]);
    expect(result.y).toBe(parent.y - 100);
    expect(result.height).toBe(parent.height + 100);
    expect(bottom(result)).toBe(bottom(parent));
  });

  it('should handle child far above', () => {
    const result = expandContainer(parent, [{ x: 200, y: -300, width: 100, height: 50 }]);
    expect(result.y).toBeLessThan(-300);
    expect(bottom(result)).toBe(bottom(parent));
  });
});

// =============================================================================
// RIGHT edge expansion
// =============================================================================

describe('Right edge — child dragged right', () => {
  const parent: Rect = { x: 100, y: 100, width: 400, height: 300 };

  it('should increase width without moving x', () => {
    const result = expandContainer(parent, [{ x: 450, y: 200, width: 200, height: 100 }]);
    expect(result.x).toBe(parent.x);
    expect(result.y).toBe(parent.y);
    expect(result.width).toBeGreaterThan(parent.width);
  });

  it('should keep the left edge unchanged', () => {
    const result = expandContainer(parent, [{ x: 450, y: 200, width: 200, height: 100 }]);
    expect(result.x).toBe(parent.x);
  });

  it('should expand by exactly the overflow amount', () => {
    // Parent inner right = 100 + 400 - 20 = 480. Child right = 450 + 200 = 650. Overflow = 170.
    const result = expandContainer(parent, [{ x: 450, y: 200, width: 200, height: 100 }]);
    expect(result.width).toBe(parent.width + 170);
  });
});

// =============================================================================
// BOTTOM edge expansion
// =============================================================================

describe('Bottom edge — child dragged down', () => {
  const parent: Rect = { x: 100, y: 100, width: 400, height: 300 };

  it('should increase height without moving y', () => {
    const result = expandContainer(parent, [{ x: 200, y: 350, width: 200, height: 100 }]);
    expect(result.x).toBe(parent.x);
    expect(result.y).toBe(parent.y);
    expect(result.height).toBeGreaterThan(parent.height);
  });

  it('should keep the top edge unchanged', () => {
    const result = expandContainer(parent, [{ x: 200, y: 350, width: 200, height: 100 }]);
    expect(result.y).toBe(parent.y);
  });

  it('should expand by exactly the overflow amount', () => {
    // Parent inner bottom = 100 + 300 - 20 = 380. Child bottom = 350 + 100 = 450. Overflow = 70.
    const result = expandContainer(parent, [{ x: 200, y: 350, width: 200, height: 100 }]);
    expect(result.height).toBe(parent.height + 70);
  });
});

// =============================================================================
// Diagonal / corner expansion
// =============================================================================

describe('Diagonal expansion', () => {
  const parent: Rect = { x: 100, y: 100, width: 400, height: 300 };

  it('top-left: should shift x AND y, keep right AND bottom edges', () => {
    const result = expandContainer(parent, [{ x: 30, y: 30, width: 50, height: 50 }]);
    expect(result.x).toBeLessThan(parent.x);
    expect(result.y).toBeLessThan(parent.y);
    expect(right(result)).toBe(right(parent));
    expect(bottom(result)).toBe(bottom(parent));
  });

  it('bottom-right: should increase width AND height, keep x AND y', () => {
    const result = expandContainer(parent, [{ x: 450, y: 350, width: 200, height: 200 }]);
    expect(result.x).toBe(parent.x);
    expect(result.y).toBe(parent.y);
    expect(result.width).toBeGreaterThan(parent.width);
    expect(result.height).toBeGreaterThan(parent.height);
  });

  it('top-right: should shift y up, increase width right, keep x and bottom', () => {
    const result = expandContainer(parent, [{ x: 450, y: 30, width: 200, height: 50 }]);
    expect(result.x).toBe(parent.x);
    expect(result.y).toBeLessThan(parent.y);
    expect(result.width).toBeGreaterThan(parent.width);
    expect(bottom(result)).toBe(bottom(parent));
  });

  it('bottom-left: should shift x left, increase height down, keep y and right', () => {
    const result = expandContainer(parent, [{ x: 30, y: 350, width: 50, height: 200 }]);
    expect(result.x).toBeLessThan(parent.x);
    expect(result.y).toBe(parent.y);
    expect(right(result)).toBe(right(parent));
    expect(result.height).toBeGreaterThan(parent.height);
  });
});

// =============================================================================
// No expansion needed
// =============================================================================

describe('No expansion — child fully inside', () => {
  const parent: Rect = { x: 100, y: 100, width: 400, height: 300 };

  it('should not change when child is well inside bounds', () => {
    const result = expandContainer(parent, [{ x: 200, y: 200, width: 100, height: 50 }]);
    expect(result).toEqual(parent);
  });

  it('should not change when child is exactly at inner padding boundary', () => {
    // inner left = 120, inner top = 156, inner right = 480, inner bottom = 380
    const result = expandContainer(parent, [{ x: 120, y: 156, width: 360, height: 224 }]);
    expect(result).toEqual(parent);
  });
});

// =============================================================================
// Multiple children — bounding box
// =============================================================================

describe('Multiple children', () => {
  const parent: Rect = { x: 100, y: 100, width: 400, height: 300 };

  it('should expand to encompass all children in all directions', () => {
    const children: Rect[] = [
      { x: 30, y: 200, width: 50, height: 50 }, // extends left
      { x: 450, y: 200, width: 200, height: 50 }, // extends right
      { x: 200, y: 30, width: 50, height: 50 }, // extends up
      { x: 200, y: 380, width: 50, height: 50 }, // extends down
    ];
    const result = expandContainer(parent, children);
    expect(result.x).toBeLessThan(parent.x);
    expect(result.y).toBeLessThan(parent.y);
    expect(right(result)).toBeGreaterThan(right(parent));
    expect(bottom(result)).toBeGreaterThan(bottom(parent));
  });

  it('should use the most extreme child for each edge', () => {
    const children: Rect[] = [
      { x: 50, y: 200, width: 50, height: 50 },
      { x: 20, y: 200, width: 50, height: 50 }, // further left
    ];
    const result = expandContainer(parent, children);
    // Should expand based on x=20, not x=50
    expect(result.x).toBe(20 - CONTAINER_PAD);
  });
});

// =============================================================================
// Incremental expansion (simulating continuous drag)
// =============================================================================

describe('Incremental expansion — simulates continuous drag', () => {
  it('left drag: each step should shift x further left, right edge never moves', () => {
    let parent: Rect = { x: 100, y: 100, width: 400, height: 300 };
    const originalRight = right(parent);
    const childY = 200;

    // Simulate dragging child from x=150 to x=50 in 10px steps
    for (let childX = 110; childX >= 50; childX -= 10) {
      const result = expandContainer(parent, [{ x: childX, y: childY, width: 100, height: 50 }]);
      expect(result.x).toBeLessThanOrEqual(parent.x);
      expect(right(result)).toBe(originalRight);
      parent = result; // feed result back as next frame's parent
    }

    expect(parent.x).toBeLessThan(50);
  });

  it('top drag: each step should shift y further up, bottom edge never moves', () => {
    let parent: Rect = { x: 100, y: 100, width: 400, height: 300 };
    const originalBottom = bottom(parent);
    const childX = 200;

    for (let childY = 140; childY >= 50; childY -= 10) {
      const result = expandContainer(parent, [{ x: childX, y: childY, width: 100, height: 50 }]);
      expect(result.y).toBeLessThanOrEqual(parent.y);
      expect(bottom(result)).toBe(originalBottom);
      parent = result;
    }

    expect(parent.y).toBeLessThan(50);
  });

  it('right drag: each step should increase width, left edge never moves', () => {
    let parent: Rect = { x: 100, y: 100, width: 400, height: 300 };
    const originalX = parent.x;
    const childY = 200;

    for (let childX = 400; childX <= 600; childX += 20) {
      const result = expandContainer(parent, [{ x: childX, y: childY, width: 100, height: 50 }]);
      expect(result.x).toBe(originalX);
      expect(result.width).toBeGreaterThanOrEqual(parent.width);
      parent = result;
    }
  });

  it('bottom drag: each step should increase height, top edge never moves', () => {
    let parent: Rect = { x: 100, y: 100, width: 400, height: 300 };
    const originalY = parent.y;
    const childX = 200;

    for (let childY = 350; childY <= 550; childY += 20) {
      const result = expandContainer(parent, [{ x: childX, y: childY, width: 100, height: 50 }]);
      expect(result.y).toBe(originalY);
      expect(result.height).toBeGreaterThanOrEqual(parent.height);
      parent = result;
    }
  });
});

// =============================================================================
// Nested containers (grandparent expansion)
// =============================================================================

describe('Nested containers — grandparent expansion', () => {
  it('expanding inner group should also expand outer group if needed', () => {
    const outer: Rect = { x: 0, y: 0, width: 600, height: 500 };
    const inner: Rect = { x: 50, y: 50, width: 300, height: 200 };
    // Child at inner's left edge
    const child: Rect = { x: 10, y: 100, width: 100, height: 50 };

    // First expand inner
    const expandedInner = expandContainer(inner, [child]);
    expect(expandedInner.x).toBeLessThan(inner.x);
    expect(right(expandedInner)).toBe(right(inner));

    // Then expand outer based on the expanded inner
    const expandedOuter = expandContainer(outer, [expandedInner]);
    // Outer's left edge should not need to move if inner still fits
    // But if inner expanded beyond outer's inner padding, outer should expand too
    if (expandedInner.x < outer.x + CONTAINER_PAD) {
      expect(expandedOuter.x).toBeLessThan(outer.x);
    }
  });
});

// =============================================================================
// Minimum size constraints
// =============================================================================

describe('Minimum container size', () => {
  it('should never shrink below MIN_CONTAINER_WIDTH', () => {
    const parent: Rect = { x: 100, y: 100, width: MIN_CONTAINER_WIDTH, height: MIN_CONTAINER_HEIGHT };
    const result = expandContainer(parent, [{ x: 110, y: 170, width: 30, height: 20 }]);
    expect(result.width).toBeGreaterThanOrEqual(MIN_CONTAINER_WIDTH);
    expect(result.height).toBeGreaterThanOrEqual(MIN_CONTAINER_HEIGHT);
  });

  it('should expand beyond minimum when needed', () => {
    const parent: Rect = { x: 100, y: 100, width: MIN_CONTAINER_WIDTH, height: MIN_CONTAINER_HEIGHT };
    const result = expandContainer(parent, [{ x: -100, y: -100, width: 800, height: 600 }]);
    expect(result.width).toBeGreaterThan(MIN_CONTAINER_WIDTH);
    expect(result.height).toBeGreaterThan(MIN_CONTAINER_HEIGHT);
  });
});

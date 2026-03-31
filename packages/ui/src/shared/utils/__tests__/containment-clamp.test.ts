/**
 * Containment Clamping — pure function tests
 *
 * Tests the clamping logic used by handleNodeMove (BND-1) and the Redux
 * reducers (BND-2) to ensure child nodes stay within parent container bounds.
 *
 * These are fast unit tests over the clamping math — no Redux or React required.
 */

import { describe, it, expect } from 'vitest';

const CONTAINER_PAD = 20;
const CONTAINER_HEADER_H = 36;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Clamp a child position so it stays within the parent's inner content area.
 * Mirrors the clamping logic in handleNodeMove and updateCardNodePositions.
 */
function clampToParent(
  childX: number,
  childY: number,
  childWidth: number,
  childHeight: number,
  parent: Rect,
): { x: number; y: number } {
  const minX = parent.x + CONTAINER_PAD;
  const minY = parent.y + CONTAINER_PAD + CONTAINER_HEADER_H;
  const maxX = parent.x + parent.width - CONTAINER_PAD - childWidth;
  const maxY = parent.y + parent.height - CONTAINER_PAD - childHeight;
  return {
    x: Math.max(minX, Math.min(maxX, childX)),
    y: Math.max(minY, Math.min(maxY, childY)),
  };
}

// =============================================================================
// Basic clamping — four edges
// =============================================================================

describe('clampToParent — basic edges', () => {
  const parent: Rect = { x: 0, y: 0, width: 500, height: 400 };
  const childW = 200;
  const childH = 100;

  it('should not change position when inside bounds', () => {
    const { x, y } = clampToParent(100, 100, childW, childH, parent);
    expect(x).toBe(100);
    expect(y).toBe(100);
  });

  it('should clamp left overflow', () => {
    const { x } = clampToParent(-50, 100, childW, childH, parent);
    expect(x).toBe(20); // parent.x + PAD
  });

  it('should clamp top overflow (includes header)', () => {
    const { y } = clampToParent(100, 10, childW, childH, parent);
    expect(y).toBe(56); // parent.y + PAD + HEADER
  });

  it('should clamp right overflow', () => {
    const { x } = clampToParent(400, 100, childW, childH, parent);
    // maxX = 0 + 500 - 20 - 200 = 280
    expect(x).toBe(280);
  });

  it('should clamp bottom overflow', () => {
    const { y } = clampToParent(100, 350, childW, childH, parent);
    // maxY = 0 + 400 - 20 - 100 = 280
    expect(y).toBe(280);
  });

  it('should clamp all four edges at once', () => {
    const { x, y } = clampToParent(-500, -500, childW, childH, parent);
    expect(x).toBe(20);
    expect(y).toBe(56);
  });

  it('should clamp bottom-right corner', () => {
    const { x, y } = clampToParent(9999, 9999, childW, childH, parent);
    expect(x).toBe(280);
    expect(y).toBe(280);
  });
});

// =============================================================================
// Offset parent — non-zero origin
// =============================================================================

describe('clampToParent — offset parent origin', () => {
  const parent: Rect = { x: 200, y: 150, width: 500, height: 400 };
  const childW = 200;
  const childH = 100;

  it('should clamp left to offset origin + padding', () => {
    const { x } = clampToParent(100, 200, childW, childH, parent);
    expect(x).toBe(220); // 200 + 20
  });

  it('should clamp top to offset origin + padding + header', () => {
    const { y } = clampToParent(250, 100, childW, childH, parent);
    expect(y).toBe(206); // 150 + 20 + 36
  });

  it('should clamp right to offset right edge - padding', () => {
    const { x } = clampToParent(600, 200, childW, childH, parent);
    // maxX = 200 + 500 - 20 - 200 = 480
    expect(x).toBe(480);
  });

  it('should allow exact boundary position', () => {
    // minX = 220, minY = 206, maxX = 480, maxY = 430
    const { x, y } = clampToParent(220, 206, childW, childH, parent);
    expect(x).toBe(220);
    expect(y).toBe(206);
  });
});

// =============================================================================
// Small parent — child too large to fit with padding
// =============================================================================

describe('clampToParent — small parent (maxX < minX)', () => {
  it('should clamp to minX when child wider than content area', () => {
    const parent: Rect = { x: 0, y: 0, width: 220, height: 400 };
    // Inner width = 220 - 40 = 180, child width = 200 → doesn't fit
    // minX = 20, maxX = 0 + 220 - 20 - 200 = 0
    // Math.max(20, Math.min(0, anything)) = Math.max(20, 0 or less) = 20
    const { x } = clampToParent(100, 100, 200, 100, parent);
    expect(x).toBe(20);
  });

  it('should clamp to minY when child taller than content area', () => {
    const parent: Rect = { x: 0, y: 0, width: 500, height: 160 };
    // Inner height = 160 - 20 - 36 - 20 = 84, child height = 100 → doesn't fit
    // minY = 56, maxY = 0 + 160 - 20 - 100 = 40
    const { y } = clampToParent(100, 100, 200, 100, parent);
    expect(y).toBe(56);
  });
});

// =============================================================================
// Simulated drag sequence — incremental moves
// =============================================================================

describe('clampToParent — drag sequence simulation', () => {
  const parent: Rect = { x: 0, y: 0, width: 500, height: 400 };
  const childW = 200;
  const childH = 100;

  it('should keep child inside during incremental left drag', () => {
    let cx = 200;
    for (let step = 0; step < 50; step++) {
      cx -= 10; // drag left by 10px per step
      const { x } = clampToParent(cx, 100, childW, childH, parent);
      expect(x).toBeGreaterThanOrEqual(20); // never below minX
    }
  });

  it('should keep child inside during incremental right drag', () => {
    let cx = 50;
    for (let step = 0; step < 50; step++) {
      cx += 10;
      const { x } = clampToParent(cx, 100, childW, childH, parent);
      expect(x).toBeLessThanOrEqual(280); // never above maxX
    }
  });

  it('should keep child inside during diagonal drag toward bottom-right', () => {
    let cx = 100;
    let cy = 100;
    for (let step = 0; step < 50; step++) {
      cx += 15;
      cy += 12;
      const { x, y } = clampToParent(cx, cy, childW, childH, parent);
      expect(x).toBeLessThanOrEqual(280);
      expect(y).toBeLessThanOrEqual(280);
      expect(x).toBeGreaterThanOrEqual(20);
      expect(y).toBeGreaterThanOrEqual(56);
    }
  });
});

// =============================================================================
// Snap-to-grid interaction (BND-3)
// =============================================================================

describe('clampToParent — snap-to-grid scenarios (BND-3)', () => {
  const GRID = 48;
  const parent: Rect = { x: 0, y: 0, width: 500, height: 400 };
  const childW = 200;
  const childH = 100;

  function snapToGrid(value: number): number {
    return Math.round(value / GRID) * GRID;
  }

  it('should clamp after snap pushes node past right edge', () => {
    // Child near right edge, snap rounds up past boundary
    const rawX = 270; // within bounds (maxX=280)
    const snapped = snapToGrid(rawX); // rounds to 288 (6*48) — outside!
    const { x } = clampToParent(snapped, 100, childW, childH, parent);
    expect(x).toBe(280); // clamped back inside
  });

  it('should clamp after snap pushes node past left edge', () => {
    const rawX = 25; // within bounds (minX=20)
    const snapped = snapToGrid(rawX); // rounds to 48 — still inside
    const { x } = clampToParent(snapped, 100, childW, childH, parent);
    expect(x).toBe(48); // snap kept it inside

    // But with rawX closer to 0:
    const rawX2 = 5;
    const snapped2 = snapToGrid(rawX2); // rounds to 0 — outside!
    const { x: x2 } = clampToParent(snapped2, 100, childW, childH, parent);
    expect(x2).toBe(20); // clamped to minX
  });

  it('should handle snap landing exactly on boundary', () => {
    // maxX = 280, snap to nearest grid: 288 (too far) or 240 (inside)
    const { x } = clampToParent(280, 100, childW, childH, parent);
    expect(x).toBe(280); // exactly on boundary is valid
  });
});

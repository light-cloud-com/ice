/**
 * Tests for the canvas font tokens — primary (display) and mono.
 *
 * The constants are inlined into many leaf FCs; this test is a regression
 * pin so a change to either string forces a deliberate update.
 */

import { describe, it, expect } from 'vitest';
import { FONT_PRIMARY, FONT_MONO } from '../fonts';

describe('canvas node font tokens', () => {
  it('FONT_PRIMARY uses the JetBrains Mono variable display family', () => {
    expect(FONT_PRIMARY).toBe("'JetBrains Mono Variable', monospace");
  });

  it('FONT_MONO uses the system mono fallback chain', () => {
    expect(FONT_MONO).toBe("ui-monospace, 'SFMono-Regular', monospace");
  });
});

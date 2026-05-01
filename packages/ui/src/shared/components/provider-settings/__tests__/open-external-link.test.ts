/**
 * rf-pset-3 — `openExternalLink` util.
 *
 * Pins the verbatim `window.open(url, '_blank', 'noopener,noreferrer')`
 * call. The test stubs `window` (the vitest config defaults to the
 * `node` environment, see rf-pdpl-12 stub-globals learning) so the
 * call lands on a spy.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { openExternalLink } from '../utils/open-external-link';

describe('openExternalLink', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { open: vi.fn() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls window.open with the URL, _blank target, and noopener,noreferrer features', () => {
    openExternalLink('https://example.test/docs');
    const open = (window as unknown as { open: ReturnType<typeof vi.fn> }).open;
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('https://example.test/docs', '_blank', 'noopener,noreferrer');
  });

  it('forwards arbitrary URLs unchanged (no validation, mirrors source)', () => {
    openExternalLink('http://insecure.test/path');
    openExternalLink('mailto:user@example.test');
    const open = (window as unknown as { open: ReturnType<typeof vi.fn> }).open;
    expect(open).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenNthCalledWith(1, 'http://insecure.test/path', '_blank', 'noopener,noreferrer');
    expect(open).toHaveBeenNthCalledWith(2, 'mailto:user@example.test', '_blank', 'noopener,noreferrer');
  });

  it('returns undefined (no return value)', () => {
    const result = openExternalLink('https://example.test');
    expect(result).toBeUndefined();
  });
});

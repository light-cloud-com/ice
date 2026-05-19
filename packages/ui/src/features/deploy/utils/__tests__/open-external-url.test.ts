/**
 * rf-pdpl-2 — `utils/open-external-url.ts` invariant tests.
 *
 * The module was lifted verbatim from `deploy-panel.tsx` (L1413–1419). These
 * tests pin the exact `window.open` invocation shape the deploy panel relies
 * on so any future "tidy up" — e.g. dropping the security-flag string,
 * switching the target, or quietly returning a value — fails loudly.
 *
 * The vitest root config does not enable jsdom, so `window` is undefined in
 * this environment. Each test stubs `window` as an object whose `open`
 * property is a `vi.fn()`; `vi.unstubAllGlobals` in `afterEach` keeps the
 * stub from leaking to sibling test files.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { openExternalUrl } from '../open-external-url';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('openExternalUrl', () => {
  it('calls window.open with the URL, _blank target, and noopener,noreferrer flags', () => {
    const open = vi.fn();
    vi.stubGlobal('window', { open });

    openExternalUrl('https://example.com');

    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer');
  });

  it('passes the URL through verbatim (no normalization, no encoding)', () => {
    // The deploy panel already constructs URLs with template literals and
    // trusts the values it gets from the API (e.g. api_enable_url, billing
    // links). The util must not double-encode or mutate the string.
    const open = vi.fn();
    vi.stubGlobal('window', { open });

    const url = 'https://console.cloud.google.com/apis/api/compute.googleapis.com/overview?project=my-proj';
    openExternalUrl(url);

    expect(open).toHaveBeenCalledWith(url, '_blank', 'noopener,noreferrer');
  });

  it('returns undefined regardless of what window.open returns', () => {
    // The original function had no `return` statement — preserve that so any
    // caller that mistakenly tried to use the return value (e.g. as a Window
    // handle) keeps getting `undefined`, not whatever the polyfilled
    // `window.open` happens to produce.
    vi.stubGlobal('window', { open: vi.fn(() => ({ document: {} })) });

    const result = openExternalUrl('https://example.com');

    expect(result).toBeUndefined();
  });
});

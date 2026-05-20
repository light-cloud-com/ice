/**
 * NullProvider behavior tests.
 *
 * The interface types in `types.ts` produce no runtime code; the only
 * executable surface is the `NullProvider` class.
 */

import { describe, expect, it } from 'vitest';
import { NullProvider } from '../types';

describe('NullProvider', () => {
  it('reports its identifier as "none"', () => {
    const p = new NullProvider();
    expect(p.name).toBe('none');
  });

  it('flags itself as local (no external network)', () => {
    expect(new NullProvider().isLocal).toBe(true);
  });

  it('exposes "none" as the active model', () => {
    expect(new NullProvider().model).toBe('none');
  });

  it('returns a not-ok health check with explanatory error', async () => {
    const p = new NullProvider();
    const res = await p.healthCheck();
    expect(res.ok).toBe(false);
    expect(res.provider).toBe('none');
    expect(res.error).toMatch(/no ai provider/i);
  });

  it('throws when chat() is called', async () => {
    const p = new NullProvider();
    await expect(p.chat()).rejects.toThrow(/no ai provider/i);
  });

  it('throws on the FIRST iteration of streamChat (findings #54)', async () => {
    // Previous behaviour yielded one `undefined` chunk before
    // throwing, so consumers using `for await (const c of …)` that
    // didn't pre-check `c.content` silently processed an undefined
    // token. The eslint require-yield rule is suppressed on the
    // function so the generator throws on first .next() instead.
    const p = new NullProvider();
    const it = p.streamChat()[Symbol.asyncIterator]();
    await expect(it.next()).rejects.toThrow(/no ai provider/i);
  });
});

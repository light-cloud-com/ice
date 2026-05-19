/**
 * Tests for resource.service.ts's catch arm — the load-failure fallback at
 * lines 14-19. Isolated to its own file because the throwing `vi.mock`
 * factory would persist across all tests in the file otherwise.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@ice/core', () => {
  throw new Error('synthetic core load failure');
});

describe('resource service — @ice/core load failure', () => {
  it('falls back to a stub core that yields empty for every export', async () => {
    const svc = await import('../resource.service');
    expect(await svc.getCategories()).toEqual([]);
    expect(await svc.getAll()).toEqual([]);
    expect(await svc.getForPalette()).toEqual([]);
    expect(await svc.getByCategory('any')).toEqual([]);
    expect(await svc.search('any')).toEqual([]);
    expect(await svc.getLowLevel('any')).toEqual([]);
    expect(await svc.getByProvider('any')).toEqual([]);
  });
});

/**
 * Resource Service — Wired to @ice-engine/core high-level resources
 *
 * Serves real resource palette data from the ICE engine.
 * Uses dynamic imports since @ice-engine/core resolves from workspace root.
 */

let _core: any = null;

async function getCore() {
  if (!_core) {
    try {
      // @ts-ignore — resolved at runtime via pnpm workspace
      _core = await import('@ice-engine/core');
    } catch {
      _core = {
        HIGH_LEVEL_CATEGORIES: [],
        getAllHighLevelResources: () => [],
        getHighLevelResourcesForPalette: () => [],
        filterResourcesByProvider: () => [],
      };
    }
  }
  return _core;
}

export async function getCategories() {
  const core = await getCore();
  return core.HIGH_LEVEL_CATEGORIES || [];
}

export async function getAll() {
  const core = await getCore();
  return core.getAllHighLevelResources?.() || [];
}

export async function getForPalette() {
  const core = await getCore();
  return core.getHighLevelResourcesForPalette?.() || [];
}

export async function getByCategory(categoryId: string) {
  const core = await getCore();
  const categories = core.HIGH_LEVEL_CATEGORIES || [];
  const category = categories.find((c: any) => c.id === categoryId);
  return category?.resources || [];
}

export async function search(query: string) {
  const core = await getCore();
  const q = query.toLowerCase();
  const resources = (core.getAllHighLevelResources?.() || []) as any[];
  return resources.filter((r: any) =>
    r.name.toLowerCase().includes(q) ||
    r.description?.toLowerCase().includes(q)
  );
}

export async function getLowLevel(highLevelId: string) {
  const core = await getCore();
  const resources = (core.getAllHighLevelResources?.() || []) as any[];
  const resource = resources.find((r: any) => r.id === highLevelId);
  return resource?.implementations || [];
}

export async function getByProvider(provider: string) {
  const core = await getCore();
  return core.filterResourcesByProvider?.(provider) || [];
}

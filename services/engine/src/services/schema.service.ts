/**
 * Schema Service — Wired to @ice/core schema system
 *
 * Serves real resource schema data from the ICE engine.
 * Uses dynamic imports since @ice/core resolves from workspace root.
 */

let _core: any = null;

async function getCore() {
  if (!_core) {
    try {
      // @ts-ignore — resolved at runtime via pnpm workspace
      _core = await import('@ice/core');
    } catch {
      _core = { HIGH_LEVEL_CATEGORIES: [], getAllHighLevelResources: () => [] };
    }
  }
  return _core;
}

export async function getCategories() {
  const core = await getCore();
  const categories = core.HIGH_LEVEL_CATEGORIES || [];
  return categories.map((c: any) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    icon: c.icon,
    count: c.resources?.length || 0,
  }));
}

export async function querySchemas(query: { category?: string; search?: string; provider?: string }) {
  const core = await getCore();
  let resources = (core.getAllHighLevelResources?.() || []) as any[];

  if (query.category) {
    resources = resources.filter((r: any) => r.category === query.category);
  }
  if (query.provider) {
    resources = resources.filter((r: any) =>
      r.providers?.some?.((p: any) => (typeof p === 'string' ? p : p.id) === query.provider),
    );
  }
  if (query.search) {
    const q = query.search.toLowerCase();
    resources = resources.filter(
      (r: any) =>
        r.name.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q) ||
        r.keywords?.some?.((k: string) => k.toLowerCase().includes(q)),
    );
  }

  return resources;
}

export async function getSchema(iceType: string) {
  const core = await getCore();
  const resources = (core.getAllHighLevelResources?.() || []) as any[];
  return resources.find((r: any) => r.id === iceType) || null;
}

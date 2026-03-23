/**
 * AI Schema Context Service
 *
 * Builds compact schema descriptions from @ice/core resources
 * to inject into the AI system prompt. This helps Claude Sonnet generate
 * valid configurations with correct property types and values.
 */

interface SchemaContextOptions {
  /** iceTypes already present on the canvas */
  existingIceTypes: string[];
  /** Dominant cloud provider (aws/gcp/azure) */
  dominantProvider: string;
  /** Max number of additional resources to include beyond existing */
  maxExtra?: number;
}

// Cache for 5 minutes
let _schemaCache: { data: Map<string, any>; categories: any[]; ts: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

async function getCachedSchemas(): Promise<{ data: Map<string, any>; categories: any[] }> {
  if (_schemaCache && Date.now() - _schemaCache.ts < CACHE_TTL) {
    return _schemaCache;
  }
  try {
    // @ts-ignore — resolved at runtime via pnpm workspace
    const core = await import('@ice/core');
    const categories = core.HIGH_LEVEL_CATEGORIES || [];
    const allResources = core.getAllHighLevelResources?.() || [];
    const data = new Map<string, any>();
    for (const res of allResources) {
      data.set(res.id, res);
    }
    // Also add from categories (may have more detail)
    for (const cat of categories) {
      for (const res of cat.resources || []) {
        if (!data.has(res.id)) {
          data.set(res.id, res);
        }
      }
    }
    _schemaCache = { data, categories, ts: Date.now() };
    return _schemaCache;
  } catch {
    const empty = { data: new Map(), categories: [], ts: Date.now() };
    _schemaCache = empty;
    return empty;
  }
}

function formatProperty(prop: any): string {
  const name = prop.id || prop.name;
  const type = prop.type || prop.inputType || 'string';
  const required = prop.required ? 'required' : 'optional';
  let desc = `${name} (${type}, ${required})`;

  if (prop.options?.length) {
    const values = prop.options.map((o: any) => (typeof o === 'string' ? `"${o}"` : `"${o.value || o.id}"`)).join('|');
    desc += `: ${values}`;
  }
  if (prop.default !== undefined) {
    desc += ` [default: ${JSON.stringify(prop.default)}]`;
  }
  return desc;
}

function formatResource(res: any): string {
  const lines: string[] = [];
  lines.push(`### ${res.name || res.id}`);

  if (res.properties?.length) {
    const propDescs = res.properties.map(formatProperty);
    lines.push(`Properties: ${propDescs.join(', ')}`);
  }

  // Show provider implementations
  if (res.implementations?.length) {
    const implDescs = res.implementations.map((impl: any) => `${impl.provider} → ${impl.name || impl.id}`);
    lines.push(`Providers: ${implDescs.join(', ')}`);
  }

  return lines.join('\n');
}

export async function buildSchemaContext(options: SchemaContextOptions): Promise<string> {
  const { existingIceTypes, dominantProvider, maxExtra = 10 } = options;
  const { data: schemas, categories: _categories } = await getCachedSchemas();

  if (schemas.size === 0) {
    return ''; // No schemas available — skip context
  }

  const includedIds = new Set<string>();
  const sections: string[] = [];

  // 1. Include schemas for all iceTypes already on canvas
  for (const iceType of existingIceTypes) {
    const schema = schemas.get(iceType);
    if (schema) {
      sections.push(formatResource(schema));
      includedIds.add(iceType);
    }
  }

  // 2. Add top resources for the dominant provider (up to maxExtra)
  let added = 0;
  for (const [id, res] of schemas) {
    if (added >= maxExtra) break;
    if (includedIds.has(id)) continue;

    // Check if resource has implementation for dominant provider
    const hasProvider = res.implementations?.some((impl: any) => impl.provider === dominantProvider);
    if (hasProvider || !res.implementations?.length) {
      sections.push(formatResource(res));
      includedIds.add(id);
      added++;
    }
  }

  if (sections.length === 0) return '';

  return `\n## Available Resource Schemas\n\nUse these exact property names and value types when generating configurations:\n\n${sections.join('\n\n')}`;
}

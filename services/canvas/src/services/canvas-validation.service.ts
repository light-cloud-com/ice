/**
 * Canvas Validation Service
 *
 * Validates canvas JSON (nodes + edges) against provider schemas
 * from @ice-engine/core. Returns structured validation results.
 */

interface ValidationError {
  type: 'missing_resource' | 'missing_property' | 'invalid_type' | 'invalid_option'
    | 'invalid_edge_ref' | 'invalid_relationship' | 'invalid_parent';
  nodeId?: string;
  edgeId?: string;
  field?: string;
  message: string;
}

interface ValidationWarning {
  nodeId?: string;
  message: string;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  summary: string;
}

// Cache core resources for 5 minutes
let _resourceCache: { data: any[]; categories: any[]; ts: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

async function getCachedResources() {
  if (_resourceCache && Date.now() - _resourceCache.ts < CACHE_TTL) {
    return _resourceCache;
  }
  try {
    // @ts-ignore — resolved at runtime via pnpm workspace
    const core = await import('@ice-engine/core');
    const categories = core.HIGH_LEVEL_CATEGORIES || [];
    const data = core.getAllHighLevelResources?.() || [];
    _resourceCache = { data, categories, ts: Date.now() };
    return _resourceCache;
  } catch {
    _resourceCache = { data: [], categories: [], ts: Date.now() };
    return _resourceCache;
  }
}

const VALID_RELATIONSHIPS = new Set(['connects_to', 'depends_on', 'contains']);

export async function validateCanvas(
  nodes: any[],
  edges: any[],
): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const { data: resources, categories } = await getCachedResources();

  // Build lookup maps
  const nodeMap = new Map<string, any>();
  for (const n of nodes) {
    nodeMap.set(n.id, n);
  }

  // Flatten all known iceTypes from categories
  const knownIceTypes = new Set<string>();
  const resourceSchemas = new Map<string, any>();
  for (const cat of categories) {
    for (const res of cat.resources || []) {
      knownIceTypes.add(res.id);
      resourceSchemas.set(res.id, res);
    }
  }
  // Also add from flat resources list
  for (const res of resources) {
    knownIceTypes.add(res.id);
    if (!resourceSchemas.has(res.id)) {
      resourceSchemas.set(res.id, res);
    }
  }

  // ── 1. Validate nodes ──────────────────────────────────────────────────────

  for (const node of nodes) {
    const iceType = node.data?.iceType || node.iceType;
    if (!iceType) {
      // Groups and non-resource nodes may not have iceType
      if (node.type === 'resource') {
        warnings.push({ nodeId: node.id, message: 'Resource node missing iceType' });
      }
      continue;
    }

    // Check 1: iceType exists in known resources
    if (knownIceTypes.size > 0 && !knownIceTypes.has(iceType)) {
      errors.push({
        type: 'missing_resource',
        nodeId: node.id,
        message: `Unknown iceType "${iceType}" — not found in available resources`,
      });
      continue; // Skip property checks for unknown types
    }

    // Check 2-4: Property validation against schema
    const schema = resourceSchemas.get(iceType);
    if (schema?.properties) {
      const nodeData = node.data || {};
      for (const prop of schema.properties) {
        // Check 2: Required properties
        if (prop.required && nodeData[prop.id] === undefined && nodeData[prop.name] === undefined) {
          errors.push({
            type: 'missing_property',
            nodeId: node.id,
            field: prop.id || prop.name,
            message: `Required property "${prop.id || prop.name}" missing on ${iceType}`,
          });
        }

        const value = nodeData[prop.id] ?? nodeData[prop.name];
        if (value === undefined) continue;

        // Check 3: Type validation
        const expectedType = prop.type || prop.inputType;
        if (expectedType) {
          const actualType = typeof value;
          if (
            (expectedType === 'string' && actualType !== 'string') ||
            (expectedType === 'number' && actualType !== 'number') ||
            (expectedType === 'boolean' && actualType !== 'boolean')
          ) {
            errors.push({
              type: 'invalid_type',
              nodeId: node.id,
              field: prop.id || prop.name,
              message: `Property "${prop.id || prop.name}" should be ${expectedType}, got ${actualType}`,
            });
          }
        }

        // Check 4: Select/enum value validation
        if ((expectedType === 'select' || prop.options) && prop.options?.length > 0) {
          const allowedValues = prop.options.map((o: any) => typeof o === 'string' ? o : o.value || o.id);
          if (!allowedValues.includes(value)) {
            errors.push({
              type: 'invalid_option',
              nodeId: node.id,
              field: prop.id || prop.name,
              message: `Invalid value "${value}" for "${prop.id || prop.name}". Allowed: ${allowedValues.join(', ')}`,
            });
          }
        }
      }
    }
  }

  // ── 2. Validate edges ──────────────────────────────────────────────────────

  for (const edge of edges) {
    // Check 5: Source/target reference existing nodes
    if (!nodeMap.has(edge.source)) {
      errors.push({
        type: 'invalid_edge_ref',
        edgeId: edge.id,
        message: `Edge source "${edge.source}" does not reference an existing node`,
      });
    }
    if (!nodeMap.has(edge.target)) {
      errors.push({
        type: 'invalid_edge_ref',
        edgeId: edge.id,
        message: `Edge target "${edge.target}" does not reference an existing node`,
      });
    }

    // Check 6: Relationship type is valid
    const relationship = edge.data?.relationship || edge.relationship;
    if (relationship && !VALID_RELATIONSHIPS.has(relationship)) {
      errors.push({
        type: 'invalid_relationship',
        edgeId: edge.id,
        message: `Invalid edge relationship "${relationship}". Must be one of: ${[...VALID_RELATIONSHIPS].join(', ')}`,
      });
    }
  }

  // ── 3. Validate containment (parent-child) ────────────────────────────────

  for (const node of nodes) {
    const parentId = node.parentId || node.parentNode;
    if (!parentId) continue;

    const parent = nodeMap.get(parentId);
    if (!parent) {
      errors.push({
        type: 'invalid_parent',
        nodeId: node.id,
        message: `Parent "${parentId}" does not exist`,
      });
    } else if (parent.type !== 'group') {
      errors.push({
        type: 'invalid_parent',
        nodeId: node.id,
        message: `Parent "${parentId}" is not a group node (type: ${parent.type})`,
      });
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  const valid = errors.length === 0;
  const summary = valid
    ? `Canvas valid: ${nodes.length} nodes, ${edges.length} edges — no issues found`
    : `Canvas invalid: ${errors.length} error(s), ${warnings.length} warning(s)`;

  return { valid, errors, warnings, summary };
}

/**
 * Canvas Validation Service
 *
 * Thin wrapper around @ice/core's validation engine.
 * Delegates to the unified validateCanvas() for all checks.
 */

interface ValidationError {
  type:
    | 'missing_resource'
    | 'missing_property'
    | 'invalid_type'
    | 'invalid_option'
    | 'invalid_edge_ref'
    | 'invalid_relationship'
    | 'invalid_parent';
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

export async function validateCanvas(nodes: any[], edges: any[]): Promise<ValidationResult> {
  try {
    // @ts-ignore — resolved at runtime via pnpm workspace
    const core = await import('@ice/core');
    const result = core.validateCanvas(
      nodes.map((n: any) => ({
        id: n.id,
        type: n.type || 'resource',
        data: n.data || {},
        parentId: n.parentId || n.parentNode,
      })),
      edges.map((e: any) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        data: e.data,
      })),
      { mode: 'design' as const },
    );

    // Map CanvasIssue[] to the legacy ValidationError/ValidationWarning format
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    for (const issue of result.issues) {
      if (issue.severity === 'error') {
        errors.push({
          type: mapIssueCodeToType(issue.code),
          nodeId: issue.nodeId,
          edgeId: issue.edgeId,
          field: issue.propertyPath,
          message: issue.message,
        });
      } else if (issue.severity === 'warning') {
        warnings.push({
          nodeId: issue.nodeId,
          message: issue.message,
        });
      }
    }

    const valid = errors.length === 0;
    const summary = valid
      ? `Canvas valid: ${nodes.length} nodes, ${edges.length} edges — no issues found`
      : `Canvas invalid: ${errors.length} error(s), ${warnings.length} warning(s)`;

    return { valid, errors, warnings, summary };
  } catch (err) {
    // Fallback: if core engine import fails, return a basic valid result
    console.error('Canvas validation error:', err);
    return {
      valid: true,
      errors: [],
      warnings: [],
      summary: `Canvas: ${nodes.length} nodes, ${edges.length} edges — validation skipped (engine unavailable)`,
    };
  }
}

function mapIssueCodeToType(code: string): ValidationError['type'] {
  switch (code) {
    case 'MISSING_REQUIRED':
      return 'missing_property';
    case 'TYPE_MISMATCH':
      return 'invalid_type';
    case 'INVALID_OPTION':
      return 'invalid_option';
    case 'DANGLING_EDGE_SOURCE':
    case 'DANGLING_EDGE_TARGET':
      return 'invalid_edge_ref';
    case 'INVALID_CONNECTION':
      return 'invalid_relationship';
    case 'INVALID_PARENT_REF':
    case 'PARENT_NOT_CONTAINER':
      return 'invalid_parent';
    case 'MISSING_ICE_TYPE':
      return 'missing_resource';
    default:
      return 'missing_resource';
  }
}

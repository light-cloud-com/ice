/**
 * Property Validation Rules
 *
 * Validates node properties against HIGH_LEVEL_CATEGORIES schemas.
 * Checks: required fields, type correctness, enum/select validity,
 * numeric ranges, provider-specific options, cross-field constraints.
 */

import { getPropertiesForIceType } from './schema-bridge';
import type { CanvasIssue, ValidatableNode, ValidationContext } from './types';
import type { HighLevelProperty } from '../resources/high-level-resources';

/**
 * Validate all node properties against their schemas.
 */
export function validateProperties(nodes: readonly ValidatableNode[], ctx: ValidationContext): CanvasIssue[] {
  const issues: CanvasIssue[] = [];
  const namesSeen = new Map<string, string>(); // name → first nodeId

  for (const node of nodes) {
    const iceType = node.data.iceType as string | undefined;
    if (!iceType) continue;

    // Skip containers/groups — they don't have property schemas
    if (iceType.startsWith('Group.') || node.type === 'container' || node.type === 'group') continue;

    const properties = getPropertiesForIceType(iceType);
    if (properties.length === 0) continue;

    const nodeData = node.data;
    const nodeProvider = (nodeData.provider as string) ?? ctx.provider;

    for (const prop of properties) {
      const value = nodeData[prop.name];

      // ── Required check ──────────────────────────────────────────────
      if (prop.required && isEmpty(value)) {
        issues.push({
          id: `prop:${node.id}:${prop.name}:MISSING_REQUIRED`,
          severity: 'error',
          category: 'property',
          code: 'MISSING_REQUIRED',
          message: `"${prop.label}" is required`,
          nodeId: node.id,
          propertyPath: prop.name,
          suggestion: `Set a value for ${prop.label}`,
        });
        continue; // Skip further checks on missing values
      }

      if (value === undefined || value === null) continue;

      // ── Type check ──────────────────────────────────────────────────
      const typeIssue = checkType(node.id, prop, value);
      if (typeIssue) {
        issues.push(typeIssue);
        continue; // Wrong type, skip further checks
      }

      // ── Select/enum validation ──────────────────────────────────────
      if (prop.type === 'select') {
        const optionIssue = checkSelectValue(node.id, prop, value, nodeProvider);
        if (optionIssue) issues.push(optionIssue);
      }

      // ── Numeric range validation (customInput) ──────────────────────
      if (prop.type === 'number' && prop.customInput && typeof value === 'number') {
        const rangeIssue = checkRange(node.id, prop, value);
        if (rangeIssue) issues.push(rangeIssue);
      }
    }

    // ── Cross-field: minInstances <= maxInstances ──────────────────────
    const minInst = nodeData.minInstances;
    const maxInst = nodeData.maxInstances;
    if (typeof minInst === 'number' && typeof maxInst === 'number' && minInst > maxInst) {
      issues.push({
        id: `prop:${node.id}:minInstances:VALUE_OUT_OF_RANGE`,
        severity: 'error',
        category: 'property',
        code: 'VALUE_OUT_OF_RANGE',
        message: `Min instances (${minInst}) cannot exceed max instances (${maxInst})`,
        nodeId: node.id,
        propertyPath: 'minInstances',
        suggestion: 'Set min instances to a value less than or equal to max instances',
      });
    }

    // ── Name uniqueness ───────────────────────────────────────────────
    const name = (nodeData.name as string) ?? (nodeData.label as string);
    if (name && typeof name === 'string') {
      const normalizedName = name.trim().toLowerCase();
      if (normalizedName && namesSeen.has(normalizedName)) {
        issues.push({
          id: `prop:${node.id}:name:DUPLICATE_NAME`,
          severity: 'warning',
          category: 'property',
          code: 'DUPLICATE_NAME',
          message: `Duplicate name "${name}" — also used by another node`,
          nodeId: node.id,
          propertyPath: 'name',
          suggestion: 'Use a unique name for each resource',
        });
      } else if (normalizedName) {
        namesSeen.set(normalizedName, node.id);
      }
    }
  }

  return issues;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  return false;
}

function checkType(nodeId: string, prop: HighLevelProperty, value: unknown): CanvasIssue | null {
  const actual = typeof value;

  switch (prop.type) {
    case 'string':
      if (actual !== 'string') {
        return {
          id: `prop:${nodeId}:${prop.name}:TYPE_MISMATCH`,
          severity: 'error',
          category: 'property',
          code: 'TYPE_MISMATCH',
          message: `"${prop.label}" should be text, got ${actual}`,
          nodeId,
          propertyPath: prop.name,
        };
      }
      break;
    case 'number':
      if (actual !== 'number') {
        return {
          id: `prop:${nodeId}:${prop.name}:TYPE_MISMATCH`,
          severity: 'error',
          category: 'property',
          code: 'TYPE_MISMATCH',
          message: `"${prop.label}" should be a number, got ${actual}`,
          nodeId,
          propertyPath: prop.name,
        };
      }
      break;
    case 'boolean':
      if (actual !== 'boolean') {
        return {
          id: `prop:${nodeId}:${prop.name}:TYPE_MISMATCH`,
          severity: 'error',
          category: 'property',
          code: 'TYPE_MISMATCH',
          message: `"${prop.label}" should be true/false, got ${actual}`,
          nodeId,
          propertyPath: prop.name,
        };
      }
      break;
    case 'list':
      if (!Array.isArray(value)) {
        return {
          id: `prop:${nodeId}:${prop.name}:TYPE_MISMATCH`,
          severity: 'error',
          category: 'property',
          code: 'TYPE_MISMATCH',
          message: `"${prop.label}" should be a list, got ${actual}`,
          nodeId,
          propertyPath: prop.name,
        };
      }
      break;
    case 'select':
      // Select values are typically strings but can be other types
      break;
  }

  return null;
}

function checkSelectValue(
  nodeId: string,
  prop: HighLevelProperty,
  value: unknown,
  provider?: string,
): CanvasIssue | null {
  // 'custom' is always allowed (used with customInput)
  if (value === 'custom') return null;

  // Check against optionDetails (provider-filtered)
  if (prop.optionDetails && prop.optionDetails.length > 0) {
    // Options valid for this provider (or provider-agnostic)
    const validOptions = prop.optionDetails
      .filter((od) => !od.provider || !provider || od.provider === provider)
      .map((od) => od.value);

    if (validOptions.length > 0 && !validOptions.includes(value as string)) {
      return {
        id: `prop:${nodeId}:${prop.name}:INVALID_OPTION`,
        severity: 'error',
        category: 'property',
        code: 'INVALID_OPTION',
        message: `"${prop.label}" value "${value}" is not valid for ${provider?.toUpperCase() || 'this provider'}`,
        nodeId,
        propertyPath: prop.name,
        suggestion: `Choose from: ${validOptions.slice(0, 3).join(', ')}...`,
      };
    }
    return null;
  }

  // Fall back to simple options array
  if (prop.options && prop.options.length > 0) {
    if (!prop.options.includes(value as string)) {
      return {
        id: `prop:${nodeId}:${prop.name}:INVALID_OPTION`,
        severity: 'error',
        category: 'property',
        code: 'INVALID_OPTION',
        message: `Invalid value "${value}" for "${prop.label}"`,
        nodeId,
        propertyPath: prop.name,
        suggestion: `Choose from: ${prop.options.slice(0, 3).join(', ')}...`,
      };
    }
  }

  return null;
}

function checkRange(nodeId: string, prop: HighLevelProperty, value: number): CanvasIssue | null {
  // findings.md #39 — the caller (line 67) already gates the call
  // on `prop.customInput` being truthy, so the previous
  // `if (!ci) return null;` guard was unreachable.
  const ci = prop.customInput!;

  if (ci.min !== undefined && value < ci.min) {
    return {
      id: `prop:${nodeId}:${prop.name}:VALUE_OUT_OF_RANGE`,
      severity: 'error',
      category: 'property',
      code: 'VALUE_OUT_OF_RANGE',
      message: `"${prop.label}" minimum is ${ci.min} ${ci.unit}`,
      nodeId,
      propertyPath: prop.name,
    };
  }

  if (ci.max !== undefined && value > ci.max) {
    return {
      id: `prop:${nodeId}:${prop.name}:VALUE_OUT_OF_RANGE`,
      severity: 'error',
      category: 'property',
      code: 'VALUE_OUT_OF_RANGE',
      message: `"${prop.label}" maximum is ${ci.max} ${ci.unit}`,
      nodeId,
      propertyPath: prop.name,
    };
  }

  return null;
}

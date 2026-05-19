/**
 * Pulumi State Parsing Helpers
 *
 * Pure helpers for extracting deployment, stack/project info, secrets
 * detection, and metadata defaults from a parsed Pulumi state object.
 */

import { parse_urn, is_stack_resource } from './type-mapper';
import type { PulumiStackState, PulumiStackExport, PulumiDeployment, PulumiImportMetadata } from './types';

/**
 * Get the deployment from state data.
 *
 * Pulumi exposes two state shapes:
 *   - `PulumiStackExport` — `{ deployment }` (from `pulumi stack export`)
 *   - `PulumiStackState`  — `{ checkpoint: { latest } }` (raw .pulumi/stacks/...)
 *
 * Returns `null` if neither shape contains a deployment.
 */
export function get_deployment(state_data: PulumiStackState | PulumiStackExport): PulumiDeployment | null {
  // Check for export format first
  if ('deployment' in state_data && state_data.deployment) {
    return state_data.deployment;
  }

  // Check for stack state format
  if ('checkpoint' in state_data && state_data.checkpoint?.latest) {
    return state_data.checkpoint.latest;
  }

  return null;
}

/**
 * Get stack and project info from state data.
 *
 * Prefers the `checkpoint.stack` field when present, falling back to parsing
 * the URN of the synthetic Stack resource in the deployment.
 */
export function get_stack_info(state_data: PulumiStackState | PulumiStackExport): {
  stack: string;
  project: string;
} {
  if ('checkpoint' in state_data && state_data.checkpoint) {
    return {
      stack: state_data.checkpoint.stack,
      project: state_data.checkpoint.stack.split('/').pop() ?? 'unknown',
    };
  }

  // Try to get from stack resource
  if ('deployment' in state_data && state_data.deployment?.resources) {
    const stack_resource = state_data.deployment.resources.find((r) => is_stack_resource(r.type));
    if (stack_resource) {
      const parsed = parse_urn(stack_resource.urn);
      if (parsed) {
        return { stack: parsed.stack, project: parsed.project };
      }
    }
  }

  return { stack: 'unknown', project: 'unknown' };
}

/**
 * Extract name from URN when parsing fails.
 *
 * Falls back to the last `::`-delimited segment of the URN.
 */
export function extract_name_from_urn(urn: string): string {
  const parts = urn.split('::');
  return parts[parts.length - 1] ?? urn;
}

/**
 * Check if a value is a Pulumi secret.
 *
 * Pulumi tags secret values with a fixed UUID-shaped sentinel
 * (`4dabf18193072939515e22aab3b80af9` => `1b47061264138c4ac30d75fd1eb44270`).
 * Any object carrying that sentinel is treated as a secret wrapper.
 */
export function is_secret_value(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return obj['4dabf18193072939515e22aab3b80af9'] === '1b47061264138c4ac30d75fd1eb44270';
}

/**
 * Unwrap a Pulumi secret value.
 *
 * Returns `obj.ciphertext` if present, then `obj.plaintext`, then the
 * original value.  Non-secret values are returned unchanged.
 */
export function unwrap_secret(value: unknown): unknown {
  if (!is_secret_value(value)) {
    return value;
  }
  const obj = value as Record<string, unknown>;
  return obj['ciphertext'] ?? obj['plaintext'] ?? value;
}

/**
 * Create empty metadata for error cases.
 *
 * Used when the state file is missing/malformed and we have no real
 * deployment to summarise.
 */
export function create_empty_metadata(): PulumiImportMetadata {
  return {
    pulumi_version: 'unknown',
    stack: 'unknown',
    project: 'unknown',
    deployment_time: new Date().toISOString(),
    resource_count: 0,
    output_count: 0,
    imported_at: new Date().toISOString(),
  };
}

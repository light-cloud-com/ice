/**
 * Cloud Provider Registry
 *
 * Canonical display metadata for cloud providers.
 * Provider IDs align with the schemas `providers` table.
 * Types and data are now imported from @ice/constants.
 */

import { type CloudProviderMeta, CLOUD_PROVIDERS } from '@ice/constants';

export { type CloudProviderMeta, CLOUD_PROVIDERS };

// =============================================================================
// Lookup helpers
// =============================================================================

const providerMap = new Map<string, CloudProviderMeta>(CLOUD_PROVIDERS.map((p) => [p.id, p]));

/** Get full metadata for a provider by ID. */
export function getCloudProvider(id: string): CloudProviderMeta | undefined {
  return providerMap.get(id);
}

/** Get all registered cloud providers. */
export function getAllCloudProviders(): CloudProviderMeta[] {
  return CLOUD_PROVIDERS;
}

/** Get brand color for a provider (falls back to gray). */
export function getCloudProviderColor(id: string): string {
  return providerMap.get(id)?.color ?? '#6b7280';
}

/** Get short display name for a provider (falls back to uppercased id). */
export function getCloudProviderShortName(id: string): string {
  return providerMap.get(id)?.shortName ?? id.toUpperCase();
}

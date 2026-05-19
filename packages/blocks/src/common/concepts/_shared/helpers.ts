/**
 * Concepts Palette — shared helpers
 *
 * Small utilities every concept needs. Keep this file lean — anything
 * domain-specific belongs in the individual concept module.
 */

import type { BlockBlueprint, Provider, ProviderVariant } from '../../../types';

/**
 * Merge provider variants into nodeData for a specific target provider.
 * Variants are sparse — only fields that differ from the base. Returns a
 * flat record with base fields + provider overrides applied.
 */
export function resolveProviderNodeData(
  blueprint: BlockBlueprint,
  provider: Provider | undefined,
): Record<string, unknown> {
  if (!provider || !blueprint.providerVariants) {
    return { ...blueprint.nodeData };
  }
  const variant = blueprint.providerVariants.find((v: ProviderVariant) => v.provider === provider);
  if (!variant || !variant.dataOverrides) {
    return { ...blueprint.nodeData };
  }
  return { ...blueprint.nodeData, ...variant.dataOverrides };
}

/**
 * Check whether a concept blueprint supports a given provider.
 */
export function supportsProvider(blueprint: BlockBlueprint, provider: Provider): boolean {
  return blueprint.providers.includes(provider);
}

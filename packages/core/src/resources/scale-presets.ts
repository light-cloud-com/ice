/**
 * Scale Presets — Default property values for blocks at different traffic/usage tiers.
 *
 * Used by the AI assistant to auto-configure infrastructure blocks based on the
 * expected scale of the application. Each resource ID maps to 6 tiers, and each
 * tier provides property values — with provider-specific overrides for properties
 * like instance sizes that differ across clouds.
 *
 * Usage:
 *   const preset = getScalePreset('postgres-db', 'medium', 'aws');
 *   // → { size: 'db.r6g.large', storage: '100', version: '17', production: true, backup_retention: '14' }
 *
 * Module layout (rf-data-1 split):
 *   - `./scale-presets-types.ts` — types + tier metadata
 *   - `./scale-presets-data.ts`  — bulk SCALE_PRESETS data table (size-exception)
 *   - this file                  — public re-export shim + 2 helpers
 */

import { SCALE_PRESETS } from './scale-presets-data.js';
import { SCALE_TIERS, type ScaleTier } from './scale-presets-types.js';

// Re-exports — public API consumers import from `./scale-presets.js`.
export { SCALE_PRESETS } from './scale-presets-data.js';
export {
  SCALE_TIERS,
  SCALE_TIER_INFO,
  type ScaleTier,
  type TierPreset,
} from './scale-presets-types.js';

// ─── Resolver ──────────────────────────────────────────────────────────────

/**
 * Get the resolved scale preset for a specific resource, tier, and provider.
 * Merges common values with provider-specific overrides.
 */
export function getScalePreset(resourceId: string, tier: ScaleTier, provider: string): Record<string, unknown> {
  const preset = SCALE_PRESETS[resourceId]?.[tier];
  if (!preset) return {};
  const { _providers, ...common } = preset;
  const providerOverrides = _providers?.[provider] || {};
  return { ...common, ...providerOverrides };
}

/**
 * Get all presets for a resource across all tiers (for a specific provider).
 * Useful for showing the AI all available options at once.
 */
export function getAllPresetsForResource(
  resourceId: string,
  provider: string,
): Record<ScaleTier, Record<string, unknown>> {
  const result = {} as Record<ScaleTier, Record<string, unknown>>;
  for (const tier of SCALE_TIERS) {
    result[tier] = getScalePreset(resourceId, tier, provider);
  }
  return result;
}

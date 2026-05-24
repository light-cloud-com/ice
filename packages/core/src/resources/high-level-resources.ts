/**
 * High-Level Resource Definitions — public re-export shim.
 *
 * User-friendly abstractions over low-level cloud resources. Users work with
 * these concepts, and ICE maps them to actual cloud resources.
 *
 * Module layout (rf-hlres split):
 *   - `./high-level-resources/types.ts`              — type interfaces (rf-hlres-1)
 *   - `./high-level-resources/categories/<name>.ts`  — per-category data, byte-identical to the
 *                                                      pre-split inline literals (rf-hlres-2..7,
 *                                                      data-heavy size exception)
 *   - `./high-level-resources/helpers.ts`            — `HIGH_LEVEL_CATEGORIES` assembly,
 *                                                      lookup helpers, and GCP Cloud Asset
 *                                                      mapping (rf-hlres-8)
 *   - this file                                      — re-export shim (rf-hlres-9)
 *
 * The runtime origin of `HIGH_LEVEL_CATEGORIES` is `helpers.ts` because the
 * cloud-asset helpers (`getGCPCloudAssetTypes`, `cloudAssetToHighLevelType`)
 * iterate over the categories — making `helpers.ts` the runtime owner avoids
 * a `helpers → orchestrator → helpers` cycle.
 *
 * Public consumers should keep importing from `'./high-level-resources.js'`
 * (or `@ice/core/resources`); every symbol this file used to declare is
 * re-exported here under the same name.
 */

// ─── Type re-exports ────────────────────────────────────────────────────────
export type {
  DeployExpansion,
  HighLevelCategory,
  HighLevelProperty,
  HighLevelResource,
  NodeBehavior,
  OptionDetail,
  ProviderImplementation,
} from './high-level-resources/types';

// ─── Runtime re-exports ─────────────────────────────────────────────────────
export {
  HIGH_LEVEL_CATEGORIES,
  cloudAssetToHighLevelType,
  filterResourcesByProvider,
  getAllHighLevelResources,
  getBehaviorColor,
  getBehaviorLabel,
  getGCPCloudAssetTypes,
  getHighLevelResourceByIceType,
  getHighLevelResourcesForPalette,
} from './high-level-resources/helpers';

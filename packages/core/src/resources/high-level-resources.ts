/**
 * High-Level Resource Definitions
 *
 * User-friendly abstractions over low-level cloud resources.
 * Users work with these concepts, and ICE maps them to actual cloud resources.
 *
 * Module layout (rf-hlres split — in progress):
 *   - `./high-level-resources/types.ts`              — interfaces + NodeBehavior re-export (rf-hlres-1)
 *   - `./high-level-resources/categories/<name>.ts`  — per-category data (rf-hlres-2..7, size exception)
 *   - `./high-level-resources/helpers.ts`            — `HIGH_LEVEL_CATEGORIES` assembly + lookup helpers + GCP Cloud Asset mapping (rf-hlres-8)
 *   - this file                                      — public re-export shim (slimmed in rf-hlres-9)
 *
 * The runtime origin of `HIGH_LEVEL_CATEGORIES` is `helpers.ts` because the
 * cloud-asset helpers (`getGCPCloudAssetTypes`, `cloudAssetToHighLevelType`)
 * iterate over the categories — making the helpers the runtime owner avoids
 * a `helpers → orchestrator → helpers` cycle.
 */

export type { NodeBehavior } from './high-level-resources/types.js';
export type {
  HighLevelCategory,
  HighLevelProperty,
  HighLevelResource,
  OptionDetail,
  ProviderImplementation,
} from './high-level-resources/types.js';

export {
  HIGH_LEVEL_CATEGORIES,
  cloudAssetToHighLevelType,
  filterResourcesByProvider,
  getAllHighLevelResources,
  getBehaviorColor,
  getBehaviorLabel,
  getGCPCloudAssetTypes,
  getHighLevelResourcesForPalette,
} from './high-level-resources/helpers.js';

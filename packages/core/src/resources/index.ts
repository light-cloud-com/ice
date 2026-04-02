/**
 * Browser-safe resources exports.
 *
 * This barrel file only exports modules that are safe to use in the
 * browser renderer (no Node.js APIs like fs, path, child_process).
 * Import as: import { ... } from '@ice/core/resources'
 */

// Cloud provider registry
export {
  CLOUD_PROVIDERS,
  getCloudProvider,
  getAllCloudProviders,
  getCloudProviderColor,
  getCloudProviderShortName,
  type CloudProviderMeta,
} from './cloud-providers.js';

// Blueprint factory
export {
  createBlueprintFromResource,
  type BlueprintProvider,
  type BlueprintProviderVariant,
  type BlueprintOverrides,
  type GeneratedBlueprint,
} from './blueprint-factory.js';

// High-level resource definitions
export {
  HIGH_LEVEL_CATEGORIES,
  getAllHighLevelResources,
  getHighLevelResourcesForPalette,
  filterResourcesByProvider,
  getBehaviorLabel,
  getBehaviorColor,
  type HighLevelResource,
  type HighLevelProperty,
  type HighLevelCategory,
  type NodeBehavior,
  type ProviderImplementation,
} from './high-level-resources.js';

// Scale presets — AI assistant uses these for auto-configuration
export {
  SCALE_PRESETS,
  SCALE_TIERS,
  SCALE_TIER_INFO,
  getScalePreset,
  getAllPresetsForResource,
  type ScaleTier,
  type TierPreset,
} from './scale-presets.js';

// Cloud blocks
export {
  BLOCK_TEMPLATES,
  BLOCK_CATEGORIES,
  getBlockTemplate,
  createBlockFromTemplate,
  getBlockTypeTag,
  getProviderIcon,
  formatUptime,
  type CloudBlock,
  type BlockType,
  type BlockStatus,
  type CloudProvider,
  type BlockSource,
  type BlockDeployment,
  type BlockConfig,
  type BlockTemplate,
  type EnvVar,
} from './cloud-blocks.js';

/**
 * @ice/constants
 *
 * Shared constants for the ICE monorepo.
 * Zero external dependencies — leaf package.
 */

export {
  type Provider,
  ALL_PROVIDERS,
  DEFAULT_TEMPLATE_PROVIDERS,
  type CloudProviderMeta,
  CLOUD_PROVIDERS,
} from './providers.js';

export {
  Cat,
  type NodeCategory,
  type ResourceEntry,
  TREE,
  ICE,
} from './ice-types.js';

export {
  ICE_TYPE_TO_RESOURCE_ID,
  VALID_TEMPLATE_ICE_TYPES,
  PREFIX_TO_CATEGORY,
  TYPE_TO_CATEGORY,
  REQUIRED_PROPS,
  DEFAULT_PORTS,
  DEFAULT_ENV_VARS,
} from './derived.js';

export {
  CARD_WIDTH,
  CARD_HEIGHT,
  HEADER_HEIGHT,
  CONTAINER_PADDING,
  CHILD_GAP,
  GROUP_GAP,
  groupWidth,
  groupHeight,
} from './grid.js';

export {
  type ConnectionCategory,
  CATEGORY_COLORS,
  CATEGORY_TO_RELATIONSHIP,
} from './connections.js';

export {
  type NodeBehavior,
  BEHAVIOR_LABELS,
  BEHAVIOR_COLORS,
  type SecurityLevel,
  SECURITY_LEVEL_COLORS,
} from './node-traits.js';

export {
  type TemplateCategory,
  type TemplateCategoryMeta,
  TEMPLATE_CATEGORIES,
  type TemplateDifficulty,
  type TemplateTrust,
  type ComplianceTag,
  GROUP_COLORS,
} from './templates.js';

export {
  LEVEL_VISIBLE_CATEGORIES,
  NETWORK_CONTAINER_TYPES,
  L1_VISIBLE_NETWORK_TYPES,
} from './categories.js';

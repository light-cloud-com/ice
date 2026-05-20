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
  type ProviderReadiness,
  PROVIDER_READINESS,
} from './providers';

export {
  type ProviderFlags,
  PROVIDER_FLAGS,
  isProviderEnabled,
  isCategoryEnabledForProvider,
  isIceTypeEnabledForProvider,
  getEnabledProvidersForCategory,
  ENABLED_PROVIDER_IDS,
  ENABLED_PROVIDERS,
} from './feature-flags';

export {
  buildHeaderPrompt,
  buildIntentRoutingPrompt,
  buildOperationsPrompt,
  buildPropertyPrefillPrompt,
  buildOptimizationGuidelinesPrompt,
  buildCanvasContextPrompt,
  buildContainerNetworkingPrompt,
  buildCloudArchitectPrompt,
  DIAGNOSE_DEPLOY_SYSTEM_PROMPT,
  AI_PROMPT_REGISTRY,
} from './ai';

export { Cat, type NodeCategory, type ResourceEntry, TREE, ICE } from './ice-types';

export {
  ICE_TYPE_TO_RESOURCE_ID,
  VALID_TEMPLATE_ICE_TYPES,
  PREFIX_TO_CATEGORY,
  TYPE_TO_CATEGORY,
  REQUIRED_PROPS,
  DEFAULT_PORTS,
  DEFAULT_ENV_VARS,
} from './derived';

export {
  CARD_WIDTH,
  CARD_HEIGHT,
  HEADER_HEIGHT,
  CONTAINER_PADDING,
  CHILD_GAP,
  GROUP_GAP,
  LAYOUT_NODE_SEP,
  LAYOUT_RANK_SEP,
  LAYOUT_MARGIN,
  LAYOUT_GRID_STEP,
  PRIVATE_NETWORK_MIN_WIDTH,
  PRIVATE_NETWORK_MIN_HEIGHT,
  PN_HEADER_HEIGHT,
  CD_EXTRA_WIDTH,
  CD_HEADER_HEIGHT,
  CD_DOMAIN_FIELD_HEIGHT,
  CD_ROUTE_ROW_HEIGHT,
  CD_ROUTE_ROW_GAP,
  CD_PADDING,
  CD_ADD_BUTTON_HEIGHT,
  MQ_HEADER_HEIGHT,
  MQ_ROW_HEIGHT,
  MQ_ROW_GAP,
  MQ_PADDING,
  SS_HEADER_HEIGHT,
  SS_ROW_HEIGHT,
  SS_PADDING,
  EC_HEADER_HEIGHT,
  EC_ROW_HEIGHT,
  EC_PADDING,
  ES_HEADER_HEIGHT,
  ES_FIELD_HEIGHT,
  ES_PADDING,
  ST_HEADER_HEIGHT,
  ST_BODY_HEIGHT,
  ST_PADDING,
  CRON_HEADER_HEIGHT,
  CRON_BODY_PADDING_TOP,
  CRON_BODY_PADDING_BOTTOM,
  CRON_TASK_ROW_HEIGHT,
  CRON_TASK_ROW_GAP,
  CRON_MIN_TASK_ROWS,
  DB_HEADER_HEIGHT,
  DB_BODY_HEIGHT,
  DB_PADDING,
  COMPUTE_HEADER_HEIGHT,
  COMPUTE_BODY_HEIGHT,
  COMPUTE_PADDING,
  BUCKET_HEADER_HEIGHT,
  BUCKET_BODY_HEIGHT,
  BUCKET_PADDING,
  AG_HEADER_HEIGHT,
  AG_ROW_HEIGHT,
  AG_ROW_GAP,
  AG_PADDING,
  CARD_FOOTER_HEIGHT,
  BLOCK_SUMMARY_W,
  BLOCK_SUMMARY_H,
  SIDEBAR_WIDTH,
  GROUP_NODE_MIN_WIDTH,
  GROUP_NODE_FOLDED_HEIGHT,
  groupWidth,
  groupHeight,
} from './grid';

export { type ConnectionCategory, CATEGORY_COLORS, CATEGORY_TO_RELATIONSHIP } from './connections';

export {
  type NodeBehavior,
  BEHAVIOR_LABELS,
  BEHAVIOR_COLORS,
  type SecurityLevel,
  SECURITY_LEVEL_COLORS,
} from './node-traits';

export {
  type TemplateCategory,
  type TemplateCategoryMeta,
  TEMPLATE_CATEGORIES,
  type TemplateDifficulty,
  type TemplateTrust,
  type ComplianceTag,
  GROUP_COLORS,
} from './templates';

export {
  LEVEL_VISIBLE_CATEGORIES,
  NETWORK_CONTAINER_TYPES,
  L1_VISIBLE_NETWORK_TYPES,
  CATEGORY_IDS,
  type CategoryId,
  ICE_TYPE_TO_CATEGORY_ID,
  getCategoryForIceType,
} from './categories';

/**
 * @ice/constants
 *
 * Shared constants for the ICE monorepo.
 * Zero external dependencies — leaf package.
 */
export { type Provider, ALL_PROVIDERS, DEFAULT_TEMPLATE_PROVIDERS, type CloudProviderMeta, CLOUD_PROVIDERS, PROVIDER_LABELS, PROVIDER_PROJECT_LABELS, PROVIDER_CONSOLE_BASE, GCP_OAUTH_SCOPES, } from './providers.js';
export { PROVIDER_REGIONS, PROVIDER_REGION_LABELS, REGION_SUGGESTION_ORDER } from './regions.js';
export { Cat, type NodeCategory, type ResourceEntry, TREE, ICE } from './ice-types.js';
export { ICE_TYPE_TO_RESOURCE_ID, VALID_TEMPLATE_ICE_TYPES, PREFIX_TO_CATEGORY, TYPE_TO_CATEGORY, REQUIRED_PROPS, DEFAULT_PORTS, DEFAULT_ENV_VARS, } from './derived.js';
export { CARD_WIDTH, CARD_HEIGHT, HEADER_HEIGHT, CONTAINER_PADDING, CHILD_GAP, GROUP_GAP, LAYOUT_NODE_SEP, LAYOUT_RANK_SEP, LAYOUT_MARGIN, LAYOUT_GRID_STEP, PRIVATE_NETWORK_MIN_WIDTH, PRIVATE_NETWORK_MIN_HEIGHT, groupWidth, groupHeight, } from './grid.js';
export { type ConnectionCategory, CATEGORY_COLORS, CATEGORY_TO_RELATIONSHIP } from './connections.js';
export { type NodeBehavior, BEHAVIOR_LABELS, BEHAVIOR_COLORS, type SecurityLevel, SECURITY_LEVEL_COLORS, } from './node-traits.js';
export { type TemplateCategory, type TemplateCategoryMeta, TEMPLATE_CATEGORIES, type TemplateDifficulty, type TemplateTrust, type ComplianceTag, GROUP_COLORS, DEFAULT_GROUP_COLOR, DEFAULT_GROUP_OPACITY, } from './templates.js';
export { LEVEL_VISIBLE_CATEGORIES, NETWORK_CONTAINER_TYPES, L1_VISIBLE_NETWORK_TYPES } from './categories.js';
export { DEFAULT_PROVIDER, DEFAULT_REGION, DEFAULT_ENVIRONMENT, DEFAULT_DISPLAY_PROVIDER, DEFAULT_BRANCH, DEFAULT_PIPELINE_ENVIRONMENT, type DeployActionType, type DeployRowStatus, TERMINAL_DEPLOY_ACTIONS, TERMINAL_DEPLOY_STATUSES, DEPLOY_ACTION_LABELS, DEPLOY_ACTION_COLOR_CLASSES, } from './deploy.js';
export { COLORS, type ColorToken, BRAND_COLORS, type BrandColorToken } from './colors.js';
export { type ProjectRole, type ProjectRoleDef, PROJECT_ROLES, PROJECT_ROLE_LEVEL, type OrgRole, type OrgRoleDef, ORG_ROLES, INVITABLE_ORG_ROLES, } from './roles.js';
export { STORAGE_GB_BY_TIER, REQUESTS_M_BY_TIER, TIER_SCALE_FACTOR, COST_CATEGORY_LABELS, ICE_PREFIX_TO_COST_CATEGORY, type EgressRate, EGRESS_RATES, } from './cost.js';
export { GCP_BASE_APIS, GCP_ICE_TYPE_API_MAP, GCP_API_NOT_ENABLED_PATTERNS } from './gcp.js';

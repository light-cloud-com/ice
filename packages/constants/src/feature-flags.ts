/**
 * Feature Flags
 *
 * Per-provider toggles and per-(category × provider) overrides that gate
 * UI surfaces: palette, wizard, onboarding, app bar, settings, canvas
 * menus, template badges, status dots, deploy validation.
 *
 * Each provider has a top-level `enabled` toggle and an exhaustive
 * per-category map. To gate a (provider, category) combo, flip its
 * boolean. Top-level `enabled: false` short-circuits everything — the
 * category map for that provider is ignored.
 *
 * The category list is the user-facing palette partition (see
 * `categories.ts`, `CATEGORY_IDS`). An integrity test asserts every
 * provider's `categories` map covers every CategoryId.
 */

import { CATEGORY_IDS, getCategoryForIceType, type CategoryId } from './categories';
import { ALL_PROVIDERS, CLOUD_PROVIDERS, type CloudProviderMeta, type Provider } from './providers';

export interface ProviderFlags {
  enabled: boolean;
  categories: Record<CategoryId, boolean>;
}

function allCategoriesOff(): Record<CategoryId, boolean> {
  return Object.fromEntries(CATEGORY_IDS.map((c) => [c, false])) as Record<CategoryId, boolean>;
}

function allCategoriesOn(): Record<CategoryId, boolean> {
  return Object.fromEntries(CATEGORY_IDS.map((c) => [c, true])) as Record<CategoryId, boolean>;
}

function categoriesFromOnList(on: CategoryId[]): Record<CategoryId, boolean> {
  const set = new Set(on);
  return Object.fromEntries(CATEGORY_IDS.map((c) => [c, set.has(c)])) as Record<CategoryId, boolean>;
}

export const PROVIDER_FLAGS: Record<Provider, ProviderFlags> = {
  // AWS staged rollout. Categories left off have a concrete unblocker;
  // see `packages/core/src/deploy/providers/aws/README.md` → Rollout state.
  //   off — Compute:    ECS needs canvas-driven VPC/subnet/SG blocks (deferred).
  //   off — Frontend:   StaticSite+CloudFront combo needs us-east-1 cert validation flow.
  //   off — Scheduler:  EventBridge schedule expression wiring not finished.
  //   off — Network:    ELBv2 needs VPC blocks; CloudFront is create-only.
  //   off — Database:   RDS works but slow + no update path; DynamoDB-only deploys are fine
  //                     once a sub-category gate exists, today the whole bucket stays off.
  //   off — AI:         Bedrock is a no-op; SageMaker only has mocked-SDK coverage.
  //   off — Analytics:  Redshift + OpenSearch are create-only.
  aws: {
    enabled: true,
    categories: categoriesFromOnList(['Storage', 'Messaging', 'Cache', 'Monitoring', 'Security', 'Source', 'Config']),
  },
  gcp: {
    enabled: true,
    categories: allCategoriesOn(),
  },
  azure: {
    enabled: false,
    categories: allCategoriesOff(),
  },
  kubernetes: {
    enabled: false,
    categories: allCategoriesOff(),
  },
  alibaba: {
    enabled: false,
    categories: allCategoriesOff(),
  },
  oci: {
    enabled: false,
    categories: allCategoriesOff(),
  },
  digitalocean: {
    enabled: false,
    categories: allCategoriesOff(),
  },
  ibm: {
    enabled: false,
    categories: allCategoriesOff(),
  },
};

// ── Public API ──────────────────────────────────────────────────────────────

export function isProviderEnabled(p: Provider | string): boolean {
  return PROVIDER_FLAGS[p as Provider]?.enabled === true;
}

export function isCategoryEnabledForProvider(category: CategoryId, p: Provider | string): boolean {
  const cfg = PROVIDER_FLAGS[p as Provider];
  return cfg?.enabled === true && cfg.categories[category] === true;
}

/**
 * Resolve (iceType, provider) → enabled.
 *
 * Returns `true` if the provider is on AND the iceType's category is on.
 * iceTypes that don't map to any CategoryId (unknown shape) are treated
 * as ungated — only the provider-level flag applies.
 */
export function isIceTypeEnabledForProvider(iceType: string, p: Provider | string): boolean {
  if (!isProviderEnabled(p)) return false;
  const category = getCategoryForIceType(iceType);
  if (!category) return true;
  return isCategoryEnabledForProvider(category, p);
}

export function getEnabledProvidersForCategory(category: CategoryId): Provider[] {
  return ALL_PROVIDERS.filter((p) => isCategoryEnabledForProvider(category, p));
}

// ── Derived lists used by the UI ───────────────────────────────────────────

export const ENABLED_PROVIDER_IDS: ReadonlySet<string> = new Set<string>(ALL_PROVIDERS.filter(isProviderEnabled));

export const ENABLED_PROVIDERS: CloudProviderMeta[] = CLOUD_PROVIDERS.filter((p) => isProviderEnabled(p.id));

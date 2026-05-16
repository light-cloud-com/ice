/**
 * Template Registry
 *
 * Central barrel file — imports all templates and exposes
 * lookup helpers + the expansion function.
 *
 * Slice 6 of the Concepts Palette redesign trimmed this from 22 templates
 * (+ quick-starts) down to 11 core templates. Removed templates (healthcare,
 * fintech, ecommerce, mobile-backend, iot, gaming, logistics, education,
 * media, devops-platform, data-pipeline) were deleted outright — see
 * docs/backlog/concepts-palette-implementation.md Slice 6.
 */

export type {
  GCPTemplate,
  SecurityLevel,
  EnvironmentPreset,
  ComposedTemplate,
  TemplateBlock,
  TemplateConnection,
  TemplateCategory,
  TemplateCategoryMeta,
  TemplateDifficulty,
  TemplateTrust,
  ComplianceTag,
  TemplateAuthor,
  TemplateRepo,
} from './types';
export { TEMPLATE_CATEGORIES } from './types';
export { expandComposedTemplate } from './expand-template';
export { QUICK_STARTS } from './quick-starts';
export { fullStackTemplate } from './full-stack';
export { aiMlTemplate } from './ai-ml';
export { ragChatbotTemplate } from './rag-chatbot';
export { euComplianceTemplate } from './eu-compliance';
export { saasStarterTemplate } from './saas-starter';
export { backendApiTemplate, microservicesTemplate } from './backend-api';
export { serverlessApiTemplate, eventDrivenServerlessTemplate } from './serverless-api';
export { secureApiTemplate } from './secure-api';
export { budgetWebAppTemplate } from './budget-webapp';
export { saasMultiTenantTemplate, saasAnalyticsDashboardTemplate } from './saas-platform';

import { getBlueprint } from '@ice/blocks';
import { aiMlTemplate } from './ai-ml';
import { backendApiTemplate, microservicesTemplate } from './backend-api';
import { budgetWebAppTemplate } from './budget-webapp';
import { euComplianceTemplate } from './eu-compliance';
import { fullStackTemplate } from './full-stack';
import { QUICK_STARTS } from './quick-starts';
import { ragChatbotTemplate } from './rag-chatbot';
import { saasMultiTenantTemplate, saasAnalyticsDashboardTemplate } from './saas-platform';
import { saasStarterTemplate } from './saas-starter';
import { secureApiTemplate } from './secure-api';
import { serverlessApiTemplate, eventDrivenServerlessTemplate } from './serverless-api';
import { TEMPLATE_CATEGORIES } from './types';
import type { ComposedTemplate, TemplateCategory } from './types';
import type { Provider } from '@ice/blocks';

// =============================================================================
// Registry
// =============================================================================

/**
 * All composed templates (excluding quick-starts). Kept small and focused
 * after the Slice 6 cut — 13 templates total (11 named + 2 paired variants).
 */
export const COMPOSED_TEMPLATES: ComposedTemplate[] = [
  fullStackTemplate,
  aiMlTemplate,
  ragChatbotTemplate,
  euComplianceTemplate,
  saasStarterTemplate,
  backendApiTemplate,
  microservicesTemplate,
  serverlessApiTemplate,
  eventDrivenServerlessTemplate,
  secureApiTemplate,
  budgetWebAppTemplate,
  saasMultiTenantTemplate,
  saasAnalyticsDashboardTemplate,
];

/** All templates — composed + quick-starts — single source of truth */
export const ALL_TEMPLATES: ComposedTemplate[] = [...QUICK_STARTS, ...COMPOSED_TEMPLATES];

// =============================================================================
// Lookup helpers
// =============================================================================

/** Fast lookup map: id → template */
const templateMap = new Map<string, ComposedTemplate>(ALL_TEMPLATES.map((t) => [t.id, t]));

/** Get a single template by ID */
export function getTemplate(id: string): ComposedTemplate | undefined {
  return templateMap.get(id);
}

/** Get templates filtered by category */
export function getTemplatesByCategory(category: TemplateCategory): ComposedTemplate[] {
  return ALL_TEMPLATES.filter((t) => t.category === category);
}

/** Get categories that have at least one template */
export function getActiveCategories(): TemplateCategory[] {
  const active = new Set(ALL_TEMPLATES.map((t) => t.category));
  return TEMPLATE_CATEGORIES.filter((c) => active.has(c.id)).map((c) => c.id);
}

/** Get featured templates */
export function getFeaturedTemplates(): ComposedTemplate[] {
  return ALL_TEMPLATES.filter((t) => t.featured);
}

/** Search templates by query string (matches name, description, tags, category) */
export function searchTemplates(query: string, templates: ComposedTemplate[] = ALL_TEMPLATES): ComposedTemplate[] {
  if (!query.trim()) return templates;
  const q = query.toLowerCase();
  return templates.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.tags.some((tag) => tag.toLowerCase().includes(q)) ||
      t.category.toLowerCase().includes(q),
  );
}

/** Provider compatibility result for a single template */
export interface TemplateCompatibility {
  template: ComposedTemplate;
  supported: number;
  total: number;
  unsupported: string[];
}

/** Check how many blocks in a template support the selected provider */
export function getProviderCompatibility(template: ComposedTemplate, provider: Provider): TemplateCompatibility {
  let supported = 0;
  const unsupported: string[] = [];
  for (const block of template.blocks) {
    const bp = getBlueprint(block.iceType);
    if (bp && bp.providers.includes(provider)) {
      supported++;
    } else {
      unsupported.push(block.label || block.iceType);
    }
  }
  return { template, supported, total: template.blocks.length, unsupported };
}

/** Filter templates with provider compatibility info */
export function filterByProvider(templates: ComposedTemplate[], provider: Provider): TemplateCompatibility[] {
  return templates.map((t) => getProviderCompatibility(t, provider));
}

/**
 * Return the subset of a template's declared providers that still have at
 * least one supported block under the active feature flags.
 *
 * Because `getBlueprint(iceType, provider)` honors `PROVIDER_FLAGS` and the
 * (category × provider) gate, a provider whose blocks all fail to resolve
 * naturally drops out of this list. Used by the gallery to hide badges /
 * picker tiles for providers that can't actually run the template.
 */
export function getEnabledProvidersForTemplate(template: ComposedTemplate): Provider[] {
  if (!template.providers) return [];
  return template.providers.filter((p) =>
    template.blocks.some((b) => getBlueprint(b.iceType, p) !== undefined),
  );
}

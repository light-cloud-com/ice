/**
 * Templates — Re-export from split files
 *
 * This file is kept for backward compatibility.
 * All template data now lives in config/templates/*.ts
 */

export {
  GCP_TEMPLATES,
  COMPOSED_TEMPLATES,
  ALL_TEMPLATES,
  expandComposedTemplate,
  getTemplate,
  getTemplatesByCategory,
  getActiveCategories,
  searchTemplates,
  getProviderCompatibility,
  filterByProvider,
  TEMPLATE_CATEGORIES,
} from './templates/index';
export type {
  GCPTemplate,
  SecurityLevel,
  EnvironmentPreset,
  ComposedTemplate,
  TemplateBlock,
  TemplateConnection,
  TemplateCategory,
  TemplateCategoryMeta,
} from './templates/types';

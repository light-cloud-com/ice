/**
 * Template Registry — Re-exports from @ice/templates
 *
 * Single source of truth lives in packages/templates.
 * This barrel re-exports everything so existing UI imports keep working.
 */

export {
  // Registry & helpers
  ALL_TEMPLATES,
  COMPOSED_TEMPLATES,
  QUICK_STARTS,
  TEMPLATE_CATEGORIES,
  getTemplate,
  getTemplatesByCategory,
  getActiveCategories,
  getFeaturedTemplates,
  searchTemplates,
  getProviderCompatibility,
  filterByProvider,
  // Expansion
  expandComposedTemplate,
  // Individual templates
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
  healthcarePatientPortalTemplate,
  healthcareTelemedicineTemplate,
  fintechPaymentGatewayTemplate,
  fintechTradingPlatformTemplate,
  mediaStreamingTemplate,
  mediaPodcastTemplate,
  saasMultiTenantTemplate,
  saasAnalyticsDashboardTemplate,
  iotDeviceManagementTemplate,
  iotSmartHomeTemplate,
  gamingMultiplayerTemplate,
  gamingMobileGameTemplate,
  logisticsFleetTrackingTemplate,
  logisticsWarehouseTemplate,
  educationLmsTemplate,
  educationExamPlatformTemplate,
  etlPipelineTemplate,
  eventStreamingTemplate,
  ecommerceStoreTemplate,
  ecommerceMarketplaceTemplate,
  mobileAppBackendTemplate,
  mobileSocialAppTemplate,
  devopsMonitoringTemplate,
  devopsCiCdTemplate,
} from '@ice/templates';

// Re-export types
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
  TemplateCompatibility,
} from '@ice/templates';

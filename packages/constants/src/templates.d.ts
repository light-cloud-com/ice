/**
 * Template Constants
 *
 * Template categories, difficulty levels, trust levels, compliance tags,
 * and group color conventions used in template definitions.
 */
export type TemplateCategory = 'quick-start' | 'full-stack' | 'backend' | 'data-pipeline' | 'ai-ml' | 'compliance' | 'devops' | 'e-commerce' | 'mobile' | 'serverless' | 'healthcare' | 'fintech' | 'media' | 'saas' | 'iot' | 'gaming' | 'logistics' | 'education';
export interface TemplateCategoryMeta {
    id: TemplateCategory;
    label: string;
    description: string;
    icon: string;
    color: string;
}
export declare const TEMPLATE_CATEGORIES: TemplateCategoryMeta[];
export type TemplateDifficulty = 'starter' | 'intermediate' | 'advanced' | 'expert';
export type TemplateTrust = 'official' | 'verified' | 'community';
export type ComplianceTag = 'gdpr' | 'soc2' | 'hipaa' | 'pci-dss' | 'iso27001';
/**
 * Default group/container fill color. Used whenever a freshly-created
 * group doesn't have its own brand color yet, and as the icon-tint
 * fallback for category/template displays.
 */
export declare const DEFAULT_GROUP_COLOR: "#3b82f6";
/**
 * Default container fill opacity. The two slightly-different LOD-specific
 * values (0.09 / 0.12) are zoom-level tweaks — keep them inline at the
 * call site; this constant is the "no zoom adjustment" baseline used by
 * the properties panel and the LOD-3 fallback path.
 */
export declare const DEFAULT_GROUP_OPACITY = 0.1;
/** Standard colors for well-known group labels in templates. */
export declare const GROUP_COLORS: Record<string, string>;

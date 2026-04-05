/**
 * Template Constants
 *
 * Template categories, difficulty levels, trust levels, compliance tags,
 * and group color conventions used in template definitions.
 */

export type TemplateCategory =
  | 'quick-start'
  | 'full-stack'
  | 'backend'
  | 'data-pipeline'
  | 'ai-ml'
  | 'compliance'
  | 'devops'
  | 'e-commerce'
  | 'mobile'
  | 'serverless'
  | 'healthcare'
  | 'fintech'
  | 'media'
  | 'saas'
  | 'iot'
  | 'gaming'
  | 'logistics'
  | 'education';

export interface TemplateCategoryMeta {
  id: TemplateCategory;
  label: string;
  description: string;
  icon: string;
  color: string;
}

export const TEMPLATE_CATEGORIES: TemplateCategoryMeta[] = [
  { id: 'quick-start', label: 'Quick Starts', description: 'Minimal starters to get going fast', icon: 'Zap', color: '#f59e0b' },
  { id: 'full-stack', label: 'Full Stack', description: 'Complete application stacks', icon: 'Rocket', color: '#3b82f6' },
  { id: 'backend', label: 'Backend & API', description: 'API services and microservices', icon: 'Server', color: '#22c55e' },
  { id: 'serverless', label: 'Serverless', description: 'Functions-first architectures', icon: 'Zap', color: '#06b6d4' },
  { id: 'data-pipeline', label: 'Data Pipelines', description: 'Event-driven and batch processing', icon: 'Activity', color: '#8b5cf6' },
  { id: 'ai-ml', label: 'AI & ML', description: 'Machine learning and AI workloads', icon: 'Brain', color: '#ec4899' },
  { id: 'e-commerce', label: 'E-Commerce', description: 'Online store and marketplace patterns', icon: 'ShoppingCart', color: '#f97316' },
  { id: 'mobile', label: 'Mobile Backend', description: 'Mobile app backend patterns', icon: 'Smartphone', color: '#14b8a6' },
  { id: 'compliance', label: 'Compliance', description: 'Security and regulatory focused', icon: 'ShieldCheck', color: '#10b981' },
  { id: 'devops', label: 'DevOps', description: 'CI/CD, monitoring, and platform tooling', icon: 'GitBranch', color: '#64748b' },
  { id: 'healthcare', label: 'Healthcare', description: 'HIPAA-compliant patient data and clinical systems', icon: 'Heart', color: '#ef4444' },
  { id: 'fintech', label: 'Fintech & Banking', description: 'Payment processing, transactions, and compliance', icon: 'Landmark', color: '#0ea5e9' },
  { id: 'media', label: 'Media & Streaming', description: 'Video, audio, and content delivery platforms', icon: 'Play', color: '#a855f7' },
  { id: 'saas', label: 'SaaS', description: 'Multi-tenant software-as-a-service platforms', icon: 'Cloud', color: '#6366f1' },
  { id: 'iot', label: 'IoT', description: 'Device management and telemetry ingestion', icon: 'Cpu', color: '#84cc16' },
  { id: 'gaming', label: 'Gaming', description: 'Game servers, leaderboards, and real-time systems', icon: 'Gamepad2', color: '#f43f5e' },
  { id: 'logistics', label: 'Logistics & Supply Chain', description: 'Fleet tracking, inventory, and warehouse management', icon: 'Truck', color: '#78716c' },
  { id: 'education', label: 'Education', description: 'Learning platforms, course management, and assessments', icon: 'GraduationCap', color: '#2563eb' },
];

export type TemplateDifficulty = 'starter' | 'intermediate' | 'advanced' | 'expert';
export type TemplateTrust = 'official' | 'verified' | 'community';
export type ComplianceTag = 'gdpr' | 'soc2' | 'hipaa' | 'pci-dss' | 'iso27001';

/** Standard colors for well-known group labels in templates. */
export const GROUP_COLORS: Record<string, string> = {
  'Public Zone': '#ef4444',
  VPC: '#22c55e',
  'Public Subnet': '#3b82f6',
  'Private Subnet': '#6366f1',
  Monitoring: '#f59e0b',
  'Security Controls': '#8b5cf6',
  Async: '#8b5cf6',
  'Platform Services': '#64748b',
};

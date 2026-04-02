/**
 * Template Types
 *
 * Shared type definitions for infrastructure templates.
 */

export interface CardNode {
  id: string;
  type: 'block' | 'resource' | 'container';
  position: { x: number; y: number };
  width: number;
  height: number;
  parentId?: string;
  data: Record<string, unknown>;
}

export interface CardEdge {
  id: string;
  source: string;
  target: string;
  data?: { relationship?: string; [key: string]: unknown };
}

export type SecurityLevel = 'basic' | 'standard' | 'strict' | 'compliance';

// =============================================================================
// Template Categories
// =============================================================================

/** Template categories for library organization */
export type TemplateCategory = 'full-stack' | 'backend' | 'data-pipeline' | 'ai-ml' | 'compliance' | 'quick-start';

export interface TemplateCategoryMeta {
  id: TemplateCategory;
  label: string;
  description: string;
  icon: string;
  color: string;
}

export const TEMPLATE_CATEGORIES: TemplateCategoryMeta[] = [
  {
    id: 'quick-start',
    label: 'Quick Starts',
    description: 'Minimal starters to get going fast',
    icon: 'Zap',
    color: '#f59e0b',
  },
  {
    id: 'full-stack',
    label: 'Full Stack',
    description: 'Complete application stacks',
    icon: 'Rocket',
    color: '#3b82f6',
  },
  {
    id: 'backend',
    label: 'Backend & API',
    description: 'API services and microservices',
    icon: 'Server',
    color: '#22c55e',
  },
  {
    id: 'data-pipeline',
    label: 'Data Pipelines',
    description: 'Event-driven and batch processing',
    icon: 'Activity',
    color: '#8b5cf6',
  },
  {
    id: 'ai-ml',
    label: 'AI & ML',
    description: 'Machine learning and AI workloads',
    icon: 'Brain',
    color: '#ec4899',
  },
  {
    id: 'compliance',
    label: 'Compliance',
    description: 'Security and regulatory focused',
    icon: 'ShieldCheck',
    color: '#10b981',
  },
];

export interface EnvironmentPreset {
  type: 'production' | 'staging' | 'development' | 'pr';
  name: string;
  region: string;
  securityLevel: SecurityLevel;
}

/** Legacy flat template format — nodes + edges listed directly */
export interface GCPTemplate {
  id: string;
  name: string;
  description: string;
  icon: string; // Lucide icon name
  provider: 'gcp';
  resourceCount: number;
  estimatedCost: string;
  tags: string[];
  securityLevel: SecurityLevel;
  environmentPresets: EnvironmentPreset[];
  nodes: CardNode[];
  edges: CardEdge[];
}

// =============================================================================
// Composed Template — block-based format
// =============================================================================

/** A block reference within a composed template */
export interface TemplateBlock {
  /** Canonical block type in {Category}.{Resource} format, e.g. 'Database.PostgreSQL' */
  iceType: string;
  /** Display label override (e.g. 'API Service' instead of 'Scalable Backend') */
  label: string;
  /** Canvas position */
  position: { x: number; y: number };
  /** Extra data to merge into the block container node */
  data?: Record<string, unknown>;
}

/** A connection between two blocks in a composed template */
export interface TemplateConnection {
  /** Index into the blocks array */
  fromBlock: number;
  /** Index into the blocks array */
  toBlock: number;
  /** Relationship type */
  relationship: string;
  /** Optional protocol */
  protocol?: string;
  /** Optional port */
  port?: number;
}

/** An organizational group within a composed template */
export interface TemplateGroup {
  /** Group subtype (e.g. 'Frontend', 'Services', 'Data') → becomes Group.{subtype} */
  subtype: string;
  /** Display label */
  label: string;
  /** Canvas position */
  position: { x: number; y: number };
  /** Explicit size */
  width: number;
  height: number;
  /** Indices into the blocks array for blocks inside this group */
  blockIndices: number[];
  /** Optional group color */
  color?: string;
}

/**
 * ComposedTemplate — templates defined as collections of blocks + connections.
 * Each block references a BlockBlueprint by type. On expansion, each block is
 * expanded via expandBlueprint(), then inter-block edges are wired.
 */
export interface ComposedTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  estimatedCost: string;
  category: TemplateCategory;
  tags: string[];
  securityLevel: SecurityLevel;
  environmentPresets: EnvironmentPreset[];
  /** Default cloud provider for this template (stamped on all expanded nodes) */
  provider?: 'gcp' | 'aws' | 'azure';
  /** Organizational groups wrapping blocks */
  groups?: TemplateGroup[];
  /** Block definitions — expanded at apply time */
  blocks: TemplateBlock[];
  /** Inter-block connections */
  connections: TemplateConnection[];
}

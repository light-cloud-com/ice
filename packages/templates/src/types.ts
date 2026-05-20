/**
 * Template Types
 *
 * Shared type definitions for infrastructure templates.
 */

import {
  type SecurityLevel,
  type TemplateDifficulty,
  type TemplateTrust,
  type ComplianceTag,
  type TemplateCategory,
  type TemplateCategoryMeta,
  TEMPLATE_CATEGORIES,
} from '@ice/constants';

export {
  type SecurityLevel,
  type TemplateDifficulty,
  type TemplateTrust,
  type ComplianceTag,
  type TemplateCategory,
  type TemplateCategoryMeta,
  TEMPLATE_CATEGORIES,
};

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

/** Template author information */
export interface TemplateAuthor {
  name: string;
  url?: string;
}

/** GitHub repository linked to a template */
export interface TemplateRepo {
  url: string;
  branch?: string;
  directory?: string;
  framework?: string;
  language?: string;
}

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
  /** Override the container iceType (e.g. 'Network.VPC', 'Network.Subnet'). When set, this
   *  is used instead of the default Group.{subtype}. Use for real infrastructure containers. */
  iceType?: string;
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
  /** Index into the groups array for the parent group. When set, this group's
   *  container node will have parentId pointing to the parent group's container node.
   *  Use for VPC → Subnet nesting. Parent groups MUST appear before children. */
  parentGroupIndex?: number;
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
  /** All providers this template supports (defaults to [provider] if omitted) */
  providers?: ('gcp' | 'aws' | 'azure')[];
  /** Organizational groups wrapping blocks */
  groups?: TemplateGroup[];
  /** Block definitions — expanded at apply time */
  blocks: TemplateBlock[];
  /** Inter-block connections */
  connections: TemplateConnection[];

  // ── Extended metadata (Phase 1) ──────────────────────────────────────────

  /** Difficulty rating */
  difficulty?: TemplateDifficulty;
  /** Trust level — who authored/reviewed this template */
  trust?: TemplateTrust;
  /** Compliance certifications this template is designed for */
  compliance?: ComplianceTag[];
  /** Template author */
  author?: TemplateAuthor;
  /** Linked GitHub repository with working application code */
  repo?: TemplateRepo;
  /** Whether this is a featured/promoted template */
  featured?: boolean;
}

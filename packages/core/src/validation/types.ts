/**
 * Canvas Validation Types
 *
 * Shared types for the unified validation engine.
 * Input: CardNode[] + CardEdge[] (canvas data).
 * Output: CanvasValidationResult with issues mapped to nodeId/edgeId.
 */

// ─── Severity & Category ────────────────────────────────────────────────────

export type IssueSeverity = 'error' | 'warning' | 'info';

export type IssueCategory =
  | 'property'      // Missing required, type mismatch, invalid option
  | 'connection'    // Invalid edge, anti-pattern, missing connection
  | 'structure'     // Containment, orphans, dangling refs
  | 'deploy'        // Provider support, type mapping, credentials
  | 'architecture'; // Best practices, security, production readiness

// ─── Issue Codes ────────────────────────────────────────────────────────────

export type IssueCode =
  // Property
  | 'MISSING_REQUIRED'
  | 'TYPE_MISMATCH'
  | 'INVALID_OPTION'
  | 'VALUE_OUT_OF_RANGE'
  | 'DUPLICATE_NAME'
  // Connection
  | 'INVALID_CONNECTION'
  | 'CONTAINER_CONNECTION'
  | 'SELF_CONNECTION'
  | 'DUPLICATE_EDGE'
  | 'FRONTEND_DB_DIRECT'
  | 'FRONTEND_QUEUE_DIRECT'
  | 'CYCLE_DETECTED'
  // Structure
  | 'INVALID_PARENT_REF'
  | 'PARENT_NOT_CONTAINER'
  | 'DANGLING_EDGE_SOURCE'
  | 'DANGLING_EDGE_TARGET'
  | 'DUPLICATE_NODE_ID'
  | 'MISSING_ICE_TYPE'
  | 'ORPHAN_NODE'
  // Deploy
  | 'UNSUPPORTED_PROVIDER'
  | 'NO_TYPE_MAPPING'
  | 'DESIGN_ONLY_PROVIDER'
  | 'UI_ONLY_TYPE'
  | 'NO_CREDENTIALS'
  | 'MISSING_DEPLOY_PROPERTY'
  // Architecture
  | 'NO_BACKEND_FOR_FRONTEND'
  | 'NO_AUTH_PRODUCTION'
  | 'NO_MONITORING'
  | 'NO_SSL_PUBLIC'
  | 'MULTI_DB_NO_CACHE';

// ─── Canvas Issue ───────────────────────────────────────────────────────────

export interface CanvasIssue {
  /** Stable deterministic ID for deduplication (e.g. "prop:nodeId:name:MISSING_REQUIRED") */
  readonly id: string;
  readonly severity: IssueSeverity;
  readonly category: IssueCategory;
  readonly code: IssueCode;
  /** Human-readable message */
  readonly message: string;
  /** Affected node ID */
  readonly nodeId?: string;
  /** Affected edge ID */
  readonly edgeId?: string;
  /** Which property (e.g. 'size', 'runtime') */
  readonly propertyPath?: string;
  /** Actionable fix description */
  readonly suggestion?: string;
}

// ─── Validation Result ──────────────────────────────────────────────────────

export interface CanvasValidationResult {
  /** No errors (warnings are OK) */
  readonly valid: boolean;
  /** No errors AND no deploy-blocking issues */
  readonly deployable: boolean;
  /** All issues found */
  readonly issues: readonly CanvasIssue[];
  /** Issues grouped by node ID */
  readonly issuesByNode: ReadonlyMap<string, readonly CanvasIssue[]>;
  /** Issues grouped by edge ID */
  readonly issuesByEdge: ReadonlyMap<string, readonly CanvasIssue[]>;
  /** Counts by severity */
  readonly summary: { errors: number; warnings: number; info: number };
  /** ISO timestamp */
  readonly validatedAt: string;
}

// ─── Validation Context ─────────────────────────────────────────────────────

export interface ValidationContext {
  /** Target deploy provider (e.g. 'aws', 'gcp', 'azure') */
  provider?: string;
  /** Target environment */
  environment?: 'production' | 'staging' | 'development';
  /** 'design' = lenient (real-time), 'pre-deploy' = strict */
  mode: 'design' | 'pre-deploy';
  /** Whether provider credentials are connected */
  hasCredentials?: boolean;
}

// ─── Canvas Input Types ─────────────────────────────────────────────────────
// Mirrors the CardNode/CardEdge shapes from @ice/types but kept minimal
// so the validation engine doesn't depend on the UI store types.

export interface ValidatableNode {
  readonly id: string;
  readonly type: string; // 'resource' | 'container' | 'block' | 'group'
  readonly data: Readonly<Record<string, unknown>>;
  readonly parentId?: string;
}

export interface ValidatableEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly data?: Readonly<Record<string, unknown>>;
}

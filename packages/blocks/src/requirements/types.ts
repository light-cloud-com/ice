/**
 * Block Requirements Framework — Types
 *
 * A "requirement" is a contract between a block and the world outside ICE.
 * Things like "this Cloud Run block needs a GitHub repo attached" or "this
 * static site block needs a DNS A record pointing at the forwarding rule
 * IP after deploy." Each requirement has a check, a status, and an action
 * the user can take to satisfy it.
 *
 * See `deployment-fixes-docs/phase-4-block-requirements.md` for the full
 * design rationale.
 */

export type RequirementTiming = 'before-deploy' | 'post-deploy';

export type RequirementStatus =
  | 'unknown' // never checked
  | 'checking' // check in flight
  | 'unmet' // checked, not satisfied
  | 'met' // checked, satisfied (before-deploy only)
  | 'verified' // checked + verified against real infrastructure (post-deploy)
  | 'expired'; // verification timeout expired without success

export interface RequirementBlock {
  id: string;
  data: Record<string, unknown>;
  deploy_status?: string;
}

export interface RequirementContext {
  block: RequirementBlock;
  /** The card this block belongs to. */
  cardId: string;
  /** Environment: 'development' / 'staging' / 'production'. */
  environment: string;
  /** GCP project id (or equivalent for other providers). */
  gcpProject?: string;
  /** Org the deploy runs as — used for credential lookups. */
  org: { id: string };
  /** Outputs from the last successful deploy for this block. */
  deployedOutputs?: Record<string, unknown>;
  /** Provider id of the deployed resource (from the mapping table). */
  providerId?: string;
  /** Abort signal — the resolver aborts all in-flight checks when its deadline hits. */
  signal?: AbortSignal;
}

export interface RequirementCheckResult {
  status: RequirementStatus;
  message?: string;
  details?: unknown;
  lastCheckedAt: string;
}

export interface RequirementAction {
  type: 'copy-dns-record' | 'attach-repo' | 'install-github-app' | 'open-url' | 'open-gcp-billing' | 'custom';
  label: string;
  /** Variable per action type. For example `copy-dns-record` carries `{ type, name, value, ttl }`. */
  payload?: Record<string, unknown>;
}

export interface RequirementDefinition {
  id: string;
  scope: 'block' | 'card' | 'global';
  timing: RequirementTiming;
  /** If true, deploy is blocked when the check returns `unmet`. */
  blocking: boolean;
  /** Short human-readable stable title. */
  title: (ctx: RequirementContext) => string;
  /** Longer plain-language explanation. */
  description?: (ctx: RequirementContext) => string;
  /** Returns true iff this requirement applies to the given block/context. */
  applies: (ctx: RequirementContext) => boolean;
  /** The actual check that determines status. */
  check: (ctx: RequirementContext) => Promise<RequirementCheckResult>;
  /** What the user should do to satisfy it. */
  action?: (ctx: RequirementContext) => RequirementAction | null;
  /** For post-deploy requirements that poll until verified. */
  verifyPollIntervalMs?: number;
  verifyTimeoutMs?: number;
}

/**
 * The shape of a resolved requirement — what the UI renders.
 */
export interface ResolvedRequirement {
  definitionId: string;
  scope: 'block' | 'card' | 'global';
  timing: RequirementTiming;
  blocking: boolean;
  title: string;
  description?: string;
  result: RequirementCheckResult;
  action?: RequirementAction | null;
  nodeId?: string;
}

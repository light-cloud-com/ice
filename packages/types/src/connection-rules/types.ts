/**
 * Connection-rule core type surface — types-only module.
 *
 * Houses the small set of types the rest of the connection-rules
 * machinery (predicates, rules data, derived helpers) depends on.
 *
 * Extracted from `connection-rules.ts` in rf-conn-1; nothing here is
 * runtime — the file is a single re-export hop for consumers and
 * test surface for the type-shape contracts.
 */

import { type ConnectionCategory } from '@ice/constants';

// ─── Trafic / line-style discriminants ──────────────────────────────────────

/** Sub-type of a `traffic` connection. */
export type TrafficType = 'request' | 'data' | 'publish' | 'subscribe' | 'stream';

/** Visual styling for the rendered edge. */
export type LineStyle = 'solid' | 'dashed' | 'dotted' | 'thin';

// ─── Resolved-connection metadata ────────────────────────────────────────────

/**
 * Result of inferring a connection's category, traffic type, line style,
 * port + env-var, and orientation flip from a source/target iceType pair.
 *
 * `flip: true` means the rule matched a "reverse-direction" entry
 * (e.g. user dragged Service → Repo, which the engine flips to
 * Repo → Service before persisting).
 */
export interface ConnectionMeta {
  category: ConnectionCategory;
  trafficType?: TrafficType;
  lineStyle: LineStyle;
  color: string;
  port?: number;
  envVarName?: string;
  flip?: boolean;
  label?: string;
}

// ─── Validation warnings ────────────────────────────────────────────────────

/** Severity tier for `validateConnection` outputs. */
export interface ConnectionWarning {
  level: 'error' | 'warning' | 'info';
  message: string;
  suggestion?: string;
}

// ─── Connection rule definition ─────────────────────────────────────────────

/**
 * A declarative entry in the `CONNECTION_RULES` array.
 *
 * `source` / `target` are predicate functions that classify iceType
 * strings into logical groups; the first matching rule wins. The
 * `reverse` flag is set on entries where the user-facing drag direction
 * is the inverse of the canonical direction (e.g. drag Service → Repo,
 * canonical = Repo → Service).
 */
export interface ConnectionRule {
  /** Human-readable label for debugging / AI prompt generation */
  label: string;
  /** Source block classifier */
  source: (iceType: string) => boolean;
  /** Target block classifier */
  target: (iceType: string) => boolean;
  /** Connection category */
  category: ConnectionCategory;
  /** Traffic sub-type (only for traffic category) */
  trafficType?: TrafficType;
  /** Visual line style */
  lineStyle: LineStyle;
  /** If true, direction should be flipped (target becomes source) */
  reverse?: boolean;
}

// ─── Parent-aware-check minimal node shape ──────────────────────────────────

/**
 * Minimal node shape used for parent-aware connection rules. Only needs
 * the fields the rules actually inspect — full canvas nodes are a
 * superset and pass through unchanged.
 */
export interface NodeForConnectionCheck {
  id: string;
  parentId?: string | null;
  data?: Record<string, unknown>;
  type?: string;
}

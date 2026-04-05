/**
 * Node Traits — Behavior and Security
 *
 * How nodes behave (scaling, containment, state) and their security posture.
 */

// ─── Behavior ───────────────────────────────────────────────────────────────

export type NodeBehavior =
  | 'scalable'
  | 'container'
  | 'singleton'
  | 'streaming'
  | 'stateful'
  | 'connector';

export const BEHAVIOR_LABELS: Record<NodeBehavior, string> = {
  scalable: 'Scales horizontally',
  container: 'Contains resources',
  singleton: 'Single instance',
  streaming: 'Data flow',
  stateful: 'Persistent data',
  connector: 'Routes traffic',
};

export const BEHAVIOR_COLORS: Record<NodeBehavior, string> = {
  scalable: 'blue',
  container: 'purple',
  singleton: 'gray',
  streaming: 'green',
  stateful: 'orange',
  connector: 'cyan',
};

// ─── Security ───────────────────────────────────────────────────────────────

export type SecurityLevel = 'basic' | 'standard' | 'strict' | 'compliance';

export const SECURITY_LEVEL_COLORS: Record<SecurityLevel, string> = {
  basic: '#6b7280',
  standard: '#3b82f6',
  strict: '#f59e0b',
  compliance: '#22c55e',
};

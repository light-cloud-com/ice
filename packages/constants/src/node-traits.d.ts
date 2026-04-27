/**
 * Node Traits — Behavior and Security
 *
 * How nodes behave (scaling, containment, state) and their security posture.
 */
export type NodeBehavior = 'scalable' | 'container' | 'singleton' | 'streaming' | 'stateful' | 'connector';
export declare const BEHAVIOR_LABELS: Record<NodeBehavior, string>;
/**
 * Bare hue names (not hex) — consumers compose Tailwind class strings
 * like `text-${color}-500` from these. The `COLORS` palette is for
 * `style={{ color }}` consumers; this map is for `className` consumers.
 */
export declare const BEHAVIOR_COLORS: Record<NodeBehavior, string>;
export type SecurityLevel = 'basic' | 'standard' | 'strict' | 'compliance';
export declare const SECURITY_LEVEL_COLORS: Record<SecurityLevel, string>;

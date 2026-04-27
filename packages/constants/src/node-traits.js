/**
 * Node Traits — Behavior and Security
 *
 * How nodes behave (scaling, containment, state) and their security posture.
 */
import { COLORS } from './colors.js';
export const BEHAVIOR_LABELS = {
    scalable: 'Scales horizontally',
    container: 'Contains resources',
    singleton: 'Single instance',
    streaming: 'Data flow',
    stateful: 'Persistent data',
    connector: 'Routes traffic',
};
/**
 * Bare hue names (not hex) — consumers compose Tailwind class strings
 * like `text-${color}-500` from these. The `COLORS` palette is for
 * `style={{ color }}` consumers; this map is for `className` consumers.
 */
export const BEHAVIOR_COLORS = {
    scalable: 'blue',
    container: 'purple',
    singleton: 'gray',
    streaming: 'green',
    stateful: 'orange',
    connector: 'cyan',
};
export const SECURITY_LEVEL_COLORS = {
    basic: COLORS.gray500,
    standard: COLORS.blue,
    strict: COLORS.amber,
    compliance: COLORS.green,
};

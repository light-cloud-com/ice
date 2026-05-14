/**
 * Scale Presets — Monitoring category.
 *
 * Resource keys covered: log-group, alert.
 *
 * Part of the rf-spdat split — see `../scale-presets-data.ts` for the
 * orchestrator and `../scale-presets-types.ts` for the shared types.
 */

import type { ScaleTier, TierPreset } from '../scale-presets-types';

export const MONITORING_PRESETS: Record<string, Partial<Record<ScaleTier, TierPreset>>> = {
  'log-group': {
    dev: { keep_logs: '7 days' },
    low: { keep_logs: '14 days' },
    moderate: { keep_logs: '30 days' },
    medium: { keep_logs: '30 days' },
    high: { keep_logs: '90 days' },
    'very-high': { keep_logs: '1 year' },
  },

  alert: {
    dev: { severity: 'Low — check when convenient' },
    low: { severity: 'Medium — look into it soon' },
    moderate: { severity: 'Medium — look into it soon' },
    medium: { severity: 'Medium — look into it soon' },
    high: { severity: 'High — wake me up at 3am' },
    'very-high': { severity: 'High — wake me up at 3am' },
  },
};

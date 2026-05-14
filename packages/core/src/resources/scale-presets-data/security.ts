/**
 * Scale Presets — Security category.
 *
 * Resource keys covered: secret-store, ssl-certificate.
 *
 * Part of the rf-spdat split — see `../scale-presets-data.ts` for the
 * orchestrator and `../scale-presets-types.ts` for the shared types.
 */

import type { ScaleTier, TierPreset } from '../scale-presets-types';

export const SECURITY_PRESETS: Record<string, Partial<Record<ScaleTier, TierPreset>>> = {
  'secret-store': {
    dev: { auto_rotate: false },
    low: { auto_rotate: false },
    moderate: { auto_rotate: false },
    medium: { auto_rotate: true },
    high: { auto_rotate: true },
    'very-high': { auto_rotate: true },
  },

  'ssl-certificate': {
    dev: { auto_renew: true },
    low: { auto_renew: true },
    moderate: { auto_renew: true },
    medium: { auto_renew: true },
    high: { auto_renew: true },
    'very-high': { auto_renew: true },
  },
};

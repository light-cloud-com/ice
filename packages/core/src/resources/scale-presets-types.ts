/**
 * Scale Presets — Types and tier metadata.
 *
 * Pure type definitions and the human-readable tier descriptions used by the
 * AI assistant + UI. Kept separate from the bulk preset data so consumers that
 * only need the type surface don't have to pull in ~1450 LOC of property values.
 */

// ─── Scale tiers ───────────────────────────────────────────────────────────

export type ScaleTier = 'dev' | 'low' | 'moderate' | 'medium' | 'high' | 'very-high';

export const SCALE_TIERS: ScaleTier[] = ['dev', 'low', 'moderate', 'medium', 'high', 'very-high'];

export const SCALE_TIER_INFO: Record<
  ScaleTier,
  { label: string; description: string; typicalUsers: string; monthlyRequests: string }
> = {
  dev: {
    label: 'Development',
    description: 'Local dev, testing, CI/CD pipelines. Optimize for cost, not performance.',
    typicalUsers: '1–5 developers',
    monthlyRequests: '< 10K',
  },
  low: {
    label: 'Low Traffic',
    description: 'Small production app, early-stage startup, internal tool.',
    typicalUsers: '< 1,000 daily active users',
    monthlyRequests: '10K – 100K',
  },
  moderate: {
    label: 'Moderate Traffic',
    description: 'Growing app with steady traffic. First real production workload.',
    typicalUsers: '1,000 – 10,000 daily active users',
    monthlyRequests: '100K – 1M',
  },
  medium: {
    label: 'Medium Traffic',
    description: 'Established production service. Needs reliability and good performance.',
    typicalUsers: '10,000 – 100,000 daily active users',
    monthlyRequests: '1M – 10M',
  },
  high: {
    label: 'High Traffic',
    description: 'Large-scale production. Needs high availability and fast response times.',
    typicalUsers: '100,000 – 1M daily active users',
    monthlyRequests: '10M – 100M',
  },
  'very-high': {
    label: 'Very High Traffic',
    description: 'Enterprise-scale / viral product. Maximum throughput and redundancy.',
    typicalUsers: '1M+ daily active users',
    monthlyRequests: '100M+',
  },
};

// ─── Preset structure ──────────────────────────────────────────────────────

export interface TierPreset {
  /** Property values common to all providers */
  [key: string]: unknown;
  /** Provider-specific property overrides (merged on top of common values) */
  _providers?: Partial<Record<string, Record<string, unknown>>>;
}

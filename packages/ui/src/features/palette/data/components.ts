/**
 * Resource Palette — concept block inventory.
 *
 * Extracted verbatim from `components/resource-palette.tsx` (rf-rpal-3).
 * The 25-entry component list drives the draggable items in the palette.
 * `def` is the local builder — it resolves block name/description/tooltip
 * through a passed-in `t` translator and falls back to inline strings
 * when the i18n key is missing.
 *
 * **Locale-reactivity:** labels and tooltips MUST be resolved at call
 * time, not at module load. Earlier this file invoked `t()` at the
 * top level (via `def()` calls inside a module-level `COMPONENTS`
 * array), which captured whichever locale was active on first
 * import — so switching locales mid-session left the captured
 * strings frozen. Now `getComponents(t)` is called from inside the
 * React component each render so `t` re-derives on locale change.
 *
 * The order of the returned list is observable per category (the
 * palette preserves declaration order inside each category section).
 * Keep it stable — re-ordering would shift the visual layout users see.
 *
 * See docs/backlog/concepts-palette.md for the full rationale.
 */

import type React from 'react';
import {
  Activity,
  Bell,
  Brain,
  BrainCircuit,
  Clock,
  Cog,
  Database,
  FileText,
  GitBranch,
  Globe,
  HardDrive,
  Key,
  List,
  Server,
  Shield,
  Waypoints,
  Zap,
} from 'lucide-react';

import type { ComponentDef, RuntimeOption } from '../types';

type Translator = (key: string) => string;

/**
 * Convert "Compute.Container" → "computeContainer" for block translation
 * keys. The category prefix is fully lowercased so all-caps acronym
 * prefixes like "AI" map to "ai" (matching `aiVectorDB`, `aiLLMGateway`,
 * `aiModelServing` in the i18n bundle) instead of the broken `aI...`
 * shape the old single-letter lowercase produced.
 */
export function blockKey(type: string): string {
  const [cat, name] = type.split('.');
  return cat.toLowerCase() + name;
}

/** Helper: builds a ComponentDef from i18n keys with inline fallbacks for newly-added concept iceTypes. */
export function def(
  t: Translator,
  type: string,
  icon: React.ElementType,
  providers: ComponentDef['providers'],
  category: string,
  runtimes?: RuntimeOption[],
  fallback?: { name: string; description: string; tooltip?: string },
): ComponentDef {
  const k = blockKey(type);
  const i18nName = t(`blocks.${k}.name`);
  // If the i18n key is missing, `t()` returns the key string verbatim —
  // detect that and use the fallback.
  const missing = i18nName === `blocks.${k}.name`;
  return {
    type,
    name: missing && fallback ? fallback.name : i18nName,
    description: missing && fallback ? fallback.description : t(`blocks.${k}.description`),
    tooltip: missing && fallback ? (fallback.tooltip ?? fallback.description) : t(`blocks.${k}.tooltip`),
    icon,
    providers,
    category,
    ...(runtimes ? { runtimes } : {}),
  };
}

/**
 * The Concepts Palette — 25 high-level, provider-agnostic blocks.
 *
 * Replaces the old per-provider block inventory (~45 entries across 7
 * providers). Raw per-provider blueprints still exist in BLOCK_BLUEPRINTS
 * for backwards compat with existing projects (see hiddenFromPalette flag)
 * but are not shown in the default palette.
 *
 * Call from inside a React component (with `t` from `useTranslation()`)
 * so locale changes recompute the labels.
 */
export function getComponents(t: Translator): ComponentDef[] {
  return [
    // ── Frontend ──
    def(t, 'Compute.StaticSite', Globe, ['aws', 'gcp', 'azure'], 'Frontend'),
    def(t, 'Compute.SSRSite', Globe, ['aws', 'gcp', 'azure', 'kubernetes'], 'Frontend'),
    // ── Compute ──
    def(t, 'Compute.Container', Server, ['aws', 'gcp', 'azure', 'kubernetes'], 'Compute', [
      { label: 'Node.js', value: 'Node.js 20' },
      { label: 'Python', value: 'Python 3.12' },
      { label: 'Go', value: 'Go 1.22' },
      { label: 'Java', value: 'Java 21' },
      { label: 'Rust', value: 'Rust 1.77' },
      { label: '.NET', value: '.NET 8' },
    ]),
    def(t, 'Compute.ServerlessFunction', Zap, ['aws', 'gcp', 'azure'], 'Compute', [
      { label: 'Node.js', value: 'Node.js 20' },
      { label: 'Python', value: 'Python 3.12' },
      { label: 'Go', value: 'Go 1.x' },
      { label: 'Java', value: 'Java 21' },
      { label: '.NET', value: '.NET 8' },
    ]),
    def(t, 'Compute.Worker', Cog, ['aws', 'gcp', 'azure', 'kubernetes'], 'Compute'),
    // ── Scheduler ──
    def(t, 'Compute.CronJob', Clock, ['aws', 'gcp', 'azure'], 'Scheduler'),
    // ── Database ──
    def(t, 'Database.PostgreSQL', Database, ['aws', 'gcp', 'azure'], 'Database'),
    def(t, 'Database.MySQL', Database, ['aws', 'gcp', 'azure'], 'Database'),
    def(t, 'Database.MongoDB', Database, ['aws', 'gcp', 'azure'], 'Database'),
    // ── Cache ──
    def(t, 'Database.Redis', Zap, ['aws', 'gcp', 'azure', 'kubernetes'], 'Cache'),
    // ── Storage ──
    def(t, 'Storage.Bucket', HardDrive, ['aws', 'gcp', 'azure'], 'Storage'),
    // ── Messaging ──
    def(t, 'Messaging.Queue', List, ['aws', 'gcp', 'azure'], 'Messaging', undefined, {
      name: 'Message Queue',
      description: 'Point-to-point async queue — producer drops a job, a Worker picks it up.',
    }),
    def(t, 'Messaging.EventStream', Activity, ['aws', 'gcp', 'azure'], 'Messaging', undefined, {
      name: 'Event Stream',
      description: 'Pub/sub fan-out stream. One event, many consumers.',
    }),
    def(t, 'Messaging.Email', Bell, ['aws', 'gcp', 'azure'], 'Messaging', undefined, {
      name: 'Email Service',
      description: 'Transactional email — confirmations, receipts, password resets.',
    }),
    // ── Network ──
    def(t, 'Network.Gateway', GitBranch, ['aws', 'gcp', 'azure'], 'Network'),
    def(t, 'Network.CustomDomain', Globe, ['aws', 'gcp', 'azure'], 'Network'),
    def(t, 'Network.PrivateNetwork', Shield, ['aws', 'gcp', 'azure'], 'Network'),
    // Public Traffic is NOT a draggable block — it's auto-rendered as a floating
    // user icon above public-facing services by use-exposed-services.ts. The
    // concept blueprint still exists for info-panel purposes.
    // ── Security ──
    def(t, 'Security.Secret', Key, ['aws', 'gcp', 'azure'], 'Security'),
    // ── AI ──
    def(t, 'AI.VectorDB', Waypoints, ['aws', 'gcp', 'azure'], 'AI'),
    def(t, 'AI.LLMGateway', BrainCircuit, ['aws', 'gcp', 'azure'], 'AI'),
    def(t, 'AI.PrivateAIService', Brain, ['aws', 'gcp', 'azure'], 'AI', undefined, {
      name: 'Private AI Service',
      description: 'Self-hosted LLM on your own infrastructure. Data stays in your cloud.',
    }),
    // ── Monitoring ──
    def(t, 'Monitoring.Log', FileText, ['aws', 'gcp', 'azure'], 'Monitoring'),
    // ── Source ──
    def(t, 'Source.Repository', GitBranch, ['aws', 'gcp', 'azure'], 'Source'),
    // ── Config ──
    def(t, 'Config.Environment', Cog, ['aws', 'gcp', 'azure'], 'Config'),
  ];
}

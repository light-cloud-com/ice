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
import type React from 'react';

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
    // Per-component `providers` arrays are derived from the union of
    // (handler-exists-for-iceType-in-provider) ∩ (PROVIDER_FLAGS category
    // enabled for provider). The resource-palette runtime re-applies
    // the category gate (see `effectiveProviders` in resource-palette.tsx);
    // listing only handler-backed providers here keeps the tooltip badges
    // honest and the canvas context menu accurate.
    //
    // ── Frontend ── (ibm has no first-party static-site or SSR-as-frontend service; Frontend flag off for ibm)
    def(
      t,
      'Compute.StaticSite',
      Globe,
      ['aws', 'gcp', 'azure', 'kubernetes', 'alibaba', 'oci', 'digitalocean'],
      'Frontend',
    ),
    def(
      t,
      'Compute.SSRSite',
      Globe,
      ['aws', 'gcp', 'azure', 'kubernetes', 'alibaba', 'oci', 'digitalocean'],
      'Frontend',
    ),
    // ── Compute ── (every provider has a container/serverless/worker primitive)
    def(
      t,
      'Compute.Container',
      Server,
      ['aws', 'gcp', 'azure', 'kubernetes', 'alibaba', 'oci', 'digitalocean', 'ibm'],
      'Compute',
      [
        { label: 'Node.js', value: 'Node.js 20' },
        { label: 'Python', value: 'Python 3.12' },
        { label: 'Go', value: 'Go 1.22' },
        { label: 'Java', value: 'Java 21' },
        { label: 'Rust', value: 'Rust 1.77' },
        { label: '.NET', value: '.NET 8' },
      ],
    ),
    def(
      t,
      'Compute.ServerlessFunction',
      Zap,
      ['aws', 'gcp', 'azure', 'kubernetes', 'alibaba', 'oci', 'digitalocean', 'ibm'],
      'Compute',
      [
        { label: 'Node.js', value: 'Node.js 20' },
        { label: 'Python', value: 'Python 3.12' },
        { label: 'Go', value: 'Go 1.x' },
        { label: 'Java', value: 'Java 21' },
        { label: '.NET', value: '.NET 8' },
      ],
    ),
    def(
      t,
      'Compute.Worker',
      Cog,
      ['aws', 'gcp', 'azure', 'kubernetes', 'alibaba', 'oci', 'digitalocean', 'ibm'],
      'Compute',
    ),
    // ── Scheduler ── (digitalocean has no first-party scheduler service)
    def(t, 'Compute.CronJob', Clock, ['aws', 'gcp', 'azure', 'kubernetes', 'alibaba', 'oci', 'ibm'], 'Scheduler'),
    // ── Database ── (every provider has a managed DB family or StatefulSet profile)
    def(
      t,
      'Database.PostgreSQL',
      Database,
      ['aws', 'gcp', 'azure', 'kubernetes', 'alibaba', 'oci', 'digitalocean', 'ibm'],
      'Database',
    ),
    def(
      t,
      'Database.MySQL',
      Database,
      ['aws', 'gcp', 'azure', 'kubernetes', 'alibaba', 'oci', 'digitalocean', 'ibm'],
      'Database',
    ),
    def(
      t,
      'Database.MongoDB',
      Database,
      ['aws', 'gcp', 'azure', 'kubernetes', 'alibaba', 'oci', 'digitalocean', 'ibm'],
      'Database',
    ),
    // ── Cache ── (every provider has a managed Redis service or StatefulSet profile)
    def(
      t,
      'Database.Redis',
      Zap,
      ['aws', 'gcp', 'azure', 'kubernetes', 'alibaba', 'oci', 'digitalocean', 'ibm'],
      'Cache',
    ),
    // ── Storage ── (k8s maps to PVC; others have first-party object storage)
    def(
      t,
      'Storage.Bucket',
      HardDrive,
      ['aws', 'gcp', 'azure', 'kubernetes', 'alibaba', 'oci', 'digitalocean', 'ibm'],
      'Storage',
    ),
    // ── Messaging ── (digitalocean has no first-party messaging service)
    def(
      t,
      'Messaging.Queue',
      List,
      ['aws', 'gcp', 'azure', 'kubernetes', 'alibaba', 'oci', 'ibm'],
      'Messaging',
      undefined,
      {
        name: 'Message Queue',
        description: 'Point-to-point async queue — producer drops a job, a Worker picks it up.',
      },
    ),
    def(
      t,
      'Messaging.EventStream',
      Activity,
      ['aws', 'gcp', 'azure', 'kubernetes', 'alibaba', 'oci', 'ibm'],
      'Messaging',
      undefined,
      {
        name: 'Event Stream',
        description: 'Pub/sub fan-out stream. One event, many consumers.',
      },
    ),
    // Email — only providers with a first-party transactional email primitive
    // (SES / SendGrid integration on GCP / Azure Communication Services).
    // Other providers route via third-party keys; not part of the deploy graph.
    def(t, 'Messaging.Email', Bell, ['aws', 'gcp', 'azure'], 'Messaging', undefined, {
      name: 'Email Service',
      description: 'Transactional email — confirmations, receipts, password resets.',
    }),
    // ── Network ── (digitalocean / ibm have no first-party API gateway handler)
    def(t, 'Network.Gateway', GitBranch, ['aws', 'gcp', 'azure', 'kubernetes', 'alibaba', 'oci'], 'Network'),
    // CustomDomain — ibm has no DNS / CIS handler registered yet
    def(
      t,
      'Network.CustomDomain',
      Globe,
      ['aws', 'gcp', 'azure', 'kubernetes', 'alibaba', 'oci', 'digitalocean'],
      'Network',
    ),
    // PrivateNetwork (VPC / VNet / VCN / namespace) — every provider has one
    def(
      t,
      'Network.PrivateNetwork',
      Shield,
      ['aws', 'gcp', 'azure', 'kubernetes', 'alibaba', 'oci', 'digitalocean', 'ibm'],
      'Network',
    ),
    // Public Traffic is NOT a draggable block — it's auto-rendered as a floating
    // user icon above public-facing services by use-exposed-services.ts. The
    // concept blueprint still exists for info-panel purposes.
    // ── Security ── (every provider has a secret store)
    def(
      t,
      'Security.Secret',
      Key,
      ['aws', 'gcp', 'azure', 'kubernetes', 'alibaba', 'oci', 'digitalocean', 'ibm'],
      'Security',
    ),
    // ── AI ──
    // VectorDB — only providers with first-party vector search:
    //   AWS OpenSearch Serverless, GCP Vertex AI Vector Search,
    //   Azure Cognitive Search (vector), Alibaba OpenSearch.
    def(t, 'AI.VectorDB', Waypoints, ['aws', 'gcp', 'azure', 'alibaba'], 'AI'),
    // LLM Gateway — managed LLM endpoint:
    //   AWS Bedrock, GCP Vertex AI, Azure OpenAI, Alibaba PAI-EAS,
    //   OCI Generative AI, IBM watsonx.
    def(t, 'AI.LLMGateway', BrainCircuit, ['aws', 'gcp', 'azure', 'alibaba', 'oci', 'ibm'], 'AI'),
    // PrivateAIService — self-hosted model serving:
    //   AWS SageMaker, GCP Vertex AI custom, Azure ML, Alibaba PAI workspace,
    //   OCI Data Science model deployment, IBM watsonx deployment.
    def(t, 'AI.PrivateAIService', Brain, ['aws', 'gcp', 'azure', 'alibaba', 'oci', 'ibm'], 'AI', undefined, {
      name: 'Private AI Service',
      description: 'Self-hosted LLM on your own infrastructure. Data stays in your cloud.',
    }),
    // ── Monitoring ── (digitalocean has metrics-only; no log aggregation)
    def(t, 'Monitoring.Log', FileText, ['aws', 'gcp', 'azure', 'kubernetes', 'alibaba', 'oci', 'ibm'], 'Monitoring'),
    // ── Source ── (only providers with a CodeBuild-equivalent first-party build service)
    def(t, 'Source.Repository', GitBranch, ['aws', 'gcp', 'azure', 'alibaba'], 'Source'),
    // ── Config ── (provider-agnostic)
    def(
      t,
      'Config.Environment',
      Cog,
      ['aws', 'gcp', 'azure', 'kubernetes', 'alibaba', 'oci', 'digitalocean', 'ibm'],
      'Config',
    ),
    // ── Util ── (provider-agnostic; the Util category isn't gated by feature flags)
    def(
      t,
      'Util.Reroute',
      Waypoints,
      ['aws', 'gcp', 'azure', 'kubernetes', 'alibaba', 'oci', 'digitalocean', 'ibm'],
      'Util',
      undefined,
      {
        name: 'Reroute',
        description: 'Pass-through dot to bend wires cleanly. No deploy footprint.',
        tooltip: 'Pass-through routing dot — keeps wires tidy without altering the graph.',
      },
    ),
  ];
}

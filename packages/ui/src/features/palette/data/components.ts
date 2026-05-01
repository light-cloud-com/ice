/**
 * Resource Palette — concept block inventory.
 *
 * Extracted verbatim from `components/resource-palette.tsx` (rf-rpal-3).
 * The 25-entry `COMPONENTS` array drives the draggable items in the palette.
 * `def` is the local builder — it resolves block name/description/tooltip
 * through the `t()` helper at module load and falls back to inline strings
 * when the i18n key is missing.
 *
 * The order of `COMPONENTS` is observable per category (the palette
 * preserves declaration order inside each category section). Keep it
 * stable — re-ordering would shift the visual layout users see.
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

import { t } from '../../../i18n';
import type { ComponentDef, RuntimeOption } from '../types';

/** Convert "Compute.Container" → "computeContainer" for block translation keys */
export function blockKey(type: string): string {
  const [cat, name] = type.split('.');
  return cat.charAt(0).toLowerCase() + cat.slice(1) + name;
}

/** Helper: builds a ComponentDef from i18n keys with inline fallbacks for newly-added concept iceTypes. */
export function def(
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
 * This replaces the old per-provider block inventory (~45 entries across 7
 * providers). Raw per-provider blueprints still exist in BLOCK_BLUEPRINTS
 * for backwards compat with existing projects (see hiddenFromPalette flag)
 * but are not shown in the default palette.
 */
export const COMPONENTS: ComponentDef[] = [
  // ── Frontend ──
  def('Compute.StaticSite', Globe, ['aws', 'gcp', 'azure'], 'Frontend'),
  def('Compute.SSRSite', Globe, ['aws', 'gcp', 'azure', 'kubernetes'], 'Frontend'),
  // ── Compute ──
  def('Compute.Container', Server, ['aws', 'gcp', 'azure', 'kubernetes'], 'Compute', [
    { label: 'Node.js', value: 'Node.js 20' },
    { label: 'Python', value: 'Python 3.12' },
    { label: 'Go', value: 'Go 1.22' },
    { label: 'Java', value: 'Java 21' },
    { label: 'Rust', value: 'Rust 1.77' },
    { label: '.NET', value: '.NET 8' },
  ]),
  def('Compute.ServerlessFunction', Zap, ['aws', 'gcp', 'azure'], 'Compute', [
    { label: 'Node.js', value: 'Node.js 20' },
    { label: 'Python', value: 'Python 3.12' },
    { label: 'Go', value: 'Go 1.x' },
    { label: 'Java', value: 'Java 21' },
    { label: '.NET', value: '.NET 8' },
  ]),
  def('Compute.Worker', Cog, ['aws', 'gcp', 'azure', 'kubernetes'], 'Compute'),
  // ── Scheduler ──
  def('Compute.CronJob', Clock, ['aws', 'gcp', 'azure'], 'Scheduler'),
  // ── Database ──
  def('Database.PostgreSQL', Database, ['aws', 'gcp', 'azure'], 'Database'),
  def('Database.MySQL', Database, ['aws', 'gcp', 'azure'], 'Database'),
  def('Database.MongoDB', Database, ['aws', 'gcp', 'azure'], 'Database'),
  // ── Cache ──
  def('Database.Redis', Zap, ['aws', 'gcp', 'azure', 'kubernetes'], 'Cache'),
  // ── Storage ──
  def('Storage.Bucket', HardDrive, ['aws', 'gcp', 'azure'], 'Storage'),
  // ── Messaging ──
  def('Messaging.Queue', List, ['aws', 'gcp', 'azure'], 'Messaging', undefined, {
    name: 'Message Queue',
    description: 'Point-to-point async queue — producer drops a job, a Worker picks it up.',
  }),
  def('Messaging.EventStream', Activity, ['aws', 'gcp', 'azure'], 'Messaging', undefined, {
    name: 'Event Stream',
    description: 'Pub/sub fan-out stream. One event, many consumers.',
  }),
  def('Messaging.Email', Bell, ['aws', 'gcp', 'azure'], 'Messaging', undefined, {
    name: 'Email Service',
    description: 'Transactional email — confirmations, receipts, password resets.',
  }),
  // ── Network ──
  def('Network.Gateway', GitBranch, ['aws', 'gcp', 'azure'], 'Network'),
  def('Network.CustomDomain', Globe, ['aws', 'gcp', 'azure'], 'Network'),
  def('Network.PrivateNetwork', Shield, ['aws', 'gcp', 'azure'], 'Network'),
  // Public Traffic is NOT a draggable block — it's auto-rendered as a floating
  // user icon above public-facing services by use-exposed-services.ts. The
  // concept blueprint still exists for info-panel purposes.
  // ── Security ──
  def('Security.Secret', Key, ['aws', 'gcp', 'azure'], 'Security'),
  // ── AI ──
  def('AI.VectorDB', Waypoints, ['aws', 'gcp', 'azure'], 'AI'),
  def('AI.LLMGateway', BrainCircuit, ['aws', 'gcp', 'azure'], 'AI'),
  def('AI.PrivateAIService', Brain, ['aws', 'gcp', 'azure'], 'AI', undefined, {
    name: 'Private AI Service',
    description: 'Self-hosted LLM on your own infrastructure. Data stays in your cloud.',
  }),
  // ── Monitoring ──
  def('Monitoring.Log', FileText, ['aws', 'gcp', 'azure'], 'Monitoring'),
  // ── Source ──
  def('Source.Repository', GitBranch, ['aws', 'gcp', 'azure'], 'Source'),
  // ── Config ──
  def('Config.Environment', Cog, ['aws', 'gcp', 'azure'], 'Config'),
];

/**
 * Resource Palette — category metadata.
 *
 * Extracted verbatim from `components/resource-palette.tsx` (rf-rpal-2).
 * The data drives section headers (icon + color + tooltip) in
 * `BlocksSection`. The order is observable — it sets the visual
 * ordering of category sections inside the palette — and lives in
 * `CATEGORY_ORDER` (locale-independent).
 *
 * **Locale-reactivity:** labels and tooltips MUST be resolved at call
 * time, not at module load. Earlier this file invoked `t()` at the
 * top level, which captured whichever locale was active on first
 * import — so switching locales mid-session left the captured
 * strings frozen (Chinese stayed Chinese, English stayed English).
 * Now the locale-dependent fields come from `getCategoryMap(t)` /
 * `getCategoryDefs(t)`, called from inside the React component each
 * render so React's `t` re-derives whenever the locale changes.
 */

import {
  BarChart3,
  Brain,
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
  Zap,
} from 'lucide-react';

import type { CategoryDef } from '../types';

interface CategoryBase {
  id: string;
  icon: CategoryDef['icon'];
  color: string;
  labelKey: string;
  tooltipKey: string;
}

/** Static layout data — id, icon, color, translation keys. No locale. */
const CATEGORY_BASES: CategoryBase[] = [
  { id: 'Compute', icon: Server, color: '#22c55e', labelKey: 'blocks.categories.compute.label', tooltipKey: 'blocks.categories.compute.tooltip' },
  { id: 'Scheduler', icon: Clock, color: '#eab308', labelKey: 'blocks.categories.scheduler.label', tooltipKey: 'blocks.categories.scheduler.tooltip' },
  { id: 'Frontend', icon: Globe, color: '#3b82f6', labelKey: 'blocks.categories.frontend.label', tooltipKey: 'blocks.categories.frontend.tooltip' },
  { id: 'Network', icon: GitBranch, color: '#06b6d4', labelKey: 'blocks.categories.network.label', tooltipKey: 'blocks.categories.network.tooltip' },
  { id: 'Database', icon: Database, color: '#f59e0b', labelKey: 'blocks.categories.database.label', tooltipKey: 'blocks.categories.database.tooltip' },
  { id: 'Cache', icon: Zap, color: '#ef4444', labelKey: 'blocks.categories.cache.label', tooltipKey: 'blocks.categories.cache.tooltip' },
  { id: 'Messaging', icon: List, color: '#8b5cf6', labelKey: 'blocks.categories.messaging.label', tooltipKey: 'blocks.categories.messaging.tooltip' },
  { id: 'Storage', icon: HardDrive, color: '#64748b', labelKey: 'blocks.categories.storage.label', tooltipKey: 'blocks.categories.storage.tooltip' },
  { id: 'Security', icon: Key, color: '#ec4899', labelKey: 'blocks.categories.security.label', tooltipKey: 'blocks.categories.security.tooltip' },
  { id: 'AI', icon: Brain, color: '#a855f7', labelKey: 'blocks.categories.ai.label', tooltipKey: 'blocks.categories.ai.tooltip' },
  { id: 'Analytics', icon: BarChart3, color: '#14b8a6', labelKey: 'blocks.categories.analytics.label', tooltipKey: 'blocks.categories.analytics.tooltip' },
  { id: 'Monitoring', icon: FileText, color: '#f97316', labelKey: 'blocks.categories.monitoring.label', tooltipKey: 'blocks.categories.monitoring.tooltip' },
  { id: 'Source', icon: GitBranch, color: '#6366f1', labelKey: 'blocks.categories.source.label', tooltipKey: 'blocks.categories.source.tooltip' },
  { id: 'Config', icon: Cog, color: '#78716c', labelKey: 'blocks.categories.config.label', tooltipKey: 'blocks.categories.config.tooltip' },
];

export const CATEGORY_ORDER = CATEGORY_BASES.map((c) => c.id);

type Translator = (key: string) => string;

/** Build the localized CategoryDef list. Call from inside a React
 *  component (with `t` from `useTranslation()`) so locale changes
 *  recompute the labels. */
export function getCategoryDefs(t: Translator): CategoryDef[] {
  return CATEGORY_BASES.map((base) => ({
    id: base.id,
    icon: base.icon,
    color: base.color,
    label: t(base.labelKey),
    tooltip: t(base.tooltipKey),
  }));
}

/** Build the localized id → CategoryDef map. Same locale-reactivity
 *  contract as `getCategoryDefs`. */
export function getCategoryMap(t: Translator): Map<string, CategoryDef> {
  return new Map(getCategoryDefs(t).map((c) => [c.id, c]));
}

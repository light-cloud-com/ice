/**
 * Resource Palette — category metadata.
 *
 * Extracted verbatim from `components/resource-palette.tsx` (rf-rpal-2).
 * The data drives section headers (icon + color + tooltip) in
 * `BlocksSection`. The order of `CATEGORY_DEFS` is observable — it sets
 * the visual ordering of category sections inside the palette — and is
 * preserved here. Two derived constants live alongside the data:
 *
 *   - `CATEGORY_ORDER` — flat array of `id`s in declaration order, used as
 *     the iteration list when grouping filtered components into sections.
 *   - `CATEGORY_MAP` — `id → CategoryDef` lookup for the section header
 *     metadata.
 *
 * The labels and tooltips resolve through the standalone `t()` helper at
 * module-load time. That matches the source's eager evaluation — switching
 * locales mid-session would not pick up new strings here either way.
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

import { t } from '../../../i18n';
import type { CategoryDef } from '../types';

export const CATEGORY_DEFS: CategoryDef[] = [
  {
    id: 'Compute',
    label: t('blocks.categories.compute.label'),
    icon: Server,
    color: '#22c55e',
    tooltip: t('blocks.categories.compute.tooltip'),
  },
  {
    id: 'Scheduler',
    label: t('blocks.categories.scheduler.label'),
    icon: Clock,
    color: '#eab308',
    tooltip: t('blocks.categories.scheduler.tooltip'),
  },
  {
    id: 'Frontend',
    label: t('blocks.categories.frontend.label'),
    icon: Globe,
    color: '#3b82f6',
    tooltip: t('blocks.categories.frontend.tooltip'),
  },
  {
    id: 'Network',
    label: t('blocks.categories.network.label'),
    icon: GitBranch,
    color: '#06b6d4',
    tooltip: t('blocks.categories.network.tooltip'),
  },
  {
    id: 'Database',
    label: t('blocks.categories.database.label'),
    icon: Database,
    color: '#f59e0b',
    tooltip: t('blocks.categories.database.tooltip'),
  },
  {
    id: 'Cache',
    label: t('blocks.categories.cache.label'),
    icon: Zap,
    color: '#ef4444',
    tooltip: t('blocks.categories.cache.tooltip'),
  },
  {
    id: 'Messaging',
    label: t('blocks.categories.messaging.label'),
    icon: List,
    color: '#8b5cf6',
    tooltip: t('blocks.categories.messaging.tooltip'),
  },
  {
    id: 'Storage',
    label: t('blocks.categories.storage.label'),
    icon: HardDrive,
    color: '#64748b',
    tooltip: t('blocks.categories.storage.tooltip'),
  },
  {
    id: 'Security',
    label: t('blocks.categories.security.label'),
    icon: Key,
    color: '#ec4899',
    tooltip: t('blocks.categories.security.tooltip'),
  },
  {
    id: 'AI',
    label: t('blocks.categories.ai.label'),
    icon: Brain,
    color: '#a855f7',
    tooltip: t('blocks.categories.ai.tooltip'),
  },
  {
    id: 'Analytics',
    label: t('blocks.categories.analytics.label'),
    icon: BarChart3,
    color: '#14b8a6',
    tooltip: t('blocks.categories.analytics.tooltip'),
  },
  {
    id: 'Monitoring',
    label: t('blocks.categories.monitoring.label'),
    icon: FileText,
    color: '#f97316',
    tooltip: t('blocks.categories.monitoring.tooltip'),
  },
  {
    id: 'Source',
    label: t('blocks.categories.source.label'),
    icon: GitBranch,
    color: '#6366f1',
    tooltip: t('blocks.categories.source.tooltip'),
  },
  {
    id: 'Config',
    label: t('blocks.categories.config.label'),
    icon: Cog,
    color: '#78716c',
    tooltip: t('blocks.categories.config.tooltip'),
  },
];

export const CATEGORY_ORDER = CATEGORY_DEFS.map((c) => c.id);
export const CATEGORY_MAP = new Map(CATEGORY_DEFS.map((c) => [c.id, c]));

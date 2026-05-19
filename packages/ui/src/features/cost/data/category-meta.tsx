/**
 * Category icon + bar-color lookup tables.
 *
 * Lifted from `cost-panel.tsx` (rf-cost-3). The cost panel renders a category
 * breakdown row per `CategoryCost` returned from `computeCostSummary`. Each
 * row needs:
 *
 *   - a small lucide icon ("Compute" → `<Server/>`, "Data" → `<Database/>`, …)
 *   - a Tailwind bar fill class for the percent bar
 *
 * Both maps are keyed by the human-readable `category.label` first, with
 * `category.category` (the prefix-derived bucket) as a fallback. Unknown
 * keys fall through to `Other` / `bg-gray-500`.
 *
 * Pure data — kept separate so `CategoryRow` can stay a small component and
 * the cost-panel orchestrator doesn't drag the lucide imports.
 */

import { Server, Database, MessageSquare, Globe, Shield, Activity, BrainCircuit, Package } from 'lucide-react';
import React from 'react';

export const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  Compute: <Server className="w-3.5 h-3.5" />,
  Data: <Database className="w-3.5 h-3.5" />,
  'Data Storage': <Database className="w-3.5 h-3.5" />,
  Messaging: <MessageSquare className="w-3.5 h-3.5" />,
  Networking: <Globe className="w-3.5 h-3.5" />,
  Security: <Shield className="w-3.5 h-3.5" />,
  Observability: <Activity className="w-3.5 h-3.5" />,
  Analytics: <Activity className="w-3.5 h-3.5" />,
  'AI / ML': <BrainCircuit className="w-3.5 h-3.5" />,
  Config: <Package className="w-3.5 h-3.5" />,
  Source: <Package className="w-3.5 h-3.5" />,
  Other: <Package className="w-3.5 h-3.5" />,
};

export const CATEGORY_COLORS: Record<string, string> = {
  Compute: 'bg-blue-500',
  Data: 'bg-emerald-500',
  'Data Storage': 'bg-emerald-500',
  Messaging: 'bg-purple-500',
  Networking: 'bg-cyan-500',
  Security: 'bg-amber-500',
  Observability: 'bg-pink-500',
  Analytics: 'bg-orange-500',
  'AI / ML': 'bg-violet-500',
  Config: 'bg-slate-500',
  Source: 'bg-slate-400',
  Other: 'bg-gray-500',
};

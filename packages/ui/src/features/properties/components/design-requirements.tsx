/**
 * Design Requirements
 *
 * Per-block hints surfaced at the top of the properties panel: what's
 * missing on the canvas to make the block functional, and what implicit
 * choices the deployer will make if the user doesn't override them.
 *
 * This is a *design-time* signal, separate from the runtime block
 * requirements (DNS, cert issuance, etc. — see `requirements-section.tsx`)
 * which run server-side just before deploy. The goal here: a user who
 * just dropped a Postgres block on the canvas should see "no service
 * connected" without having to read docs or trial-deploy.
 *
 * Scope (prototype): only `Database.PostgreSQL` and `Network.PrivateNetwork`.
 * Scale-out happens once the format lands.
 */

import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Info } from 'lucide-react';
import React from 'react';
import { cn } from '../../../shared/utils/cn';
import type { CardNode, CardEdge } from '../../../store/slices/cards-slice';

// ─── Types ──────────────────────────────────────────────────────────────────

type Level = 'error' | 'warning' | 'info';

export interface DesignRequirement {
  /** Stable id — used as React key and as a way to suppress per-rule. */
  id: string;
  level: Level;
  /** One-line headline. */
  title: string;
  /** Optional second line — the why, or how-to-fix. Plain text. */
  hint?: string;
}

// ─── Rule set (Postgres + PrivateNetwork) ───────────────────────────────────

/**
 * Compute pure list of requirement findings for a node. Pure function —
 * easy to unit-test and to extend per iceType.
 */
export function collectDesignRequirements(
  node: CardNode,
  allNodes: readonly CardNode[],
  edges: readonly CardEdge[],
): DesignRequirement[] {
  const iceType = (node.data?.iceType as string) || '';
  const out: DesignRequirement[] = [];

  if (iceType === 'Database.PostgreSQL') {
    // Find any Compute.* connected via an edge in either direction.
    const hasServiceConnection = edges.some((e) => {
      if (e.source !== node.id && e.target !== node.id) return false;
      const other = allNodes.find((n) => n.id === (e.source === node.id ? e.target : e.source));
      const otherType = (other?.data?.iceType as string) || '';
      return otherType.startsWith('Compute.');
    });
    if (!hasServiceConnection) {
      out.push({
        id: 'pg-no-service',
        level: 'error',
        title: 'No service connected',
        hint: 'Drag an edge from a Compute block (Container, BackendAPI, SSRSite, ServerlessFunction) to this database. Without one, the database deploys but nothing reads or writes to it.',
      });
    }

    // Surface the implicit (edition, tier) the handler will pick. This is
    // the user's biggest "where did ENTERPRISE come from?" footgun — make
    // the choice visible BEFORE the deploy.
    const explicit_size = (node.data?.size as string) || '';
    const explicit_edition = (node.data?.edition as string) || '';
    if (!explicit_edition) {
      const inferred =
        explicit_size && /^db-perf-optimized/i.test(explicit_size) ? 'ENTERPRISE_PLUS' : 'ENTERPRISE';
      const inferred_tier = explicit_size || 'db-f1-micro';
      out.push({
        id: 'pg-edition-implicit',
        level: 'info',
        title: `Will deploy as ${inferred}, tier ${inferred_tier}`,
        hint:
          inferred === 'ENTERPRISE'
            ? 'Edition is auto-picked because shared-core tiers (db-f1-micro, db-g1-small) only work on ENTERPRISE. Set the `edition` field in Config to override.'
            : 'Edition is auto-picked because the chosen tier is performance-optimized (ENTERPRISE_PLUS only). Set the `edition` field in Config to override.',
      });
    }
  }

  if (iceType === 'Network.PrivateNetwork') {
    const childCount = allNodes.filter((n) => n.parentId === node.id).length;
    if (childCount === 0) {
      out.push({
        id: 'pn-empty',
        level: 'warning',
        title: 'Private network is empty',
        hint: 'Drag compute or database blocks inside this network to put them on a private VPC. An empty private network deploys a VPC but no resources use it.',
      });
    }

    const ingress = (node.data?.ingress as string) || 'all';
    if (ingress === 'all') {
      out.push({
        id: 'pn-open-ingress',
        level: 'info',
        title: 'Inbound traffic is unrestricted',
        hint: 'ingress = "all" — anything on the public internet can reach services inside (subject to per-block ingress rules). Set ingress to "allowlist" to limit source IPs, or "none" to seal the network entirely.',
      });
    }
  }

  return out;
}

// ─── Component ──────────────────────────────────────────────────────────────

const LEVEL_ICONS: Record<Level, typeof AlertTriangle> = {
  error: AlertTriangle,
  warning: AlertTriangle,
  info: Info,
};
const LEVEL_COLORS: Record<Level, { icon: string; bg: string; ring: string; title: string }> = {
  error: {
    icon: 'text-red-500',
    bg: 'bg-red-500/5',
    ring: 'ring-red-500/30',
    title: 'text-red-300',
  },
  warning: {
    icon: 'text-amber-500',
    bg: 'bg-amber-500/5',
    ring: 'ring-amber-500/30',
    title: 'text-amber-300',
  },
  info: {
    icon: 'text-blue-400',
    bg: 'bg-blue-500/5',
    ring: 'ring-blue-500/30',
    title: 'text-blue-300',
  },
};

export const DesignRequirements: React.FC<{
  node: CardNode;
  allNodes: readonly CardNode[];
  edges: readonly CardEdge[];
}> = ({ node, allNodes, edges }) => {
  const requirements = React.useMemo(
    () => collectDesignRequirements(node, allNodes, edges),
    [node, allNodes, edges],
  );

  // Auto-collapse when all-green so power users aren't bothered. Errors
  // expand by default (they block deploy); warnings + info collapse.
  const hasError = requirements.some((r) => r.level === 'error');
  const [expanded, setExpanded] = React.useState(hasError);
  // Re-evaluate the default if the rule set flips (e.g. user fixes an
  // error → component should collapse next render).
  React.useEffect(() => {
    setExpanded(hasError);
  }, [hasError]);

  if (requirements.length === 0) return null;

  const errorCount = requirements.filter((r) => r.level === 'error').length;
  const warnCount = requirements.filter((r) => r.level === 'warning').length;
  const infoCount = requirements.filter((r) => r.level === 'info').length;

  return (
    <div className="border-b border-ice-border">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-ice-xs hover:bg-ice-raised transition-colors"
      >
        <span className="flex items-center gap-1.5">
          {hasError ? (
            <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
          ) : warnCount > 0 ? (
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          )}
          <span className="font-medium text-ice-text-1">Requirements</span>
          <span className="text-ice-text-3">
            {[
              errorCount > 0 ? `${errorCount} blocking` : null,
              warnCount > 0 ? `${warnCount} warning${warnCount === 1 ? '' : 's'}` : null,
              infoCount > 0 ? `${infoCount} note${infoCount === 1 ? '' : 's'}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-ice-text-3" /> : <ChevronRight className="w-3.5 h-3.5 text-ice-text-3" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-1.5">
          {requirements.map((r) => {
            const Icon = LEVEL_ICONS[r.level];
            const palette = LEVEL_COLORS[r.level];
            return (
              <div
                key={r.id}
                className={cn('rounded px-2 py-1.5 ring-1 text-ice-2xs', palette.bg, palette.ring)}
              >
                <div className="flex items-start gap-1.5">
                  <Icon className={cn('w-3 h-3 mt-0.5 shrink-0', palette.icon)} />
                  <div className="flex-1 min-w-0">
                    <div className={cn('font-medium', palette.title)}>{r.title}</div>
                    {r.hint && <div className="text-ice-text-2 leading-snug mt-0.5">{r.hint}</div>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/**
 * Project Overview Section — right-sidebar panel rendered when no node and
 * no edge is selected on the active card.
 *
 * Shows: panel header (close → `toggleProperties`), an "overview" Section
 * with totals (node count, connection count, and an estimated monthly cost
 * derived from each node's `data.estimatedCost`), an optional canvas-pattern
 * suggestions Section sourced from `analyzeCanvasPatterns`, and one of two
 * mutually exclusive footer hints — an empty-state hint when the active card
 * has zero nodes, or a "select a node to edit" hint when it has nodes.
 *
 * Stays Redux-coupled: uses `useDispatch` internally for `toggleProperties`,
 * matching the pattern that landed in rf-props-22 for `EdgePropertiesSection`.
 *
 * Extracted from `properties-panel.tsx` lines 132–140 (totals derivations) +
 * 605–669 (the no-selection JSX branch) during rf-props-23. Every relative
 * path bumped one segment for the new `components/sections/` depth:
 * `../../../shared/...` → `../../../../shared/...`,
 * `../../../store/...` → `../../../../store/...`,
 * `../../../i18n` → `../../../../i18n`,
 * `../canvas/utils/connection-rules` → `../../../canvas/utils/connection-rules`,
 * `./fields` → `../fields`.
 *
 * rf-props-26 dedup: `parseCostRange` and `formatCost` are imported from the
 * canonical home at `../../../cost/utils/cost-calculator` instead of inlined.
 * The canonical versions are strictly more capable — they handle `'Free'`,
 * comma-separated thousands (`$1,000-2,000` → 1500, vs. the local copy's
 * 1.5), and decimals (`$0.50` → 0.5, vs. 0). `formatCost(0)` returns
 * `'Free'` rather than the local copy's empty string, but the callsite below
 * gates the row on `totalCost > 0`, so the empty-string → 'Free' transition
 * is never observable from this component.
 */

import React, { useMemo } from 'react';
import { useDispatch } from 'react-redux';
import { t } from '../../../../i18n';
import { PanelHeader } from '../../../../shared/components/ui/panel-header';
import { analyzeCanvasPatterns } from '../../../canvas/utils/connection-rules';
import { toggleProperties } from '../../../../store/slices/ui-slice';
import type { Card } from '../../../../store/slices/cards-slice';
import type { AppDispatch } from '../../../../store';
import { Section } from '../fields';
import { parseCostRange, formatCost } from '../../../cost/utils/cost-calculator';

// ─── Project Overview ───────────────────────────────────────────────────────

export const ProjectOverview: React.FC<{
  activeCard: Card | null | undefined;
}> = ({ activeCard }) => {
  const dispatch = useDispatch<AppDispatch>();

  const totalNodes = activeCard?.nodes.length || 0;
  const totalEdges = activeCard?.edges.length || 0;
  const totalCost = useMemo(() => {
    if (!activeCard) return 0;
    return activeCard.nodes.reduce((sum, n) => {
      const cost = (n.data?.estimatedCost as string) || '';
      return sum + parseCostRange(cost);
    }, 0);
  }, [activeCard]);

  return (
    <div id="ice-properties-panel" className="h-full flex flex-col bg-inherit border-l">
      <PanelHeader
        title={t('properties.title')}
        onClose={() => dispatch(toggleProperties())}
        closeLabel={t('properties.closeTitle')}
      />

      <Section title={t('properties.overview.title')}>
        <div className="flex items-center justify-between py-1">
          <span className="text-ice-sm text-ice-text-2">{t('properties.overview.nodes')}</span>
          <span className="text-ice-sm text-ice-text-1 font-mono">{totalNodes}</span>
        </div>
        <div className="flex items-center justify-between py-1">
          <span className="text-ice-sm text-ice-text-2">{t('properties.overview.connections')}</span>
          <span className="text-ice-sm text-ice-text-1 font-mono">{totalEdges}</span>
        </div>
        {totalCost > 0 && (
          <div className="flex items-center justify-between py-1">
            <span className="text-ice-sm text-ice-text-2">{t('properties.overview.estMonthlyCost')}</span>
            <span className="text-ice-sm text-emerald-400 font-mono">{formatCost(totalCost)}</span>
          </div>
        )}
      </Section>

      {/* Canvas pattern suggestions */}
      {activeCard &&
        activeCard.nodes.length > 0 &&
        (() => {
          const hints = analyzeCanvasPatterns(
            activeCard.nodes as Array<{ id: string; data?: Record<string, unknown> }>,
            activeCard.edges.map((e) => ({ source: e.source, target: e.target })),
          );
          if (hints.length === 0) return null;
          return (
            <Section title={t('properties.overview.suggestions')}>
              <div className="space-y-1.5">
                {hints.map((h, i) => (
                  <div key={i} className="rounded border border-blue-500/20 bg-blue-500/5 px-2.5 py-2">
                    <div className="text-ice-xs text-blue-400">{h.message}</div>
                  </div>
                ))}
              </div>
            </Section>
          );
        })()}

      {activeCard && activeCard.nodes.length === 0 && (
        <div className="flex-1 flex items-center justify-center px-6">
          <p className="text-ice-sm text-ice-text-3 text-center leading-relaxed">
            {t('properties.overview.emptyHint')}
          </p>
        </div>
      )}

      {activeCard && activeCard.nodes.length > 0 && (
        <div className="flex-1 flex items-center justify-center px-6">
          <p className="text-ice-sm text-ice-text-3 text-center leading-relaxed">
            {t('properties.overview.selectHint')}
          </p>
        </div>
      )}
    </div>
  );
};

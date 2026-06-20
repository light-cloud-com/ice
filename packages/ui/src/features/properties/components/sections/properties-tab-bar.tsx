/**
 * Properties Tab Bar — horizontal nav under the node identity card.
 *
 * Extracted from `node-properties-section.tsx` during rf-npsec-3. Renders
 * the visible tab buttons (only when there are >1) and forwards click
 * handlers via `onSelect`. The "deploy" tab gets an emerald-bordered
 * active style (instead of accent-blue), and tabs with `dot: true` show
 * a small emerald dot before the label.
 */

import React from 'react';
import { t } from '../../../../i18n';
import { cn } from '../../../../shared/utils/cn';
import type { VisibleTab } from '../../utils/build-visible-tabs';

export interface TabIssueCount {
  errors: number;
  warnings: number;
}

export interface PropertiesTabBarProps {
  visibleTabs: VisibleTab[];
  activeTab: string;
  onSelect: (id: string) => void;
  /** PE2 — per-tab error/warning counts, so a tab's problems are visible even
   *  when the user is on a different tab. Keyed by tab id. */
  issueCounts?: Record<string, TabIssueCount>;
}

export const PropertiesTabBar: React.FC<PropertiesTabBarProps> = ({
  visibleTabs,
  activeTab,
  onSelect,
  issueCounts,
}) => {
  if (visibleTabs.length <= 1) return null;
  return (
    <div className="flex border-b border-ice-border shrink-0">
      {visibleTabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onSelect(tab.id)}
          className={cn(
            'flex-1 px-3 py-2 text-ice-xs font-medium transition-colors flex items-center justify-center gap-1.5',
            activeTab === tab.id
              ? tab.id === 'deploy'
                ? 'text-ice-text-1 border-b-2 border-emerald-500'
                : 'text-ice-text-1 border-b-2 border-ice-accent'
              : 'text-ice-text-3 hover:text-ice-text-2',
          )}
        >
          {tab.dot && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
          {tab.label}
          <TabIssueBadge badge={issueCounts?.[tab.id]} />
        </button>
      ))}
    </div>
  );
};

// PE2 — errors take precedence over warnings; only one pill shows to keep the
// tab compact. The visible number is paired with an AT-reachable label.
export const TabIssueBadge: React.FC<{ badge?: TabIssueCount }> = ({ badge }) => {
  if (!badge) return null;
  if (badge.errors > 0) {
    const label = t('canvas.properties.requirements.blocking', { count: badge.errors });
    return (
      <span
        className="inline-flex items-center justify-center min-w-[14px] h-3.5 px-1 rounded-full bg-red-500/15 text-red-400 text-ice-2xs font-semibold"
        aria-label={label}
        title={label}
      >
        {badge.errors}
      </span>
    );
  }
  if (badge.warnings > 0) {
    const label = t(
      badge.warnings === 1 ? 'canvas.properties.requirements.warning' : 'canvas.properties.requirements.warnings',
      { count: badge.warnings },
    );
    return (
      <span
        className="inline-flex items-center justify-center min-w-[14px] h-3.5 px-1 rounded-full bg-amber-500/15 text-amber-400 text-ice-2xs font-semibold"
        aria-label={label}
        title={label}
      >
        {badge.warnings}
      </span>
    );
  }
  return null;
};

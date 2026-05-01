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
import { cn } from '../../../../shared/utils/cn';
import type { VisibleTab } from '../../utils/build-visible-tabs';

export interface PropertiesTabBarProps {
  visibleTabs: VisibleTab[];
  activeTab: string;
  onSelect: (id: string) => void;
}

export const PropertiesTabBar: React.FC<PropertiesTabBarProps> = ({
  visibleTabs,
  activeTab,
  onSelect,
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
        </button>
      ))}
    </div>
  );
};

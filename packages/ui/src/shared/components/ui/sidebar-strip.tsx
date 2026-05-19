/**
 * SidebarStrip — WebStorm-style tool window strip.
 *
 * Always-visible narrow vertical bar on the edge of the layout.
 * Each tab shows an icon + rotated text. Clicking toggles the panel.
 * Active tab is highlighted.
 */

import React from 'react';
import { cn } from '../../utils/cn';

export type SidebarSide = 'left' | 'right';

export interface SidebarStripTab {
  id: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
  onClick: () => void;
}

export interface SidebarStripProps {
  side: SidebarSide;
  tabs: SidebarStripTab[];
}

export const SidebarStrip: React.FC<SidebarStripProps> = ({ side, tabs }) => {
  if (tabs.length === 0) return null;

  return (
    <div
      className={cn(
        'flex flex-col items-center gap-1 py-1 bg-ice-surface select-none shrink-0 z-10 border-ice-border',
        side === 'left' ? 'border-r' : 'border-l ',
      )}
      style={{ width: 28 }}
    >
      {tabs.map((tab) => (
        <SidebarStripButton key={tab.id} tab={tab} side={side} />
      ))}
    </div>
  );
};

const SidebarStripButton: React.FC<{ tab: SidebarStripTab; side: SidebarSide }> = ({ tab, side }) => {
  const Icon = tab.icon;

  return (
    <button
      onClick={tab.onClick}
      title={tab.label}
      aria-label={tab.label}
      aria-pressed={tab.active}
      data-tour-id={`sidebar-strip-${tab.id}`}
      className={cn(
        'relative flex items-center justify-center w-[26px] py-1.5 rounded-sm transition-colors cursor-pointer',
        'hover:bg-ice-bg-hover',
        tab.active ? 'text-ice-accent' : 'text-ice-text-tertiary hover:text-ice-text-secondary',
      )}
      style={{ height: 'auto' }}
    >
      {/* Active indicator bar */}
      {tab.active && (
        <div
          aria-hidden="true"
          className="absolute top-0 bottom-0 w-[2px] bg-ice-accent"
          style={{ [side === 'left' ? 'left' : 'right']: 0 }}
        />
      )}

      <div className="flex flex-col items-center gap-1">
        <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span
          className="text-ice-2xs font-medium leading-none whitespace-nowrap"
          style={{
            writingMode: 'vertical-lr',
            textOrientation: 'mixed',
            transform: side === 'left' ? 'rotate(180deg)' : undefined,
          }}
        >
          {tab.label}
        </span>
      </div>
    </button>
  );
};

/**
 * Section — collapsible panel section.
 *
 * Lifted from `cost-panel.tsx` (rf-cost-4). Renders a clickable header row
 * with a chevron, optional icon, and an uppercase title; the body is shown
 * when `open === true` (default) and hidden otherwise.
 *
 * Each section manages its own open/closed state internally. The `defaultOpen`
 * prop seeds it; once toggled by the user, the parent has no further say.
 *
 * Note this is structurally distinct from `pipeline/components/section.tsx`
 * (always-open, semibold uppercase) — the cost panel needs the
 * collapse-on-click affordance because the panel is sidebar-narrow and seven
 * sections stack vertically.
 */

import { ChevronRight } from 'lucide-react';
import React, { useState } from 'react';
import { cn } from '../../../shared/utils/cn';

export interface SectionProps {
  title: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export const Section: React.FC<SectionProps> = ({ title, icon, defaultOpen = true, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-ice-border">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-ice-xs uppercase tracking-wider text-ice-text-3 hover:bg-ice-hover transition-colors"
        onClick={() => setOpen(!open)}
      >
        <ChevronRight className={cn('w-3 h-3 transition-transform', open && 'rotate-90')} />
        {icon}
        <span className="flex-1 text-left">{title}</span>
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
};

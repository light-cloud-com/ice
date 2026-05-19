/**
 * rf-ppanel-2 — Section.
 *
 * Collapsible-style section wrapper rendered by the pipeline panel
 * orchestrator. Stateless: shows a tinted icon, an uppercase title,
 * and an arbitrary children body.
 *
 * `iconClassName` is forwarded onto the lucide icon (used by the
 * Active Deployment section to spin a Loader2).
 */

import React from 'react';
import { cn } from '../../../shared/utils/cn';

export interface SectionProps {
  title: string;
  icon: React.ElementType;
  iconClassName?: string;
  children: React.ReactNode;
}

export const Section: React.FC<SectionProps> = ({ title, icon: Icon, iconClassName, children }) => (
  <div className="px-4 py-3 border-b border-ice-border">
    <div className="flex items-center gap-1.5 mb-2">
      <Icon className={cn('w-3.5 h-3.5 text-ice-text-3', iconClassName)} />
      <span className="text-xs font-semibold text-ice-text-2 uppercase tracking-wider">{title}</span>
    </div>
    {children}
  </div>
);

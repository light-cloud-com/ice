/**
 * Onboarding Checklist Widget
 *
 * Small floating widget in the bottom-left corner showing
 * remaining setup tasks. Appears after onboarding completes
 * if some steps were skipped. Dismissible.
 */

import { Check, X, ChevronUp, ChevronDown, ListChecks } from 'lucide-react';
import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { useTour } from '../../tour';
import { useTranslation } from '../../../i18n';
import { cn } from '../../../shared/utils/cn';
import type { RootState } from '../../../store';

interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
  /** Optional tour id — when present a "Show me how" link starts the tour. */
  tourId?: string;
}

const STORAGE_KEY = 'ice-onboarding-checklist-dismissed';

export const OnboardingChecklist: React.FC = () => {
  const { t } = useTranslation();
  const { start: startTour, isCompleted: isTourCompleted } = useTour();
  const user = useSelector((s: RootState) => s.account.user);

  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [collapsed, setCollapsed] = useState(true);
  const [tourHint, setTourHint] = useState<string | null>(null);

  // The canvas-tour highlights elements that only render on a project
  // canvas (#ice-canvas-svg, palette panel, properties panel, AI panel).
  // Folder view (the "dashboard" at /) doesn't render any of those, so
  // firing the tour from there would auto-skip every step silently and
  // "complete" without showing anything. Refuse the launch and surface
  // a hint instead.
  const handleStartTour = (tourId: string) => {
    if (typeof document !== 'undefined' && document.getElementById('ice-canvas-svg')) {
      setTourHint(null);
      startTour(tourId);
      return;
    }
    setTourHint(t('onboarding.checklist.openProjectForTour'));
  };

  // Don't show if user hasn't completed onboarding or if dismissed
  if (!user?.onboardingCompleted || dismissed) return null;

  // Cloud-provider + GitHub setup used to be checklist items here, but
  // the canvas tour now covers those surfaces (steps 8-9), so the
  // checklist collapses to "take the tour."
  const items: ChecklistItem[] = [
    {
      id: 'canvas-tour',
      label: t('onboarding.checklist.takeCanvasTour'),
      done: isTourCompleted('canvas-tour'),
      tourId: 'canvas-tour',
    },
  ];

  const doneCount = items.filter((i) => i.done).length;
  const allDone = doneCount === items.length;

  // Don't show if everything is done
  if (allDone) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="fixed bottom-4 left-4 z-50">
      {collapsed ? (
        <button
          onClick={() => setCollapsed(false)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-ice-surface border border-ice-border shadow-lg text-xs font-medium text-ice-text-1 hover:bg-ice-hover transition-colors"
        >
          <ListChecks className="w-3.5 h-3.5 text-ice-accent" />
          {t('onboarding.checklist.setup')} {doneCount}/{items.length}
          <ChevronUp className="w-3 h-3 text-ice-text-3" />
        </button>
      ) : (
        <div className="w-64 rounded-lg bg-ice-surface border border-ice-border shadow-lg">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-ice-border">
            <span className="text-xs font-semibold text-ice-text-1">{t('onboarding.checklist.title')}</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCollapsed(true)}
                className="p-0.5 rounded hover:bg-ice-hover text-ice-text-3 hover:text-ice-text-1 transition-colors"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleDismiss}
                className="p-0.5 rounded hover:bg-ice-hover text-ice-text-3 hover:text-ice-text-1 transition-colors"
                title={t('onboarding.checklist.dismissTitle')}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Items */}
          <div className="p-2 space-y-1">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-2 px-2 py-1.5 rounded text-xs">
                <div
                  className={cn(
                    'w-4 h-4 rounded-full flex items-center justify-center shrink-0',
                    item.done ? 'bg-emerald-500' : 'border border-ice-border',
                  )}
                >
                  {item.done && <Check className="w-2.5 h-2.5 text-white" />}
                </div>
                <span
                  className={cn('flex-1', item.done ? 'text-ice-text-2 line-through' : 'text-ice-text-1')}
                >
                  {item.label}
                </span>
                {item.tourId && !item.done && (
                  <button
                    type="button"
                    onClick={() => handleStartTour(item.tourId!)}
                    className="text-xs text-ice-accent hover:underline shrink-0"
                  >
                    {t('tour.actions.showMeHow')}
                  </button>
                )}
              </div>
            ))}
            {tourHint && (
              <p className="px-2 pt-1 text-[11px] text-ice-text-3 italic">
                {tourHint}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

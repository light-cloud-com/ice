/**
 * Onboarding Checklist Widget
 *
 * Small floating widget in the bottom-left corner showing
 * remaining setup tasks. Appears after onboarding completes
 * if some steps were skipped. Dismissible.
 */

import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Check, X, ChevronUp, ChevronDown, ListChecks } from 'lucide-react';
import { cn } from '../../../shared/utils/cn';
import { checkGitHubConnection } from '../../../store/slices/integrations-slice';
import type { RootState, AppDispatch } from '../../../store';

interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

const STORAGE_KEY = 'ice-onboarding-checklist-dismissed';

export const OnboardingChecklist: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const user = useSelector((s: RootState) => s.account.user);
  const githubStatus = useSelector((s: RootState) => s.integrations.integrations.github);
  const gcpStatus = useSelector((s: RootState) => s.integrations.integrations.gcp);

  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return false; }
  });
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    dispatch(checkGitHubConnection());
  }, [dispatch]);

  // Don't show if user hasn't completed onboarding or if dismissed
  if (!user?.onboardingCompleted || dismissed) return null;

  const items: ChecklistItem[] = [
    { id: 'account', label: 'Create account', done: true },
    { id: 'provider', label: 'Choose cloud provider', done: !!user.defaultProvider },
    { id: 'cloud', label: 'Connect cloud credentials', done: gcpStatus?.status === 'connected' },
    { id: 'github', label: 'Connect GitHub', done: githubStatus?.status === 'connected' },
  ];

  const doneCount = items.filter((i) => i.done).length;
  const allDone = doneCount === items.length;

  // Don't show if everything is done
  if (allDone) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(STORAGE_KEY, 'true'); } catch { /* ignore */ }
  };

  return (
    <div className="fixed bottom-4 left-4 z-50">
      {collapsed ? (
        <button
          onClick={() => setCollapsed(false)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-ice-surface border border-ice-border shadow-lg text-xs font-medium text-ice-text-1 hover:bg-ice-hover transition-colors"
        >
          <ListChecks className="w-3.5 h-3.5 text-ice-accent" />
          Setup: {doneCount}/{items.length}
          <ChevronUp className="w-3 h-3 text-ice-text-3" />
        </button>
      ) : (
        <div className="w-64 rounded-lg bg-ice-surface border border-ice-border shadow-lg">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-ice-border">
            <span className="text-xs font-semibold text-ice-text-1">Setup checklist</span>
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
                title="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Items */}
          <div className="p-2 space-y-1">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded text-xs"
              >
                <div
                  className={cn(
                    'w-4 h-4 rounded-full flex items-center justify-center shrink-0',
                    item.done
                      ? 'bg-emerald-500'
                      : 'border border-ice-border'
                  )}
                >
                  {item.done && <Check className="w-2.5 h-2.5 text-white" />}
                </div>
                <span
                  className={cn(
                    item.done ? 'text-ice-text-2 line-through' : 'text-ice-text-1'
                  )}
                >
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

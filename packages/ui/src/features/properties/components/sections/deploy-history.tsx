/**
 * Deploy History — recent deployment rows for a card.
 *
 * Auto-fetches the deploy history on mount via
 * `getApi().deploy.getDeployments(cardId)`, defensively coerces the response
 * to an array (`Array.isArray(data) ? data : []`), and silently swallows fetch
 * errors. Renders nothing when the history is empty (early-return).
 *
 * Each row is driven by `formatDeployRow(d)` from
 * `../../utils/deploy-history-format`: a localized timestamp, a human duration,
 * status flags (`isSuccess` / `isFailed` / `isPartial` / `isPending`) that
 * pick the leading status-dot color, and an action label/color pair (Plan /
 * Deploy / Destroy / Rollback). The header row is clickable — toggling adds
 * or removes `d.id` from an `expanded` Set so per-row expansion is
 * independent across rows. The expanded panel surfaces `d.error` in red, the
 * `summaryText` line, an optional resource list (`d.results.resources`) with
 * a per-resource success/fail dot, and a `provider · region · id-prefix`
 * footer.
 *
 * Visible slice: the first 15 rows by default; clicking the "Show all N
 * deploys" button flips `showAll` to true and renders all of them. The
 * threshold (15) and the show-all button text are preserved verbatim from
 * `properties-panel.tsx`.
 *
 * Single callsite in `properties-panel.tsx` — the `PropertiesPanel` body
 * mounts `<DeployHistory cardId={activeCard.id} />` for every selected card.
 *
 * Extracted verbatim from `properties-panel.tsx` lines 1538–1636 during
 * rf-props-19. The 15-row visible slice, the show-all toggle, the per-row
 * expand/collapse via `Set`, the dot-color cascade (success → failed →
 * partial → pending → muted fallback), and the silent-on-fail fetch are all
 * preserved exactly.
 */

import React, { useEffect, useState } from 'react';
import { t } from '../../../../i18n';
import { getApi } from '../../../../shared/api/api-adapter';
import { cn } from '../../../../shared/utils/cn';
import { Section } from '../fields';
import { formatDeployRow } from '../../utils/deploy-history-format';

// ─── Deploy History ──────────────────────────────────────────────────────────

export const DeployHistory: React.FC<{ cardId: string }> = ({ cardId }) => {
  const [history, setHistory] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await getApi().deploy.getDeployments(cardId);
        setHistory(Array.isArray(data) ? data : []);
      } catch {
        // ignore
      }
    })();
  }, [cardId]);

  if (history.length === 0) return null;

  const visible = showAll ? history : history.slice(0, 15);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Section title={t('properties.deploy.history')}>
      <div className="space-y-0.5">
        {visible.map((d, i) => {
          const { time, duration, isSuccess, isFailed, isPartial, isPending, actionLabel, actionColor, summaryText } = formatDeployRow(d);
          const isExpanded = expanded.has(d.id);
          return (
            <div key={d.id || i} className="text-ice-xs">
              <div
                className="flex items-center gap-2 py-1 cursor-pointer hover:bg-ice-bg-2/50 -mx-1 px-1 rounded"
                onClick={() => toggleExpand(d.id)}
              >
                <div
                  className={cn(
                    'w-1.5 h-1.5 rounded-full shrink-0',
                    isSuccess
                      ? 'bg-emerald-500'
                      : isFailed
                        ? 'bg-red-500'
                        : isPartial
                          ? 'bg-amber-500'
                          : isPending
                            ? 'bg-blue-500 animate-pulse'
                            : 'bg-slate-500',
                  )}
                />
                <span className={cn('text-ice-2xs px-1 py-0.5 rounded', actionColor)}>{actionLabel}</span>
                <span className="text-ice-text-2 truncate">{time}</span>
                {d.environment && <span className="text-ice-2xs text-ice-text-3">{d.environment}</span>}
                {duration && <span className="ml-auto text-ice-text-3 font-mono">{duration}</span>}
              </div>
              {summaryText && !isExpanded && (
                <div className="pl-4 pb-1 text-ice-2xs text-ice-text-3">{summaryText}</div>
              )}
              {isExpanded && (
                <div className="pl-4 pb-2 space-y-1 text-ice-2xs">
                  {d.error && <div className="text-red-400 break-words">{d.error}</div>}
                  {summaryText && <div className="text-ice-text-2">{summaryText}</div>}
                  {Array.isArray(d.results?.resources) && d.results.resources.length > 0 && (
                    <div className="space-y-0.5">
                      {d.results.resources.map((r: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-2 font-mono">
                          <span
                            className={cn('w-1 h-1 rounded-full shrink-0', r.success ? 'bg-emerald-500' : 'bg-red-500')}
                          />
                          <span className="text-ice-text-3 truncate">{r.type}</span>
                          <span className="text-ice-text-2 truncate">{r.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="text-ice-text-3 font-mono">
                    {d.provider} · {d.region} · {d.id.slice(0, 8)}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {!showAll && history.length > 15 && (
          <button className="text-ice-2xs text-ice-text-3 hover:text-ice-text-2 pt-1" onClick={() => setShowAll(true)}>
            Show all {history.length} deploys
          </button>
        )}
      </div>
    </Section>
  );
};

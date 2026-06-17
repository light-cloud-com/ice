/**
 * Monitoring.Log properties section.
 *
 * Rendered by `properties-panel.tsx` when a `Monitoring.Log` block is
 * selected. Reads everything from Redux — the canvas-side hook
 * (`use-log-stream.ts`) is the only writer of `logs-slice`, this section
 * only writes to `cards-slice` (`updateCardNodeData`) which the hook
 * watches via `node.data.streamingMode` / `node.data.sourceNodeIdOverride`.
 *
 * Three controls:
 *  1. Streaming mode — Polling (default) / Tail.
 *  2. Source override — only when the stream resolution is `ambiguous`
 *     or `none`. Hidden when the resolution is already resolved /
 *     pre-deploy / unsupported / permission-denied (those states have
 *     their own handling and a manual override would be misleading).
 *  3. Connection status pill — bound to the LT-5 hook's status with a
 *     fixed color/label mapping.
 *
 * Caveats from the resolver (e.g. the MongoDB host-logs-only note) are
 * rendered verbatim under the pill so the user sees them while the
 * stream is live.
 */

import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { t } from '../../../../i18n';
import { selectActiveCard, updateCardNodeData, type CardNode } from '../../../../store/slices/cards-slice';
import {
  clearEntries,
  retryStream,
  selectLogStream,
  type LogStreamMode,
  type LogStreamStatus,
} from '../../../../store/slices/logs-slice';
import type { AppDispatch, RootState } from '../../../../store';

// ─── LT-2 supported source iceTypes ─────────────────────────────────────────
// Mirrors `services/deploy/src/services/log-stream/filter-resolver.ts`. If a
// new source iceType becomes supported, add it here AND in the resolver. We
// keep the list local rather than re-exporting from the service because
// `packages/ui` cannot import from `services/`. The drift is bounded —
// adding a candidate that the resolver rejects just means the user picks
// it and the hook flips to `unsupported`, which is recoverable.

const SUPPORTED_LOG_SOURCE_ICE_TYPES: ReadonlySet<string> = new Set([
  'Compute.Container',
  'Compute.SsrSite',
  'Compute.ServerlessFunction',
  'Compute.Worker',
  'Database.PostgreSQL',
  'Database.MySQL',
  'Database.Redis',
  'Database.MongoDB',
]);

// Sentinel for the "no override" / "clear override" select option. Using a
// non-nodeId-shaped string keeps the select API uniform — the value is
// always a string — and the handler maps it back to `undefined`.
const CLEAR_OVERRIDE_SENTINEL = '__ice_log_clear_override__';

interface Props {
  nodeId: string;
}

// ─── Status pill mapping ────────────────────────────────────────────────────

type PillTone = 'green' | 'amber' | 'grey' | 'red';

interface PillSpec {
  tone: PillTone;
  label: string;
}

function pillFor(status: LogStreamStatus | undefined): PillSpec {
  switch (status) {
    case 'streaming':
      return { tone: 'green', label: t('canvas.properties.log.pillLive') };
    case 'connecting':
      return { tone: 'amber', label: t('canvas.properties.log.pillConnecting') };
    case 'pre-deploy':
      return { tone: 'grey', label: t('canvas.properties.log.pillPreDeploy') };
    case 'no-source':
      return { tone: 'grey', label: t('canvas.properties.log.pillNoSource') };
    case 'ambiguous':
      return { tone: 'grey', label: t('canvas.properties.log.pillAmbiguous') };
    case 'unsupported':
      return { tone: 'grey', label: t('canvas.properties.log.pillUnsupported') };
    case 'provider-unsupported':
      return { tone: 'grey', label: t('canvas.properties.log.pillProviderUnsupported') };
    case 'permission-denied':
      return { tone: 'red', label: t('canvas.properties.log.pillAccessDenied') };
    case 'error':
      return { tone: 'red', label: t('canvas.properties.log.pillError') };
    case 'idle':
    default:
      return { tone: 'grey', label: t('canvas.properties.log.pillIdle') };
  }
}

const PILL_CLASSES: Record<PillTone, string> = {
  // Tailwind-token palette consistent with the rest of the panel — emerald
  // for OK, amber for transient, red for failure, neutral grey for the
  // "waiting on user / waiting on deploy" cluster.
  green: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  amber: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  grey: 'bg-ice-base/40 text-ice-text-3 border-ice-border',
  red: 'bg-red-500/15 text-red-300 border-red-500/30',
};

// ─── Component ──────────────────────────────────────────────────────────────

export function MonitoringLogSection({ nodeId }: Props): React.ReactElement | null {
  const dispatch = useDispatch<AppDispatch>();
  const activeCard = useSelector(selectActiveCard);
  const node: CardNode | undefined = activeCard?.nodes.find((n) => n.id === nodeId);
  const streamState = useSelector((s: RootState) => selectLogStream(s, nodeId));

  if (!node) return null;

  const mode: LogStreamMode = ((node.data?.streamingMode as LogStreamMode | undefined) ?? 'polling') as LogStreamMode;
  const sourceNodeIdOverride = (node.data?.sourceNodeIdOverride as string | undefined) ?? '';

  const pill = pillFor(streamState?.status);
  const sourceState = streamState?.source?.state;
  const showOverride = sourceState === 'ambiguous' || sourceState === 'none';

  // Caveats are carried on the resolved variant of SourceResolution.
  // Render them verbatim (per LT-6 contract: do not paraphrase).
  const caveats: string[] = (() => {
    const src = streamState?.source;
    if (src && src.state === 'resolved' && src.caveats?.length) return src.caveats;
    return [];
  })();

  // Show inline error text only when the status is terminal-error-shaped.
  // The pill already conveys the state; this is the actionable detail.
  const errorMessage =
    (streamState?.status === 'error' || streamState?.status === 'permission-denied') && streamState.lastError
      ? streamState.lastError
      : null;

  // ─── Candidate sources for the override dropdown ─────────────────────────
  // For 'ambiguous', the resolver already enumerated the candidates — use
  // them directly so the dropdown matches the pill's reasoning. For 'none'
  // the candidate list is empty by construction; we render a disabled
  // placeholder. The "compute candidates from inbound edges" path is the
  // fallback when the resolver hasn't (yet) populated the candidates list.
  interface Candidate {
    nodeId: string;
    label: string;
    iceType: string;
  }

  const candidates: Candidate[] = (() => {
    if (sourceState === 'ambiguous' && streamState?.source?.state === 'ambiguous') {
      return streamState.source.candidates.map((c) => ({
        nodeId: c.nodeId,
        label:
          c.label ||
          (activeCard?.nodes.find((n) => n.id === c.nodeId)?.data?.label as string | undefined) ||
          c.nodeId.slice(0, 8),
        iceType: c.iceType,
      }));
    }
    if (sourceState === 'none' && activeCard) {
      const inbound = activeCard.edges.filter((e) => e.target === nodeId);
      return inbound
        .map((e) => activeCard.nodes.find((n) => n.id === e.source))
        .filter((n): n is CardNode => !!n)
        .filter((n) => SUPPORTED_LOG_SOURCE_ICE_TYPES.has((n.data?.iceType as string) || ''))
        .map((n) => ({
          nodeId: n.id,
          label: (n.data?.label as string) || n.id.slice(0, 8),
          iceType: (n.data?.iceType as string) || '',
        }));
    }
    return [];
  })();

  const handleModeChange = (next: LogStreamMode) => {
    dispatch(updateCardNodeData({ nodeId, data: { streamingMode: next } }));
  };

  const handleOverrideChange = (next: string) => {
    // '' from the placeholder / clear option means "no override".
    dispatch(
      updateCardNodeData({
        nodeId,
        data: { sourceNodeIdOverride: next === '' ? undefined : next },
      }),
    );
  };

  return (
    <div className="pt-3 pb-2 px-3" data-testid="monitoring-log-section">
      <div className="text-ice-2xs font-medium tracking-wide text-ice-text-3/50 mb-2">
        {t('canvas.properties.log.sectionTitle')}
      </div>

      {/* Connection status pill */}
      <div className="flex items-center gap-2 mb-2">
        <span
          data-testid="monitoring-log-status-pill"
          data-pill-tone={pill.tone}
          className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-ice-2xs font-medium ${PILL_CLASSES[pill.tone]}`}
        >
          <span
            aria-hidden
            className={
              pill.tone === 'green'
                ? 'w-1.5 h-1.5 rounded-full bg-emerald-400'
                : pill.tone === 'amber'
                  ? 'w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse'
                  : pill.tone === 'red'
                    ? 'w-1.5 h-1.5 rounded-full bg-red-400'
                    : 'w-1.5 h-1.5 rounded-full bg-ice-text-3/50'
            }
          />
          {pill.label}
        </span>

        {/* OL3 — clear the buffer (the clearEntries reducer existed but was
            wired to nothing). Shown only when there are entries to clear. */}
        {(streamState?.entries?.length ?? 0) > 0 && (
          <button
            data-testid="monitoring-log-clear"
            onClick={() => dispatch(clearEntries({ terminalNodeId: nodeId }))}
            className="ml-auto rounded border border-ice-border px-1.5 py-0.5 text-ice-2xs font-medium text-ice-text-2 hover:bg-ice-hover transition-colors"
          >
            {t('canvas.properties.log.clear')}
          </button>
        )}
      </div>

      {/* Caveats — rendered verbatim from the resolver. */}
      {caveats.length > 0 && (
        <div className="mb-2 space-y-1">
          {caveats.map((c, i) => (
            <p key={i} data-testid="monitoring-log-caveat" className="text-ice-2xs text-ice-text-2 leading-snug">
              {c}
            </p>
          ))}
        </div>
      )}

      {/* Inline error detail (only on error / permission-denied). */}
      {errorMessage && (
        <p data-testid="monitoring-log-error" className="mb-2 text-ice-2xs text-red-300 leading-snug">
          {errorMessage}
        </p>
      )}

      {/* OL5 — recover in-product: re-subscribe after the user fixes the cause
          (e.g. grants the IAM role) without reloading the app. */}
      {(streamState?.status === 'error' || streamState?.status === 'permission-denied') && (
        <button
          data-testid="monitoring-log-retry"
          onClick={() => dispatch(retryStream({ terminalNodeId: nodeId }))}
          className="mb-2 inline-flex items-center gap-1 rounded border border-ice-border px-1.5 py-0.5 text-ice-2xs font-medium text-ice-text-2 hover:bg-ice-hover transition-colors"
        >
          {t('canvas.properties.log.retry')}
        </button>
      )}

      {/* Streaming mode radio */}
      <div className="space-y-0.5 mb-2">
        <label
          data-testid="monitoring-log-mode-polling"
          className="flex items-start gap-2 py-1.5 px-2 rounded hover:bg-ice-hover cursor-pointer"
        >
          <input
            type="radio"
            name={`monitoring-log-mode-${nodeId}`}
            value="polling"
            checked={mode === 'polling'}
            onChange={() => handleModeChange('polling')}
            className="mt-0.5 accent-emerald-500"
          />
          <div className="flex-1 min-w-0">
            <div className="text-ice-xs text-ice-text-1">{t('canvas.properties.log.modePolling')}</div>
            <div className="text-ice-2xs text-ice-text-3 leading-snug">
              {t('canvas.properties.log.modePollingHint')}
            </div>
          </div>
        </label>
        <label
          data-testid="monitoring-log-mode-tail"
          className="flex items-start gap-2 py-1.5 px-2 rounded hover:bg-ice-hover cursor-pointer"
        >
          <input
            type="radio"
            name={`monitoring-log-mode-${nodeId}`}
            value="tail"
            checked={mode === 'tail'}
            onChange={() => handleModeChange('tail')}
            className="mt-0.5 accent-emerald-500"
          />
          <div className="flex-1 min-w-0">
            <div className="text-ice-xs text-ice-text-1">{t('canvas.properties.log.modeTail')}</div>
            <div className="text-ice-2xs text-ice-text-3 leading-snug">{t('canvas.properties.log.modeTailHint')}</div>
          </div>
        </label>
      </div>

      {/* Source override — only when the resolution is ambiguous or none. */}
      {showOverride && (
        <div className="px-2 pt-1 space-y-1" data-testid="monitoring-log-source-override">
          <div className="text-ice-2xs text-ice-text-3">{t('canvas.properties.log.sourceOverride')}</div>
          {candidates.length === 0 ? (
            <p className="text-ice-2xs text-ice-text-3/70 italic leading-snug">
              {t('canvas.properties.log.noSupportedSource')}
            </p>
          ) : (
            <select
              data-testid="monitoring-log-source-select"
              value={sourceNodeIdOverride === '' ? CLEAR_OVERRIDE_SENTINEL : sourceNodeIdOverride}
              onChange={(e) => handleOverrideChange(e.target.value === CLEAR_OVERRIDE_SENTINEL ? '' : e.target.value)}
              className="w-full px-1.5 py-1 text-ice-xs rounded border border-ice-border bg-ice-base text-ice-text-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value={CLEAR_OVERRIDE_SENTINEL}>
                {sourceNodeIdOverride
                  ? t('canvas.properties.log.clearOverride')
                  : t('canvas.properties.log.selectSource')}
              </option>
              {candidates.map((c) => (
                <option key={c.nodeId} value={c.nodeId}>
                  {`${c.label} · ${c.iceType.split('.').pop() ?? c.iceType}`}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  );
}

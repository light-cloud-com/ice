/**
 * LogPanel
 *
 * Scrollable, monospaced log viewer surfaced during plan/deploy/destroy. Each
 * row is the deploy slice's `logs[i]` prefixed with a 3-character right-padded
 * line number (space-padded, NOT zero-padded). The trailing `<div ref={...}/>`
 * is the auto-scroll anchor: the orchestrator's `useEffect` (and eventually
 * `useDeployEffects` in rf-pdpl-21) calls `logEndRef.current?.scrollIntoView`
 * on `deploy.logs.length` changes, which means the ref MUST be owned by the
 * caller and threaded through as a prop — moving `useRef` into this component
 * would break the auto-scroll because the orchestrator's effect would close
 * over a stale ref every render.
 *
 * Extraction notes (rf-pdpl-10):
 * - The `deploy.logs.length > 0` gate stays at the orchestrator's call site
 *   (consistent with rf-pdpl-8/-9). The component itself is defensive about
 *   empty arrays — it renders the outer container with no rows but the
 *   trailing ref-div still present, so the orchestrator dropping the gate
 *   would be a benign no-op rather than a render error.
 * - `text-ice-text-3` is a project-specific Tailwind token; preserved verbatim.
 * - `String(i + 1).padStart(3, ' ')` produces space-padding (U+0020), not
 *   zero-padding. Three characters at lengths 1–99; numbers ≥ 100 are already
 *   3-character so `padStart` is a no-op. This shape is load-bearing for the
 *   monospaced "1 / 99 / 100" right-aligned look.
 *
 * Extracted from `deploy-panel.tsx` lines 673–687.
 */
import React from 'react';

interface LogPanelProps {
  logs: string[];
  logEndRef: React.RefObject<HTMLDivElement>;
}

export const LogPanel: React.FC<LogPanelProps> = ({ logs, logEndRef }) => {
  return (
    <div
      id="ice-deploy-log"
      className="rounded-md border border-border bg-slate-950 text-slate-300 p-3 max-h-48 overflow-y-auto font-mono text-xs leading-relaxed"
    >
      {logs.map((log, i) => (
        <div key={i} className="flex gap-2">
          <span className="text-ice-text-3 select-none">{String(i + 1).padStart(3, ' ')}</span>
          <span>{log}</span>
        </div>
      ))}
      <div ref={logEndRef} />
    </div>
  );
};

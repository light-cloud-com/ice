/**
 * DnsRecordsSection
 *
 * Custom-domain DNS records — surfaced from any Firebase Hosting result that
 * registered a custom domain. Each row is copyable so the user can paste
 * straight into their registrar without digging through the Firebase Console.
 *
 * Two palettes per result card:
 * - Blue add-records block: the records the user must ADD at their DNS
 *   provider to verify domain ownership.
 * - Amber remove-records block: pre-existing records that conflict with the
 *   new configuration and BLOCK verification — must be removed.
 *
 * Extraction notes (rf-pdpl-11):
 * - Replaces the inline IIFE at deploy-panel.tsx L577–672. The IIFE pattern
 *   was a smell that the inline empty-state early-return was buying; the
 *   extracted component owns the early-return so the orchestrator collapses
 *   to a clean `<DnsRecordsSection results={deploy.results} />`.
 * - `extractDnsResults` (length === 0 → `null`) and `splitDnsByAction` come
 *   from rf-pdpl-3's `utils/dns-records`. The data-shaping is identical to
 *   the source IIFE — this module is the JSX counterpart.
 * - RISK #7 from the rf-pdpl blueprint: keep the `(r.outputs as any).custom_domain_dns_records`
 *   and `(r.outputs as any)?.custom_domain` casts verbatim. `outputs` is
 *   `Record<string, unknown>` because the server hands back arbitrary
 *   provider-specific output bags; switching to a type guard would silently
 *   drop malformed records the original code would have rendered (and shown
 *   as visibly-broken in the UI, which is the desired feedback loop for a
 *   deployer bug).
 * - Hardcoded English strings ("DNS records for", "Add the records below…",
 *   "Remove the records below…", "Type", "Domain name", "Value", "Copy",
 *   "Copy value to clipboard") are NOT in the i18n catalog and stay verbatim.
 *   The em-dash in "DNS provider — they conflict" is U+2014 (preserved
 *   byte-identical from the source).
 * - `renderRecord` and `renderHeader` are file-private helpers below the FC,
 *   not closures inside the FC body. They're pure renderers that take the
 *   per-row data + a palette config; lifting them out of the FC body keeps
 *   the section's render readable without changing observable shape.
 * - The Copy button's `navigator.clipboard.writeText(...).catch(() => undefined)`
 *   swallows clipboard rejections (Safari without user activation, headless
 *   environments). Preserved verbatim — silently dropping a copy is the
 *   intended behavior; the Copy click is best-effort UX.
 */
import React from 'react';

import { cn } from '../../../../shared/utils/cn';
import { extractDnsResults, splitDnsByAction, type DnsRec } from '../../utils/dns-records';
import type { DeployResourceResult } from '../../../../store/slices/deploy-slice';

interface DnsRecordsSectionProps {
  results: DeployResourceResult[];
}

interface PaletteConfig {
  bg: string;
  type: string;
  chip: string;
  chipHover: string;
}

const renderRecord = (rec: DnsRec, ridx: number, palette: PaletteConfig) => (
  <div key={ridx} className={cn('flex items-center gap-2 text-xs font-mono px-2 py-1.5 rounded', palette.bg)}>
    <span className={cn('font-semibold w-12 shrink-0', palette.type)}>{rec.type}</span>
    <span className="text-muted-foreground truncate flex-shrink min-w-0" title={rec.domain}>
      {rec.domain}
    </span>
    <span className="text-foreground truncate flex-1 min-w-0" title={rec.value}>
      {rec.value}
    </span>
    <button
      onClick={() => {
        navigator.clipboard.writeText(rec.value).catch(() => undefined);
      }}
      className={cn('shrink-0 px-2 py-0.5 text-[10px] rounded', palette.chip, palette.chipHover)}
      title="Copy value to clipboard"
    >
      Copy
    </button>
  </div>
);

const renderHeader = () => (
  <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground px-2 pb-1">
    <span className="w-12 shrink-0">Type</span>
    <span className="flex-shrink min-w-0">Domain name</span>
    <span className="flex-1 min-w-0">Value</span>
    <span className="w-10 shrink-0" />
  </div>
);

export const DnsRecordsSection: React.FC<DnsRecordsSectionProps> = ({ results }) => {
  const dnsResults = extractDnsResults(results);
  if (dnsResults.length === 0) return null;

  return (
    <div className="space-y-2">
      {dnsResults.map((r, idx) => {
        const { addRecords, removeRecords } = splitDnsByAction(
          ((r.outputs as any).custom_domain_dns_records || []) as DnsRec[],
        );
        const customDomain = (r.outputs as any)?.custom_domain || r.name;
        return (
          <div
            key={`${r.name}-${idx}`}
            className="rounded-md border border-blue-500/30 bg-blue-50 dark:bg-blue-950/20 p-3 space-y-3"
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-blue-700 dark:text-blue-300">
                DNS records for {customDomain}
              </span>
            </div>

            {addRecords.length > 0 && (
              <div className="space-y-1">
                <div className="text-[11px] font-medium text-blue-700 dark:text-blue-300">
                  Add the records below at your DNS provider to verify that you own {customDomain}
                </div>
                {renderHeader()}
                {addRecords.map((rec, ridx) =>
                  renderRecord(rec, ridx, {
                    bg: 'bg-background/60',
                    type: 'text-blue-700 dark:text-blue-300',
                    chip: 'bg-blue-500/20 text-blue-700 dark:text-blue-300',
                    chipHover: 'hover:bg-blue-500/30',
                  }),
                )}
              </div>
            )}

            {removeRecords.length > 0 && (
              <div className="space-y-1">
                <div className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                  Remove the records below from your DNS provider — they conflict with the new configuration and
                  block verification
                </div>
                {renderHeader()}
                {removeRecords.map((rec, ridx) =>
                  renderRecord(rec, ridx, {
                    bg: 'bg-amber-50 dark:bg-amber-950/30',
                    type: 'text-amber-700 dark:text-amber-300',
                    chip: 'bg-amber-500/20 text-amber-700 dark:text-amber-300',
                    chipHover: 'hover:bg-amber-500/30',
                  }),
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

/**
 * DNS Record Card (Phase 8)
 *
 * Shared presentational component for rendering a DNS record that a user
 * needs to add at their registrar. Used by the deploy panel Requirements
 * section and by the block properties panel so the "add this record"
 * instruction looks the same everywhere.
 *
 * Clicking a value copies it to the clipboard. A "Copy all" button copies
 * the record in a `TYPE NAME VALUE TTL` format so users can paste it into
 * a terminal or a registrar's bulk import.
 */

import { Copy, CheckCircle2, AlertCircle, Loader2, ExternalLink } from 'lucide-react';
import React from 'react';

export interface DnsRecordCardProps {
  recordType: string;
  name: string;
  value: string;
  ttl?: number;
  /** When provided, renders a verification status chip. */
  status?: 'unknown' | 'checking' | 'unmet' | 'met' | 'verified' | 'expired';
  lastCheckedAt?: string;
  /** Triggered when the user clicks "Verify now". */
  onVerify?: () => void;
  /** When true, disables the Verify button and shows a spinner. */
  verifying?: boolean;
}

const STATUS_CHIPS: Record<NonNullable<DnsRecordCardProps['status']>, { label: string; className: string; icon: React.ReactNode }> = {
  unknown: {
    label: 'Not checked',
    className: 'text-muted-foreground bg-muted/50',
    icon: <AlertCircle className="w-3 h-3" />,
  },
  checking: {
    label: 'Checking…',
    className: 'text-blue-600 dark:text-blue-400 bg-blue-500/10',
    icon: <Loader2 className="w-3 h-3 animate-spin" />,
  },
  unmet: {
    label: 'Waiting for record',
    className: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
    icon: <AlertCircle className="w-3 h-3" />,
  },
  met: {
    label: 'Configured',
    className: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  verified: {
    label: 'Verified',
    className: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  expired: {
    label: 'Timed out',
    className: 'text-red-600 dark:text-red-400 bg-red-500/10',
    icon: <AlertCircle className="w-3 h-3" />,
  },
};

export const DnsRecordCard: React.FC<DnsRecordCardProps> = ({
  recordType,
  name,
  value,
  ttl = 300,
  status,
  lastCheckedAt,
  onVerify,
  verifying = false,
}) => {
  const [copied, setCopied] = React.useState<string | null>(null);
  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1200);
    } catch {
      // Clipboard API unavailable — silently fall through.
    }
  };

  const lastChecked = lastCheckedAt ? new Date(lastCheckedAt) : null;
  const relative = lastChecked ? timeAgo(lastChecked) : null;
  const chip = status ? STATUS_CHIPS[status] : null;

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2 text-sm">
      {chip && (
        <div className="flex items-center justify-between">
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${chip.className}`}>
            {chip.icon}
            {chip.label}
          </span>
          {relative && <span className="text-xs text-muted-foreground">checked {relative}</span>}
        </div>
      )}
      <div className="grid grid-cols-[60px_1fr] gap-x-3 gap-y-1 font-mono text-xs">
        <span className="text-muted-foreground">Type</span>
        <span className="font-semibold">{recordType}</span>
        <span className="text-muted-foreground">Name</span>
        <span className="break-all">{name}</span>
        <span className="text-muted-foreground">Value</span>
        <button
          onClick={() => copy(value, 'value')}
          className="text-left break-all hover:text-foreground transition-colors cursor-pointer"
          title="Click to copy"
        >
          {value}
          {copied === 'value' && <span className="ml-2 text-emerald-500">copied</span>}
        </button>
        <span className="text-muted-foreground">TTL</span>
        <span>{ttl}</span>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => copy(`${recordType} ${name} ${value} ${ttl}`, 'all')}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-border hover:bg-muted transition-colors"
        >
          <Copy className="w-3 h-3" />
          {copied === 'all' ? 'Copied!' : 'Copy record'}
        </button>
        {onVerify && (
          <button
            onClick={onVerify}
            disabled={verifying}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-border hover:bg-muted transition-colors disabled:opacity-50"
          >
            {verifying ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
            Verify now
          </button>
        )}
        <a
          href="https://www.google.com/search?q=how+to+add+DNS+record+at+my+registrar"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground ml-auto"
        >
          <ExternalLink className="w-3 h-3" />
          How to add
        </a>
      </div>
    </div>
  );
};

function timeAgo(date: Date): string {
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

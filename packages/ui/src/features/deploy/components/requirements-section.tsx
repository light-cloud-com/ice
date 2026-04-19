/**
 * Requirements Section (Phase 8)
 *
 * Renders the resolved block requirements returned from
 * `/api/canvas/deploy/requirements`. Grouped by timing (before-deploy first,
 * then post-deploy), with blocking items at the top of each group.
 *
 * Rendered inside the deploy panel between the plan preview and the
 * progress section.
 */

import { AlertCircle, CheckCircle2, Clock, Loader2, Lock, RefreshCw, Unlock } from 'lucide-react';
import React from 'react';

import type { ResolvedRequirementState } from '../../../store/slices/deploy-slice';
import { DnsRecordCard } from './dns-record-card';

interface RequirementsSectionProps {
  requirements: ResolvedRequirementState[];
  loading?: boolean;
  onVerify?: (definitionId: string, nodeId: string | undefined) => void;
  verifyingId?: string | null;
}

export const RequirementsSection: React.FC<RequirementsSectionProps> = ({
  requirements,
  loading = false,
  onVerify,
  verifyingId,
}) => {
  if (loading && requirements.length === 0) {
    return (
      <div className="rounded-md border border-border bg-muted/20 p-3 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Checking block requirements…
      </div>
    );
  }

  if (requirements.length === 0) return null;

  const beforeDeploy = requirements.filter((r) => r.timing === 'before-deploy');
  const postDeploy = requirements.filter((r) => r.timing === 'post-deploy');
  const blockingUnmet = requirements.filter((r) => r.blocking && r.result.status !== 'met' && r.result.status !== 'verified');

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="px-4 py-2 bg-muted/40 border-b border-border text-sm font-medium flex items-center gap-2">
        {blockingUnmet.length > 0 ? (
          <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
        ) : (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
        )}
        Requirements
        <span className="text-xs font-normal text-muted-foreground ml-1">
          {blockingUnmet.length > 0
            ? `${blockingUnmet.length} blocking`
            : `${requirements.length} total`}
        </span>
      </div>
      <div className="divide-y divide-border">
        {beforeDeploy.length > 0 && (
          <RequirementGroup
            title="Before deploy"
            requirements={beforeDeploy}
            onVerify={onVerify}
            verifyingId={verifyingId}
          />
        )}
        {postDeploy.length > 0 && (
          <RequirementGroup
            title="Post-deploy"
            requirements={postDeploy}
            onVerify={onVerify}
            verifyingId={verifyingId}
          />
        )}
      </div>
    </div>
  );
};

const RequirementGroup: React.FC<{
  title: string;
  requirements: ResolvedRequirementState[];
  onVerify?: (definitionId: string, nodeId: string | undefined) => void;
  verifyingId?: string | null;
}> = ({ title, requirements, onVerify, verifyingId }) => (
  <div className="px-4 py-3 space-y-3">
    <div className="text-xs uppercase font-medium text-muted-foreground tracking-wide">{title}</div>
    <div className="space-y-3">
      {requirements.map((req) => (
        <RequirementRow
          key={`${req.definitionId}:${req.nodeId ?? ''}`}
          requirement={req}
          onVerify={onVerify}
          verifying={verifyingId === `${req.definitionId}:${req.nodeId ?? ''}`}
        />
      ))}
    </div>
  </div>
);

function formatLastChecked(iso?: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '';
  const now = Date.now();
  const secondsAgo = Math.round((now - date.getTime()) / 1000);
  if (secondsAgo < 0) return 'just now';
  if (secondsAgo < 60) return `${secondsAgo}s ago`;
  if (secondsAgo < 3600) return `${Math.round(secondsAgo / 60)}m ago`;
  if (secondsAgo < 86400) return `${Math.round(secondsAgo / 3600)}h ago`;
  return date.toLocaleString();
}

const RequirementRow: React.FC<{
  requirement: ResolvedRequirementState;
  onVerify?: (definitionId: string, nodeId: string | undefined) => void;
  verifying?: boolean;
}> = ({ requirement, onVerify, verifying = false }) => {
  const { title, description, result, action, blocking, timing } = requirement;
  const isVerified = result.status === 'verified' || result.status === 'met';
  const isExpired = result.status === 'expired';
  const isUnmet = result.status === 'unmet';
  const isUnknown = result.status === 'unknown';
  const isPending = result.status === 'checking';
  // Every unresolved post-deploy requirement gets a "Check again" button so
  // users aren't stuck watching a static UNKNOWN/PROVISIONING message with
  // no way to re-trigger the check. Cert issuance polling runs server-side
  // every 60s, but users want manual control too.
  const showRecheck = !isVerified && timing === 'post-deploy' && action?.type !== 'copy-dns-record';

  const statusIcon = isVerified ? (
    <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
  ) : verifying || isPending ? (
    <Loader2 className="w-4 h-4 text-blue-500 animate-spin flex-shrink-0" />
  ) : isExpired ? (
    // Timed-out looks different from unmet — a clock, not an alert — so the
    // user knows the check is inconclusive rather than failed. Blocks that
    // haven't finished propagating (DNS, cert issuance) land here.
    <Clock className="w-4 h-4 text-sky-500 flex-shrink-0" />
  ) : isUnmet ? (
    <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
  ) : (
    <AlertCircle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
  );

  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5">{statusIcon}</div>
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{title}</span>
          {blocking && !isVerified && (
            <span className="inline-flex items-center gap-0.5 text-xs text-red-600 dark:text-red-400 font-medium">
              <Lock className="w-3 h-3" />
              blocking
            </span>
          )}
          {blocking && isVerified && (
            <span className="inline-flex items-center gap-0.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              <Unlock className="w-3 h-3" />
              satisfied
            </span>
          )}
          {isUnknown && (
            <span className="text-xs text-muted-foreground font-medium">unknown</span>
          )}
          {isExpired && (
            <span className="text-xs text-sky-600 dark:text-sky-400 font-medium">timed out</span>
          )}
        </div>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
        {result.message && (
          <p
            className={`text-xs ${
              isUnmet
                ? 'text-amber-600 dark:text-amber-400'
                : isExpired
                  ? 'text-sky-600 dark:text-sky-400'
                  : 'text-muted-foreground'
            }`}
          >
            {result.message}
          </p>
        )}
        {result.lastCheckedAt && (
          <p className="text-xs text-muted-foreground/70">
            Last checked {formatLastChecked(result.lastCheckedAt)}
          </p>
        )}
        {action?.type === 'copy-dns-record' && action.payload && (
          <DnsRecordCard
            recordType={String((action.payload as any).record_type || '')}
            name={String((action.payload as any).name || '')}
            value={String((action.payload as any).value || '')}
            ttl={Number((action.payload as any).ttl || 300)}
            status={result.status}
            lastCheckedAt={result.lastCheckedAt}
            onVerify={onVerify ? () => onVerify(requirement.definitionId, requirement.nodeId) : undefined}
            verifying={verifying}
          />
        )}
        {action && action.type !== 'copy-dns-record' && (
          <button
            onClick={() => onVerify?.(requirement.definitionId, requirement.nodeId)}
            disabled={verifying}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-border hover:bg-muted transition-colors disabled:opacity-50"
          >
            {verifying ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            {action.label}
          </button>
        )}
        {/* Fallback recheck button for post-deploy requirements that have no
            explicit action (e.g. managed cert issuance status polling). */}
        {showRecheck && !action && onVerify && (
          <button
            onClick={() => onVerify(requirement.definitionId, requirement.nodeId)}
            disabled={verifying}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-border hover:bg-muted transition-colors disabled:opacity-50"
          >
            {verifying ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Checking…
              </>
            ) : (
              <>
                <RefreshCw className="w-3 h-3" />
                Check again
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};

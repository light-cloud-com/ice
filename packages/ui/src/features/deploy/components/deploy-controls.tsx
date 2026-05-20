/**
 * DeployControls
 *
 * Footer button row for the deploy panel — Reset (left) + Stop / Plan /
 * Deploy / Destroy (right). The component owns its OWN cancel-fetch (the
 * inline `await fetch('/api/canvas/deploy/cancel', ...)` from the Stop
 * button) so the orchestrator does not need to reach into Redux to dispatch
 * `appendLog` from a button onClick — instead, the orchestrator passes an
 * `onAppendLog(msg: string)` callback that wraps `dispatch(appendLog(...))`.
 *
 * Extracted in rf-pdpl-19 from `deploy-panel.tsx` lines 585–742.
 *
 * Public-API contract — preserved verbatim:
 * - The five `id="ice-deploy-btn-*"` selectors (cancel/stop/plan/apply/destroy)
 *   are E2E selectors used by Playwright tests — do NOT rename.
 * - The error-message format `'Cancel failed: ${err?.message || err}'` is
 *   load-bearing for log-output tests and the user-facing log string.
 * - The em-dash in `'Stop requested — deploy will wind down after the
 *   current resource.'` is U+2014 (preserved byte-identical).
 * - The Deploy-button "deploy disabled" IIFE (computing `deployDisabled`,
 *   `deployTitle`, `hasBlockingUnmet`, `blockedByCritical`) stays inline
 *   inside the JSX so the per-render derivation runs in the JSX tree, not
 *   as a memoized derivation outside the button.
 */
import { X, Loader2, Eye, Play, Trash2 } from 'lucide-react';
import React from 'react';
import { useTranslation } from '../../../i18n';
import { cn } from '../../../shared/utils/cn';
import type { DeployStatus, ResolvedRequirementState } from '../../../store/slices/deploy-slice';

export type DeployControlsProps = {
  status: DeployStatus;
  provider: string;
  gcpProject: string;
  gcpNodesCount: number;
  deployedResourcesCount: number;
  requirements: ResolvedRequirementState[];
  preDeployHasCritical: boolean;
  criticalAcknowledged: boolean;
  activeCardId: string | null;
  onPlan: () => void;
  onDeploy: () => void;
  onReset: () => void;
  onOpenDestroyModal: () => void;
  onAppendLog: (msg: string) => void;
};

export const DeployControls: React.FC<DeployControlsProps> = ({
  status,
  provider,
  gcpProject,
  gcpNodesCount,
  deployedResourcesCount,
  requirements,
  preDeployHasCritical,
  criticalAcknowledged,
  activeCardId,
  onPlan,
  onDeploy,
  onReset,
  onOpenDestroyModal,
  onAppendLog,
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-muted/30">
      <button
        onClick={onReset}
        disabled={status === 'deploying' || status === 'destroying'}
        id="ice-deploy-btn-cancel"
        className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        title={
          status === 'deploying'
            ? 'Cannot clear while a deploy is running'
            : status === 'destroying'
              ? 'Cannot clear while a destroy is running'
              : 'Clear plan and results'
        }
      >
        {t('deploy.buttons.reset')}
      </button>
      <div className="flex items-center gap-2">
        {/* Phase 5: Stop button shown only while deploying. Calls the
              cancel endpoint which flips the deploy's AbortSignal. */}
        {status === 'deploying' && (
          <button
            onClick={async () => {
              if (!activeCardId) return;
              try {
                await fetch('/api/canvas/deploy/cancel', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({ cardId: activeCardId }),
                });
                onAppendLog('Stop requested — deploy will wind down after the current resource.');
              } catch (err: any) {
                onAppendLog(`Cancel failed: ${err?.message || err}`);
              }
            }}
            id="ice-deploy-btn-stop"
            className={cn(
              'flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-md transition-colors font-medium',
              'bg-amber-600 text-white hover:bg-amber-700',
            )}
            title="Request the in-flight deploy to stop"
          >
            <X className="w-3.5 h-3.5" />
            Stop
          </button>
        )}
        {/* Plan button */}
        <button
          onClick={onPlan}
          disabled={
            !gcpProject ||
            gcpNodesCount === 0 ||
            status === 'planning' ||
            status === 'deploying' ||
            status === 'destroying' ||
            status === 'authenticating'
          }
          id="ice-deploy-btn-plan"
          title={
            !gcpProject
              ? 'Select a GCP project to continue'
              : gcpNodesCount === 0
                ? 'Add at least one resource block to deploy'
                : status === 'deploying'
                  ? 'Deploy in progress'
                  : status === 'planning'
                    ? 'Planning…'
                    : 'Generate a deploy plan'
          }
          className={cn(
            'flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-md transition-colors',
            'bg-muted hover:bg-muted/80 border border-border',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          {status === 'planning' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
          {t('deploy.buttons.plan')}
        </button>

        {/* Deploy button */}
        {(() => {
          const blockingUnmetReqs = requirements.filter(
            (r) => r.blocking && r.result.status !== 'met' && r.result.status !== 'verified',
          );
          const hasBlockingUnmet = blockingUnmetReqs.length > 0;
          const blockedByCritical = preDeployHasCritical === true && !criticalAcknowledged;
          const deployDisabled =
            !gcpProject ||
            gcpNodesCount === 0 ||
            status === 'deploying' ||
            status === 'destroying' ||
            status === 'planning' ||
            status === 'authenticating' ||
            hasBlockingUnmet ||
            blockedByCritical;
          const deployTitle = !gcpProject
            ? 'Select a GCP project to continue'
            : gcpNodesCount === 0
              ? `Add at least one ${provider.toUpperCase()} resource block to deploy`
              : status === 'deploying'
                ? 'Deploy in progress — click Stop to cancel'
                : status === 'planning'
                  ? 'Waiting for plan to finish'
                  : hasBlockingUnmet
                    ? `Blocked by ${blockingUnmetReqs.length} requirement(s): ${blockingUnmetReqs.map((r) => r.title).join(', ')}`
                    : deployedResourcesCount > 0
                      ? 'Deploy updated infrastructure'
                      : 'Deploy to cloud';
          return (
            <button
              onClick={onDeploy}
              disabled={deployDisabled}
              id="ice-deploy-btn-apply"
              title={deployTitle}
              className={cn(
                'flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-md transition-colors font-medium',
                'bg-emerald-600 text-white hover:bg-emerald-700',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              {status === 'deploying' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              {deployedResourcesCount > 0 ? t('deploy.buttons.updateInfrastructure') : t('deploy.buttons.deploy')}
            </button>
          );
        })()}

        {/* Destroy button — only when resources are deployed */}
        {/* Destroy button — shown whenever there are deployed resources
              OR any historical deployment (even failed ones) might have
              leftover infrastructure. The destroy modal itself handles the
              "last deploy only" vs "everything ever" split via a toggle. */}
        {status !== 'deploying' && (
          <button
            onClick={onOpenDestroyModal}
            id="ice-deploy-btn-destroy"
            className={cn(
              'flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-md transition-colors font-medium',
              'bg-red-600 text-white hover:bg-red-700',
            )}
            title="Destroy deployed resources — including orphaned leftovers from failed deploys"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {t('deploy.buttons.destroy')}
          </button>
        )}
      </div>
    </div>
  );
};

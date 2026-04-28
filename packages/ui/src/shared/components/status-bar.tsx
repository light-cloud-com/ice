/**
 * Status Bar Component
 *
 * Bottom status bar showing:
 * - Graph statistics (from active card)
 * - Validation status (clickable → opens Validation panel)
 * - Estimated cost
 * - Zoom level
 * - Connection status
 */

import {
  Circle,
  GitBranch,
  Box,
  Link,
  AlertTriangle,
  CheckCircle,
  Info,
  DollarSign,
  Rocket,
  Loader2,
  XCircle,
} from 'lucide-react';
import React, { useMemo } from 'react';
import { useSelector, useDispatch, shallowEqual } from 'react-redux';
import { IntegrationStatusDots } from '../../features/integrations';
import { useTranslation } from '../../i18n';
import { selectActiveCard } from '../../store/slices/cards-slice';
import { deriveRollup } from '../../store/slices/deploy-slice';
import { openValidation } from '../../store/slices/ui-slice';
import { useSystemStats } from '../hooks/use-system-stats';
import type { RootState } from '../../store';

function parseCostRange(cost: string): number {
  const matches = cost.match(/\$(\d+)(?:[–-](\d+))?/);
  if (!matches) return 0;
  const low = parseInt(matches[1]);
  const high = matches[2] ? parseInt(matches[2]) : low;
  return (low + high) / 2;
}

export const StatusBar: React.FC = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const activeCard = useSelector(selectActiveCard);
  const { isDirty, iceGraph } = useSelector((state: RootState) => state.graph);
  const { selectedNodes, selectedEdges } = useSelector((state: RootState) => state.selection);

  // Get viewport zoom from pane state or card viewport
  const activePaneId = useSelector((state: RootState) => state.ui.splitView.activePaneId);
  const panes = useSelector((state: RootState) => state.ui.splitView.panes);
  const activePane = panes.find((p) => p.id === activePaneId);
  const cardScale = activeCard?.viewport?.scale ?? 1;
  const zoom = activePane?.viewport?.scale !== 1 ? (activePane?.viewport?.scale ?? cardScale) : cardScale;

  const systemStats = useSystemStats(10000);

  // Use active card for counts
  const nodeCount = activeCard?.nodes.length ?? 0;
  const edgeCount = activeCard?.edges.length ?? 0;

  // Total estimated cost from active card
  const totalCost = useMemo(() => {
    if (!activeCard) return 0;
    return activeCard.nodes.reduce((sum, n) => {
      const cost = (n.data?.estimatedCost as string) || '';
      return sum + parseCostRange(cost);
    }, 0);
  }, [activeCard]);

  // Validation issue counts from the canvas validation engine
  const validationSummary = useSelector((state: RootState) => state.validation?.summary);
  const validationErrors = validationSummary?.errors ?? 0;
  const validationWarnings = validationSummary?.warnings ?? 0;
  const hasIssues = validationErrors > 0 || validationWarnings > 0;

  return (
    <div
      className="h-6 flex items-center gap-4 px-3 border-t border-ice-border bg-ice-toolbar text-xs text-ice-text-3"
      data-testid="status-bar"
    >
      {/* Graph name */}
      <div className="flex items-center gap-1.5">
        <GitBranch className="w-3 h-3" />
        <span>{activeCard?.name || iceGraph?.name || t('common.labels.untitled')}</span>
        {isDirty && <Circle className="w-1.5 h-1.5 fill-current text-ice-accent" />}
      </div>

      <StatusDivider />

      {/* Node count */}
      <div className="flex items-center gap-1.5">
        <Box className="w-3 h-3" />
        <span>
          {nodeCount} {nodeCount !== 1 ? t('statusBar.nodes') : t('statusBar.node')}
        </span>
      </div>

      {/* Edge count */}
      <div className="flex items-center gap-1.5">
        <Link className="w-3 h-3" />
        <span>
          {edgeCount} {edgeCount !== 1 ? t('statusBar.edges') : t('statusBar.edge')}
        </span>
      </div>

      {/* Cost estimate */}
      {totalCost > 0 && (
        <>
          <StatusDivider />
          <div className="flex items-center gap-1 text-ice-green">
            <DollarSign className="w-3 h-3" />
            <span>
              ~${Math.round(totalCost)}
              {t('statusBar.moEst')}
            </span>
          </div>
        </>
      )}

      <StatusDivider />

      {/* Selection */}
      {(selectedNodes.length > 0 || selectedEdges.length > 0) && (
        <>
          <div className="flex items-center gap-1.5 text-ice-accent">
            <Info className="w-3 h-3" />
            <span>
              {selectedNodes.length > 0 && t('statusBar.selectedCount', { count: selectedNodes.length })}
              {selectedNodes.length > 0 && selectedEdges.length > 0 && ', '}
              {selectedEdges.length > 0 &&
                `${selectedEdges.length} ${selectedEdges.length !== 1 ? t('statusBar.edges') : t('statusBar.edge')}`}
            </span>
          </div>
          <StatusDivider />
        </>
      )}

      {/* Validation status — clickable, opens Validation sidebar panel */}
      <button
        onClick={() => hasIssues && dispatch(openValidation())}
        className={`flex items-center gap-2 rounded px-1 -mx-1 transition-colors ${
          hasIssues ? 'hover:bg-ice-bg-raised cursor-pointer' : 'cursor-default'
        }`}
      >
        {validationErrors > 0 ? (
          <div className="flex items-center gap-1 text-ice-red">
            <AlertTriangle className="w-3 h-3" />
            <span>
              {validationErrors} {validationErrors !== 1 ? t('statusBar.errors') : t('statusBar.error')}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-ice-green">
            <CheckCircle className="w-3 h-3" />
            <span>{t('statusBar.valid')}</span>
          </div>
        )}
        {validationWarnings > 0 && (
          <div className="flex items-center gap-1 text-ice-yellow">
            <AlertTriangle className="w-3 h-3" />
            <span>{validationWarnings}</span>
          </div>
        )}
      </button>

      {/* Deploy status */}
      <DeployStatusIndicator />

      {/* Integration status dots */}
      <IntegrationStatusDots />

      {/* Spacer */}
      <div className="flex-1" />

      {/* System resource usage */}
      {systemStats && (
        <>
          <div className="flex items-center gap-3 text-ice-text-3">
            <span>
              {t('statusBar.ram')}:{' '}
              {systemStats.ram >= 1024 ? `${(systemStats.ram / 1024).toFixed(1)}GB` : `${systemStats.ram}MB`}
            </span>
            <span>
              {t('statusBar.cpu')}: {systemStats.cpu}%
            </span>
          </div>
          <StatusDivider />
        </>
      )}

      {/* Zoom level */}
      <div className="flex items-center gap-1.5">
        <span>{Math.round(zoom * 100)}%</span>
      </div>

      {/* Version */}
      <div className="flex items-center gap-1.5 opacity-50">
        <span>{t('statusBar.version')}</span>
      </div>
    </div>
  );
};

const DeployStatusIndicator: React.FC = () => {
  const { t } = useTranslation();
  const deployStatus = useSelector((state: RootState) => state.deploy.status);
  // pdl-5 — derive the deploying-pill percentage from the same `nodesById`
  // rollup the deploy panel uses, so the status bar and the panel agree
  // on what "X%" means. `shallowEqual` keeps re-renders cheap during the
  // event-stream burst.
  const deployNodesById = useSelector(
    (state: RootState) => state.deploy.nodesById,
    shallowEqual,
  );
  const rollup = useMemo(() => deriveRollup(deployNodesById), [deployNodesById]);
  const deployProgress =
    rollup.total === 0
      ? 0
      : rollup.terminal === rollup.total
        ? 100
        : Math.min(99, Math.round((rollup.terminal / Math.max(rollup.total, 1)) * 100));

  if (deployStatus === 'idle') return null;

  return (
    <>
      <StatusDivider />
      <div className="flex items-center gap-1.5">
        {deployStatus === 'authenticating' && (
          <>
            <Loader2 className="w-3 h-3 animate-spin text-ice-yellow" />
            <span className="text-ice-yellow">{t('statusBar.connecting')}</span>
          </>
        )}
        {deployStatus === 'deploying' && (
          <>
            <Loader2 className="w-3 h-3 animate-spin text-ice-green" />
            <span className="text-ice-green">{t('statusBar.deploying', { pct: deployProgress })}</span>
          </>
        )}
        {deployStatus === 'planning' && (
          <>
            <Loader2 className="w-3 h-3 animate-spin text-ice-accent" />
            <span className="text-ice-accent">{t('statusBar.planning')}</span>
          </>
        )}
        {deployStatus === 'success' && (
          <>
            <CheckCircle className="w-3 h-3 text-ice-green" />
            <span className="text-ice-green">{t('statusBar.deployed')}</span>
          </>
        )}
        {deployStatus === 'error' && (
          <>
            <XCircle className="w-3 h-3 text-ice-red" />
            <span className="text-ice-red">{t('statusBar.deployFailed')}</span>
          </>
        )}
        {deployStatus === 'planned' && (
          <>
            <Rocket className="w-3 h-3 text-ice-yellow" />
            <span className="text-ice-yellow">{t('statusBar.planReady')}</span>
          </>
        )}
      </div>
    </>
  );
};

const StatusDivider: React.FC = () => <div className="w-px h-3 bg-ice-border" />;

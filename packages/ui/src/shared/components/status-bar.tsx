/**
 * Status Bar Component
 *
 * Bottom status bar showing:
 * - Graph statistics (from active card)
 * - Validation status
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
import { useSelector } from 'react-redux';
import { IntegrationStatusDots } from '../../features/integrations';
import { useTranslation } from '../../i18n';
import { selectActiveCard } from '../../store/slices/cards-slice';
import type { RootState } from '../../store';
import { useSystemStats } from '../hooks/use-system-stats';

function parseCostRange(cost: string): number {
  const matches = cost.match(/\$(\d+)(?:[–-](\d+))?/);
  if (!matches) return 0;
  const low = parseInt(matches[1]);
  const high = matches[2] ? parseInt(matches[2]) : low;
  return (low + high) / 2;
}

export const StatusBar: React.FC = () => {
  const { t } = useTranslation();
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

  // Count validation issues (mock for now)
  const validationErrors: number = 0;
  const validationWarnings: number = 0;

  return (
    <div
      className="h-6 flex items-center gap-4 px-3 border-t border-border bg-muted/50 text-xs text-muted-foreground"
      data-testid="status-bar"
    >
      {/* Graph name */}
      <div className="flex items-center gap-1.5">
        <GitBranch className="w-3 h-3" />
        <span>{activeCard?.name || iceGraph?.name || t('common.labels.untitled')}</span>
        {isDirty && <Circle className="w-1.5 h-1.5 fill-current text-primary" />}
      </div>

      <StatusDivider />

      {/* Node count */}
      <div className="flex items-center gap-1.5">
        <Box className="w-3 h-3" />
        <span>
          {nodeCount} node{nodeCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Edge count */}
      <div className="flex items-center gap-1.5">
        <Link className="w-3 h-3" />
        <span>
          {edgeCount} edge{edgeCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Cost estimate */}
      {totalCost > 0 && (
        <>
          <StatusDivider />
          <div className="flex items-center gap-1 text-emerald-600">
            <DollarSign className="w-3 h-3" />
            <span>~${Math.round(totalCost)}/mo est.</span>
          </div>
        </>
      )}

      <StatusDivider />

      {/* Selection */}
      {(selectedNodes.length > 0 || selectedEdges.length > 0) && (
        <>
          <div className="flex items-center gap-1.5 text-primary">
            <Info className="w-3 h-3" />
            <span>
              {selectedNodes.length > 0 && `${selectedNodes.length} selected`}
              {selectedNodes.length > 0 && selectedEdges.length > 0 && ', '}
              {selectedEdges.length > 0 && `${selectedEdges.length} edge${selectedEdges.length !== 1 ? 's' : ''}`}
            </span>
          </div>
          <StatusDivider />
        </>
      )}

      {/* Validation status */}
      <div className="flex items-center gap-2">
        {validationErrors > 0 ? (
          <div className="flex items-center gap-1 text-destructive">
            <AlertTriangle className="w-3 h-3" />
            <span>
              {validationErrors} error{validationErrors !== 1 ? 's' : ''}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-green-600">
            <CheckCircle className="w-3 h-3" />
            <span>{t('statusBar.valid')}</span>
          </div>
        )}
        {validationWarnings > 0 && (
          <div className="flex items-center gap-1 text-yellow-600">
            <AlertTriangle className="w-3 h-3" />
            <span>{validationWarnings}</span>
          </div>
        )}
      </div>

      {/* Deploy status */}
      <DeployStatusIndicator />

      {/* Integration status dots */}
      <IntegrationStatusDots />

      {/* Spacer */}
      <div className="flex-1" />

      {/* System resource usage */}
      {systemStats && (
        <>
          <div className="flex items-center gap-3 text-muted-foreground">
            <span>RAM: {systemStats.ram >= 1024 ? `${(systemStats.ram / 1024).toFixed(1)}GB` : `${systemStats.ram}MB`}</span>
            <span>CPU: {systemStats.cpu}%</span>
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
  const deployProgress = useSelector((state: RootState) => state.deploy.progress);

  if (deployStatus === 'idle') return null;

  return (
    <>
      <StatusDivider />
      <div className="flex items-center gap-1.5">
        {deployStatus === 'authenticating' && (
          <>
            <Loader2 className="w-3 h-3 animate-spin text-orange-500" />
            <span className="text-orange-600">{t('statusBar.connecting')}</span>
          </>
        )}
        {deployStatus === 'deploying' && (
          <>
            <Loader2 className="w-3 h-3 animate-spin text-emerald-500" />
            <span className="text-emerald-600">{t('statusBar.deploying', { pct: deployProgress })}</span>
          </>
        )}
        {deployStatus === 'planning' && (
          <>
            <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
            <span className="text-blue-600">{t('statusBar.planning')}</span>
          </>
        )}
        {deployStatus === 'success' && (
          <>
            <CheckCircle className="w-3 h-3 text-emerald-500" />
            <span className="text-emerald-600">{t('statusBar.deployed')}</span>
          </>
        )}
        {deployStatus === 'error' && (
          <>
            <XCircle className="w-3 h-3 text-red-500" />
            <span className="text-red-600">{t('statusBar.deployFailed')}</span>
          </>
        )}
        {deployStatus === 'planned' && (
          <>
            <Rocket className="w-3 h-3 text-yellow-500" />
            <span className="text-yellow-600">{t('statusBar.planReady')}</span>
          </>
        )}
      </div>
    </>
  );
};

const StatusDivider: React.FC = () => <div className="w-px h-3 bg-border" />;

/**
 * App Bar — shared between web and desktop
 */

import awsIcon from 'devicon/icons/amazonwebservices/amazonwebservices-original-wordmark.svg';
import azureIcon from 'devicon/icons/azure/azure-original.svg';
import gcpIcon from 'devicon/icons/googlecloud/googlecloud-original.svg';
import {
  Rows3,
  Columns3,
  CircleDot,
  Spline,
  Minus,
  GitCommitHorizontal,
  Maximize2,
  Rocket,
  Sun,
  Moon,
  Github,
  Undo2,
  Redo2,
  Palette,
  Lock,
  LockOpen,
  Grid3X3,
} from 'lucide-react';
import React, { memo, useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Breadcrumbs } from './breadcrumbs';
import { useThemePicker } from './dev-accent-picker';
import { LanguageSwitch } from './language-switch';
import { IceSelect } from './ui/ice-select';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from './ui/tooltip';
import logoDark from '../../assets/logo-dark.png';
import logoLight from '../../assets/logo-light.png';
import { DeployPanel } from '../../features/deploy/components/deploy-panel';
import { PromoteModal } from '../../features/environments/components/promote-modal';
import { GitHubConnectModal } from '../../features/integrations/components/github-connect-modal';
import { ProviderConnectModal } from '../../features/integrations/components/provider-connect-modal';
import { useTranslation } from '../../i18n';
import {
  autoOrganizeCard,
  undoCardChange,
  redoCardChange,
  selectCanUndo,
  selectCanRedo,
  setCardViewport,
  setActiveCard,
  importToActiveCard,
  createCard,
} from '../../store/slices/cards-slice';
import { openDeployPanel } from '../../store/slices/deploy-slice';
import { fetchEnvironments, setActiveEnvironment } from '../../store/slices/environments-slice';
import { checkGitHubConnection } from '../../store/slices/integrations-slice';
import {
  setEdgeStyle,
  setAutoOrganizeStyle,
  toggleSnapToGrid,
  toggleCanvasLocked,
  type EdgeStyle,
  type OrganizeStyle,
} from '../../store/slices/ui-slice';
import { getApi } from '../api/api-adapter';
import { useTheme } from '../hooks/use-theme';
import { cn } from '../utils/cn';
import type { RootState, AppDispatch } from '../../store';

/** Detect Electron + macOS + fullscreen state for traffic light padding */
function useElectronTitleBar() {
  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;
  const isMacOS = isElectron && (window as any).electronAPI?.platform === 'darwin';
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!isElectron) return;
    // Listen for fullscreen/maximize events from Electron main process via preload bridge
    const cleanup = (window as any).electronAPI?.onFullscreenChange?.((fs: boolean) => {
      setIsFullscreen(fs);
    });
    return cleanup;
  }, [isElectron]);

  return { isElectron, isMacOS, isFullscreen, showTrafficLightPad: isMacOS && !isFullscreen };
}

export const AppBar: React.FC = memo(() => {
  const { t } = useTranslation();
  const { isDark, toggle, fontSize, increaseFontSize, decreaseFontSize } = useTheme();
  const { toggle: toggleThemePicker } = useThemePicker();
  const { isElectron, showTrafficLightPad } = useElectronTitleBar();
  const dispatch = useDispatch<AppDispatch>();
  const deployIsOpen = useSelector((s: RootState) => s.deploy.isOpen);
  const deployStatus = useSelector((s: RootState) => s.deploy.status);
  const githubStatus = useSelector((s: RootState) => s.integrations.integrations.github?.status);
  const gcpStatus = useSelector((s: RootState) => s.integrations.integrations.gcp?.status);
  const [showGitHub, setShowGitHub] = useState(false);
  const [showGcp, setShowGcp] = useState(false);
  const [showAws, setShowAws] = useState(false);
  const [showAzure, setShowAzure] = useState(false);

  // ── Environment selector state ──
  const projectId = useSelector((s: RootState) => s.projects.activeProjectId);
  const environments = useSelector((s: RootState) => (projectId ? s.environments.byProject[projectId] || [] : []));
  const activeEnvId = useSelector((s: RootState) => (projectId ? s.environments.activeEnvId[projectId] : undefined));

  useEffect(() => {
    if (projectId) dispatch(fetchEnvironments(projectId));
  }, [projectId, dispatch]);

  const handleSwitchEnv = useCallback(
    async (envId: string) => {
      if (!projectId) return;
      const env = environments.find((e) => e.id === envId);
      if (!env) return;
      dispatch(setActiveEnvironment({ projectId, envId }));
      try {
        const { store } = await import('../../store');
        const state = store.getState();
        const existing = (state.cards as any).cards.find((c: any) => c.id === env.card_id);
        if (existing && existing.nodes.length > 0) {
          dispatch(setActiveCard(env.card_id));
          return;
        }
        const api = getApi();
        const cardData = await api.graph.load(env.card_id);
        if (!cardData) return;
        if (!existing) {
          dispatch(createCard({ name: cardData.name || env.name, id: cardData.id, projectId }));
        }
        dispatch(setActiveCard(cardData.id));
        if (cardData.nodes?.length > 0 || cardData.edges?.length > 0) {
          dispatch(
            importToActiveCard({ nodes: cardData.nodes || [], edges: cardData.edges || [], skipAutoOrganize: true }),
          );
        }
      } catch (err) {
        console.error('Failed to load environment card:', err);
      }
    },
    [projectId, environments, dispatch],
  );

  const canUndo = useSelector(selectCanUndo);
  const canRedo = useSelector(selectCanRedo);
  const edgeStyle = useSelector((state: RootState) => state.ui.edgeStyle) as EdgeStyle;
  const autoOrganizeStyle = useSelector((state: RootState) => state.ui.autoOrganizeStyle) as OrganizeStyle;

  const cycleEdgeStyle = () => {
    const order: EdgeStyle[] = ['bezier', 'straight', 'rectangular'];
    const next = order[(order.indexOf(edgeStyle) + 1) % order.length];
    dispatch(setEdgeStyle(next));
  };
  const edgeIcon = edgeStyle === 'straight' ? Minus : edgeStyle === 'rectangular' ? GitCommitHorizontal : Spline;
  const snapEnabled = useSelector((state: RootState) => state.ui.snapToGrid);
  const canvasLocked = useSelector((state: RootState) => state.ui.canvasLocked);

  // Selection-aware organize: if a single container is selected, organize inside it
  const selectedNodes = useSelector((state: RootState) => state.selection.selectedNodes);
  const activeCard = useSelector((state: RootState) => {
    const cards = state.cards as any;
    return cards.cards?.find((c: any) => c.id === cards.activeCardId);
  });
  const selectedContainerId = React.useMemo(() => {
    if (selectedNodes.length !== 1 || !activeCard) return undefined;
    const node = activeCard.nodes?.find((n: any) => n.id === selectedNodes[0]);
    return node?.type === 'container' ? node.id : undefined;
  }, [selectedNodes, activeCard]);
  const currentZoom: number = (activeCard?.viewport?.scale as number) ?? 1;

  useEffect(() => {
    dispatch(checkGitHubConnection());
  }, [dispatch]);

  return (
    <>
      <TooltipProvider delayDuration={300}>
        <header
          data-testid="toolbar"
          className="h-11 flex items-center gap-2 px-3 border-b border-ice-border bg-ice-toolbar relative z-[9999] shrink-0 transition-[padding]"
          style={{
            paddingLeft: showTrafficLightPad ? '78px' : undefined,
            ...(isElectron ? ({ WebkitAppRegion: 'drag' } as any) : {}),
          }}
        >
          <div
            className="flex items-center gap-2.5 min-w-0"
            style={isElectron ? ({ WebkitAppRegion: 'no-drag' } as any) : undefined}
          >
            <img
              src={isDark ? logoDark : logoLight}
              alt="ICE"
              width={60}
              height={18}
              className="h-[18px] object-contain shrink-0"
            />
            <div className="w-px h-4 bg-ice-border shrink-0" />
            <Breadcrumbs />
          </div>
          <div className="flex-1" />
          <div
            className="flex items-center gap-0.5"
            style={isElectron ? ({ WebkitAppRegion: 'no-drag' } as any) : undefined}
          >
            <BarBtn
              id="ice-appbar-btn-organize-v"
              icon={Rows3}
              onClick={() => {
                dispatch(
                  autoOrganizeCard({ direction: 'vertical', containerId: selectedContainerId, zoom: currentZoom }),
                );
                dispatch(setAutoOrganizeStyle('vertical'));
              }}
              tip={selectedContainerId ? 'Organize group (vertical)' : 'Auto-organize all (vertical)'}
            />
            <BarBtn
              id="ice-appbar-btn-organize-h"
              icon={Columns3}
              onClick={() => {
                dispatch(
                  autoOrganizeCard({ direction: 'horizontal', containerId: selectedContainerId, zoom: currentZoom }),
                );
                dispatch(setAutoOrganizeStyle('horizontal'));
              }}
              tip={selectedContainerId ? 'Organize group (horizontal)' : 'Auto-organize all (horizontal)'}
            />
            <BarBtn
              id="ice-appbar-btn-organize-c"
              icon={CircleDot}
              onClick={() => {
                dispatch(autoOrganizeCard({ layout: 'circular', containerId: selectedContainerId, zoom: currentZoom }));
                dispatch(setAutoOrganizeStyle('circular'));
              }}
              tip={selectedContainerId ? 'Organize group (circular)' : 'Auto-organize all (circular)'}
            />
            <BarBtn
              id="ice-appbar-btn-fit-view"
              icon={Maximize2}
              onClick={() => {
                if (!activeCard?.nodes?.length) return;
                const nodes = activeCard.nodes;
                let minX = Infinity,
                  minY = Infinity,
                  maxX = -Infinity,
                  maxY = -Infinity;
                for (const n of nodes) {
                  minX = Math.min(minX, n.position.x);
                  minY = Math.min(minY, n.position.y);
                  maxX = Math.max(maxX, n.position.x + (n.width || 240));
                  maxY = Math.max(maxY, n.position.y + (n.height || 80));
                }
                const pad = 60;
                const bw = maxX - minX + pad * 2;
                const bh = maxY - minY + pad * 2;
                const vw = window.innerWidth - 300;
                const vh = window.innerHeight - 80;
                const zoom = Math.min(Math.max(vw / bw, 0.1), Math.min(vh / bh, 2));
                const panX = -minX + pad + (vw / zoom - bw + pad * 2) / 2;
                const panY = -minY + pad + (vh / zoom - bh + pad * 2) / 2;
                dispatch(setCardViewport({ panX, panY, scale: zoom }));
              }}
              tip="Fit to view"
            />
            <BarSep />
            <BarBtn
              id="ice-appbar-btn-edge-style"
              icon={edgeIcon}
              onClick={cycleEdgeStyle}
              tip={`Connection style: ${edgeStyle}`}
            />
            <BarBtn
              id="ice-appbar-btn-snap"
              icon={Grid3X3}
              onClick={() => dispatch(toggleSnapToGrid())}
              tip={snapEnabled ? 'Snap to grid: ON' : 'Snap to grid: OFF'}
              className={snapEnabled ? 'text-blue-400 bg-blue-500/10' : undefined}
            />
            <BarBtn
              id="ice-appbar-btn-lock"
              icon={canvasLocked ? Lock : LockOpen}
              onClick={() => dispatch(toggleCanvasLocked())}
              tip={canvasLocked ? 'Canvas locked' : 'Lock canvas'}
              className={canvasLocked ? 'text-amber-400 bg-amber-500/10' : undefined}
            />
            <BarBtn
              id="ice-appbar-btn-undo"
              icon={Undo2}
              onClick={() => dispatch(undoCardChange())}
              tip={t('appBar.undo')}
              disabled={!canUndo}
            />
            <BarBtn
              id="ice-appbar-btn-redo"
              icon={Redo2}
              onClick={() => dispatch(redoCardChange())}
              tip={t('appBar.redo')}
              disabled={!canRedo}
            />
            {projectId && environments.length > 0 && (
              <>
                <BarSep />
                <IceSelect
                  value={activeEnvId || ''}
                  onChange={handleSwitchEnv}
                  allowEmpty={false}
                  options={environments.map((env) => ({
                    value: env.id,
                    label: `${env.is_protected ? '🔒 ' : ''}${env.name}${env.type === 'pr' && env.pr_number ? ` #${env.pr_number}` : ''}`,
                  }))}
                  placeholder="Environment"
                  width="140px"
                />
              </>
            )}
            <BarSep />
            <BarBtn
              id="ice-appbar-btn-deploy"
              icon={Rocket}
              onClick={() => dispatch(openDeployPanel())}
              tip={t('appBar.deploy')}
              className={cn('text-emerald-500 hover:text-emerald-400', deployStatus === 'deploying' && 'animate-pulse')}
            />
            <BarSep />
            <BarImgBtn
              id="ice-appbar-btn-gcp"
              src={gcpIcon}
              onClick={() => setShowGcp(true)}
              tip={t('common.providers.gcp')}
              connected={gcpStatus === 'connected'}
            />
            <BarImgBtn
              id="ice-appbar-btn-aws"
              src={awsIcon}
              onClick={() => setShowAws(true)}
              tip={t('common.providers.aws')}
            />
            <BarImgBtn
              id="ice-appbar-btn-azure"
              src={azureIcon}
              onClick={() => setShowAzure(true)}
              tip={t('common.providers.azure')}
            />
            <BarBtn
              id="ice-appbar-btn-github"
              icon={Github}
              onClick={() => setShowGitHub(true)}
              tip={t('integrations.github.title')}
              className={githubStatus === 'connected' ? 'text-emerald-500' : undefined}
            />
            <BarSep />
            <BarBtn icon={Palette} onClick={toggleThemePicker} tip="Color themes" />
            <BarBtn
              icon={isDark ? Sun : Moon}
              onClick={toggle}
              tip={isDark ? t('appBar.lightMode') : t('appBar.darkMode')}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={decreaseFontSize}
                  disabled={fontSize === 'small'}
                  aria-label={t('appBar.decreaseFont')}
                  className={cn(
                    'px-1 py-0.5 rounded text-ice-xs font-bold transition-[color,background-color,opacity]',
                    fontSize === 'small'
                      ? 'text-ice-text-3 opacity-40'
                      : 'text-ice-text-3 hover:text-ice-text-1 hover:bg-ice-hover',
                  )}
                >
                  A-
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t('appBar.decreaseFont')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={increaseFontSize}
                  disabled={fontSize === 'large'}
                  aria-label={t('appBar.increaseFont')}
                  className={cn(
                    'px-1 py-0.5 rounded text-ice-base font-bold transition-[color,background-color,opacity]',
                    fontSize === 'large'
                      ? 'text-ice-text-3 opacity-40'
                      : 'text-ice-text-3 hover:text-ice-text-1 hover:bg-ice-hover',
                  )}
                >
                  A+
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t('appBar.increaseFont')}</TooltipContent>
            </Tooltip>
            <LanguageSwitch />
          </div>
        </header>
      </TooltipProvider>

      <GitHubConnectModal isOpen={showGitHub} onClose={() => setShowGitHub(false)} />
      <ProviderConnectModal
        isOpen={showGcp}
        onClose={() => setShowGcp(false)}
        providerId="gcp"
        providerName={t('appBar.provider.gcp.name')}
        providerIcon={gcpIcon}
        description={t('appBar.provider.gcp.description')}
        fields={[
          {
            name: 'service_account_key',
            label: t('appBar.provider.gcp.fieldLabel'),
            type: 'textarea',
            placeholder: '{\n  "type": "service_account",\n  "project_id": "...",\n  ...\n}',
            required: true,
            helpLink: {
              url: 'https://console.cloud.google.com/iam-admin/serviceaccounts',
              text: t('appBar.provider.gcp.helpLink'),
            },
          },
        ]}
      />
      <ProviderConnectModal
        isOpen={showAws}
        onClose={() => setShowAws(false)}
        providerId="aws"
        providerName={t('appBar.provider.aws.name')}
        providerIcon={awsIcon}
        description={t('appBar.provider.aws.description')}
        fields={[
          {
            name: 'accessKeyId',
            label: t('appBar.provider.aws.accessKeyLabel'),
            type: 'text',
            placeholder: 'AKIA...',
            required: true,
          },
          {
            name: 'secretAccessKey',
            label: t('appBar.provider.aws.secretKeyLabel'),
            type: 'password',
            placeholder: '********',
            required: true,
          },
          {
            name: 'region',
            label: t('appBar.provider.aws.regionLabel'),
            type: 'text',
            placeholder: 'us-east-1',
            required: true,
          },
        ]}
      />
      <ProviderConnectModal
        isOpen={showAzure}
        onClose={() => setShowAzure(false)}
        providerId="azure"
        providerName={t('appBar.provider.azure.name')}
        providerIcon={azureIcon}
        description={t('appBar.provider.azure.description')}
        fields={[
          {
            name: 'subscriptionId',
            label: t('appBar.provider.azure.subscriptionLabel'),
            type: 'text',
            placeholder: 'xxxxxxxx-xxxx-...',
            required: true,
          },
          {
            name: 'tenantId',
            label: t('appBar.provider.azure.tenantLabel'),
            type: 'text',
            placeholder: 'xxxxxxxx-xxxx-...',
            required: true,
          },
          {
            name: 'clientId',
            label: t('appBar.provider.azure.clientIdLabel'),
            type: 'text',
            placeholder: 'xxxxxxxx-xxxx-...',
            required: true,
          },
          {
            name: 'clientSecret',
            label: t('appBar.provider.azure.clientSecretLabel'),
            type: 'password',
            placeholder: '********',
            required: true,
          },
        ]}
      />

      <DeployPanel isOpen={deployIsOpen} />
      <PromoteModal />
    </>
  );
});
AppBar.displayName = 'AppBar';

const BarBtn: React.FC<{
  id?: string;
  icon: React.ElementType;
  onClick: () => void;
  tip?: string;
  className?: string;
  disabled?: boolean;
}> = ({ id, icon: I, onClick, tip, className, disabled }) => {
  const btn = (
    <button
      id={id}
      onClick={onClick}
      aria-label={tip}
      disabled={disabled}
      className={cn(
        'p-1.5 rounded text-ice-text-3 hover:text-ice-text-1 hover:bg-ice-hover transition-[color,background-color]',
        disabled && 'opacity-30 pointer-events-none',
        className,
      )}
    >
      <I className="w-4 h-4" aria-hidden="true" />
    </button>
  );
  if (!tip) return btn;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{btn}</TooltipTrigger>
      <TooltipContent side="bottom" className="text-ice-xs">
        {tip}
      </TooltipContent>
    </Tooltip>
  );
};
const BarImgBtn: React.FC<{ id?: string; src: string; onClick: () => void; tip?: string; connected?: boolean }> = ({
  id,
  src,
  onClick,
  tip,
  connected,
}) => {
  const btn = (
    <button
      id={id}
      onClick={onClick}
      aria-label={tip}
      className={cn(
        'relative p-1.5 rounded hover:bg-ice-hover transition-[background-color]',
        connected && 'ring-1 ring-emerald-500/40 rounded-md',
      )}
    >
      <img src={src} alt={tip || ''} width={16} height={16} className="w-4 h-4" />
      {connected && (
        <div
          aria-hidden="true"
          className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 border border-ice-raised"
        />
      )}
    </button>
  );
  if (!tip) return btn;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{btn}</TooltipTrigger>
      <TooltipContent side="bottom" className="text-ice-xs">
        {tip}
      </TooltipContent>
    </Tooltip>
  );
};
const BarSep: React.FC = () => <div className="w-px h-4 bg-ice-border mx-1" />;

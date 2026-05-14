/**
 * App Bar — shared between web and desktop
 */

import awsIcon from 'devicon/icons/amazonwebservices/amazonwebservices-original-wordmark.svg';
import azureIcon from 'devicon/icons/azure/azure-original.svg';
import gcpIcon from 'devicon/icons/googlecloud/googlecloud-original.svg';
import { Settings, Github, HelpCircle, Sparkles } from 'lucide-react';
import React, { memo, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Breadcrumbs } from './breadcrumbs';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from './ui/tooltip';
import { Logo } from '../../assets/logo';
import { PromoteModal } from '../../features/environments/components/promote-modal';
import { AnthropicConnectModal } from '../../features/integrations/components/anthropic-connect-modal';
import { GitHubConnectModal } from '../../features/integrations/components/github-connect-modal';
import { ProviderConnectModal } from '../../features/integrations/components/provider-connect-modal';
import { useTour } from '../../features/tour';
import { useTranslation } from '../../i18n';
import { checkAnthropicConnection, checkGitHubConnection } from '../../store/slices/integrations-slice';
import { cn } from '../utils/cn';
import type { RootState, AppDispatch } from '../../store';

/** Detect Electron + macOS + fullscreen state for traffic light padding */
function useElectronTitleBar() {
  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;
  const isMacOS = isElectron && (window as any).electronAPI?.platform === 'darwin';
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!isElectron) return;
    const api = (window as any).electronAPI;
    // Seed from the main process on mount — an event may have fired before
    // this component subscribed (HMR remount, late mount, etc.).
    api.getFullscreenState?.().then((fs: boolean) => setIsFullscreen(!!fs));
    const cleanup = api.onFullscreenChange?.((fs: boolean) => setIsFullscreen(fs));
    return cleanup;
  }, [isElectron]);

  return { isElectron, isMacOS, isFullscreen, showTrafficLightPad: isMacOS && !isFullscreen };
}

export const AppBar: React.FC = memo(() => {
  const { t } = useTranslation();
  const { isElectron, showTrafficLightPad } = useElectronTitleBar();
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const githubStatus = useSelector((s: RootState) => s.integrations.integrations.github?.status);
  const gcpStatus = useSelector((s: RootState) => s.integrations.integrations.gcp?.status);
  const anthropicStatus = useSelector((s: RootState) => s.integrations.integrations.anthropic?.status);
  const [showGitHub, setShowGitHub] = useState(false);
  const [showGcp, setShowGcp] = useState(false);
  const [showAws, setShowAws] = useState(false);
  const [showAzure, setShowAzure] = useState(false);
  const [showAnthropic, setShowAnthropic] = useState(false);

  useEffect(() => {
    dispatch(checkGitHubConnection());
    dispatch(checkAnthropicConnection());
  }, [dispatch]);

  return (
    <>
      <TooltipProvider delayDuration={300}>
        <header
          data-testid="toolbar"
          className="h-11 flex items-center gap-2 px-3 border-b border-ice-border bg-ice-toolbar relative z-[9999] shrink-0 transition-[padding]"
          style={{
            // macOS traffic lights sit at x=12 and span ~58px (3 dots + 2 gaps),
            // so they end near x=70. 92px leaves a comfortable ~22px gap before
            // the logo — matches the breathing room Apple apps use.
            paddingLeft: showTrafficLightPad ? '92px' : undefined,
            ...(isElectron ? ({ WebkitAppRegion: 'drag' } as any) : {}),
          }}
        >
          <div
            className="flex items-center gap-2.5 min-w-0"
            style={isElectron ? ({ WebkitAppRegion: 'no-drag' } as any) : undefined}
          >
            <Logo height={18} className="shrink-0 text-ice-text-1" />
            <div className="w-px h-4 bg-ice-border shrink-0" />
            <Breadcrumbs />
          </div>
          <div className="flex-1" />
          <div
            className="flex items-center gap-0.5"
            style={isElectron ? ({ WebkitAppRegion: 'no-drag' } as any) : undefined}
          >
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
            <BarBtn
              id="ice-appbar-btn-anthropic"
              icon={Sparkles}
              onClick={() => setShowAnthropic(true)}
              tip={t('integrations.anthropic.appBarTip')}
              className={anthropicStatus === 'connected' ? 'text-amber-500' : undefined}
            />
            <BarSep />
            <HelpMenu />
            <BarBtn icon={Settings} onClick={() => navigate('/settings')} tip="Settings" />
          </div>
        </header>
      </TooltipProvider>

      <AnthropicConnectModal isOpen={showAnthropic} onClose={() => setShowAnthropic(false)} />
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

/**
 * Help button — single click launches the canvas tour. Used to be a
 * dropdown listing every registered tour, but the canvas tour is the
 * comprehensive product walkthrough so the dropdown was extra friction.
 */
const HelpMenu: React.FC = () => {
  const { t } = useTranslation();
  const { start } = useTour();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          id="ice-appbar-btn-help"
          aria-label={t('appBar.help.tooltip')}
          onClick={() => start('canvas-tour')}
          className={cn(
            'p-1.5 rounded text-ice-text-3 hover:text-ice-text-1 hover:bg-ice-hover transition-[color,background-color]',
          )}
        >
          <HelpCircle className="w-4 h-4" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-ice-xs">
        {t('appBar.help.tooltip')}
      </TooltipContent>
    </Tooltip>
  );
};

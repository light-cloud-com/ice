/**
 * App Bar — shared between web and desktop
 */

import { isProviderEnabled } from '@ice/constants';
import githubIcon from 'devicon/icons/github/github-original.svg';
import { Settings, HelpCircle, Sparkles } from 'lucide-react';
// Cloud provider logos: official multi-color marks extracted from
// docs/assets/cloud-providers.svg. Single source of truth so the
// AppBar, README, and any onboarding material stay in lockstep.
//
// Alibaba is mapped to the Tencent Cloud mark (same SVG file) until
// a first-party Alibaba SVG lands — both are Chinese-cloud peers and
// share the visual treatment.
import React, { memo, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Breadcrumbs } from './breadcrumbs';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from './ui/tooltip';
import awsIcon from '../../assets/icons/providers/aws.svg';
import azureIcon from '../../assets/icons/providers/azure.svg';
import digitaloceanIcon from '../../assets/icons/providers/digitalocean.svg';
import gcpIcon from '../../assets/icons/providers/gcp.svg';
import ibmIcon from '../../assets/icons/providers/ibm.svg';
import kubernetesIcon from '../../assets/icons/providers/kubernetes.svg';
import ociIcon from '../../assets/icons/providers/oracle.svg';
import alibabaIcon from '../../assets/icons/providers/tencent.svg';
import { Logo } from '../../assets/logo';
import { PromoteModal } from '../../features/environments/components/promote-modal';
import { AnthropicConnectModal } from '../../features/integrations/components/anthropic-connect-modal';
import { GitHubConnectModal } from '../../features/integrations/components/github-connect-modal';
import { ProviderConnectModal } from '../../features/integrations/components/provider-connect-modal';
import { useTour } from '../../features/tour';
import { useTranslation } from '../../i18n';
import {
  checkAllProviderConnections,
  checkAnthropicConnection,
  checkGitHubConnection,
} from '../../store/slices/integrations-slice';
import { LiveAnnouncer } from './live-announcer';
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
  const anthropicStatus = useSelector((s: RootState) => s.integrations.integrations.anthropic?.status);
  // EI2 — per-provider connection map drives the app-bar rings for every cloud.
  const integrations = useSelector((s: RootState) => s.integrations.integrations);
  const isProviderConnected = (id: string) => integrations[id]?.status === 'connected';
  const [showGitHub, setShowGitHub] = useState(false);
  const [showGcp, setShowGcp] = useState(false);
  const [showAws, setShowAws] = useState(false);
  const [showAzure, setShowAzure] = useState(false);
  const [showKubernetes, setShowKubernetes] = useState(false);
  const [showAlibaba, setShowAlibaba] = useState(false);
  const [showOci, setShowOci] = useState(false);
  const [showDigitalocean, setShowDigitalocean] = useState(false);
  const [showIbm, setShowIbm] = useState(false);
  const [showAnthropic, setShowAnthropic] = useState(false);

  useEffect(() => {
    dispatch(checkGitHubConnection());
    dispatch(checkAnthropicConnection());
    dispatch(checkAllProviderConnections());
  }, [dispatch]);

  return (
    <>
      {/* AX2 — one polite live region for deploy lifecycle announcements. */}
      <LiveAnnouncer />
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
            {isProviderEnabled('gcp') && (
              <BarImgBtn
                id="ice-appbar-btn-gcp"
                src={gcpIcon}
                onClick={() => setShowGcp(true)}
                tip={t('common.providers.gcp')}
                connected={isProviderConnected('gcp')}
              />
            )}
            {isProviderEnabled('aws') && (
              <BarImgBtn
                id="ice-appbar-btn-aws"
                src={awsIcon}
                onClick={() => setShowAws(true)}
                tip={t('common.providers.aws')}
                connected={isProviderConnected('aws')}
              />
            )}
            {isProviderEnabled('azure') && (
              <BarImgBtn
                id="ice-appbar-btn-azure"
                src={azureIcon}
                onClick={() => setShowAzure(true)}
                tip={t('common.providers.azure')}
                connected={isProviderConnected('azure')}
              />
            )}
            {isProviderEnabled('alibaba') && (
              <BarImgBtn
                id="ice-appbar-btn-alibaba"
                src={alibabaIcon}
                onClick={() => setShowAlibaba(true)}
                tip={t('common.providers.alibaba')}
                connected={isProviderConnected('alibaba')}
              />
            )}
            {isProviderEnabled('oci') && (
              <BarImgBtn
                id="ice-appbar-btn-oci"
                src={ociIcon}
                onClick={() => setShowOci(true)}
                tip={t('common.providers.oci')}
                connected={isProviderConnected('oci')}
              />
            )}
            {isProviderEnabled('digitalocean') && (
              <BarImgBtn
                id="ice-appbar-btn-digitalocean"
                src={digitaloceanIcon}
                onClick={() => setShowDigitalocean(true)}
                tip={t('common.providers.digitalocean')}
                connected={isProviderConnected('digitalocean')}
              />
            )}
            {isProviderEnabled('ibm') && (
              <BarImgBtn
                id="ice-appbar-btn-ibm"
                src={ibmIcon}
                onClick={() => setShowIbm(true)}
                tip={t('common.providers.ibm')}
                connected={isProviderConnected('ibm')}
              />
            )}
            {isProviderEnabled('kubernetes') && (
              <BarImgBtn
                id="ice-appbar-btn-kubernetes"
                src={kubernetesIcon}
                onClick={() => setShowKubernetes(true)}
                tip={t('common.providers.kubernetes')}
                connected={isProviderConnected('kubernetes')}
              />
            )}
            <BarSep />
            <BarImgBtn
              id="ice-appbar-btn-github"
              src={githubIcon}
              onClick={() => setShowGitHub(true)}
              tip={t('integrations.github.title')}
              connected={githubStatus === 'connected'}
              themeAware
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
      {isProviderEnabled('gcp') && (
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
      )}
      {isProviderEnabled('aws') && (
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
      )}
      {isProviderEnabled('azure') && (
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
      )}
      {isProviderEnabled('alibaba') && (
        <ProviderConnectModal
          isOpen={showAlibaba}
          onClose={() => setShowAlibaba(false)}
          providerId="alibaba"
          providerName={t('appBar.provider.alibaba.name')}
          providerIcon={alibabaIcon}
          description={t('appBar.provider.alibaba.description')}
          fields={[
            {
              name: 'accessKeyId',
              label: t('appBar.provider.alibaba.accessKeyLabel'),
              type: 'text',
              placeholder: 'LTAI...',
              required: true,
            },
            {
              name: 'accessKeySecret',
              label: t('appBar.provider.alibaba.secretKeyLabel'),
              type: 'password',
              placeholder: '********',
              required: true,
            },
            {
              name: 'region',
              label: t('appBar.provider.alibaba.regionLabel'),
              type: 'text',
              placeholder: 'cn-hangzhou',
              required: true,
              helpLink: {
                url: 'https://ram.console.aliyun.com/manage/ak',
                text: t('appBar.provider.alibaba.helpLink'),
              },
            },
          ]}
        />
      )}
      {isProviderEnabled('oci') && (
        <ProviderConnectModal
          isOpen={showOci}
          onClose={() => setShowOci(false)}
          providerId="oci"
          providerName={t('appBar.provider.oci.name')}
          providerIcon={ociIcon}
          description={t('appBar.provider.oci.description')}
          fields={[
            {
              name: 'configFile',
              label: t('appBar.provider.oci.configFileLabel'),
              type: 'text',
              placeholder: '~/.oci/config',
              required: false,
            },
            {
              name: 'profile',
              label: t('appBar.provider.oci.profileLabel'),
              type: 'text',
              placeholder: 'DEFAULT',
              required: false,
            },
            {
              name: 'compartmentId',
              label: t('appBar.provider.oci.compartmentIdLabel'),
              type: 'text',
              placeholder: 'ocid1.compartment.oc1..aaaaa...',
              required: true,
            },
            {
              name: 'region',
              label: t('appBar.provider.oci.regionLabel'),
              type: 'text',
              placeholder: 'us-ashburn-1',
              required: true,
              helpLink: {
                url: 'https://docs.oracle.com/en-us/iaas/Content/API/Concepts/sdkconfig.htm',
                text: t('appBar.provider.oci.helpLink'),
              },
            },
          ]}
        />
      )}
      {isProviderEnabled('digitalocean') && (
        <ProviderConnectModal
          isOpen={showDigitalocean}
          onClose={() => setShowDigitalocean(false)}
          providerId="digitalocean"
          providerName={t('appBar.provider.digitalocean.name')}
          providerIcon={digitaloceanIcon}
          description={t('appBar.provider.digitalocean.description')}
          fields={[
            {
              name: 'token',
              label: t('appBar.provider.digitalocean.tokenLabel'),
              type: 'password',
              placeholder: 'dop_v1_...',
              required: true,
              helpLink: {
                url: 'https://cloud.digitalocean.com/account/api/tokens',
                text: t('appBar.provider.digitalocean.helpLink'),
              },
            },
            {
              name: 'region',
              label: t('appBar.provider.digitalocean.regionLabel'),
              type: 'text',
              placeholder: 'nyc3',
              required: true,
            },
            {
              name: 'spacesAccessKey',
              label: t('appBar.provider.digitalocean.spacesAccessKeyLabel'),
              type: 'text',
              placeholder: 'Optional — required for Spaces buckets',
              required: false,
            },
            {
              name: 'spacesSecretKey',
              label: t('appBar.provider.digitalocean.spacesSecretKeyLabel'),
              type: 'password',
              placeholder: '********',
              required: false,
            },
          ]}
        />
      )}
      {isProviderEnabled('ibm') && (
        <ProviderConnectModal
          isOpen={showIbm}
          onClose={() => setShowIbm(false)}
          providerId="ibm"
          providerName={t('appBar.provider.ibm.name')}
          providerIcon={ibmIcon}
          description={t('appBar.provider.ibm.description')}
          fields={[
            {
              name: 'apiKey',
              label: t('appBar.provider.ibm.apiKeyLabel'),
              type: 'password',
              placeholder: '********',
              required: true,
              helpLink: {
                url: 'https://cloud.ibm.com/iam/apikeys',
                text: t('appBar.provider.ibm.helpLink'),
              },
            },
            {
              name: 'resourceGroupId',
              label: t('appBar.provider.ibm.resourceGroupLabel'),
              type: 'text',
              placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
              required: true,
            },
            {
              name: 'region',
              label: t('appBar.provider.ibm.regionLabel'),
              type: 'text',
              placeholder: 'us-south',
              required: true,
            },
          ]}
        />
      )}
      {isProviderEnabled('kubernetes') && (
        <ProviderConnectModal
          isOpen={showKubernetes}
          onClose={() => setShowKubernetes(false)}
          providerId="kubernetes"
          providerName={t('appBar.provider.kubernetes.name')}
          providerIcon={kubernetesIcon}
          description={t('appBar.provider.kubernetes.description')}
          fields={[
            {
              name: 'kubeconfig',
              label: t('appBar.provider.kubernetes.kubeconfigLabel'),
              type: 'textarea',
              placeholder: 'apiVersion: v1\nkind: Config\nclusters:\n- ...',
              required: true,
              helpLink: {
                url: 'https://kubernetes.io/docs/tasks/access-application-cluster/configure-access-multiple-clusters/',
                text: t('appBar.provider.kubernetes.helpLink'),
              },
            },
            {
              name: 'namespace',
              label: t('appBar.provider.kubernetes.namespaceLabel'),
              type: 'text',
              placeholder: 'ice-deploy',
              required: false,
            },
          ]}
        />
      )}

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
const BarImgBtn: React.FC<{
  id?: string;
  src: string;
  onClick: () => void;
  tip?: string;
  connected?: boolean;
  /**
   * When true, render the SVG as a CSS mask so the icon takes the
   * button's text color (white on dark theme, black on light theme).
   * Use this for monochrome brand marks like GitHub, IBM, and Alibaba
   * that don't ship a multi-color devicon equivalent.
   */
  themeAware?: boolean;
}> = ({ id, src, onClick, tip, connected, themeAware }) => {
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
      {themeAware ? (
        <span
          aria-hidden="true"
          role="img"
          className="block w-4 h-4 bg-ice-text-1"
          style={{
            WebkitMaskImage: `url("${src}")`,
            maskImage: `url("${src}")`,
            WebkitMaskRepeat: 'no-repeat',
            maskRepeat: 'no-repeat',
            WebkitMaskSize: 'contain',
            maskSize: 'contain',
            WebkitMaskPosition: 'center',
            maskPosition: 'center',
          }}
        />
      ) : (
        <img src={src} alt={tip || ''} width={16} height={16} className="w-4 h-4" />
      )}
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

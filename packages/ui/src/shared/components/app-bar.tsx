/**
 * App Bar — shared between web and desktop
 */

import { isProviderEnabled } from '@ice/constants';
import awsIcon from 'devicon/icons/amazonwebservices/amazonwebservices-original-wordmark.svg';
import azureIcon from 'devicon/icons/azure/azure-original.svg';
import digitaloceanIcon from 'devicon/icons/digitalocean/digitalocean-original.svg';
import githubIcon from 'devicon/icons/github/github-original.svg';
import gcpIcon from 'devicon/icons/googlecloud/googlecloud-original.svg';
import kubernetesIcon from 'devicon/icons/kubernetes/kubernetes-original.svg';
import ociIcon from 'devicon/icons/oracle/oracle-original.svg';
import { Settings, HelpCircle, Sparkles } from 'lucide-react';
// Alibaba Cloud + IBM are not in devicon — use SimpleIcons SVG slugs
// served as data URIs (single-color, currentColor-driven so they
// auto-theme with the bar text color).
const alibabaIcon =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M5.535 9.7H1.475L0 14.343l1.474 4.633h4.06v-2.428l-2.388-.717.876-2.776 2.49.733 1.023 1.05V9.701z m12.928 0h4.062L24 14.343l-1.475 4.633h-4.062v-2.428l2.387-.717-.876-2.776-2.488.733-1.023 1.05V9.7zM7.464 5.024L12 4.027v.762l-3.484.99-.052 13.42 3.536 1.045v.726l-4.536-.997zm9.072 0L12 4.027v.762l3.483.99.053 13.42L12 20.245v.726l4.536-.997z"/></svg>',
  );
const ibmIcon =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M0 4.857v.78h6.857v-.78H0zm8.571 0v.78h8.572v-.78H8.57zm10.286 0v.78H24v-.78h-5.143zM0 6.429v.78h6.857v-.78H0zm8.571 0v.78h8.572v-.78H8.57zm10.286 0v.78H24v-.78h-5.143zM0 8v.78h6.857V8H0zm10.285 0v.78h2.572V8h-2.572zm6.001 0v.78h2.571V8h-2.571zM0 9.571v.78h6.857v-.78H0zm10.285 0v.78h6v-.78h-6zM0 11.143v.78h6.857v-.78H0zm10.285 0v.78h6v-.78h-6zM0 12.714v.781h6.857v-.781H0zm10.285 0v.781h6v-.781h-6zM0 14.286v.78h6.857v-.78H0zm10.285 0v.78h2.572v-.78h-2.572zm6.001 0v.78h2.571v-.78h-2.571zM0 15.857v.781h6.857v-.781H0zm8.571 0v.781h8.572v-.781H8.57zm10.286 0v.781H24v-.781h-5.143zM0 17.43v.78h6.857v-.78H0zm8.571 0v.78h8.572v-.78H8.57zm10.286 0v.78H24v-.78h-5.143z"/></svg>',
  );
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
  const [showKubernetes, setShowKubernetes] = useState(false);
  const [showAlibaba, setShowAlibaba] = useState(false);
  const [showOci, setShowOci] = useState(false);
  const [showDigitalocean, setShowDigitalocean] = useState(false);
  const [showIbm, setShowIbm] = useState(false);
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
            {isProviderEnabled('gcp') && (
              <BarImgBtn
                id="ice-appbar-btn-gcp"
                src={gcpIcon}
                onClick={() => setShowGcp(true)}
                tip={t('common.providers.gcp')}
                connected={gcpStatus === 'connected'}
              />
            )}
            {isProviderEnabled('aws') && (
              <BarImgBtn
                id="ice-appbar-btn-aws"
                src={awsIcon}
                onClick={() => setShowAws(true)}
                tip={t('common.providers.aws')}
              />
            )}
            {isProviderEnabled('azure') && (
              <BarImgBtn
                id="ice-appbar-btn-azure"
                src={azureIcon}
                onClick={() => setShowAzure(true)}
                tip={t('common.providers.azure')}
              />
            )}
            {isProviderEnabled('alibaba') && (
              <BarImgBtn
                id="ice-appbar-btn-alibaba"
                src={alibabaIcon}
                onClick={() => setShowAlibaba(true)}
                tip={t('common.providers.alibaba')}
                themeAware
              />
            )}
            {isProviderEnabled('oci') && (
              <BarImgBtn
                id="ice-appbar-btn-oci"
                src={ociIcon}
                onClick={() => setShowOci(true)}
                tip={t('common.providers.oci')}
              />
            )}
            {isProviderEnabled('digitalocean') && (
              <BarImgBtn
                id="ice-appbar-btn-digitalocean"
                src={digitaloceanIcon}
                onClick={() => setShowDigitalocean(true)}
                tip={t('common.providers.digitalocean')}
              />
            )}
            {isProviderEnabled('ibm') && (
              <BarImgBtn
                id="ice-appbar-btn-ibm"
                src={ibmIcon}
                onClick={() => setShowIbm(true)}
                tip={t('common.providers.ibm')}
                themeAware
              />
            )}
            {isProviderEnabled('kubernetes') && (
              <BarImgBtn
                id="ice-appbar-btn-kubernetes"
                src={kubernetesIcon}
                onClick={() => setShowKubernetes(true)}
                tip={t('common.providers.kubernetes')}
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

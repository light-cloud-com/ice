/**
 * GitHub Connect Modal
 *
 * Two-tab modal for connecting to GitHub:
 * - Tab 1: Personal Access Token (paste & connect)
 * - Tab 2: OAuth Device Flow (browser-based sign-in)
 */

import { Github, Loader2, Copy, Check, ExternalLink, LogOut } from 'lucide-react';
import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useTranslation } from '../../../i18n';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../../../shared/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../../shared/components/ui/tabs';
import { connectGitHubPAT, startGitHubDeviceFlow, disconnectGitHub } from '../../../store/slices/integrations-slice';
import type { RootState, AppDispatch } from '../../../store';

interface GitHubConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GitHubConnectModal: React.FC<GitHubConnectModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const githubStatus = useSelector((state: RootState) => state.integrations.integrations.github);
  const deviceFlow = useSelector((state: RootState) => state.integrations.github.deviceFlow);

  const [patToken, setPatToken] = useState('');
  const [copied, setCopied] = useState(false);

  const isConnected = githubStatus?.status === 'connected';
  const isConnecting = githubStatus?.status === 'connecting';

  const handlePATConnect = () => {
    if (!patToken.trim()) return;
    dispatch(connectGitHubPAT(patToken.trim()));
  };

  const handleDeviceFlow = () => {
    dispatch(startGitHubDeviceFlow());
  };

  const handleDisconnect = () => {
    dispatch(disconnectGitHub());
    setPatToken('');
  };

  const handleCopyCode = () => {
    if (deviceFlow?.userCode) {
      navigator.clipboard.writeText(deviceFlow.userCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Github className="w-5 h-5" />
            {t('integrations.github.connectTitle')}
          </DialogTitle>
          <DialogDescription>
            {isConnected
              ? t('integrations.github.connectedAs', { username: githubStatus.username || '' })
              : t('integrations.github.connectDescription')}
          </DialogDescription>
        </DialogHeader>

        {/* Connected state */}
        {isConnected && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-ice-green-muted border border-ice-green/20">
              {githubStatus.avatarUrl && (
                <img src={githubStatus.avatarUrl} alt={githubStatus.username} className="w-10 h-10 rounded-full" />
              )}
              <div className="flex-1">
                <div className="font-medium text-sm text-ice-text-1">{githubStatus.username}</div>
                <div className="text-xs text-ice-text-3">
                  {t('integrations.github.connectedAs', { username: githubStatus.username || '' })}
                </div>
              </div>
              <Check className="w-5 h-5 text-ice-green" />
            </div>
            <button
              onClick={handleDisconnect}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm rounded-md border border-ice-border hover:bg-ice-hover transition-colors text-ice-text-2"
            >
              <LogOut className="w-4 h-4" />
              Disconnect
            </button>
          </div>
        )}

        {/* Error state */}
        {githubStatus?.status === 'error' && (
          <div className="p-3 rounded-lg bg-ice-red-muted border border-ice-red/20 text-sm text-ice-red">
            {githubStatus.error}
          </div>
        )}

        {/* Connect tabs */}
        {!isConnected && (
          <Tabs defaultValue="pat" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="pat">{t('integrations.github.patTab')}</TabsTrigger>
              <TabsTrigger value="device">{t('integrations.github.deviceFlowTab')}</TabsTrigger>
            </TabsList>

            {/* PAT Tab */}
            <TabsContent value="pat" className="space-y-3">
              <div>
                <label className="text-sm font-medium text-ice-text-1">{t('integrations.github.patLabel')}</label>
                <input
                  type="password"
                  value={patToken}
                  onChange={(e) => setPatToken(e.target.value)}
                  placeholder={t('integrations.github.patPlaceholder')}
                  className="mt-1 w-full px-3 py-2 text-sm rounded-md border border-ice-border bg-ice-base text-ice-text-1 placeholder:text-ice-text-3 focus:outline-none focus:border-ice-accent focus:ring-2 focus:ring-ice-accent-muted"
                  onKeyDown={(e) => e.key === 'Enter' && handlePATConnect()}
                />
                <p className="mt-1 text-xs text-ice-text-3">{t('integrations.github.patHelp')}</p>
              </div>
              <button
                onClick={handlePATConnect}
                disabled={!patToken.trim() || isConnecting}
                className="ice-btn ice-btn-primary w-full"
              >
                {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Github className="w-4 h-4" />}
                {t('integrations.github.patConnect')}
              </button>
            </TabsContent>

            {/* Device Flow Tab */}
            <TabsContent value="device" className="space-y-3">
              {!deviceFlow ? (
                <button onClick={handleDeviceFlow} disabled={isConnecting} className="ice-btn ice-btn-primary w-full">
                  {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Github className="w-4 h-4" />}
                  {t('integrations.github.deviceFlowButton')}
                </button>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-ice-text-2">{t('integrations.github.deviceFlowInstructions')}</p>
                  <div className="flex items-center justify-center gap-2">
                    <code className="px-4 py-3 text-2xl font-mono font-bold tracking-widest rounded-lg bg-ice-surface border border-ice-border text-ice-text-1">
                      {deviceFlow.userCode}
                    </code>
                    <button
                      onClick={handleCopyCode}
                      className="p-2 rounded-md hover:bg-ice-hover transition-colors"
                      title={t('integrations.github.deviceFlowCopy')}
                    >
                      {copied ? (
                        <Check className="w-4 h-4 text-ice-green" />
                      ) : (
                        <Copy className="w-4 h-4 text-ice-text-2" />
                      )}
                    </button>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-sm text-ice-text-3">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {t('integrations.github.deviceFlowWaiting')}
                  </div>
                  <a
                    href={deviceFlow.verificationUri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1 text-sm text-ice-accent hover:underline"
                  >
                    {deviceFlow.verificationUri}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
};

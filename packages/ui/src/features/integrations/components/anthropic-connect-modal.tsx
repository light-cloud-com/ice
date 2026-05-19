/**
 * Anthropic / Claude Connect Modal — BYOK
 *
 * One field: an Anthropic API key. Stored encrypted in the workspace DB
 * (same flow as cloud provider credentials). Pattern mirrors
 * `github-connect-modal.tsx`.
 */

import { Check, ExternalLink, Loader2, LogOut, Sparkles } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from '../../../i18n';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../../shared/components/ui/dialog';
import {
  checkAnthropicConnection,
  connectAnthropic,
  disconnectAnthropic,
} from '../../../store/slices/integrations-slice';
import type { AppDispatch, RootState } from '../../../store';

interface AnthropicConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AnthropicConnectModal: React.FC<AnthropicConnectModalProps> = ({ isOpen, onClose }) => {
  const dispatch = useDispatch<AppDispatch>();
  const { t } = useTranslation();
  const status = useSelector((state: RootState) => state.integrations.integrations.anthropic);

  const [apiKey, setApiKey] = useState('');

  // Refresh connection state every time the modal opens
  useEffect(() => {
    if (isOpen) dispatch(checkAnthropicConnection());
  }, [isOpen, dispatch]);

  const isConnected = status?.status === 'connected';
  const isConnecting = status?.status === 'connecting';

  const handleConnect = () => {
    const trimmed = apiKey.trim();
    if (!trimmed) return;
    dispatch(connectAnthropic(trimmed));
  };

  const handleDisconnect = () => {
    dispatch(disconnectAnthropic());
    setApiKey('');
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            {t('integrations.anthropic.title')}
          </DialogTitle>
          <DialogDescription>{t('integrations.anthropic.description')}</DialogDescription>
        </DialogHeader>

        {isConnected && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-ice-green-muted border border-ice-green/20">
              <Sparkles className="w-8 h-8 text-amber-500" />
              <div className="flex-1">
                <div className="font-medium text-sm text-ice-text-1">{t('integrations.anthropic.connected')}</div>
                <div className="text-xs text-ice-text-3">{t('integrations.anthropic.connectedSubtitle')}</div>
              </div>
              <Check className="w-5 h-5 text-ice-green" />
            </div>
            <button
              onClick={handleDisconnect}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm rounded-md border border-ice-border hover:bg-ice-hover transition-colors text-ice-text-2"
            >
              <LogOut className="w-4 h-4" />
              {t('integrations.anthropic.disconnect')}
            </button>
          </div>
        )}

        {status?.status === 'error' && (
          <div className="p-3 rounded-lg bg-ice-red-muted border border-ice-red/20 text-sm text-ice-red">
            {status.error}
          </div>
        )}

        {!isConnected && (
          <div className="space-y-3">
            <div>
              <label htmlFor="ice-anthropic-key" className="text-sm font-medium text-ice-text-1">
                {t('integrations.anthropic.apiKeyLabel')}
              </label>
              <input
                id="ice-anthropic-key"
                type="text"
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={t('integrations.anthropic.apiKeyPlaceholder')}
                className="mt-1 w-full px-3 py-2 text-sm font-mono rounded-md border border-ice-border bg-ice-base text-ice-text-1 placeholder:text-ice-text-3 focus:outline-none focus:border-ice-accent focus:ring-2 focus:ring-ice-accent-muted"
                onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
              />
              <p className="mt-1 text-xs text-ice-text-3">
                {t('integrations.anthropic.apiKeyHelp')}{' '}
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-ice-accent hover:underline"
                >
                  {t('integrations.anthropic.createKey')}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </p>
            </div>
            <button
              onClick={handleConnect}
              disabled={!apiKey.trim() || isConnecting}
              className="ice-btn ice-btn-primary w-full"
            >
              {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {t('integrations.anthropic.connectButton')}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

/**
 * Integration Dropdown
 *
 * Toolbar dropdown showing all integrations with their connection status.
 * Click on GitHub to open the connect modal. Shows status dots + names.
 */

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSelector, useDispatch } from 'react-redux';
import { Github, Cloud, Check, X, Loader2, ChevronDown, Plug } from 'lucide-react';
import { cn } from '../../../shared/utils/cn';
import { INTEGRATIONS } from '../../../i18n/messages';
import type { RootState, AppDispatch } from '../../../store';
import type { IntegrationStatus } from '../../../store/slices/integrations-slice';
import { checkGitHubConnection } from '../../../store/slices/integrations-slice';
import { GitHubConnectModal } from './github-connect-modal';
import { ProviderSettings } from '../../../shared/components/provider-settings';

const STATUS_CONFIG: Record<
  IntegrationStatus,
  { color: string; icon: React.ElementType | null; label: string }
> = {
  connected: { color: 'text-emerald-500', icon: Check, label: INTEGRATIONS.CONNECTED },
  disconnected: { color: 'text-muted-foreground', icon: null, label: INTEGRATIONS.DISCONNECTED },
  connecting: { color: 'text-orange-500', icon: Loader2, label: INTEGRATIONS.CONNECTING },
  error: { color: 'text-red-500', icon: X, label: INTEGRATIONS.ERROR },
};

const PROVIDER_CONFIG: Record<string, { name: string; icon: React.ElementType; color: string }> = {
  github: { name: 'GitHub', icon: Github, color: 'text-foreground' },
  gcp: { name: 'GCP', icon: Cloud, color: 'text-blue-500' },
  aws: { name: 'AWS', icon: Cloud, color: 'text-orange-500' },
  azure: { name: 'Azure', icon: Cloud, color: 'text-sky-500' },
};

export const IntegrationDropdown: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const integrations = useSelector((state: RootState) => state.integrations.integrations);
  const [isOpen, setIsOpen] = useState(false);
  const [showGitHubModal, setShowGitHubModal] = useState(false);
  const [showProviderSettings, setShowProviderSettings] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

  // Check GitHub connection on mount
  useEffect(() => {
    dispatch(checkGitHubConnection());
  }, [dispatch]);

  // Calculate dropdown position when opening
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 4,
        left: Math.max(8, rect.right - 256), // 256 = w-64
      });
    }
  }, [isOpen]);

  const connectedCount = Object.values(integrations).filter((i) => i.status === 'connected').length;

  return (
    <>
      <div className="relative app-no-drag">
        <button
          ref={buttonRef}
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            'flex items-center gap-1 p-1.5 rounded hover:bg-muted transition-colors',
            isOpen && 'bg-muted'
          )}
          title={INTEGRATIONS.DROPDOWN_TITLE}
        >
          <Plug className="w-4 h-4" />
          {connectedCount > 0 && (
            <span className="flex items-center justify-center w-3.5 h-3.5 text-ice-2xs font-bold rounded-full bg-emerald-500 text-white">
              {connectedCount}
            </span>
          )}
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        </button>
      </div>

      {/* Dropdown panel — portalled to body so it renders above the canvas */}
      {isOpen &&
        createPortal(
          <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-[9998]" onClick={() => setIsOpen(false)} />
            <div
              className="fixed z-[9999] w-64 rounded-lg border border-border bg-popover shadow-lg"
              style={{ top: dropdownPos.top, left: dropdownPos.left }}
            >
              <div className="p-2">
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {INTEGRATIONS.DROPDOWN_TITLE}
                </div>
                {Object.entries(PROVIDER_CONFIG).map(([id, config]) => {
                  const integration = integrations[id];
                  const status = integration?.status || 'disconnected';
                  const statusConfig = STATUS_CONFIG[status];
                  const Icon = config.icon;
                  const StatusIcon = statusConfig.icon;

                  return (
                    <button
                      key={id}
                      onClick={() => {
                        setIsOpen(false);
                        if (id === 'github') {
                          setShowGitHubModal(true);
                        } else {
                          setShowProviderSettings(true);
                        }
                      }}
                      className="w-full flex items-center gap-3 px-2 py-2 rounded-md text-sm hover:bg-muted transition-colors"
                    >
                      <Icon className={cn('w-4 h-4', config.color)} />
                      <div className="flex-1 text-left">
                        <div className="font-medium">{config.name}</div>
                        <div className={cn('text-xs', statusConfig.color)}>
                          {status === 'connected' && integration?.username
                            ? integration.username
                            : statusConfig.label}
                        </div>
                      </div>
                      {StatusIcon && (
                        <StatusIcon
                          className={cn(
                            'w-3.5 h-3.5',
                            statusConfig.color,
                            status === 'connecting' && 'animate-spin'
                          )}
                        />
                      )}
                      {status === 'disconnected' && (
                        <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </>,
          document.body
        )}

      {/* GitHub Connect Modal */}
      <GitHubConnectModal isOpen={showGitHubModal} onClose={() => setShowGitHubModal(false)} />

      {/* Provider Settings Modal (GCP/AWS/Azure) */}
      <ProviderSettings isOpen={showProviderSettings} onClose={() => setShowProviderSettings(false)} />
    </>
  );
};

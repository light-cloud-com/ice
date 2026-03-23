/**
 * Onboarding Step 4 — Connect GitHub
 *
 * Two methods: Personal Access Token or OAuth Device Flow.
 * Reuses existing integration store actions.
 */

import { Github, Loader2, Copy, Check, ExternalLink } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { cn } from '../../../shared/utils/cn';
import {
  connectGitHubPAT,
  startGitHubDeviceFlow,
  checkGitHubConnection,
} from '../../../store/slices/integrations-slice';
import { setGithubConnected } from '../../../store/slices/onboarding-slice';
import type { RootState, AppDispatch } from '../../../store';

export const ConnectGithubStep: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const githubStatus = useSelector((s: RootState) => s.integrations.integrations.github);
  const deviceFlow = useSelector((s: RootState) => s.integrations.github.deviceFlow);
  const isGithubConnected = useSelector((s: RootState) => s.onboarding.githubConnected);

  const [activeTab, setActiveTab] = useState<'device' | 'pat'>('device');
  const [patToken, setPatToken] = useState('');
  const [copied, setCopied] = useState(false);

  const isConnected = githubStatus?.status === 'connected';
  const isConnecting = githubStatus?.status === 'connecting';

  useEffect(() => {
    dispatch(checkGitHubConnection());
  }, [dispatch]);

  useEffect(() => {
    if (isConnected && !isGithubConnected) {
      dispatch(setGithubConnected(true));
    }
  }, [isConnected, isGithubConnected, dispatch]);

  const handlePATConnect = () => {
    if (!patToken.trim()) return;
    dispatch(connectGitHubPAT(patToken.trim()));
  };

  const handleDeviceFlow = () => {
    dispatch(startGitHubDeviceFlow());
  };

  const handleCopyCode = () => {
    if (deviceFlow?.userCode) {
      navigator.clipboard.writeText(deviceFlow.userCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-ice-text-1">Connect GitHub</h2>
        <p className="text-sm text-ice-text-2 mt-1">Link repositories to services on the canvas for CI/CD</p>
      </div>

      {/* Connected state */}
      {isConnected ? (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          {githubStatus.avatarUrl ? (
            <img src={githubStatus.avatarUrl} alt="" className="w-10 h-10 rounded-full" />
          ) : (
            <Github className="w-8 h-8 text-ice-text-1" />
          )}
          <div className="flex-1">
            <div className="font-medium text-sm text-ice-text-1">{githubStatus.username || 'GitHub'}</div>
            <div className="text-xs text-ice-text-2">Connected</div>
          </div>
          <Check className="w-5 h-5 text-emerald-500" />
        </div>
      ) : (
        <>
          {/* Error state */}
          {githubStatus?.status === 'error' && (
            <div className="p-3 rounded-lg bg-ice-red/10 border border-ice-red/20 text-sm text-ice-red">
              {githubStatus.error}
            </div>
          )}

          {/* Tab toggle */}
          <div className="flex p-0.5 rounded-lg bg-ice-raised border border-ice-border">
            <button
              type="button"
              onClick={() => setActiveTab('device')}
              className={cn(
                'flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                activeTab === 'device'
                  ? 'bg-ice-surface text-ice-text-1 shadow-sm'
                  : 'text-ice-text-2 hover:text-ice-text-1',
              )}
            >
              Sign in with Browser
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('pat')}
              className={cn(
                'flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                activeTab === 'pat'
                  ? 'bg-ice-surface text-ice-text-1 shadow-sm'
                  : 'text-ice-text-2 hover:text-ice-text-1',
              )}
            >
              Personal Access Token
            </button>
          </div>

          {/* Device Flow */}
          {activeTab === 'device' && (
            <div className="space-y-3">
              {!deviceFlow ? (
                <button
                  onClick={handleDeviceFlow}
                  disabled={isConnecting}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm rounded-md font-medium transition-colors',
                    'bg-[#24292f] dark:bg-[#f0f6fc] text-white dark:text-[#24292f]',
                    'hover:bg-[#24292f]/90 dark:hover:bg-[#f0f6fc]/90',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                  )}
                >
                  {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Github className="w-4 h-4" />}
                  Sign in with GitHub
                </button>
              ) : (
                <div className="space-y-3 text-center">
                  <p className="text-sm text-ice-text-2">Enter this code in your browser to authorize:</p>
                  <div className="flex items-center justify-center gap-2">
                    <code className="px-4 py-3 text-2xl font-mono font-bold tracking-widest rounded-lg bg-ice-raised border border-ice-border text-ice-text-1">
                      {deviceFlow.userCode}
                    </code>
                    <button
                      onClick={handleCopyCode}
                      className="p-2 rounded-md hover:bg-ice-hover transition-colors"
                      title="Copy code"
                    >
                      {copied ? (
                        <Check className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <Copy className="w-4 h-4 text-ice-text-2" />
                      )}
                    </button>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-sm text-ice-text-2">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Waiting for authorization...
                  </div>
                  <a
                    href={deviceFlow.verificationUri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-ice-accent hover:underline"
                  >
                    {deviceFlow.verificationUri}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          )}

          {/* PAT */}
          {activeTab === 'pat' && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-ice-text-2">GitHub Token</label>
                <input
                  type="password"
                  value={patToken}
                  onChange={(e) => setPatToken(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  className="ice-input w-full mt-1"
                  onKeyDown={(e) => e.key === 'Enter' && handlePATConnect()}
                />
                <p className="mt-1 text-xs text-ice-text-3">
                  Generate a token at github.com/settings/tokens with repo scope.
                </p>
              </div>
              <button
                onClick={handlePATConnect}
                disabled={!patToken.trim() || isConnecting}
                className="ice-btn ice-btn-primary w-full"
              >
                {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Github className="w-4 h-4" />}
                Connect with Token
              </button>
            </div>
          )}
        </>
      )}

      <p className="text-xs text-ice-text-3 text-center">You can link repositories to services on the canvas later.</p>
    </div>
  );
};

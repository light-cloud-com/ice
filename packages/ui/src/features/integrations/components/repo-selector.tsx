/**
 * RepoSelector — GitHub repository picker
 *
 * Wraps the Combobox with GitHub repo data from Redux.
 * Used in both the PropertiesPanel and as an inline overlay on SvgCompactNode.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { GitHubConnectModal } from './github-connect-modal';
import { useTranslation } from '../../../i18n';
import { Combobox, type ComboboxOption } from '../../../shared/components/ui';
import { fetchGitHubRepos } from '../../../store/slices/integrations-slice';
import type { RootState, AppDispatch } from '../../../store';

interface RepoSelectorProps {
  value: string;
  onChange: (repoFullName: string) => void;
  compact?: boolean;
}

export const RepoSelector: React.FC<RepoSelectorProps> = ({ value, onChange, compact = false }) => {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const githubStatus = useSelector((s: RootState) => s.integrations.integrations.github?.status);
  const repos = useSelector((s: RootState) => s.integrations.github.repos);
  const loading = useSelector((s: RootState) => s.integrations.github.loading);
  const reposError = useSelector((s: RootState) => s.integrations.github.reposError);
  const [showConnectModal, setShowConnectModal] = useState(false);

  const isConnected = githubStatus === 'connected';

  // Fetch repos on mount if connected and list is empty. Also retry if the
  // previous fetch errored — previously this check only looked at repos.length,
  // so a failed fetch would never retry until the user reloaded the app.
  useEffect(() => {
    if (isConnected && repos.length === 0 && !loading && !reposError) {
      dispatch(fetchGitHubRepos(undefined));
    }
  }, [isConnected, repos.length, loading, reposError, dispatch]);

  const options: ComboboxOption[] = useMemo(
    () =>
      repos.map((r) => ({
        value: r.full_name,
        label: r.full_name,
        description: r.description || undefined,
        badge: r.private ? 'private' : undefined,
      })),
    [repos],
  );

  if (!isConnected) {
    return (
      <>
        <button
          onClick={() => setShowConnectModal(true)}
          className={`${compact ? 'text-ice-2xs px-1.5 py-0.5' : 'text-ice-sm px-2 py-1'} text-blue-400 bg-blue-950/30 border border-blue-900/50 rounded hover:bg-blue-950/50 transition-colors`}
        >
          {t('integrations.repoSelector.connectGitHub')}
        </button>
        <GitHubConnectModal isOpen={showConnectModal} onClose={() => setShowConnectModal(false)} />
      </>
    );
  }

  // Error state — previously the thunk silently swallowed errors and the
  // picker showed "No repos found" regardless of why the fetch failed.
  // Now we render the error message inline with a retry button AND a
  // "Reconnect" escape hatch for expired / insufficiently-scoped tokens.
  if (reposError && repos.length === 0) {
    const looksLikeAuthError = /401|403|expired|scope|not connected/i.test(reposError);
    return (
      <>
        <div
          className={`${
            compact ? 'text-ice-2xs px-1.5 py-1' : 'text-ice-sm px-2 py-1.5'
          } rounded border border-red-900/50 bg-red-950/20 text-red-300`}
        >
          <div className="font-medium mb-1">Couldn't load repositories</div>
          <div className="text-ice-2xs opacity-80 break-words">{reposError}</div>
          <div className="flex items-center gap-2 mt-1.5">
            <button
              onClick={() => dispatch(fetchGitHubRepos(undefined))}
              className="text-ice-2xs text-blue-300 hover:text-blue-200 underline"
            >
              Retry
            </button>
            {looksLikeAuthError && (
              <button
                onClick={() => setShowConnectModal(true)}
                className="text-ice-2xs text-blue-300 hover:text-blue-200 underline"
              >
                Reconnect GitHub
              </button>
            )}
          </div>
        </div>
        <GitHubConnectModal isOpen={showConnectModal} onClose={() => setShowConnectModal(false)} />
      </>
    );
  }

  return (
    <Combobox
      value={value}
      options={options}
      onSelect={onChange}
      placeholder={t('integrations.repoSelector.placeholder')}
      loading={loading}
      emptyText={t('integrations.repoSelector.noRepos')}
      compact={compact}
    />
  );
};

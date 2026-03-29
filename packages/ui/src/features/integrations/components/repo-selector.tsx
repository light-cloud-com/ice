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
import { Combobox, type ComboboxOption } from '../../../shared/components/ui/combobox';
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
  const [showConnectModal, setShowConnectModal] = useState(false);

  const isConnected = githubStatus === 'connected';

  // Fetch repos on mount if connected and list is empty
  useEffect(() => {
    if (isConnected && repos.length === 0 && !loading) {
      dispatch(fetchGitHubRepos(undefined));
    }
  }, [isConnected, repos.length, loading, dispatch]);

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


/**
 * Provider Settings — async handlers bundle.
 *
 * Extracted verbatim from `../../provider-settings.tsx` as part of the
 * rf-pset series. Bundles the five `handle*` async callbacks the modal
 * fires off the connect / disconnect / import flows, plus the GCP OAuth
 * `useGCPOAuth(reloadGCPState)` plumbing whose `connect()` callback the
 * GCP-specific button invokes.
 *
 * Why a hook (not pure functions): every callback closes over the
 * provider-states map, the modal's status setters, and the i18n
 * `t(...)` translator — passing all of those into pure functions
 * recomputes call-sites on every render and balloons the orchestrator's
 * prop surface. Keeping them as a hook lets the orchestrator pass
 * one tightly-scoped object to the section components.
 *
 * Boundary: the hook does NOT own state; the orchestrator does. Setters
 * + the current `providerStates` map come in as parameters. This is the
 * same shape as the rf-pdpl `useDeployControls` and `useDeployEffects`
 * hooks — the section components stay decoupled from the underlying
 * `useState` slots.
 */

import { useEffect } from 'react';
import { getApi } from '../../../api/api-adapter';
import { useGCPOAuth } from '../../../hooks/use-gcp-oauth';
import { PROVIDER_CONFIGS } from '../data/provider-configs';
import type { ProviderStatesMap } from '../types';

/** Lightweight TFunction shim covering the i18n surface this hook uses.
 *  Mirrors `useTranslation().t` from `../../i18n` (the concrete type is
 *  `(key: string, variables?: Record<string, string | number>) => string`)
 *  so the orchestrator can pass `t` straight through. */
export type TranslatorFn = (key: string, vars?: Record<string, string | number>) => string;

/** Public input contract for `useProviderHandlers`. */
export interface UseProviderHandlersInput {
  t: TranslatorFn;
  providerStates: ProviderStatesMap;
  setProviderStates: React.Dispatch<React.SetStateAction<ProviderStatesMap>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setSuccess: React.Dispatch<React.SetStateAction<string | null>>;
  setConnecting: React.Dispatch<React.SetStateAction<string | null>>;
  setImporting: React.Dispatch<React.SetStateAction<string | null>>;
  onClose: () => void;
  // Preserved as `any` from the source — the imported graph's schema
  // lives outside this file and the hook does not introspect it.

  onImportComplete?: (graph: any) => void;
}

/** Public output contract: the five async handlers plus the GCP OAuth
 *  controller (consumed by the connect section for `connecting` and
 *  `error` flags) and `reloadGCPState` for tests. */
export interface UseProviderHandlersOutput {
  handleGCPOAuth: () => void;
  handleConnect: (providerId: string) => Promise<void>;
  handleDisconnect: (providerId: string) => Promise<void>;
  handleRemoveProject: (providerId: string, projectId: string) => Promise<void>;
  handleImport: (providerId: string, projectId: string) => Promise<void>;
  gcpOAuth: ReturnType<typeof useGCPOAuth>;
  reloadGCPState: () => Promise<void>;
}

export function useProviderHandlers(input: UseProviderHandlersInput): UseProviderHandlersOutput {
  const {
    t,
    providerStates,
    setProviderStates,
    setError,
    setSuccess,
    setConnecting,
    setImporting,
    onClose,
    onImportComplete,
  } = input;

  // GCP OAuth via Google Identity Services
  const reloadGCPState = async (): Promise<void> => {
    setSuccess(t('providerSettings.connect.connectedToCloud'));
    const isConn = await getApi().provider.isConnected('gcp');
    const projects = isConn ? await getApi().provider.getProjects('gcp') : [];
    setProviderStates((prev) => ({
      ...prev,
      gcp: { connected: true, projects: projects || [], formValues: {} },
    }));
  };

  const gcpOAuth = useGCPOAuth(reloadGCPState);

  const handleGCPOAuth = (): void => {
    setError(null);
    setSuccess(null);
    gcpOAuth.connect();
  };

  // Sync GCP OAuth errors
  useEffect(() => {
    if (gcpOAuth.error) setError(gcpOAuth.error);
  }, [gcpOAuth.error, setError]);

  // Handle connect
  const handleConnect = async (providerId: string): Promise<void> => {
    setConnecting(providerId);
    setError(null);
    setSuccess(null);

    try {
      const formValues = providerStates[providerId]?.formValues || {};

      // Validate required fields
      const config = PROVIDER_CONFIGS.find((p) => p.id === providerId);
      if (config) {
        for (const field of config.configFields) {
          if (field.required && !formValues[field.name]) {
            throw new Error(`${field.label} is required`);
          }
        }
      }

      const result = await getApi().provider.connect(providerId, formValues);

      if (result.success) {
        setProviderStates((prev) => ({
          ...prev,
          [providerId]: {
            ...prev[providerId],
            connected: true,
            projects: result.projects || [],
          },
        }));
        setSuccess(t('providerSettings.connect.connectedTo', { name: config?.name || providerId }));
      } else {
        throw new Error(result.error || 'Connection failed');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.response?.data?.message || err?.message || String(err);
      setError(msg);
    } finally {
      setConnecting(null);
    }
  };

  // Handle disconnect
  const handleDisconnect = async (providerId: string): Promise<void> => {
    try {
      await getApi().provider.disconnect(providerId);
      setProviderStates((prev) => ({
        ...prev,
        [providerId]: {
          connected: false,
          projects: [],
          formValues: {},
        },
      }));
      setSuccess(t('providerSettings.connect.disconnectedSuccess'));
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    }
  };

  // Handle removing a project (for multi-project providers like GCP)
  const handleRemoveProject = async (providerId: string, projectId: string): Promise<void> => {
    try {
      setProviderStates((prev) => ({
        ...prev,
        [providerId]: {
          ...prev[providerId],
          projects: prev[providerId].projects.filter((p) => p.id !== projectId),
        },
      }));
      // Update stored projects
      const remainingProjects = providerStates[providerId]?.projects.filter((p) => p.id !== projectId) || [];
      await getApi().provider.saveCredentials(providerId, {
        ...providerStates[providerId]?.formValues,
        _projects: JSON.stringify(remainingProjects),
      });
      setSuccess(t('providerSettings.projects.removed'));
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    }
  };

  // Handle import from provider
  const handleImport = async (providerId: string, projectId: string): Promise<void> => {
    setImporting(`${providerId}-${projectId}`);
    setError(null);
    setSuccess(null);

    try {
      const result = await getApi().provider.import(providerId, projectId);

      if (result.success) {
        setSuccess(t('providerSettings.import.success', { count: result.graph?.nodes?.length || 0, projectId }));

        // Notify parent component about the import
        if (onImportComplete) {
          onImportComplete(result.graph);
        }

        // Close dialog after short delay
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        throw new Error(result.error || 'Import failed');
      }
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setImporting(null);
    }
  };

  return {
    handleGCPOAuth,
    handleConnect,
    handleDisconnect,
    handleRemoveProject,
    handleImport,
    gcpOAuth,
    reloadGCPState,
  };
}

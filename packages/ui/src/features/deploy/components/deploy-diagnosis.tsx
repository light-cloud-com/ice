import { Sparkles, Loader2, AlertCircle, CheckCircle, KeyRound } from 'lucide-react';
import React, { useCallback, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { AnthropicConnectModal } from '../../../features/integrations/components/anthropic-connect-modal';
import { useTranslation } from '../../../i18n';
import { getAccessToken } from '../../../shared/api/axios-instance';
import { startDiagnosis, setDiagnosis, diagnosisError, clearDiagnosis } from '../../../store/slices/deploy-slice';
import { serializeCanvas } from '../../ai/utils/serialize-canvas';
import type { RootState, AppDispatch } from '../../../store';

const API_BASE = (import.meta as any).env?.VITE_API_URL || '/api';

interface DeployDiagnosisProps {
  error: string;
  results: Array<{ name?: string; type?: string; action?: string; error?: string }>;
}

export const DeployDiagnosis: React.FC<DeployDiagnosisProps> = ({ error, results }) => {
  const dispatch = useDispatch<AppDispatch>();
  const diagnosis = useSelector((s: RootState) => s.deploy.diagnosis);
  const provider = useSelector((s: RootState) => s.deploy.provider);
  const region = useSelector((s: RootState) => s.deploy.region);
  const anthropicStatus = useSelector((s: RootState) => s.integrations.integrations.anthropic?.status);
  const aiConnected = anthropicStatus === 'connected';
  const [showAnthropicModal, setShowAnthropicModal] = useState(false);
  const { t } = useTranslation();

  const handleDiagnose = useCallback(async () => {
    dispatch(startDiagnosis());
    try {
      const { store } = await import('../../../store');
      const state = store.getState();
      const canvasContext = serializeCanvas(state);
      const token = getAccessToken();

      const response = await fetch(`${API_BASE}/ai/diagnose-deploy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          error,
          resourceResults: (results || []).map((r) => ({
            name: r.name || '',
            type: r.type || '',
            action: r.action || '',
            error: r.error,
          })),
          canvasContext,
          provider,
          region,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        let message = `Diagnosis failed (${response.status})`;
        try {
          const parsed = JSON.parse(body);
          if (parsed?.message) message = parsed.message;
        } catch {
          /* ignore */
        }
        dispatch(diagnosisError(message));
        return;
      }

      const data = await response.json();
      dispatch(
        setDiagnosis({
          diagnosis: data.diagnosis || 'No explanation returned.',
          suggestedFixes: Array.isArray(data.suggestedFixes) ? data.suggestedFixes : [],
        }),
      );
    } catch (err: any) {
      dispatch(diagnosisError(err?.message || 'Diagnosis failed'));
    }
  }, [dispatch, error, results, provider, region]);

  if (diagnosis.status === 'idle') {
    if (!aiConnected) {
      return (
        <>
          <button
            onClick={() => setShowAnthropicModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-ice-xs rounded border border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors"
            title={t('ai.diagnosis.connectToDiagnoseTooltip')}
          >
            <KeyRound className="w-3.5 h-3.5" />
            {t('ai.diagnosis.connectToDiagnose')}
          </button>
          <AnthropicConnectModal isOpen={showAnthropicModal} onClose={() => setShowAnthropicModal(false)} />
        </>
      );
    }
    return (
      <button
        onClick={handleDiagnose}
        className="flex items-center gap-1.5 px-3 py-1.5 text-ice-xs rounded border border-blue-500/30 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors"
      >
        <Sparkles className="w-3.5 h-3.5" />
        {t('ai.diagnosis.diagnoseWithAi')}
      </button>
    );
  }

  if (diagnosis.status === 'loading') {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 text-ice-xs text-ice-text-3">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Analyzing error...
      </div>
    );
  }

  if (diagnosis.status === 'error') {
    return (
      <div className="flex items-start gap-2 rounded border border-red-500/30 bg-red-500/10 p-3 text-ice-xs text-red-400">
        <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <p>Diagnosis failed: {diagnosis.error}</p>
          <button onClick={() => dispatch(clearDiagnosis())} className="mt-1 underline hover:text-red-300">
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  // loaded
  const res = diagnosis.result!;
  return (
    <div className="rounded border border-blue-500/30 bg-blue-500/5 p-3 space-y-2">
      <div className="flex items-start gap-2 text-ice-xs">
        <Sparkles className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-blue-400" />
        <div className="flex-1 text-ice-text-2 leading-relaxed">{res.diagnosis}</div>
        <button
          onClick={() => dispatch(clearDiagnosis())}
          className="text-ice-text-3 hover:text-ice-text-2 text-ice-2xs"
        >
          Dismiss
        </button>
      </div>

      {res.suggestedFixes.length > 0 && (
        <ul className="space-y-1 pl-5 text-ice-xs text-ice-text-2">
          {res.suggestedFixes.map((fix, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <CheckCircle className="w-3 h-3 mt-0.5 flex-shrink-0 text-emerald-400" />
              <span>{fix}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

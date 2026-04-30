/**
 * Edge Properties Section — right-sidebar panel rendered when the user has
 * selected exactly one edge on the active card.
 *
 * Shows: panel header (close → `toggleProperties`), connection-validation
 * warnings (from `computeEdgeWarnings`), a source → target visual block,
 * a Properties section that holds either a subdomain editor (when one end
 * of the edge is `Network.PublicEndpoint` or `Network.CustomDomain`) or a
 * plain port field (with an env-var-coupled variant when the edge's source
 * node is also wired to a `Config.Environment` block), and a delete-edge
 * button that dispatches `deleteCardEdge(selectedEdge.id)`.
 *
 * Stays Redux-coupled: uses `useDispatch` internally for
 * `updateCardEdgeData` (subdomain + port + envVarName writes), the env-var
 * sync `updateCardNodeData`, `deleteCardEdge`, and `toggleProperties`.
 *
 * Extracted verbatim from `properties-panel.tsx` lines 156–357 during
 * rf-props-22. Every relative path bumped one segment for the new
 * `components/sections/` depth: `../../../shared/...` → `../../../../shared/...`,
 * `../../../store/...` → `../../../../store/...`, `../../../i18n` →
 * `../../../../i18n`, `../utils/...` → `../../utils/...`, `./fields` →
 * `../fields`. Inline derivations (subdomain validation/preview, env-var
 * port coupling) preserved exactly. The `updateEdgeField` callback that
 * lived on the orchestrator closes over `selectedEdge.id` here; dispatch
 * shapes for `updateCardEdgeData`/`deleteCardEdge` are byte-identical.
 */

import React, { useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { t } from '../../../../i18n';
import { PanelHeader } from '../../../../shared/components/ui/panel-header';
import { cn } from '../../../../shared/utils/cn';
import {
  updateCardEdgeData,
  deleteCardEdge,
  updateCardNodeData,
  type Card,
  type CardEdge,
} from '../../../../store/slices/cards-slice';
import { toggleProperties } from '../../../../store/slices/ui-slice';
import type { AppDispatch } from '../../../../store';
import { computeEdgeWarnings } from '../../utils/edge-warnings';
import { normalizeSubdomain, validateSubdomain } from '../../utils/normalize-subdomain';
import { Section, TextField } from '../fields';

// ─── Edge Properties Section ────────────────────────────────────────────────

export const EdgePropertiesSection: React.FC<{
  selectedEdge: CardEdge;
  activeCard: Card;
}> = ({ selectedEdge, activeCard }) => {
  const dispatch = useDispatch<AppDispatch>();

  const updateEdgeField = useCallback(
    (field: string, value: unknown) => {
      dispatch(updateCardEdgeData({ edgeId: selectedEdge.id, data: { [field]: value } }));
    },
    [dispatch, selectedEdge.id],
  );

  const sourceNode = activeCard.nodes.find((n) => n.id === selectedEdge.source);
  const targetNode = activeCard.nodes.find((n) => n.id === selectedEdge.target);
  const sourceLabel = (sourceNode?.data?.label as string) || selectedEdge.source;
  const targetLabel = (targetNode?.data?.label as string) || selectedEdge.target;
  const edgeData = selectedEdge.data || {};
  const srcIceType = (sourceNode?.data?.iceType as string) || '';
  const tgtIceType = (targetNode?.data?.iceType as string) || '';

  // Compute validation warnings for this connection
  const edgeWarnings = computeEdgeWarnings(srcIceType, tgtIceType, t);

  return (
    <div id="ice-properties-panel" className="h-full flex flex-col bg-inherit overflow-y-auto">
      {/* Header */}
      <PanelHeader
        title={t('properties.title')}
        onClose={() => dispatch(toggleProperties())}
        closeLabel={t('properties.closeTitle')}
      />

      {/* Validation warnings */}
      {edgeWarnings.length > 0 && (
        <div className="px-3 pt-2 space-y-1.5">
          {edgeWarnings.map((w, i) => (
            <div key={i} className="rounded border border-amber-500/30 bg-amber-500/5 px-2.5 py-2">
              <div className="text-ice-xs text-amber-400 font-medium">{w.message}</div>
              {w.suggestion && <div className="text-ice-2xs text-ice-text-3 mt-0.5">{w.suggestion}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Visual source → target */}
      <div className="px-3 py-3 border-b border-ice-border">
        <div className="flex items-center gap-2">
          <div className="flex-1 text-center">
            <div className="text-ice-sm font-medium text-ice-text-1 truncate">{sourceLabel}</div>
            <div className="text-ice-2xs text-ice-text-3 font-mono truncate">
              {(sourceNode?.data?.iceType as string)?.split('.').pop() || 'node'}
            </div>
          </div>
          <div className="flex flex-col items-center shrink-0 gap-0.5">
            <div className="w-10 h-px bg-ice-border relative">
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0 h-0 border-l-[5px] border-l-ice-text-3 border-y-[3px] border-y-transparent" />
            </div>
            {((edgeData.connectionCategory as string) || (edgeData.relationship as string)) && (
              <span className="text-ice-2xs text-ice-text-3 font-mono">
                {(edgeData.connectionCategory as string) ||
                  ((edgeData.relationship as string) || '').replace('_', ' ')}
              </span>
            )}
          </div>
          <div className="flex-1 text-center">
            <div className="text-ice-sm font-medium text-ice-text-1 truncate">{targetLabel}</div>
            <div className="text-ice-2xs text-ice-text-3 font-mono truncate">
              {(targetNode?.data?.iceType as string)?.split('.').pop() || 'node'}
            </div>
          </div>
        </div>
      </div>

      {/* Properties */}
      <Section title={t('properties.edge.propertiesSection')}>
        {/* Subdomain — shown when either end of the edge is a
            Network.PublicEndpoint OR Network.CustomDomain, so users
            can route each service on a different host
            (api.example.com, app.example.com, etc.) without needing
            separate endpoint blocks. Empty = root. Validated against
            RFC 1035 DNS label rules: lowercase, digits, hyphens; no
            leading/trailing hyphen; ≤63 chars. */}
        {(srcIceType === 'Network.PublicEndpoint' ||
          tgtIceType === 'Network.PublicEndpoint' ||
          srcIceType === 'Network.CustomDomain' ||
          tgtIceType === 'Network.CustomDomain') &&
          (() => {
            const endpointNode =
              srcIceType === 'Network.PublicEndpoint' || srcIceType === 'Network.CustomDomain'
                ? sourceNode
                : targetNode;
            const rootDomain = ((endpointNode?.data?.domain as string) || '').trim();
            const currentSubdomain = (edgeData.subdomain as string) || '';

            const validationError = currentSubdomain ? validateSubdomain(currentSubdomain) : null;

            const previewHost =
              currentSubdomain && rootDomain ? `${currentSubdomain}.${rootDomain}` : rootDomain || '(no domain set)';
            return (
              <div className="space-y-1 mb-2">
                <label className="text-ice-2xs text-ice-text-3">Subdomain</label>
                <input
                  type="text"
                  value={currentSubdomain}
                  onChange={(e) => {
                    const cleaned = normalizeSubdomain(e.target.value);
                    updateEdgeField('subdomain', cleaned || null);
                  }}
                  placeholder="api (leave blank for root)"
                  className={cn(
                    'w-full px-1.5 py-1.5 text-ice-sm rounded border bg-ice-base text-ice-text-1 font-mono focus:outline-none focus:ring-1',
                    validationError
                      ? 'border-red-500/50 focus:ring-red-500'
                      : 'border-ice-border focus:ring-blue-500',
                  )}
                />
                {validationError ? (
                  <div className="text-ice-2xs text-red-400">{validationError}</div>
                ) : (
                  <div className="text-ice-2xs text-ice-text-3 font-mono">→ {previewHost}</div>
                )}
              </div>
            );
          })()}

        {/* Port — unified with env var when EnvVars block is connected */}
        {(() => {
          const sourceId = selectedEdge.source;
          const envNode = activeCard.nodes.find((n) => {
            if ((n.data?.iceType as string) !== 'Config.Environment') return false;
            return activeCard.edges.some(
              (e) => (e.source === sourceId && e.target === n.id) || (e.target === sourceId && e.source === n.id),
            );
          });
          const vars = (envNode?.data?.variables as Array<{ name: string; value: string }>) || [];
          const currentEnvVar = (edgeData.envVarName as string) || '';
          const currentPort = edgeData.port != null ? String(edgeData.port) : '';

          if (envNode) {
            return (
              <div className="space-y-1">
                <label className="text-ice-2xs text-ice-text-3">{t('properties.edge.portLabel')}</label>
                <div className="flex items-center gap-1">
                  <select
                    value={currentEnvVar}
                    onChange={(e) => {
                      const picked = e.target.value;
                      updateEdgeField('envVarName', picked || null);
                      if (picked) {
                        const match = vars.find((v) => v.name === picked);
                        if (match?.value && /^\d+$/.test(match.value.trim())) {
                          updateEdgeField('port', Number(match.value.trim()));
                        }
                      }
                    }}
                    className="flex-1 min-w-0 px-1.5 py-1.5 text-ice-sm rounded-l border border-ice-border bg-ice-base text-amber-400 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="" className="text-ice-text-1">
                      {t('properties.edge.customOption')}
                    </option>
                    {vars.map((v) => (
                      <option key={v.name} value={v.name}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                  <span className="text-ice-text-3 text-ice-sm">=</span>
                  <input
                    type="text"
                    value={currentPort}
                    onChange={(e) => {
                      const val = e.target.value;
                      updateEdgeField('port', val ? Number(val) : null);
                      if (currentEnvVar && envNode) {
                        const updatedVars = [...vars];
                        const idx = updatedVars.findIndex((v) => v.name === currentEnvVar);
                        if (idx !== -1) {
                          updatedVars[idx] = { ...updatedVars[idx], value: val };
                          dispatch(updateCardNodeData({ nodeId: envNode.id, data: { variables: updatedVars } }));
                        }
                      }
                    }}
                    placeholder="5432"
                    className="w-20 px-1.5 py-1.5 text-ice-sm rounded-r border border-ice-border bg-ice-base text-ice-text-1 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            );
          }

          return (
            <TextField
              label={t('properties.edge.portLabel')}
              value={currentPort}
              placeholder="e.g. 5432"
              onChange={(v) => updateEdgeField('port', v ? Number(v) : null)}
            />
          );
        })()}
      </Section>

      {/* Delete */}
      <div className="px-3 mt-2">
        <button
          onClick={() => dispatch(deleteCardEdge(selectedEdge.id))}
          className="w-full py-1.5 text-ice-sm text-red-400 bg-red-950/30 border border-red-900/50 rounded hover:bg-red-950/50 transition-colors"
        >
          {t('properties.edge.deleteButton')}
        </button>
      </div>
    </div>
  );
};

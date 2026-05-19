/**
 * SvgLlmGatewayNode — Read-only canvas renderer for `AI.LLMGateway`.
 *
 * Body shows the model routing intent — a primary model row (filled
 * dot) and up to two fallback rows (hollow dots), each labeled in mono
 * with the model identifier. This visual encodes the gateway's purpose:
 * one URL, many candidate models, picked by priority + availability.
 *
 * Falls back to a single-row "primary" line when only `model` is set
 * (legacy blueprint default).
 */

import {
  CARD_FOOTER_HEIGHT,
  COMPUTE_BODY_HEIGHT,
  COMPUTE_HEADER_HEIGHT,
  COMPUTE_PADDING,
} from '@ice/constants';
import { Brain } from 'lucide-react';
import React from 'react';
import { CardShell } from '../_shared';
import { t } from '../../../../../i18n';
import type { SvgCompactNodeProps } from '../compact-node/types';

export { COMPUTE_HEADER_HEIGHT, COMPUTE_BODY_HEIGHT, COMPUTE_PADDING };

export function computeLlmGatewayHeight(): number {
  return COMPUTE_HEADER_HEIGHT + COMPUTE_PADDING + COMPUTE_BODY_HEIGHT + COMPUTE_PADDING + CARD_FOOTER_HEIGHT;
}

const LLM_ACCENT = '#f97316';

interface ModelRow {
  label: string;
  model: string;
  primary: boolean;
}

function resolveModelRows(data: Record<string, unknown> | undefined): ModelRow[] {
  const rows: ModelRow[] = [];
  const primary = (data?.model as string) || (data?.primaryModel as string) || '';
  if (primary) rows.push({ label: t('canvas.blocks.llm.primary'), model: primary, primary: true });

  const fallbacks = data?.fallbackModels;
  if (Array.isArray(fallbacks)) {
    for (const fb of fallbacks.slice(0, 2)) {
      if (typeof fb === 'string' && fb) {
        rows.push({ label: t('canvas.blocks.llm.fallback'), model: fb, primary: false });
      } else if (fb && typeof fb === 'object') {
        const m = (fb as { model?: string }).model;
        if (m) rows.push({ label: t('canvas.blocks.llm.fallback'), model: m, primary: false });
      }
    }
  } else if (typeof data?.fallbackModel === 'string' && data.fallbackModel) {
    rows.push({ label: t('canvas.blocks.llm.fallback'), model: data.fallbackModel as string, primary: false });
  }

  return rows;
}

function buildLiveConfig(data: Record<string, unknown> | undefined): string {
  const rate = data?.rateLimitPerMin != null ? t('canvas.blocks.llm.rpm', { n: data.rateLimitPerMin as string | number }) : '';
  const quota = (data?.quotas as string) || '';
  const fallbacksOn = !!(data?.fallbackModel || (Array.isArray(data?.fallbackModels) && data.fallbackModels.length));
  const parts = [rate, quota, fallbacksOn ? t('canvas.blocks.llm.fallbackOn') : ''].filter(Boolean) as string[];
  return parts.join(' · ') || t('canvas.blocks.llm.noRateLimits');
}

const ModelRowView: React.FC<{ row: ModelRow; color: string }> = ({ row, color }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
      fontSize: 11,
      minWidth: 0,
    }}
  >
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: row.primary ? color : 'transparent',
        border: `1.5px solid ${color}`,
        flexShrink: 0,
      }}
    />
    <span
      style={{
        color: 'var(--ice-text-tertiary)',
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        flexShrink: 0,
        opacity: row.primary ? 0.9 : 0.6,
        width: 52,
      }}
    >
      {row.label}
    </span>
    <span
      style={{
        color: row.primary ? 'var(--ice-text-1)' : 'var(--ice-text-2)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        flex: 1,
        minWidth: 0,
      }}
      title={row.model}
    >
      {row.model}
    </span>
  </div>
);

export const SvgLlmGatewayNode: React.FC<SvgCompactNodeProps> = ({
  node,
  isSelected,
  isDragOver = false,
  onNodeHover,
  connectionDragState = null,
  lod,
  pipelineStatus,
}) => {
  const rows = resolveModelRows(node.data);
  const liveConfig = buildLiveConfig(node.data);

  return (
    <CardShell
      node={node}
      isSelected={isSelected}
      isDragOver={isDragOver}
      onNodeHover={onNodeHover}
      connectionDragState={connectionDragState}
      lod={lod}
      pipelineStatus={pipelineStatus}
      icon={Brain}
      accentColor={LLM_ACCENT}
      title={node.label || t('canvas.blocks.titles.llmGateway')}
      liveConfig={liveConfig}
      headerHeight={COMPUTE_HEADER_HEIGHT}
    >
      <div
        style={{
          height: COMPUTE_BODY_HEIGHT,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          justifyContent: 'center',
        }}
        data-testid={`llm-body-${node.id}`}
      >
        {rows.length > 0 ? (
          rows.map((row, i) => <ModelRowView key={`${row.label}-${i}`} row={row} color={LLM_ACCENT} />)
        ) : (
          <span
            style={{
              fontSize: 11,
              color: 'var(--ice-text-tertiary)',
              fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
              opacity: 0.6,
              textAlign: 'center',
            }}
          >
            {t('canvas.blocks.llm.noModelSelected')}
          </span>
        )}
      </div>
    </CardShell>
  );
};

SvgLlmGatewayNode.displayName = 'SvgLlmGatewayNode';

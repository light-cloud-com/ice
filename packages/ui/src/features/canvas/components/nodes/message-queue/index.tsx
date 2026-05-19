/**
 * SvgMessageQueueNode — Read-only canvas renderer for `Messaging.Queue`.
 *
 * Shows the configured queues as static pills with FIFO/STD badges.
 * Editing moves to the properties panel (canvas is display-only).
 */

import { CARD_FOOTER_HEIGHT, MQ_HEADER_HEIGHT, MQ_PADDING, MQ_ROW_GAP, MQ_ROW_HEIGHT } from '@ice/constants';
import { List } from 'lucide-react';
import React from 'react';
import { Badge, CardShell, EmptyHint, Pill } from '../_shared';
import { t } from '../../../../../i18n';
import type { SvgCompactNodeProps } from '../compact-node/types';

// Re-exported so svg-canvas / tests can compute card height.
export { MQ_HEADER_HEIGHT, MQ_ROW_HEIGHT, MQ_ROW_GAP, MQ_PADDING };

/** Compute dynamic height based on the number of queues. */
export function computeMessageQueueHeight(data: Record<string, unknown>): number {
  const queues = (data?.queues as unknown[] | undefined) || [];
  const rowCount = Math.max(queues.length, 1);
  return (
    MQ_HEADER_HEIGHT + MQ_PADDING + rowCount * (MQ_ROW_HEIGHT + MQ_ROW_GAP) + MQ_PADDING + CARD_FOOTER_HEIGHT
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

interface QueueView {
  name: string;
  fifo: boolean;
}

function parseQueue(raw: unknown): QueueView {
  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>;
    return { name: String(obj.name ?? ''), fifo: !!obj.fifo };
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && typeof parsed.name === 'string') {
        return { name: parsed.name, fifo: !!parsed.fifo };
      }
    } catch {
      /* fallthrough */
    }
    return { name: raw, fifo: false };
  }
  return { name: '', fifo: false };
}

// ─── Component ────────────────────────────────────────────────────────────

export const SvgMessageQueueNode: React.FC<SvgCompactNodeProps> = ({
  node,
  isSelected,
  isDragOver = false,
  onNodeHover,
  connectionDragState = null,
  lod,
  pipelineStatus,
}) => {
  const queues: QueueView[] = ((node.data?.queues as unknown[] | undefined) || []).map(parseQueue);
  const liveConfig =
    queues.length > 0
      ? queues.length === 1
        ? t('canvas.blocks.queue.queueOne')
        : t('canvas.blocks.queue.queueMany', { n: queues.length })
      : 'No queues yet';

  return (
    <CardShell
      node={node}
      isSelected={isSelected}
      isDragOver={isDragOver}
      onNodeHover={onNodeHover}
      connectionDragState={connectionDragState}
      lod={lod}
      pipelineStatus={pipelineStatus}
      icon={List}
      title={node.label || t('canvas.blocks.titles.messageQueue')}
      liveConfig={liveConfig}
      headerHeight={MQ_HEADER_HEIGHT}
    >
      {queues.length === 0 ? (
        <EmptyHint message={t('canvas.blocks.common.editInProperties')} />
      ) : (
        queues.map((q, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              height: MQ_ROW_HEIGHT,
            }}
          >
            <Pill>{q.name || t('canvas.blocks.common.unnamed')}</Pill>
            <Badge tone={q.fifo ? 'accent' : 'neutral'}>{q.fifo ? t('canvas.blocks.queue.fifo') : t('canvas.blocks.queue.std')}</Badge>
          </div>
        ))
      )}
    </CardShell>
  );
};

SvgMessageQueueNode.displayName = 'SvgMessageQueueNode';

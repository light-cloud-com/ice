/**
 * SvgScheduledTaskNode — Read-only canvas renderer for `Compute.CronJob`.
 *
 * Each task is (name, schedule, action). The action defines WHAT the
 * task does when its schedule fires:
 *
 *   - `block`: invoke a block on the canvas (Lambda / Container / Queue).
 *     Each row reads "task → block-name". The compiler emits the
 *     provider-specific trigger (EventBridge → Lambda ARN, etc.).
 *   - `http`: fire an HTTP request at an external URL. Each row reads
 *     "task → METHOD url". Compiles to an EventBridge Scheduler with an
 *     HTTPS target / a Cloud Scheduler HTTP job / equivalent.
 *
 *   ┌──────────────────────────────────────┐
 *   │ 🕒 Nightly Jobs                AWS  │
 *   │    EventBridge · us-east-1          │
 *   ├──────────────────────────────────────┤
 *   │ ◐ Nightly backup → video-encoder    │
 *   │   0 0 * * *               in 12h    │
 *   │ ◐ Heartbeat → POST api.example.com  │
 *   │   0 * * * *               in 14m    │
 *   ├──────────────────────────────────────┤
 *   │ 2 tasks · UTC                  ● up │
 *   └──────────────────────────────────────┘
 */

import {
  CARD_FOOTER_HEIGHT,
  CRON_BODY_PADDING_BOTTOM,
  CRON_BODY_PADDING_TOP,
  CRON_HEADER_HEIGHT,
  CRON_MIN_TASK_ROWS,
  CRON_TASK_ROW_GAP,
  CRON_TASK_ROW_HEIGHT,
} from '@ice/constants';
import { Clock } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { formatCountdown, nextFireFromCron } from './next-fire';
import { CARD_WIDTH } from '../../../../../config/canvas-constants';
import { t } from '../../../../../i18n';
import { selectActiveCard } from '../../../../../store/slices/cards-slice';
import { CardShell } from '../_shared';
import type { SvgCompactNodeProps } from '../compact-node/types';

export { formatCountdown, nextFireFromCron };
export { CRON_HEADER_HEIGHT, CRON_TASK_ROW_HEIGHT, CRON_TASK_ROW_GAP, CRON_BODY_PADDING_TOP, CRON_BODY_PADDING_BOTTOM };

// ─── Layout helpers ───────────────────────────────────────────────────────

/** Total card height for the canvas sizer — grows with task count. */
export function computeCronJobHeight(data: Record<string, unknown> | undefined): number {
  const tasks = (data?.tasks as unknown[] | undefined) || [];
  const hasLegacy = !!(data?.schedule_expression || data?.frequency || data?.schedule);
  const rowCount = Math.max(tasks.length || (hasLegacy ? 1 : 0), CRON_MIN_TASK_ROWS);
  const bodyHeight =
    CRON_BODY_PADDING_TOP +
    rowCount * CRON_TASK_ROW_HEIGHT +
    (rowCount - 1) * CRON_TASK_ROW_GAP +
    CRON_BODY_PADDING_BOTTOM;
  return CRON_HEADER_HEIGHT + bodyHeight + CARD_FOOTER_HEIGHT;
}

/** Card width — same as the standard compact card so cron lines up visually. */
export function computeCronJobWidth(): number {
  return CARD_WIDTH;
}

// ─── Cron parsing helpers ─────────────────────────────────────────────────

interface CronTask {
  id: string;
  name: string;
  frequency: string;
  schedule_expression?: string;
  action_type?: 'block' | 'http';
  action_target_node_id?: string;
  action_url?: string;
  action_http_method?: string;
}

export function frequencyToCron(frequency: string): string | null {
  switch (frequency) {
    case t('canvas.blocks.scheduled.freqEveryMinute'):
      return '* * * * *';
    case t('canvas.blocks.scheduled.freqEvery5'):
      return '*/5 * * * *';
    case t('canvas.blocks.scheduled.freqEvery15'):
      return '*/15 * * * *';
    case t('canvas.blocks.scheduled.freqEvery30'):
      return '*/30 * * * *';
    case t('canvas.blocks.scheduled.freqEveryHour'):
      return '0 * * * *';
    case t('canvas.blocks.scheduled.freqEvery6h'):
      return '0 */6 * * *';
    case t('canvas.blocks.scheduled.freqEvery12h'):
      return '0 */12 * * *';
    case t('canvas.blocks.scheduled.freqDailyMidnight'):
    case 'Every day at midnight':
      return '0 0 * * *';
    case t('canvas.blocks.scheduled.freqDaily9'):
      return '0 9 * * *';
    case t('canvas.blocks.scheduled.freqWeekdays9'):
      return '0 9 * * 1-5';
    case t('canvas.blocks.scheduled.freqWeeklyMon'):
    case 'Every Monday':
      return '0 0 * * 1';
    case t('canvas.blocks.scheduled.freqMonthly1st'):
    case 'Every 1st of the month':
      return '0 0 1 * *';
    case t('canvas.blocks.scheduled.freqCustom'):
    case t('canvas.blocks.scheduled.freqCustomSchedule'):
    default:
      return null;
  }
}

export function resolveTaskCron(task: { frequency?: string; schedule_expression?: string }): string {
  const expr = (task.schedule_expression || '').trim();
  if (expr) return expr;
  const freq = (task.frequency || '').trim();
  if (freq) {
    const fromFreq = frequencyToCron(freq);
    if (fromFreq) return fromFreq;
  }
  return '';
}

function dayNames(): string[] {
  return [
    t('canvas.blocks.scheduled.daySun'),
    t('canvas.blocks.scheduled.dayMon'),
    t('canvas.blocks.scheduled.dayTue'),
    t('canvas.blocks.scheduled.dayWed'),
    t('canvas.blocks.scheduled.dayThu'),
    t('canvas.blocks.scheduled.dayFri'),
    t('canvas.blocks.scheduled.daySat'),
  ];
}

export function describeCron(expr: string): string {
  if (!expr) return t('canvas.blocks.scheduled.describeNoSchedule');
  const trimmed = expr.trim();
  if (trimmed === '* * * * *') return t('canvas.blocks.scheduled.describeEveryMinute');
  if (/^\*\/\d+ \* \* \* \*$/.test(trimmed))
    return `every ${trimmed.split(' ')[0].slice(2)} ${t('canvas.blocks.scheduled.describeMinAbbr')}`;
  if (trimmed === '0 * * * *') return t('canvas.blocks.scheduled.describeEveryHour');
  if (/^0 \*\/\d+ \* \* \*$/.test(trimmed))
    return `every ${trimmed.split(' ')[1].slice(2)} ${t('canvas.blocks.scheduled.describeHours')}`;
  const dailyMatch = /^(\d+) (\d+) \* \* \*$/.exec(trimmed);
  if (dailyMatch) {
    return `daily at ${dailyMatch[2].padStart(2, '0')}:${dailyMatch[1].padStart(2, '0')}`;
  }
  const weeklyMatch = /^(\d+) (\d+) \* \* (\d)$/.exec(trimmed);
  if (weeklyMatch) {
    const days = dayNames();
    return `weekly ${days[Number(weeklyMatch[3]) % 7]} ${weeklyMatch[2].padStart(2, '0')}:00`;
  }
  return t('canvas.blocks.scheduled.describeCustom');
}

export function resolveSchedule(data: Record<string, unknown> | undefined): string {
  const tasks = resolveTasks(data);
  return tasks.length > 0 ? resolveTaskCron(tasks[0]) : '';
}

export function resolveTasks(data: Record<string, unknown> | undefined): CronTask[] {
  if (!data) return [];
  const rawTasks = data.tasks;
  if (Array.isArray(rawTasks) && rawTasks.length > 0) {
    return rawTasks.map((entry, i) => parseTaskEntry(entry, i));
  }
  const legacyFreq = (data.frequency as string) || '';
  const legacyExpr = (data.schedule_expression as string) || '';
  const legacySchedule = (data.schedule as string) || '';
  if (legacyFreq || legacyExpr || legacySchedule) {
    return [
      {
        id: 'legacy-task',
        name: 'Scheduled run',
        frequency: legacyFreq,
        schedule_expression: legacyExpr || legacySchedule || undefined,
      },
    ];
  }
  return [];
}

function parseTaskEntry(entry: unknown, index: number): CronTask {
  const pickFields = (obj: Record<string, unknown>, id: string): CronTask => ({
    id: (obj.id as string) || id,
    name: (obj.name as string) || '',
    frequency: (obj.frequency as string) || '',
    schedule_expression: (obj.schedule_expression as string) || undefined,
    action_type: obj.action_type === 'http' ? 'http' : 'block',
    action_target_node_id: (obj.action_target_node_id as string) || undefined,
    action_url: (obj.action_url as string) || undefined,
    action_http_method: (obj.action_http_method as string) || undefined,
  });
  if (typeof entry === 'string') {
    try {
      const parsed = JSON.parse(entry);
      if (parsed && typeof parsed === 'object') {
        return pickFields(parsed as Record<string, unknown>, `task-${index}`);
      }
    } catch {
      /* fall through */
    }
    return { id: `task-${index}`, name: entry, frequency: '', action_type: 'block' };
  }
  if (entry && typeof entry === 'object') {
    return pickFields(entry as Record<string, unknown>, `task-${index}`);
  }
  return { id: `task-${index}`, name: '', frequency: '', action_type: 'block' };
}

function extractDailyHour(expr: string): number | null {
  const m = /^(\d+) (\d+) \* \* \*$/.exec(expr.trim());
  if (!m) return null;
  const h = Number(m[2]);
  return h >= 0 && h <= 23 ? h : null;
}

// ─── Clock face (per-row icon) ────────────────────────────────────────────

interface ClockFaceProps {
  hour: number | null;
  color: string;
  size?: number;
}

const ClockFace: React.FC<ClockFaceProps> = ({ hour, color, size = 16 }) => {
  const r = (size - 2) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const handAngle = ((hour ?? 0) % 12) * 30;
  const handLength = r * 0.55;
  const handEndX = cx + handLength * Math.sin((handAngle * Math.PI) / 180);
  const handEndY = cy - handLength * Math.cos((handAngle * Math.PI) / 180);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }} aria-hidden="true">
      <circle cx={cx} cy={cy} r={r} fill="var(--ice-bg-base)" stroke={`${color}66`} strokeWidth={1} />
      <line
        x1={cx}
        y1={cy}
        x2={cx}
        y2={cy - r * 0.7}
        stroke={color}
        strokeWidth={1}
        strokeLinecap="round"
        opacity={0.55}
      />
      <line x1={cx} y1={cy} x2={handEndX} y2={handEndY} stroke={color} strokeWidth={1.4} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={1.2} fill={color} />
    </svg>
  );
};

// ─── Component ────────────────────────────────────────────────────────────

const ACCENT = '#3b82f6';

export const SvgScheduledTaskNode: React.FC<SvgCompactNodeProps> = ({
  node,
  isSelected,
  isDragOver = false,
  onNodeHover,
  connectionDragState = null,
  lod,
  pipelineStatus,
}) => {
  const tasks = resolveTasks(node.data);
  const timezone = (node.data?.timezone as string) || '';

  // Live target-block lookup. Each task whose action is `block` resolves
  // its target via this map; renaming the target block elsewhere updates
  // the cron card without a refresh. A deleted target shows "(deleted)"
  // so broken references are visible at a glance.
  const activeCard = useSelector(selectActiveCard);
  const blockLabelById = useMemo(() => {
    const map = new Map<string, string>();
    const nodes = (activeCard?.nodes || []) as Array<{ id: string; data?: Record<string, unknown> }>;
    for (const n of nodes) {
      const d = (n.data || {}) as Record<string, unknown>;
      map.set(n.id, (d.name as string) || (d.label as string) || n.id);
    }
    return map;
  }, [activeCard]);

  const hasCountdown = tasks.some((t) => !!resolveTaskCron(t));
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!hasCountdown) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [hasCountdown]);

  const taskCount = tasks.length;
  const liveConfig =
    (taskCount > 0
      ? taskCount === 1
        ? t('canvas.blocks.scheduled.taskOne')
        : t('canvas.blocks.scheduled.taskMany', { n: taskCount })
      : t('canvas.blocks.scheduled.noTasks')) + (timezone ? ` · ${timezone}` : '');

  return (
    <CardShell
      node={node}
      isSelected={isSelected}
      isDragOver={isDragOver}
      onNodeHover={onNodeHover}
      connectionDragState={connectionDragState}
      lod={lod}
      pipelineStatus={pipelineStatus}
      icon={Clock}
      accentColor={ACCENT}
      title={node.label || t('canvas.blocks.titles.scheduledTask')}
      liveConfig={liveConfig}
      headerHeight={CRON_HEADER_HEIGHT}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: CRON_TASK_ROW_GAP,
          minHeight: 0,
        }}
        data-testid={`st-body-${node.id}`}
      >
        {tasks.length === 0 ? (
          <span
            style={{
              fontSize: 11,
              fontStyle: 'italic',
              color: 'var(--ice-text-tertiary)',
              opacity: 0.7,
              padding: '2px 0',
            }}
            data-testid={`st-empty-${node.id}`}
          >
            {t('canvas.blocks.scheduled.noTasksYet')}
          </span>
        ) : (
          tasks.map((task, i) => {
            const cron = resolveTaskCron(task);
            const fire = cron ? nextFireFromCron(cron, new Date(now)) : null;
            const countdown = fire ? formatCountdown(fire.getTime() - now) : '';
            const hour = extractDailyHour(cron);
            // Resolve the action label — what shows after the task name.
            // Block actions resolve to the target block's label;
            // HTTP actions show "METHOD url"; unset actions get an
            // amber hint so the user can spot incomplete tasks.
            const actionType = task.action_type || 'block';
            let actionLabel = '';
            let actionMissing = false;
            if (actionType === 'block') {
              if (task.action_target_node_id) {
                actionLabel = blockLabelById.get(task.action_target_node_id) || t('canvas.blocks.common.deleted');
              } else {
                actionMissing = true;
              }
            } else {
              if (task.action_url) {
                const method = (task.action_http_method || 'GET').toUpperCase();
                const shortUrl = task.action_url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
                actionLabel = `${method} ${shortUrl}`;
              } else {
                actionMissing = true;
              }
            }
            return (
              <div
                key={task.id || i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '0 8px',
                  height: CRON_TASK_ROW_HEIGHT,
                  background: 'var(--ice-bg-base)',
                  border: '1px solid var(--ice-border)',
                  borderRadius: 4,
                  minWidth: 0,
                }}
                data-testid={`st-task-${node.id}-${i}`}
              >
                <ClockFace hour={hour} color={ACCENT} />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--ice-text-1)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      fontWeight: 500,
                    }}
                    title={
                      actionLabel
                        ? `${task.name || t('canvas.blocks.scheduled.unnamedTask')} → ${actionLabel}`
                        : task.name || t('canvas.blocks.scheduled.unnamedTask')
                    }
                  >
                    {task.name || t('canvas.blocks.scheduled.unnamedTask')}
                    {actionLabel && (
                      <>
                        <span style={{ color: 'var(--ice-text-3)', opacity: 0.6, margin: '0 4px' }}>→</span>
                        <span style={{ color: ACCENT, fontWeight: 600 }} data-testid={`st-task-action-${node.id}-${i}`}>
                          {actionLabel}
                        </span>
                      </>
                    )}
                  </span>
                  <span
                    style={{
                      fontSize: 9,
                      fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
                      color: 'var(--ice-text-3)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      opacity: 0.85,
                    }}
                    title={cron}
                  >
                    {cron || '— — — — —'}
                    {actionMissing && (
                      <span
                        style={{ color: '#f59e0b', marginLeft: 6, fontStyle: 'italic' }}
                        data-testid={`st-task-no-action-${node.id}-${i}`}
                      >
                        {t('canvas.blocks.scheduled.setActionInProperties')}
                      </span>
                    )}
                  </span>
                </div>
                {countdown && (
                  <span
                    style={{
                      fontSize: 9,
                      fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
                      color: ACCENT,
                      flexShrink: 0,
                      opacity: 0.9,
                    }}
                    data-testid={`st-task-countdown-${node.id}-${i}`}
                  >
                    {countdown}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </CardShell>
  );
};

SvgScheduledTaskNode.displayName = 'SvgScheduledTaskNode';

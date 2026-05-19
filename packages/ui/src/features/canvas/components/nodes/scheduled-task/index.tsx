/**
 * SvgScheduledTaskNode — Read-only canvas renderer for `Compute.CronJob`.
 *
 * Body is a small analog clock face + the cron expression in mono. The
 * clock's hour hand rotates to the cron's hour-of-day when the schedule
 * matches the `M H * * *` daily pattern; for non-daily schedules the
 * clock stays at 12:00 and the human-readable description on the right
 * does the talking.
 *
 *   ┌──────────────────────────────────┐
 *   │ 🕒 Nightly Backup           AWS  │
 *   │    EventBridge · us-east-1       │
 *   ├──────────────────────────────────┤
 *   │   ╭───╮     0 3 * * *            │
 *   │   │ ◐ │     daily at 03:00        │
 *   │   ╰───╯                          │
 *   ├──────────────────────────────────┤
 *   │ node20 · 300s timeout      ● up │
 *   └──────────────────────────────────┘
 *
 * Clock SVG is purely decorative — `describeCron()` is the source of
 * truth for what the schedule means. Editing the schedule lives in the
 * properties panel.
 */

import { CARD_FOOTER_HEIGHT, ST_BODY_HEIGHT, ST_HEADER_HEIGHT, ST_PADDING } from '@ice/constants';
import { Clock } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { CardShell } from '../_shared';
import { formatCountdown, nextFireFromCron } from './next-fire';
import type { SvgCompactNodeProps } from '../compact-node/types';

export { formatCountdown, nextFireFromCron };

export { ST_HEADER_HEIGHT, ST_BODY_HEIGHT, ST_PADDING };

export function computeScheduledTaskHeight(): number {
  return ST_HEADER_HEIGHT + ST_PADDING + ST_BODY_HEIGHT + ST_PADDING + CARD_FOOTER_HEIGHT;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Translate the friendly `frequency` select in the properties panel
 * (e.g. "Every day at midnight") to an equivalent cron expression. The
 * options here mirror those listed in the high-level resource definition
 * at `packages/core/src/resources/high-level-resources/categories/compute.ts`.
 * 'Custom schedule' returns null so callers fall through to
 * `schedule_expression`.
 */
export function frequencyToCron(frequency: string): string | null {
  switch (frequency) {
    // Sub-hour intervals — keep "Every minute" out of the canonical menu
    // because it's mostly a foot-gun for cron jobs (rate limits, races),
    // but still translate it for legacy data that already stored it.
    case 'Every minute':
      return '* * * * *';
    case 'Every 5 minutes':
      return '*/5 * * * *';
    case 'Every 15 minutes':
      return '*/15 * * * *';
    case 'Every 30 minutes':
      return '*/30 * * * *';
    // Hour-level intervals
    case 'Every hour':
      return '0 * * * *';
    case 'Every 6 hours':
      return '0 */6 * * *';
    case 'Every 12 hours':
      return '0 */12 * * *';
    // Daily anchored
    case 'Daily at midnight':
    case 'Every day at midnight': // legacy label
      return '0 0 * * *';
    case 'Daily at 9 AM':
      return '0 9 * * *';
    // Workweek and weekly anchors
    case 'Weekdays at 9 AM':
      return '0 9 * * 1-5';
    case 'Weekly on Monday':
    case 'Every Monday': // legacy label
      return '0 0 * * 1';
    // Monthly
    case 'Monthly on the 1st':
    case 'Every 1st of the month': // legacy label
      return '0 0 1 * *';
    // Custom — caller falls through to schedule_expression
    case 'Custom':
    case 'Custom schedule': // legacy label
    default:
      return null;
  }
}

/**
 * Resolve the cron expression the canvas should display from the various
 * fields the properties panel might have written:
 *   1. `schedule_expression` — raw cron the user typed (highest priority)
 *   2. `frequency` — friendly select, translated via `frequencyToCron`
 *   3. `schedule` — legacy field still set by the blueprint's
 *      `nodeDataDefaults` so freshly-dropped blocks have a starting value.
 */
export function resolveSchedule(data: Record<string, unknown> | undefined): string {
  const expression = (data?.schedule_expression as string) || '';
  if (expression) return expression;
  const frequency = (data?.frequency as string) || '';
  if (frequency) {
    const fromFreq = frequencyToCron(frequency);
    if (fromFreq) return fromFreq;
  }
  return (data?.schedule as string) || '';
}

/**
 * Translate a cron expression into a short human label. Hits the common
 * patterns (every minute, hourly, daily-at-H, weekly) and falls back to
 * "custom schedule" for anything else. Kept intentionally tiny — the cron
 * expression itself is rendered alongside as the source of truth.
 */
export function describeCron(expr: string): string {
  if (!expr) return 'no schedule';
  const trimmed = expr.trim();
  if (trimmed === '* * * * *') return 'every minute';
  if (/^\*\/\d+ \* \* \* \*$/.test(trimmed)) {
    const n = trimmed.split(' ')[0].slice(2);
    return `every ${n} min`;
  }
  if (trimmed === '0 * * * *') return 'every hour';
  if (/^0 \*\/\d+ \* \* \*$/.test(trimmed)) {
    const n = trimmed.split(' ')[1].slice(2);
    return `every ${n} hours`;
  }
  const dailyMatch = /^(\d+) (\d+) \* \* \*$/.exec(trimmed);
  if (dailyMatch) {
    const m = dailyMatch[1].padStart(2, '0');
    const h = dailyMatch[2].padStart(2, '0');
    return `daily at ${h}:${m}`;
  }
  const weeklyMatch = /^(\d+) (\d+) \* \* (\d)$/.exec(trimmed);
  if (weeklyMatch) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const day = days[Number(weeklyMatch[3]) % 7];
    const h = weeklyMatch[2].padStart(2, '0');
    return `weekly ${day} ${h}:00`;
  }
  return 'custom schedule';
}

/** Extract hour-of-day from a `M H * * *` daily pattern for the clock hand. */
function extractDailyHour(expr: string): number | null {
  const m = /^(\d+) (\d+) \* \* \*$/.exec(expr.trim());
  if (!m) return null;
  const h = Number(m[2]);
  return h >= 0 && h <= 23 ? h : null;
}

// ─── Clock face SVG ───────────────────────────────────────────────────────

interface ClockFaceProps {
  hour: number | null;
  color: string;
}

const ClockFace: React.FC<ClockFaceProps> = ({ hour, color }) => {
  const size = 48;
  const r = (size - 4) / 2;
  const cx = size / 2;
  const cy = size / 2;
  // Hour-hand angle: 0° at 12 o'clock, rotating 30° per hour. Default to
  // 0 (12 o'clock) when the schedule isn't daily.
  const handAngle = ((hour ?? 0) % 12) * 30;
  const handLength = r * 0.55;
  const handEndX = cx + handLength * Math.sin((handAngle * Math.PI) / 180);
  const handEndY = cy - handLength * Math.cos((handAngle * Math.PI) / 180);

  // Minute hand fixed at 12 (top) — every cron-matching pattern this UI
  // recognises fires at minute 0, so this is the honest default.
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="var(--ice-bg-base)" stroke={`${color}55`} strokeWidth={1} />
      {/* tick marks at 12 / 3 / 6 / 9 */}
      {[0, 90, 180, 270].map((deg) => {
        const tickStart = r - 4;
        const tickEnd = r - 1;
        const x1 = cx + tickStart * Math.sin((deg * Math.PI) / 180);
        const y1 = cy - tickStart * Math.cos((deg * Math.PI) / 180);
        const x2 = cx + tickEnd * Math.sin((deg * Math.PI) / 180);
        const y2 = cy - tickEnd * Math.cos((deg * Math.PI) / 180);
        return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke={`${color}88`} strokeWidth={1.5} strokeLinecap="round" />;
      })}
      {/* minute hand — always at 12 */}
      <line
        x1={cx}
        y1={cy}
        x2={cx}
        y2={cy - r * 0.7}
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        opacity={0.55}
      />
      {/* hour hand */}
      <line x1={cx} y1={cy} x2={handEndX} y2={handEndY} stroke={color} strokeWidth={2} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={2} fill={color} />
    </svg>
  );
};

// ─── Component ────────────────────────────────────────────────────────────

export const SvgScheduledTaskNode: React.FC<SvgCompactNodeProps> = ({
  node,
  isSelected,
  isDragOver = false,
  onNodeHover,
  connectionDragState = null,
  lod,
  pipelineStatus,
}) => {
  const schedule = resolveSchedule(node.data);
  const timezone = (node.data?.timezone as string) || '';
  const frequency = (node.data?.frequency as string) || '';

  const dailyHour = extractDailyHour(schedule);
  const description = describeCron(schedule);

  // Live countdown to the next fire — ticks every second so the user sees
  // "fires in 2m 14s" counting down. Falls back to nothing when the cron
  // pattern isn't one we can compute (e.g. custom multi-DOW expressions).
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!schedule) return undefined;
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [schedule]);
  const nextFire = schedule ? nextFireFromCron(schedule, new Date(nowTick)) : null;
  const countdownText = nextFire ? `fires in ${formatCountdown(nextFire.getTime() - nowTick)}` : '';

  // Live-config row mirrors the properties-panel fields a user can actually
  // change: timezone plus the friendly frequency label when it's set.
  // Runtime/timeout from the blueprint defaults are intentionally omitted
  // because there's no UI to edit them today — displaying them would
  // suggest editability that doesn't exist.
  const isCustomFrequency = frequency === 'Custom' || frequency === 'Custom schedule';
  const liveConfigParts = [timezone, frequency && !isCustomFrequency ? frequency : ''].filter(Boolean);
  const liveConfig = liveConfigParts.join(' · ') || (schedule ? 'cron schedule' : 'no schedule');

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
      title={node.label || 'Scheduled Task'}
      liveConfig={liveConfig}
      headerHeight={ST_HEADER_HEIGHT}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, height: ST_BODY_HEIGHT }}>
        <ClockFace hour={dailyHour} color="var(--ice-accent, #3b82f6)" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1 }}>
          <span
            style={{
              fontSize: 12,
              fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
              color: 'var(--ice-text-1)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            data-testid={`st-cron-${node.id}`}
          >
            {schedule || '— — — — —'}
          </span>
          <span
            style={{
              fontSize: 11,
              color: 'var(--ice-text-3)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            data-testid={`st-description-${node.id}`}
          >
            {description}
          </span>
          {countdownText && (
            <span
              style={{
                fontSize: 10,
                color: 'var(--ice-accent, #3b82f6)',
                fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                opacity: 0.9,
              }}
              data-testid={`st-countdown-${node.id}`}
            >
              {countdownText}
            </span>
          )}
        </div>
      </div>
    </CardShell>
  );
};

SvgScheduledTaskNode.displayName = 'SvgScheduledTaskNode';

/**
 * Compute the next-fire time for a cron expression, covering only the
 * patterns that `describeCron` already recognises. Anything outside
 * those patterns returns `null` — better to show nothing than to lie.
 *
 * All computations run in UTC; the canvas card doesn't have access to
 * the user's selected timezone at render time, and surfacing "fires in
 * 12m" is accurate enough — the precise wall-clock time lives in the
 * properties panel.
 */

export function nextFireFromCron(expr: string, now: Date = new Date()): Date | null {
  if (!expr) return null;
  const trimmed = expr.trim();

  // every-minute: next minute boundary
  if (trimmed === '* * * * *') {
    const next = new Date(now);
    next.setUTCSeconds(0, 0);
    next.setUTCMinutes(next.getUTCMinutes() + 1);
    return next;
  }

  // every-N-minutes: next multiple of N
  const everyNMin = /^\*\/(\d+) \* \* \* \*$/.exec(trimmed);
  if (everyNMin) {
    const n = Math.max(Number(everyNMin[1]), 1);
    const next = new Date(now);
    next.setUTCSeconds(0, 0);
    const currentMin = next.getUTCMinutes();
    const nextMin = Math.floor(currentMin / n) * n + n;
    next.setUTCMinutes(nextMin);
    return next;
  }

  // every-hour: next hour at minute 0
  if (trimmed === '0 * * * *') {
    const next = new Date(now);
    next.setUTCSeconds(0, 0);
    next.setUTCMinutes(0);
    next.setUTCHours(next.getUTCHours() + 1);
    return next;
  }

  // every-N-hours: next N-multiple hour at minute 0
  const everyNHour = /^0 \*\/(\d+) \* \* \*$/.exec(trimmed);
  if (everyNHour) {
    const n = Math.max(Number(everyNHour[1]), 1);
    const next = new Date(now);
    next.setUTCSeconds(0, 0);
    next.setUTCMinutes(0);
    const currentH = next.getUTCHours();
    const nextH = Math.floor(currentH / n) * n + n;
    next.setUTCHours(nextH);
    return next;
  }

  // daily M H * * *: today or tomorrow at H:M UTC
  const daily = /^(\d+) (\d+) \* \* \*$/.exec(trimmed);
  if (daily) {
    const m = Number(daily[1]);
    const h = Number(daily[2]);
    if (m < 0 || m > 59 || h < 0 || h > 23) return null;
    const next = new Date(now);
    next.setUTCSeconds(0, 0);
    next.setUTCMilliseconds(0);
    next.setUTCHours(h, m);
    if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
    return next;
  }

  // weekly M H * * D: next D at H:M UTC
  const weekly = /^(\d+) (\d+) \* \* (\d)$/.exec(trimmed);
  if (weekly) {
    const m = Number(weekly[1]);
    const h = Number(weekly[2]);
    const targetDow = Number(weekly[3]) % 7;
    if (m < 0 || m > 59 || h < 0 || h > 23) return null;
    const next = new Date(now);
    next.setUTCSeconds(0, 0);
    next.setUTCMilliseconds(0);
    next.setUTCHours(h, m);
    let dayDiff = (targetDow - next.getUTCDay() + 7) % 7;
    if (dayDiff === 0 && next.getTime() <= now.getTime()) dayDiff = 7;
    next.setUTCDate(next.getUTCDate() + dayDiff);
    return next;
  }

  // weekdays at H AM: 0 H * * 1-5
  const weekdays = /^(\d+) (\d+) \* \* 1-5$/.exec(trimmed);
  if (weekdays) {
    const m = Number(weekdays[1]);
    const h = Number(weekdays[2]);
    if (m < 0 || m > 59 || h < 0 || h > 23) return null;
    const next = new Date(now);
    next.setUTCSeconds(0, 0);
    next.setUTCMilliseconds(0);
    next.setUTCHours(h, m);
    // Advance until we land on a weekday and the time is in the future.
    while (next.getTime() <= now.getTime() || next.getUTCDay() === 0 || next.getUTCDay() === 6) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    return next;
  }

  // monthly 0 0 1 * *: first of next month
  const monthly = /^(\d+) (\d+) (\d+) \* \*$/.exec(trimmed);
  if (monthly) {
    const m = Number(monthly[1]);
    const h = Number(monthly[2]);
    const dom = Number(monthly[3]);
    if (m < 0 || m > 59 || h < 0 || h > 23 || dom < 1 || dom > 31) return null;
    const next = new Date(now);
    next.setUTCSeconds(0, 0);
    next.setUTCMilliseconds(0);
    next.setUTCDate(dom);
    next.setUTCHours(h, m);
    if (next.getTime() <= now.getTime()) {
      next.setUTCMonth(next.getUTCMonth() + 1);
    }
    return next;
  }

  return null;
}

/** Format a duration (ms) as a short countdown string. */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return 'now';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) {
    const remSec = sec - min * 60;
    return remSec > 0 ? `${min}m ${remSec}s` : `${min}m`;
  }
  const hr = Math.floor(min / 60);
  if (hr < 48) {
    const remMin = min - hr * 60;
    return remMin > 0 ? `${hr}h ${remMin}m` : `${hr}h`;
  }
  const day = Math.floor(hr / 24);
  const remHr = hr - day * 24;
  return remHr > 0 ? `${day}d ${remHr}h` : `${day}d`;
}

/**
 * Compact `now` / `Nm` / `Nh` / `Nd` age stamp from a date string.
 * Used in the deploy-history rows and the pipeline-event list.
 */
export function formatAge(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

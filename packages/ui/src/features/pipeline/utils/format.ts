/**
 * rf-ppanel-1 — Pipeline panel format utilities.
 *
 * Three pure functions extracted verbatim from `pipeline-panel.tsx`:
 *   - formatRelativeTime(date)   — ISO date → "now" / "{n}m ago" / "{n}h ago" / "{n}d ago"
 *   - formatDuration(seconds)    — seconds → "{n}s" or "{m}m {s}s"
 *   - formatFramework(framework) — short slug → display name (or pass-through)
 *
 * `formatRelativeTime` reads `Date.now()` at call time; tests freeze the
 * system clock with `vi.useFakeTimers()` + `vi.setSystemTime(...)`.
 */

export function formatRelativeTime(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

export function formatFramework(framework: string): string {
  const names: Record<string, string> = {
    nextjs: 'Next.js',
    nuxt: 'Nuxt',
    sveltekit: 'SvelteKit',
    react: 'React',
    vue: 'Vue',
    angular: 'Angular',
    express: 'Express',
    fastify: 'Fastify',
    docker: 'Docker',
    python: 'Python',
    go: 'Go',
    node: 'Node.js',
  };
  return names[framework] || framework;
}

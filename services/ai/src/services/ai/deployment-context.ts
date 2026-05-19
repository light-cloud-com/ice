/**
 * Deployment Context (AI Read L1) — produces a markdown block
 * describing the most recent deployment for a card. Injected into
 * the system prompt when the user asks a question about state.
 *
 * Returns empty string if cardId is missing or the prisma query
 * fails — the system prompt has a fallback instruction for that
 * case, so failure here is observable through a warn-level log
 * rather than a thrown error.
 */

import prisma from '@ice/db';

/**
 * Builds a markdown block describing the most recent deployment for a card.
 * Injected into the system prompt when the user asks a question about state.
 * Returns empty string if cardId is missing or query fails — the prompt has
 * a fallback instruction for that case.
 */
export async function buildDeploymentContext(cardId: string): Promise<string> {
  try {
    const deploy = await prisma.canvasDeployment.findFirst({
      where: {
        card_id: cardId,
        action_type: 'apply',
        status: { in: ['success', 'partial', 'failed'] },
      },
      orderBy: { created_at: 'desc' },
    });

    if (!deploy) {
      return `\n## Deployment Status\n\nThis canvas has not been deployed yet.\n`;
    }

    const ageMs = Date.now() - deploy.created_at.getTime();
    const ageLabel = formatAge(ageMs);
    const results = (deploy.results as { resources?: Array<Record<string, unknown>> } | null)?.resources ?? [];

    const lines: string[] = [
      '',
      '## Deployment Status',
      '',
      `Last deployed: ${ageLabel} (${deploy.status})`,
      `Provider: ${deploy.provider} | Region: ${deploy.region} | Environment: ${deploy.environment}`,
      '',
    ];

    if (results.length > 0) {
      lines.push('Deployed resources:');
      for (const r of results) {
        const name = (r.name as string) || '(unnamed)';
        const type = (r.type as string) || 'unknown';
        const action = (r.action as string) || '';
        const success = r.success === true ? '✓' : r.success === false ? '✗' : '';
        const outputs = r.outputs as Record<string, unknown> | undefined;
        const url = (outputs?.url as string) || (outputs?.endpoint as string) || (r.provider_id as string) || '';
        const urlPart = url ? ` — ${url}` : '';
        lines.push(`- "${name}" (${type}) ${action} ${success}${urlPart}`.replace(/\s+/g, ' ').trimEnd());
      }
      lines.push('');
    }

    const failed = results.filter((r) => r.success === false && r.error);
    if (failed.length > 0) {
      lines.push('Errors:');
      for (const r of failed) {
        lines.push(`- ${r.name as string}: ${r.error as string}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  } catch (err) {
    console.warn('[AI] Failed to build deployment context:', (err as Error).message);
    return '';
  }
}

/**
 * Format an age in milliseconds as a human-readable relative-time
 * label ("just now", "5 minutes ago", "3 hours ago", "2 days ago").
 */
export function formatAge(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

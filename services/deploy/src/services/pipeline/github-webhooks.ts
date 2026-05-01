/**
 * GitHub credentials and webhook registration helpers.
 *
 * Extracted from `pipeline.service.ts` (rf-pipe-5). The webhook
 * registration helpers were file-private — they're now exported so
 * that rule-management can import them, but they remain pipeline-
 * internal: nothing outside the pipeline subdirectory should call
 * these directly.
 *
 * `getGitHubToken` is also exported so that framework-detection can
 * resolve the user's PAT for GitHub Contents API calls. Both
 * framework-detection and the webhook handlers funnel through the
 * same auth path, so co-locating them here keeps the GitHub
 * integration coupled in one place.
 */

import prisma from '@ice/db';
import { GITHUB_API, GITHUB_HEADERS, type WebhookRegistrationResult } from './types.js';

/**
 * Resolve the user's GitHub access token. Returns the decrypted token
 * if one is recorded; falls back to the stored value if decryption
 * fails (legacy plaintext rows from before encryption was added).
 */
export async function getGitHubToken(userId: string): Promise<string | null> {
  const record = await prisma.gitHubToken.findUnique({ where: { user_id: userId } });
  if (!record) return null;
  try {
    const { decryptString } = await import('@ice/shared');
    return decryptString(record.access_token);
  } catch {
    return record.access_token;
  }
}

/**
 * Build the public callback URL that GitHub posts deliveries to.
 *
 * In tests / dev with no env vars the default `http://localhost:5001`
 * keeps the rule creation flow working end-to-end without GitHub
 * actually posting back.
 */
export function getWebhookCallbackUrl(): string {
  const baseUrl = process.env.WEBHOOK_BASE_URL || process.env.BACKEND_URL || 'http://localhost:5001';
  return `${baseUrl}/api/webhooks/github`;
}

/**
 * Create a webhook on the GitHub repo so push/PR events flow back
 * to our /api/webhooks/github handler. Returns a structured result
 * so the caller can surface a clear remediation hint to the user
 * when the token doesn't have admin access — webhook creation is
 * best-effort: the rule itself is still useful for manual deploys.
 */
export async function registerGitHubWebhook(
  userId: string,
  repository: string,
  secret: string,
): Promise<WebhookRegistrationResult> {
  const token = await getGitHubToken(userId);
  if (!token) {
    return {
      status: 'skipped',
      error: 'GitHub is not connected. Connect GitHub in Settings to enable auto-deploy on push.',
    };
  }

  const callbackUrl = getWebhookCallbackUrl();
  const [owner, repo] = repository.split('/');

  let response: Response;
  try {
    response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/hooks`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        ...GITHUB_HEADERS,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'web',
        active: true,
        events: ['push', 'pull_request'],
        config: {
          url: callbackUrl,
          content_type: 'json',
          secret,
          insecure_ssl: '0',
        },
      }),
    });
  } catch (err: any) {
    return {
      status: 'failed' as const,
      error: `Network error contacting GitHub: ${err?.message || err}`,
    };
  }

  if (response.ok) {
    const hook = (await response.json()) as { id: number };
    return { status: 'registered' as const, webhookId: hook.id };
  }

  const text = await response.text().catch(() => '');
  // 422 = hook already exists for this URL — treat as success with no new id.
  if (response.status === 422 && text.includes('already exists')) {
    return { status: 'registered' as const };
  }
  // 403 on webhook creation is the classic "PAT doesn't have repo:admin"
  // or "user doesn't have admin rights on this org repo" case. Surface it
  // with a clear remediation hint rather than the raw GitHub message.
  if (response.status === 403) {
    return {
      status: 'failed' as const,
      error:
        `GitHub denied webhook creation (403). Your token needs 'repo' scope and admin access to ${repository}. ` +
        `If this is an organization repo you don't own, auto-deploy on push won't work until an owner sets up the webhook.`,
    };
  }
  if (response.status === 401) {
    return {
      status: 'failed' as const,
      error: 'GitHub token is invalid or expired. Reconnect GitHub in Settings → Integrations.',
    };
  }
  if (response.status === 404) {
    return {
      status: 'failed' as const,
      error: `Repository ${repository} not found or not accessible by your token.`,
    };
  }
  return {
    status: 'failed' as const,
    error: `GitHub returned ${response.status}: ${text.slice(0, 200)}`,
  };
}

/**
 * Best-effort delete of a webhook we registered earlier. We don't
 * propagate errors — if it's already been deleted on the GitHub side
 * (manual removal in repo settings), the next call would 404 anyway.
 */
export async function unregisterGitHubWebhook(userId: string, repository: string, webhookId: number) {
  const token = await getGitHubToken(userId);
  if (!token) return;

  const [owner, repo] = repository.split('/');

  await fetch(`${GITHUB_API}/repos/${owner}/${repo}/hooks/${webhookId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
      ...GITHUB_HEADERS,
    },
  });
}

/**
 * AI Provider — per-org BYOK with env fallback.
 *
 * Resolution order on each request:
 *   1. Org's stored Anthropic key (BYOK via Settings → AI / app-bar Claude icon).
 *   2. Cached singleton built from ANTHROPIC_API_KEY / ICE_AI_URL env vars.
 *   3. `createProviderAsync` auto-detect path → NullProvider.
 *
 * The org-specific path bypasses the cache (one user, one key — cache hit
 * rate trivial, correctness matters more). The no-org / env-only path keeps
 * the original singleton behavior so the existing tests stay green.
 */

import { createProvider, createProviderAsync, getProvider, type AiProvider } from '@ice/ai';
import prisma from '@ice/db';
import { decryptCredentials } from '@ice/shared';

let _providerReady: Promise<AiProvider> | null = null;

async function getOrgAnthropicKey(orgId: string): Promise<string | null> {
  try {
    const cred = await prisma.providerCredential.findUnique({
      where: { organisation_id_provider: { organisation_id: orgId, provider: 'anthropic' } },
    });
    if (!cred?.is_connected) return null;
    const decrypted = decryptCredentials(cred.credentials);
    return decrypted.api_key || null;
  } catch {
    return null;
  }
}

/**
 * Get the AI provider. Pass `orgId` to honor the org's BYOK key (entered
 * in-app under Settings → AI / the Claude app-bar icon). Omit for the
 * legacy env-driven singleton.
 */
export async function getAiProvider(orgId?: string): Promise<AiProvider> {
  if (orgId) {
    const apiKey = await getOrgAnthropicKey(orgId);
    if (apiKey) {
      return createProvider({ provider: 'anthropic', anthropicApiKey: apiKey });
    }
  }
  if (!_providerReady) {
    _providerReady = createProviderAsync();
  }
  return _providerReady;
}

/** Get provider synchronously (null if not yet initialized) */
export function getAiProviderSync(): AiProvider | null {
  return getProvider();
}

/**
 * Reset the cached provider promise. Test-only — production code never
 * needs this because the cache is the whole point of the module.
 */
export function _resetProviderCacheForTests(): void {
  _providerReady = null;
}

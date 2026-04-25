/**
 * Provider registry — the one place deploy.service.ts looks up the
 * credential resolver for a given provider string. Adding a new
 * provider means adding one entry here, not five copy-pasted auth
 * blocks across the service layer.
 */

import { awsCredentialResolver } from './aws/credential-resolver.js';
import { gcpCredentialResolver } from './gcp/credential-resolver.js';
import type { CredentialResolver, ResolveAuthOptions, ScopedDeployAuth } from './types.js';

export const CREDENTIAL_RESOLVERS: Record<string, CredentialResolver> = {
  gcp: gcpCredentialResolver,
  aws: awsCredentialResolver,
};

/**
 * Resolve auth for a provider — throws a clear message when the provider
 * isn't registered yet (Azure, Kubernetes, etc.) so the user gets
 * "Provider 'azure' not supported yet" instead of a cryptic undefined
 * method error deep in the deploy engine.
 */
export async function resolveProviderAuth(provider: string, options: ResolveAuthOptions): Promise<ScopedDeployAuth> {
  const resolver = CREDENTIAL_RESOLVERS[provider];
  if (!resolver) {
    throw new Error(
      `Provider '${provider}' is not supported yet — register a CredentialResolver in providers/registry.ts.`,
    );
  }
  return resolver.resolve(options);
}

export async function cleanupProviderAuth(provider: string, auth: ScopedDeployAuth): Promise<void> {
  const resolver = CREDENTIAL_RESOLVERS[provider];
  if (!resolver) return;
  await resolver.cleanup(auth);
}

export type { CredentialResolver, ResolveAuthOptions, ScopedDeployAuth };

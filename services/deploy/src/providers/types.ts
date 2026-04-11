/**
 * Provider abstraction types — Phase D of the deployment reliability
 * rework. Carves out a `CredentialResolver` interface so deploy.service.ts
 * stops carrying five copies of the same GCP-specific OAuth/SA key block.
 *
 * The engine and handlers were already provider-agnostic (see
 * `deploy-engine.ts` and `types.ts` in core); credential wiring was the
 * last major GCP-only chunk in the service layer. Extracting it now
 * means AWS/Azure providers only need to add their own resolver — no
 * copy-paste surgery.
 */

/**
 * Auth bundle returned by every provider's resolver. The deploy engine,
 * handlers, and orphan-cleanup service all consume this uniformly. Fields
 * that only apply to one provider stay in `metadata` so the interface
 * doesn't grow warts per provider.
 */
export interface ScopedDeployAuth {
  /**
   * Native auth client for the provider — the shape the provider's SDK
   * expects. GCP: GoogleAuth client or OAuth2Client. AWS: credentials
   * provider chain. Azure: TokenCredential. Cast inside provider-specific
   * handlers; agnostic code never touches this directly.
   */
  authClient: any;

  /** Temp directory containing any on-disk credentials. Released by the caller. */
  tempDir?: string;

  /** On-disk path to key material, if the provider writes one. */
  keyFilePath?: string;

  /**
   * Parsed credentials object — the provider's native shape. Handlers
   * that can't consume a file path fall back to this.
   */
  parsedCredentials?: any;

  /**
   * Provider scope — which cloud account / project / subscription the
   * deploy targets. Typed loosely so each provider populates only the
   * fields it cares about.
   */
  scope: {
    provider: 'gcp' | 'aws' | 'azure' | string;
    project?: string; // GCP: project ID; Azure: resource group
    accountId?: string; // AWS: account id
    subscriptionId?: string; // Azure: subscription id
    region?: string;
  };

  /** Short-lived access token if the provider supports one (used by API auto-enable). */
  accessToken?: string;

  /** Provider-specific extras the agnostic layer doesn't inspect. */
  metadata?: Record<string, unknown>;
}

/**
 * Options passed to every `resolve` call. Callers thread org + request
 * options through so per-org key stores and explicit project overrides
 * both work without the resolver needing to fish them from ambient state.
 */
export interface ResolveAuthOptions {
  orgId: string;
  /** Raw decrypted credentials from `providerService.getDecryptedCredentials`. */
  credentials: any;
  /**
   * Optional provider scope override from the request body. Per-provider
   * resolvers use this to pick which project/account to deploy to.
   */
  requestedScope?: {
    project?: string;
    accountId?: string;
    subscriptionId?: string;
    region?: string;
  };
  /** Log callback — surfaces auth messages to the live deploy panel. */
  onLog?: (message: string) => void;
}

export interface CredentialResolver {
  provider: string;
  /** Returns a ready-to-use auth bundle. Throws on fatal auth errors. */
  resolve(options: ResolveAuthOptions): Promise<ScopedDeployAuth>;
  /**
   * Best-effort cleanup — remove temp dirs, revoke short-lived tokens.
   * Always called from the deploy service's `finally` block so failed
   * deploys don't leak secrets.
   */
  cleanup(auth: ScopedDeployAuth): Promise<void>;
}

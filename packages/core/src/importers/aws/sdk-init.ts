/**
 * AWS SDK Initialisation
 *
 * Wraps the dynamic imports of `@aws-sdk/client-*` packages so the rest
 * of the importer can call AWS APIs without statically depending on the
 * SDK (it's an optional dependency for users who don't import from AWS).
 *
 * The dynamic-import via `Function('m', 'return import(m)')` pattern is
 * load-bearing: a literal `await import(spec)` would be transpiled to a
 * static `require` by some bundlers, breaking the optional-dep guarantee.
 * Don't simplify it.
 */

/**
 * Bundle of AWS SDK client instances used by the importer.
 *
 * `any` typing is intentional — the AWS SDK packages are dynamically
 * imported and we don't want to take a hard type-time dependency on
 * them.
 */
export interface AWSSdk {
  STS: any;
  ResourceExplorer: any;
  ConfigService: any;
  credentials?: any;
}

/**
 * Initialise the AWS SDK client bundle.
 *
 * When `profile` is supplied, loads credentials via
 * `@aws-sdk/credential-providers` `fromIni({ profile })`.  When not,
 * relies on the default credential chain.  Throws with a friendly
 * "make sure SDK v3 packages are installed" message when any of the
 * dynamic imports fails.
 */
export async function init_aws_sdk(profile?: string): Promise<AWSSdk> {
  try {
    // Dynamic imports for AWS SDK v3
    const sts_module_name = '@aws-sdk/client-sts';
    const re_module_name = '@aws-sdk/client-resource-explorer-2';
    const config_module_name = '@aws-sdk/client-config-service';

    const [sts_mod, re_mod, config_mod] = await Promise.all([
      Function('m', 'return import(m)')(sts_module_name),
      Function('m', 'return import(m)')(re_module_name),
      Function('m', 'return import(m)')(config_module_name),
    ]);

    const config: Record<string, unknown> = {};

    if (profile) {
      // Load credentials from profile
      const creds_module_name = '@aws-sdk/credential-providers';
      const creds_mod = await Function('m', 'return import(m)')(creds_module_name);
      config.credentials = creds_mod.fromIni({ profile });
    }

    return {
      STS: new sts_mod.STSClient(config),
      ResourceExplorer: new re_mod.ResourceExplorer2Client(config),
      ConfigService: new config_mod.ConfigServiceClient(config),
    };
  } catch (error) {
    throw new Error(
      `Failed to initialize AWS SDK. Make sure AWS SDK v3 packages are installed: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

/**
 * Get the AWS account id via STS GetCallerIdentity.
 *
 * Returns `'unknown'` (not throws) when STS fails — the importer can
 * still surface results without an account id, and the failure is
 * already handled at the call site by error classification.
 */
export async function get_account_id(sdk: AWSSdk): Promise<string> {
  try {
    const sts_module_name = '@aws-sdk/client-sts';
    const sts_mod = await Function('m', 'return import(m)')(sts_module_name);
    const command = new sts_mod.GetCallerIdentityCommand({});
    const response = await sdk.STS.send(command);
    return response.Account || '';
  } catch {
    return 'unknown';
  }
}

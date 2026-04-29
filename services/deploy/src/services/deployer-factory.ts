/**
 * Deployer Factory — extracted in rf-deploy-5 from `deploy.service.ts`.
 *
 * Wraps the `@ice/core` dynamic import so the orchestrator can stay free
 * of provider-switch boilerplate. Four callsites in `deploy.service.ts`
 * (apply, destroyAllForCard, destroyDeployment, rollbackDeployment) used
 * to repeat the same `if aws / else if azure / else GCP` block right
 * after `await getCoreEngine()`; they all collapse to a single
 * `await createDeployer(provider)`.
 */

/**
 * Resolve the `@ice/core` workspace package via dynamic import.
 *
 * The package is ESM-only and not present in the deploy service's static
 * import graph (it ships its own runtime that's resolved at deploy-time
 * via the pnpm workspace). The `@ts-ignore` hides the fact that the
 * TypeScript compiler can't see the workspace edge from this package's
 * tsconfig.
 */
export async function getCoreEngine(): Promise<any> {
  // @ts-ignore — resolved at runtime via pnpm workspace
  return import('@ice/core');
}

/**
 * Construct a provider-specific Deployer instance via the @ice/core
 * dynamic import. The provider string follows the orchestrator's
 * options.provider contract — anything not 'aws' or 'azure' falls
 * through to GCP (today's default).
 */
export async function createDeployer(provider: string | undefined): Promise<any> {
  const core = await getCoreEngine();
  if (provider === 'aws') {
    const { AWSDeployer } = core;
    return new AWSDeployer();
  }
  if (provider === 'azure') {
    const { AzureDeployer } = core;
    return new AzureDeployer();
  }
  const { GCPDeployer } = core;
  return new GCPDeployer();
}

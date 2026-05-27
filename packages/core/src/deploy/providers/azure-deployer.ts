/**
 * Azure Deployer — back-compat shim.
 *
 * Modular implementation moved to `./azure/`. Kept here so existing
 * import paths in `providers/index.ts` and the legacy test suite
 * continue to resolve unchanged.
 */

export { AzureDeployer, create_azure_deployer } from './azure/azure-deployer';
export type { AzureHandlerContext, AzureResourceHandler } from './azure/types';

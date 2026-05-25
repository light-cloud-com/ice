/**
 * AWS Deployer — back-compat shim.
 *
 * Modular implementation moved to `./aws/`. Kept here so the existing
 * import paths in `providers/index.ts` and the test suite continue to
 * resolve unchanged.
 */

export { AWSDeployer, create_aws_deployer } from './aws';
export type { AWSHandlerContext, AWSResourceHandler } from './aws';

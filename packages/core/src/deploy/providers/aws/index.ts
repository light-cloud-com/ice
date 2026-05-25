/**
 * AWS Deployer Module
 *
 * Re-exports the modular AWS deployer and types.
 */

export { AWSDeployer, create_aws_deployer } from './aws-deployer';
export type { AWSHandlerContext, AWSResourceHandler } from './types';
export { load_aws_sdk, initialize_aws_clients, destroy_aws_clients } from './sdk-loader';
export { create_account_id_resolver, type AccountIdResolver } from './account';
export { ensureManagedRole, ensureEcsTaskExecutionRole } from './iam-roles';

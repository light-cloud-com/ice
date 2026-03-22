/**
 * GCP Deployer Module
 *
 * Re-exports the modular GCP deployer and types.
 */

export { GCPDeployer, create_gcp_deployer } from './gcp-deployer.js';
export type { GCPResourceHandler, GCPHandlerContext, GCPRestClient } from './types.js';
export {
  get_gcp_credentials,
  validate_gcp_credentials,
  list_gcp_projects,
  type GCPAuthConfig,
  type GCPAuthMethod,
  type GCPAuthResult,
  type GCPProject,
} from './auth.js';

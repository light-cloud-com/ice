/**
 * Block Requirements — public entrypoint.
 *
 * Re-exports the types and all built-in requirement definitions so consumers
 * can import everything from a single path: `@ice/blocks/requirements`.
 */

export * from './types';
export { githubRepoAttachedRequirement } from './definitions/github-repo';
export { dnsARecordRequirement } from './definitions/dns-a-record';
export { domainVerificationRequirement } from './definitions/domain-verification';
export { managedCertIssuanceRequirement } from './definitions/managed-cert-issuance';
export { publicEndpointDomainRequirement } from './definitions/public-endpoint-domain';

import { dnsARecordRequirement } from './definitions/dns-a-record';
import { domainVerificationRequirement } from './definitions/domain-verification';
import { githubRepoAttachedRequirement } from './definitions/github-repo';
import { managedCertIssuanceRequirement } from './definitions/managed-cert-issuance';
import { publicEndpointDomainRequirement } from './definitions/public-endpoint-domain';
import type { RequirementDefinition } from './types';

/**
 * The set of requirements that ICE resolves by default for any block.
 * Blueprint authors can opt out per-block or register additional ones.
 */
export const BUILT_IN_REQUIREMENTS: RequirementDefinition[] = [
  githubRepoAttachedRequirement,
  publicEndpointDomainRequirement,
  dnsARecordRequirement,
  domainVerificationRequirement,
  managedCertIssuanceRequirement,
];

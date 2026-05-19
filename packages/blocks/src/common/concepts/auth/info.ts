import type { InfoContent } from '../_shared/types';

export const authInfo: InfoContent = {
  overview: {
    markdown: `
# Auth

Managed user authentication. Sign-up, sign-in, password reset, sessions, MFA,
social providers — without rolling your own user table or password hashing.

## How services consume Auth

Wire any compute or frontend block to Auth. The block emits the issuer URL,
JWKS endpoint, and (for AWS) the Cognito client id/secret as environment
variables; your service verifies the access token on every request.

## When to use

- You need an out-of-the-box sign-in flow (email/password, social, SSO/SAML)
- You want managed MFA, password policy, session handling
- You're targeting a single cloud and want native managed identity (Cognito on
  AWS, Firebase Auth on GCP, Entra ID External Identities on Azure)

## When NOT to use

- A SaaS auth provider (Clerk, Auth0, WorkOS) is a better fit — drop a
  **Secret Store** with the API key and use the SaaS SDK in your services
- A library auth path (NextAuth, Lucia) directly against your existing
  **Postgres** / **MongoDB** is enough
- B2B SAML-only — pick the provider's enterprise tier, not the consumer
  defaults this block ships with

## Sign-in methods

Configure email/password (always available), Google, GitHub, SAML, OIDC. The
block compiles to provider-native settings: identity providers under
Cognito; OAuth tenants on Firebase Auth; external identity providers on
Entra ID.
    `.trim(),
  },
  compilesTo: {
    aws: [
      { name: 'Cognito User Pool', type: 'aws_cognito_user_pool' },
      { name: 'User Pool Client', type: 'aws_cognito_user_pool_client' },
      { name: 'Identity Provider', type: 'aws_cognito_identity_provider', optional: true },
    ],
    gcp: [
      { name: 'Identity Platform Tenant', type: 'google_identity_platform_tenant' },
      { name: 'OAuth IDP Config', type: 'google_identity_platform_oauth_idp_config', optional: true },
    ],
    azure: [
      { name: 'Entra ID External Identities Tenant', type: 'azurerm_aadb2c_directory' },
      { name: 'Identity Provider', type: 'azuread_identity_provider', optional: true },
    ],
  },
  links: [
    { label: 'AWS Cognito', url: 'https://docs.aws.amazon.com/cognito/' },
    { label: 'Firebase Auth', url: 'https://firebase.google.com/docs/auth' },
    { label: 'Entra ID External Identities', url: 'https://learn.microsoft.com/en-us/entra/external-id/' },
  ],
  relatedConcepts: ['Security.Secret', 'Compute.Container', 'Frontend.SSRSite'],
};

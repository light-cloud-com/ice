/**
 * High-level resource category: SECURITY.
 *
 * Secret stores, SSL certificates, and service-account identities.
 *
 * Sized at ~190 LOC of literal data, well within the 500-LOC ceiling.
 * Split out for symmetry with the rest of the categories sub-tree
 * (one file per category) — see `../../high-level-resources.ts` for the
 * rationale of the rf-hlres split.
 *
 * The exported `security: HighLevelCategory` is consumed by `../high-level-resources.ts`
 * which assembles it into `HIGH_LEVEL_CATEGORIES`. The shape and content are
 * byte-identical to what was previously inlined there.
 */

// `NodeBehavior` is imported because the data literal uses `behavior: '...' as NodeBehavior` casts.
import type { HighLevelCategory, NodeBehavior } from '../types.js';
export type { NodeBehavior };

export const security: HighLevelCategory = 
  {
    id: 'security',
    name: 'Security',
    description: 'IAM, secrets, and certificates',
    icon: 'Shield',
    resources: [
      {
        id: 'secret-store',
        name: 'Secret Store',
        description: 'Securely store API keys and credentials',
        icon: 'Key',
        category: 'security',
        behavior: 'singleton' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure', 'kubernetes'],
        implementations: [
          {
            provider: 'aws',
            resource_type: 'aws:secretsmanager:Secret',
            display_name: 'Secrets Manager',
          },
          {
            provider: 'gcp',
            resource_type: 'gcp:secretmanager:Secret',
            display_name: 'Secret Manager',
          },
          {
            provider: 'azure',
            resource_type: 'azure:keyvault:Secret',
            display_name: 'Key Vault Secret',
          },
          {
            provider: 'kubernetes',
            resource_type: 'kubernetes:core/v1:Secret',
            display_name: 'K8s Secret',
          },
        ],
        keywords: ['secret', 'vault', 'ssm', 'parameter', 'credential'],
        properties: [
          {
            name: 'name',
            label: 'Name',
            type: 'string',
            required: true,
            tier: 'essential',
            description: 'A friendly name for this secret',
            placeholder: 'My Secret',
          },
          {
            name: 'secrets',
            label: 'Secret values',
            type: 'list',
            required: false,
            tier: 'essential',
            description: 'The secret key-value pairs to store',
            placeholder: 'e.g. STRIPE_API_KEY',
            addLabel: 'Add a secret',
          },
          {
            name: 'auto_rotate',
            label: 'Auto-rotate?',
            type: 'boolean',
            required: false,
            tier: 'detailed',
            description: 'Automatically change this secret on a schedule for better security',
            default: false,
          },
        ],
      },
      {
        id: 'ssl-certificate',
        name: 'SSL Certificate',
        description: 'HTTPS certificates for your domains',
        icon: 'Lock',
        category: 'security',
        behavior: 'singleton' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure'],
        implementations: [
          {
            provider: 'aws',
            resource_type: 'aws:acm:Certificate',
            display_name: 'ACM Certificate',
          },
          {
            provider: 'gcp',
            resource_type: 'gcp:compute:ManagedSslCertificate',
            display_name: 'Managed SSL Certificate',
          },
          {
            provider: 'azure',
            resource_type: 'azure:keyvault:Certificate',
            display_name: 'Key Vault Certificate',
          },
        ],
        keywords: ['ssl', 'tls', 'certificate', 'acm', 'https'],
        properties: [
          {
            name: 'name',
            label: 'Name',
            type: 'string',
            required: true,
            tier: 'essential',
            description: 'A friendly name for this certificate',
            placeholder: 'My SSL Cert',
          },
          {
            name: 'domain',
            label: 'Domain',
            type: 'string',
            required: true,
            tier: 'essential',
            description: 'The domain this certificate secures',
            placeholder: 'e.g. example.com',
          },
          {
            name: 'extra_domains',
            label: 'Additional domains',
            type: 'list',
            required: false,
            tier: 'detailed',
            description: 'Other domains this certificate should cover',
            placeholder: 'e.g. www.example.com',
            addLabel: 'Add a domain',
          },
          {
            name: 'auto_renew',
            label: 'Auto-renew?',
            type: 'boolean',
            required: false,
            tier: 'detailed',
            description: 'Automatically renew before it expires (recommended)',
            default: true,
          },
        ],
      },
      {
        id: 'service-account',
        name: 'Service Account',
        description: 'Identity for your services',
        icon: 'User',
        category: 'security',
        behavior: 'singleton' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure', 'kubernetes'],
        implementations: [
          { provider: 'aws', resource_type: 'aws:iam:Role', display_name: 'IAM Role' },
          {
            provider: 'gcp',
            resource_type: 'gcp:serviceaccount:Account',
            display_name: 'Service Account',
          },
          {
            provider: 'azure',
            resource_type: 'azure:managedidentity:UserAssignedIdentity',
            display_name: 'Managed Identity',
          },
          {
            provider: 'kubernetes',
            resource_type: 'kubernetes:core/v1:ServiceAccount',
            display_name: 'K8s Service Account',
          },
        ],
        keywords: ['iam', 'role', 'service', 'account', 'identity'],
        properties: [
          {
            name: 'name',
            label: 'Name',
            type: 'string',
            required: true,
            tier: 'essential',
            description: 'A friendly name for this identity',
            placeholder: 'My Service Account',
          },
          {
            name: 'services',
            label: 'Which services use this identity?',
            type: 'list',
            required: false,
            tier: 'detailed',
            description: 'Services that will act as this identity',
            placeholder: 'e.g. backend-api',
            addLabel: 'Add a service',
          },
        ],
      },
      {
        id: 'auth',
        name: 'Authentication',
        description: 'User authentication and identity — sign-in, sessions, MFA',
        icon: 'UserCheck',
        category: 'security',
        behavior: 'stateful' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure'],
        implementations: [
          { provider: 'aws', resource_type: 'aws:cognito:UserPool', display_name: 'Cognito User Pool' },
          {
            provider: 'gcp',
            resource_type: 'gcp:identitytoolkit:Tenant',
            display_name: 'Identity Platform / Firebase Auth',
          },
          {
            provider: 'azure',
            resource_type: 'azure:aad:Tenant',
            display_name: 'Entra ID External Identities',
          },
        ],
        keywords: ['auth', 'identity', 'cognito', 'firebase-auth', 'entra', 'oauth', 'login', 'mfa', 'saml', 'oidc'],
        properties: [
          {
            name: 'name',
            label: 'Name',
            type: 'string',
            required: true,
            tier: 'essential',
            description: 'A friendly name for this auth pool',
            placeholder: 'My Auth',
          },
          {
            name: 'methods',
            label: 'Sign-in methods',
            type: 'list',
            required: false,
            tier: 'essential',
            description: 'How users sign in. Leave blank for email/password only.',
            placeholder: 'e.g. google',
            addLabel: 'Add a method',
          },
          {
            name: 'mfa',
            label: 'Require MFA?',
            type: 'select',
            required: false,
            tier: 'detailed',
            description: 'Multi-factor authentication policy',
            default: 'optional',
            options: ['off', 'optional', 'required'],
          },
          {
            name: 'password_min_length',
            label: 'Minimum password length',
            type: 'number',
            required: false,
            tier: 'detailed',
            description: 'Minimum number of characters in a password',
            default: 12,
          },
          {
            name: 'session_ttl_hours',
            label: 'Session lifetime (hours)',
            type: 'number',
            required: false,
            tier: 'detailed',
            description: 'How long a sign-in session stays valid before re-auth',
            default: 24,
          },
        ],
      },
    ],
  };

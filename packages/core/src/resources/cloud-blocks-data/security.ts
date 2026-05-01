/**
 * Cloud Blocks — Security category templates.
 *
 * Templates: auth, secrets.
 *
 * Part of the rf-cbdat split — see `../cloud-blocks-data.ts` for the
 * orchestrator and `../cloud-blocks-types.ts` for the shared types.
 */

import type { BlockTemplate } from '../cloud-blocks-types.js';

export const SECURITY_TEMPLATES: BlockTemplate[] = [
  // -------------------------------------------------------------------------
  // Auth Block
  // -------------------------------------------------------------------------
  {
    type: 'auth',
    name: 'auth',
    display_name: 'Authentication',
    description: 'User authentication and identity management',
    icon: 'Shield',
    category: 'Security',

    default_config: {},

    expands_to: [
      {
        provider: 'aws',
        resources: [{ type: 'cognito-user-pool', role: 'auth' }],
      },
      {
        provider: 'gcp',
        resources: [{ type: 'firebase-auth', role: 'auth' }],
      },
    ],

    required_inputs: [
      {
        name: 'name',
        label: 'Auth Pool Name',
        type: 'string',
        description: 'Name for your auth service',
      },
      {
        name: 'providers',
        label: 'Sign-in Methods',
        type: 'select',
        description: 'How users can sign in',
        options: ['Email/Password', 'Google', 'GitHub', 'SAML'],
        default: 'Email/Password',
      },
    ],

    optional_features: [
      {
        name: 'mfa',
        label: 'Multi-Factor Auth',
        description: 'Require MFA for sign-in',
        adds_resources: [],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Secrets Block
  // -------------------------------------------------------------------------
  {
    type: 'secrets',
    name: 'secrets',
    display_name: 'Secrets Manager',
    description: 'Secure storage for secrets, API keys, and credentials',
    icon: 'Key',
    category: 'Security',

    default_config: {},

    expands_to: [
      {
        provider: 'aws',
        resources: [{ type: 'secrets-manager', role: 'secrets' }],
      },
      {
        provider: 'gcp',
        resources: [{ type: 'secret-manager', role: 'secrets' }],
      },
    ],

    required_inputs: [
      {
        name: 'name',
        label: 'Secret Name',
        type: 'string',
        description: 'Name for your secret',
      },
    ],

    optional_features: [
      {
        name: 'auto_rotation',
        label: 'Auto Rotation',
        description: 'Automatically rotate secrets',
        adds_resources: ['lambda-function'],
      },
    ],
  },
];

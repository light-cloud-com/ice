/**
 * Provider Settings — `PROVIDER_CONFIGS` data.
 *
 * Extracted verbatim from `../../provider-settings.tsx` as part of the
 * rf-pset series. Each entry pairs a `ProviderId` with the icon-chip
 * styling (`color`, `bgColor`), a description, and the credential fields
 * the connect form renders.
 *
 * Notes:
 *   - `name` and `icon` are sourced from the core resources registry via
 *     `getCloudProvider(...)`, with literal fallbacks preserved for the
 *     case where the registry entry is unavailable (the optional-chain
 *     `?.name`/`?.icon` is the same fallback the source used).
 *   - The provider order — AWS, GCP, Azure — is verbatim from the source
 *     and drives the modal's visual order.
 *   - The GCP `service_account_key` field's `required: false` reflects
 *     that GCP can also connect via OAuth (handled by the GCP-specific
 *     branch in the connect section), so the form's required-field check
 *     deliberately skips this field.
 */

import { getCloudProvider } from '@ice/core/resources';

import type { ProviderConfig } from '../types';

export const PROVIDER_CONFIGS: ProviderConfig[] = [
  {
    id: 'aws',
    name: getCloudProvider('aws')?.name ?? 'Amazon Web Services',
    description: 'Connect to AWS using access keys or IAM role',
    icon: getCloudProvider('aws')?.icon ?? 'aws',
    color: 'text-orange-500',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    configFields: [
      {
        name: 'accessKeyId',
        label: 'Access Key ID',
        type: 'text',
        placeholder: 'AKIA...',
        required: true,
      },
      {
        name: 'secretAccessKey',
        label: 'Secret Access Key',
        type: 'password',
        placeholder: '********',
        required: true,
      },
      {
        name: 'region',
        label: 'Default Region',
        type: 'select',
        required: true,
        options: ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1'],
      },
    ],
  },
  {
    id: 'gcp',
    name: getCloudProvider('gcp')?.name ?? 'Google Cloud Platform',
    description: 'Connect via Google OAuth or service account key',
    icon: getCloudProvider('gcp')?.icon ?? 'gcp',
    color: 'text-blue-500',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    configFields: [
      {
        name: 'service_account_key',
        label: 'Service Account Key (JSON)',
        type: 'textarea',
        placeholder: '{\n  "type": "service_account",\n  "project_id": "...",\n  ...\n}',
        required: false, // Not required when using OAuth
        helpLink: {
          url: 'https://console.cloud.google.com/iam-admin/serviceaccounts',
          text: 'Create service account',
        },
      },
    ],
  },
  {
    id: 'azure',
    name: getCloudProvider('azure')?.name ?? 'Microsoft Azure',
    description: 'Connect to Azure using service principal',
    icon: getCloudProvider('azure')?.icon ?? 'azure',
    color: 'text-sky-500',
    bgColor: 'bg-sky-100 dark:bg-sky-900/30',
    configFields: [
      {
        name: 'subscriptionId',
        label: 'Subscription ID',
        type: 'text',
        placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
        required: true,
      },
      {
        name: 'tenantId',
        label: 'Tenant ID',
        type: 'text',
        placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
        required: true,
      },
      {
        name: 'clientId',
        label: 'Client ID',
        type: 'text',
        placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
        required: true,
      },
      {
        name: 'clientSecret',
        label: 'Client Secret',
        type: 'password',
        placeholder: '********',
        required: true,
      },
    ],
  },
];

import type { InfoContent } from '../_shared/types';

export const secretStoreInfo: InfoContent = {
  overview: {
    markdown: `
# Secret Store

Encrypted storage for API keys, database passwords, OAuth tokens, signing keys,
anything you don't want in source control or \`.env\` files.

## How services consume secrets

Wire any compute block to Secret Store. At deploy time, the secrets you've
configured are injected as environment variables into that service —
no hardcoded credentials, no vault client SDKs needed.

## Rotation

Managed secret stores handle encryption at rest and IAM-gated access.
Some (AWS Secrets Manager) also handle automatic rotation for RDS
credentials.
    `.trim(),
  },
  compilesTo: {
    aws: [{ name: 'Secrets Manager Secret', type: 'aws_secretsmanager_secret' }, { name: 'Secret Version', type: 'aws_secretsmanager_secret_version' }],
    gcp: [{ name: 'Secret Manager Secret', type: 'google_secret_manager_secret' }, { name: 'Secret Version', type: 'google_secret_manager_secret_version' }],
    azure: [{ name: 'Key Vault', type: 'azurerm_key_vault' }, { name: 'Key Vault Secret', type: 'azurerm_key_vault_secret' }],
  },
  relatedConcepts: ['Compute.Container', 'Database.PostgreSQL'],
};

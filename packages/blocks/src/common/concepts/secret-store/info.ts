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
    markdownZh: `
# 密钥存储

加密存储 API 密钥、数据库密码、OAuth token、签名密钥,以及任何您不希望写入源码库或 \`.env\` 文件的敏感信息。

## 服务如何消费密钥

将任意计算块连接到密钥存储。部署时,您配置的密钥会作为环境变量注入到对应服务 — 无需硬编码凭据,也不需要 vault 客户端 SDK。

## 轮换

托管的密钥存储会处理静态加密和 IAM 访问控制。部分服务(如 AWS Secrets Manager)还可以自动轮换 RDS 凭据。
    `.trim(),
  },
  compilesTo: {
    aws: [
      { name: 'Secrets Manager Secret', type: 'aws_secretsmanager_secret' },
      { name: 'Secret Version', type: 'aws_secretsmanager_secret_version' },
    ],
    gcp: [
      { name: 'Secret Manager Secret', type: 'google_secret_manager_secret' },
      { name: 'Secret Version', type: 'google_secret_manager_secret_version' },
    ],
    azure: [
      { name: 'Key Vault', type: 'azurerm_key_vault' },
      { name: 'Key Vault Secret', type: 'azurerm_key_vault_secret' },
    ],
  },
  relatedConcepts: ['Compute.Container', 'Database.PostgreSQL'],
};

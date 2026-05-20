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
    markdownZh: `
# Auth

托管的用户身份认证。注册、登录、密码重置、会话、MFA、社交账号登录 — 无需自己维护用户表或密码哈希。

## 服务如何消费 Auth

将任意计算或前端块连接到 Auth。该块会以环境变量的形式输出 issuer URL、JWKS 端点,以及(AWS 上)Cognito 的 client id / secret;您的服务在每次请求时验证 access token。

## 适用场景

- 需要开箱即用的登录流程(邮箱密码、社交账号、SSO/SAML)
- 希望使用托管的 MFA、密码策略和会话管理
- 您只面向单一云,希望使用原生托管的身份服务(AWS 上的 Cognito、GCP 上的 Firebase Auth、Azure 上的 Entra ID External Identities)

## 不适用场景

- SaaS 鉴权服务商(Clerk、Auth0、WorkOS)更合适 — 将 API 密钥放入 **密钥存储**,在服务中调用其 SDK
- 直接基于现有 **Postgres** / **MongoDB** 的库级方案(NextAuth、Lucia)已经够用
- B2B 纯 SAML 场景 — 请选择服务商的企业版,而不是本块默认的消费级配置

## 登录方式

可配置邮箱 / 密码(始终可用)、Google、GitHub、SAML、OIDC。该块会编译为服务商原生的设置:Cognito 下的 identity providers;Firebase Auth 上的 OAuth 租户;Entra ID 上的外部身份提供方。
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
  linksZh: ['AWS Cognito', 'Firebase Auth', 'Entra ID External Identities'],
  relatedConcepts: ['Security.Secret', 'Compute.Container', 'Frontend.SSRSite'],
};

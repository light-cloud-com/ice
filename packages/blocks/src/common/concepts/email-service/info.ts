import type { InfoContent } from '../_shared/types';

export const emailServiceInfo: InfoContent = {
  overview: {
    markdown: `
# Email Service

Send transactional email — confirmations, password resets, receipts, alerts.
Not for marketing blasts (different compliance rules).

## When to use

- Sign-up confirmation emails
- Password reset links
- Order receipts, invoices
- One-time codes / magic links

## Alternatives

For third-party services (SendGrid, Postmark, Resend), drop an API key into
**Secret Store** and call their HTTP API from your backend — no block
needed. This block is for the managed-cloud variant (AWS SES, Azure Communication
Services).
    `.trim(),
    markdownZh: `
# 邮件服务

发送事务性邮件 — 确认邮件、密码重置、收据、告警等。不适用于营销群发(其合规要求不同)。

## 适用场景

- 注册确认邮件
- 密码重置链接
- 订单收据、发票
- 一次性验证码 / 魔法链接

## 替代方案

如果使用第三方服务(SendGrid、Postmark、Resend),只需将 API 密钥放入 **密钥存储**,然后在后端调用其 HTTP API 即可 — 无需此块。本块面向托管云服务的变体(AWS SES、Azure Communication Services)。
    `.trim(),
  },
  compilesTo: {
    aws: [
      { name: 'SES Domain Identity', type: 'aws_ses_domain_identity' },
      { name: 'SES Configuration Set', type: 'aws_ses_configuration_set', optional: true },
    ],
    azure: [
      { name: 'Email Communication Service', type: 'azurerm_email_communication_service' },
      { name: 'Communication Service', type: 'azurerm_communication_service' },
    ],
  },
  relatedConcepts: ['Security.SecretStore'],
};

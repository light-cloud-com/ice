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

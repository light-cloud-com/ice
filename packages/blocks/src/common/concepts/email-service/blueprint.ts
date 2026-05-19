/**
 * Email Service — Concept blueprint
 *
 * No matching high-level resource yet, so this is a literal blueprint
 * rather than a factory call. Add an 'email-service' resource to
 * HIGH_LEVEL_CATEGORIES later to fold this into the factory pattern.
 */

import type { ConceptBlueprint } from '../_shared/types';

export const emailServiceConceptBlueprint: ConceptBlueprint = {
  iceType: 'Messaging.Email',
  resourceId: 'email-service',
  name: 'Email Service',
  description:
    'Transactional email. Send invoices, confirmations, password resets. SES / Azure Communication / third-party.',
  icon: 'Mail',
  category: 'messaging',
  providers: ['aws', 'gcp', 'azure'],
  nodeData: {
    iceType: 'Messaging.Email',
    behavior: 'singleton',
    label: 'Email',
    fromAddress: 'noreply@example.com',
    fromName: '',
    replyTo: '',
  },
  conceptId: 'email-service',
  visualFamily: 'messaging',
};

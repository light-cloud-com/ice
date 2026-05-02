import { createBlueprintFromResource } from '@ice/core/resources';
import type { ConceptBlueprint } from '../_shared/types';

export const authConceptBlueprint: ConceptBlueprint = {
  ...createBlueprintFromResource('auth', {
    iceType: 'Security.Identity',
    category: 'security',
    name: 'Auth',
    description: 'User authentication and identity. Managed sign-in, sessions, MFA — Cognito, Firebase Auth, Entra ID.',
    icon: 'UserCheck',
    providers: ['aws', 'gcp', 'azure'],
    nodeDataDefaults: { label: 'Auth', methods: ['email'], mfa: 'optional' },
  }),
  conceptId: 'auth',
  visualFamily: 'edge',
};

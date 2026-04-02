import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const awsAuthBlueprint: BlockBlueprint = createBlueprintFromResource('service-account', {
  iceType: 'Security.Identity',
  category: 'security',
  name: 'AWS Auth',
  description: 'AWS Cognito. Login, signup, permissions.',
  icon: 'User',
  providers: ['aws'],
  nodeDataDefaults: {
  },
});

import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const awsAuthBlueprint: BlockBlueprint = createBlueprintFromResource('service-account', {
  blockType: 'aws-auth',
  category: 'security',
  name: 'AWS Auth',
  description: 'AWS Cognito. Login, signup, permissions.',
  icon: 'User',
  providers: ['aws'],
  nodeDataDefaults: {
    iceType: 'Security.Identity',
  },
});

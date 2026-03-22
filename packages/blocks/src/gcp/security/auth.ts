import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpAuthBlueprint: BlockBlueprint = createBlueprintFromResource('service-account', {
  blockType: 'gcp-auth',
  category: 'security',
  name: 'GCP Auth',
  description: 'Google Cloud Identity Platform. Login, signup, permissions.',
  icon: 'User',
  providers: ['gcp'],
  nodeDataDefaults: {
    iceType: 'Security.Identity',
  },
});

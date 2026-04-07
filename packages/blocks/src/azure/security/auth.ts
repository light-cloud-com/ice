import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const azureAuthBlueprint: BlockBlueprint = createBlueprintFromResource('service-account', {
  iceType: 'Security.Identity',
  category: 'security',
  name: 'Azure Auth',
  description: 'Azure Entra ID. Login, signup, permissions.',
  icon: 'User',
  providers: ['azure'],
  nodeDataDefaults: {},
});

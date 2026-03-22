import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const azureAuthBlueprint: BlockBlueprint = createBlueprintFromResource('service-account', {
  blockType: 'azure-auth',
  category: 'security',
  name: 'Azure Auth',
  description: 'Azure Entra ID. Login, signup, permissions.',
  icon: 'User',
  providers: ['azure'],
  nodeDataDefaults: {
    iceType: 'Security.Identity',
  },
});

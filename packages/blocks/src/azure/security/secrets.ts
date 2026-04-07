import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const azureSecretsBlueprint: BlockBlueprint = createBlueprintFromResource('secret-store', {
  iceType: 'Security.Secret',
  category: 'security',
  name: 'Azure Secrets',
  description: 'Azure Key Vault. API keys, DB passwords, tokens.',
  icon: 'Key',
  providers: ['azure'],
  nodeDataDefaults: {},
});

import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const awsSecretsBlueprint: BlockBlueprint = createBlueprintFromResource('secret-store', {
  iceType: 'Security.Secret',
  category: 'security',
  name: 'AWS Secrets',
  description: 'AWS Secrets Manager. API keys, DB passwords, tokens.',
  icon: 'Key',
  providers: ['aws'],
  nodeDataDefaults: {},
});

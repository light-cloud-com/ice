import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const awsSecretsBlueprint: BlockBlueprint = createBlueprintFromResource('secret-store', {
  blockType: 'aws-secrets',
  category: 'security',
  name: 'AWS Secrets',
  description: 'AWS Secrets Manager. API keys, DB passwords, tokens.',
  icon: 'Key',
  providers: ['aws'],
  nodeDataDefaults: {
    iceType: 'Security.Secret',
  },
});

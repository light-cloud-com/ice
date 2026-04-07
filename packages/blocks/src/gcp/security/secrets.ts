import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpSecretsBlueprint: BlockBlueprint = createBlueprintFromResource('secret-store', {
  iceType: 'Security.Secret',
  category: 'security',
  name: 'GCP Secrets',
  description: 'Google Secret Manager. API keys, DB passwords, tokens.',
  icon: 'Key',
  providers: ['gcp'],
  nodeDataDefaults: {},
});

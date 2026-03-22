import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpSecretsBlueprint: BlockBlueprint = createBlueprintFromResource('secret-store', {
  blockType: 'gcp-secrets',
  category: 'security',
  name: 'GCP Secrets',
  description: 'Google Secret Manager. API keys, DB passwords, tokens.',
  icon: 'Key',
  providers: ['gcp'],
  nodeDataDefaults: {
    iceType: 'Security.Secret',
  },
});

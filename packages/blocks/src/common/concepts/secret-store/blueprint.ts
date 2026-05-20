import { createBlueprintFromResource } from '@ice/core/resources';
import type { ConceptBlueprint } from '../_shared/types';

export const secretStoreConceptBlueprint: ConceptBlueprint = {
  ...createBlueprintFromResource('secret-store', {
    iceType: 'Security.Secret',
    category: 'security',
    name: 'Secret Store',
    description: 'Managed storage for API keys, tokens, passwords. Injected into your services at runtime.',
    icon: 'Lock',
    providers: ['aws', 'gcp', 'azure'],
    nodeDataDefaults: { label: 'Secrets' },
  }),
  conceptId: 'secret-store',
  visualFamily: 'edge',
};

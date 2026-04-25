import { createBlueprintFromResource } from '@ice/core/resources';
import type { ConceptBlueprint } from '../_shared/types';

export const llmGatewayConceptBlueprint: ConceptBlueprint = {
  ...createBlueprintFromResource('llm-gateway', {
    iceType: 'AI.LLMGateway',
    category: 'ai',
    name: 'LLM Gateway',
    description:
      'Managed LLM access. GPT-4, Claude, Gemini, Llama — route through a gateway with auth, quotas, logging.',
    icon: 'Brain',
    providers: ['aws', 'gcp', 'azure'],
    nodeDataDefaults: { label: 'LLM', model: 'gpt-4o-mini' },
  }),
  conceptId: 'llm-gateway',
  visualFamily: 'ai',
};

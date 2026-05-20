import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const azureLlmGatewayBlueprint: BlockBlueprint = createBlueprintFromResource('llm-gateway', {
  iceType: 'AI.LLMGateway',
  category: 'ai',
  name: 'Azure LLM Gateway',
  description: 'Azure OpenAI. LLM API proxy, rate limiting + fallback.',
  icon: 'BrainCircuit',
  providers: ['azure'],
  nodeDataDefaults: {
    runtime: 'Azure OpenAI',
    port: 4000,
  },
});

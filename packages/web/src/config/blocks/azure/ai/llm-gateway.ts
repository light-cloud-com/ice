import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const azureLlmGatewayBlueprint: BlockBlueprint = createBlueprintFromResource('llm-gateway', {
  blockType: 'azure-llm-gateway',
  category: 'ai',
  name: 'Azure LLM Gateway',
  description: 'Azure OpenAI. LLM API proxy, rate limiting + fallback.',
  icon: 'BrainCircuit',
  providers: ['azure'],
  nodeDataDefaults: {
    iceType: 'AI.LLMGateway',
    runtime: 'Azure OpenAI',
    port: 4000,
  },
});

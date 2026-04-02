import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const kubernetesLlmGatewayBlueprint: BlockBlueprint = createBlueprintFromResource('llm-gateway', {
  iceType: 'AI.LLMGateway',
  category: 'ai',
  name: 'Kubernetes LLM Gateway',
  description: 'Kubernetes LiteLLM. LLM API proxy, rate limiting + fallback.',
  icon: 'BrainCircuit',
  providers: ['kubernetes'],
  nodeDataDefaults: {
    runtime: 'LiteLLM',
    port: 4000,
  },
});

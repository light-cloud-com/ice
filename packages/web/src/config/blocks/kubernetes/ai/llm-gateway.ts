import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const kubernetesLlmGatewayBlueprint: BlockBlueprint = createBlueprintFromResource(
  'llm-gateway',
  {
    blockType: 'kubernetes-llm-gateway',
    category: 'ai',
    name: 'Kubernetes LLM Gateway',
    description: 'Kubernetes LiteLLM. LLM API proxy, rate limiting + fallback.',
    icon: 'BrainCircuit',
    providers: ['kubernetes'],
    nodeDataDefaults: {
      iceType: 'AI.LLMGateway',
      runtime: 'LiteLLM',
      port: 4000,
    },
  }
);

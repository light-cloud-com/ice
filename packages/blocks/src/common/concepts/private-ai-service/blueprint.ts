/**
 * Private AI Service — Concept blueprint
 *
 * Composed preset: a self-hosted LLM running on GPU-backed compute with a
 * Vector DB alongside. No matching high-level resource yet — literal
 * blueprint. Expand_to lives in cloud-blocks.ts (future work).
 */

import type { ConceptBlueprint } from '../_shared/types';

export const privateAiServiceConceptBlueprint: ConceptBlueprint = {
  iceType: 'AI.PrivateAIService',
  resourceId: 'private-ai-service',
  name: 'Private AI Service',
  description:
    'Self-hosted LLM on your own infrastructure. GPU compute + vector DB + model server. Data stays in your cloud.',
  icon: 'Brain',
  category: 'ai',
  providers: ['aws', 'gcp', 'azure', 'alibaba', 'oci', 'ibm'],
  nodeData: {
    iceType: 'AI.PrivateAIService',
    behavior: 'singleton',
    label: 'Private AI',
    model: 'llama-3-8b',
    gpuType: 'nvidia-l4',
    replicas: 1,
  },
  conceptId: 'private-ai-service',
  visualFamily: 'ai',
};

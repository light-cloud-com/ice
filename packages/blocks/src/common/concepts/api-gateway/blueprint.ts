import { createBlueprintFromResource } from '@ice/core/resources';
import type { ConceptBlueprint } from '../_shared/types';

export const apiGatewayConceptBlueprint: ConceptBlueprint = {
  ...createBlueprintFromResource('api-gateway', {
    iceType: 'Network.Gateway',
    category: 'networking',
    name: 'API Gateway',
    description:
      'REST/GraphQL gateway. Route, throttle, authenticate, version your APIs. Sits in front of your backends.',
    icon: 'Router',
    providers: ['aws', 'gcp', 'azure'],
    nodeDataDefaults: { label: 'API Gateway', protocol: 'REST' },
  }),
  conceptId: 'api-gateway',
  visualFamily: 'edge',
};

/**
 * Scalable Backend — Concept blueprint
 *
 * HTTP service, auto-scales, load balancer built in.
 * Compiles to Cloud Run / ECS / Container Apps + LB.
 */

import { createBlueprintFromResource } from '@ice/core/resources';
import type { ConceptBlueprint } from '../_shared/types';

export const scalableBackendConceptBlueprint: ConceptBlueprint = {
  ...createBlueprintFromResource('container-service', {
    iceType: 'Compute.Container',
    category: 'backend',
    name: 'Scalable Backend',
    description: 'HTTP service running in a container. Auto-scales, load balancer built in. REST, GraphQL, gRPC.',
    icon: 'Server',
    providers: ['aws', 'gcp', 'azure', 'kubernetes', 'alibaba', 'oci', 'digitalocean', 'ibm'],
    nodeDataDefaults: {
      label: 'Backend',
      runtime: 'node20',
      port: 8080,
      size: '0.5-1024',
      minInstances: 1,
      maxInstances: 10,
      scalingMetric: 'cpu',
      scalingThreshold: 70,
    },
  }),
  conceptId: 'scalable-backend',
  visualFamily: 'compute',
};

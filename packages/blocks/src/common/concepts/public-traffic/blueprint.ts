/**
 * Public Traffic — Concept blueprint
 *
 * A canvas-only symbolic node representing "the internet / outside users".
 * The classic "cloud labeled Users" icon in architecture diagrams.
 *
 * NOT a live traffic viewer. It's an upstream SOURCE node on the diagram,
 * used to make "traffic comes from here" explicit when drawing the public
 * ingress path.
 *
 * Pre-existing iceType (referenced in service-names.ts and context-lines.ts)
 * with no blueprint — this is the first concrete blueprint for it.
 */

import type { ConceptBlueprint } from '../_shared/types';

export const publicTrafficConceptBlueprint: ConceptBlueprint = {
  iceType: 'Network.PublicTraffic',
  resourceId: 'public-traffic',
  name: 'Public Traffic',
  description: 'The internet / outside users. A symbolic source node on the diagram — no infrastructure.',
  icon: 'Globe',
  category: 'networking',
  providers: ['aws', 'gcp', 'azure', 'kubernetes', 'alibaba', 'oci', 'digitalocean', 'ibm'],
  nodeData: {
    iceType: 'Network.PublicTraffic',
    behavior: 'source',
    label: 'Internet',
  },
  conceptId: 'public-traffic',
  visualFamily: 'canvas-only',
  canvasOnly: true,
};

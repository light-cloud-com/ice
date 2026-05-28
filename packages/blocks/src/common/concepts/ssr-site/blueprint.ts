/**
 * SSR Site — Concept blueprint
 *
 * Server-rendered frontend. Compiles to Cloud Run / ECS / Container Apps.
 * For Next.js, Nuxt, SvelteKit, Remix, Astro (SSR mode).
 */

import { createBlueprintFromResource } from '@ice/core/resources';
import type { ConceptBlueprint } from '../_shared/types';

export const ssrSiteConceptBlueprint: ConceptBlueprint = {
  ...createBlueprintFromResource('ssr-site', {
    iceType: 'Compute.SSRSite',
    category: 'frontend',
    name: 'SSR Site',
    description: 'Server-rendered site (Next.js, Nuxt, SvelteKit, Remix). Runs in a container, auto-scales.',
    icon: 'Layout',
    providers: ['aws', 'gcp', 'azure', 'kubernetes', 'alibaba', 'oci', 'digitalocean'],
    nodeDataDefaults: {
      label: 'SSR Site',
      framework: 'nextjs',
      runtime: 'node20',
      port: 3000,
      minInstances: 0,
      maxInstances: 10,
    },
  }),
  conceptId: 'ssr-site',
  visualFamily: 'frontend',
};

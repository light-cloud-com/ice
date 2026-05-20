/**
 * Static Site — Concept blueprint
 *
 * Provider-agnostic frontend hosting. Compiles to:
 *   AWS     → S3 + CloudFront
 *   GCP     → Firebase Hosting
 *   Azure   → Static Web Apps
 *
 * Users drag one block, pick a provider, get a fully wired static site.
 * Replaces the three per-provider Static Site blueprints in the palette.
 */

import { createBlueprintFromResource } from '@ice/core/resources';
import type { ConceptBlueprint } from '../_shared/types';

export const staticSiteConceptBlueprint: ConceptBlueprint = {
  ...createBlueprintFromResource('frontend-app', {
    iceType: 'Compute.StaticSite',
    category: 'frontend',
    name: 'Static Site',
    description:
      'Frontend hosting with HTTPS, global CDN, and custom domain. React, Vue, Next.js, Astro — any static build.',
    icon: 'Globe',
    // Explicitly list providers so the concept is multi-cloud.
    providers: ['aws', 'gcp', 'azure'],
    nodeDataDefaults: {
      label: 'Static Site',
      domain: '',
      framework: 'react',
      buildCommand: 'npm run build',
      outputDir: 'dist',
    },
    providerVariants: [
      {
        provider: 'aws',
        dataOverrides: {
          providerDisplayName: 'S3 + CloudFront',
        },
      },
      {
        provider: 'gcp',
        dataOverrides: {
          providerDisplayName: 'Firebase Hosting',
        },
      },
      {
        provider: 'azure',
        dataOverrides: {
          providerDisplayName: 'Azure Static Web Apps',
        },
      },
    ],
  }),
  conceptId: 'static-site',
  visualFamily: 'frontend',
};

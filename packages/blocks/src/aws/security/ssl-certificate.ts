import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const awsSslCertificateBlueprint: BlockBlueprint = createBlueprintFromResource('ssl-certificate', {
  iceType: 'Security.Certificate',
  category: 'security',
  name: 'AWS Certificate',
  description: 'ACM Certificate. Free SSL/TLS for your domains.',
  icon: 'Lock',
  providers: ['aws'],
  nodeDataDefaults: {},
});

import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpSslCertificateBlueprint: BlockBlueprint = createBlueprintFromResource('ssl-certificate', {
  iceType: 'Security.Certificate',
  category: 'security',
  name: 'GCP SSL Certificate',
  description: 'Google-managed SSL certificate. Auto-provisioned HTTPS.',
  icon: 'Lock',
  providers: ['gcp'],
  nodeDataDefaults: {},
});

import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const azureSslCertificateBlueprint: BlockBlueprint = createBlueprintFromResource('ssl-certificate', {
  iceType: 'Security.Certificate',
  category: 'security',
  name: 'Azure Certificate',
  description: 'Key Vault Certificate. Managed SSL/TLS for your domains.',
  icon: 'Lock',
  providers: ['azure'],
  nodeDataDefaults: {},
});

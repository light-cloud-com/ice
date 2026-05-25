import type { PortSchema } from '../types';

/**
 * Security.Secret — provides secret references (API keys, passwords,
 * certs). Wiring to a service runs the existing `Service → Secret`
 * propagation, which writes `secretRefs` onto the service.
 */
export const securitySecretSchema: PortSchema = {
  iceType: 'Security.Secret',
  base: [
    {
      id: 'secret-out',
      direction: 'out',
      role: 'secret',
      label: 'Secret',
      side: 'right',
      shape: 'ring',
      peerStyle: 'Security',
    },
  ],
};

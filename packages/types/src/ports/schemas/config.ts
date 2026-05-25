import type { PortSchema } from '../types';

/**
 * Config.Environment — provides a bundle of env vars to services. Wiring
 * it to a service injects the variables via the existing
 * `Service → EnvConfig` propagation rule.
 */
export const configEnvironmentSchema: PortSchema = {
  iceType: 'Config.Environment',
  base: [
    {
      id: 'env-out',
      direction: 'out',
      role: 'env',
      label: 'Environment variables',
      side: 'right',
      shape: 'ring',
      peerStyle: 'Config',
    },
  ],
};

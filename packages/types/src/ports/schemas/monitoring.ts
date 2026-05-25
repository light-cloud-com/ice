import type { PortSchema } from '../types';

/**
 * Monitoring.Log — receives logs/metrics streams from services.
 */
export const monitoringLogSchema: PortSchema = {
  iceType: 'Monitoring.Log',
  base: [
    {
      id: 'logs-in',
      direction: 'in',
      role: 'monitoring',
      label: 'Logs',
      side: 'left',
      shape: 'circle',
      peerStyle: 'Monitoring',
    },
  ],
};

import type { PortSchema } from '../types';

/**
 * Util.Reroute — pass-through dot. Two `any`-role ports so wires of
 * any category can flow through. Rendering is bespoke (see
 * reroute-node/index.tsx) but the port schema here keeps the drag
 * validation honest.
 */
export const utilRerouteSchema: PortSchema = {
  iceType: 'Util.Reroute',
  base: [
    {
      id: 'in',
      direction: 'in',
      role: 'any',
      label: 'Input',
      side: 'left',
      shape: 'circle',
    },
    {
      id: 'out',
      direction: 'out',
      role: 'any',
      label: 'Output',
      side: 'right',
      shape: 'circle',
    },
  ],
};

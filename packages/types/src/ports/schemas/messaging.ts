import type { PortSchema } from '../types';

/**
 * Messaging.Queue — exposes both `queue-in` (publishers connect here)
 * and `queue-out` (subscribers connect here). The direction of the
 * port disambiguates publish vs subscribe; the matching backend ports
 * are mirrored.
 */
export const messagingQueueSchema: PortSchema = {
  iceType: 'Messaging.Queue',
  base: [
    {
      id: 'queue-in',
      direction: 'in',
      role: 'queue',
      label: 'Publishers',
      side: 'left',
      shape: 'circle',
      peerStyle: 'Messaging',
      // Publishers are Services; never another Queue.
      peerKind: 'service',
    },
    {
      id: 'queue-out',
      direction: 'out',
      role: 'queue',
      label: 'Subscribers',
      side: 'right',
      shape: 'circle',
      peerStyle: 'Messaging',
      // Subscribers are Services; never another Queue.
      peerKind: 'service',
    },
  ],
};

export const messagingEventStreamSchema: PortSchema = {
  iceType: 'Messaging.EventStream',
  base: [
    {
      id: 'queue-in',
      direction: 'in',
      role: 'queue',
      label: 'Producers',
      side: 'left',
      shape: 'circle',
      peerStyle: 'Messaging',
      peerKind: 'service',
    },
    {
      id: 'queue-out',
      direction: 'out',
      role: 'queue',
      label: 'Consumers',
      side: 'right',
      shape: 'circle',
      peerStyle: 'Messaging',
      peerKind: 'service',
    },
  ],
};

export const messagingEmailSchema: PortSchema = {
  iceType: 'Messaging.Email',
  base: [
    {
      id: 'queue-in',
      direction: 'in',
      role: 'queue',
      label: 'Email senders',
      side: 'left',
      shape: 'circle',
      peerStyle: 'Messaging',
      peerKind: 'service',
    },
  ],
};
